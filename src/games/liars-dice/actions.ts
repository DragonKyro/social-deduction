import type { SeatIndex } from '@/engine/types';
import type { Bid, CallKind } from './state';

export type LiarsDiceAction =
  | { type: 'ackRoll'; bySeat: SeatIndex }
  | { type: 'placeBid'; bySeat: SeatIndex; bid: Bid }
  | { type: 'call'; bySeat: SeatIndex; kind: CallKind }
  | { type: 'ackReveal'; bySeat: SeatIndex }
  | { type: 'ackRoundOver'; bySeat: SeatIndex };
