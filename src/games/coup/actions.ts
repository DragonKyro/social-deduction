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
      // foreign consular treaty pair (two seats; cannot include the claimer)
      treatyPair?: [SeatIndex, SeatIndex];
      // arms dealer branch: steal | sell influence
      armsDealerBranch?: 'steal' | 'sell';
      sellCardIndex?: 0 | 1;
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
  | { type: 'spyPickTarget'; bySeat: SeatIndex; targetSeat: SeatIndex; cardIndex: 0 | 1 }

  // === G54 / Anarchy exotic mechanics =======================================

  // Capitalist / Financier pile-on. Each opponent may join the pot once;
  // joining stages a pending join that the table may challenge (handled via
  // existing challenge state). A seat may also explicitly opt-out via pass.
  | { type: 'joinPileOn'; bySeat: SeatIndex }
  | { type: 'closePileOn'; bySeat: SeatIndex }

  // Protestor / Anarchist chip-in. Opponents pay 1 coin each to contribute to
  // a group elimination of the target. Once `threshold` contributors are in,
  // the target loses an influence.
  | { type: 'chipIn'; bySeat: SeatIndex }

  // Force-swap (Newscaster / Reporter / Producer / Lobbyist / Diplomat). The
  // target picks which of their face-down cards to swap with the drawn card.
  | { type: 'targetSwapPick'; bySeat: SeatIndex; cardIndex: 0 | 1 }

  // Arms Dealer sellInfluence — own seat picks which of their face-down cards
  // to flip in exchange for coins + weapon tokens.
  | { type: 'sellInfluence'; bySeat: SeatIndex; cardIndex: 0 | 1 };

// Helper type guards used by the engine + UI.
export type DeclareGeneral = Extract<CoupGameAction, { type: 'declareGeneral' }>;
export type DeclareCharacter = Extract<CoupGameAction, { type: 'declareCharacter' }>;
