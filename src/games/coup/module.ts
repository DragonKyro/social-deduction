import { makeRng, rngShuffle, subSeed } from '@/engine/rng';
import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { CoupGameAction } from './actions';
import { aiChooseAction } from './ai';
import { CHARACTERS } from './characters';
import {
  awaitingSeatsFor,
  blockEligibleSeats,
  mustCoup,
  targetBlockReason,
  validBlockersFor,
} from './rules';
import { buildInitialState, validateCharacterSetFull } from './setup';
import type {
  CoupCharacter,
  CoupEvent,
  CoupPendingAction,
  CoupPrivateState,
  CoupPublicState,
  CoupRuleset,
  CoupSeatState,
  GeneralActionId,
} from './state';
import { viewFor } from './view';

export interface CoupSeatConfig {
  name: string;
  isAI: boolean;
}

export interface CoupOptions {
  players: CoupSeatConfig[];
  ruleset: CoupRuleset;
  expansions: Array<'anarchy'>;
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

function livingInfluenceCount(seat: CoupSeatState): number {
  return seat.influences.filter((i) => !i.revealed).length;
}

function appendLog(state: CoupPrivateState, line: string) {
  state.log.push(line);
  if (state.log.length > 50) state.log.shift();
}

// Distributive Omit so each event variant keeps its own fields.
type EventInput = CoupEvent extends infer E ? (E extends CoupEvent ? Omit<E, 'seq'> : never) : never;

function pushEvent(state: CoupPrivateState, e: EventInput) {
  state.eventSeq += 1;
  state.events.push({ ...e, seq: state.eventSeq } as CoupEvent);
  if (state.events.length > 24) state.events.shift();
}

function nextLivingAfter(state: CoupPrivateState, from: SeatIndex): SeatIndex {
  const n = state.seats.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!state.seats[idx]!.eliminated) return idx;
  }
  return from;
}

function drawCard(state: CoupPrivateState): CoupCharacter {
  if (state.deck.length === 0) {
    throw new Error('Deck is empty');
  }
  return state.deck.shift()!;
}

function returnAndShuffle(state: CoupPrivateState, cards: CoupCharacter[]) {
  state.deck.push(...cards);
  // One fresh 53-bit stream per reshuffle, derived from the private seed.
  state.rngCursor = state.rngCursor + 1;
  const rng = makeRng(subSeed(state.seed, 0xc0_b5_ee_1d, state.rngCursor));
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
    treatyPair: null,
    pileOnPot: null,
    chipInPot: null,
    swapInProgress: null,
    loseInfluencePending: null,
    unblockable: false,
    resumeAfterLose: null,
  };
}

function seatHas(seat: CoupSeatState, character: CoupCharacter): boolean {
  return seat.influences.some((i) => !i.revealed && i.char === character);
}

function characterLabel(c: CoupCharacter | null): string {
  return c ? CHARACTERS[c].name : '???';
}

function awaitingSeats(state: CoupPrivateState): SeatIndex[] {
  return awaitingSeatsFor(state, state.pending, state.pending?.swapInProgress?.target ?? null);
}

function assertCardIndex(i: unknown): asserts i is 0 | 1 {
  if (i !== 0 && i !== 1) throw new Error('Invalid card index.');
}

function assertFaceDown(seat: CoupSeatState, cardIndex: 0 | 1) {
  const card = seat.influences[cardIndex];
  if (!card || card.revealed) throw new Error('Pick one of your face-down cards.');
}

// Turn a face-down card face-up. The only place a card becomes public.
function flipFaceUp(state: CoupPrivateState, seatIdx: SeatIndex, cardIndex: number) {
  const seat = state.seats[seatIdx]!;
  const card = seat.influences[cardIndex]!;
  card.revealed = true;
  pushEvent(state, { kind: 'influenceLost', seat: seatIdx, cardIndex, character: card.char });
  appendLog(state, `${seat.name} lost ${CHARACTERS[card.char].name}.`);
  if (livingInfluenceCount(seat) === 0) {
    seat.eliminated = true;
    pushEvent(state, { kind: 'eliminated', seat: seatIdx });
    appendLog(state, `${seat.name} is out of the game.`);
  }
}

// Lose a specific face-down influence. Respects the reviveBlessed token: if
// this loss would eliminate the seat, the token is spent instead.
function loseInfluence(state: CoupPrivateState, seatIdx: SeatIndex, cardIndex: 0 | 1) {
  const seat = state.seats[seatIdx]!;
  assertFaceDown(seat, cardIndex);
  if (livingInfluenceCount(seat) === 1 && seat.tokens.reviveBlessed) {
    seat.tokens.reviveBlessed = false;
    seat.tokens.reviveUsed = true;
    pushEvent(state, { kind: 'saved', seat: seatIdx });
    appendLog(state, `${seat.name} was blessed and keeps their last card (revive token spent).`);
    return;
  }
  flipFaceUp(state, seatIdx, cardIndex);
}

// Grant a revive token unless this seat's one revive was already used.
function bless(seat: CoupSeatState) {
  if (!seat.tokens.reviveUsed) seat.tokens.reviveBlessed = true;
}

