import { describe, expect, it } from 'vitest';
import type { SeatIndex } from '@/engine/types';
import { onuwModule } from './module';
import { BASE_ROLES, BONUS_ROLES, DAYBREAK_ROLES, ROLES } from './roles';
import type { OnuwPrivateState, OnuwPublicState, OnuwRoleId } from './state';
import { ackAll, act, makeConfig, playNight, rig, selfPlay } from './testkit';
import { viewFor } from './view';

// ============================================================================
// Redaction: a seat's view may contain only its own dealt card, its own
// night observations and its own turn prompt. Before the vote resolves, the
// rest of the view must not mention ANY role id at all (except cards the
// Revealer legitimately flipped face-up, from daybreak on). Spectator views
// get no role ids at all.
// ============================================================================

const ROLE_IDS = Object.keys(ROLES) as OnuwRoleId[];
const PRIVATE_KEYS = [
  'dealtRole',
  'finalRole',
  'finalCard',
  'nightSchedule',
  'nightStepIndex',
  'nightStepAcks',
  'piLooks',
  'doppelCopy',
  'seed',
  'activeNightStep',
  'nightTotalSteps',
];

function strippedJson(view: OnuwPublicState): string {
  const {
    rolePool: _pool,
    yourDealtRole: _dealt,
    yourObservations: _obs,
    yourNightStep: _step,
    ...rest
  } = view;
  return JSON.stringify(rest);
}

function roleMentions(json: string): OnuwRoleId[] {
  return ROLE_IDS.filter((id) => json.includes(`"${id}"`));
}

function assertRedacted(state: OnuwPrivateState, seat: SeatIndex | null, seedText: string) {
  const view = viewFor(state, seat);
  const full = JSON.stringify(view);
  const ctx = `phase=${state.phase} seat=${seat}`;
  for (const k of PRIVATE_KEYS) expect(full, `${ctx} key ${k}`).not.toContain(`"${k}"`);
  expect(full, `${ctx} seed`).not.toContain(seedText);

  const over = state.phase === 'resolution' || state.phase === 'gameOver';
  if (over) return;

  const allowed = new Set(view.seats.map((s) => s.flippedCard).filter((c): c is OnuwRoleId => c !== null));
  const leaked = roleMentions(strippedJson(view)).filter((id) => !allowed.has(id));
  expect(leaked, `${ctx} leaked role ids`).toEqual([]);
  expect(view.yourFinalRole, ctx).toBeNull();
  expect(view.seats.every((s) => s.revealedRole === null && s.revealedCard === null && s.voteTarget === null), ctx).toBe(true);
  expect(view.centerCards.every((c) => c.revealedRole === null && c.revealedCard === null), ctx).toBe(true);
  expect(view.killedSeats, ctx).toEqual([]);
  expect(view.winners, ctx).toEqual([]);

  if (seat === null) {
    expect(view.yourDealtRole).toBeNull();
    expect(view.yourObservations).toEqual([]);
    expect(view.yourNightStep).toBeNull();
    expect(roleMentions(full.replace(JSON.stringify(view.rolePool), '')).filter((id) => !allowed.has(id)), ctx).toEqual([]);
    return;
  }
  // Own observations only — and no other seat's observation text anywhere.
  expect(view.yourObservations).toEqual(state.seats[seat]!.observations);
  // (Skip sentences this seat legitimately has itself, e.g. two seats that
  // both looked at the same center card.)
  const own = state.seats[seat]!.observations.map((o) => o.text);
  for (const other of state.seats) {
    if (other.index === seat) continue;
    for (const o of other.observations) {
      if (own.some((t) => t.includes(o.text))) continue;
      expect(full, `${ctx} sees seat ${other.index}'s note`).not.toContain(o.text);
    }
  }
  // Only the seat whose turn it is gets a prompt.
  const step = state.phase === 'night' ? state.nightSchedule[state.nightStepIndex] : undefined;
  if (view.yourNightStep) {
    expect(step?.seats.includes(seat), ctx).toBe(true);
  }
}

const POOLS: { name: string; pool: OnuwRoleId[]; players: number }[] = [
  {
    name: 'base 6p',
    players: 6,
    pool: ['werewolf', 'werewolf', 'minion', 'seer', 'robber', 'troublemaker', 'drunk', 'insomniac', 'tanner'],
  },
  {
    name: 'daybreak 7p',
    players: 7,
    pool: ['doppelganger', 'alphaWolf', 'mysticWolf', 'dreamWolf', 'witch', 'apprenticeSeer', 'paranormalInvestigator', 'villageIdiot', 'revealer', 'curator'],
  },
  {
    name: 'bonus 8p',
    players: 8,
    pool: ['werewolf', 'squire', 'auraSeer', 'beholder', 'thing', 'bodySnatcher', 'empath', 'windyWendy', 'defenderEr', 'prince', 'cursed'],
  },
  {
    name: 'doppel + masons 6p',
    players: 6,
    pool: ['doppelganger', 'werewolf', 'werewolf', 'mason', 'mason', 'seer', 'robber', 'insomniac', 'hunter'],
  },
];

