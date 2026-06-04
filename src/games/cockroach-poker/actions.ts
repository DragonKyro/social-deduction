import type { SeatIndex } from '@/engine/types';
import type { Creature } from './state';

export type CockroachPokerAction =
  | { type: 'ackDeal'; bySeat: SeatIndex }
  // Active seat begins a pass: picks a card from hand, claims it's
  // `claim`, sends to `target`.
  | {
      type: 'startPass';
      bySeat: SeatIndex;
      handIndex: number;
      claim: Creature;
      target: SeatIndex;
    }
  // Decider call: 'truth' = claim is correct, 'lie' = claim is wrong.
  | { type: 'decide'; bySeat: SeatIndex; call: 'truth' | 'lie' }
  // Decider peeks then passes onward (must include new claim + target).
  | {
      type: 'peekAndPass';
      bySeat: SeatIndex;
      claim: Creature;
      target: SeatIndex;
    }
  | { type: 'ackReveal'; bySeat: SeatIndex };
