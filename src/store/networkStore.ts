import { create } from 'zustand';
import { getGame } from '@/engine/registry';
import { randomSeed } from '@/engine/rng';
import type { GameId, Seat, SeatIndex } from '@/engine/types';
import {
  generateRoomCode,
  getDisplayName,
  normalizeRoomCode,
  setDisplayName as persistDisplayName,
} from '@/net/identity';
import { setRoomInUrl } from '@/net/roomLink';
import type {
  GuestConnection,
  GuestEvents,
  HostConnection,
  HostEvents,
  RoomTransport,
} from '@/net/transport';
import type {
  ChatMessage,
  ConnectionState,
  InboxMessage,
  LobbyState,
  LocalRole,
  Presence,
  RoomMeta,
  ViewRecord,
} from '@/net/types';
import { useGameStore } from './gameStore';
import {
  applySeatRequest,
  buildViews,
  initialSeats,
  seatOf,
  stampChangedViews,
  vetInboundAction,
  type LedgerEntry,
} from './hostLogic';

// ============================================================================
// networkStore — online play over Firebase Realtime Database
// ============================================================================
//
// Host-authoritative. The host's device owns the lobby and the only copy of
// the private game state:
//   - guests write seat requests and actions to the room inbox; the database
//     stamps each with the sender's uid; the host vets them (`hostLogic.ts`)
//     and applies actions through `gameStore.hostApply`;
//   - after every applied action (human or AI) the host writes each
//     connected device its own redacted view to `views/{uid}`, which the
//     security rules let only that device read. Peers never receive anyone
//     else's view, and never the seed.
//   - AI seats run on the host only (gameStore's AI loop).
//
// The host also saves its private state to a host-only node so a reload
// resumes the match (`?room=CODE` in the URL rejoins on load).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = any;

export interface HostRoomInitial {
  seatCount: number;
  names: string[];
  options: Record<string, unknown>;
  aiSeats?: SeatIndex[];
}

interface NetworkStore {
  connection: ConnectionState;
  role: LocalRole;
  /** This device's uid while online. */
  uuid: string | null;
  displayName: string;
  hostUuid: string | null;
  lobby: LobbyState | null;
  chat: ChatMessage[];
  /** uid → number of live connections. */
  onlinePeers: Record<string, number>;
  roomCode: string | null;
  /** Last user-facing problem (room not found, server unreachable, …). */
  error: string | null;
  /** This device's link to the server. */
  linkUp: boolean;
  /** Guest: a match is running but this device stepped out to the lobby. */
  matchHidden: boolean;

  hostRoom: (gameId: GameId, initial?: HostRoomInitial) => Promise<void>;
  joinRoom: (roomCode: string) => Promise<void>;
  leaveRoom: () => void;

  // Host-only lobby mutators.
  setLobbyGameId: (gameId: GameId) => void;
  setLobbySeats: (seats: Seat[]) => void;
  setLobbyOptions: (options: Record<string, unknown>) => void;
  startGame: () => void;
  /** Host: end the running match for everyone (back to the lobby). */
  endMatch: () => void;

  // Guest-only.
  requestSeat: (desiredSeat: number | 'leave') => void;
  /** Guest: return to the running match after stepping out. */
  resumeMatch: () => void;
  setLocalName: (name: string) => void;

  sendChat: (text: string) => void;
  clearError: () => void;
  reset: () => void;
}

// ----------------------------------------------------------------------------
// Module state (connections aren't serialisable, so they stay out of Zustand)
// ----------------------------------------------------------------------------

let transportOverride: RoomTransport | null = null;
/** Tests: run against `fakeTransport` instead of Firebase. */
export function setTransportForTests(t: RoomTransport | null): void {
  transportOverride = t;
}

async function transport(): Promise<RoomTransport> {
  if (transportOverride) return transportOverride;
  // Lazy: the Firebase SDK only downloads when someone goes online.
  const mod = await import('@/net/firebaseRoom');
  return mod.getTransport();
}

let hostConn: HostConnection | null = null;
let guestConn: GuestConnection | null = null;
// Bumped on every create / join / leave so late async results from an
// abandoned attempt are ignored.
let generation = 0;
// Host: uids currently connected, and what each device was last sent this
// match (only changed views are re-sent, each with a per-device sequence).
let presentUids: string[] = [];
let ledger = new Map<string, LedgerEntry>();
// Guest: the latest view record and which match is applied locally.
let latestView: ViewRecord | null = null;
let appliedMatch = -1;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Lobby options are world-readable in the room: never let a seed in. */
function sanitizeOptions(options: Record<string, unknown>): Record<string, unknown> {
  const out = { ...options };
  delete out.seed;
  delete out.rngCursor;
  return out;
}

