import type { CoupCharacter } from './state';

// ============================================================================
// Coup character catalogue
// ============================================================================
//
// One declarative table per character. The engine reads this table when
// validating + resolving actions, and the UI reads it for the setup picker
// and the in-game cheatsheet. Adding or balancing a character is one row,
// not a switch arm in the engine.
//
// `implemented: true` means the engine handles the character's action with
// full rulebook accuracy in this build. `implemented: false` characters are
// shown in the picker greyed out — they exist in lore + the type union, but
// can't be selected for play yet. The selectable set this milestone is:
//
//   Classic (5): Duke, Assassin, Captain, Ambassador, Contessa
//   G54 (8):     Banker, Tax Collector, Soldier, Mercenary, Thief, Judge,
//                Inquisitor, Spy
//   Anarchy (1): Plantation Owner
//
// The remaining characters are described accurately so a host can read what
// they would do, but the engine won't let them into a deck until each one's
// mechanic is wired up. This matches the project policy: ship core actions
// correct, leave exotic ones for later, never approximate a rule in a way
// that misleads a player at the table.
// ============================================================================

export type CoupPack = 'classic' | 'g54' | 'anarchy';

export type CoupCategory =
  | 'classic'
  | 'finance'
  | 'communications'
  | 'force'
  | 'specialInterest'
  | 'movement'
  | 'anarchy';

// Action keys the engine knows how to resolve. Each character points at one
// of these via `actionId`. General actions (income / foreignAid / coup) live
// outside this set — they're not character claims.
export type CharacterActionId =
  // Classic
  | 'tax'
  | 'assassinate'
  | 'steal'
  | 'exchange'
  // G54
  | 'taxLevy' // tax collector: pull 1 coin from every other living player
  | 'soldierStrike' // pay 3, eliminate (challengeable; same effect as assassinate)
  | 'mercenaryHire' // pay 1; pick a partner who also pays 1; together eliminate
  | 'thiefSteal' // captain-like with a wrinkle (G54: failed challenge gives 2 to challenger)
  | 'inquisitorExchange' // draw 1 from deck OR peek a target card (G54)
  | 'spyPeek' // private peek at a target's hand (G54)
  // Anarchy
  | 'plantationIncome'; // +1 per living influence you still hold

// What a character action does in terms of effect class. The engine reads
// this when scheduling the post-resolve effect (steal coins, exchange cards,
// force-lose influence, etc.).
export type EffectKind =
  | 'gainCoins' // self-target; +N coins
  | 'taxLevy' // self gains +1 from every other living player
  | 'forceLoseInfluence' // target loses 1 influence
  | 'stealCoins' // target loses N coins, you gain that many
  | 'exchange' // exchange-with-deck flow
  | 'inquisitorExchange' // G54: exchange 1 OR peek
  | 'spyPeek' // private peek
  | 'plantationIncome'; // +1 per influence

export interface CharacterAction {
  id: CharacterActionId;
  label: string;
  // What the action does (used to schedule the resolve step).
  effect: EffectKind;
  // For coin-gain actions, how many you gain. For steal, the requested amount.
  amount?: number;
  // True if any opponent may challenge the claim.
  challengeable: boolean;
  // True if a single named blocker character (defined per ruleset/character)
  // can step in. Coup itself is blockable (Judge) only in G54+.
  blockable: boolean;
  // Up-front cost (Assassin = 3 / Soldier = 3 etc.).
  cost: number;
  // 'self' = no target, 'other' = pick another living player.
  target: 'self' | 'other';
}

// Blocking entries that any character can issue against the active action.
// In Classic: cross-blocking (Captain + Ambassador both block steal). In G54:
// same-role only. We model that with `blockedActions` per character + a
// boolean ruleset flag that turns off cross-blocking.
export interface CharacterBlock {
  // Action that this character can block (e.g. 'foreignAid' or 'assassinate').
  blocks: 'foreignAid' | 'assassinate' | 'steal' | 'coup';
}

