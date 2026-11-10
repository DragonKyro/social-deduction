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
//      each match picks 5. Three copies of each → 15-card deck. Blocks come
//      from the character table (see characters.ts / README).
//
// G54 also supports the **Anarchy** expansion (`expansions: ['anarchy']`)
// which adds more characters and one new general action ("Social Media",
// not yet wired).
//
// Both rulesets share the same challenge/block state machine and the same
// turn loop. The differences are rule data in the character table, not
// `if (ruleset === 'g54')` branches sprinkled through the engine.

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

// Phases of a single turn:
//
//   turnStart: the current seat declares a general action or a claim.
//     income → resolves immediately; foreignAid → awaitingBlock;
//     coup → loseInfluence (G54: awaitingBlock first, Judge & co. can block);
//     character claim → awaitingChallenge.
//
//   awaitingChallenge: every living opponent challenges or passes. A
//     challenge resolves on the spot. An honest claimer's matching card is
//     shown, shuffled back into the court deck and replaced face-down, and
//     the challenger loses an influence. A bluffer loses an influence and
//     the action fizzles. All pass → awaitingBlock (if blockable) or resolve.
//
//   awaitingBlock: eligible blockers (the target for targeted actions,
//     anyone for Foreign Aid) may claim a blocker or pass.
//
//   awaitingBlockChallenge: anyone but the blocker may challenge the block.
//     All pass → the block stands and the action fizzles.
//
//   loseInfluence: the losing seat picks which face-down card to flip.
//   exchangePick: the active seat keeps N of (hand + drawn) cards.
//   spyPeek: the peeker sees a card privately, then acks.
//   pileOnWindow / chipInWindow / targetSwapPick / sellInfluencePick: G54 /
//     Anarchy extras (see README).
// ----------------------------------------------------------------------------

export type CoupPhase =
  | 'setup'
  | 'turnStart'
  | 'awaitingChallenge'
  | 'awaitingBlock'
  | 'awaitingBlockChallenge'
  | 'loseInfluence'
  | 'exchangePick'
  | 'spyPeek'
  // Capitalist / Financier pile-on income — opponents may join the pot.
  | 'pileOnWindow'
  // Protestor / Anarchist group rally — opponents may chip 1 coin each.
  | 'chipInWindow'
  // Newscaster / Reporter / Producer / Lobbyist / Diplomat — target picks
  // which of their cards to swap with the drawn card.
  | 'targetSwapPick'
  // Arms Dealer — active seat flips one of their own cards for coins/tokens.
  | 'sellInfluencePick'
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
  // G54 / Anarchy tokens:
  //   - peacekeeping: granted by Peacekeeper; cleared when the holder next
  //     declares (so they're untargetable until they next act).
  //   - treaty: partner's SeatIndex (Foreign Consular). Paired seats can't
  //     target each other until a later Treaty overwrites the bond.
  //   - weapons: Arms Dealer; each adds +1 to the holder's steals (cap 3).
  //   - reviveBlessed: Priest / Bishop / Lawyer; the next loss that would
  //     eliminate the holder is cancelled and the token spent.
  //   - reviveUsed: a revive already saved this seat; it can't be blessed
  //     again (otherwise a Lawyer re-blessing every turn is immortal).
  tokens: {
    peacekeeping: boolean;
    treaty: SeatIndex | null;
    weapons: number;
    reviveBlessed: boolean;
    reviveUsed: boolean;
  };
}

// Pending action mid-turn. Lives during challenge/block windows.
export interface CoupPendingAction {
  by: SeatIndex;
  // null for general actions like income/coup. Otherwise the character the
  // active player CLAIMS to have.
  claimedCharacter: CoupCharacter | null;
  kind: 'general' | 'character';
  generalId: GeneralActionId | null;
  characterActionId: CharacterActionId | null;
  target: SeatIndex | null;
  // Block claim, if any.
  blocker: {
    by: SeatIndex;
    character: CoupCharacter;
  } | null;
  // Who has explicitly passed in the current challenge / block window.
  passes: SeatIndex[];
  // Auxiliary state for resolving specific actions.
  mercenaryPartner: SeatIndex | null;
  inquisitorBranch: 'exchange' | 'peek' | null;
  inquisitorPeekCardIndex: 0 | 1 | null;
  spyPeekCardIndex: 0 | 1 | null;
  // Foreign Consular treaty pair — two seats picked at declare time.
  treatyPair: [SeatIndex, SeatIndex] | null;
  // Pile-on pot (Capitalist / Financier). `contributors` includes the
  // original claimer; `coinsEach` is what each contributor receives.
  pileOnPot: {
    contributors: SeatIndex[];
    coinsEach: number;
    closed: SeatIndex[];
  } | null;
  // Group rally pot (Protestor / Anarchist). Each contributor pays 1 coin;
  // when contributors meets the threshold, target loses an influence.
  chipInPot: {
    contributors: SeatIndex[];
    threshold: number;
    passes: SeatIndex[];
  } | null;
  // Force-swap. `drawnCard` is HOST-ONLY: the target picks a slot blind.
  swapInProgress: {
    target: SeatIndex;
    drawnCard: CoupCharacter;
  } | null;
  // Who needs to lose an influence and why (for the UI).
  loseInfluencePending: {
    seat: SeatIndex;
    reason:
      | 'failedChallenge'
      | 'lostBluff'
      | 'assassinate'
      | 'coup'
      | 'mercenary'
      | 'soldier'
      | 'guerrilla'
      | 'paramilitary'
      | 'thiefPenalty'
      | 'chipIn';
  } | null;
  // A Coup declared under the 10-coin obligation can't be blocked (house
  // rule: breaks G54 deadlocks where every kill is honestly blockable).
  unblockable: boolean;
  // How the turn resumes once the pending lose-influence pick resolves.
  // Host-only bookkeeping; never surfaced.
  resumeAfterLose: 'continueAction' | 'fizzle' | 'continueBlock' | 'continueAfterBlockBluff' | null;
}

