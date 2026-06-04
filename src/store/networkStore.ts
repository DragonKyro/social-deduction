import { create } from 'zustand';
import type { ChatMessage, ConnectionState, LobbyState, LocalRole } from '@/net';

// Stub. Phase 0 ships the type surface; phase 6 wires Trystero through it.

interface NetworkStore {
  connection: ConnectionState;
  role: LocalRole;
  uuid: string | null;
  hostUuid: string | null;
  lobby: LobbyState | null;
  chat: ChatMessage[];
  // peerUuid → online flag. Multiple peers can map to the same UUID
  // (e.g. testing) — we only mark offline when the last one leaves.
  onlinePeers: Record<string, boolean>;

  setConnection: (c: ConnectionState) => void;
  setLobby: (l: LobbyState | null) => void;
  pushChat: (msg: ChatMessage) => void;
  reset: () => void;
}

export const useNetworkStore = create<NetworkStore>((set) => ({
  connection: 'disconnected',
  role: 'solo',
  uuid: null,
  hostUuid: null,
  lobby: null,
  chat: [],
  onlinePeers: {},

  setConnection: (c) => set({ connection: c }),
  setLobby: (l) => set({ lobby: l }),
  pushChat: (msg) => set((s) => ({ chat: [...s.chat, msg] })),
  reset: () =>
    set({
      connection: 'disconnected',
      role: 'solo',
      lobby: null,
      chat: [],
      onlinePeers: {},
      hostUuid: null,
    }),
}));