describe('ONUW — viewFor never leaks hidden info (self-play sweep)', () => {
  for (const { name, pool, players } of POOLS) {
    it(`${name}: every seat and the spectator, at every state`, () => {
      for (const seed of [1234567, 7654321, 3141592]) {
        const seedText = String(seed);
        const state = onuwModule.createInitialState(makeConfig(pool, players, seed));
        let checked = 0;
        selfPlay(state, (s) => {
          assertRedacted(s, null, seedText);
          for (const seat of s.seats) assertRedacted(s, seat.index, seedText);
          checked++;
        });
        expect(checked).toBeGreaterThan(players);
      }
    });
  }
});

describe('ONUW — "who is awake" is not observable', () => {
  it('the spectator view is identical at every point of the night', () => {
    const state = onuwModule.createInitialState(makeConfig(POOLS[0]!.pool, 6, 99));
    const seen = new Set<string>();
    selfPlay(state, (s) => {
      if (s.phase === 'night') seen.add(JSON.stringify(viewFor(s, null)));
    });
    expect(seen.size).toBe(1);
  });

  it("a seat's view only changes at night when it's its own turn or it learns something", () => {
    const state = onuwModule.createInitialState(makeConfig(POOLS[1]!.pool, 7, 5));
    const bySeat = new Map<number, Set<string>>();
    selfPlay(state, (s) => {
      if (s.phase !== 'night') return;
      for (const seat of s.seats) {
        const { yourObservations: _o, yourNightStep: _n, ...rest } = viewFor(s, seat.index);
        const set = bySeat.get(seat.index) ?? new Set<string>();
        set.add(JSON.stringify(rest));
        bySeat.set(seat.index, set);
      }
    });
    for (const set of bySeat.values()) expect(set.size).toBe(1);
  });

  it('the old leak is gone: no step role / acting seats / step counter in any view', () => {
    let s = ackAll(rig(['seer', 'villager', 'werewolf', 'robber'], ['villager', 'troublemaker', 'villager']));
    // Werewolf (seat 2, lone) is awake.
    for (const seat of [0, 1, 3]) expect(viewFor(s, seat).yourNightStep).toBeNull();
    expect(viewFor(s, 2).yourNightStep).toMatchObject({ role: 'werewolf', loneWolf: true });
    s = act(s, { type: 'loneWolfSkip', bySeat: 2 });
    for (const seat of [1, 2, 3]) expect(viewFor(s, seat).yourNightStep).toBeNull();
    expect(viewFor(s, 0).yourNightStep?.role).toBe('seer');
    const json = JSON.stringify(viewFor(s, 1));
    expect(json).not.toContain('"role":"seer"');
    expect(json).not.toMatch(/nightStep(Index|s)|TotalSteps|activeNight/);
  });
});

describe('ONUW — your current card stays hidden until the vote', () => {
  it('a seat whose card was swapped does not see its new card (yourFinalRole was always exposed)', () => {
    // 0 troublemaker swaps 1 (villager) and 2 (werewolf).
    let s = ackAll(rig(['troublemaker', 'villager', 'werewolf'], ['villager', 'seer', 'robber']));
    s = act(s, { type: 'nightAck', bySeat: 2 });
    s = act(s, { type: 'troublemakerSwap', bySeat: 0, a: 1, b: 2 });
    expect(s.phase).toBe('day');
    const v1 = viewFor(s, 1);
    expect(v1.yourDealtRole).toBe('villager');
    expect(v1.yourFinalRole).toBeNull();
    expect(roleMentions(strippedJson(v1))).toEqual([]);
    s = act(s, { type: 'startVote' });
    for (const [by, t] of [[0, 1], [1, 0], [2, 1]] as const) s = act(s, { type: 'castVote', bySeat: by, targetSeat: t });
    expect(viewFor(s, 1).yourFinalRole).toBe('werewolf');
  });

  it('votes stay secret until everyone has voted (only "has voted" is public)', () => {
    let s = playNight(ackAll(rig(['werewolf', 'villager', 'villager', 'villager'], ['villager', 'seer', 'robber'])));
    s = act(s, { type: 'startVote' });
    s = act(s, { type: 'castVote', bySeat: 1, targetSeat: 0 });
    for (const seat of [null, 0, 2, 3] as const) {
      const v = viewFor(s, seat);
      expect(v.seats[1]!.hasVoted).toBe(true);
      expect(v.seats.every((x) => x.voteTarget === null)).toBe(true);
      expect(v.yourVoteTarget).toBeNull();
      expect(v.voteTally).toEqual({});
    }
    expect(viewFor(s, 1).yourVoteTarget).toBe(0);
  });

  it('an out-of-range seat is treated as a spectator', () => {
    const s = ackAll(rig(['seer', 'villager', 'werewolf'], ['villager', 'troublemaker', 'villager']));
    const v = viewFor(s, 17);
    expect(v.yourSeat).toBeNull();
    expect(v.yourDealtRole).toBeNull();
  });
});

describe('ONUW — every role pack keeps the redaction contract', () => {
  it('a mixed pool from all three packs', () => {
    const pool: OnuwRoleId[] = [
      ...BASE_ROLES.filter((r) => r !== 'villager' && r !== 'mason').slice(0, 5),
      ...DAYBREAK_ROLES.slice(0, 4),
      ...BONUS_ROLES.slice(0, 4),
    ];
    const players = pool.length - 3;
    for (const seed of [11223344, 55667788]) {
      const state = onuwModule.createInitialState(makeConfig(pool, players, seed));
      selfPlay(state, (s) => {
        for (const seat of [null, ...s.seats.map((x) => x.index)]) assertRedacted(s, seat, String(seed));
      });
    }
  });
});