function loseAnyInfluence(state: CoupPrivateState, seatIdx: SeatIndex) {
  const idx = state.seats[seatIdx]!.influences.findIndex((i) => !i.revealed);
  if (idx === -1) return;
  loseInfluence(state, seatIdx, idx as 0 | 1);
}

// Returns true when the game just ended.
function checkWin(state: CoupPrivateState): boolean {
  const alive = state.seats.filter((s) => !s.eliminated);
  if (alive.length > 1) return false;
  state.winnerSeat = alive[0]?.index ?? null;
  state.phase = 'gameOver';
  state.pending = null;
  state.exchangeOffer = null;
  if (alive[0]) {
    pushEvent(state, { kind: 'win', seat: alive[0].index });
    appendLog(state, `${alive[0].name} wins!`);
  }
  return true;
}

function assertTargetable(state: CoupPrivateState, by: SeatIndex, target: SeatIndex) {
  const reason = targetBlockReason(state, by, target);
  if (reason === null) return;
  const name = state.seats[target]?.name ?? 'That seat';
  throw new Error(reason.startsWith('is ') ? `${name} ${reason}` : reason);
}

// A face-down slot to peek: the requested one, else any face-down card.
function peekSlot(seat: CoupSeatState, requested: 0 | 1 | null): 0 | 1 | null {
  const want = requested ?? 0;
  if (seat.influences[want] && !seat.influences[want]!.revealed) return want;
  const other = seat.influences.findIndex((i) => !i.revealed);
  return other === -1 ? null : (other as 0 | 1);
}

// ============================================================================
// Effect resolution — runs after challenges + blocks settle.
// ============================================================================

type StrikeReason = NonNullable<CoupPendingAction['loseInfluencePending']>['reason'];

// Force `targetIdx` to lose an influence (assassination, coup, strikes).
function strikeTarget(
  state: CoupPrivateState,
  targetIdx: SeatIndex,
  reason: StrikeReason,
  style: 'assassinate' | 'coup' | 'force',
): void {
  const p = state.pending!;
  const target = state.seats[targetIdx]!;
  pushEvent(state, { kind: 'strike', by: p.by, target: targetIdx, style });
  if (target.eliminated) return endTurn(state);
  if (livingInfluenceCount(target) <= 1) {
    loseAnyInfluence(state, targetIdx);
    if (checkWin(state)) return;
    return endTurn(state);
  }
  p.loseInfluencePending = { seat: targetIdx, reason };
  p.resumeAfterLose = null;
  state.phase = 'loseInfluence';
}

