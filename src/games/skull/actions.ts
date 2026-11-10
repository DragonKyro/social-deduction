import type { SeatIndex } from '@/engine/types';
import type { Disk } from './state';

// Skull action union.
//
// Flow:
//   placeOpening — every seat sends `placeDisk` once with their first disk.
//   placing — active seat sends either `placeDisk` (another) or `openBid`
//             ("I can flip N roses without a skull").
//   bidding — `raiseBid` or `passBid`. When all but one have passed (or the
//             bid hits the on-table disk total) the challenge starts.
//   revealing — challenger sends `flipNext` repeatedly. Their own stack is
//               flipped first (no `fromSeat`); after that each flip names
//               an opponent's stack.
//   discarding — challenger flipped their own skull: `discardDisk` picks
//                which of their disks to lose (face-down).
//   chooseLeader — challenger knocked out by their own skull picks who
//                  starts the next round.
//   roundOver — every live seat sends `ackRoundOver`.
//
// A failed challenge on someone ELSE's skull needs no action: the engine
// removes one of the challenger's disks at random, as the skull's owner
// would at the table.

export type SkullAction =
  | { type: 'placeDisk'; bySeat: SeatIndex; disk: Disk }
  | { type: 'openBid'; bySeat: SeatIndex; bid: number }
  | { type: 'raiseBid'; bySeat: SeatIndex; bid: number }
  | { type: 'passBid'; bySeat: SeatIndex }
  | { type: 'flipNext'; bySeat: SeatIndex; fromSeat?: SeatIndex }
  | { type: 'discardDisk'; bySeat: SeatIndex; disk: Disk }
  | { type: 'chooseLeader'; bySeat: SeatIndex; seat: SeatIndex }
  | { type: 'ackRoundOver'; bySeat: SeatIndex };
