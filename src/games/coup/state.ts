import type { SeatIndex } from '@/engine/types';

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
// which adds 6 more characters and one new general action ("Social Media").
//
// Both rulesets share the same challenge/block state machine and the same
// turn loop. The only differences are (a) which characters are legal in
// the deck and (b) whether cross-blocking applies — both expressed as
// rule data in the character/action tables under `rules/`, not as
// `if (ruleset === 'g54')` branches sprinkled through the engine.

export type CoupRuleset = 'classic' | 'g54';

// ----------------------------------------------------------------------------
// Classic (base) characters
// ----------------------------------------------------------------------------

export type ClassicCharacter =
  | 'duke' // tax (+3 coins) / blocks foreign-aid
  | 'assassin' // pay 3 to force a player to lose 1 influence
  | 'captain' // steal 2 coins / blocks captain steal
  | 'ambassador' // exchange 2 cards from the deck / blocks captain steal (classic only)
  | 'contessa'; // blocks assassinations

// ----------------------------------------------------------------------------
// G54 characters — 25-card variable pool
//
// Each G54 match picks 5 of these (random or curated). Characters are
// organized into 5 categories (Finance, Communications, Force, Special
// Interest, Movement) of 5 each, mirroring the printed deck. Picking
// across categories is what makes G54 sessions feel different from each
// other — a Finance-heavy table plays nothing like a Force-heavy one.
//
// Ability details land in `rules/g54Characters.ts` (Phase 5). The shape
// here is just the id union so the type-level deck and AI references
// resolve.
// ----------------------------------------------------------------------------

export type G54Character =
  // Finance
  | 'banker' // +3 from treasury (similar to Duke)
  | 'capitalist' // +4 from treasury; everyone may pile-on claim
  | 'speculator' // take coins = your current coins (max 5); failed challenge gives all to challenger
  | 'treasurer' // moves coins between treasury / other players
  | 'taxCollector' // levies a coin from every other player

  // Communications
  | 'newscaster' // pay 1; secretly swap from a 3-card deck draw
  | 'reporter' // peek + force a redraw
  | 'producer' // 1 card from deck + 1 from target; secret swap
  | 'lobbyist' // forced trade with a target
  | 'spy' // private peek at a target's hand

  // Force
  | 'assassinG54' // assassinate (same as classic Assassin; renamed to disambiguate)
  | 'mercenary' // hire-to-kill at lower cost / shared payment
  | 'soldier' // cheap eliminate at higher coin cost vs. coup
  | 'guerrilla' // protected eliminate; blockable only by Guerrilla
  | 'thief' // steal-with-consequences variant on Captain

  // Special Interest
  | 'judge' // blocks Coup at a price
  | 'mayor' // gives self a passive economic boost
  | 'priest' // resurrect / soft-protect role
  | 'lawyer' // forces a challenge resolution swing
  | 'bishop' // mass-block role on certain action categories

  // Movement
  | 'inquisitor' // exchange 1 from deck OR look at a card of another player
  | 'protestor' // group-rally: any opponent may chip in coins to eliminate target
  | 'peacekeeper' // takes a Peacekeeping token; can't be targeted while held
  | 'foreignConsular' // distributes 2 Treaty tokens; treatied players can't target each other
  | 'diplomat'; // forces a peaceful card swap; mutual exchange

// ----------------------------------------------------------------------------
// G54 — Anarchy expansion characters
// ----------------------------------------------------------------------------

export type G54AnarchyCharacter =
  | 'anarchist' // chaotic eliminate; cost paid in coins from all players
  | 'armsDealer' // sell-influence / weapon-tokens (anarchy markets)
  | 'financier' // pile-on capitalist analogue, larger upside / steeper challenge penalty
  | 'paramilitary' // soft-power coup analogue with a riot mechanic
  | 'plantationOwner' // income engine that scales with influences
  | 'socialist' // wealth redistribution: average pool across living players
  | 'worldBank'; // loans / debt tokens (BGG-listed; some retailers omit)

