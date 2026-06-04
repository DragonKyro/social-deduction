import type { SeatIndex } from '@/engine/types';
import type { HandClaim } from './hands';

export type LiarsPokerAction =
  | { type: 'ackDeal'; bySeat: SeatIndex }
  | { type: 'placeClaim'; bySeat: SeatIndex; claim: HandClaim }
  | { type: 'callLiar'; bySeat: SeatIndex }
  | { type: 'ackReveal'; bySeat: SeatIndex }
  | { type: 'ackRoundOver'; bySeat: SeatIndex };
