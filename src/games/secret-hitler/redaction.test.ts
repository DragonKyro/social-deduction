import { describe, expect, it } from 'vitest';
import type { SeatIndex } from '@/engine/types';
import { secretHitlerModule as mod } from './module';
import type { ShAction } from './actions';
import type { ShPrivateState, ShPublicState } from './state';
import { allKeys, configFor, knownRoleSeats, permuteHidden, playSelf } from './testkit';

// ============================================================================
// Hidden-information audit.
//
// Three independent checks, run over every state visited in several AI
// self-play games (all phases, 5-10 players) plus hand-built edge states:
//   1. Structural: a view never carries private keys (seed, deck, hand,
//      roles, ...) and only carries `your*` secrets for the entitled seat.
//   2. String scan: the serialized view never contains the seed or the
//      token "hitler" unless the viewer legitimately knows who Hitler is.
//   3. Non-interference: re-randomising everything a seat may NOT know
//      leaves that seat's view byte-for-byte identical, and leaves the AI's
//      decision for that seat unchanged.
// ============================================================================

const SEED = 1_987_654_321; // distinctive, so a leaked seed is greppable
const FORBIDDEN_KEYS = [
  'seed',
  'policyDeck',
  'policyDiscard',
  'legislativeHand',
  'pendingPeek',
  'pendingInvestigation',
  'investigations',
  'reshuffleCount',
  'regularRotationSeat',
  'setupAcked',
  'role',
  'party',
  'hasBeenInvestigated',
];
// `role` / `party` may appear only inside these containers.
const ROLE_OK_IN = new Set(['yourPartyKnowledge']);
const PARTY_OK_IN = new Set(['yourInvestigations', 'yourPendingInvestigationResult']);

function viewers(state: ShPrivateState): Array<SeatIndex | null> {
  return [null, ...state.seats.map((s) => s.index)];
}

function keysOutside(view: ShPublicState): Set<string> {
  // Keys anywhere in the view except inside the containers allowed to hold
  // role / party facts.
  const stripped: Record<string, unknown> = { ...view };
  for (const k of [...ROLE_OK_IN, ...PARTY_OK_IN]) delete stripped[k];
  return allKeys(stripped);
}

function entitledToHand(state: ShPrivateState, seat: SeatIndex | null): boolean {
  if (seat === null) return false;
  if (state.phase === 'legislativePresident') return seat === state.presidentSeat;
  if (state.phase === 'legislativeChancellor' || state.phase === 'vetoRequested') {
    return seat === state.chancellorCandidateSeat;
  }
  return false;
}

function expectedKnowledge(state: ShPrivateState, seat: SeatIndex) {
  const me = state.seats[seat]!;
  const n = state.seats.length;
  if (me.role === 'liberal') return [];
  if (me.role === 'hitler' && n >= 7) return [];
  return state.seats
    .filter((s) => s.index !== seat && s.role !== 'liberal')
    .map((s) => ({ seat: s.index, role: s.role }))
    .sort((a, b) => a.seat - b.seat);
}

function auditState(state: ShPrivateState, salt: number) {
  const gameOver = state.phase === 'gameOver';
  for (const seat of viewers(state)) {
    const view = mod.viewFor(state, seat);
    const json = JSON.stringify(view);
    const where = `phase=${state.phase} seat=${seat}`;

    // 1. Structural.
    for (const k of FORBIDDEN_KEYS) {
      expect(keysOutside(view).has(k), `${where}: leaks key "${k}"`).toBe(false);
    }
    expect(json.includes(String(SEED)), `${where}: leaks the seed`).toBe(false);
    if (!gameOver) {
      expect(view.seats.every((s) => s.revealedRole === null), `${where}: revealedRole`).toBe(true);
    }
    if (state.phase === 'electionVote') {
      expect(view.seats.every((s) => s.voteCast === null), `${where}: open ballots`).toBe(true);
    }
    expect(view.yourLegislativeHand !== null, `${where}: hand`).toBe(entitledToHand(state, seat));
    const passedOk =
      seat !== null &&
      seat === state.presidentSeat &&
      (state.phase === 'legislativeChancellor' || state.phase === 'vetoRequested');
    expect(view.yourPassedPolicies !== null, `${where}: passed`).toBe(passedOk);
    const peekOk = seat !== null && state.phase === 'execPeek' && state.pendingPeek?.by === seat;
    expect(view.yourPeek !== null, `${where}: peek`).toBe(peekOk);
    const invOk =
      seat !== null &&
      state.phase === 'execInvestigateReveal' &&
      state.pendingInvestigation?.by === seat;
    expect(view.yourPendingInvestigationResult !== null, `${where}: investigation`).toBe(invOk);
    expect(view.yourInvestigations).toEqual(
      seat === null
        ? []
        : state.investigations
            .filter((i) => i.by === seat)
            .map((i) => ({ target: i.target, party: i.party })),
    );
    if (seat === null) {
      expect(view.yourRole).toBeNull();
      expect(view.yourParty).toBeNull();
      expect(view.yourPartyKnowledge).toEqual([]);
    } else {
      expect(view.yourRole).toBe(state.seats[seat]!.role);
      expect([...view.yourPartyKnowledge].sort((a, b) => a.seat - b.seat)).toEqual(
        expectedKnowledge(state, seat),
      );
    }

    // 2. String scan for the one role token that is unambiguous in JSON.
    const knowsHitler =
      gameOver ||
      (seat !== null &&
        [...knownRoleSeats(state, seat)].some((s) => state.seats[s]!.role === 'hitler'));
    expect(json.includes('"hitler"'), `${where}: mentions Hitler`).toBe(knowsHitler);

    // 3. Non-interference (view + AI decision).
    for (let p = 0; p < 2; p++) {
      const permuted = permuteHidden(state, seat, salt * 7 + p * 101 + (seat ?? 99));
      expect(JSON.stringify(mod.viewFor(permuted, seat)), `${where}: view depends on hidden info`).toBe(json);
      if (seat !== null) {
        expect(
          mod.aiChooseAction!(permuted, seat),
          `${where}: AI decision depends on hidden info`,
        ).toEqual(mod.aiChooseAction!(state, seat));
      }
    }
  }
}

