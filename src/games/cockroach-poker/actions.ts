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
  // Holder calls it: 'truth' = claim is correct, 'lie' = claim is wrong.
  // Not allowed once the holder has peeked.
  | { type: 'decide'; bySeat: SeatIndex; call: 'truth' | 'lie' }
  // Holder secretly looks at the card. Only allowed while someone who
  // hasn't seen it remains; afterwards the holder must `passOn`.
  | { type: 'peek'; bySeat: SeatIndex }
  // After peeking: pass the card on with a new claim to an unseen seat.
  | {
      type: 'passOn';
      bySeat: SeatIndex;
      claim: Creature;
      target: SeatIndex;
    }
  | { type: 'ackReveal'; bySeat: SeatIndex };