function resolveEffect(state: CoupPrivateState): void {
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
        return strikeTarget(state, p.target!, 'coup', 'coup');
      }
      default:
        return endTurn(state);
    }
  }

  switch (p.characterActionId) {
    case 'tax': {
      const amount = (p.claimedCharacter && CHARACTERS[p.claimedCharacter].action?.amount) || 3;
      by.coins += amount;
      appendLog(state, `${by.name} took Tax (+${amount}) as ${characterLabel(p.claimedCharacter)}.`);
      return endTurn(state);
    }
    case 'taxLevy': {
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
    case 'assassinate':
    case 'soldierStrike':
    case 'mercenaryHire':
    case 'protectedEliminate':
    case 'paramilitaryRiot': {
      const reasonMap = {
        assassinate: 'assassinate',
        soldierStrike: 'soldier',
        mercenaryHire: 'mercenary',
        protectedEliminate: 'guerrilla',
        paramilitaryRiot: 'paramilitary',
      } as const;
      const target = state.seats[p.target!]!;
      appendLog(state, `${by.name} (${characterLabel(p.claimedCharacter)}) strikes ${target.name}.`);
      return strikeTarget(
        state,
        target.index,
        reasonMap[p.characterActionId],
        p.characterActionId === 'assassinate' ? 'assassinate' : 'force',
      );
    }
    case 'steal':
    case 'thiefSteal': {
      const target = state.seats[p.target!]!;
      const bonus = Math.min(3, by.tokens.weapons);
      const want = 2 + bonus;
      const take = Math.min(want, target.coins);
      target.coins -= take;
      by.coins += take;
      appendLog(
        state,
        `${by.name} stole ${take} coin${take === 1 ? '' : 's'} from ${target.name}${
          bonus > 0 ? ` (+${bonus} weapons bonus)` : ''
        }.`,
      );
      return endTurn(state);
    }
    case 'customSteal': {
      // Speculator: amount = own coins, max 5.
      const target = state.seats[p.target!]!;
      const want = Math.min(by.coins, 5);
      const take = Math.min(want, target.coins);
      target.coins -= take;
      by.coins += take;
      appendLog(state, `${by.name} (Speculator) stole ${take} coins from ${target.name}.`);
      return endTurn(state);
    }
    case 'exchange': {
      const drawn = [drawCard(state), drawCard(state)];
      const live = by.influences.filter((i) => !i.revealed).map((i) => i.char);
      state.exchangeOffer = { cards: [...live, ...drawn], keepCount: live.length };
      state.phase = 'exchangePick';
      pushEvent(state, { kind: 'exchange', seat: by.index, drawn: drawn.length });
      appendLog(state, `${by.name} draws 2 from the court deck to exchange.`);
      return;
    }
    case 'inquisitorExchange': {
      if (p.inquisitorBranch === 'peek') {
        const target = state.seats[p.target!]!;
        const idx = peekSlot(target, p.inquisitorPeekCardIndex);
        if (idx === null) return endTurn(state);
        state.privatePeeks[by.index]!.push({
          byActionId: 'inquisitorPeek',
          target: target.index,
          card: target.influences[idx]!.char,
          cardIndex: idx,
        });
        appendLog(state, `${by.name} (Inquisitor) examined one of ${target.name}'s cards.`);
        state.phase = 'spyPeek';
        return;
      }
      const drawn = [drawCard(state)];
      const live = by.influences.filter((i) => !i.revealed).map((i) => i.char);
      state.exchangeOffer = { cards: [...live, ...drawn], keepCount: live.length };
      state.phase = 'exchangePick';
      pushEvent(state, { kind: 'exchange', seat: by.index, drawn: 1 });
      appendLog(state, `${by.name} (Inquisitor) draws 1 from the court deck to exchange.`);
      return;
    }
    case 'spyPeek': {
      const target = state.seats[p.target!]!;
      const idx = peekSlot(target, p.spyPeekCardIndex);
      if (idx === null) return endTurn(state);
      state.privatePeeks[by.index]!.push({
        byActionId: 'spyPeek',
        target: target.index,
        card: target.influences[idx]!.char,
        cardIndex: idx,
      });
      appendLog(state, `${by.name} (Spy) peeked at one of ${target.name}'s cards.`);
      state.phase = 'spyPeek';
      return;
    }
    case 'plantationIncome': {
      const bonus = livingInfluenceCount(by);
      by.coins += bonus;
      appendLog(state, `${by.name} (Plantation Owner) gained +${bonus}.`);
      return endTurn(state);
    }
    case 'pileOnIncome': {
      const baseAmount = (p.claimedCharacter && CHARACTERS[p.claimedCharacter].action?.amount) || 2;
      p.pileOnPot = { contributors: [p.by], coinsEach: baseAmount, closed: [] };
      appendLog(
        state,
        `${by.name} opens a ${characterLabel(p.claimedCharacter)} pile-on (+${baseAmount} each; join or pass).`,
      );
      state.phase = 'pileOnWindow';
      return closeWindowIfDone(state);
    }
    case 'chipInEliminate': {
      const target = state.seats[p.target!]!;
      const livingOpponents = state.seats.filter((s) => !s.eliminated && s.index !== p.by).length;
      const threshold = Math.max(1, Math.ceil(livingOpponents / 2));
      p.chipInPot = { contributors: [], threshold, passes: [] };
      appendLog(
        state,
        `${by.name} (${characterLabel(p.claimedCharacter)}) rallies against ${target.name}: others may chip 1 coin each (need ${threshold}).`,
      );
      state.phase = 'chipInWindow';
      return closeWindowIfDone(state);
    }
    case 'forceSwap': {
      const target = state.seats[p.target!]!;
      if (target.eliminated) return endTurn(state);
      const drawn = drawCard(state);
      p.swapInProgress = { target: target.index, drawnCard: drawn };
      appendLog(state, `${by.name} (${characterLabel(p.claimedCharacter)}) forces a swap on ${target.name}.`);
      state.phase = 'targetSwapPick';
      return;
    }
    case 'wealthRedistribute': {
      const id = p.claimedCharacter;
      if (id === 'treasurer' && p.target !== null) {
        const target = state.seats[p.target]!;
        const sum = by.coins + target.coins;
        const half = Math.floor(sum / 2);
        target.coins = half;
        by.coins = sum - half;
        appendLog(state, `${by.name} (Treasurer) equalized coins with ${target.name}.`);
      } else if (id === 'socialist') {
        const alive = state.seats.filter((s) => !s.eliminated);
        const total = alive.reduce((acc, s) => acc + s.coins, 0);
        const each = Math.floor(total / alive.length);
        const remainder = total - each * alive.length;
        for (const s of alive) s.coins = each;
        by.coins += remainder;
        appendLog(state, `${by.name} (Socialist) redistributed to ${each} coins each (keeping ${remainder}).`);
      } else if (id === 'worldBank') {
        for (const s of state.seats) if (!s.eliminated) s.coins += 1;
        appendLog(state, `${by.name} (World Bank) granted +1 coin to every living player.`);
      }
      return endTurn(state);
    }
    case 'mayorIncome': {
      by.coins += 2;
      appendLog(state, `${by.name} (Mayor) took income (+2).`);
      return endTurn(state);
    }
    case 'priestRevive': {
      const target = state.seats[p.target!]!;
      bless(target);
      appendLog(state, `${by.name} (Priest) blessed ${target.name}${target.tokens.reviveUsed ? ' (no effect: revive already used)' : ': one revive token'}.`);
      return endTurn(state);
    }
    case 'lawyerSwing': {
      by.coins += 2;
      bless(by);
      appendLog(state, `${by.name} (Lawyer) took +2 coins and a revive token.`);
      return endTurn(state);
    }
    case 'bishopBless': {
      by.coins += 1;
      bless(by);
      appendLog(state, `${by.name} (Bishop) took +1 coin and a revive token.`);
      return endTurn(state);
    }
    case 'peacekeeperShield': {
      by.tokens.peacekeeping = true;
      appendLog(state, `${by.name} (Peacekeeper) is now under protection.`);
      return endTurn(state);
    }
    case 'foreignConsularTreaty': {
      if (!p.treatyPair) return endTurn(state);
      const [a, b] = p.treatyPair;
      const sa = state.seats[a]!;
      const sb = state.seats[b]!;
      sa.tokens.treaty = b;
      sb.tokens.treaty = a;
      appendLog(state, `${by.name} (Foreign Consular) placed a Treaty between ${sa.name} and ${sb.name}.`);
      return endTurn(state);
    }
    case 'armsDealerSell': {
      if (livingInfluenceCount(by) <= 1) {
        appendLog(state, `${by.name} (Arms Dealer) has nothing left to sell.`);
        return endTurn(state);
      }
      appendLog(state, `${by.name} (Arms Dealer) will flip a card for 4 coins + 1 weapon.`);
      state.phase = 'sellInfluencePick';
      return;
    }
    default:
      return endTurn(state);
  }
}

