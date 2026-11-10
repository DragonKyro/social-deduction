// The real RoomTransport: Firebase Realtime Database (project
// github-games-e7c7d, shared with other web apps). Loaded lazily (dynamic
// import from networkStore) so the Firebase SDK only downloads when someone
// goes online.
//
// The database is shared, so everything this app stores lives under one
// top-level key, DB_ROOT ("social-deduction"), and database.rules.json only
// covers that key (scripts/merge-db-rules.mjs merges it into the live rules
// on deploy). Paths below are relative to it.
//
// Each device signs in anonymously and silently; the uid is the player's
// identity, and the rules use it to make each player's view readable by that
// player alone. A room lives at rooms/{CODE}:
//
//   meta      { hostUid, createdAt, build, v }  everyone in the room reads; written once
//   lobby     JSON LobbyState                   everyone reads; host writes
//   views/    {uid} → JSON ViewRecord           ONLY {uid} reads; host writes
//   host      JSON SavedHostState               ONLY the host reads/writes
//   inbox/    pushId → { uid, p: JSON }         anyone writes as themselves; ONLY host reads (and deletes)
//   chat/     pushId → { uid, name, text, at }  everyone reads; write as yourself
//   presence/ pushId → { uid, name }            removed by onDisconnect
//
// plus a per-day index for clean-up (same scheme as the other apps):
//
//   roomDays/{day}          → when that (UTC) day ends     anyone can read: no codes
//   roomIndex/{day}/{CODE}  → true                         readable only a week after the day ends
//
// Note the room itself has no blanket `.read` rule: that would cascade to
// views/ and hand every player everyone's secrets.
//
// Payloads are JSON strings: the database drops empty arrays / objects and
// turns arrays into keyed objects, which would corrupt game data.

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  inMemoryPersistence,
  signInAnonymously,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import {
  get,
  getDatabase,
  goOffline,
  goOnline,
  limitToFirst,
  limitToLast,
  onChildAdded,
  onDisconnect,
  onValue,
  orderByValue,
  push,
  query,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
  type Database,
  type DatabaseReference,
  type DataSnapshot,
  type Unsubscribe,
} from 'firebase/database';
import { freshTabMode } from './identity';
import {
  DAY_MS,
  ROOM_LIFETIME_MS,
  ServerUnreachableError,
  parseJson,
  type ConnectionBase,
  type GuestConnection,
  type GuestEvents,
  type HostConnection,
  type HostEvents,
  type RoomTransport,
} from './transport';
import type {
  ChatMessage,
  InboxMessage,
  LobbyState,
  Presence,
  RoomMeta,
  SavedHostState,
  ViewRecord,
} from './types';

// Public by design: a web app's Firebase config identifies the project, it
// grants nothing. Access is decided by the security rules. (The "Social
// Deduction" web app registered in the project; only RTDB + Auth are used.)
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAmAirzwcz926PyKh-bfUUIn7OSkcve6tI',
  authDomain: 'github-games-e7c7d.firebaseapp.com',
  databaseURL: 'https://github-games-e7c7d-default-rtdb.firebaseio.com',
  projectId: 'github-games-e7c7d',
  appId: '1:879254296864:web:81f2d4d06e58c5478f1f45',
};

/** This app's top-level key in the shared database (must match database.rules.json). */
export const DB_ROOT = 'social-deduction';

/** Bump when the room layout changes (also checked by the rules). */
export const PROTOCOL_VERSION = 1;

const BUILD = 'web-1';

/** How long to wait for sign-in or the first read before calling the server unreachable. */
const SERVER_TIMEOUT_MS = 15000;

/** Oldest days looked at per sweep. */
const SWEEP_DAYS = 5;

/** Chat lines loaded on join. */
const CHAT_HISTORY = 100;

function serverTimeOffset(db: Database): Promise<number> {
  return new Promise((resolve) => {
    onValue(ref(db, '.info/serverTimeOffset'), (s) => resolve(Number(s.val()) || 0), { onlyOnce: true });
  });
}

function dayBucket(serverNow: number): { day: string; endsAt: number } {
  const day = Math.floor(serverNow / DAY_MS);
  return { day: String(day), endsAt: (day + 1) * DAY_MS };
}

