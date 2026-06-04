import type { SeatIndex } from '@/engine/types';
import type { CoupAction as CoupActionType, CoupCharacter } from './state';

export type CoupGameAction =
  | { type: 'declareAction'; action: CoupActionType; target?: SeatIndex }
  | { type: 'challenge' } // any opponent during awaiting-challenge
  | { type: 'pass' } // skip challenge/block window
  | { type: 'block'; character: CoupCharacter } // declare a blocker
  | { type: 'revealCard'; cardIndex: 0 | 1 } // respond to a challenge
  | { type: 'pickInfluenceToLose'; cardIndex: 0 | 1 }
  | { type: 'exchangeReturn'; keep: CoupCharacter[]; returnToDeck: CoupCharacter[] };