// ============================================================================
// Turn flow
// ============================================================================

function endTurn(state: CoupPrivateState): void {
  state.exchangeOffer = null;
  state.pending = null;
  if (state.phase === 'gameOver') return;
  // Token decay: peacekeeping clears when its holder next declares (see
  // declare*); treaty bonds persist until a later Treaty overwrites them.
  state.currentSeat = nextLivingAfter(state, state.currentSeat);
  state.phase = 'turnStart';
}

// After a claim survives (or skips) the challenge window: open the block
// window if anyone can block, else resolve the action.
function openBlockWindowOrResolve(state: CoupPrivateState): void {
  const p = state.pending!;
  p.passes = [];
  const blockers = validBlockersFor(state.activeCharacters, state.ruleset, p);
  if (blockers.length > 0 && blockEligibleSeats(state, p).length > 0) {
    state.phase = 'awaitingBlock';
    return;
  }
  resolveEffect(state);
}

// Close the current response window once nobody is left to respond.
function closeWindowIfDone(state: CoupPrivateState): void {
  if (awaitingSeats(state).length > 0) return;
  const p = state.pending;
  if (!p) return;
  switch (state.phase) {
    case 'awaitingChallenge':
      return openBlockWindowOrResolve(state);
    case 'awaitingBlock':
      return resolveEffect(state);
    case 'awaitingBlockChallenge':
      return blockStands(state);
    case 'pileOnWindow':
      return payoutPileOn(state);
    case 'chipInWindow':
      return settleChipIn(state);
    default:
      return;
  }
}

function blockStands(state: CoupPrivateState): void {
  const p = state.pending!;
  pushEvent(state, { kind: 'blockStands', seat: p.blocker!.by });
  appendLog(state, `${state.seats[p.blocker!.by]!.name}'s block stands. ${state.seats[p.by]!.name}'s action fails.`);
  endTurn(state);
}

type Resume = CoupPendingAction['resumeAfterLose'];

function resumeTurn(state: CoupPrivateState, resume: Resume): void {
  const p = state.pending;
  if (!p) return;
  switch (resume) {
    case 'continueAction':
      return openBlockWindowOrResolve(state);
    case 'fizzle':
      appendLog(state, `${state.seats[p.by]!.name}'s action fails.`);
      return endTurn(state);
    case 'continueBlock':
      return blockStands(state);
    case 'continueAfterBlockBluff':
      appendLog(state, `Block failed. ${state.seats[p.by]!.name}'s action resolves.`);
      p.blocker = null;
      return resolveEffect(state);
    default:
      return endTurn(state);
  }
}

// The loser of a challenge loses an influence (auto-picked when they only
// have one), then the turn resumes.
function challengeLoserLoses(
  state: CoupPrivateState,
  loser: SeatIndex,
  reason: 'failedChallenge' | 'lostBluff',
  resume: Resume,
): void {
  const p = state.pending!;
  p.passes = [];
  if (livingInfluenceCount(state.seats[loser]!) <= 1) {
    loseAnyInfluence(state, loser);
    if (checkWin(state)) return;
    return resumeTurn(state, resume);
  }
  p.loseInfluencePending = { seat: loser, reason };
  p.resumeAfterLose = resume;
  state.phase = 'loseInfluence';
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
    const result = validateCharacterSetFull(opts.characters, opts.ruleset, opts.expansions.includes('anarchy'));
    if (result.error) throw new Error(result.error);
    return buildInitialState(
      playerCount,
      opts.characters,
      players.map((p) => p.name),
      config.seed,
      opts.ruleset,
      opts.expansions,
    );
  },

  // `byUuid` is unused: the network layer guarantees `action.bySeat` is the
  // sender's own seat, and the reducer checks that seat may act right now.
  applyAction(state: CoupPrivateState, action: CoupGameAction): CoupPrivateState {
    const next = clone(state);
    apply(next, action);
    next.actionCount += 1;
    return next;
  },

  viewFor,

  isFinished(state: CoupPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  aiChooseAction,

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
  if (state.phase === 'gameOver') throw new Error('The game is over.');
  const bySeat = (action as { bySeat?: unknown }).bySeat;
  if (typeof bySeat !== 'number' || !Number.isInteger(bySeat) || !state.seats[bySeat]) {
    throw new Error('Unknown seat.');
  }
  if (state.seats[bySeat]!.eliminated) throw new Error("Eliminated players can't act.");

  switch (action.type) {
    case 'declareGeneral':
      return declareGeneral(state, action.bySeat, action.generalId, action.target);
    case 'declareCharacter':
      return declareCharacter(state, action);
    case 'challenge':
      return handleChallenge(state, action.bySeat);
    case 'pass':
      return handlePass(state, action.bySeat);
    case 'declareBlock':
      return declareBlock(state, action.bySeat, action.character);
    case 'pickInfluenceToLose':
      return pickLose(state, action.bySeat, action.cardIndex);
    case 'exchangeReturn':
      return exchangeReturn(state, action.bySeat, action.keepIndices);
    case 'ackPeek':
      return ackPeek(state, action.bySeat);
    case 'joinPileOn':
      return joinPileOn(state, action.bySeat);
    case 'closePileOn':
      return closePileOn(state, action.bySeat);
    case 'chipIn':
      return chipIn(state, action.bySeat);
    case 'targetSwapPick':
      return targetSwapPick(state, action.bySeat, action.cardIndex);
    case 'sellInfluence':
      return sellInfluence(state, action.bySeat, action.cardIndex);
    default:
      throw new Error(`Unknown action ${(action as { type?: string }).type}`);
  }
}

