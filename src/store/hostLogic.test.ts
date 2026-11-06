import { describe, expect, it } from 'vitest';
import type { GameModule, SeatIndex } from '@/engine/types';
import type { LobbyState } from '@/net/types';
import { applySeatRequest, buildViews, initialSeats, seatOf, vetInboundAction } from './hostLogic';

// A minimal game with one secret per seat, to test the host plumbing
// independently of any real game's rules.
interface P {
  secrets: number[];
}
interface V {
  yourSecret: number | null;
  seats: number;
}
const secretModule: GameModule<P, V, { type: 'poke'; bySeat: SeatIndex }> = {
  id: 'skull',
  displayName: 'Secrets',
  minPlayers: 2,
  maxPlayers: 6,
  createInitialState: (c) => ({ secrets: c.seats.map((_, i) => 1000 + i) }),
  applyAction: (s) => s,
  viewFor: (s, seat) => ({ yourSecret: seat === null ? null : s.secrets[seat]!, seats: s.secrets.length }),
  isFinished: () => false,
  defaultConfig: (n) => ({ gameId: 'skull', seats: [], seed: 0, gameOptions: { n } }),
};

function lobby(over: Partial<LobbyState> = {}): LobbyState {
  return {
    gameId: 'skull',
    seats: initialSeats('host', 'Hana', ['a', 'b', 'c', 'd'], [3]),
    gameOptions: {},
    inGame: false,
    match: 0,
    ...over,
  };
}

describe('initialSeats', () => {
  it('puts the host in the first human seat and marks AI seats', () => {
    const seats = initialSeats('host', 'Hana', ['a', 'b', 'c'], [0]);
    expect(seats[0]).toMatchObject({ isAI: true, uuid: 'ai:0' });
    expect(seats[1]).toMatchObject({ isAI: false, uuid: 'host', name: 'Hana' });
    expect(seats[2]).toMatchObject({ isAI: false, uuid: null });
  });
});

describe('applySeatRequest', () => {
  it('lets a guest claim an open seat with their name', () => {
    const next = applySeatRequest(lobby(), 'g1', { kind: 'seat', desiredSeat: 1, displayName: 'Gus' });
    expect(next?.seats[1]).toMatchObject({ uuid: 'g1', name: 'Gus', isAI: false });
  });

  it('refuses taken seats and AI seats', () => {
    expect(applySeatRequest(lobby(), 'g1', { kind: 'seat', desiredSeat: 0 })).toBeNull();
    expect(applySeatRequest(lobby(), 'g1', { kind: 'seat', desiredSeat: 3 })).toBeNull();
    expect(applySeatRequest(lobby(), 'g1', { kind: 'seat', desiredSeat: 9 })).toBeNull();
    expect(applySeatRequest(lobby(), 'g1', { kind: 'seat', desiredSeat: -1 })).toBeNull();
  });

  it('moving frees the old seat; leave frees it too', () => {
    const a = applySeatRequest(lobby(), 'g1', { kind: 'seat', desiredSeat: 1, displayName: 'Gus' })!;
    const b = applySeatRequest(a, 'g1', { kind: 'seat', desiredSeat: 2 })!;
    expect(b.seats[1]!.uuid).toBeNull();
    expect(b.seats[2]).toMatchObject({ uuid: 'g1', name: 'Gus' });
    const c = applySeatRequest(b, 'g1', { kind: 'seat', desiredSeat: 'leave' })!;
    expect(c.seats[2]!.uuid).toBeNull();
  });

  it('freezes seats during a match (only renaming your own seat is allowed)', () => {
    const seated = applySeatRequest(lobby(), 'g1', { kind: 'seat', desiredSeat: 1, displayName: 'Gus' })!;
    const live = { ...seated, inGame: true };
    expect(applySeatRequest(live, 'g1', { kind: 'seat', desiredSeat: 2 })).toBeNull();
    expect(applySeatRequest(live, 'g1', { kind: 'seat', desiredSeat: 'leave' })).toBeNull();
    expect(applySeatRequest(live, 'g2', { kind: 'seat', desiredSeat: 2, displayName: 'X' })).toBeNull();
    expect(applySeatRequest(live, 'g1', { kind: 'seat', desiredSeat: 1, displayName: 'Gustav' })?.seats[1]!.name).toBe(
      'Gustav',
    );
  });
});

describe('vetInboundAction', () => {
  const live = () => ({
    ...applySeatRequest(lobby(), 'g1', { kind: 'seat', desiredSeat: 1, displayName: 'Gus' })!,
    inGame: true,
  });

  it('accepts an action for the sender’s own seat', () => {
    expect(vetInboundAction(live(), 'g1', { type: 'poke', bySeat: 1 })).toEqual({ ok: true, seat: 1 });
  });

  it('refuses acting as another human seat or an AI seat', () => {
    expect(vetInboundAction(live(), 'g1', { type: 'poke', bySeat: 0 }).ok).toBe(false);
    expect(vetInboundAction(live(), 'g1', { type: 'poke', bySeat: 3 }).ok).toBe(false);
  });

  it('refuses seatless (host-only) actions from guests', () => {
    expect(vetInboundAction(live(), 'g1', { type: 'startVote' }).ok).toBe(false);
  });

  it('refuses unseated senders, malformed actions, and actions outside a match', () => {
    expect(vetInboundAction(live(), 'stranger', { type: 'poke', bySeat: 2 }).ok).toBe(false);
    expect(vetInboundAction(live(), 'g1', null).ok).toBe(false);
    expect(vetInboundAction(live(), 'g1', { bySeat: 1 }).ok).toBe(false);
    expect(vetInboundAction({ ...live(), inGame: false }, 'g1', { type: 'poke', bySeat: 1 }).ok).toBe(false);
  });

  it('cannot be fooled by a uid that looks like an AI seat', () => {
    // AI seats carry synthetic `ai:N` uuids; a device can't hold one (Firebase
    // uids never contain ':'), and seatOf ignores AI seats regardless.
    expect(seatOf(live(), 'ai:3')).toBeNull();
    expect(vetInboundAction(live(), 'ai:3', { type: 'poke', bySeat: 3 }).ok).toBe(false);
  });
});

describe('buildViews', () => {
  it('gives each device only its own seat’s view, spectators the seat-null view', () => {
    const l = { ...applySeatRequest(lobby(), 'g1', { kind: 'seat', desiredSeat: 1 })!, inGame: true, match: 4 };
    const state = secretModule.createInitialState({ gameId: 'skull', seats: l.seats, seed: 1, gameOptions: {} });
    const views = buildViews(secretModule, state, l, ['host', 'g1', 'watcher', 'ai:3'], 7, 'host');
    expect(Object.keys(views).sort()).toEqual(['g1', 'watcher']);
    expect(views.g1).toEqual({ match: 4, env: { gameId: 'skull', tick: 7, seat: 1, view: { yourSecret: 1001, seats: 4 } } });
    expect(views.watcher!.env.seat).toBeNull();
    expect(views.watcher!.env.view).toEqual({ yourSecret: null, seats: 4 });
    // No view carries another seat's secret.
    expect(JSON.stringify(views.g1)).not.toContain('1000');
    expect(JSON.stringify(views.watcher)).not.toMatch(/100[0-3]/);
  });
});
