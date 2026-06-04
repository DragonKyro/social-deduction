import { makeRng, rngShuffle } from '@/engine/rng';
import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { CoupGameAction } from './actions';
import { CHARACTERS, blockersFor } from './characters';
import { buildInitialState, validateCharacterSet } from './setup';
import type {
  CoupCharacter,
  CoupPendingAction,
  CoupPrivateState,
  CoupPublicState,
  CoupRuleset,
  CoupSeatState,
  GeneralActionId,
} from './state';

export interface CoupSeatConfig {
  name: string;
  isAI: boolean;
}

export interface CoupOptions {
  // Local-host seat list. AI flag scaffolded (no AI yet).
  players: CoupSeatConfig[];
  // Classic 5-character base, or G54 25-character pool.
  ruleset: CoupRuleset;
  // G54 only. 'anarchy' adds 6 characters and the Social Media general
  // action. Empty in classic.
  expansions: Array<'anarchy'>;
  // Exact list of characters that go into the deck this match. Each entry
  // contributes 3 deck copies. For classic this is the canonical 5; for G54
  // / Anarchy the host can curate any 5-8 implemented characters.
  characters: CoupCharacter[];
}

function getOptions(config: GameConfig): CoupOptions {
  return config.gameOptions as unknown as CoupOptions;
}

// ============================================================================
// Helpers
// ============================================================================

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function livingSeats(state: CoupPrivateState): SeatIndex[] {
  return state.seats.filter((s) => !s.eliminated).map((s) => s.index);
}

function livingInfluenceCount(seat: CoupSeatState): number {
  return seat.influences.filter((i) => !i.revealed).length;
}

function appendLog(state: CoupPrivateState, line: string) {
  state.log.push(line);
  if (state.log.length > 50) state.log.shift();
}

function nextLivingAfter(state: CoupPrivateState, from: SeatIndex): SeatIndex {
  const n = state.seats.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!state.seats[idx]!.eliminated) return idx;
  }
  return from;
}

// Draw a card from the deck. Mutates `state.deck`.
function drawCard(state: CoupPrivateState): CoupCharacter {
  if (state.deck.length === 0) {
    throw new Error('Deck is empty');
  }
  return state.deck.shift()!;
}

// Return a card to the deck and reshuffle deterministically. Uses the
// `rngCursor` so multiple shuffles within a game still produce different
// orders.
function returnAndShuffle(state: CoupPrivateState, cards: CoupCharacter[]) {
  state.deck.push(...cards);
  state.rngCursor = (state.rngCursor + 0x9e3779b9) >>> 0;
  const rng = makeRng(state.rngCursor);
  state.deck = rngShuffle(rng, state.deck);
}

function emptyPending(by: SeatIndex): CoupPendingAction {
  return {
    by,
    claimedCharacter: null,
    kind: 'general',
    generalId: null,
    characterActionId: null,
    target: null,
    blocker: null,
    passes: [],
    mercenaryPartner: null,
    inquisitorBranch: null,
    inquisitorPeekCardIndex: null,
    spyPeekCardIndex: null,
    loseInfluencePending: null,
  };
}

// Window participants: every LIVING seat other than the claimant (and for
// block-challenge, other than the blocker themselves).
function challengeWindowParticipants(state: CoupPrivateState, exclude: SeatIndex[]): SeatIndex[] {
  return livingSeats(state).filter((s) => !exclude.includes(s));
}

// Check whether the seat actually holds the claimed character.
function seatHas(seat: CoupSeatState, character: CoupCharacter): boolean {
  return seat.influences.some((i) => !i.revealed && i.char === character);
}

// Mark an influence card as revealed (lost).
function loseInfluencePick(seat: CoupSeatState, cardIndex: 0 | 1): boolean {
  const card = seat.influences[cardIndex];
  if (!card || card.revealed) return false;
  card.revealed = true;
  if (livingInfluenceCount(seat) === 0) {
    seat.eliminated = true;
  }
  return true;
}

// Pick any unrevealed card to drop (used when no choice is necessary, e.g.
// last living card).
function loseAnyInfluence(seat: CoupSeatState): boolean {
  const idx = seat.influences.findIndex((i) => !i.revealed);
  if (idx === -1) return false;
  return loseInfluencePick(seat, idx as 0 | 1);
}