// --- Active-turn declarations ----------------------------------------------

function assertTurnOwner(state: CoupPrivateState, bySeat: SeatIndex) {
  if (state.phase !== 'turnStart') throw new Error(`Can't declare in phase ${state.phase}`);
  if (bySeat !== state.currentSeat) throw new Error("It isn't your turn.");
}

function declareGeneral(
  state: CoupPrivateState,
  bySeat: SeatIndex,
  id: GeneralActionId,
  target?: SeatIndex,
): void {
  assertTurnOwner(state, bySeat);
  const cur = state.seats[bySeat]!;
  // Active player's own peacekeeping expires when they act.
  cur.tokens.peacekeeping = false;
  if (id !== 'coup' && mustCoup(state, bySeat)) throw new Error('You must coup at 10+ coins.');
  const pending = emptyPending(bySeat);
  pending.kind = 'general';
  pending.generalId = id;

  switch (id) {
    case 'income':
      state.pending = pending;
      pushEvent(state, { kind: 'declare', seat: bySeat, generalId: id, character: null, target: null });
      return resolveEffect(state);
    case 'foreignAid':
      state.pending = pending;
      pushEvent(state, { kind: 'declare', seat: bySeat, generalId: id, character: null, target: null });
      appendLog(state, `${cur.name} declares Foreign Aid.`);
      return openBlockWindowOrResolve(state);
    case 'coup': {
      if (target === undefined || target === null) throw new Error('Coup requires a target');
      if (cur.coins < 7) throw new Error('Coup costs 7 coins');
      assertTargetable(state, bySeat, target);
      // A Coup forced by the 10-coin rule can't be blocked (G54 house rule:
      // otherwise two Guerrilla / Judge holders can stall forever).
      pending.unblockable = cur.coins >= 10;
      // Paid on declaration; not refunded if a G54 block stands.
      cur.coins -= 7;
      pending.target = target;
      state.pending = pending;
      pushEvent(state, { kind: 'declare', seat: bySeat, generalId: id, character: null, target });
      appendLog(
        state,
        `${cur.name} pays 7 to launch a Coup against ${state.seats[target]!.name}${pending.unblockable ? ' (forced: unblockable)' : ''}.`,
      );
      return openBlockWindowOrResolve(state);
    }
    default:
      throw new Error('Unknown general action.');
  }
}

