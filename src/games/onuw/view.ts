import type { SeatIndex } from '@/engine/types';
import { isLoneWolf, wolvesVisibleTo } from './night';
import { ROLES, rolesSortedByWakeOrder } from './roles';
import type { OnuwPrivateState, OnuwPublicState, OnuwYourNightStep } from './state';

// ============================================================================
// Redaction chokepoint
//
// A seat sees: its own dealt card, its own night observations, its own vote,
// and — only while it is that seat's turn — what it is being asked to do.
// Nothing about the night schedule (which roles are awake, which steps are
// empty because the card is in the center, how far along the night is) is
// public: "who is awake right now" IS the hidden information.
//
// Public to everyone: names, who has acknowledged their role, who has voted
// (not for whom), cards flipped face-up by the Revealer (from daybreak), and
// — after the vote — everything.
//
// `seat === null` is a spectator: it gets only the public part.
// ============================================================================

export function isValidSeat(state: OnuwPrivateState, seat: unknown): seat is SeatIndex {
  return typeof seat === 'number' && Number.isInteger(seat) && seat >= 0 && seat < state.seats.length;
}

export function currentStep(state: OnuwPrivateState) {
  return state.phase === 'night' ? state.nightSchedule[state.nightStepIndex] ?? null : null;
}

export function hasActedThisStep(state: OnuwPrivateState, seat: SeatIndex): boolean {
  const step = currentStep(state);
  if (!step) return false;
  return (state.nightStepAcks[step.stepIndex] ?? []).includes(seat);
}

// Valid Alpha Wolf targets: any other player the Alpha didn't see as a wolf.
export function alphaTargets(state: OnuwPrivateState, seat: SeatIndex): SeatIndex[] {
  const wolves = new Set(wolvesVisibleTo(state, seat));
  return state.seats.map((s) => s.index).filter((i) => i !== seat && !wolves.has(i));
}

export function yourNightStep(state: OnuwPrivateState, seat: SeatIndex): OnuwYourNightStep | null {
  const step = currentStep(state);
  if (!step || !step.seats.includes(seat) || hasActedThisStep(state, seat)) return null;
  const spec = ROLES[step.role];
  const canPass =
    !spec.mandatory || (step.role === 'alphaWolf' && alphaTargets(state, seat).length === 0);
  return {
    role: step.role,
    asDoppelganger: step.role !== 'doppelganger' && state.doppelCopy?.seat === seat,
    loneWolf: step.role === 'werewolf' && isLoneWolf(state, seat),
    looked: step.role === 'paranormalInvestigator' ? (state.piLooks[seat] ?? []).slice() : [],
    centerPeeked: step.role === 'witch' ? (state.witchPeeks[seat] ?? null) : null,
    canPass: canPass && !(step.role === 'witch' && state.witchPeeks[seat] !== undefined),
  };
}

export function viewFor(state: OnuwPrivateState, seat: SeatIndex | null): OnuwPublicState {
  const isOver = state.phase === 'resolution' || state.phase === 'gameOver';
  const isDawn = state.phase === 'day' || state.phase === 'voting' || isOver;
  const me = isValidSeat(state, seat) ? state.seats[seat]! : null;
  const flipped = new Map(isDawn ? state.revealed.map((r) => [r.seat, r.card] as const) : []);
  const winners = new Set(isOver ? state.winners : []);
  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({
      index: s.index,
      name: s.name,
      hasAckedSetup: !!state.setupAcked[s.index],
      hasVoted: s.voteTarget !== null,
      voteTarget: isOver ? s.voteTarget : null,
      votesReceived: isOver ? (state.voteTally[s.index] ?? 0) : 0,
      killed: isOver ? s.killed : false,
      won: winners.has(s.index),
      revealedRole: isOver ? s.finalRole : null,
      revealedCard: isOver ? s.finalCard : null,
      flippedCard: flipped.get(s.index) ?? null,
      artifacts: s.artifacts.slice(),
    })),
    centerCards: state.centerCards.map((c) => ({
      index: c.index,
      revealedRole: isOver ? c.role : null,
      revealedCard: isOver ? c.card : null,
    })),
    // Canonical order, so the list's order can never correlate with the deal.
    rolePool: rolesSortedByWakeOrder(state.rolePool),
    dayDurationSec: state.dayDurationSec,
    yourSeat: me ? me.index : null,
    yourDealtRole: me ? me.dealtRole : null,
    yourFinalRole: me && isOver ? me.finalRole : null,
    yourObservations: me ? me.observations.map((o) => ({ ...o, entries: o.entries.map((e) => ({ ...e })) })) : [],
    yourVoteTarget: me ? me.voteTarget : null,
    yourNightStep: me ? yourNightStep(state, me.index) : null,
    winners: isOver ? state.winners.slice() : [],
    winningTeams: isOver ? state.winningTeams.slice() : [],
    killedSeats: isOver ? state.killedSeats.slice() : [],
    voteTally: isOver ? { ...state.voteTally } : {},
    alphaCenter: isOver ? state.alphaCenter.map((c) => c.card) : [],
  };
}