// After applying an effect, check for game-over. If exactly one seat is
// still living, that seat wins.
function checkWin(state: CoupPrivateState) {
  const alive = state.seats.filter((s) => !s.eliminated);
  if (alive.length === 1) {
    state.winnerSeat = alive[0]!.index;
    state.phase = 'gameOver';
    appendLog(state, `${alive[0]!.name} wins!`);
  }
}

// ============================================================================
// Effect resolution — runs after challenges + blocks settle.
// ============================================================================

function resolveEffect(state: CoupPrivateState) {
  const p = state.pending;
  if (!p) return;
  const by = state.seats[p.by]!;

  if (p.kind === 'general') {
    switch (p.generalId) {
      case 'income':
        by.coins += 1;
        appendLog(state, `${by.name} took Income (+1).`);
        return endTurn(state);
      case 'foreignAid':
        by.coins += 2;
        appendLog(state, `${by.name} took Foreign Aid (+2).`);
        return endTurn(state);
      case 'coup': {
        // Cost was paid up-front at declare. Target must lose an influence.
        const target = state.seats[p.target!]!;
        appendLog(state, `${by.name} couped ${target.name}.`);
        if (livingInfluenceCount(target) <= 1) {
          loseAnyInfluence(target);
          checkWin(state);
          if (state.phase !== 'gameOver') endTurn(state);
          return;
        }
        p.loseInfluencePending = { seat: target.index, reason: 'coup' };
        state.phase = 'loseInfluence';
        return;
      }
      default:
        return endTurn(state);
    }
  }

  // Character actions.
  switch (p.characterActionId) {
    case 'tax': {
      // Duke / Banker
      by.coins += 3;
      appendLog(state, `${by.name} taxed +3 as ${characterLabel(p.claimedCharacter)}.`);
      return endTurn(state);
    }
    case 'taxLevy': {
      // Tax Collector: 1 from every other living player (skip 0-coin players).
      let total = 0;
      for (const s of state.seats) {
        if (s.index === by.index || s.eliminated) continue;
        if (s.coins > 0) {
          s.coins -= 1;
          total += 1;
        }
      }
      by.coins += total;
      appendLog(state, `${by.name} (Tax Collector) levied ${total} coin${total === 1 ? '' : 's'}.`);
      return endTurn(state);
    }
    case 'assassinate': {
      const target = state.seats[p.target!]!;
      // Cost (3) was already paid at declare.
      appendLog(state, `${by.name} assassinated ${target.name}.`);
      if (livingInfluenceCount(target) <= 1) {
        loseAnyInfluence(target);
        checkWin(state);
        if (state.phase !== 'gameOver') endTurn(state);
        return;
      }
      p.loseInfluencePending = { seat: target.index, reason: 'assassinate' };
      state.phase = 'loseInfluence';
      return;
    }
    case 'soldierStrike': {
      const target = state.seats[p.target!]!;
      appendLog(state, `${by.name} (Soldier) struck ${target.name}.`);
      if (livingInfluenceCount(target) <= 1) {
        loseAnyInfluence(target);
        checkWin(state);
        if (state.phase !== 'gameOver') endTurn(state);
        return;
      }
      p.loseInfluencePending = { seat: target.index, reason: 'soldier' };
      state.phase = 'loseInfluence';
      return;
    }
    case 'mercenaryHire': {
      const target = state.seats[p.target!]!;
      appendLog(
        state,
        `${by.name} + ${
          state.seats[p.mercenaryPartner!]?.name ?? '???'
        } (Mercenary) struck ${target.name}.`,
      );
      if (livingInfluenceCount(target) <= 1) {
        loseAnyInfluence(target);
        checkWin(state);
        if (state.phase !== 'gameOver') endTurn(state);
        return;
      }
      p.loseInfluencePending = { seat: target.index, reason: 'mercenary' };
      state.phase = 'loseInfluence';
      return;
    }
    case 'steal':
    case 'thiefSteal': {
      const target = state.seats[p.target!]!;
      const take = Math.min(2, target.coins);
      target.coins -= take;
      by.coins += take;
      appendLog(state, `${by.name} stole ${take} coin${take === 1 ? '' : 's'} from ${target.name}.`);
      return endTurn(state);
    }
    case 'exchange': {
      // Ambassador: draw 2, combine with hand (only the unrevealed cards),
      // keep N (= living-influence count), return rest.
      const drawn = [drawCard(state), drawCard(state)];
      const live = by.influences.filter((i) => !i.revealed).map((i) => i.char);
      state.exchangeOffer = {
        cards: [...live, ...drawn],
        keepCount: live.length,
      };
      state.phase = 'exchangePick';
      appendLog(state, `${by.name} exchanged with the deck.`);
      return;
    }
    case 'inquisitorExchange': {
      if (p.inquisitorBranch === 'peek') {
        // Inquisitor opted to peek a target instead of exchange.
        const target = state.seats[p.target!]!;
        const idx = (p.inquisitorPeekCardIndex ?? 0) as 0 | 1;
        const card = target.influences[idx];
        if (!card) {
          return endTurn(state);
        }
        // Record peek in spy log so the active seat sees it in their view.
        state.privatePeeks[by.index]!.push({
          byActionId: 'inquisitorPeek',
          target: target.index,
          card: card.char,
          cardIndex: idx,
        });
        appendLog(state, `${by.name} (Inquisitor) peeked at ${target.name}.`);
        state.phase = 'spyPeek'; // reuse the peek-ack screen
        return;
      }
      // Default branch: exchange 1 card with the deck.
      const drawn = [drawCard(state)];
      const live = by.influences.filter((i) => !i.revealed).map((i) => i.char);
      state.exchangeOffer = {
        cards: [...live, ...drawn],
        keepCount: live.length,
      };
      state.phase = 'exchangePick';
      appendLog(state, `${by.name} exchanged with the deck.`);
      return;
    }
    case 'spyPeek': {
      const target = state.seats[p.target!]!;
      const idx = (p.spyPeekCardIndex ?? 0) as 0 | 1;
      const card = target.influences[idx];
      if (!card) {
        return endTurn(state);
      }
      state.privatePeeks[by.index]!.push({
        byActionId: 'spyPeek',
        target: target.index,
        card: card.char,
        cardIndex: idx,
      });
      appendLog(state, `${by.name} (Spy) peeked at ${target.name}.`);
      state.phase = 'spyPeek';
      return;
    }
    case 'plantationIncome': {
      const bonus = livingInfluenceCount(by);
      by.coins += bonus;
      appendLog(state, `${by.name} (Plantation Owner) gained +${bonus}.`);
      return endTurn(state);
    }
    default:
      return endTurn(state);
  }
}