function declareCharacter(
  state: CoupPrivateState,
  action: Extract<CoupGameAction, { type: 'declareCharacter' }>,
): void {
  const bySeat = action.bySeat;
  assertTurnOwner(state, bySeat);
  const cur = state.seats[bySeat]!;
  cur.tokens.peacekeeping = false;
  if (mustCoup(state, bySeat)) throw new Error('You must coup at 10+ coins.');
  if (!CHARACTERS[action.claimedCharacter] || !state.activeCharacters.includes(action.claimedCharacter)) {
    throw new Error(`${characterLabel(action.claimedCharacter)} isn't in this game.`);
  }
  const charDef = CHARACTERS[action.claimedCharacter];
  if (!charDef.action || charDef.action.id !== action.characterActionId) {
    throw new Error(`${charDef.name} can't take that action.`);
  }
  if (cur.coins < charDef.action.cost) {
    throw new Error(`Not enough coins (need ${charDef.action.cost}).`);
  }

  const pending = emptyPending(bySeat);
  pending.kind = 'character';
  pending.claimedCharacter = action.claimedCharacter;
  pending.characterActionId = action.characterActionId;

  // Targets: validated per action shape. Self-actions ignore any target
  // except the Inquisitor's peek branch.
  const isInquisitorPeek =
    charDef.action.id === 'inquisitorExchange' && action.inquisitorBranch === 'peek';
  if (charDef.action.target === 'other' || isInquisitorPeek) {
    if (action.target === undefined || action.target === null) {
      throw new Error(`${charDef.name} requires a target.`);
    }
    assertTargetable(state, bySeat, action.target);
    pending.target = action.target;
  }
  if (charDef.action.id === 'inquisitorExchange') {
    pending.inquisitorBranch = isInquisitorPeek ? 'peek' : 'exchange';
  }
  if (isInquisitorPeek || charDef.action.id === 'spyPeek') {
    const idx = action.inquisitorPeekCardIndex ?? 0;
    assertCardIndex(idx);
    assertFaceDown(state.seats[pending.target!]!, idx);
    if (isInquisitorPeek) pending.inquisitorPeekCardIndex = idx;
    else pending.spyPeekCardIndex = idx;
  }
  if (charDef.action.target === 'pair') {
    const pair = action.treatyPair;
    if (!pair || pair.length !== 2) throw new Error(`${charDef.name} requires a treaty pair.`);
    const [a, b] = pair;
    if (a === bySeat || b === bySeat) throw new Error('Treaty pair must be two other seats.');
    if (a === b) throw new Error('Treaty pair must be two distinct seats.');
    if (!state.seats[a] || !state.seats[b] || state.seats[a]!.eliminated || state.seats[b]!.eliminated) {
      throw new Error('Treaty seats must be alive.');
    }
    pending.treatyPair = [a, b];
  }
  if (charDef.action.id === 'mercenaryHire') {
    const partnerIdx = action.mercenaryPartner;
    if (partnerIdx === undefined || partnerIdx === null) throw new Error('Mercenary needs a partner.');
    const partner = state.seats[partnerIdx];
    if (!partner || partner.eliminated || partnerIdx === bySeat || partnerIdx === pending.target) {
      throw new Error('Invalid Mercenary partner.');
    }
    if (partner.coins < 1) throw new Error('Partner has no coin to contribute.');
    partner.coins -= 1;
    pending.mercenaryPartner = partnerIdx;
  }

  // Cost is paid on declaration. It stays spent if the action is blocked
  // (Contessa: "the fee paid for the assassin remains spent"), but is
  // refunded if the claim itself is successfully challenged — official rule:
  // "any coins paid as the cost of the action are returned" (resolveChallenge).
  cur.coins -= charDef.action.cost;

  state.pending = pending;
  pushEvent(state, {
    kind: 'declare',
    seat: bySeat,
    generalId: null,
    character: action.claimedCharacter,
    target: pending.target,
  });
  appendLog(
    state,
    `${cur.name} claims ${charDef.name}${pending.target !== null ? ` against ${state.seats[pending.target]!.name}` : ''}.`,
  );
  // Every character claim is challengeable.
  state.phase = 'awaitingChallenge';
  closeWindowIfDone(state);
}

// --- Challenge / block window ----------------------------------------------

function handleChallenge(state: CoupPrivateState, bySeat: SeatIndex): void {
  if (state.phase !== 'awaitingChallenge' && state.phase !== 'awaitingBlockChallenge') {
    throw new Error(`No challenge window open (${state.phase}).`);
  }
  if (!awaitingSeats(state).includes(bySeat)) {
    throw new Error("You can't challenge this claim.");
  }
  return resolveChallenge(state, bySeat, state.phase === 'awaitingChallenge' ? 'active' : 'blocker');
}

/** A successfully challenged action fails and its cost comes back (official rule). */
function refundActionCost(state: CoupPrivateState): void {
  const p = state.pending;
  if (!p || p.claimedCharacter === null || p.claimedCharacter === undefined) return;
  const cost = CHARACTERS[p.claimedCharacter].action?.cost ?? 0;
  if (cost > 0) {
    state.seats[p.by]!.coins += cost;
    appendLog(state, `${state.seats[p.by]!.name} gets the ${cost} coin${cost === 1 ? '' : 's'} back.`);
  }
  if (p.mercenaryPartner !== null && p.mercenaryPartner !== undefined) {
    state.seats[p.mercenaryPartner]!.coins += 1;
  }
}

function resolveChallenge(state: CoupPrivateState, challenger: SeatIndex, against: 'active' | 'blocker'): void {
  const p = state.pending!;
  const claimedChar = against === 'active' ? p.claimedCharacter! : p.blocker!.character;
  const claimerIdx = against === 'active' ? p.by : p.blocker!.by;
  const claimer = state.seats[claimerIdx]!;
  const challengerName = state.seats[challenger]!.name;
  const honest = seatHas(claimer, claimedChar);
  pushEvent(state, {
    kind: 'challenge',
    challenger,
    claimer: claimerIdx,
    character: claimedChar,
    honest,
    onBlock: against === 'blocker',
  });

  if (honest) {
    // Show the card, shuffle it back into the court deck, draw a replacement
    // face-down. The replacement's identity never enters the log or events.
    appendLog(
      state,
      `${challengerName} challenged ${claimer.name}, who reveals ${CHARACTERS[claimedChar].name}. ${challengerName} loses an influence.`,
    );
    const idx = claimer.influences.findIndex((i) => !i.revealed && i.char === claimedChar);
    const provenCard = claimer.influences[idx]!;
    returnAndShuffle(state, [provenCard.char]);
    provenCard.char = drawCard(state);
    pushEvent(state, { kind: 'redraw', seat: claimerIdx, cardIndex: idx });
    return challengeLoserLoses(
      state,
      challenger,
      'failedChallenge',
      against === 'active' ? 'continueAction' : 'continueBlock',
    );
  }
  appendLog(
    state,
    `${challengerName} challenged ${claimer.name}, who did NOT have ${CHARACTERS[claimedChar].name}. ${claimer.name} loses an influence.`,
  );
  if (against === 'active') refundActionCost(state);
  return challengeLoserLoses(
    state,
    claimerIdx,
    'lostBluff',
    against === 'active' ? 'fizzle' : 'continueAfterBlockBluff',
  );
}