export interface CharacterSpec {
  id: CoupCharacter;
  name: string;
  pack: CoupPack;
  category: CoupCategory;
  // Roles the character can play (action + blocks). Most characters have
  // exactly one action and zero/one block, but Inquisitor stacks an
  // exchange-OR-peek and Bishop / Judge stack blocks.
  action: CharacterAction | null;
  blocks: CharacterBlock[];
  // Short description shown on the cheatsheet + setup checklist.
  description: string;
  implemented: boolean;
}

// ----------------------------------------------------------------------------
// Helper builders
// ----------------------------------------------------------------------------

const ACT = {
  duke: (): CharacterAction => ({
    id: 'tax',
    label: 'Tax (+3 coins)',
    effect: 'gainCoins',
    amount: 3,
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  assassin: (): CharacterAction => ({
    id: 'assassinate',
    label: 'Assassinate (pay 3)',
    effect: 'forceLoseInfluence',
    challengeable: true,
    blockable: true,
    cost: 3,
    target: 'other',
  }),
  captain: (): CharacterAction => ({
    id: 'steal',
    label: 'Steal 2 coins',
    effect: 'stealCoins',
    amount: 2,
    challengeable: true,
    blockable: true,
    cost: 0,
    target: 'other',
  }),
  ambassador: (): CharacterAction => ({
    id: 'exchange',
    label: 'Exchange with the deck',
    effect: 'exchange',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  banker: (): CharacterAction => ({
    id: 'tax',
    label: 'Levy treasury (+3 coins)',
    effect: 'gainCoins',
    amount: 3,
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  taxCollector: (): CharacterAction => ({
    id: 'taxLevy',
    label: 'Collect 1 coin from each other living player',
    effect: 'taxLevy',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  soldier: (): CharacterAction => ({
    id: 'soldierStrike',
    label: 'Eliminate (pay 3)',
    effect: 'forceLoseInfluence',
    challengeable: true,
    blockable: false,
    cost: 3,
    target: 'other',
  }),
  mercenary: (): CharacterAction => ({
    id: 'mercenaryHire',
    label: 'Pair-eliminate (pay 1 each)',
    effect: 'forceLoseInfluence',
    challengeable: true,
    blockable: false,
    cost: 1,
    target: 'other',
  }),
  thief: (): CharacterAction => ({
    id: 'thiefSteal',
    label: 'Steal 2 coins',
    effect: 'stealCoins',
    amount: 2,
    challengeable: true,
    blockable: true,
    cost: 0,
    target: 'other',
  }),
  inquisitor: (): CharacterAction => ({
    id: 'inquisitorExchange',
    label: 'Exchange 1 with the deck OR peek a target',
    effect: 'inquisitorExchange',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  spy: (): CharacterAction => ({
    id: 'spyPeek',
    label: 'Privately peek a target hand',
    effect: 'spyPeek',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'other',
  }),
  plantation: (): CharacterAction => ({
    id: 'plantationIncome',
    label: 'Income +1 per living influence you hold',
    effect: 'plantationIncome',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
};

// ----------------------------------------------------------------------------
// CHARACTERS
// ----------------------------------------------------------------------------

export const CHARACTERS: Record<CoupCharacter, CharacterSpec> = {
  // === Classic =============================================================
  duke: {
    id: 'duke',
    name: 'Duke',
    pack: 'classic',
    category: 'classic',
    action: ACT.duke(),
    blocks: [{ blocks: 'foreignAid' }],
    description: 'Tax: take 3 coins from the treasury. Blocks Foreign Aid.',
    implemented: true,
  },
  assassin: {
    id: 'assassin',
    name: 'Assassin',
    pack: 'classic',
    category: 'classic',
    action: ACT.assassin(),
    blocks: [],
    description: 'Pay 3 coins, force a player to lose an influence. Blocked by Contessa.',
    implemented: true,
  },
  captain: {
    id: 'captain',
    name: 'Captain',
    pack: 'classic',
    category: 'classic',
    action: ACT.captain(),
    blocks: [{ blocks: 'steal' }],
    description: 'Steal 2 coins from another player. Blocks Steal.',
    implemented: true,
  },
  ambassador: {
    id: 'ambassador',
    name: 'Ambassador',
    pack: 'classic',
    category: 'classic',
    action: ACT.ambassador(),
    blocks: [{ blocks: 'steal' }],
    description: 'Exchange — draw 2 from the deck, keep any, return 2. Blocks Steal (classic only).',
    implemented: true,
  },
  contessa: {
    id: 'contessa',
    name: 'Contessa',
    pack: 'classic',
    category: 'classic',
    action: null,
    blocks: [{ blocks: 'assassinate' }],
    description: 'Blocks Assassinate. No active action.',
    implemented: true,
  },

  // === G54 Finance =========================================================
  banker: {
    id: 'banker',
    name: 'Banker',
    pack: 'g54',
    category: 'finance',
    action: ACT.banker(),
    blocks: [{ blocks: 'foreignAid' }],
    description: 'Levy +3 coins. Blocks Foreign Aid. (G54 Duke analogue.)',
    implemented: true,
  },
  capitalist: {
    id: 'capitalist',
    name: 'Capitalist',
    pack: 'g54',
    category: 'finance',
    action: null,
    blocks: [],
    description:
      'Pile-on +4 income; any opponent may join (and risk challenge). Coming soon — needs the pile-on window.',
    implemented: false,
  },
  speculator: {
    id: 'speculator',
    name: 'Speculator',
    pack: 'g54',
    category: 'finance',
    action: null,
    blocks: [],
    description:
      'Take coins equal to your own coin count (max 5). Failed challenge → those coins go to the challenger. Coming soon — needs custom resolve.',
    implemented: false,
  },
  treasurer: {
    id: 'treasurer',
    name: 'Treasurer',
    pack: 'g54',
    category: 'finance',
    action: null,
    blocks: [],
    description: 'Move coins between players + the treasury. Coming soon — non-standard target shape.',
    implemented: false,
  },
  taxCollector: {
    id: 'taxCollector',
    name: 'Tax Collector',
    pack: 'g54',
    category: 'finance',
    action: ACT.taxCollector(),
    blocks: [],
    description: 'Levy: every other living player pays you 1 coin (skipped if they have 0).',
    implemented: true,
  },

  // === G54 Communications ==================================================
  newscaster: {
    id: 'newscaster',
    name: 'Newscaster',
    pack: 'g54',
    category: 'communications',
    action: null,
    blocks: [],
    description: 'Pay 1; secretly swap a card via a 3-card peek. Coming soon.',
    implemented: false,
  },
  reporter: {
    id: 'reporter',
    name: 'Reporter',
    pack: 'g54',
    category: 'communications',
    action: null,
    blocks: [],
    description: 'Peek + force a redraw on a target. Coming soon.',
    implemented: false,
  },
  producer: {
    id: 'producer',
    name: 'Producer',
    pack: 'g54',
    category: 'communications',
    action: null,
    blocks: [],
    description: '1 from the deck + 1 from a target; secret swap. Coming soon.',
    implemented: false,
  },
  lobbyist: {
    id: 'lobbyist',
    name: 'Lobbyist',
    pack: 'g54',
    category: 'communications',
    action: null,
    blocks: [],
    description: 'Force a trade with a target. Coming soon.',
    implemented: false,
  },
  spy: {
    id: 'spy',
    name: 'Spy',
    pack: 'g54',
    category: 'communications',
    action: ACT.spy(),
    blocks: [],
    description:
      'Privately peek one of a target\'s face-down cards. The result is shown only to you.',
    implemented: true,
  },

  // === G54 Force ===========================================================
  assassinG54: {
    id: 'assassinG54',
    name: 'Assassin (G54)',
    pack: 'g54',
    category: 'force',
    action: ACT.assassin(),
    blocks: [],
    description: 'G54 reprint of the classic Assassin. Blocked only by Assassin in G54.',
    implemented: false,
  },
  mercenary: {
    id: 'mercenary',
    name: 'Mercenary',
    pack: 'g54',
    category: 'force',
    action: ACT.mercenary(),
    blocks: [],
    description:
      'Hire-to-kill: you and a chosen partner each pay 1; target loses an influence. Same-role challenges only.',
    implemented: true,
  },
  soldier: {
    id: 'soldier',
    name: 'Soldier',
    pack: 'g54',
    category: 'force',
    action: ACT.soldier(),
    blocks: [],
    description: 'Cheap eliminate: pay 3 to force a target to lose an influence. No block.',
    implemented: true,
  },
  guerrilla: {
    id: 'guerrilla',
    name: 'Guerrilla',
    pack: 'g54',
    category: 'force',
    action: null,
    blocks: [],
    description: 'Protected eliminate; only blockable by another Guerrilla. Coming soon.',
    implemented: false,
  },
  thief: {
    id: 'thief',
    name: 'Thief',
    pack: 'g54',
    category: 'force',
    action: ACT.thief(),
    blocks: [{ blocks: 'steal' }],
    description:
      'Steal 2 coins (G54 Captain analogue). Same-role only; failed challenge sends the coins to the challenger.',
    implemented: true,
  },

  // === G54 Special Interest ================================================
  judge: {
    id: 'judge',
    name: 'Judge',
    pack: 'g54',
    category: 'specialInterest',
    action: null,
    blocks: [{ blocks: 'coup' }],
    description: 'Blocks Coup by paying 7 coins to the treasury. Coming soon.',
    implemented: false,
  },
  mayor: {
    id: 'mayor',
    name: 'Mayor',
    pack: 'g54',
    category: 'specialInterest',
    action: null,
    blocks: [],
    description: 'Passive economic boost. Coming soon.',
    implemented: false,
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    pack: 'g54',
    category: 'specialInterest',
    action: null,
    blocks: [],
    description: 'Resurrect / soft-protect. Coming soon.',
    implemented: false,
  },
  lawyer: {
    id: 'lawyer',
    name: 'Lawyer',
    pack: 'g54',
    category: 'specialInterest',
    action: null,
    blocks: [],
    description: 'Force a challenge resolution swing. Coming soon.',
    implemented: false,
  },
  bishop: {
    id: 'bishop',
    name: 'Bishop',
    pack: 'g54',
    category: 'specialInterest',
    action: null,
    blocks: [],
    description: 'Mass-block role on entire action categories. Coming soon.',
    implemented: false,
  },

  // === G54 Movement ========================================================
  inquisitor: {
    id: 'inquisitor',
    name: 'Inquisitor',
    pack: 'g54',
    category: 'movement',
    action: ACT.inquisitor(),
    blocks: [{ blocks: 'steal' }],
    description:
      'Either exchange ONE card with the deck, OR look at one of a target\'s cards and force them to keep / discard it. Blocks Steal.',
    implemented: true,
  },
  protestor: {
    id: 'protestor',
    name: 'Protestor',
    pack: 'g54',
    category: 'movement',
    action: null,
    blocks: [],
    description: 'Group-rally eliminate: opponents may chip in coins. Coming soon.',
    implemented: false,
  },
  peacekeeper: {
    id: 'peacekeeper',
    name: 'Peacekeeper',
    pack: 'g54',
    category: 'movement',
    action: null,
    blocks: [],
    description:
      'Take the Peacekeeping token — you can\'t be targeted while holding it. Coming soon — needs token wiring.',
    implemented: false,
  },
  foreignConsular: {
    id: 'foreignConsular',
    name: 'Foreign Consular',
    pack: 'g54',
    category: 'movement',
    action: null,
    blocks: [],
    description: 'Distribute 2 Treaty tokens; treatied pairs can\'t target each other. Coming soon.',
    implemented: false,
  },
  diplomat: {
    id: 'diplomat',
    name: 'Diplomat',
    pack: 'g54',
    category: 'movement',
    action: null,
    blocks: [],
    description: 'Forces a mutual card swap. Coming soon.',
    implemented: false,
  },

  // === G54 Anarchy =========================================================
  anarchist: {
    id: 'anarchist',
    name: 'Anarchist',
    pack: 'anarchy',
    category: 'anarchy',
    action: null,
    blocks: [],
    description: 'Chaotic eliminate; cost is paid by everyone. Coming soon.',
    implemented: false,
  },
  armsDealer: {
    id: 'armsDealer',
    name: 'Arms Dealer',
    pack: 'anarchy',
    category: 'anarchy',
    action: null,
    blocks: [],
    description: 'Sell-influence / weapon tokens. Coming soon.',
    implemented: false,
  },
  financier: {
    id: 'financier',
    name: 'Financier',
    pack: 'anarchy',
    category: 'anarchy',
    action: null,
    blocks: [],
    description: 'Pile-on capitalist analogue with steeper challenge penalty. Coming soon.',
    implemented: false,
  },
  paramilitary: {
    id: 'paramilitary',
    name: 'Paramilitary',
    pack: 'anarchy',
    category: 'anarchy',
    action: null,
    blocks: [],
    description: 'Soft-power coup with a riot mechanic. Coming soon.',
    implemented: false,
  },
  plantationOwner: {
    id: 'plantationOwner',
    name: 'Plantation Owner',
    pack: 'anarchy',
    category: 'anarchy',
    action: ACT.plantation(),
    blocks: [],
    description:
      'Income engine: gain +1 coin per living influence you still hold (1-2 coins).',
    implemented: true,
  },
  socialist: {
    id: 'socialist',
    name: 'Socialist',
    pack: 'anarchy',
    category: 'anarchy',
    action: null,
    blocks: [],
    description: 'Wealth redistribution across living players. Coming soon.',
    implemented: false,
  },
  worldBank: {
    id: 'worldBank',
    name: 'World Bank',
    pack: 'anarchy',
    category: 'anarchy',
    action: null,
    blocks: [],
    description: 'Loans + debt tokens. Coming soon — rulebook resolution outstanding.',
    implemented: false,
  },
};

// ----------------------------------------------------------------------------
// Selection / curation helpers used by setup + module
// ----------------------------------------------------------------------------

export const CLASSIC_FIVE: CoupCharacter[] = [
  'duke',
  'assassin',
  'captain',
  'ambassador',
  'contessa',
];

export const G54_BASE_25: CoupCharacter[] = [
  'banker', 'capitalist', 'speculator', 'treasurer', 'taxCollector',
  'newscaster', 'reporter', 'producer', 'lobbyist', 'spy',
  'assassinG54', 'mercenary', 'soldier', 'guerrilla', 'thief',
  'judge', 'mayor', 'priest', 'lawyer', 'bishop',
  'inquisitor', 'protestor', 'peacekeeper', 'foreignConsular', 'diplomat',
];

export const G54_ANARCHY_6: CoupCharacter[] = [
  'anarchist', 'armsDealer', 'financier', 'paramilitary', 'plantationOwner', 'socialist',
  // worldBank intentionally excluded — rulebook source disputed
];

export function isImplemented(c: CoupCharacter): boolean {
  return CHARACTERS[c].implemented;
}

export function characterAction(c: CoupCharacter): CharacterAction | null {
  return CHARACTERS[c].action;
}

// Which active characters in the deck can block a given general action?
// Used during the awaitingBlock window.
export function blockersFor(
  active: readonly CoupCharacter[],
  blocks: 'foreignAid' | 'assassinate' | 'steal' | 'coup',
): CoupCharacter[] {
  return active.filter((c) => CHARACTERS[c].blocks.some((b) => b.blocks === blocks));
}