function characterLabel(c: CoupCharacter | null): string {
  return c ? CHARACTERS[c].name : '???';
}

// ============================================================================
// End-of-turn bookkeeping. Drop pending state, rotate to next living seat.
// ============================================================================

function endTurn(state: CoupPrivateState) {
  // If exchange resolved, free the offer.
  state.exchangeOffer = null;
  // Block penalty refunds: assassinations that were blocked don't refund
  // (the assassin already lost 3 coins to declare). Other actions have no
  // up-front cost.
  state.pending = null;
  if (state.phase === 'gameOver') return;
  // Eliminate the current seat if they've been removed.
  state.currentSeat = nextLivingAfter(state, state.currentSeat);
  state.phase = 'turnStart';
  // 10-coin rule: if any player starts their turn with 10+ coins, they MUST
  // coup. We enforce by setting a flag the UI uses (the host still requires
  // a `declareGeneral` with 'coup', but the UI hides every other option).
  // No flag needed — UI reads coins.
}

// ============================================================================
// Block check helpers — does the current state's character/block window
// have any participants left?
// ============================================================================

function challengeWindowFinished(state: CoupPrivateState, pendingPasses: SeatIndex[], exclude: SeatIndex[]): boolean {
  const participants = challengeWindowParticipants(state, exclude);
  return participants.every((p) => pendingPasses.includes(p));
}

// What characters can block the pending action (for the awaitingBlock window)?
function pendingBlockers(state: CoupPrivateState): CoupCharacter[] {
  const p = state.pending;
  if (!p) return [];
  if (p.kind === 'general') {
    if (p.generalId === 'foreignAid') {
      return blockersFor(state.activeCharacters, 'foreignAid');
    }
    if (p.generalId === 'coup') {
      // Judge in G54+ can block. Not in classic. (Judge not implemented yet,
      // so this list will be empty.)
      return state.ruleset === 'g54' ? blockersFor(state.activeCharacters, 'coup') : [];
    }
    return [];
  }
  // Character actions.
  if (p.characterActionId === 'assassinate') {
    return blockersFor(state.activeCharacters, 'assassinate');
  }
  if (p.characterActionId === 'steal' || p.characterActionId === 'thiefSteal') {
    return blockersFor(state.activeCharacters, 'steal');
  }
  return [];
}