const RESPONSE_PHASES = new Set([
  'awaitingChallenge',
  'awaitingBlock',
  'awaitingBlockChallenge',
  'pileOnWindow',
  'chipInWindow',
]);

function handlePass(state: CoupPrivateState, bySeat: SeatIndex): void {
  const p = state.pending;
  if (!p || !RESPONSE_PHASES.has(state.phase)) throw new Error(`Pass not valid in phase ${state.phase}`);
  if (!awaitingSeats(state).includes(bySeat)) throw new Error("You aren't being asked to respond.");
  if (state.phase === 'pileOnWindow') p.pileOnPot!.closed.push(bySeat);
  else if (state.phase === 'chipInWindow') p.chipInPot!.passes.push(bySeat);
  else p.passes.push(bySeat);
  closeWindowIfDone(state);
}

function declareBlock(state: CoupPrivateState, bySeat: SeatIndex, character: CoupCharacter): void {
  if (state.phase !== 'awaitingBlock') throw new Error(`Block not valid in phase ${state.phase}`);
  const p = state.pending!;
  if (!awaitingSeats(state).includes(bySeat)) {
    throw new Error(p.target !== null ? 'Only the target can block this action.' : "You can't block now.");
  }
  if (!validBlockersFor(state.activeCharacters, state.ruleset, p).includes(character)) {
    throw new Error(`${CHARACTERS[character]?.name ?? 'That character'} can't block this action.`);
  }
  p.blocker = { by: bySeat, character };
  p.passes = [];
  pushEvent(state, { kind: 'block', seat: bySeat, character, against: p.by });
  appendLog(state, `${state.seats[bySeat]!.name} blocks as ${CHARACTERS[character].name}.`);
  state.phase = 'awaitingBlockChallenge';
  closeWindowIfDone(state);
}

// --- Lose / exchange / peek -------------------------------------------------

function pickLose(state: CoupPrivateState, bySeat: SeatIndex, cardIndex: 0 | 1): void {
  if (state.phase !== 'loseInfluence') throw new Error(`Lose not valid in phase ${state.phase}`);
  const p = state.pending!;
  if (!p.loseInfluencePending || p.loseInfluencePending.seat !== bySeat) {
    throw new Error('Wrong seat for lose-influence.');
  }
  assertCardIndex(cardIndex);
  // Validates face-down BEFORE the bless check: picking an already-revealed
  // card must not count as "losing" (that used to dodge losses forever).
  loseInfluence(state, bySeat, cardIndex);
  const resume = p.resumeAfterLose;
  p.loseInfluencePending = null;
  p.resumeAfterLose = null;
  if (checkWin(state)) return;
  resumeTurn(state, resume);
}

function exchangeReturn(state: CoupPrivateState, bySeat: SeatIndex, keepIndices: number[]): void {
  if (state.phase !== 'exchangePick') throw new Error(`Exchange not valid in phase ${state.phase}`);
  const p = state.pending!;
  if (bySeat !== p.by) throw new Error('Wrong seat for exchange.');
  const offer = state.exchangeOffer;
  if (!offer) throw new Error('No exchange offer.');
  if (!Array.isArray(keepIndices) || keepIndices.length !== offer.keepCount) {
    throw new Error(`Keep exactly ${offer.keepCount} cards.`);
  }
  const seen = new Set<number>();
  for (const i of keepIndices) {
    if (!Number.isInteger(i) || i < 0 || i >= offer.cards.length) throw new Error(`Invalid index ${i}`);
    if (seen.has(i)) throw new Error(`Duplicate index ${i}`);
    seen.add(i);
  }
  const kept: CoupCharacter[] = keepIndices.map((i) => offer.cards[i]!);
  const returned: CoupCharacter[] = offer.cards.filter((_, i) => !seen.has(i));
  const seat = state.seats[bySeat]!;
  let cursor = 0;
  for (const inf of seat.influences) {
    if (!inf.revealed) inf.char = kept[cursor++]!;
  }
  returnAndShuffle(state, returned);
  state.exchangeOffer = null;
  appendLog(state, `${seat.name} returned ${returned.length} card${returned.length === 1 ? '' : 's'} to the deck.`);
  endTurn(state);
}

function ackPeek(state: CoupPrivateState, bySeat: SeatIndex): void {
  if (state.phase !== 'spyPeek') throw new Error(`Ack not valid in phase ${state.phase}`);
  if (bySeat !== state.pending!.by) throw new Error('Only the peeker can ack.');
  endTurn(state);
}

