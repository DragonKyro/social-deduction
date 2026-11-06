import type { SeatIndex } from '@/engine/types';
import type { PublicPlayer, RoundSummary, SkullPrivateState, SkullPublicState } from './state';

// ============================================================================
// Skull — the redaction chokepoint.
//
// Built field by field (never by spreading private state). Never included:
// another seat's `stack` contents or `remaining` split, the identity of a
// disk someone else lost, `seed`, `rngCursor`.
// ============================================================================

function redactRound(r: RoundSummary, me: SeatIndex | null): RoundSummary {
  return {
    roundNumber: r.roundNumber,
    challenger: r.challenger,
    bid: r.bid,
    success: r.success,
    flips: r.flips.map((f) => ({ seat: f.seat, disk: f.disk })),
    skullOwner: r.skullOwner,
    loserSeat: r.loserSeat,
    // Discarded face-down: only the loser knows what it was.
    diskLost: me !== null && r.loserSeat === me ? r.diskLost : null,
    lossMethod: r.lossMethod,
    eliminatedSeat: r.eliminatedSeat,
    nextLeader: r.nextLeader,
  };
}

export function pendingAcks(state: SkullPrivateState): SeatIndex[] {
  if (state.phase !== 'roundOver') return [];
  return state.seats
    .map((s) => s.index)
    .filter((i) => !state.players[i]!.eliminated && !state.roundOverAcked[i]);
}

export function viewFor(state: SkullPrivateState, seat: SeatIndex | null): SkullPublicState {
  const me = seat !== null && state.players[seat] ? seat : null;
  const players: PublicPlayer[] = state.seats.map((s) => {
    const p = state.players[s.index]!;
    const handCount = p.remaining.roses + p.remaining.skulls;
    return {
      index: s.index,
      name: s.name,
      stackSize: p.stack.length,
      revealed: p.revealed.slice(),
      disksTotal: handCount + p.stack.length + p.revealed.length,
      handCount,
      eliminated: p.eliminated,
      wins: p.wins,
    };
  });

  const passed: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) passed[s.index] = !!state.passed[s.index];
  const waitingOn = pendingAcks(state);
  const mine = me !== null ? state.players[me]! : null;

  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({ index: s.index, name: s.name })),
    players,
    currentSeat: state.currentSeat,
    roundLeader: state.roundLeader,
    roundNumber: state.roundNumber,
    challengeTarget: state.challengeTarget,
    currentBid: state.currentBid,
    currentBidder: state.currentBidder,
    passed,
    bidLog: state.bidLog.map((b) => ({ seat: b.seat, bid: b.bid })),
    challenger: state.challenger,
    flipsRemaining: state.flipsRemaining,
    ownStackCleared: state.ownStackCleared,
    flips: state.flips.map((f) => ({ seat: f.seat, disk: f.disk })),
    lastRound:
      state.history.length > 0 ? redactRound(state.history[state.history.length - 1]!, me) : null,
    history: state.history.map((r) => redactRound(r, me)),
    matchWinners: state.matchWinners.slice(),
    waitingOn,
    yourSeat: me,
    yourStack: mine ? mine.stack.slice() : [],
    yourRemaining: mine ? { roses: mine.remaining.roses, skulls: mine.remaining.skulls } : { roses: 0, skulls: 0 },
    yourAckPending: me !== null && waitingOn.includes(me),
  };
}
