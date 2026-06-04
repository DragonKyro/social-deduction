import type { SeatIndex } from '@/engine/types';
import type { CharacterActionId } from './characters';

// ============================================================================
// Coup — host state
// ============================================================================
//
// We support TWO rule sets:
//
//   1. **Classic** (`ruleset: 'classic'`) — the original 5-character base
//      game (Duke, Assassin, Captain, Ambassador, Contessa). Three copies
//      of each → 15-card deck. Cross-blocking allowed (Captain blocks
//      steal AND Ambassador blocks steal).
//
//   2. **G54** (`ruleset: 'g54'`) — Coup: Rebellion G54. 25-character pool;
//      each match picks 5. Three copies of each → 15-card deck. **Only
//      same-role blocking** (Captain steal blocked only by Captain) per
//      the G54 rulebook. Wider replay space is the point.
//
// G54 also supports the **Anarchy** expansion (`expansions: ['anarchy']`)
// which adds 6 more characters and one new general action ("Social Media",
// not yet wired).
//
// Both rulesets share the same challenge/block state machine and the same
// turn loop. The only differences are (a) which characters are legal in
// the deck and (b) whether cross-blocking applies — both expressed as
// rule data in the character table, not as `if (ruleset === 'g54')`
// branches sprinkled through the engine.

export type CoupRuleset = 'classic' | 'g54';

// ----------------------------------------------------------------------------
// Character id union — see characters.ts for the rules table.
// ----------------------------------------------------------------------------

export type ClassicCharacter =
  | 'duke'
  | 'assassin'
  | 'captain'
  | 'ambassador'
  | 'contessa';

export type G54Character =
  // Finance
  | 'banker' | 'capitalist' | 'speculator' | 'treasurer' | 'taxCollector'
  // Communications
  | 'newscaster' | 'reporter' | 'producer' | 'lobbyist' | 'spy'
  // Force
  | 'assassinG54' | 'mercenary' | 'soldier' | 'guerrilla' | 'thief'
  // Special Interest
  | 'judge' | 'mayor' | 'priest' | 'lawyer' | 'bishop'
  // Movement
  | 'inquisitor' | 'protestor' | 'peacekeeper' | 'foreignConsular' | 'diplomat';

export type G54AnarchyCharacter =
  | 'anarchist' | 'armsDealer' | 'financier' | 'paramilitary' | 'plantationOwner' | 'socialist' | 'worldBank';

export type CoupCharacter = ClassicCharacter | G54Character | G54AnarchyCharacter;

// ----------------------------------------------------------------------------
// General actions (always legal regardless of deck).
// ----------------------------------------------------------------------------

export type GeneralActionId =
  | 'income' // +1 coin, no challenge
  | 'foreignAid' // +2 coins, no challenge but blockable by Duke / Banker
  | 'coup'; // pay 7, force loss-influence, no challenge no block

// Phases of a single turn. The challenge/block sub-machine runs as follows:
//
//   turnStart
//     → declareAction (general or character claim)
//       general: income → resolve immediately
//                foreignAid → awaitingBlock
//                coup → loseInfluence (target picks)
//       character: awaitingChallenge
//
//   awaitingChallenge
//     - any opponent challenges → challengeReveal (claimer picks a card to show)
//     - everyone passes → if action is also blockable, awaitingBlock; else resolve
//
//   awaitingBlock
//     - a blocker claims → awaitingBlockChallenge (the blocker is now the claimer)
//     - everyone passes → resolve the original action
//
//   awaitingBlockChallenge
//     - any opponent challenges the BLOCKER → challengeReveal (block-context)
//     - everyone passes → block stands; original action fizzles → end of turn
//
//   challengeReveal
//     - claimer reveals a matching card → challenger loses an influence; new card drawn
//     - claimer reveals a non-matching card → claimer loses that influence; action fizzles
//
//   loseInfluence
//     - the seat selected to lose picks one of their face-down cards to flip
//
//   exchangePick
//     - active seat is offered N cards (deck + hand); picks which to keep, returns rest
//
//   spyPeek
//     - active seat (Spy) sees a target's card privately; they ack to continue
//
//   turnEnd
//     - bookkeeping; immediately rolls to next seat's turnStart
// ----------------------------------------------------------------------------

export type CoupPhase =
  | 'setup'
  | 'turnStart'
  | 'awaitingChallenge'
  | 'awaitingBlock'
  | 'awaitingBlockChallenge'
  | 'challengeReveal'
  | 'loseInfluence'
  | 'exchangePick'
  | 'spyPeek'
  | 'turnEnd'
  | 'gameOver';

export interface CoupInfluence {
  // Identity of the face-down card. Stays private (host state) unless
  // `revealed` is true.
  char: CoupCharacter;
  revealed: boolean;
}

export interface CoupSeatState {
  index: SeatIndex;
  name: string;
  influences: CoupInfluence[];
  coins: number;
  eliminated: boolean;
  // G54 tokens — scaffolded; characters that grant them aren't wired yet, so
  // these stay default.
  tokens: {
    peacekeeping: boolean;
    treaty: SeatIndex | null;
  };
}