// --- Pile-on (Capitalist / Financier) ---------------------------------------

function joinPileOn(state: CoupPrivateState, bySeat: SeatIndex): void {
  if (state.phase !== 'pileOnWindow') throw new Error(`Join not valid in phase ${state.phase}`);
  const pot = state.pending!.pileOnPot!;
  if (!awaitingSeats(state).includes(bySeat)) throw new Error("You can't join this pile-on.");
  // House rule: joiners implicitly claim the same character and are not
  // individually challengeable.
  pot.contributors.push(bySeat);
  appendLog(state, `${state.seats[bySeat]!.name} piles on (+${pot.coinsEach}).`);
  closeWindowIfDone(state);
}

function closePileOn(state: CoupPrivateState, bySeat: SeatIndex): void {
  if (state.phase !== 'pileOnWindow') throw new Error(`Close not valid in phase ${state.phase}`);
  if (bySeat !== state.pending!.by) throw new Error('Only the opener can close the pile-on.');
  payoutPileOn(state);
}

function payoutPileOn(state: CoupPrivateState): void {
  const pot = state.pending!.pileOnPot!;
  for (const s of pot.contributors) state.seats[s]!.coins += pot.coinsEach;
  appendLog(state, `Pile-on resolved: ${pot.contributors.length} contributor(s) each take +${pot.coinsEach}.`);
  endTurn(state);
}

// --- Chip-in (Protestor / Anarchist) ----------------------------------------

function chipIn(state: CoupPrivateState, bySeat: SeatIndex): void {
  if (state.phase !== 'chipInWindow') throw new Error(`Chip not valid in phase ${state.phase}`);
  const p = state.pending!;
  const pot = p.chipInPot!;
  if (!awaitingSeats(state).includes(bySeat)) throw new Error("You can't chip in to this rally.");
  const seat = state.seats[bySeat]!;
  if (seat.coins < 1) throw new Error('No coin to chip.');
  // Paid coins go to the treasury.
  seat.coins -= 1;
  pot.contributors.push(bySeat);
  appendLog(state, `${seat.name} chipped in.`);
  if (pot.contributors.length >= pot.threshold) return chipInStrike(state);
  closeWindowIfDone(state);
}

function settleChipIn(state: CoupPrivateState): void {
  const p = state.pending!;
  const pot = p.chipInPot!;
  if (pot.contributors.length >= pot.threshold) return chipInStrike(state);
  appendLog(state, `Rally fizzles: only ${pot.contributors.length}/${pot.threshold} chipped in.`);
  endTurn(state);
}

function chipInStrike(state: CoupPrivateState): void {
  const p = state.pending!;
  appendLog(state, `Rally threshold reached: ${state.seats[p.target!]!.name} loses an influence.`);
  p.chipInPot = null;
  strikeTarget(state, p.target!, 'chipIn', 'force');
}

// --- Force swap (Newscaster / Reporter / Producer / Lobbyist / Diplomat) ----

function targetSwapPick(state: CoupPrivateState, bySeat: SeatIndex, cardIndex: 0 | 1): void {
  if (state.phase !== 'targetSwapPick') throw new Error(`Swap pick not valid in phase ${state.phase}`);
  const p = state.pending!;
  const swap = p.swapInProgress;
  if (!swap) throw new Error('No swap in progress.');
  if (bySeat !== swap.target) throw new Error('Only the swap target may pick.');
  assertCardIndex(cardIndex);
  const t = state.seats[swap.target]!;
  assertFaceDown(t, cardIndex);
  const inf = t.influences[cardIndex]!;
  const returned = inf.char;
  inf.char = swap.drawnCard;
  returnAndShuffle(state, [returned]);
  // House rule: the actor drew the card, so they know what the target now
  // holds in that slot. Private to the actor.
  state.privatePeeks[p.by]!.push({
    byActionId: 'inquisitorPeek',
    target: swap.target,
    card: swap.drawnCard,
    cardIndex,
  });
  appendLog(state, `${t.name} swapped a card with the deck.`);
  p.swapInProgress = null;
  endTurn(state);
}

// --- Sell influence (Arms Dealer) -------------------------------------------

function sellInfluence(state: CoupPrivateState, bySeat: SeatIndex, cardIndex: 0 | 1): void {
  if (state.phase !== 'sellInfluencePick') throw new Error(`Sell not valid in phase ${state.phase}`);
  if (bySeat !== state.pending!.by) throw new Error('Only the Arms Dealer may sell.');
  assertCardIndex(cardIndex);
  const seat = state.seats[bySeat]!;
  assertFaceDown(seat, cardIndex);
  if (livingInfluenceCount(seat) <= 1) throw new Error("Can't sell your last influence.");
  flipFaceUp(state, bySeat, cardIndex);
  seat.coins += 4;
  seat.tokens.weapons = Math.min(3, seat.tokens.weapons + 1);
  appendLog(state, `${seat.name} (Arms Dealer) sold a card for 4 coins + 1 weapon (now ${seat.tokens.weapons}).`);
  endTurn(state);
}

// ============================================================================
// Re-exports for UI
// ============================================================================

export { CHARACTERS } from './characters';