describe('Secret Hitler — redaction audit over self-play', () => {
  for (const n of [5, 6, 7, 8, 9, 10]) {
    it(`${n} players: every visited state is redacted correctly for every seat`, () => {
      const phases = new Set<string>();
      for (const seed of [SEED, SEED + 1]) {
        let i = 0;
        playSelf(configFor(n, seed, { aiSeats: 'all' }), {
          visit: (s) => {
            phases.add(s.phase);
            auditState(s, i++);
          },
        });
      }
      // The audit must actually have exercised the secret-bearing phases.
      for (const p of ['setup', 'electionVote', 'legislativePresident', 'legislativeChancellor', 'gameOver']) {
        expect(phases.has(p), `phase ${p} visited`).toBe(true);
      }
    });
  }
});

describe('Secret Hitler — redaction of hand-built edge states', () => {
  function apply(s: ShPrivateState, a: ShAction) {
    return mod.applyAction(s, a, '');
  }
  function started(n: number): ShPrivateState {
    let s = mod.createInitialState(configFor(n, SEED));
    for (let i = 0; i < n; i++) s = apply(s, { type: 'ackRoleReveal', bySeat: i });
    return s;
  }

  it('veto request, peek, and investigation reveal are all redacted', () => {
    const base = started(7);
    const pres = base.presidentSeat;
    const chan = (pres + 1) % 7;
    const vetoState: ShPrivateState = {
      ...base,
      phase: 'vetoRequested',
      board: { ...base.board, fascistEnacted: 5, vetoUnlocked: true },
      chancellorCandidateSeat: chan,
      legislativeHand: ['fascist', 'liberal'],
    };
    auditState(vetoState, 1);
    expect(mod.viewFor(vetoState, pres).yourPassedPolicies).toEqual(['fascist', 'liberal']);
    expect(mod.viewFor(vetoState, pres).yourLegislativeHand).toBeNull();

    const peekState = apply(
      { ...base, phase: 'policyReveal', pendingExec: 'peekTop3', lastEnactedPolicy: 'fascist' },
      { type: 'ackPolicyReveal', bySeat: pres },
    );
    expect(peekState.phase).toBe('execPeek');
    auditState(peekState, 2);

    const target = (pres + 2) % 7;
    const invState = apply(
      { ...base, phase: 'execInvestigate', pendingExec: 'investigate' },
      { type: 'execInvestigate', bySeat: pres, target },
    );
    auditState(invState, 3);
    // Everyone learns WHO was investigated, never the result.
    for (const seat of viewers(invState)) {
      const v = mod.viewFor(invState, seat);
      expect(v.seats[target]!.investigated).toBe(true);
      if (seat !== pres) expect(v.yourPendingInvestigationResult).toBeNull();
    }
  });

  it('mid-vote: who has voted is public, how they voted is not', () => {
    let s = started(5);
    const chan = (s.presidentSeat + 1) % 5;
    s = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor: chan });
    s = apply(s, { type: 'castVote', bySeat: 0, vote: 'nein' });
    s = apply(s, { type: 'castVote', bySeat: 3, vote: 'ja' });
    auditState(s, 4);
    for (const seat of viewers(s)) {
      const v = mod.viewFor(s, seat);
      expect(v.seats.map((x) => x.hasVoted)).toEqual([true, false, false, true, false]);
      expect(v.seats.every((x) => x.voteCast === null)).toBe(true);
    }
    for (const i of [1, 2, 4]) s = apply(s, { type: 'castVote', bySeat: i, vote: 'ja' });
    expect(s.phase).toBe('electionReveal');
    // Revealed together, to everyone, including spectators.
    expect(mod.viewFor(s, null).seats.map((x) => x.voteCast)).toEqual(['nein', 'ja', 'ja', 'ja', 'ja']);
  });

  it('dead seats keep their role hidden until game over', () => {
    const base = started(7);
    const pres = base.presidentSeat;
    const victim = base.seats.find((x) => x.role !== 'hitler' && x.index !== pres)!.index;
    const s = apply(
      { ...base, phase: 'execExecute', pendingExec: 'execute' },
      { type: 'execExecute', bySeat: pres, target: victim },
    );
    expect(s.seats[victim]!.alive).toBe(false);
    auditState(s, 5);
    expect(mod.viewFor(s, null).seats[victim]!.revealedRole).toBeNull();
  });

  it('game over reveals every role to everyone, spectators included', () => {
    const base = started(6);
    const s: ShPrivateState = { ...base, phase: 'gameOver', winnerTeam: 'liberal', winReason: 'liberalTrack' };
    auditState(s, 6);
    expect(mod.viewFor(s, null).seats.map((x) => x.revealedRole)).toEqual(
      s.seats.map((x) => x.role),
    );
  });

  it('a view for an out-of-range seat is a spectator view', () => {
    const s = started(5);
    const v = mod.viewFor(s, 17);
    expect(v.yourSeat).toBeNull();
    expect(v.yourRole).toBeNull();
    expect(JSON.stringify(v)).toBe(JSON.stringify(mod.viewFor(s, null)));
  });
});
