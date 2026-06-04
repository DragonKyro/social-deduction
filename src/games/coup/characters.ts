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
// playable rules in this build. Characters whose rules are not explicitly
// drawn from a canonical rulebook source are prefixed `(house rule)` in their
// description so a player at the table isn't misled.
//
// Roles slot into 6 categories — Classic, Finance, Communications, Force,
// Special Interest, Movement (G54 base) — plus Anarchy (expansion). Canonical
// G54 plays with EXACTLY one character per category. We enforce the total
// (5 for Classic / G54, 6 for G54+Anarchy) at setup time, and warn (but do
// not block) when the category distribution drifts off one-per-category.
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
  | 'taxLevy'
  | 'soldierStrike'
  | 'mercenaryHire'
  | 'thiefSteal'
  | 'inquisitorExchange'
  | 'spyPeek'
  | 'plantationIncome' // Anarchy: Plantation Owner
  // G54 — new this milestone
  | 'pileOnIncome' // Capitalist / Financier
  | 'chipInEliminate' // Protestor / Anarchist
  | 'forceSwap' // Newscaster / Reporter / Producer / Lobbyist / Diplomat
  | 'customSteal' // Speculator (amount = own coins, capped)
  | 'wealthRedistribute' // Treasurer / Socialist / World Bank
  | 'protectedEliminate' // Guerrilla / Paramilitary
  | 'mayorIncome' // Mayor (+2 income passive when claim is honest)
  | 'priestRevive' // Priest — claim grants reviveBlessed token
  | 'lawyerSwing' // Lawyer — claim refunds 2 coins (lawyered up)
  | 'bishopBless' // Bishop — claim grants reviveBlessed + +1 coin
  | 'peacekeeperShield' // Peacekeeper — claim grants peacekeeping token to self
  | 'foreignConsularTreaty' // Foreign Consular — picks 2 partners, treaty pair
  | 'armsDealerSell' // Arms Dealer — sell influence for 4 coins + 1 weapon
  | 'paramilitaryRiot'; // Paramilitary — riot coup; pay 4 to eliminate (same-role block)

export type EffectKind =
  | 'gainCoins'
  | 'taxLevy'
  | 'forceLoseInfluence'
  | 'stealCoins'
  | 'exchange'
  | 'inquisitorExchange'
  | 'spyPeek'
  | 'plantationIncome'
  | 'pileOnIncome'
  | 'chipInEliminate'
  | 'forceSwap'
  | 'customSteal'
  | 'wealthRedistribute'
  | 'protectedEliminate'
  | 'mayorIncome'
  | 'priestRevive'
  | 'lawyerSwing'
  | 'bishopBless'
  | 'peacekeeperShield'
  | 'foreignConsularTreaty'
  | 'armsDealerSell'
  | 'paramilitaryRiot';

export interface CharacterAction {
  id: CharacterActionId;
  label: string;
  effect: EffectKind;
  amount?: number;
  challengeable: boolean;
  blockable: boolean;
  cost: number;
  target: 'self' | 'other' | 'pair';
}

export interface CharacterBlock {
  blocks: 'foreignAid' | 'assassinate' | 'steal' | 'coup';
}