// Exchange (Ambassador / Inquisitor) presents a card set to the active seat.
export interface CoupExchangeOffer {
  // The cards the player is presented with (their current hand + drawn cards).
  cards: CoupCharacter[];
  // How many they must keep (their pre-action living influence count).
  keepCount: number;
}

// Per-seat private peek log (spy / inquisitor / force-swap). Lives host-side
// and is surfaced in viewFor only to the seat that owns the peek.
export interface CoupPrivatePeek {
  byActionId: 'spyPeek' | 'inquisitorPeek';
  target: SeatIndex;
  card: CoupCharacter;
  cardIndex: 0 | 1;
}

// Public event feed for animations. EVERY field must be public knowledge:
// claimed characters, cards that are now face-up, seat indices. Never a
// face-down card or a deck card.
export type CoupEvent =
  | {
      seq: number;
      kind: 'declare';
      seat: SeatIndex;
      generalId: GeneralActionId | null;
      character: CoupCharacter | null;
      target: SeatIndex | null;
    }
  | {
      seq: number;
      kind: 'challenge';
      challenger: SeatIndex;
      claimer: SeatIndex;
      character: CoupCharacter;
      // true = the claimer proved the card (challenger loses).
      honest: boolean;
      onBlock: boolean;
    }
  | { seq: number; kind: 'block'; seat: SeatIndex; character: CoupCharacter; against: SeatIndex }
  | { seq: number; kind: 'blockStands'; seat: SeatIndex }
  | { seq: number; kind: 'strike'; by: SeatIndex; target: SeatIndex; style: 'assassinate' | 'coup' | 'force' }
  // A face-down card turned face-up (lost / sold); `character` is now public.
  | { seq: number; kind: 'influenceLost'; seat: SeatIndex; cardIndex: number; character: CoupCharacter }
  // A proven card was shuffled back and replaced face-down (identity hidden).
  | { seq: number; kind: 'redraw'; seat: SeatIndex; cardIndex: number }
  | { seq: number; kind: 'exchange'; seat: SeatIndex; drawn: number }
  | { seq: number; kind: 'saved'; seat: SeatIndex }
  | { seq: number; kind: 'eliminated'; seat: SeatIndex }
  | { seq: number; kind: 'win'; seat: SeatIndex };

export interface CoupPrivateState {
  phase: CoupPhase;
  ruleset: CoupRuleset;
  expansions: Array<'anarchy'>;
  // The character set in play this match. The deck = 3 of each.
  activeCharacters: CoupCharacter[];
  seats: CoupSeatState[];
  // HOST-ONLY. Contents and order never leave the host (count is public).
  deck: CoupCharacter[];
  currentSeat: SeatIndex;
  pending: CoupPendingAction | null;
  exchangeOffer: CoupExchangeOffer | null;
  // Append-only public log. Lines must only name public information.
  log: string[];
  // Private peeks held per seat. Redacted into viewFor.
  privatePeeks: Record<SeatIndex, CoupPrivatePeek[]>;
  // Public event feed (see CoupEvent). Capped; `eventSeq` is monotonic.
  events: CoupEvent[];
  eventSeq: number;
  // Number of applied actions. Only used to vary AI jitter between turns.
  actionCount: number;
  // HOST-ONLY. The seed + cursor determine every shuffle; if either reached
  // a peer they could recompute the court deck. Never copy into a view.
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
    weapons: number;
    reviveBlessed: boolean;
    reviveUsed: boolean;
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
  // "X must lose an influence" while we wait on the loseInfluence pick.
  loseInfluencePending: { seat: SeatIndex; reason: string } | null;
  mercenaryPartner: SeatIndex | null;
  treatyPair: [SeatIndex, SeatIndex] | null;
  pileOnPot: {
    contributors: SeatIndex[];
    coinsEach: number;
    closed: SeatIndex[];
  } | null;
  chipInPot: {
    contributors: SeatIndex[];
    threshold: number;
    passes: SeatIndex[];
  } | null;
  // "A swap is in flight on target X". The drawn card itself stays host-side.
  swapTarget: SeatIndex | null;
  unblockable: boolean;
  // Characters that may legally block this action (derived from public data).
  validBlockers: CoupCharacter[];
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
  events: CoupEvent[];
  winnerSeat: SeatIndex | null;
  // Seats the current phase is waiting on (turn owner, window responders,
  // the seat that must pick a card...). Public: it's visible at the table.
  awaitingSeats: SeatIndex[];

  // Per-seat redacted slots.
  yourSeat: SeatIndex | null;
  yourInfluences: CoupInfluence[];
  yourExchangeOffer: CoupExchangeOffer | null;
  yourPeeks: CoupPrivatePeek[];
}