function isActionBlockable(state: CoupPrivateState): boolean {
  return pendingBlockers(state).length > 0;
}

function isActionChallengeable(state: CoupPrivateState): boolean {
  const p = state.pending;
  if (!p) return false;
  if (p.kind === 'general') return false;
  return true;
}

// ============================================================================
// Module
// ============================================================================

export const coupModule: GameModule<CoupPrivateState, CoupPublicState, CoupGameAction> = {
  id: 'coup',
  displayName: 'Coup',
  minPlayers: 2,
  maxPlayers: 6,

  createInitialState(config: GameConfig): CoupPrivateState {
    const opts = getOptions(config);
    const players = opts.players ?? [];
    const playerCount = players.length;
    if (playerCount < this.minPlayers || playerCount > this.maxPlayers) {
      throw new Error(`Coup requires ${this.minPlayers}-${this.maxPlayers} players (got ${playerCount})`);
    }
    const setError = validateCharacterSet(opts.characters);
    if (setError) throw new Error(setError);
    return buildInitialState(
      playerCount,
      opts.characters,
      players.map((p) => p.name),
      config.seed,
      opts.ruleset,
      opts.expansions,
    );
  },

  applyAction(state: CoupPrivateState, action: CoupGameAction): CoupPrivateState {
    const next = clone(state);
    apply(next, action);
    return next;
  },

  viewFor(state: CoupPrivateState, seat: SeatIndex | null): CoupPublicState {
    const own = seat === null ? null : state.seats[seat] ?? null;
    return {
      phase: state.phase,
      ruleset: state.ruleset,
      expansions: state.expansions,
      activeCharacters: state.activeCharacters,
      seats: state.seats.map((s) => ({
        index: s.index,
        name: s.name,
        coins: s.coins,
        influences: s.influences.map((inf) =>
          inf.revealed ? { char: inf.char, revealed: true } : { char: null, revealed: false },
        ),
        eliminated: s.eliminated,
        tokens: s.tokens,
      })),
      currentSeat: state.currentSeat,
      pending: state.pending
        ? {
            by: state.pending.by,
            claimedCharacter: state.pending.claimedCharacter,
            kind: state.pending.kind,
            generalId: state.pending.generalId,
            characterActionId: state.pending.characterActionId,
            target: state.pending.target,
            blocker: state.pending.blocker,
            passes: state.pending.passes,
            loseInfluencePending: state.pending.loseInfluencePending,
            mercenaryPartner: state.pending.mercenaryPartner,
          }
        : null,
      deckSize: state.deck.length,
      log: state.log,
      winnerSeat: state.winnerSeat,
      yourSeat: seat,
      yourInfluences: own?.influences ?? [],
      yourExchangeOffer:
        seat !== null && state.pending?.by === seat ? state.exchangeOffer : null,
      yourPeeks: seat !== null ? state.privatePeeks[seat] ?? [] : [],
    };
  },

  isFinished(state: CoupPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  defaultConfig(playerCount: number): GameConfig {
    const options: CoupOptions = {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: `Player ${i + 1}`,
        isAI: false,
      })),
      ruleset: 'classic',
      expansions: [],
      characters: ['duke', 'assassin', 'captain', 'ambassador', 'contessa'],
    };
    return {
      gameId: 'coup',
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: options as unknown as Record<string, unknown>,
    };
  },
};

// ============================================================================
// State-machine dispatcher
// ============================================================================

function apply(state: CoupPrivateState, action: CoupGameAction): void {
  switch (action.type) {
    case 'declareGeneral':
      return declareGeneral(state, action.generalId, action.target);
    case 'declareCharacter':
      return declareCharacter(state, action);
    case 'challenge':
      return handleChallenge(state, action.bySeat);
    case 'pass':
      return handlePass(state, action.bySeat);
    case 'declareBlock':
      return declareBlock(state, action.bySeat, action.character);
    case 'revealCard':
      return revealCard(state, action.bySeat, action.cardIndex);
    case 'pickInfluenceToLose':
      return pickLose(state, action.bySeat, action.cardIndex);
    case 'exchangeReturn':
      return exchangeReturn(state, action.bySeat, action.keepIndices);
    case 'ackPeek':
      return ackPeek(state, action.bySeat);
    case 'ackTurn':
      // No-op; the engine auto-ends turns. Kept for future use (e.g. between
      // hot-seat turn rotations).
      return;
    case 'spyPickTarget':
      // Legacy/no-op: spy peek target is supplied at declare time.
      void action;
      return;
  }
}

