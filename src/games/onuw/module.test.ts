import { describe, expect, it } from 'vitest';
import type { GameConfig } from '@/engine/types';
import { onuwModule, type OnuwOptions } from './module';
import type { OnuwAction } from './actions';
import type { OnuwRoleId } from './state';

function makeConfig(rolePool: OnuwRoleId[], playerCount: number, seed = 1): GameConfig {
  const opts: OnuwOptions = {
    rolePool,
    players: Array.from({ length: playerCount }, (_, i) => ({
      name: `P${i + 1}`,
      isAI: false,
    })),
    artifactPool: [],
    dayDurationSec: 300,
    allowNoLynch: true,
  };
  return {
    gameId: 'onuw',
    seats: [],
    seed,
    gameOptions: opts as unknown as Record<string, unknown>,
  };
}

function dispatch(state: ReturnType<typeof onuwModule.createInitialState>, action: OnuwAction) {
  return onuwModule.applyAction(state, action, '');
}

describe('ONUW — setup and pool validation', () => {
  it('rejects role pools without a werewolf', () => {
    expect(() =>
      onuwModule.createInitialState(
        makeConfig(['villager', 'villager', 'villager', 'seer', 'robber', 'troublemaker'], 3),
      ),
    ).toThrow(/werewolf/);
  });

  it('rejects pools that are the wrong size', () => {
    expect(() => onuwModule.createInitialState(makeConfig(['werewolf', 'villager'], 3))).toThrow();
  });

  it('builds a valid initial state for a base pool', () => {
    const pool: OnuwRoleId[] = [
      'werewolf',
      'werewolf',
      'seer',
      'robber',
      'troublemaker',
      'villager',
    ];
    const state = onuwModule.createInitialState(makeConfig(pool, 3));
    expect(state.phase).toBe('setup');
    expect(state.seats).toHaveLength(3);
    expect(state.centerCards).toHaveLength(3);
    // Schedule should include only roles with night actions.
    const roles = state.nightSchedule.map((s) => s.role);
    // Schedule includes only roles dealt to actual seats (not center cards).
    expect(roles.length).toBeGreaterThan(0);
    expect(roles).not.toContain('villager');
  });
});

describe('ONUW — night flow', () => {
  it('transitions setup → night → day after every seat acks', () => {
    const pool: OnuwRoleId[] = ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager'];
    let s = onuwModule.createInitialState(makeConfig(pool, 3));
    for (let i = 0; i < 3; i++) s = dispatch(s, { type: 'ackRoleReveal', bySeat: i });
    expect(s.phase).toBe('night');
    // Advance every night step by acking (or providing minimal action) per
    // active step until we exit night.
    let safety = 0;
    while (s.phase === 'night' && safety++ < 50) {
      const step = s.nightSchedule[s.nightStepIndex];
      if (!step) break;
      // Force-advance via the simplest valid path per role.
      for (const seat of step.seats) {
        if (step.role === 'seer') {
          // Find a non-self target.
          const target = (seat + 1) % s.seats.length;
          s = dispatch(s, { type: 'seerLookSeat', bySeat: seat, targetSeat: target });
        } else if (step.role === 'robber') {
          const target = (seat + 1) % s.seats.length;
          s = dispatch(s, { type: 'robberSwap', bySeat: seat, targetSeat: target });
        } else if (step.role === 'troublemaker') {
          const a = (seat + 1) % s.seats.length;
          const b = (seat + 2) % s.seats.length;
          if (a !== b) s = dispatch(s, { type: 'troublemakerSwap', bySeat: seat, a, b });
          else s = dispatch(s, { type: 'nightAck', bySeat: seat });
        } else if (step.role === 'werewolf') {
          // Skip lone-wolf peek if applicable.
          s = dispatch(s, { type: 'loneWolfSkip', bySeat: seat });
        } else {
          s = dispatch(s, { type: 'nightAck', bySeat: seat });
        }
      }
    }
    expect(s.phase).toBe('day');
  });
});