/**
 * Delete the rooms of every day (among the SWEEP_DAYS oldest) that ended over
 * a week ago, then the emptied days. A room the rules keep (someone is still
 * connected) keeps its day too, for a later sweep.
 */
export async function sweepStaleRooms(db: Database): Promise<string[]> {
  const cutoff = Date.now() + (await serverTimeOffset(db)) - ROOM_LIFETIME_MS - 60_000;
  const days = await get(query(ref(db, `${DB_ROOT}/roomDays`), orderByValue(), limitToFirst(SWEEP_DAYS)));
  const stale: string[] = [];
  days.forEach((d) => {
    if (d.key && Number(d.val()) <= cutoff) stale.push(d.key);
  });
  const removed: string[] = [];
  for (const day of stale) {
    const codes: string[] = [];
    (await get(ref(db, `${DB_ROOT}/roomIndex/${day}`))).forEach((c) => {
      if (c.key) codes.push(c.key);
    });
    let kept = 0;
    await Promise.all(
      codes.map((code) =>
        update(ref(db, DB_ROOT), { [`rooms/${code}`]: null, [`roomIndex/${day}/${code}`]: null }).then(
          () => removed.push(code),
          () => kept++,
        ),
      ),
    );
    if (kept === 0) await remove(ref(db, `${DB_ROOT}/roomDays/${day}`)).catch(() => {});
  }
  return removed;
}

export interface FirebaseTransportOptions {
  /** A separate Firebase app (scripts run several "devices" in one process). */
  appName?: string;
  /** Where the anonymous sign-in is kept. Default: per tab with ?fresh, else per browser. */
  persistence?: 'local' | 'session' | 'memory';
}

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new ServerUnreachableError(`Timed out ${what}.`)), SERVER_TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function errorText(e: unknown): string {
  const err = e as { code?: string; message?: string };
  return `${err.code ?? ''} ${err.message ?? String(e)}`;
}

const isPermissionDenied = (e: unknown) => /permission.denied/i.test(errorText(e));

function unreachable(e: unknown): Error {
  if (e instanceof ServerUnreachableError) return e;
  return new ServerUnreachableError(`Could not reach the game server (${errorText(e).trim()}).`);
}

function persistenceFor(kind: FirebaseTransportOptions['persistence']): Persistence | Persistence[] {
  const resolved = kind ?? (typeof window === 'undefined' ? 'memory' : freshTabMode() ? 'session' : 'local');
  if (resolved === 'memory') return inMemoryPersistence;
  if (resolved === 'session') return browserSessionPersistence;
  return [indexedDBLocalPersistence, browserLocalPersistence];
}

function parseMeta(v: unknown): RoomMeta | null {
  const m = v as Partial<RoomMeta> | null;
  if (!m || typeof m.hostUid !== 'string') return null;
  return {
    hostUid: m.hostUid,
    createdAt: typeof m.createdAt === 'number' ? m.createdAt : 0,
    build: typeof m.build === 'string' ? m.build : 'unknown',
  };
}

