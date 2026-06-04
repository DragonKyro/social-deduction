import type { SeatIndex } from '@/engine/types';
import type { CharacterActionId } from './characters';
import type { CoupCharacter, GeneralActionId } from './state';

// Discriminated union of every action a seat can dispatch. Host validates +
// dispatches via the state-machine in module.ts.

export type CoupGameAction =
  // Active turn — declare a general action or a character claim
  | {
      type: 'declareGeneral';
      generalId: GeneralActionId;
      target?: SeatIndex; // required for 'coup'
    }
  | {
      type: 'declareCharacter';
      claimedCharacter: CoupCharacter;
      characterActionId: CharacterActionId;
      target?: SeatIndex;
      // mercenary partner offer (claim only — the partner can decline by passing)
      mercenaryPartner?: SeatIndex;
      // inquisitor's branch decision at declare time
      inquisitorBranch?: 'exchange' | 'peek';
      inquisitorPeekCardIndex?: 0 | 1;
    }

  // Challenge / block window
  | { type: 'challenge'; bySeat: SeatIndex }
  | { type: 'pass'; bySeat: SeatIndex }
  | {
      type: 'declareBlock';
      bySeat: SeatIndex;
      character: CoupCharacter;
    }

  // Reveal step (challenge resolution)
  | { type: 'revealCard'; bySeat: SeatIndex; cardIndex: 0 | 1 }

  // Lose-influence pick (coup / assassinate / failed challenge / etc.)
  | { type: 'pickInfluenceToLose'; bySeat: SeatIndex; cardIndex: 0 | 1 }

  // Exchange (Ambassador / Inquisitor)
  | {
      type: 'exchangeReturn';
      bySeat: SeatIndex;
      keepIndices: number[]; // indices into exchangeOffer.cards
    }

  // Acks (move past spy-peek / Inquisitor-peek display)
  | { type: 'ackPeek'; bySeat: SeatIndex }
  | { type: 'ackTurn'; bySeat: SeatIndex }

  // Spy / Inquisitor target picks (resolved live in the spyPeek / inquisitor branch)
  | { type: 'spyPickTarget'; bySeat: SeatIndex; targetSeat: SeatIndex; cardIndex: 0 | 1 };

// Helper type guards used by the engine + UI.
export type DeclareGeneral = Extract<CoupGameAction, { type: 'declareGeneral' }>;
export type DeclareCharacter = Extract<CoupGameAction, { type: 'declareCharacter' }>;