// --- Active-turn declarations -------------------------------------------------

function declareGeneral(state: CoupPrivateState, id: GeneralActionId, target?: SeatIndex): void {
  if (state.phase !== 'turnStart') throw new Error(`Can't declare in phase ${state.phase}`);
  const cur = state.seats[state.currentSeat]!;
  // 10-coin rule.
  if (cur.coins >= 10 && id !== 'coup') {
    throw new Error('You must coup at 10+ coins.');
  }
  const pending = emptyPending(state.currentSeat);
  pending.kind = 'general';
  pending.generalId = id;
  pending.target = target ?? null;

  switch (id) {
    case 'income': {
      // No challenge, no block — resolve immediately.
      state.pending = pending;
      resolveEffect(state);
      return;
    }
    case 'foreignAid': {
      state.pending = pending;
      if (isActionBlockable(state)) {
        state.phase = 'awaitingBlock';
      } else {
        resolveEffect(state);
      }
      return;
    }
    case 'coup': {
      if (target === undefined) throw new Error('Coup requires a target');
      if (cur.coins < 7) throw new Error('Coup costs 7 coins');
      const tgt = state.seats[target];
      if (!tgt || tgt.eliminated || target === state.currentSeat) {
        throw new Error('Invalid coup target');
      }
      cur.coins -= 7;
      state.pending = pending;
      if (state.ruleset === 'g54' && isActionBlockable(state)) {
        // Judge could block in G54 if implemented. Not yet — falls through.
        state.phase = 'awaitingBlock';
      } else {
        resolveEffect(state);
      }
      return;
    }
  }
}

function declareCharacter(
  state: CoupPrivateState,
  action: Extract<CoupGameAction, { type: 'declareCharacter' }>,
): void {
  if (state.phase !== 'turnStart') throw new Error(`Can't declare in phase ${state.phase}`);
  const cur = state.seats[state.currentSeat]!;
  if (cur.coins >= 10) throw new Error('You must coup at 10+ coins.');
  // Validate the claim is in this deck (you can only claim characters that
  // exist in the active 5-8).
  if (!state.activeCharacters.includes(action.claimedCharacter)) {
    throw new Error(`${characterLabel(action.claimedCharacter)} isn't in this game.`);
  }
  const charDef = CHARACTERS[action.claimedCharacter];
  if (!charDef.action || charDef.action.id !== action.characterActionId) {
    throw new Error(`${charDef.name} can't take that action.`);
  }
  // Pay up-front cost (e.g. Assassin = 3).
  if (cur.coins < charDef.action.cost) {
    throw new Error(`Not enough coins (need ${charDef.action.cost}).`);
  }
  cur.coins -= charDef.action.cost;
  // Mercenary requires a partner — they pay 1 also. (Partner can decline by
  // simply being unable to pay, in which case we error out for now.)
  if (charDef.action.id === 'mercenaryHire') {
    if (action.mercenaryPartner === undefined) throw new Error('Mercenary needs a partner.');
    const partner = state.seats[action.mercenaryPartner];
    if (!partner || partner.eliminated || action.mercenaryPartner === state.currentSeat) {
      throw new Error('Invalid Mercenary partner.');
    }
    if (partner.coins < 1) throw new Error('Partner has no coin to contribute.');
    partner.coins -= 1;
  }

  const pending = emptyPending(state.currentSeat);
  pending.kind = 'character';
  pending.claimedCharacter = action.claimedCharacter;
  pending.characterActionId = action.characterActionId;
  pending.target = action.target ?? null;
  pending.mercenaryPartner = action.mercenaryPartner ?? null;
  pending.inquisitorBranch = action.inquisitorBranch ?? null;
  pending.inquisitorPeekCardIndex = action.inquisitorPeekCardIndex ?? null;

  // Spy / Inquisitor-peek branches need a target card index. Reuse the same
  // index field for both characters.
  if (charDef.action.id === 'spyPeek') {
    pending.spyPeekCardIndex = action.inquisitorPeekCardIndex ?? 0;
  }

  state.pending = pending;
  appendLog(state, `${cur.name} claims ${charDef.name}.`);

  // Validate target presence for action.target === 'other'.
  if (charDef.action.target === 'other' && pending.target === null) {
    throw new Error(`${charDef.name} requires a target.`);
  }

  if (isActionChallengeable(state)) {
    state.phase = 'awaitingChallenge';
  } else {
    if (isActionBlockable(state)) {
      state.phase = 'awaitingBlock';
    } else {
      resolveEffect(state);
    }
  }
}

