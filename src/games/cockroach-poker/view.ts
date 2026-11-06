import type { SeatIndex } from '@/engine/types';
import type {
  CockroachPokerPrivateState,
  CockroachPokerPublicState,
  Creature,
  PassState,
  PublicPlayer,
  RevealRecord,
} from './state';

// ============================================================================
// Cockroach Poker — the redaction chokepoint.
//
// Built field by field so new private fields can't leak by spreading.
//  - Hands: only `yourHand` for the owning seat; everyone else gets sizes.
//  - In-transit card: `yourPeekedCard` only for seats in `pass.seenBy`
//    (the original sender + every peeker). The claim chain, holder and who
//    has seen it are public, as at a real table.
//  - `lastReveal` only exists once the card has been flipped, and is
//    cleared before the next pass.
//  - The seed / RNG cursor are never copied out.
// ============================================================================

export function aliveSeats(state: CockroachPokerPrivateState): SeatIndex[] {
  return state.seats.map((s) => s.index).filter((i) => !state.players[i]!.lost);
}

/** Seats the holder could legally pass the card on to. */
export function passTargets(state: CockroachPokerPrivateState, pass: PassState): SeatIndex[] {
  return aliveSeats(state).filter((i) => i !== pass.holder && !pass.seenBy.includes(i));
}

export function awaitingAck(state: CockroachPokerPrivateState): SeatIndex[] {
  const alive = aliveSeats(state);
  if (state.phase === 'dealPending') return alive.filter((i) => !state.players[i]!.dealAcked);
  if (state.phase === 'revealing') return alive.filter((i) => !state.revealAcked[i]);
  return [];
}

function copyReveal(r: RevealRecord): RevealRecord {
  return {
    claim: r.claim,
    claimant: r.claimant,
    decider: r.decider,
    call: r.call,
    callerWon: r.callerWon,
    receiver: r.receiver,
    card: r.card,
    chain: r.chain.map((h) => ({ ...h })),
    seenBy: r.seenBy.slice(),
  };
}

export function viewFor(
  state: CockroachPokerPrivateState,
  seat: SeatIndex | null,
): CockroachPokerPublicState {
  const viewer = seat !== null && state.players[seat] !== undefined ? seat : null;
  const players: PublicPlayer[] = state.seats.map((s) => {
    const p = state.players[s.index]!;
    return {
      index: s.index,
      name: s.name,
      row: { ...p.row },
      handSize: p.hand.length,
      lost: p.lost,
      dealAcked: p.dealAcked,
    };
  });

  const pass = state.phase === 'decide' ? state.pass : null;
  const yourPeekedCard =
    viewer !== null && pass !== null && pass.seenBy.includes(viewer) ? pass.card : null;
  const reveal =
    state.phase === 'revealing' || state.phase === 'gameOver' ? state.lastReveal : null;
  const waiting = awaitingAck(state);

  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({ index: s.index, name: s.name })),
    players,
    currentSeat: state.currentSeat,
    turnNumber: state.turnNumber,
    passHolder: pass?.holder ?? null,
    passOriginalSender: pass?.originalSender ?? null,
    passClaim: pass?.claim ?? null,
    passHolderPeeked: pass?.holderPeeked ?? false,
    passChain: pass ? pass.chain.map((h) => ({ ...h })) : [],
    passSeenBy: pass ? pass.seenBy.slice() : [],
    lastReveal: reveal ? copyReveal(reveal) : null,
    matchWinners: state.matchWinners.slice(),
    loserSeat: state.loserSeat,
    lossReason: state.lossReason,
    awaitingAck: waiting,
    yourSeat: viewer,
    yourHand: viewer !== null ? (state.players[viewer]!.hand.slice() as Creature[]) : [],
    yourPeekedCard,
    yourAckPending: viewer !== null && waiting.includes(viewer),
  };
}