function countPresence(people: Presence[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of people) out[p.uid] = (out[p.uid] ?? 0) + 1;
  return out;
}

function teardownConnections(deleteRoom: boolean) {
  generation++;
  if (hostConn) hostConn.close({ deleteRoom });
  if (guestConn) guestConn.close();
  hostConn = null;
  guestConn = null;
  presentUids = [];
  ledger = new Map();
  latestView = null;
  appliedMatch = -1;
  const gs = useGameStore.getState();
  gs.registerBroadcastHandler(null);
  gs.registerHostAppliedListener(null);
  gs.registerExitHandler(null);
}

export const useNetworkStore = create<NetworkStore>((set, get) => {
  // --------------------------------------------------------------------------
  // Host internals
  // --------------------------------------------------------------------------

  function commitLobby(next: LobbyState) {
    set({ lobby: next });
    hostConn?.setLobby(next).catch((e: Error) => console.warn('[host] lobby write failed:', e.message));
  }

  function humanSeatUids(lobby: LobbyState): string[] {
    return lobby.seats.filter((s) => s.uuid && !s.isAI).map((s) => s.uuid!);
  }

  /** Fan out per-device redacted views (+ the host's saved state). */
  function hostPublish(state: unknown, tick: number) {
    const { lobby, uuid } = get();
    const { module } = useGameStore.getState();
    if (!hostConn || !lobby?.inGame || !module || !uuid) return;
    const recipients = new Set([...presentUids, ...humanSeatUids(lobby)]);
    const views = stampChangedViews(ledger, buildViews(module, state, lobby, recipients, tick, uuid));
    const viewSeq: Record<string, number> = {};
    for (const [u, e] of ledger) viewSeq[u] = e.seq;
    hostConn
      .publish(views, { match: lobby.match, gameId: module.id, tick, state, viewSeq })
      .catch((e: Error) => console.warn('[host] publish failed:', e.message));
  }

  /** A device appeared mid-match: give it its current view. */
  function hostPublishToNewcomers() {
    const { lobby, uuid } = get();
    const { module, privateState, tick } = useGameStore.getState();
    if (!hostConn || !lobby?.inGame || !module || privateState === null || !uuid) return;
    const fresh = presentUids.filter((u) => !ledger.has(u) && u !== uuid);
    if (fresh.length === 0) return;
    const views = stampChangedViews(ledger, buildViews(module, privateState, lobby, fresh, tick, uuid));
    hostConn.publish(views).catch((e: Error) => console.warn('[host] publish failed:', e.message));
  }

  function hostHandleInbox(fromUid: string, msg: InboxMessage) {
    const lobby = get().lobby;
    if (!lobby) return;
    if (msg.kind === 'seat') {
      const next = applySeatRequest(lobby, fromUid, msg);
      if (next) commitLobby(next);
      return;
    }
    if (msg.kind === 'action') {
      const verdict = vetInboundAction(lobby, fromUid, msg.action);
      if (!verdict.ok) {
        console.warn(`[host] refused action from ${fromUid}: ${verdict.reason}`);
        return;
      }
      useGameStore.getState().hostApply(msg.action as AnyAction, fromUid);
    }
  }

  function hostEvents(gen: number): HostEvents {
    return {
      presence: (people) => {
        if (gen !== generation) return;
        presentUids = [...new Set(people.map((p) => p.uid))];
        set({ onlinePeers: countPresence(people) });
        hostPublishToNewcomers();
      },
      chat: (msg) => {
        if (gen !== generation) return;
        set((s) => (s.chat.some((m) => m.id === msg.id) ? s : { chat: [...s.chat, msg] }));
      },
      connected: (up) => {
        if (gen !== generation) return;
        set({ linkUp: up });
      },
      inbox: (fromUid, msg) => {
        if (gen !== generation) return;
        hostHandleInbox(fromUid, msg);
      },
    };
  }

  function installHostHooks() {
    const gs = useGameStore.getState();
    gs.registerBroadcastHandler(null);
    gs.registerHostAppliedListener((state, tick) => hostPublish(state, tick));
    gs.registerExitHandler(() => {
      if (
        typeof window !== 'undefined' &&
        typeof window.confirm === 'function' &&
        !window.confirm('End this game for everyone and return to the lobby?')
      ) {
        return;
      }
      get().endMatch();
    });
  }

  function hostStartLocal(lobby: LobbyState, state: unknown, gameId: GameId, tick: number) {
    const uuid = get().uuid;
    const hostSeat = uuid ? (seatOf(lobby, uuid)?.index ?? null) : null;
    const aiSeats = lobby.seats.filter((s) => s.isAI).map((s) => s.index);
    useGameStore.getState().startLocalGame(getGame(gameId), state, hostSeat, {
      aiSeats,
      controllableSeats: hostSeat === null ? [] : [hostSeat],
      tick,
    });
  }

  async function resumeAsHost(t: RoomTransport, code: string, meta: RoomMeta, uid: string, gen: number) {
    const displayName = getDisplayName();
    const { conn, lobby, saved } = await t.resumeHost(code, meta, { uid, name: displayName }, hostEvents(gen));
    if (gen !== generation) {
      conn.close({ deleteRoom: false });
      return;
    }
    if (!lobby) {
      conn.close({ deleteRoom: true });
      set({ connection: 'disconnected', role: 'solo', roomCode: null, error: 'That room was damaged; start a new one.' });
      setRoomInUrl(null);
      return;
    }
    hostConn = conn;
    set({
      connection: 'lobby',
      role: 'host',
      uuid: uid,
      displayName,
      hostUuid: uid,
      lobby,
      roomCode: code,
      error: null,
    });
    setRoomInUrl(code);
    installHostHooks();
    if (lobby.inGame && saved && saved.match === lobby.match) {
      // Continue each device's sequence; an empty key forces a fresh send.
      ledger = new Map(Object.entries(saved.viewSeq ?? {}).map(([u, seq]) => [u, { key: '', seq }]));
      set({ connection: 'in-game' });
      hostStartLocal(lobby, saved.state, saved.gameId, saved.tick);
    } else if (lobby.inGame) {
      // The saved state is gone: the match can't continue.
      commitLobby({ ...lobby, inGame: false });
      conn.clearMatch().catch(() => {});
    }
  }

  // --------------------------------------------------------------------------
  // Guest internals
  // --------------------------------------------------------------------------

  function applyGuestView(rec: ViewRecord) {
    const gs = useGameStore.getState();
    const env = rec.env;
    if (gs.publicView && appliedMatch === rec.match && gs.gameId === env.gameId && env.tick < gs.tick) return;
    useGameStore.setState({
      gameId: env.gameId,
      module: getGame(env.gameId),
      privateState: null,
      isHost: false,
      tick: env.tick,
      publicView: env,
      localSeat: env.seat,
      aiSeats: [],
      controllableSeats: env.seat === null ? [] : [env.seat],
    });
    appliedMatch = rec.match;
    set({ connection: 'in-game', matchHidden: false });
  }

  function guestEvents(gen: number, uid: string): GuestEvents {
    return {
      lobby: (lobby) => {
        if (gen !== generation) return;
        if (!lobby) {
          get().leaveRoom();
          set({ error: 'The host closed the room.' });
          return;
        }
        const seated = !!seatOf(lobby, uid);
        set((s) => ({
          lobby,
          role: seated ? 'guest' : lobby.inGame ? 'spectator' : 'guest',
          connection: s.connection === 'connecting' ? 'lobby' : s.connection,
        }));
      },
      view: (rec) => {
        if (gen !== generation) return;
        latestView = rec;
        if (!rec) {
          if (useGameStore.getState().publicView) useGameStore.getState().clearGame();
          appliedMatch = -1;
          set({ connection: 'lobby', matchHidden: false });
          return;
        }
        // A new match started while this device had stepped out: bring it back in.
        if (rec.match !== appliedMatch && get().matchHidden) set({ matchHidden: false });
        if (!get().matchHidden) applyGuestView(rec);
      },
      presence: (people) => {
        if (gen !== generation) return;
        set({ onlinePeers: countPresence(people) });
      },
      chat: (msg) => {
        if (gen !== generation) return;
        set((s) => (s.chat.some((m) => m.id === msg.id) ? s : { chat: [...s.chat, msg] }));
      },
      connected: (up) => {
        if (gen !== generation) return;
        set({ linkUp: up });
      },
    };
  }

  function guestSend(msg: InboxMessage) {
    if (!guestConn) return;
    guestConn.send(msg).catch((e: Error) => {
      console.warn('[guest] send failed:', e.message);
      set({ error: `Couldn't reach the host: ${e.message}` });
    });
  }

  // --------------------------------------------------------------------------
  // Store
  // --------------------------------------------------------------------------

  return {
    connection: 'disconnected',
    role: 'solo',
    uuid: null,
    displayName: getDisplayName(),
    hostUuid: null,
    lobby: null,
    chat: [],
    onlinePeers: {},
    roomCode: null,
    error: null,
    linkUp: true,
    matchHidden: false,

    hostRoom: async (gameId, initial) => {
      teardownConnections(get().role === 'host');
      useGameStore.getState().clearGame();
      const gen = generation;
      set({ connection: 'connecting', role: 'host', error: null, lobby: null, chat: [], roomCode: null });
      try {
        const t = await transport();
        const uid = await t.signIn();
        if (gen !== generation) return;
        const displayName = getDisplayName();
        const mod = getGame(gameId);
        const seatCount = initial?.seatCount ?? Math.min(mod.maxPlayers, Math.max(mod.minPlayers, 5));
        const names = initial?.names ?? Array.from({ length: seatCount }, (_, i) => `Seat ${i + 1}`);
        const lobby: LobbyState = {
          gameId,
          seats: initialSeats(uid, displayName, names.slice(0, seatCount), initial?.aiSeats ?? []),
          gameOptions: sanitizeOptions(initial?.options ?? mod.defaultConfig(seatCount).gameOptions),
          inGame: false,
          match: 0,
        };
        let conn: HostConnection | null = null;
        let code = '';
        for (let attempt = 0; attempt < 6 && !conn; attempt++) {
          code = generateRoomCode();
          conn = await t.createRoom(code, lobby, { uid, name: displayName }, hostEvents(gen));
        }
        if (gen !== generation) {
          conn?.close({ deleteRoom: true });
          return;
        }
        if (!conn) throw new Error('Could not find a free room code — try again.');
        hostConn = conn;
        set({
          connection: 'lobby',
          role: 'host',
          uuid: uid,
          displayName,
          hostUuid: uid,
          lobby,
          roomCode: code,
        });
        setRoomInUrl(code);
        installHostHooks();
      } catch (e) {
        if (gen !== generation) return;
        teardownConnections(get().role === 'host');
        set({ connection: 'disconnected', role: 'solo', error: errorMessage(e) });
      }
    },

    joinRoom: async (input) => {
      const code = normalizeRoomCode(input);
      if (!code) {
        set({ error: 'Room codes are 4–6 letters or numbers.' });
        return;
      }
      teardownConnections(get().role === 'host');
      useGameStore.getState().clearGame();
      const gen = generation;
      set({ connection: 'connecting', role: 'guest', roomCode: code, error: null, lobby: null, chat: [] });
      try {
        const t = await transport();
        const uid = await t.signIn();
        const meta = await t.lookupRoom(code);
        if (gen !== generation) return;
        if (!meta) {
          set({
            connection: 'disconnected',
            role: 'solo',
            roomCode: null,
            error: `There's no room ${code}. Check the code with your host.`,
          });
          setRoomInUrl(null);
          return;
        }
        if (meta.hostUid === uid) {
          await resumeAsHost(t, code, meta, uid, gen);
          return;
        }
        const displayName = getDisplayName();
        set({ uuid: uid, displayName, hostUuid: meta.hostUid });
        const conn = await t.joinAsGuest(code, meta, { uid, name: displayName }, guestEvents(gen, uid));
        if (gen !== generation) {
          conn.close();
          return;
        }
        guestConn = conn;
        setRoomInUrl(code);
        const gs = useGameStore.getState();
        gs.registerHostAppliedListener(null);
        gs.registerBroadcastHandler((action) => guestSend({ kind: 'action', action }));
        gs.registerExitHandler(() => {
          // Step out to the lobby; the match keeps running and the seat is kept.
          useGameStore.getState().clearGame();
          set({ connection: 'lobby', matchHidden: true });
        });
      } catch (e) {
        if (gen !== generation) return;
        teardownConnections(get().role === 'host');
        set({ connection: 'disconnected', role: 'solo', roomCode: null, error: errorMessage(e) });
      }
    },

    leaveRoom: () => {
      const wasHost = get().role === 'host';
      teardownConnections(wasHost);
      useGameStore.getState().clearGame();
      setRoomInUrl(null);
      set({
        connection: 'disconnected',
        role: 'solo',
        hostUuid: null,
        lobby: null,
        chat: [],
        onlinePeers: {},
        roomCode: null,
        matchHidden: false,
      });
    },

    // ----- Host-only lobby mutators -----
    setLobbyGameId: (gameId) => {
      const { lobby, role, uuid } = get();
      if (role !== 'host' || !lobby || lobby.inGame || !uuid) return;
      const mod = getGame(gameId);
      const n = Math.min(mod.maxPlayers, Math.max(mod.minPlayers, lobby.seats.length));
      const seats: Seat[] = Array.from({ length: n }, (_, i) => {
        const old = lobby.seats[i];
        return old ? { ...old, index: i } : { index: i, uuid: null, name: `Seat ${i + 1}`, isAI: false };
      });
      commitLobby({ ...lobby, gameId, seats, gameOptions: sanitizeOptions(mod.defaultConfig(n).gameOptions) });
    },

    setLobbySeats: (seats) => {
      const { role, lobby } = get();
      if (role !== 'host' || !lobby || lobby.inGame) return;
      const next = seats.map((s, i) => ({ ...s, index: i }));
      let gameOptions = lobby.gameOptions;
      if (next.length !== lobby.seats.length) {
        // Options picked for N players (e.g. an ONUW role pool) may not fit
        // the new count: dry-run the setup and fall back to the defaults.
        const mod = getGame(lobby.gameId);
        const players = next.map((s) => ({ name: s.name, isAI: s.isAI }));
        try {
          mod.createInitialState({ gameId: lobby.gameId, seats: next, seed: 1, gameOptions: { ...gameOptions, players } });
        } catch {
          gameOptions = sanitizeOptions(mod.defaultConfig(next.length).gameOptions);
          set({ error: `Game options reset to the defaults for ${next.length} players.` });
        }
      }
      commitLobby({ ...lobby, seats: next, gameOptions });
    },

    setLobbyOptions: (options) => {
      const { role, lobby } = get();
      if (role !== 'host' || !lobby || lobby.inGame) return;
      commitLobby({ ...lobby, gameOptions: sanitizeOptions(options) });
    },

    startGame: () => {
      const { role, lobby, uuid } = get();
      if (role !== 'host' || !lobby || !uuid || !hostConn || lobby.inGame) return;
      if (lobby.seats.some((s) => !s.uuid)) return;
      const mod = getGame(lobby.gameId);
      const gameOptions = {
        ...lobby.gameOptions,
        players: lobby.seats.map((s) => ({ name: s.name, isAI: s.isAI })),
      };
      // The seed is decided here and never leaves this device.
      const config = { gameId: lobby.gameId, seats: lobby.seats, seed: randomSeed(), gameOptions };
      let initialState: unknown;
      try {
        initialState = mod.createInitialState(config);
      } catch (e) {
        set({ error: `Couldn't start: ${errorMessage(e)}` });
        return;
      }
      const next: LobbyState = { ...lobby, inGame: true, match: lobby.match + 1 };
      ledger = new Map();
      commitLobby(next);
      set({ connection: 'in-game', error: null });
      hostStartLocal(next, initialState, lobby.gameId, 0);
    },

    endMatch: () => {
      const { lobby, role } = get();
      if (role !== 'host' || !lobby || !hostConn) return;
      useGameStore.getState().clearGame();
      ledger = new Map();
      hostConn.clearMatch().catch((e: Error) => console.warn('[host] clear failed:', e.message));
      commitLobby({ ...lobby, inGame: false });
      set({ connection: 'lobby' });
    },

    // ----- Guest -----
    requestSeat: (desiredSeat) => {
      guestSend({ kind: 'seat', desiredSeat, displayName: get().displayName });
    },

    resumeMatch: () => {
      if (get().role === 'host' || !latestView) return;
      set({ matchHidden: false });
      applyGuestView(latestView);
    },

    setLocalName: (name) => {
      const clean = name.slice(0, 20);
      persistDisplayName(clean);
      set({ displayName: clean });
      const st = get();
      if (!st.lobby || !st.uuid) return;
      const trimmed = clean.trim();
      if (!trimmed) return;
      if (st.role === 'host') {
        if (st.lobby.inGame) return;
        commitLobby({
          ...st.lobby,
          seats: st.lobby.seats.map((s) => (s.uuid === st.uuid ? { ...s, name: trimmed } : s)),
        });
      } else {
        const seat = seatOf(st.lobby, st.uuid);
        if (seat) guestSend({ kind: 'seat', desiredSeat: seat.index, displayName: trimmed });
      }
    },

    // ----- Chat -----
    sendChat: (text) => {
      const st = get();
      const clean = text.trim().slice(0, 500);
      const conn = hostConn ?? guestConn;
      if (!clean || !conn) return;
      // Our own line arrives back through the chat listener like everyone's.
      conn.sendChat(st.displayName.trim() || 'Player', clean).catch((e: Error) => {
        set({ error: `Message not sent: ${e.message}` });
      });
    },

    clearError: () => set({ error: null }),

    reset: () => {
      teardownConnections(get().role === 'host');
      useGameStore.getState().clearGame();
      set({
        connection: 'disconnected',
        role: 'solo',
        uuid: null,
        hostUuid: null,
        lobby: null,
        chat: [],
        onlinePeers: {},
        roomCode: null,
        error: null,
        matchHidden: false,
      });
    },
  };
});
