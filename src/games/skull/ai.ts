import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { SkullAction } from './actions';
import type { SkullPrivateState } from './state';

// Skull AI.
//
// Behavior:
//  - Always opens with a rose (safe — the rulebook recommends this too).
//  - In placing, places a rose ~70% of the time and a skull ~30% if there's
//    a bid threat or someone else just placed; mixes in via the round seed.
//  - Bidding: bids up to its own placed-rose count + 1 when it would benefit,
//    and folds quickly otherwise.
//  - Reveal: flips own stack first (those are known safe roses), then picks
//    seats with skulls placed least likely (the AI uses a uniform prior).

function rngForSeat(state: SkullPrivateState, seat: SeatIndex): number {
  // Deterministic mixing of (seed, round, seat) — using global makeRng/rngInt.
  const rng = makeRng(state.seed ^ (state.roundNumber * 37) ^ (seat * 101));
  return rngInt(rng, 100);
}

function aliveSeats(state: SkullPrivateState): SeatIndex[] {
  return state.seats
    .map((s) => s.index)
    .filter((i) => !state.players[i]!.eliminated);
}

export function aiChooseAction(
  state: SkullPrivateState,
  seat: SeatIndex,
): SkullAction | null {
  if (state.players[seat]!.eliminated) return null;

  switch (state.phase) {
    case 'placeOpening': {
      if (seat !== state.currentSeat) return null;
      return { type: 'placeDisk', bySeat: seat, disk: 'rose' };
    }

    case 'placing': {
      if (seat !== state.currentSeat) return null;
      const p = state.players[seat]!;
      // Decide place vs open-bid: place ~60% of the time when total stack
      // is small, less as stacks grow. If we can't open a bid (because we
      // have no roses placed and can't credibly call our own bluff), keep
      // placing.
      const totalOnTable = aliveSeats(state).reduce(
        (sum, i) => sum + state.players[i]!.stack.length,
        0,
      );
      const myStack = p.stack.length;
      const myRoses = p.stack.filter((d) => d === 'rose').length;
      const r = rngForSeat(state, seat);
      // Open a bid if we have at least 1 rose placed AND either total on
      // table is >= 3 OR the rng says go for it.
      const wantBid =
        myStack >= 1 && (totalOnTable >= 3 || r < 30) && p.remaining.roses + p.remaining.skulls === 0
          ? true
          : myStack >= 2 && r < 35;
      if (wantBid) {
        const bid = Math.max(1, Math.min(myRoses, totalOnTable));
        return { type: 'openBid', bySeat: seat, bid };
      }
      // Otherwise place. Prefer rose, but sometimes drop a skull as a
      // trap — only when we have a skull left and rng triggers.
      const placeSkull =
        p.remaining.skulls > 0 && r < 25 && totalOnTable >= 2;
      if (placeSkull) return { type: 'placeDisk', bySeat: seat, disk: 'skull' };
      if (p.remaining.roses > 0) {
        return { type: 'placeDisk', bySeat: seat, disk: 'rose' };
      }
      if (p.remaining.skulls > 0) {
        return { type: 'placeDisk', bySeat: seat, disk: 'skull' };
      }
      // No disks to place — try to open a bid as a last resort.
      const bid = Math.max(1, Math.min(myRoses || 1, totalOnTable || 1));
      return { type: 'openBid', bySeat: seat, bid };
    }

    case 'bidding': {
      if (seat !== state.currentSeat) return null;
      if (state.passed[seat]) return null;
      const p = state.players[seat]!;
      const myRoses = p.stack.filter((d) => d === 'rose').length;
      const totalOnTable = aliveSeats(state).reduce(
        (sum, i) => sum + state.players[i]!.stack.length,
        0,
      );
      // Comfort: roses we control + estimated roses among others.
      const otherStackTotal = totalOnTable - p.stack.length;
      // Assume ~75% of opponents' placed disks are roses.
      const estOtherRoses = Math.floor(otherStackTotal * 0.75);
      const comfortableMax = myRoses + estOtherRoses;
      const raiseTo = state.currentBid + 1;
      const r = rngForSeat(state, seat) % 100;
      if (raiseTo > totalOnTable) {
        return { type: 'passBid', bySeat: seat };
      }
      // If raising is within comfort, raise. Otherwise pass.
      if (raiseTo <= comfortableMax && r < 65) {
        return { type: 'raiseBid', bySeat: seat, bid: raiseTo };
      }
      return { type: 'passBid', bySeat: seat };
    }

    case 'revealing': {
      if (seat !== state.challenger) return null;
      // Flip own stack while possible.
      const myStackSize = state.players[seat]!.stack.length;
      if (myStackSize > 0 && !state.ownStackCleared) {
        return { type: 'flipNext', bySeat: seat };
      }
      // Choose an opponent's stack. Pick the seat with the largest pile (most
      // information) — biased away from someone who placed last (they're
      // suspicious). Avoid skull placements heuristically by preferring
      // earlier placers.
      const candidates = state.seats
        .map((s) => s.index)
        .filter((i) => i !== seat && state.players[i]!.stack.length > 0);
      if (candidates.length === 0) return null;
      // Deterministic: lowest-index candidate.
      const fromSeat = candidates[0]!;
      return { type: 'flipNext', bySeat: seat, fromSeat };
    }

    case 'roundOver': {
      if (state.roundOverAcked[seat]) return null;
      return { type: 'ackRoundOver', bySeat: seat };
    }

    case 'gameOver':
      return null;
  }
}
