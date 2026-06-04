import type { SeatIndex } from '@/engine/types';
import type { Rank } from './state';

// Love Letter action union. As with the other games, every action carries
// `bySeat`; in online play the host verifies it matches the network
// envelope's seat→uuid binding before applying.
//
// Play flow:
//   1. `playCard` selects WHICH of the two held cards is played. For Guard,
//      Priest, Baron, Prince, King this transitions into the matching
//      targeting phase. Handmaid / Countess / Princess resolve immediately
//      (Princess elims the actor; Countess is a pure discard).
//   2. `chooseTarget` lands the targeted effect.
//   3. `guardGuess` finalizes a Guard guess (separate from chooseTarget so
//      the UI can collect them independently — name the seat, then the
//      rank).
//   4. Various `ack*` actions advance the multi-seat reveal phases.

export type LoveLetterAction =
  | { type: 'ackStart'; bySeat: SeatIndex }
  | { type: 'playCard'; bySeat: SeatIndex; card: Rank }
  | { type: 'chooseTarget'; bySeat: SeatIndex; target: SeatIndex }
  | { type: 'guardGuess'; bySeat: SeatIndex; target: SeatIndex; guess: Rank }
  | { type: 'ackEffect'; bySeat: SeatIndex }
  | { type: 'ackPriest'; bySeat: SeatIndex }
  | { type: 'ackRoundOver'; bySeat: SeatIndex };
