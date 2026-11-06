import { describe, expect, it } from 'vitest';
import { aiChooseAction } from './ai';
import { onuwModule } from './module';
import { BASE_ROLES, BONUS_ROLES, DAYBREAK_ROLES, ROLE_MAX_COUNT } from './roles';
import type { OnuwPrivateState, OnuwRoleId } from './state';
import { ackAll, act, makeConfig, playNight, rig, selfPlay } from './testkit';
import { viewFor } from './view';

function randomPool(seed: number, players: number): OnuwRoleId[] {
  // Deterministic shuffle of every role (respecting copy caps), always
  // including at least one werewolf.
  const all: OnuwRoleId[] = [];
  for (const r of [...BASE_ROLES, ...DAYBREAK_ROLES, ...BONUS_ROLES]) {
    for (let i = 0; i < ROLE_MAX_COUNT[r]; i++) all.push(r);
  }
  let x = seed >>> 0;
  const next = () => {
    x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return x / 2 ** 32;
  };
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  const pool = all.filter((r) => r !== 'werewolf').slice(0, players + 2);
  return ['werewolf', ...pool];
}

describe('ONUW AI — all-AI self-play finishes', () => {
  for (const players of [3, 5, 7, 10]) {
    it(`${players} players, many pools and seeds`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const pool = randomPool(seed * 7919 + players, players);
        const state = onuwModule.createInitialState(makeConfig(pool, players, seed * 104729));
        const end = selfPlay(state);
        expect(end.phase).toBe('gameOver');
        expect(end.seats.every((s) => s.voteTarget !== null)).toBe(true);
      }
    });
  }

  it('acts in every phase where its seat must act, and passes otherwise', () => {
    const s = rig(['seer', 'werewolf', 'villager'], ['villager', 'robber', 'troublemaker']);
    expect(aiChooseAction(s, 0)).toEqual({ type: 'ackRoleReveal', bySeat: 0 });
    const night = ackAll(s);
    // Werewolf (seat 1) is up; the Seer and Villager have nothing to do yet.
    expect(aiChooseAction(night, 0)).toBeNull();
    expect(aiChooseAction(night, 2)).toBeNull();
    expect(aiChooseAction(night, 1)?.type).toMatch(/nightAck|loneWolfPeekCenter/);
    const day = playNight(night);
    expect(day.phase).toBe('day');
    for (const seat of [0, 1, 2]) expect(aiChooseAction(day, seat)).toBeNull();
    const voting = act(day, { type: 'startVote' });
    for (const seat of [0, 1, 2]) expect(aiChooseAction(voting, seat)?.type).toBe('castVote');
  });
});

describe('ONUW AI — fairness: decisions depend only on its own view', () => {
  // Two private states that look identical from `seat`'s point of view must
  // produce the same AI decision. The old AI read other seats' cards
  // (lone-wolf check by dealt roles, vote from its own post-swap card).
  function scramble(state: OnuwPrivateState, keep: number): OnuwPrivateState {
    const others = state.seats.filter((s) => s.index !== keep);
    const roles = others.map((s) => ({ finalRole: s.finalRole, finalCard: s.finalCard })).reverse();
    return {
      ...state,
      centerCards: state.centerCards.map((c, i, arr) => ({ ...arr[(i + 1) % arr.length]!, index: c.index })),
      seats: state.seats.map((s) => {
        if (s.index === keep) return { ...s, finalRole: 'tanner', finalCard: 'tanner' };
        const r = roles[others.findIndex((o) => o.index === s.index)]!;
        return { ...s, ...r };
      }),
    };
  }

  it('votes the same no matter what the hidden cards are', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const pool: OnuwRoleId[] = ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager', 'villager', 'minion'];
      let s = onuwModule.createInitialState(makeConfig(pool, 5, seed));
      s = selfPlayUntil(s, (x) => x.phase === 'voting');
      for (let seat = 0; seat < 5; seat++) {
        const b = scramble(s, seat);
        // Same view for this seat…
        expect(JSON.stringify(viewFor(b, seat))).toBe(JSON.stringify(viewFor(s, seat)));
        // …so the same vote.
        expect(aiChooseAction(b, seat)).toEqual(aiChooseAction(s, seat));
      }
    }
  });

  it('a lone-wolf decision does not depend on where the other werewolf card is', () => {
    // Seat 0 is a werewolf whose partner is in the center: lone wolf either
    // way, and the AI must not behave differently.
    const a = ackAll(rig(['werewolf', 'villager', 'villager'], ['werewolf', 'seer', 'robber'], { seed: 4 }));
    const b = ackAll(rig(['werewolf', 'villager', 'villager'], ['seer', 'werewolf', 'robber'], { seed: 4 }));
    expect(JSON.stringify(viewFor(a, 0))).toBe(JSON.stringify(viewFor(b, 0)));
    expect(aiChooseAction(a, 0)).toEqual(aiChooseAction(b, 0));
  });
});

function selfPlayUntil(state: OnuwPrivateState, stop: (s: OnuwPrivateState) => boolean): OnuwPrivateState {
  let found: OnuwPrivateState | null = null;
  try {
    selfPlay(state, (s) => {
      if (!found && stop(s)) {
        found = s;
        throw new Error('stop');
      }
    });
  } catch (e) {
    if ((e as Error).message !== 'stop') throw e;
  }
  if (!found) throw new Error('condition never reached');
  return found;
}