// --- Challenge / block window ------------------------------------------------

function handleChallenge(state: CoupPrivateState, bySeat: SeatIndex): void {
  if (state.phase !== 'awaitingChallenge' && state.phase !== 'awaitingBlockChallenge') {
    throw new Error(`No challenge window open (${state.phase}).`);
  }
  const p = state.pending;
  if (!p) throw new Error('No pending action.');

  if (state.phase === 'awaitingChallenge') {
    // Challenger goes against the active player's claim.
    if (bySeat === p.by) throw new Error("You can't challenge yourself.");
    if (state.seats[bySeat]!.eliminated) throw new Error("Eliminated seats can't challenge.");
    // Resolve the challenge: does the active player actually hold the claim?
    return resolveChallenge(state, bySeat, /*targetOfChallenge*/ 'active');
  }
  // awaitingBlockChallenge: challenger goes against the blocker.
  const blocker = p.blocker!;
  if (bySeat === blocker.by) throw new Error("You can't challenge your own block.");
  if (state.seats[bySeat]!.eliminated) throw new Error("Eliminated seats can't challenge.");
  return resolveChallenge(state, bySeat, /*targetOfChallenge*/ 'blocker');
}

function resolveChallenge(
  state: CoupPrivateState,
  challenger: SeatIndex,
  against: 'active' | 'blocker',
): void {
  const p = state.pending!;
  const claimedChar = against === 'active' ? p.claimedCharacter! : p.blocker!.character;
  const claimerSeatIdx = against === 'active' ? p.by : p.blocker!.by;
  const claimer = state.seats[claimerSeatIdx]!;
  if (seatHas(claimer, claimedChar)) {
    // Claim was honest. Challenger loses an influence; claimer reveals + redraws.
    appendLog(
      state,
      `${state.seats[challenger]!.name} challenged — ${claimer.name} reveals ${CHARACTERS[claimedChar].name}. Challenger loses an influence.`,
    );
    // Swap the revealed-true card back into the deck; draw a new one.
    const idx = claimer.influences.findIndex((i) => !i.revealed && i.char === claimedChar);
    const revealedCard = claimer.influences[idx]!;
    // Return to deck, shuffle, deal new.
    returnAndShuffle(state, [revealedCard.char]);
    const newCard = drawCard(state);
    revealedCard.char = newCard;
    // Now the challenger loses an influence.
    if (livingInfluenceCount(state.seats[challenger]!) <= 1) {
      loseAnyInfluence(state.seats[challenger]!);
      // Check elimination + win.
      checkWin(state);
      if (state.phase === 'gameOver') return;
      // Challenger lost; the original action / block proceeds.
      proceedAfterChallengeResolved(state, against, /*claimSuccess*/ true);
      return;
    }
    p.loseInfluencePending = { seat: challenger, reason: 'failedChallenge' };
    // We track WHO needs to lose an influence and WHICH stream to continue
    // afterwards via a sentinel on the pending: the `passes` list will be
    // cleared and the next phase chosen in the lose-influence resolver.
    p.passes = []; // reset window passes
    // Use a marker on pending to recall the resume target.
    (p as unknown as { resumeAfterLose: 'continueAction' | 'continueBlock' }).resumeAfterLose =
      against === 'active' ? 'continueAction' : 'continueBlock';
    state.phase = 'loseInfluence';
    return;
  }
  // Bluff — claimer loses an influence; action fizzles.
  appendLog(
    state,
    `${state.seats[challenger]!.name} challenged — ${claimer.name} did NOT have ${CHARACTERS[claimedChar].name}. Claimer loses an influence.`,
  );
  if (livingInfluenceCount(claimer) <= 1) {
    loseAnyInfluence(claimer);
    checkWin(state);
    if (state.phase === 'gameOver') return;
    proceedAfterChallengeResolved(state, against, /*claimSuccess*/ false);
    return;
  }
  p.loseInfluencePending = { seat: claimerSeatIdx, reason: 'lostBluff' };
  p.passes = [];
  (p as unknown as { resumeAfterLose: 'fizzle' | 'continueAfterBlockBluff' }).resumeAfterLose =
    against === 'active' ? 'fizzle' : 'continueAfterBlockBluff';
  state.phase = 'loseInfluence';
}