// Pending action mid-turn. Lives during challenge/block windows.
export interface CoupPendingAction {
  by: SeatIndex;
  // null for general actions like income/coup. Otherwise the character the
  // active player CLAIMS to have. The engine compares this against the
  // active deck (must be present) and against the seat's hand at challenge
  // time.
  claimedCharacter: CoupCharacter | null;
  // What kind of action this is (general or character-keyed).
  kind: 'general' | 'character';
  generalId: GeneralActionId | null;
  characterActionId: CharacterActionId | null;
  target: SeatIndex | null;
  // Block claim, if any. Set when phase = awaitingBlockChallenge or after
  // a block resolves.
  blocker: {
    by: SeatIndex;
    character: CoupCharacter;
  } | null;
  // Track who has explicitly passed in the current challenge / block window
  // so the host knows when the window can close.
  passes: SeatIndex[];
  // Auxiliary state for resolving specific actions:
  //   - mercenaryPartner: chosen partner seat (the 2nd "+1 coin" payer)
  //   - inquisitorVictim: target seat when the Inquisitor chooses "peek" branch
  //   - inquisitorPeek: which of the target's cards was inspected (host-side)
  //   - spyPeekCard: which of the spy target's cards was peeked
  mercenaryPartner: SeatIndex | null;
  inquisitorBranch: 'exchange' | 'peek' | null;
  inquisitorPeekCardIndex: 0 | 1 | null;
  spyPeekCardIndex: 0 | 1 | null;
  // After a challenge resolves, we remember who needs to lose an influence
  // and why (for the UI: "you failed your challenge of Duke").
  loseInfluencePending: {
    seat: SeatIndex;
    reason: 'failedChallenge' | 'lostBluff' | 'assassinate' | 'coup' | 'mercenary' | 'soldier' | 'thiefPenalty';
  } | null;
}

// Exchange (Ambassador / Inquisitor) presents a card set to the active seat.
// Host stores the offer so it can validate the seat's return.
export interface CoupExchangeOffer {
  // The cards the player is presented with (their current hand + drawn cards).
  cards: CoupCharacter[];
  // How many they must keep (their pre-action living influence count).
  keepCount: number;
}

// Per-seat private peek log (spy / inquisitor). Lives host-side and is
// surfaced in viewFor only to the seat that owns the peek.
export interface CoupPrivatePeek {
  byActionId: 'spyPeek' | 'inquisitorPeek';
  target: SeatIndex;
  // The character that was peeked.
  card: CoupCharacter;
  // Which slot (0/1) of the target's hand was peeked.
  cardIndex: 0 | 1;
}

export interface CoupPrivateState {
  phase: CoupPhase;
  ruleset: CoupRuleset;
  expansions: Array<'anarchy'>;
  // The character set in play this match. Must be exactly 5 for Classic; 5+
  // for G54 (we allow up to 8 in the picker for variety). The deck = 3 of each.
  activeCharacters: CoupCharacter[];
  seats: CoupSeatState[];
  deck: CoupCharacter[];
  currentSeat: SeatIndex;
  pending: CoupPendingAction | null;
  exchangeOffer: CoupExchangeOffer | null;
  // Append-only public log of resolved actions / events. The UI renders the
  // last few entries so players see what happened.
  log: string[];
  // Private peeks held per seat. Stays host-side; redacted into viewFor.
  privatePeeks: Record<SeatIndex, CoupPrivatePeek[]>;
  seed: number;
  rngCursor: number;
  winnerSeat: SeatIndex | null;
}

// ============================================================================
// Public view (per seat). Hidden card identities show as `null`.
// ============================================================================

export interface CoupPublicInfluence {
  char: CoupCharacter | null;
  revealed: boolean;
}

export interface CoupPublicSeatState {
  index: SeatIndex;
  name: string;
  coins: number;
  influences: CoupPublicInfluence[];
  eliminated: boolean;
  tokens: {
    peacekeeping: boolean;
    treaty: SeatIndex | null;
  };
}

export interface CoupPublicPendingAction {
  by: SeatIndex;
  claimedCharacter: CoupCharacter | null;
  kind: 'general' | 'character';
  generalId: GeneralActionId | null;
  characterActionId: CharacterActionId | null;
  target: SeatIndex | null;
  blocker: { by: SeatIndex; character: CoupCharacter } | null;
  passes: SeatIndex[];
  // We mirror the loseInfluence pending bit publicly so the UI can show "X
  // must lose an influence" while we wait on the loseInfluence pick.
  loseInfluencePending: { seat: SeatIndex; reason: string } | null;
  mercenaryPartner: SeatIndex | null;
}

export interface CoupPublicState {
  phase: CoupPhase;
  ruleset: CoupRuleset;
  expansions: Array<'anarchy'>;
  activeCharacters: CoupCharacter[];
  seats: CoupPublicSeatState[];
  currentSeat: SeatIndex;
  pending: CoupPublicPendingAction | null;
  deckSize: number;
  log: string[];
  winnerSeat: SeatIndex | null;

  // Per-seat redacted slots.
  yourSeat: SeatIndex | null;
  yourInfluences: CoupInfluence[];
  yourExchangeOffer: CoupExchangeOffer | null;
  yourPeeks: CoupPrivatePeek[];
}
