import type { ActionEnvelope, GameId, PublicEnvelope, Seat, StateTick } from '@/engine/types';

export type ConnectionState = 'disconnected' | 'connecting' | 'lobby' | 'in-game';
export type LocalRole = 'solo' | 'host' | 'guest' | 'spectator';

export interface LobbyState {
  gameId: GameId;
  seats: Seat[];
  // Per-game options (mirrors `GameConfig.gameOptions`). Host is the source
  // of truth and rebroadcasts on every change.
  gameOptions: Record<string, unknown>;
  seed: number;
}

export interface ChatMessage {
  id: string;
  senderUuid: string;
  senderName: string;
  text: string;
  timestamp: number;
  kind: 'user' | 'system';
}

// ============================================================================
// Wire messages
// ============================================================================

export interface HelloMessage {
  uuid: string;
  displayName: string;
}

// Lobby: host broadcasts; guests don't send these directly. Guests request
// changes (claim seat, set name) via SeatRequest which the host then
// integrates and rebroadcasts.
export interface SeatRequestMessage {
  uuid: string;
  desiredSeat: number | 'leave';
  displayName?: string;
}

// In-game: host receives ActionEnvelopes from peers, applies them, and
// broadcasts redacted PublicEnvelopes to each peer individually (not
// "everyone gets the same payload"). This is the chokepoint that keeps
// hidden info private — see engine/README.md.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyActionEnvelope = ActionEnvelope<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPublicEnvelope = PublicEnvelope<any>;

export interface StartMessage {
  gameId: GameId;
  tick: StateTick; // always 0 at start
  // The initial public view, redacted for the receiving seat.
  view: AnyPublicEnvelope;
}

export interface SnapshotRequestMessage {
  uuid: string;
}

// Snapshot is the same redacted view sent to a single peer on rejoin.
export interface SnapshotMessage {
  view: AnyPublicEnvelope;
  chat: ChatMessage[];
  hostUuid: string;
  // Seat → UUID mapping the host has in its lobby record. Newcomer matches
  // their own UUID against this to determine guest vs. spectator role.
  seatUuids: (string | null)[];
}