// Called after the challenger's-loss / claimer's-loss has been picked.
function proceedAfterChallengeResolved(
  state: CoupPrivateState,
  against: 'active' | 'blocker',
  claimSuccess: boolean,
): void {
  const p = state.pending!;
  if (against === 'active') {
    if (claimSuccess) {
      // Active claim was honest. Now if the action is blockable, open block
      // window — otherwise resolve.
      if (isActionBlockable(state)) {
        state.phase = 'awaitingBlock';
        return;
      }
      resolveEffect(state);
      return;
    }
    // Active claim was a bluff. Action fizzles. End turn.
    appendLog(state, `${state.seats[p.by]!.name}'s action fizzles.`);
    endTurn(state);
    return;
  }
  // against === 'blocker'
  if (claimSuccess) {
    // Block stands. Original action fizzles.
    appendLog(state, `${state.seats[p.blocker!.by]!.name}'s block stands. Action fizzles.`);
    endTurn(state);
    return;
  }
  // Block was a bluff. Original action resolves.
  appendLog(state, `Block failed. ${state.seats[p.by]!.name}'s action resolves.`);
  p.blocker = null;
  resolveEffect(state);
}

function handlePass(state: CoupPrivateState, bySeat: SeatIndex): void {
  const p = state.pending;
  if (!p) throw new Error('No pending action.');
  if (state.phase === 'awaitingChallenge') {
    if (bySeat === p.by) throw new Error("Can't pass your own action window.");
    if (!p.passes.includes(bySeat)) p.passes.push(bySeat);
    if (challengeWindowFinished(state, p.passes, [p.by])) {
      // Window closed — move to block window if blockable, else resolve.
      if (isActionBlockable(state)) {
        p.passes = [];
        state.phase = 'awaitingBlock';
      } else {
        resolveEffect(state);
      }
    }
    return;
  }
  if (state.phase === 'awaitingBlock') {
    if (bySeat === p.by) throw new Error("Can't pass your own action window.");
    if (!p.passes.includes(bySeat)) p.passes.push(bySeat);
    if (challengeWindowFinished(state, p.passes, [p.by])) {
      // Nobody blocked. Resolve.
      resolveEffect(state);
    }
    return;
  }
  if (state.phase === 'awaitingBlockChallenge') {
    if (bySeat === p.blocker!.by) throw new Error("Can't pass your own block window.");
    if (!p.passes.includes(bySeat)) p.passes.push(bySeat);
    if (challengeWindowFinished(state, p.passes, [p.blocker!.by])) {
      // Block stands. Original action fizzles.
      appendLog(state, `Block by ${state.seats[p.blocker!.by]!.name} stands. Action fizzles.`);
      endTurn(state);
    }
    return;
  }
  throw new Error(`Pass not valid in phase ${state.phase}`);
}

function declareBlock(state: CoupPrivateState, bySeat: SeatIndex, character: CoupCharacter): void {
  if (state.phase !== 'awaitingBlock') throw new Error(`Block not valid in phase ${state.phase}`);
  const p = state.pending!;
  if (bySeat === p.by) throw new Error("Can't block your own action.");
  if (state.seats[bySeat]!.eliminated) throw new Error("Eliminated seats can't block.");
  const validBlockers = pendingBlockers(state);
  if (!validBlockers.includes(character)) {
    throw new Error(`${CHARACTERS[character].name} can't block this action.`);
  }
  // Steal can only be blocked by the targeted seat (or the active player's
  // target). Foreign Aid can be blocked by anyone.
  if (
    p.kind === 'character' &&
    (p.characterActionId === 'steal' || p.characterActionId === 'thiefSteal') &&
    p.target !== bySeat
  ) {
    throw new Error('Only the target of the steal can block it.');
  }
  if (p.kind === 'character' && p.characterActionId === 'assassinate' && p.target !== bySeat) {
    throw new Error('Only the assassination target can block it.');
  }
  p.blocker = { by: bySeat, character };
  p.passes = [];
  appendLog(state, `${state.seats[bySeat]!.name} blocks as ${CHARACTERS[character].name}.`);
  state.phase = 'awaitingBlockChallenge';
}

