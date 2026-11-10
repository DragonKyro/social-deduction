import type { SeatIndex } from '@/engine/types';
import type {
  Card,
  LiarsPokerPrivateState,
  LiarsPokerPublicState,
  PublicPlayer,
  RevealRecord,
} from './state';

// ============================================================================
// Liar's Poker — the redaction chokepoint.
//
// Built field by field so new private fields can't leak by spreading.
//  - A normal seat's cards appear only in its own `yourHand`.
//  - A dummy's single card is the inversion: it appears in
//    `players[dummy].visibleHand` for every OTHER viewer (spectators
//    included), and never in the dummy's own view (`yourHand` is empty and
//    its own `visibleHand` is empty).
//  - Everyone's cards appear in `lastReveal.allHands` / `visibleHand` only
//    after a call resolves; `lastReveal` is cleared before the next deal.
//  - The seed / RNG cursor are never copied out.
// ============================================================================

export function aliveSeats(state: LiarsPokerPrivateState): SeatIndex[] {
  return state.seats.map((s) => s.index).filter((i) => !state.players[i]!.eliminated);
}

/** Cards in play this round (public: everyone knows how many were dealt). */
export function totalCardsInPlay(state: LiarsPokerPrivateState): number {
  return state.seats.reduce((n, s) => n + state.players[s.index]!.hand.length, 0);
}

export function awaitingAck(state: LiarsPokerPrivateState): SeatIndex[] {
  const alive = aliveSeats(state);
  switch (state.phase) {
    case 'dealPending':
      return alive.filter((i) => !state.players[i]!.dealAcked);
    case 'revealing':
      return alive.filter((i) => !state.revealAcked[i]);
    case 'roundOver':
      return alive.filter((i) => !state.roundOverAcked[i]);
    default:
      return [];
  }
}

const copyCards = (cs: readonly Card[]): Card[] => cs.map((c) => ({ rank: c.rank, suit: c.suit }));

function copyReveal(r: RevealRecord): RevealRecord {
  const allHands: Record<SeatIndex, Card[]> = {};
  for (const k of Object.keys(r.allHands)) allHands[Number(k)] = copyCards(r.allHands[Number(k)]!);
  return { ...r, claim: { ...r.claim }, allHands };
}

export function viewFor(state: LiarsPokerPrivateState, seat: SeatIndex | null): LiarsPokerPublicState {
  const viewer = seat !== null && state.players[seat] !== undefined ? seat : null;
  const showReveal =
    state.phase === 'revealing' || state.phase === 'roundOver' || state.phase === 'gameOver';
  const reveal = showReveal ? state.lastReveal : null;

  const players: PublicPlayer[] = state.seats.map((s) => {
    const p = state.players[s.index]!;
    let visibleHand: Card[] = [];
    if (reveal) {
      visibleHand = copyCards(reveal.allHands[s.index] ?? []);
    } else if (p.isDummy && !p.eliminated && viewer !== s.index) {
      visibleHand = copyCards(p.hand);
    }
    return {
      index: s.index,
      name: s.name,
      cardCount: p.cardCount,
      handSize: p.hand.length,
      isDummy: p.isDummy,
      eliminated: p.eliminated,
      dealAcked: p.dealAcked,
      visibleHand,
    };
  });

  let yourHand: Card[] = [];
  if (viewer !== null) {
    const me = state.players[viewer]!;
    if (!me.isDummy) yourHand = copyCards(me.hand);
  }

  const waiting = awaitingAck(state);
  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({ index: s.index, name: s.name })),
    players,
    currentSeat: state.currentSeat,
    roundLeader: state.roundLeader,
    roundNumber: state.roundNumber,
    cardsPerPlayer: state.cardsPerPlayer,
    dummyHand: state.dummyHand,
    currentClaim: state.currentClaim ? { ...state.currentClaim } : null,
    currentBidder: state.currentBidder,
    roundClaims: state.roundClaims.map((c) => ({ seat: c.seat, claim: { ...c.claim } })),
    totalCards: totalCardsInPlay(state),
    lastReveal: reveal ? copyReveal(reveal) : null,
    history: state.history.map((h) => ({
      roundNumber: h.roundNumber,
      reveal: copyReveal(h.reveal),
      eliminatedThisRound: h.eliminatedThisRound.slice(),
    })),
    matchWinners: state.matchWinners.slice(),
    awaitingAck: waiting,
    yourSeat: viewer,
    yourHand,
    yourAckPending: viewer !== null && waiting.includes(viewer),
  };
}