export interface CharacterSpec {
  id: CoupCharacter;
  name: string;
  pack: CoupPack;
  category: CoupCategory;
  action: CharacterAction | null;
  blocks: CharacterBlock[];
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
  capitalist: (): CharacterAction => ({
    id: 'pileOnIncome',
    label: 'Pile-on: +2 coins; others may join',
    effect: 'pileOnIncome',
    amount: 2,
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  financier: (): CharacterAction => ({
    id: 'pileOnIncome',
    label: 'Pile-on: +3 coins; others may join (Anarchy)',
    effect: 'pileOnIncome',
    amount: 3,
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  speculator: (): CharacterAction => ({
    id: 'customSteal',
    label: 'Steal coins equal to your own (max 5)',
    effect: 'customSteal',
    challengeable: true,
    blockable: true,
    cost: 0,
    target: 'other',
  }),
  treasurer: (): CharacterAction => ({
    id: 'wealthRedistribute',
    label: 'Equalize coins between yourself and target',
    effect: 'wealthRedistribute',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'other',
  }),
  newscaster: (): CharacterAction => ({
    id: 'forceSwap',
    label: 'Pay 1: peek a target card and force-swap it (house rule)',
    effect: 'forceSwap',
    challengeable: true,
    blockable: false,
    cost: 1,
    target: 'other',
  }),
  reporter: (): CharacterAction => ({
    id: 'forceSwap',
    label: 'Peek a target card and force-swap it (house rule)',
    effect: 'forceSwap',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'other',
  }),
  producer: (): CharacterAction => ({
    id: 'forceSwap',
    label: 'Draw 1 + force-swap a target card (house rule)',
    effect: 'forceSwap',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'other',
  }),
  lobbyist: (): CharacterAction => ({
    id: 'forceSwap',
    label: 'Force-trade one card with a target (house rule)',
    effect: 'forceSwap',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'other',
  }),
  diplomat: (): CharacterAction => ({
    id: 'forceSwap',
    label: 'Force-swap one of a target\'s cards with the deck (house rule)',
    effect: 'forceSwap',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'other',
  }),
  protestor: (): CharacterAction => ({
    id: 'chipInEliminate',
    label: 'Rally: opponents may chip 1 coin each (house rule)',
    effect: 'chipInEliminate',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'other',
  }),
  anarchist: (): CharacterAction => ({
    id: 'chipInEliminate',
    label: 'Riot: opponents may chip 1 coin each (Anarchy, house rule)',
    effect: 'chipInEliminate',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'other',
  }),
  guerrilla: (): CharacterAction => ({
    id: 'protectedEliminate',
    label: 'Pay 3: eliminate target; only Guerrilla can block (house rule)',
    effect: 'protectedEliminate',
    challengeable: true,
    blockable: true,
    cost: 3,
    target: 'other',
  }),
  paramilitary: (): CharacterAction => ({
    id: 'paramilitaryRiot',
    label: 'Pay 4: riot-coup; only Paramilitary can block (Anarchy, house rule)',
    effect: 'paramilitaryRiot',
    challengeable: true,
    blockable: true,
    cost: 4,
    target: 'other',
  }),
  assassinG54: (): CharacterAction => ({
    id: 'assassinate',
    label: 'Assassinate (pay 3) — same-role block only in G54',
    effect: 'forceLoseInfluence',
    challengeable: true,
    blockable: true,
    cost: 3,
    target: 'other',
  }),
  mayor: (): CharacterAction => ({
    id: 'mayorIncome',
    label: 'Mayor income (+2 coins)',
    effect: 'mayorIncome',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  priest: (): CharacterAction => ({
    id: 'priestRevive',
    label: 'Bless: grant a target an extra-life token (house rule)',
    effect: 'priestRevive',
    challengeable: true,
    blockable: false,
    cost: 1,
    target: 'other',
  }),
  lawyer: (): CharacterAction => ({
    id: 'lawyerSwing',
    label: '+2 coins; grants you a reviveBlessed token (house rule)',
    effect: 'lawyerSwing',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  bishop: (): CharacterAction => ({
    id: 'bishopBless',
    label: '+1 coin and grant yourself reviveBlessed (house rule)',
    effect: 'bishopBless',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  peacekeeper: (): CharacterAction => ({
    id: 'peacekeeperShield',
    label: 'Take the Peacekeeping token — untargetable until your next turn',
    effect: 'peacekeeperShield',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  foreignConsular: (): CharacterAction => ({
    id: 'foreignConsularTreaty',
    label: 'Place Treaty between two seats — they can\'t target each other',
    effect: 'foreignConsularTreaty',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'pair',
  }),
  armsDealer: (): CharacterAction => ({
    id: 'armsDealerSell',
    label: 'Sell an influence for 4 coins + 1 weapon token (house rule)',
    effect: 'armsDealerSell',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  socialist: (): CharacterAction => ({
    id: 'wealthRedistribute',
    label: 'Equalize coins across all living players (house rule)',
    effect: 'wealthRedistribute',
    challengeable: true,
    blockable: false,
    cost: 0,
    target: 'self',
  }),
  worldBank: (): CharacterAction => ({
    id: 'wealthRedistribute',
    label: '+1 coin to every living player (house rule)',
    effect: 'wealthRedistribute',
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
    action: ACT.capitalist(),
    blocks: [],
    description:
      '+2 coins; opens a pile-on window where any opponent claiming Capitalist may join for +2 themselves (each subject to challenge).',
    implemented: true,
  },
  speculator: {
    id: 'speculator',
    name: 'Speculator',
    pack: 'g54',
    category: 'finance',
    action: ACT.speculator(),
    blocks: [{ blocks: 'steal' }],
    description:
      'Steal coins equal to your own current coin count, max 5 (house rule). Also blocks Steal — same-role only in G54.',
    implemented: true,
  },
  treasurer: {
    id: 'treasurer',
    name: 'Treasurer',
    pack: 'g54',
    category: 'finance',
    action: ACT.treasurer(),
    blocks: [],
    description:
      'Average your coins with a target (you both end at floor((a+b)/2); extra goes to you) — house rule.',
    implemented: true,
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
    action: ACT.newscaster(),
    blocks: [],
    description:
      '(house rule) Pay 1; peek one of a target\'s cards and force-swap it with a deck draw.',
    implemented: true,
  },
  reporter: {
    id: 'reporter',
    name: 'Reporter',
    pack: 'g54',
    category: 'communications',
    action: ACT.reporter(),
    blocks: [],
    description:
      '(house rule) Peek a target\'s card and force them to swap that slot with a freshly-drawn card.',
    implemented: true,
  },
  producer: {
    id: 'producer',
    name: 'Producer',
    pack: 'g54',
    category: 'communications',
    action: ACT.producer(),
    blocks: [],
    description:
      '(house rule) Draw one from the deck and force a target to swap one of their cards with it.',
    implemented: true,
  },
  lobbyist: {
    id: 'lobbyist',
    name: 'Lobbyist',
    pack: 'g54',
    category: 'communications',
    action: ACT.lobbyist(),
    blocks: [],
    description: '(house rule) Force-trade a card: a target swaps one of their face-down cards with a deck draw.',
    implemented: true,
  },
  spy: {
    id: 'spy',
    name: 'Spy',
    pack: 'g54',
    category: 'communications',
    action: ACT.spy(),
    blocks: [],
    description: 'Privately peek one of a target\'s face-down cards. The result is shown only to you.',
    implemented: true,
  },

  // === G54 Force ===========================================================
  assassinG54: {
    id: 'assassinG54',
    name: 'Assassin (G54)',
    pack: 'g54',
    category: 'force',
    action: ACT.assassinG54(),
    blocks: [{ blocks: 'assassinate' }],
    description: 'G54 reprint of Assassin. In G54 only Assassin blocks Assassinate.',
    implemented: true,
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
    action: ACT.guerrilla(),
    blocks: [{ blocks: 'coup' }],
    description: '(house rule) Pay 3: eliminate; only another Guerrilla may block this strike.',
    implemented: true,
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
    description: 'Blocks Coup: cancel an incoming Coup (Coup attacker still spends the 7 coins).',
    implemented: true,
  },
  mayor: {
    id: 'mayor',
    name: 'Mayor',
    pack: 'g54',
    category: 'specialInterest',
    action: ACT.mayor(),
    blocks: [],
    description: '+2 coins (Mayor income). Honest Mayor claims can\'t be Foreign-Aid-blocked.',
    implemented: true,
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    pack: 'g54',
    category: 'specialInterest',
    action: ACT.priest(),
    blocks: [{ blocks: 'assassinate' }],
    description:
      '(house rule) Pay 1: bless a target — they gain a reviveBlessed token. If they would lose their last influence, the token is spent and they keep that card face-down. Also blocks Assassinate.',
    implemented: true,
  },
  lawyer: {
    id: 'lawyer',
    name: 'Lawyer',
    pack: 'g54',
    category: 'specialInterest',
    action: ACT.lawyer(),
    blocks: [{ blocks: 'assassinate' }, { blocks: 'coup' }],
    description:
      '(house rule) +2 coins and gain a reviveBlessed token. Blocks Assassinate AND Coup (canonical "lawyered up").',
    implemented: true,
  },
  bishop: {
    id: 'bishop',
    name: 'Bishop',
    pack: 'g54',
    category: 'specialInterest',
    action: ACT.bishop(),
    blocks: [{ blocks: 'steal' }, { blocks: 'foreignAid' }],
    description: '(house rule) +1 coin and grant yourself a reviveBlessed token. Blocks Steal AND Foreign Aid.',
    implemented: true,
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
    action: ACT.protestor(),
    blocks: [],
    description:
      '(house rule) Rally a group eliminate: opponents may chip in 1 coin each. When half or more of living opponents have chipped in, the target loses an influence.',
    implemented: true,
  },
  peacekeeper: {
    id: 'peacekeeper',
    name: 'Peacekeeper',
    pack: 'g54',
    category: 'movement',
    action: ACT.peacekeeper(),
    blocks: [],
    description: 'Take the Peacekeeping token — you can\'t be targeted by any opponent until your next turn starts.',
    implemented: true,
  },
  foreignConsular: {
    id: 'foreignConsular',
    name: 'Foreign Consular',
    pack: 'g54',
    category: 'movement',
    action: ACT.foreignConsular(),
    blocks: [],
    description:
      'Place a Treaty between two other living seats — they can\'t target each other until the treaty expires (end of your next turn).',
    implemented: true,
  },
  diplomat: {
    id: 'diplomat',
    name: 'Diplomat',
    pack: 'g54',
    category: 'movement',
    action: ACT.diplomat(),
    blocks: [],
    description:
      '(house rule) Force a target to swap one of their cards with a freshly drawn deck card. You see the new card.',
    implemented: true,
  },

  // === G54 Anarchy =========================================================
  anarchist: {
    id: 'anarchist',
    name: 'Anarchist',
    pack: 'anarchy',
    category: 'anarchy',
    action: ACT.anarchist(),
    blocks: [],
    description:
      '(house rule) Anarchy rally: opponents may chip 1 coin each. With half-or-more contributors, target loses an influence — chip-in coins go to the treasury (anarchy).',
    implemented: true,
  },
  armsDealer: {
    id: 'armsDealer',
    name: 'Arms Dealer',
    pack: 'anarchy',
    category: 'anarchy',
    action: ACT.armsDealer(),
    blocks: [],
    description:
      '(house rule) Voluntarily flip one of your face-down cards to gain 4 coins and a weapon token. Each weapon adds +1 to your steals (capped at +3).',
    implemented: true,
  },
  financier: {
    id: 'financier',
    name: 'Financier',
    pack: 'anarchy',
    category: 'anarchy',
    action: ACT.financier(),
    blocks: [],
    description:
      '(house rule) Anarchy pile-on: +3 coins; opens a pile-on window where joiners claim Financier for +3 themselves.',
    implemented: true,
  },
  paramilitary: {
    id: 'paramilitary',
    name: 'Paramilitary',
    pack: 'anarchy',
    category: 'anarchy',
    action: ACT.paramilitary(),
    blocks: [{ blocks: 'coup' }],
    description:
      '(house rule) Pay 4 for a riot-coup that only another Paramilitary may block. Also blocks Coup.',
    implemented: true,
  },
  plantationOwner: {
    id: 'plantationOwner',
    name: 'Plantation Owner',
    pack: 'anarchy',
    category: 'anarchy',
    action: ACT.plantation(),
    blocks: [],
    description: 'Income engine: gain +1 coin per living influence you still hold (1-2 coins).',
    implemented: true,
  },
  socialist: {
    id: 'socialist',
    name: 'Socialist',
    pack: 'anarchy',
    category: 'anarchy',
    action: ACT.socialist(),
    blocks: [],
    description:
      '(house rule) Pool all living players\' coins and redistribute evenly (remainder goes to you).',
    implemented: true,
  },
  worldBank: {
    id: 'worldBank',
    name: 'World Bank',
    pack: 'anarchy',
    category: 'anarchy',
    action: ACT.worldBank(),
    blocks: [],
    description: '(house rule) Every living player gains +1 coin (including you).',
    implemented: true,
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
  // worldBank intentionally listed last; total Anarchy pool is 7.
  'worldBank',
];

// Canonical G54 balanced default = one character per base category.
export const G54_BALANCED_DEFAULT: CoupCharacter[] = [
  'banker',          // finance
  'spy',             // communications
  'soldier',         // force
  'judge',           // specialInterest
  'inquisitor',      // movement
];

// Anarchy balanced default = G54 balanced + one anarchy.
export const G54_ANARCHY_BALANCED_DEFAULT: CoupCharacter[] = [
  ...G54_BALANCED_DEFAULT,
  'plantationOwner',
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

// Category histogram for a character set. Used by the setup UI to surface
// "off-balance" warnings without blocking play.
export function categoryHistogram(
  chars: readonly CoupCharacter[],
): Record<CoupCategory, number> {
  const out: Record<CoupCategory, number> = {
    classic: 0,
    finance: 0,
    communications: 0,
    force: 0,
    specialInterest: 0,
    movement: 0,
    anarchy: 0,
  };
  for (const c of chars) out[CHARACTERS[c].category] += 1;
  return out;
}