export function createFirebaseTransport(opts: FirebaseTransportOptions = {}): RoomTransport & {
  /** The underlying database (scripts / sweeps). */
  database: () => Database;
} {
  const name = opts.appName ?? '[DEFAULT]';
  let client: { app: FirebaseApp; auth: Auth; db: Database } | null = null;
  let signInPromise: Promise<string> | null = null;
  // Rooms open on this transport; the database connection is up only while > 0.
  let openRooms = 0;
  let online = true;

  function firebase() {
    if (client) return client;
    const app = getApps().find((a) => a.name === name) ?? initializeApp(FIREBASE_CONFIG, name);
    let auth: Auth;
    try {
      auth = initializeAuth(app, { persistence: persistenceFor(opts.persistence) });
    } catch {
      auth = getAuth(app); // already initialised (hot reload)
    }
    client = { app, auth, db: getDatabase(app) };
    return client;
  }

  function connect(): Database {
    const { db } = firebase();
    if (!online) {
      goOnline(db);
      online = true;
    }
    return db;
  }

  function disconnectIfIdle(): void {
    if (openRooms > 0 || !online || !client) return;
    goOffline(client.db);
    online = false;
  }

  function signIn(): Promise<string> {
    signInPromise ??= withTimeout(
      (async () => {
        const { auth } = firebase();
        await auth.authStateReady();
        const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
        return user.uid;
      })(),
      'signing in',
    ).catch((e: unknown) => {
      signInPromise = null;
      throw unreachable(e);
    });
    return signInPromise;
  }

  // Listeners + presence shared by host and guest connections.
  function openCommon(
    code: string,
    meta: RoomMeta,
    myUid: string,
    me: Presence,
    events: { presence: (p: Presence[]) => void; chat: (m: ChatMessage) => void; connected: (up: boolean) => void },
  ) {
    const db = connect();
    openRooms++;
    const base = `${DB_ROOT}/rooms/${code}`;
    const offs: Unsubscribe[] = [];
    let presenceRef: DatabaseReference | null = null;
    let closed = false;
    const cancelled = (what: string) => (e: Error) => console.warn(`[net] ${what} listener stopped:`, e.message);

    offs.push(
      onChildAdded(
        query(ref(db, `${base}/chat`), limitToLast(CHAT_HISTORY)),
        (s) => {
          const v = s.val() as { uid?: unknown; name?: unknown; text?: unknown; at?: unknown } | null;
          if (!v || typeof v.uid !== 'string' || typeof v.text !== 'string') return;
          events.chat({
            id: s.key ?? `${v.uid}-${String(v.at)}`,
            senderUuid: v.uid,
            senderName: typeof v.name === 'string' ? v.name : '?',
            text: v.text,
            timestamp: typeof v.at === 'number' ? v.at : Date.now(),
            kind: 'user',
          });
        },
        cancelled('chat'),
      ),
    );
    offs.push(
      onValue(
        ref(db, `${base}/presence`),
        (s) => {
          const people: Presence[] = [];
          s.forEach((c: DataSnapshot) => {
            const v = c.val() as { uid?: unknown; name?: unknown } | null;
            if (v && typeof v.uid === 'string') people.push({ uid: v.uid, name: String(v.name ?? '') });
          });
          events.presence(people);
        },
        cancelled('presence'),
      ),
    );
    // Presence: on every (re)connection add an entry the server deletes when
    // this connection drops.
    offs.push(
      onValue(ref(db, '.info/connected'), (s) => {
        const up = s.val() === true;
        if (closed) return;
        events.connected(up);
        if (!up) return;
        const p = push(ref(db, `${base}/presence`));
        presenceRef = p;
        onDisconnect(p)
          .remove()
          .then(() => {
            if (!closed && presenceRef === p) {
              return set(p, { uid: myUid, name: me.name.slice(0, 40) });
            }
          })
          .catch((e: Error) => console.warn('[net] presence failed:', e.message));
      }),
    );

    const conn: ConnectionBase = {
      code,
      uid: myUid,
      meta,
      sendChat: async (name, text) => {
        await push(ref(db, `${base}/chat`), {
          uid: myUid,
          name: name.slice(0, 40),
          text: text.slice(0, 500),
          at: serverTimestamp(),
        });
      },
    };

    const close = () => {
      if (closed) return false;
      closed = true;
      offs.forEach((off) => off());
      const p = presenceRef;
      presenceRef = null;
      openRooms--;
      if (p) {
        onDisconnect(p).cancel().catch(() => {});
        remove(p).catch(() => {});
      }
      // Give the presence removal a moment to flush before going offline.
      setTimeout(disconnectIfIdle, 500);
      return true;
    };

    return { db, base, offs, conn, close, cancelled };
  }

  function openHost(code: string, meta: RoomMeta, myUid: string, me: Presence, events: HostEvents): HostConnection {
    const c = openCommon(code, meta, myUid, me, events);
    const { db, base } = c;
    c.offs.push(
      onChildAdded(
        ref(db, `${base}/inbox`),
        (s) => {
          const v = s.val() as { uid?: unknown; p?: unknown } | null;
          // Consume it whatever it is, so the inbox never grows.
          remove(s.ref).catch(() => {});
          if (!v || typeof v.uid !== 'string') return;
          const msg = parseJson<InboxMessage>(v.p);
          if (msg && typeof msg === 'object' && 'kind' in msg) events.inbox(v.uid, msg);
        },
        c.cancelled('inbox'),
      ),
    );
    return {
      ...c.conn,
      setLobby: async (lobby) => {
        await set(ref(db, `${base}/lobby`), JSON.stringify(lobby));
      },
      publish: async (views, saved) => {
        const patch: Record<string, string | null> = {};
        for (const [uid, rec] of Object.entries(views)) patch[`views/${uid}`] = JSON.stringify(rec);
        if (saved !== undefined) patch.host = saved ? JSON.stringify(saved) : null;
        if (Object.keys(patch).length === 0) return;
        await update(ref(db, base), patch);
      },
      clearMatch: async () => {
        await update(ref(db, base), { views: null, host: null });
      },
      close: ({ deleteRoom }) => {
        if (!c.close()) return;
        if (deleteRoom) remove(ref(db, base)).catch((e: Error) => console.warn('[net] room delete failed:', e.message));
      },
    };
  }

  function openGuest(code: string, meta: RoomMeta, myUid: string, me: Presence, events: GuestEvents): GuestConnection {
    const c = openCommon(code, meta, myUid, me, events);
    const { db, base } = c;
    c.offs.push(
      onValue(
        ref(db, `${base}/lobby`),
        (s) => events.lobby(parseJson<LobbyState>(s.val())),
        c.cancelled('lobby'),
      ),
    );
    c.offs.push(
      onValue(
        ref(db, `${base}/views/${myUid}`),
        (s) => events.view(parseJson<ViewRecord>(s.val())),
        c.cancelled('view'),
      ),
    );
    return {
      ...c.conn,
      send: async (msg) => {
        await push(ref(db, `${base}/inbox`), { uid: myUid, p: JSON.stringify(msg) });
      },
      close: () => {
        c.close();
      },
    };
  }

  return {
    database: () => firebase().db,

    signIn,

    warmUp: () => {
      signIn().catch(() => {});
    },

    createRoom: async (code, lobby, me, events) => {
      const myUid = await signIn();
      const db = connect();
      const { day, endsAt } = dayBucket(Date.now() + (await serverTimeOffset(db)));
      try {
        await withTimeout(
          update(ref(db, DB_ROOT), {
            [`rooms/${code}`]: {
              meta: { hostUid: myUid, createdAt: serverTimestamp(), build: BUILD, v: PROTOCOL_VERSION },
              lobby: JSON.stringify(lobby),
            },
            [`roomIndex/${day}/${code}`]: true,
            [`roomDays/${day}`]: endsAt,
          }),
          'creating the room',
        );
      } catch (e) {
        disconnectIfIdle();
        // The rules refuse to overwrite an existing room: the code is taken.
        if (isPermissionDenied(e)) return null;
        throw unreachable(e);
      }
      const conn = openHost(code, { hostUid: myUid, createdAt: Date.now(), build: BUILD }, myUid, me, events);
      sweepStaleRooms(db).catch((e: Error) => console.warn('[net] stale-room sweep failed:', e.message));
      return conn;
    },

    lookupRoom: async (code) => {
      await signIn();
      const db = connect();
      try {
        const snap = await withTimeout(get(ref(db, `${DB_ROOT}/rooms/${code}/meta`)), 'looking up the room');
        return parseMeta(snap.val());
      } catch (e) {
        throw unreachable(e);
      } finally {
        disconnectIfIdle();
      }
    },

    resumeHost: async (code, meta, me, events) => {
      const myUid = await signIn();
      const db = connect();
      const base = `${DB_ROOT}/rooms/${code}`;
      let lobby: LobbyState | null;
      let saved: SavedHostState | null;
      try {
        const [l, h] = await withTimeout(
          Promise.all([get(ref(db, `${base}/lobby`)), get(ref(db, `${base}/host`))]),
          'reopening the room',
        );
        lobby = parseJson<LobbyState>(l.val());
        saved = parseJson<SavedHostState>(h.val());
      } catch (e) {
        disconnectIfIdle();
        throw unreachable(e);
      }
      return { conn: openHost(code, meta, myUid, me, events), lobby, saved };
    },

    joinAsGuest: async (code, meta, me, events) => {
      const myUid = await signIn();
      return openGuest(code, meta, myUid, me, events);
    },
  };
}

let defaultTransport: RoomTransport | null = null;

/** The app's transport (one Firebase app per page). */
export function getTransport(): RoomTransport {
  return (defaultTransport ??= createFirebaseTransport());
}
