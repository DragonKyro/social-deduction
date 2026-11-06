// In-memory RoomTransport for tests: one `FakeServer` stands in for the
// database, and each `fakeTransport(server, uid)` is a device. It mirrors the
// access rules that matter for hidden information:
//   - a device only ever receives `views/{its own uid}`;
//   - only the host receives inbox messages, stamped with the sender's uid;
//   - only the host can read the saved host state.
// Delivery is synchronous, which keeps tests deterministic.

import type {
  GuestConnection,
  GuestEvents,
  HostConnection,
  HostEvents,
  RoomTransport,
} from './transport';
import type { ChatMessage, InboxMessage, LobbyState, Presence, RoomMeta, SavedHostState, ViewRecord } from './types';

interface FakeRoom {
  meta: RoomMeta;
  lobby: string;
  views: Map<string, string>;
  host: string | null;
  chat: ChatMessage[];
  presence: Presence[];
  hostEvents: HostEvents | null;
  guests: Map<string, GuestEvents>;
}

export class FakeServer {
  readonly rooms = new Map<string, FakeRoom>();
  private chatSeq = 0;

  /** What the server stores at views/{uid} (for assertions). */
  rawView(code: string, uid: string): string | undefined {
    return this.rooms.get(code)?.views.get(uid);
  }

  nextChatId(): string {
    return `c${++this.chatSeq}`;
  }

  broadcastPresence(room: FakeRoom): void {
    const people = room.presence.slice();
    room.hostEvents?.presence(people);
    for (const g of room.guests.values()) g.presence(people);
  }
}

export function fakeTransport(server: FakeServer, uid: string): RoomTransport {
  function joinCommon(room: FakeRoom, me: Presence) {
    room.presence.push({ uid, name: me.name });
    server.broadcastPresence(room);
  }

  function leaveCommon(room: FakeRoom) {
    const i = room.presence.findIndex((p) => p.uid === uid);
    if (i >= 0) room.presence.splice(i, 1);
    server.broadcastPresence(room);
  }

  function chatter(code: string, room: FakeRoom) {
    return async (name: string, text: string) => {
      const msg: ChatMessage = {
        id: server.nextChatId(),
        senderUuid: uid,
        senderName: name,
        text,
        timestamp: Date.now(),
        kind: 'user',
      };
      const r = server.rooms.get(code);
      if (!r) return;
      r.chat.push(msg);
      room.hostEvents?.chat(msg);
      for (const g of room.guests.values()) g.chat(msg);
    };
  }

  function hostConn(code: string, room: FakeRoom, events: HostEvents): HostConnection {
    room.hostEvents = events;
    for (const m of room.chat) events.chat(m);
    let closed = false;
    return {
      code,
      uid,
      meta: room.meta,
      sendChat: chatter(code, room),
      setLobby: async (lobby: LobbyState) => {
        room.lobby = JSON.stringify(lobby);
        for (const g of room.guests.values()) g.lobby(JSON.parse(room.lobby) as LobbyState);
      },
      publish: async (views: Record<string, ViewRecord>, saved?: SavedHostState | null) => {
        for (const [to, rec] of Object.entries(views)) {
          const json = JSON.stringify(rec);
          room.views.set(to, json);
          // Rules: only `to` can read views/{to}.
          room.guests.get(to)?.view(JSON.parse(json) as ViewRecord);
        }
        if (saved !== undefined) room.host = saved ? JSON.stringify(saved) : null;
      },
      clearMatch: async () => {
        room.views.clear();
        room.host = null;
        for (const g of room.guests.values()) g.view(null);
      },
      close: ({ deleteRoom }) => {
        if (closed) return;
        closed = true;
        room.hostEvents = null;
        leaveCommon(room);
        if (deleteRoom) {
          server.rooms.delete(code);
          for (const g of room.guests.values()) g.lobby(null);
        }
      },
    };
  }

  return {
    signIn: async () => uid,
    warmUp: () => {},

    createRoom: async (code, lobby, me, events) => {
      if (server.rooms.has(code)) return null;
      const room: FakeRoom = {
        meta: { hostUid: uid, createdAt: Date.now(), build: 'fake' },
        lobby: JSON.stringify(lobby),
        views: new Map(),
        host: null,
        chat: [],
        presence: [],
        hostEvents: null,
        guests: new Map(),
      };
      server.rooms.set(code, room);
      const conn = hostConn(code, room, events);
      joinCommon(room, me);
      return conn;
    },

    lookupRoom: async (code) => server.rooms.get(code)?.meta ?? null,

    resumeHost: async (code, _meta, me, events) => {
      const room = server.rooms.get(code);
      if (!room || room.meta.hostUid !== uid) throw new Error('permission denied');
      const conn = hostConn(code, room, events);
      joinCommon(room, me);
      return {
        conn,
        lobby: JSON.parse(room.lobby) as LobbyState,
        saved: room.host ? (JSON.parse(room.host) as SavedHostState) : null,
      };
    },

    joinAsGuest: async (code, meta, me, events): Promise<GuestConnection> => {
      const room = server.rooms.get(code);
      if (!room) throw new Error('no such room');
      room.guests.set(uid, events);
      events.lobby(JSON.parse(room.lobby) as LobbyState);
      const own = room.views.get(uid);
      if (own) events.view(JSON.parse(own) as ViewRecord);
      for (const m of room.chat) events.chat(m);
      joinCommon(room, me);
      let closed = false;
      return {
        code,
        uid,
        meta,
        sendChat: chatter(code, room),
        send: async (msg: InboxMessage) => {
          // Rules stamp the sender's verified uid; only the host reads it.
          room.hostEvents?.inbox(uid, JSON.parse(JSON.stringify(msg)) as InboxMessage);
        },
        close: () => {
          if (closed) return;
          closed = true;
          room.guests.delete(uid);
          leaveCommon(room);
        },
      };
    },
  };
}
