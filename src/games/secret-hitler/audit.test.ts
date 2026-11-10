import { describe, expect, it } from 'vitest';
import type { SeatIndex } from '@/engine/types';
import { secretHitlerModule as mod } from './module';
import type { ShAction } from './actions';
import type { ShPrivateState } from './state';
import { configFor } from './testkit';

// Regression tests for the rules / validation bugs found in the audit.

function apply(state: ShPrivateState, action: ShAction): ShPrivateState {
  return mod.applyAction(state, action, '');
}

function started(n: number, seed = 42): ShPrivateState {
  let s = mod.createInitialState(configFor(n, seed));
  for (let i = 0; i < n; i++) s = apply(s, { type: 'ackRoleReveal', bySeat: i });
  return s;
}

function electGov(s: ShPrivateState, chancellor: SeatIndex): ShPrivateState {
  let cur = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor });
  for (const seat of cur.seats) {
    if (seat.alive) cur = apply(cur, { type: 'castVote', bySeat: seat.index, vote: 'ja' });
  }
  return apply(cur, { type: 'ackElectionReveal', bySeat: 0 });
}

describe('Secret Hitler — audit: term limits', () => {
  it('a vetoed government is still term-limited (limits attach at election)', () => {
    let s = started(7);
    s = { ...s, board: { ...s.board, fascistEnacted: 5, vetoUnlocked: true } };
    const pres = s.presidentSeat;
    const chan = (pres + 3) % 7;
    s = electGov(s, chan);
    expect(s.lastElectedPresident).toBe(pres);
    expect(s.lastElectedChancellor).toBe(chan);
    s = apply(s, { type: 'presidentDiscard', bySeat: pres, discardIndex: 0 });
    s = apply(s, { type: 'chancellorRequestVeto', bySeat: chan });
    s = apply(s, { type: 'presidentRespondVeto', bySeat: pres, accept: true });
    expect(s.phase).toBe('nomination');
    expect(s.lastElectedChancellor).toBe(chan);
    expect(() =>
      apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor: chan }),
    ).toThrow(/not an eligible/);
    // 7 alive > 5, so the vetoed president is term-limited too.
    expect(() =>
      apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor: pres }),
    ).toThrow(/not an eligible/);
  });

  it('with 5 alive only the last chancellor is term-limited', () => {
    let s = started(5);
    const pres = s.presidentSeat;
    const chan = (pres + 2) % 5;
    s = electGov(s, chan);
    s = { ...s, legislativeHand: ['liberal', 'liberal', 'liberal'] };
    s = apply(s, { type: 'presidentDiscard', bySeat: pres, discardIndex: 0 });
    s = apply(s, { type: 'chancellorEnact', bySeat: chan, enactIndex: 0 });
    s = apply(s, { type: 'ackPolicyReveal', bySeat: 0 });
    expect(() =>
      apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor: pres }),
    ).not.toThrow();
  });
});

describe('Secret Hitler — audit: veto', () => {
  function vetoSession(): ShPrivateState {
    const s = started(5);
    return {
      ...s,
      board: { ...s.board, fascistEnacted: 5, vetoUnlocked: true },
      phase: 'legislativeChancellor',
      legislativeHand: ['fascist', 'fascist'],
      chancellorCandidateSeat: (s.presidentSeat + 1) % s.seats.length,
    };
  }

  it('veto may only be proposed once per session; after refusal the chancellor must enact', () => {
    let s = vetoSession();
    const chan = s.chancellorCandidateSeat!;
    s = apply(s, { type: 'chancellorRequestVeto', bySeat: chan });
    s = apply(s, { type: 'presidentRespondVeto', bySeat: s.presidentSeat, accept: false });
    expect(s.phase).toBe('legislativeChancellor');
    expect(s.vetoRefused).toBe(true);
    expect(mod.viewFor(s, chan).vetoRefused).toBe(true);
    expect(() => apply(s, { type: 'chancellorRequestVeto', bySeat: chan })).toThrow(/already refused/);
    s = apply(s, { type: 'chancellorEnact', bySeat: chan, enactIndex: 0 });
    expect(s.winnerTeam).toBe('fascist');
  });

  it('accepted veto at tracker 2 throws the country into chaos', () => {
    let s = vetoSession();
    s = {
      ...s,
      board: { ...s.board, electionTracker: 2 },
      policyDeck: ['liberal', ...s.policyDeck],
    };
    s = apply(s, { type: 'chancellorRequestVeto', bySeat: s.chancellorCandidateSeat! });
    s = apply(s, { type: 'presidentRespondVeto', bySeat: s.presidentSeat, accept: true });
    expect(s.phase).toBe('topDeckReveal');
    expect(s.board.liberalEnacted).toBe(1);
    expect(s.board.electionTracker).toBe(0);
    expect(s.lastElectedChancellor).toBeNull();
  });
});