// Discriminated character id used everywhere downstream. The deck shape
// is `Array<CoupCharacter>` and rule tables key off `CoupCharacter`.
export type CoupCharacter = ClassicCharacter | G54Character | G54AnarchyCharacter;

// ----------------------------------------------------------------------------
// G54 general actions
//
// Both rulesets ship Income + Coup. G54 + Anarchy adds Social Media (a new
// general action — no character claim, but has its own challenge window).
// ----------------------------------------------------------------------------

export type CoupAction =
  // General (always legal)
  | 'income' // +1 coin
  | 'foreignAid' // +2 coins (Duke / Banker blocks)
  | 'coup' // pay 7, force target to lose influence
  // General — Anarchy only
  | 'socialMedia' // anarchy general action; mechanics in rules/g54Anarchy.ts
  // Character-keyed (host validates legality vs. the active deck)
  | 'characterAction';

export type CoupPhase =
  | 'setup'
  | 'turnStart' // active player picks an action
  | 'awaitingChallenge' // an action was claimed; window for any opponent to challenge
  | 'awaitingBlock' // action was uncontested; window for an opponent to claim a blocker
  | 'challengeReveal' // the challenged player picks a card to reveal
  | 'loseInfluence' // someone needs to lose a card (coup, assassination, failed challenge, failed block)
  | 'exchangePick' // ambassador/inquisitor draws X; picks which to return
  | 'gameOver';

export interface CoupSeatState {
  index: SeatIndex;
  influences: Array<{ char: CoupCharacter; revealed: boolean }>;
  coins: number;
  eliminated: boolean;
  // G54: Peacekeeping / Treaty tokens belong to the seat that holds them.
  tokens: {
    peacekeeping: boolean;
    treaty: SeatIndex | null; // pair-partner of the treaty; null = no treaty
  };
}

export interface CoupPendingAction {
  by: SeatIndex;
  // The CHARACTER being claimed (if any). Null for general actions like
  // income / coup that don't require a claim.
  claimedCharacter: CoupCharacter | null;
  // Concrete action being attempted. For G54 the host resolves the
  // character-keyed action via `rules/g54Characters.ts`.
  actionId: string;
  target: SeatIndex | null;
  // Block claim, if any.
  blocker: { by: SeatIndex; character: CoupCharacter } | null;
  challenger: SeatIndex | null;
}

export interface CoupPrivateState {
  phase: CoupPhase;
  ruleset: CoupRuleset;
  // Anarchy on/off. Only meaningful when `ruleset === 'g54'`.
  expansions: Array<'anarchy'>;
  // The 5 characters chosen for this match (G54). For classic this is
  // the fixed base-5. Drives action legality + UI.
  activeCharacters: CoupCharacter[];
  seats: CoupSeatState[];
  // The shuffled deck of remaining cards. Strict secrecy: peers never see
  // the deck. Reshuffles use seeded RNG.
  deck: CoupCharacter[];
  currentSeat: SeatIndex;
  pending: CoupPendingAction | null;
  // During exchange (Ambassador / Inquisitor) the active seat sees their 2
  // dealt + their 2 current cards. Stored host-side for validation.
  exchangeOffer: CoupCharacter[] | null;
  seed: number;
  winnerSeat: SeatIndex | null;
}

// === Public view ===

export interface CoupPublicSeatState {
  index: SeatIndex;
  name: string;
  coins: number;
  influences: Array<{ char: CoupCharacter | null; revealed: boolean }>;
  eliminated: boolean;
  tokens: {
    peacekeeping: boolean;
    treaty: SeatIndex | null;
  };
}

export interface CoupPublicState {
  phase: CoupPhase;
  ruleset: CoupRuleset;
  expansions: Array<'anarchy'>;
  activeCharacters: CoupCharacter[];
  seats: CoupPublicSeatState[];
  currentSeat: SeatIndex;
  pending: CoupPendingAction | null;
  deckSize: number;
  winnerSeat: SeatIndex | null;

  yourInfluences: Array<{ char: CoupCharacter; revealed: boolean }>;
  yourExchangeOffer: CoupCharacter[] | null;
}