// --- Reveal / lose / exchange -----------------------------------------------

function revealCard(state: CoupPrivateState, bySeat: SeatIndex, cardIndex: 0 | 1): void {
  // Used during challengeReveal — not currently a public phase; we resolve
  // challenge eagerly in resolveChallenge. Left as a no-op for future
  // refactors that split the reveal step out.
  void state;
  void bySeat;
  void cardIndex;
}

function pickLose(state: CoupPrivateState, bySeat: SeatIndex, cardIndex: 0 | 1): void {
  if (state.phase !== 'loseInfluence') throw new Error(`Lose not valid in phase ${state.phase}`);
  const p = state.pending!;
  if (!p.loseInfluencePending) throw new Error('No lose-influence pending.');
  if (p.loseInfluencePending.seat !== bySeat) {
    throw new Error('Wrong seat for lose-influence.');
  }
  const seat = state.seats[bySeat]!;
  if (!loseInfluencePick(seat, cardIndex)) {
    throw new Error('Card already revealed.');
  }
  appendLog(
    state,
    `${seat.name} lost ${CHARACTERS[seat.influences[cardIndex]!.char].name} (${p.loseInfluencePending.reason}).`,
  );
  p.loseInfluencePending = null;
  checkWin(state);
  if ((state.phase as string) === 'gameOver') return;
  // Resume the appropriate stream.
  const resume = (p as unknown as { resumeAfterLose?: string }).resumeAfterLose;
  delete (p as unknown as { resumeAfterLose?: string }).resumeAfterLose;
  if (resume === 'continueAction') {
    if (isActionBlockable(state)) {
      state.phase = 'awaitingBlock';
      return;
    }
    resolveEffect(state);
    return;
  }
  if (resume === 'fizzle') {
    appendLog(state, `${state.seats[p.by]!.name}'s action fizzles.`);
    endTurn(state);
    return;
  }
  if (resume === 'continueBlock') {
    // Block stands; original action fizzles.
    appendLog(state, `Block stands. ${state.seats[p.by]!.name}'s action fizzles.`);
    endTurn(state);
    return;
  }
  if (resume === 'continueAfterBlockBluff') {
    appendLog(state, `Block failed. ${state.seats[p.by]!.name}'s action resolves.`);
    p.blocker = null;
    resolveEffect(state);
    return;
  }
  // Default: this was a coup/assassinate-style lose. End the turn.
  endTurn(state);
}

function exchangeReturn(state: CoupPrivateState, bySeat: SeatIndex, keepIndices: number[]): void {
  if (state.phase !== 'exchangePick') throw new Error(`Exchange not valid in phase ${state.phase}`);
  const p = state.pending!;
  if (bySeat !== p.by) throw new Error('Wrong seat for exchange.');
  const offer = state.exchangeOffer;
  if (!offer) throw new Error('No exchange offer.');
  if (keepIndices.length !== offer.keepCount) {
    throw new Error(`Keep exactly ${offer.keepCount} cards.`);
  }
  const seen = new Set<number>();
  for (const i of keepIndices) {
    if (i < 0 || i >= offer.cards.length) throw new Error(`Invalid index ${i}`);
    if (seen.has(i)) throw new Error(`Duplicate index ${i}`);
    seen.add(i);
  }
  const kept: CoupCharacter[] = keepIndices.map((i) => offer.cards[i]!);
  const returned: CoupCharacter[] = offer.cards
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => !seen.has(i))
    .map(({ c }) => c);
  // Replace the seat's unrevealed influences with the kept cards.
  const seat = state.seats[bySeat]!;
  let cursor = 0;
  for (const inf of seat.influences) {
    if (!inf.revealed) {
      inf.char = kept[cursor++]!;
    }
  }
  returnAndShuffle(state, returned);
  state.exchangeOffer = null;
  appendLog(state, `${seat.name} returned ${returned.length} card${returned.length === 1 ? '' : 's'} to the deck.`);
  endTurn(state);
}

function ackPeek(state: CoupPrivateState, bySeat: SeatIndex): void {
  if (state.phase !== 'spyPeek') throw new Error(`Ack not valid in phase ${state.phase}`);
  const p = state.pending!;
  if (bySeat !== p.by) throw new Error('Only the peeker can ack.');
  endTurn(state);
}

// ============================================================================
// Re-exports for UI
// ============================================================================

export { CHARACTERS } from './characters';
