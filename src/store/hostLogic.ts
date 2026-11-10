// Pure host-side decisions for online play, kept out of networkStore so they
// can be unit-tested: who may sit where, which inbound actions are accepted,
// and which redacted view each connected device receives.
//
// Identity: in online play a seat's `uuid` is its occupant's Firebase uid,
// and every inbound message carries the sender's uid as verified by the
// database rules. The host therefore derives the acting seat from the
// sender's uid and never trusts a seat number claimed inside the payload.

import type { GameModule, PublicEnvelope, Seat, SeatIndex } from '@/engine/types';
import type { InboxMessage, LobbyState, ViewRecord } from '@/net/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModule = GameModule<any, any, any>;

export const AI_UUID_PREFIX = 'ai:';

export function isAiUuid(uuid: string | null): boolean {
  return !!uuid && uuid.startsWith(AI_UUID_PREFIX);
}

/** The human seat held by `uid`, if any. */
export function seatOf(lobby: LobbyState, uid: string): Seat | null {
  return lobby.seats.find((s) => s.uuid === uid && !s.isAI) ?? null;
}

export function openSeatName(index: SeatIndex): string {
  return `Seat ${index + 1}`;
}

/**
 * Apply a guest's seat request. Returns the new lobby, or null when the
 * request is refused or changes nothing. Seats are frozen while a match is
 * running (a seat change mid-match would hand someone else's view over).
 */
export function applySeatRequest(
  lobby: LobbyState,
  uid: string,
  req: Extract<InboxMessage, { kind: 'seat' }>,
): LobbyState | null {
  const name = (req.displayName ?? '').trim().slice(0, 20);
  if (lobby.inGame) {
    // Only a rename of the seat you already hold is allowed mid-match.
    const mine = seatOf(lobby, uid);
    if (!mine || !name || req.desiredSeat !== mine.index || mine.name === name) return null;
    return { ...lobby, seats: lobby.seats.map((s) => (s.index === mine.index ? { ...s, name } : s)) };
  }
  const seats = lobby.seats.map((s) => ({ ...s }));
  const current = seats.find((s) => s.uuid === uid && !s.isAI) ?? null;
  if (req.desiredSeat === 'leave') {
    if (!current) return null;
    seats[current.index] = { ...current, uuid: null, name: openSeatName(current.index), isAI: false };
    return { ...lobby, seats };
  }
  const idx = req.desiredSeat;
  if (!Number.isInteger(idx) || idx < 0 || idx >= seats.length) return null;
  const target = seats[idx]!;
  if (target.isAI) return null;
  if (target.uuid && target.uuid !== uid) return null;
  if (current && current.index !== idx) {
    seats[current.index] = { ...current, uuid: null, name: openSeatName(current.index), isAI: false };
  }
  const nextName = name || (current?.name ?? target.name);
  if (target.uuid === uid && target.name === nextName) return null;
  seats[idx] = { ...target, uuid: uid, name: nextName, isAI: false };
  return { ...lobby, seats };
}

export type InboundVerdict = { ok: true; seat: SeatIndex } | { ok: false; reason: string };

/**
 * Decide whether the host applies an action sent by `uid`. The action must
 * carry `bySeat` equal to the sender's own seat: seatless actions (phase
 * controls like "start the vote") are reserved for the host, and acting as
 * another seat — human or AI — is refused.
 */
export function vetInboundAction(lobby: LobbyState, uid: string, action: unknown): InboundVerdict {
  if (!lobby.inGame) return { ok: false, reason: 'no match running' };
  const seat = seatOf(lobby, uid);
  if (!seat) return { ok: false, reason: 'sender holds no seat' };
  if (!action || typeof action !== 'object' || typeof (action as { type?: unknown }).type !== 'string') {
    return { ok: false, reason: 'malformed action' };
  }
  const bySeat = (action as { bySeat?: unknown }).bySeat;
  if (typeof bySeat !== 'number') return { ok: false, reason: 'seatless actions are host-only' };
  if (bySeat !== seat.index) return { ok: false, reason: `seat ${seat.index} tried to act as seat ${bySeat}` };
  return { ok: true, seat: seat.index };
}

/**
 * The view record each recipient gets: seated humans their own seat's
 * redaction, everyone else (spectators) the seat-null redaction. The host's
 * own uid is skipped (it renders from local state).
 */
export function buildViews(
  module: AnyModule,
  state: unknown,
  lobby: LobbyState,
  recipients: Iterable<string>,
  tick: number,
  hostUid: string,
): Record<string, ViewRecord> {
  const out: Record<string, ViewRecord> = {};
  const cache = new Map<SeatIndex | null, PublicEnvelope<unknown>>();
  for (const uid of recipients) {
    if (uid === hostUid || isAiUuid(uid) || out[uid]) continue;
    const seat = seatOf(lobby, uid)?.index ?? null;
    let env = cache.get(seat);
    if (!env) {
      env = { gameId: module.id, tick, view: module.viewFor(state, seat), seat };
      cache.set(seat, env);
    }
    out[uid] = { match: lobby.match, env };
  }
  return out;
}

/** Build the lobby seats for a new room: AI seats as requested, host in the first human seat. */
export function initialSeats(
  hostUid: string,
  hostName: string,
  names: string[],
  aiSeats: SeatIndex[],
): Seat[] {
  const seats: Seat[] = names.map((n, i) =>
    aiSeats.includes(i)
      ? { index: i, uuid: `${AI_UUID_PREFIX}${i}`, name: n || `AI ${i + 1}`, isAI: true }
      : { index: i, uuid: null, name: openSeatName(i), isAI: false },
  );
  const hostSeat = seats.find((s) => !s.isAI);
  if (hostSeat) seats[hostSeat.index] = { ...hostSeat, uuid: hostUid, name: hostName };
  return seats;
}

export interface LedgerEntry {
  /** Serialised seat + view last sent to this device. */
  key: string;
  /** Per-device view sequence number (sent as the envelope's `tick`). */
  seq: number;
}

/**
 * Keep only views whose content changed since this device's last one, and
 * stamp each with that device's own sequence number. Both matter for hidden
 * information: re-sending unchanged views with the global action counter
 * would let a guest count other players' secret moves (e.g. how many night
 * roles acted before theirs). Mutates `ledger`.
 */
export function stampChangedViews(
  ledger: Map<string, LedgerEntry>,
  views: Record<string, ViewRecord>,
): Record<string, ViewRecord> {
  const out: Record<string, ViewRecord> = {};
  for (const [uid, rec] of Object.entries(views)) {
    const key = JSON.stringify([rec.env.seat, rec.env.view]);
    const prev = ledger.get(uid);
    if (prev && prev.key === key) continue;
    const seq = prev ? prev.seq + 1 : 0;
    ledger.set(uid, { key, seq });
    out[uid] = { match: rec.match, env: { ...rec.env, tick: seq } };
  }
  return out;
}
