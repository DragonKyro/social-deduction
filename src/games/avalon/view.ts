import type { SeatIndex } from '@/engine/types';
import { ROLES } from './roles';
import type { AvalonPrivateState, AvalonPublicState, AvalonRoleId } from './state';

const ROLE_ORDER = Object.keys(ROLES) as AvalonRoleId[];

/** The dealt roles as a multiset in canonical role order (seat-independent). */
export function rolesInPlay(state: AvalonPrivateState): AvalonRoleId[] {
  return state.seats
    .map((s) => s.role)
    .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
}

// ============================================================================
// Avalon — redaction chokepoint
//
// `viewFor(state, seat)` is the ONLY way host state leaves the host. It lives
// in its own file so the AI can consume exactly the same view a human at that
// seat gets (ai.ts imports this; module.ts re-exports it as `viewFor`).
//
// Rules:
//   - Everything outside the `your*` slots is identical for every seat and for
//     spectators (module.test.ts asserts this).
//   - Roles / alignments: own seat only (`yourRole`), everyone at gameOver.
//   - Role knowledge: the seat's own row of the knowledge table, copied.
//   - Team votes: hidden (`voteApprove: null`) while the table is voting; only
//     `hasVoted` is public. Revealed together once the last vote is in.
//   - Quest cards: anonymous. Only per-quest fail COUNTS are public; the only
//     card value in any view is the viewer's own (`yourQuestCard`).
//   - Never copied: `seed` (the deal is a function of it), per-seat `role` /
//     `alignment` / `questCard`, the optional-module private reveals of other
//     seats.
// ============================================================================

export function viewFor(state: AvalonPrivateState, seatArg: SeatIndex | null): AvalonPublicState {
  // Anything that isn't a real seat index is a spectator.
  const seat =
    seatArg !== null && Number.isInteger(seatArg) && seatArg >= 0 && seatArg < state.seats.length
      ? seatArg
      : null;
  const own = seat === null ? null : state.seats[seat]!;
  const gameOver = state.phase === 'gameOver';
  const voting = state.phase === 'teamVote';
  const playing = state.phase === 'questExecution';

  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({
      index: s.index,
      name: s.name,
      voteApprove: voting ? null : s.voteApprove,
      hasVoted: s.voteApprove !== null,
      hasPlayedQuestCard: playing && state.proposedTeam.includes(s.index) && s.questCard !== null,
      isCurrentLeader: s.index === state.currentLeaderSeat,
      isOnProposedTeam: state.proposedTeam.includes(s.index),
      hasAckedSetup: !!state.setupAcked[s.index],
      revealedRole: gameOver ? s.role : null,
      revealedAlignment: gameOver ? s.alignment : null,
    })),
    currentQuestNumber: state.currentQuestNumber,
    rolesInPlay: rolesInPlay(state),
    questTrack: state.questTrack.map((q) => ({ teamSize: q.teamSize, failsRequired: q.failsRequired })),
    questHistory: state.questHistory.map((q) => ({
      questNumber: q.questNumber,
      teamSize: q.teamSize,
      failsRequired: q.failsRequired,
      team: q.team.slice(),
      failCount: q.failCount,
      result: q.result,
    })),
    proposalHistory: state.proposalHistory.map((p) => ({
      questNumber: p.questNumber,
      attempt: p.attempt,
      leader: p.leader,
      team: p.team.slice(),
      votes: p.votes.slice(),
      approved: p.approved,
    })),
    failedProposalsThisQuest: state.failedProposalsThisQuest,
    proposedTeam: state.proposedTeam.slice(),
    currentLeaderSeat: state.currentLeaderSeat,
    winnerTeam: state.winnerTeam,
    questCardsSubmitted: playing
      ? state.proposedTeam.filter((s) => state.seats[s]?.questCard !== null).length
      : 0,
    assassinationTarget: state.assassinationTarget,
    // Optional modules are scaffolded only; the engine never enables them, so
    // these stay null. Kept in the shape for forward compatibility.
    ladyOfTheLake: state.ladyOfTheLake
      ? {
          enabled: true,
          holder: state.ladyOfTheLake.holder,
          pastHolders: state.ladyOfTheLake.pastHolders.slice(),
        }
      : null,
    excalibur: state.excalibur
      ? {
          enabled: state.excalibur.enabled,
          holderSeat: state.excalibur.holderSeat,
          usedOnSeat: state.excalibur.usedOnSeat,
        }
      : null,
    lancelotSwapsApplied: state.lancelotSwapDeck ? state.lancelotSwapsApplied : null,

    yourSeat: seat,
    yourRole: own?.role ?? null,
    yourAlignment: own?.alignment ?? null,
    yourRoleKnowledge:
      seat === null ? [] : (state.roleKnowledge[seat] ?? []).map((k) => ({ seat: k.seat, label: k.label })),
    yourVote: own?.voteApprove ?? null,
    yourQuestCard: own?.questCard ?? null,
    yourLadyOfTheLakeReveals:
      seat === null || !state.ladyOfTheLake
        ? []
        : state.ladyOfTheLake.privateReveals
            .filter((r) => r.by === seat)
            .map((r) => ({ target: r.target, alignment: r.alignment })),
  };
}