describe('Secret Hitler — audit: reshuffle timing', () => {
  it('reshuffles at the end of a legislative session when fewer than 3 remain', () => {
    let s = started(5);
    // 4 cards left: drawing 3 leaves 1, so the session must end in a reshuffle.
    const discard = s.policyDeck.slice(4);
    s = { ...s, policyDeck: s.policyDeck.slice(0, 4), policyDiscard: discard };
    const pres = s.presidentSeat;
    const chan = (pres + 1) % 5;
    s = electGov(s, chan);
    expect(s.policyDeck.length).toBe(1);
    s = apply(s, { type: 'presidentDiscard', bySeat: pres, discardIndex: 0 });
    s = apply(s, { type: 'chancellorEnact', bySeat: chan, enactIndex: 0 });
    expect(s.policyDiscard).toHaveLength(0);
    expect(s.policyDeck.length).toBe(1 + discard.length + 2);
    const v = mod.viewFor(s, null);
    expect(v.policyDeckSize).toBe(s.policyDeck.length);
    expect(v.policyDiscardSize).toBe(0);
  });

  it('a chaos top-deck never draws from a 1-2 card stub and reshuffles after', () => {
    let s = started(5);
    s = {
      ...s,
      board: { ...s.board, electionTracker: 2 },
      policyDeck: ['liberal', 'fascist', 'fascist'],
      policyDiscard: ['fascist', 'fascist', 'liberal', 'fascist'],
    };
    const chan = (s.presidentSeat + 1) % 5;
    s = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor: chan });
    for (let i = 0; i < 5; i++) s = apply(s, { type: 'castVote', bySeat: i, vote: 'nein' });
    s = apply(s, { type: 'ackElectionReveal', bySeat: 0 });
    expect(s.phase).toBe('topDeckReveal');
    expect(s.lastEnactedPolicy).toBe('liberal');
    // 2 left after the top-deck → reshuffled with the 4 discards.
    expect(s.policyDeck).toHaveLength(6);
    expect(s.policyDiscard).toHaveLength(0);
  });
});

describe('Secret Hitler — audit: action validation', () => {
  it('rejects non-integer / out-of-range card indexes', () => {
    let s = started(5);
    const pres = s.presidentSeat;
    const chan = (pres + 1) % 5;
    s = electGov(s, chan);
    const bad = (discardIndex: number) =>
      apply(s, { type: 'presidentDiscard', bySeat: pres, discardIndex: discardIndex as 0 });
    expect(() => bad(1.5)).toThrow();
    expect(() => bad(-1)).toThrow();
    expect(() => bad(3)).toThrow();
    s = apply(s, { type: 'presidentDiscard', bySeat: pres, discardIndex: 0 });
    expect(() =>
      apply(s, { type: 'chancellorEnact', bySeat: chan, enactIndex: 0.5 as 0 }),
    ).toThrow();
    expect(() => apply(s, { type: 'chancellorEnact', bySeat: chan, enactIndex: 2 as 0 })).toThrow();
  });

  it('rejects malformed votes and bogus seats', () => {
    let s = started(5);
    s = apply(s, {
      type: 'nominateChancellor',
      bySeat: s.presidentSeat,
      chancellor: (s.presidentSeat + 1) % 5,
    });
    expect(() => apply(s, { type: 'castVote', bySeat: 0, vote: 'maybe' as 'ja' })).toThrow();
    expect(() => apply(s, { type: 'castVote', bySeat: 9, vote: 'ja' })).toThrow();
    expect(() => apply(s, { type: 'castVote', bySeat: 0.5, vote: 'ja' })).toThrow();
    s = apply(s, { type: 'castVote', bySeat: 0, vote: 'ja' });
    expect(() => apply(s, { type: 'castVote', bySeat: 0, vote: 'nein' })).toThrow(/already voted/);
  });

  it('acks need a real seat and the right phase', () => {
    const s = mod.createInitialState(configFor(5));
    expect(() => apply(s, { type: 'ackRoleReveal', bySeat: -1 })).toThrow();
    expect(() => apply(s, { type: 'ackElectionReveal', bySeat: 0 })).toThrow();
  });

  it('nothing is accepted after game over', () => {
    const s: ShPrivateState = { ...started(5), phase: 'gameOver', winnerTeam: 'liberal' };
    expect(() => apply(s, { type: 'ackPolicyReveal', bySeat: 0 })).toThrow(/over/);
  });

  it('dead players cannot vote, be nominated, or be targeted by powers', () => {
    let s = started(7);
    const pres = s.presidentSeat;
    const dead = (pres + 2) % 7;
    s = { ...s, seats: s.seats.map((x) => (x.index === dead ? { ...x, alive: false } : x)) };
    expect(() => apply(s, { type: 'nominateChancellor', bySeat: pres, chancellor: dead })).toThrow();
    const powerActions: Array<[ShPrivateState['phase'], ShAction]> = [
      ['execInvestigate', { type: 'execInvestigate', bySeat: pres, target: dead }],
      ['execExecute', { type: 'execExecute', bySeat: pres, target: dead }],
      ['execSpecialElection', { type: 'execSpecialElection', bySeat: pres, nextPresident: dead }],
    ];
    for (const [phase, action] of powerActions) {
      expect(() => apply({ ...s, phase }, action)).toThrow();
    }
    const live = (pres + 1) % 7;
    s = apply(s, { type: 'nominateChancellor', bySeat: pres, chancellor: live });
    expect(() => apply(s, { type: 'castVote', bySeat: dead, vote: 'ja' })).toThrow(/dead/);
    // The election completes once every LIVING seat has voted.
    for (const x of s.seats) {
      if (x.alive) s = apply(s, { type: 'castVote', bySeat: x.index, vote: 'ja' });
    }
    expect(s.phase).toBe('electionReveal');
  });

  it('only the president may use powers, and never on themselves', () => {
    const base = started(7);
    const pres = base.presidentSeat;
    const other = (pres + 1) % 7;
    const inv: ShPrivateState = { ...base, phase: 'execInvestigate' };
    expect(() => apply(inv, { type: 'execInvestigate', bySeat: other, target: pres })).toThrow();
    expect(() => apply(inv, { type: 'execInvestigate', bySeat: pres, target: pres })).toThrow();
    const exe: ShPrivateState = { ...base, phase: 'execExecute' };
    expect(() => apply(exe, { type: 'execExecute', bySeat: pres, target: pres })).toThrow();
    const sp: ShPrivateState = { ...base, phase: 'execSpecialElection' };
    expect(() =>
      apply(sp, { type: 'execSpecialElection', bySeat: pres, nextPresident: pres }),
    ).toThrow();
  });
});

