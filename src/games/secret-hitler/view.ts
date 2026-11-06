import type { SeatIndex } from '@/engine/types';
import { buildPartyKnowledge } from './setup';
import { fascistTrack } from './tracks';
import type { ShPolicy, ShPrivateState, ShPublicSeatState, ShPublicState } from './state';

// ============================================================================
// Redaction chokepoint.
//
// Builds the view a given seat is allowed to see. Every field is copied
// explicitly (no spreads of private objects) so a new private field can't
// leak by accident. `seat === null` is the spectator view: anyone can open
// it, so it carries no role, hand, peek or investigation result until the
// game is over.
//
// The AI decides from this view too (see ai.ts), so what the AI knows is
// exactly what a human in that seat would see.
// ============================================================================

export function viewFor(state: ShPrivateState, seat: SeatIndex | null): ShPublicState {
  const own =
    seat !== null && Number.isInteger(seat) ? (state.seats[seat] ?? null) : null;
  const viewer: SeatIndex | null = own ? own.index : null;
  const gameOver = state.phase === 'gameOver';
  // Votes are simultaneous: hide every ballot until the last one is cast.
  const votingOpen = state.phase === 'electionVote';

  const partyKnowledge =
    viewer !== null
      ? (buildPartyKnowledge(state.seats)[viewer] ?? []).map((k) => ({ seat: k.seat, role: k.role }))
      : [];

  const inChancellorStep =
    state.phase === 'legislativeChancellor' || state.phase === 'vetoRequested';

  let yourLegislativeHand: ShPolicy[] | null = null;
  if (viewer !== null) {
    if (state.phase === 'legislativePresident' && viewer === state.presidentSeat) {
      yourLegislativeHand = state.legislativeHand.slice();
    } else if (inChancellorStep && viewer === state.chancellorCandidateSeat) {
      yourLegislativeHand = state.legislativeHand.slice();
    }
  }

  // The president saw these cards a moment ago (they are the 3 drawn minus
  // the one discarded); surfacing them is a memory aid, not new info.
  const yourPassedPolicies =
    viewer !== null && inChancellorStep && viewer === state.presidentSeat
      ? state.legislativeHand.slice()
      : null;

  const yourInvestigations =
    viewer === null
      ? []
      : state.investigations
          .filter((inv) => inv.by === viewer)
          .map((inv) => ({ target: inv.target, party: inv.party }));

  const yourPeek =
    viewer !== null &&
    state.phase === 'execPeek' &&
    state.pendingPeek !== null &&
    state.pendingPeek.by === viewer
      ? state.pendingPeek.policies.slice()
      : null;

  const yourPendingInvestigationResult =
    viewer !== null &&
    state.phase === 'execInvestigateReveal' &&
    state.pendingInvestigation !== null &&
    state.pendingInvestigation.by === viewer
      ? { target: state.pendingInvestigation.target, party: state.pendingInvestigation.party }
      : null;

  const seats: ShPublicSeatState[] = state.seats.map((s) => ({
    index: s.index,
    name: s.name,
    isAI: s.isAI,
    alive: s.alive,
    voteCast: votingOpen ? null : s.voteCast,
    hasVoted: s.alive && s.voteCast !== null,
    hasAckedSetup: !!state.setupAcked[s.index],
    investigated: s.hasBeenInvestigated,
    revealedRole: gameOver ? s.role : null,
  }));

  return {
    phase: state.phase,
    seats,
    board: {
      liberalEnacted: state.board.liberalEnacted,
      fascistEnacted: state.board.fascistEnacted,
      electionTracker: state.board.electionTracker,
      vetoUnlocked: state.board.vetoUnlocked,
    },
    trackPowers: fascistTrack(state.seats.length).slice(),
    presidentSeat: state.presidentSeat,
    chancellorCandidateSeat: state.chancellorCandidateSeat,
    lastElectedPresident: state.lastElectedPresident,
    lastElectedChancellor: state.lastElectedChancellor,
    inSpecialElection: state.inSpecialElection,
    vetoRefused: state.vetoRefused,
    policyDeckSize: state.policyDeck.length,
    policyDiscardSize: state.policyDiscard.length,
    pendingExec: state.pendingExec,
    lastEnactedPolicy: state.lastEnactedPolicy,
    lastEnactedViaTopDeck: state.lastEnactedViaTopDeck,
    winnerTeam: state.winnerTeam,
    winReason: state.winReason,
    // Log entries are all public facts; copy so callers can't mutate host state.
    log: state.log.map((e) =>
      e.kind === 'electionResult' ? { ...e, votes: e.votes.slice() } : { ...e },
    ),
    yourSeat: viewer,
    yourRole: own?.role ?? null,
    yourParty: own?.party ?? null,
    yourPartyKnowledge: partyKnowledge,
    yourLegislativeHand,
    yourPassedPolicies,
    yourInvestigations,
    yourPeek,
    yourPendingInvestigationResult,
  };
}
