import type { SeatIndex } from '@/engine/types';
import type { Coord } from './state';

// Cross Clues action union. Every action carries `bySeat` (the seat the
// sender claims to be). In solo/hot-seat mode the UI fills `bySeat` from
// the local seat; online play would validate it against the network
// envelope's seat tied to a UUID — same convention as Avalon/ONUW.

export type CrossCluesAction =
  | { type: 'ackSetup'; bySeat: SeatIndex }
  | { type: 'submitClue'; bySeat: SeatIndex; clue: string }
  | { type: 'submitGuess'; bySeat: SeatIndex; coord: Coord }
  | { type: 'ackReveal'; bySeat: SeatIndex };