describe('Secret Hitler — audit: special election & logs', () => {
  it("a failed special-election government returns rotation to the caller's left", () => {
    let s = started(8);
    const caller = s.presidentSeat;
    const chosen = (caller + 4) % 8;
    s = { ...s, phase: 'execSpecialElection', pendingExec: 'specialElection' };
    s = apply(s, { type: 'execSpecialElection', bySeat: caller, nextPresident: chosen });
    s = apply(s, { type: 'nominateChancellor', bySeat: chosen, chancellor: (chosen + 1) % 8 });
    for (let i = 0; i < 8; i++) s = apply(s, { type: 'castVote', bySeat: i, vote: 'nein' });
    s = apply(s, { type: 'ackElectionReveal', bySeat: 3 });
    expect(s.presidentSeat).toBe((caller + 1) % 8);
    expect(s.inSpecialElection).toBe(false);
    expect(s.board.electionTracker).toBe(1);
  });

  it('a special election may hand the presidency to a term-limited player', () => {
    let s = started(7);
    const caller = s.presidentSeat;
    const limited = (caller + 2) % 7;
    s = { ...s, phase: 'execSpecialElection', lastElectedChancellor: limited };
    s = apply(s, { type: 'execSpecialElection', bySeat: caller, nextPresident: limited });
    expect(s.presidentSeat).toBe(limited);
  });

  it("the election log records each seat's ballot once revealed", () => {
    let s = started(5);
    const chan = (s.presidentSeat + 1) % 5;
    s = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor: chan });
    const ballots = ['ja', 'nein', 'ja', 'nein', 'nein'] as const;
    ballots.forEach((vote, i) => {
      s = apply(s, { type: 'castVote', bySeat: i, vote });
    });
    s = apply(s, { type: 'ackElectionReveal', bySeat: 2 });
    const entry = s.log[s.log.length - 1]!;
    expect(entry.kind).toBe('electionResult');
    if (entry.kind === 'electionResult') {
      expect(entry.votes).toEqual([...ballots]);
      expect(entry.approved).toBe(false);
    }
  });
});

describe('Secret Hitler — audit: options', () => {
  it('rebalanced6p starts a 6p game with one fascist policy on the board', () => {
    const s = mod.createInitialState(configFor(6, 42, { rebalanced6p: true }));
    expect(s.board.fascistEnacted).toBe(1);
    expect(s.policyDeck).toHaveLength(16);
    expect(s.policyDeck.filter((p) => p === 'fascist')).toHaveLength(10);
  });

  it('rebalanced6p is ignored at other table sizes', () => {
    for (const n of [5, 7, 9]) {
      const s = mod.createInitialState(configFor(n, 42, { rebalanced6p: true }));
      expect(s.board.fascistEnacted).toBe(0);
      expect(s.policyDeck).toHaveLength(17);
    }
  });

  it('AI flags from the options are stored per seat (public)', () => {
    const s = mod.createInitialState(configFor(5, 42, { aiSeats: [3] }));
    expect(s.seats.map((x) => x.isAI)).toEqual([false, false, false, true, false]);
    expect(mod.viewFor(s, null).seats[3]!.isAI).toBe(true);
  });
});
