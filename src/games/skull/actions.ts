import type { SeatIndex } from '@/engine/types';
import type { Disk } from './state';

// Skull action union.
//
// Flow:
//   placeOpening — every seat sends `placeDisk` once with their first disk.
//   placing — active seat sends either `placeDisk` (another) or `openBid`
//             (declares "I can flip N roses without a skull").
//   bidding — `raiseBid` or `passBid`. When all but one have passed (or the
//             bid hits the on-table disk total), `startChallenge` resolves
//             automatically inside the engine — no explicit action needed.
//   revealing — challenger sends `flipNext` repeatedly. If they've cleared
//               their own stack, the action must include a `fromSeat`.
//   roundOver — every seat sends `ackRoundOver`. If the loser of a failed
//               challenge or the winner of a successful one held a skull
//               flip, they pick which disk to lose via `chooseDiscard`.
//               (To keep flow simple, we resolve discard automatically:
//               prefer rose. So no explicit chooseDiscard action.)

export type SkullAction =
  | { type: 'placeDisk'; bySeat: SeatIndex; disk: Disk }
  | { type: 'openBid'; bySeat: SeatIndex; bid: number }
  | { type: 'raiseBid'; bySeat: SeatIndex; bid: number }
  | { type: 'passBid'; bySeat: SeatIndex }
  | { type: 'flipNext'; bySeat: SeatIndex; fromSeat?: SeatIndex }
  | { type: 'ackRoundOver'; bySeat: SeatIndex };
