// The interface between networkStore and the server. `firebaseRoom.ts` is the
// real one (Firebase Realtime Database); `fakeTransport.ts` is an in-memory
// stand-in with the same access rules, for tests. Nothing here knows about
// game rules.
//
// Hidden-info contract (enforced by database.rules.json on the real server
// and mirrored by the fake):
//   - `views/{uid}` is readable only by `uid` and writable only by the host.
//   - the inbox is writable by anyone in the room (each entry is stamped with
//     the writer's verified uid) and readable only by the host.
//   - the host's saved private state is readable/writable only by the host.
//   - lobby, chat and presence are readable by everyone in the room.

import type {
  ChatMessage,
  InboxMessage,
  LobbyState,
  Presence,
  RoomMeta,
  SavedHostState,
  ViewRecord,
} from './types';

interface RoomEventsBase {
  /** Everyone connected right now (this device included once registered). */
  presence: (people: Presence[]) => void;
  chat: (msg: ChatMessage) => void;
  /** This device's link to the server went down / came back. */
  connected: (up: boolean) => void;
}

export interface HostEvents extends RoomEventsBase {
  /** A guest message, with the sender's server-verified uid. */
  inbox: (fromUid: string, msg: InboxMessage) => void;
}

export interface GuestEvents extends RoomEventsBase {
  /** The lobby changed. null = the room is gone (host closed it). */
  lobby: (lobby: LobbyState | null) => void;
  /** This device's own redacted view. null = no match running. */
  view: (record: ViewRecord | null) => void;
}

export interface ConnectionBase {
  readonly code: string;
  /** This device's uid. */
  readonly uid: string;
  readonly meta: RoomMeta;
  sendChat: (name: string, text: string) => Promise<void>;
}

export interface HostConnection extends ConnectionBase {
  setLobby: (lobby: LobbyState) => Promise<void>;
  /**
   * Write each recipient's view (and optionally the host's saved state) in
   * one atomic update. Keys are uids.
   */
  publish: (views: Record<string, ViewRecord>, saved?: SavedHostState | null) => Promise<void>;
  /** Remove every view and the saved state (the match ended). */
  clearMatch: () => Promise<void>;
  /** Stop listening. `deleteRoom` also removes the room for everyone. */
  close: (opts: { deleteRoom: boolean }) => void;
}

export interface GuestConnection extends ConnectionBase {
  send: (msg: InboxMessage) => Promise<void>;
  close: () => void;
}

export interface RoomTransport {
  /** This device's uid, signing in anonymously the first time. */
  signIn: () => Promise<string>;
  /** Start signing in now so the first create / join is quick. Never throws. */
  warmUp: () => void;
  /** Open a new room under `code`. Resolves null when the code is taken. */
  createRoom: (code: string, lobby: LobbyState, me: Presence, events: HostEvents) => Promise<HostConnection | null>;
  /** The room's meta, or null when there's no such room. */
  lookupRoom: (code: string) => Promise<RoomMeta | null>;
  /** Reopen a room this device hosts (after a reload): its lobby and saved state. */
  resumeHost: (
    code: string,
    meta: RoomMeta,
    me: Presence,
    events: HostEvents,
  ) => Promise<{ conn: HostConnection; lobby: LobbyState | null; saved: SavedHostState | null }>;
  joinAsGuest: (code: string, meta: RoomMeta, me: Presence, events: GuestEvents) => Promise<GuestConnection>;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Rooms are deleted once the day they were made ended this long ago (so
 * 7-8 days after they're made), and only when nobody is connected. The
 * rules use the same number.
 */
export const ROOM_LIFETIME_MS = 7 * DAY_MS;

/** The server couldn't be reached (offline, blocked, or timed out). */
export class ServerUnreachableError extends Error {
  constructor(message = 'Could not reach the game server.') {
    super(message);
    this.name = 'ServerUnreachableError';
  }
}

export function parseJson<T>(json: unknown): T | null {
  if (typeof json !== 'string') return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
