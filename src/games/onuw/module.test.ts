import { describe, expect, it } from 'vitest';
import { onuwModule } from './module';
import type { OnuwRoleId } from './state';
import { ackAll, act, awake, makeConfig, playNight, rig, voteAll } from './testkit';
import { yourNightStep } from './view';

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
    const pool: OnuwRoleId[] = ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager'];
    const state = onuwModule.createInitialState(makeConfig(pool, 3));
    expect(state.phase).toBe('setup');
    expect(state.seats).toHaveLength(3);
    expect(state.centerCards).toHaveLength(3);
    expect(state.nightSchedule.map((s) => s.role)).not.toContain('villager');
  });

  it('defaultConfig yields a valid pool for every supported player count', () => {
    for (let n = onuwModule.minPlayers; n <= onuwModule.maxPlayers; n++) {
      const cfg = onuwModule.defaultConfig(n);
      expect(() => onuwModule.createInitialState({ ...cfg, seed: 3 })).not.toThrow();
    }
  });

  it('the night schedule is built from the whole pool, so center roles still get a (silent) step', () => {
    // Seer is in the center: its step exists but has no seats.
    const s = rig(['werewolf', 'robber', 'villager'], ['seer', 'troublemaker', 'villager']);
    const seerStep = s.nightSchedule.find((st) => st.role === 'seer');
    expect(seerStep).toBeDefined();
    expect(seerStep!.seats).toEqual([]);
    // …and the night still flows straight past it.
    const after = playNight(ackAll(s));
    expect(after.phase).toBe('day');
  });
});

describe('ONUW — night flow', () => {
  it('transitions setup → night → day after every seat acts', () => {
    const pool: OnuwRoleId[] = ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager'];
    let s = onuwModule.createInitialState(makeConfig(pool, 3));
    s = ackAll(s);
    expect(s.phase).toBe('night');
    s = playNight(s);
    expect(s.phase).toBe('day');
  });

  it('wakes roles in the official order (werewolves → seer → robber → troublemaker → drunk → insomniac)', () => {
    let s = rig(
      ['insomniac', 'drunk', 'troublemaker', 'robber', 'seer', 'werewolf'],
      ['villager', 'villager', 'werewolf'],
    );
    s = ackAll(s);
    const order: number[] = [];
    while (s.phase === 'night') {
      const seat = awake(s)[0]!;
      order.push(seat);
      const step = yourNightStep(s, seat)!;
      s = act(s, step.role === 'drunk' ? { type: 'drunkSwap', bySeat: seat, centerIndex: 0 } : { type: 'nightAck', bySeat: seat });
    }
    expect(order).toEqual([5, 4, 3, 2, 1, 0]);
  });
});

describe('ONUW — voting and win conditions', () => {
  it('village wins when a werewolf is killed', () => {
    let s = playNight(ackAll(rig(['werewolf', 'villager', 'villager'], ['villager', 'mason', 'werewolf'])));
    s = voteAll(s, [1, 0, 0]);
    expect(s.phase).toBe('resolution');
    expect(s.killedSeats).toEqual([0]);
    expect(s.winningTeams).toEqual(['village']);
    expect(s.winners).toEqual([1, 2]);
  });

  it('tanner wins when the tanner is killed', () => {
    let s = playNight(ackAll(rig(['tanner', 'werewolf', 'villager'], ['villager', 'villager', 'minion'])));
    s = voteAll(s, [1, 0, 0]);
    expect(s.killedSeats).toEqual([0]);
    expect(s.winningTeams).toEqual(['tanner']);
    expect(s.winners).toEqual([0]);
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

  it('reveals everything at resolution', () => {
    let s = playNight(ackAll(rig(['werewolf', 'villager', 'villager'], ['villager', 'minion', 'mason'])));
    s = voteAll(s, [1, 0, 0]);
    expect(s.phase).toBe('resolution');
    const view = onuwModule.viewFor(s, 1);
    expect(view.seats.every((seat) => seat.revealedRole !== null)).toBe(true);
    expect(view.centerCards.every((c) => c.revealedRole !== null)).toBe(true);
    expect(view.yourFinalRole).toBe('villager');
  });
});
