import type { SeatIndex } from '@/engine/types';
import type {
  DieFace,
  LiarsDicePrivateState,
  LiarsDicePublicState,
  PublicPlayer,
} from './state';

// ============================================================================
// Liar's Dice — the redaction chokepoint.
//
// Builds the public view field by field (never by spreading private state),
// so a new private field can't leak by accident. Live dice appear only in
// `yourDice` for the owning seat. `lastReveal` (which carries every seat's
// dice) is only ever populated after a call resolves and is cleared before
// the next roll, so fresh dice never ride along with the old recap. The RNG
// seed / cursor are never copied out.
// ============================================================================

export function aliveSeats(state: LiarsDicePrivateState): SeatIndex[] {
  return state.seats.map((s) => s.index).filter((i) => !state.players[i]!.eliminated);
}

export function totalDiceInPlay(state: LiarsDicePrivateState): number {
  return aliveSeats(state).reduce((sum, i) => sum + state.players[i]!.diceCount, 0);
}

export function awaitingAck(state: LiarsDicePrivateState): SeatIndex[] {
  const alive = aliveSeats(state);
  switch (state.phase) {
    case 'rollPending':
      return alive.filter((i) => !state.players[i]!.rollAcked);
    case 'revealing':
      return alive.filter((i) => !state.revealAcked[i]);
    case 'roundOver':
      return alive.filter((i) => !state.roundOverAcked[i]);
    default:
      return [];
  }
}

function cloneDice(d: Record<SeatIndex, DieFace[]>): Record<SeatIndex, DieFace[]> {
  const out: Record<SeatIndex, DieFace[]> = {};
  for (const k of Object.keys(d)) out[Number(k)] = d[Number(k)]!.slice();
  return out;
}

export function viewFor(state: LiarsDicePrivateState, seat: SeatIndex | null): LiarsDicePublicState {
  const players: PublicPlayer[] = state.seats.map((s) => {
    const p = state.players[s.index]!;
    return {
      index: s.index,
      name: s.name,
      diceCount: p.diceCount,
      eliminated: p.eliminated,
      rollAcked: p.rollAcked,
    };
  });

  const validSeat = seat !== null && state.players[seat] !== undefined ? seat : null;
  const yourDice: DieFace[] =
    validSeat !== null ? state.players[validSeat]!.dice.slice().sort((a, b) => a - b) : [];

  const waiting = awaitingAck(state);
  const showReveal =
    state.phase === 'revealing' || state.phase === 'roundOver' || state.phase === 'gameOver';
  const r = showReveal ? state.lastReveal : null;

  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({ index: s.index, name: s.name })),
    players,
    currentSeat: state.currentSeat,
    roundLeader: state.roundLeader,
    roundNumber: state.roundNumber,
    wildOnes: state.wildOnes,
    spotOn: state.spotOn,
    startingDice: state.startingDice,
    currentBid: state.currentBid ? { ...state.currentBid } : null,
    currentBidder: state.currentBidder,
    roundBids: state.roundBids.map((b) => ({ seat: b.seat, bid: { ...b.bid } })),
    totalDice: totalDiceInPlay(state),
    lastReveal: r ? { ...r, bid: { ...r.bid }, allDice: cloneDice(r.allDice) } : null,
    history: state.history.map((h) => ({
      roundNumber: h.roundNumber,
      reveal: { ...h.reveal, bid: { ...h.reveal.bid }, allDice: cloneDice(h.reveal.allDice) },
      eliminatedThisRound: h.eliminatedThisRound.slice(),
    })),
    matchWinners: state.matchWinners.slice(),
    awaitingAck: waiting,
    yourSeat: validSeat,
    yourDice,
    yourAckPending: validSeat !== null && waiting.includes(validSeat),
  };
}