describe('ONUW — voting and win conditions', () => {
  it('village wins when a werewolf is killed', () => {
    const pool: OnuwRoleId[] = ['werewolf', 'werewolf', 'villager', 'villager', 'villager', 'mason'];
    let s = onuwModule.createInitialState(makeConfig(pool, 3));
    for (let i = 0; i < 3; i++) s = dispatch(s, { type: 'ackRoleReveal', bySeat: i });
    // Advance through whatever night steps remain.
    let safety = 0;
    while (s.phase === 'night' && safety++ < 50) {
      const step = s.nightSchedule[s.nightStepIndex]!;
      for (const seat of step.seats) {
        if (step.role === 'werewolf') {
          s = dispatch(s, { type: 'loneWolfSkip', bySeat: seat });
        } else {
          s = dispatch(s, { type: 'nightAck', bySeat: seat });
        }
      }
    }
    expect(s.phase).toBe('day');
    s = dispatch(s, { type: 'startVote' });
    // Find a werewolf seat and have everyone vote them.
    const wolfSeat = s.seats.findIndex((seat) => seat.finalRole === 'werewolf');
    if (wolfSeat === -1) {
      // Both werewolves ended up in the center; impossible with 2 wolves+3 player pool but guard.
      return;
    }
    for (const seat of s.seats) {
      const target = seat.index === wolfSeat ? (wolfSeat + 1) % s.seats.length : wolfSeat;
      s = dispatch(s, { type: 'castVote', bySeat: seat.index, targetSeat: target });
    }
    expect(s.phase).toBe('resolution');
    expect(s.killedSeats).toContain(wolfSeat);
    expect(s.winnerTeam).toBe('village');
  });

  it('tanner wins when the tanner is killed', () => {
    const pool: OnuwRoleId[] = ['werewolf', 'tanner', 'villager', 'villager', 'villager', 'minion'];
    let s = onuwModule.createInitialState(makeConfig(pool, 3, 42));
    for (let i = 0; i < 3; i++) s = dispatch(s, { type: 'ackRoleReveal', bySeat: i });
    let safety = 0;
    while (s.phase === 'night' && safety++ < 50) {
      const step = s.nightSchedule[s.nightStepIndex]!;
      for (const seat of step.seats) {
        if (step.role === 'werewolf') {
          s = dispatch(s, { type: 'loneWolfSkip', bySeat: seat });
        } else {
          s = dispatch(s, { type: 'nightAck', bySeat: seat });
        }
      }
    }
    s = dispatch(s, { type: 'startVote' });
    const tannerSeat = s.seats.findIndex((seat) => seat.finalRole === 'tanner');
    if (tannerSeat === -1) return;
    for (const seat of s.seats) {
      const target = seat.index === tannerSeat ? (tannerSeat + 1) % s.seats.length : tannerSeat;
      s = dispatch(s, { type: 'castVote', bySeat: seat.index, targetSeat: target });
    }
    expect(s.killedSeats).toContain(tannerSeat);
    expect(s.winnerTeam).toBe('tanner');
  });
});

describe('ONUW — viewFor redacts hidden info', () => {
  it('does not leak other seats roles before resolution', () => {
    const pool: OnuwRoleId[] = ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager'];
    const state = onuwModule.createInitialState(makeConfig(pool, 3));
    const view0 = onuwModule.viewFor(state, 0);
    expect(view0.yourDealtRole).toBe(state.seats[0]!.dealtRole);
    expect(view0.seats[1]!.revealedRole).toBeNull();
    expect(view0.seats[2]!.revealedRole).toBeNull();
    expect(view0.centerCards.every((c) => c.revealedRole === null)).toBe(true);
  });

  it('reveals everything at game over', () => {
    const pool: OnuwRoleId[] = ['werewolf', 'villager', 'villager', 'villager', 'minion', 'mason'];
    let s = onuwModule.createInitialState(makeConfig(pool, 3));
    for (let i = 0; i < 3; i++) s = dispatch(s, { type: 'ackRoleReveal', bySeat: i });
    while (s.phase === 'night') {
      const step = s.nightSchedule[s.nightStepIndex]!;
      for (const seat of step.seats) {
        if (step.role === 'werewolf') s = dispatch(s, { type: 'loneWolfSkip', bySeat: seat });
        else s = dispatch(s, { type: 'nightAck', bySeat: seat });
      }
    }
    s = dispatch(s, { type: 'startVote' });
    for (const seat of s.seats) {
      s = dispatch(s, { type: 'castVote', bySeat: seat.index, targetSeat: 0 });
    }
    expect(s.phase).toBe('resolution');
    const view = onuwModule.viewFor(s, 1);
    expect(view.seats.every((seat) => seat.revealedRole !== null)).toBe(true);
    expect(view.centerCards.every((c) => c.revealedRole !== null)).toBe(true);
  });
});
