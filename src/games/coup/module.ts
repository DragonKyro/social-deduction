import { makeRng, rngShuffle } from '@/engine/rng';
import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { CoupGameAction } from './actions';
import { CHARACTERS, blockersFor } from './characters';
import { buildInitialState, validateCharacterSetFull } from './setup';
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

function drawCard(state: CoupPrivateState): CoupCharacter {
  if (state.deck.length === 0) {
    throw new Error('Deck is empty');
  }
  return state.deck.shift()!;
}

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
    treatyPair: null,
    pileOnPot: null,
    chipInPot: null,
    swapInProgress: null,
    loseInfluencePending: null,
  };
}

function challengeWindowParticipants(state: CoupPrivateState, exclude: SeatIndex[]): SeatIndex[] {
  return livingSeats(state).filter((s) => !exclude.includes(s));
}

function seatHas(seat: CoupSeatState, character: CoupCharacter): boolean {
  return seat.influences.some((i) => !i.revealed && i.char === character);
}

// Mark an influence as revealed. Respects the reviveBlessed token — if the
// seat is about to be eliminated and holds the token, the token is spent and
// the seat keeps the card face-down ("blessed save").
function loseInfluencePick(seat: CoupSeatState, cardIndex: 0 | 1): boolean {
  const card = seat.influences[cardIndex];
  if (!card || card.revealed) return false;
  if (livingInfluenceCount(seat) === 1 && seat.tokens.reviveBlessed) {
    // Bless saves the last influence. Token consumed; card stays face-down.
    seat.tokens.reviveBlessed = false;
    return false;
  }
  card.revealed = true;
  if (livingInfluenceCount(seat) === 0) {
    seat.eliminated = true;
  }
  return true;
}

function loseAnyInfluence(seat: CoupSeatState): boolean {
  const idx = seat.influences.findIndex((i) => !i.revealed);
  if (idx === -1) return false;
  return loseInfluencePick(seat, idx as 0 | 1);
}

function checkWin(state: CoupPrivateState) {
  const alive = state.seats.filter((s) => !s.eliminated);
  if (alive.length === 1) {
    state.winnerSeat = alive[0]!.index;
    state.phase = 'gameOver';
    appendLog(state, `${alive[0]!.name} wins!`);
  }
}

// Token-aware targeting check. Throws on illegal targets.
function assertTargetable(state: CoupPrivateState, by: SeatIndex, target: SeatIndex) {
  const t = state.seats[target];
  if (!t || t.eliminated) throw new Error('Invalid target.');
  if (target === by) throw new Error("You can't target yourself.");
  if (t.tokens.peacekeeping) {
    throw new Error(`${t.name} is under Peacekeeping protection.`);
  }
  if (t.tokens.treaty === by || state.seats[by]!.tokens.treaty === target) {
    throw new Error(`A Treaty bars you from targeting ${t.name}.`);
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
        const target = state.seats[p.target!]!;
        appendLog(state, `${by.name} couped ${target.name}.`);
        if (livingInfluenceCount(target) <= 1) {
          loseAnyInfluence(target);
          checkWin(state);
          if ((state.phase as string) !== 'gameOver') endTurn(state);
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

  switch (p.characterActionId) {
    case 'tax': {
      by.coins += 3;
      appendLog(state, `${by.name} taxed +3 as ${characterLabel(p.claimedCharacter)}.`);
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
      const target = state.seats[p.target!]!;
      const reasonMap: Record<string, 'assassinate' | 'soldier' | 'mercenary' | 'guerrilla' | 'paramilitary'> = {
        assassinate: 'assassinate',
        soldierStrike: 'soldier',
        mercenaryHire: 'mercenary',
        protectedEliminate: 'guerrilla',
        paramilitaryRiot: 'paramilitary',
      };
      const reason = reasonMap[p.characterActionId];
      appendLog(state, `${by.name} (${characterLabel(p.claimedCharacter)}) strikes ${target.name}.`);
      if (livingInfluenceCount(target) <= 1) {
        loseAnyInfluence(target);
        checkWin(state);
        if ((state.phase as string) !== 'gameOver') endTurn(state);
        return;
      }
      p.loseInfluencePending = { seat: target.index, reason };
      state.phase = 'loseInfluence';
      return;
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
        const target = state.seats[p.target!]!;
        const idx = (p.inquisitorPeekCardIndex ?? 0) as 0 | 1;
        const card = target.influences[idx];
        if (!card) return endTurn(state);
        state.privatePeeks[by.index]!.push({
          byActionId: 'inquisitorPeek',
          target: target.index,
          card: card.char,
          cardIndex: idx,
        });
        appendLog(state, `${by.name} (Inquisitor) peeked at ${target.name}.`);
        state.phase = 'spyPeek';
        return;
      }
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
      if (!card) return endTurn(state);
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

    // === New mechanics this milestone ======================================

    case 'pileOnIncome': {
      const baseAmount =
        p.claimedCharacter && CHARACTERS[p.claimedCharacter]?.action?.amount
          ? CHARACTERS[p.claimedCharacter]!.action!.amount!
          : 2;
      p.pileOnPot = {
        contributors: [p.by],
        coinsEach: baseAmount,
        closed: [],
      };
      appendLog(
        state,
        `${by.name} opens a ${characterLabel(p.claimedCharacter)} pile-on (+${baseAmount} each — join or pass).`,
      );
      state.phase = 'pileOnWindow';
      return;
    }
    case 'chipInEliminate': {
      const target = state.seats[p.target!]!;
      const livingOpponents = livingSeats(state).filter((s) => s !== p.by);
      const threshold = Math.max(1, Math.ceil(livingOpponents.length / 2));
      p.chipInPot = { contributors: [], threshold, passes: [] };
      appendLog(
        state,
        `${by.name} (${characterLabel(p.claimedCharacter)}) rallies against ${target.name} — opponents may chip 1 coin each (need ${threshold}).`,
      );
      state.phase = 'chipInWindow';
      return;
    }
    case 'forceSwap': {
      const target = state.seats[p.target!]!;
      const drawn = drawCard(state);
      p.swapInProgress = { target: target.index, drawnCard: drawn };
      // The actor sees the drawn card via the spyPeek-style ack (we record it
      // in their peek log briefly so the UI surfaces it). But the target gets
      // to pick which card to swap — and they don't know what they're getting.
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
        appendLog(state, `${by.name} (Socialist) redistributed to ${each} coins each (you keep the remainder of ${remainder}).`);
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
      target.tokens.reviveBlessed = true;
      appendLog(state, `${by.name} (Priest) blessed ${target.name} — one revive token.`);
      return endTurn(state);
    }
    case 'lawyerSwing': {
      by.coins += 2;
      by.tokens.reviveBlessed = true;
      appendLog(state, `${by.name} (Lawyer) took +2 coins and a revive token.`);
      return endTurn(state);
    }
    case 'bishopBless': {
      by.coins += 1;
      by.tokens.reviveBlessed = true;
      appendLog(state, `${by.name} (Bishop) took +1 coin and a revive token.`);
      return endTurn(state);
    }
    case 'peacekeeperShield': {
      by.tokens.peacekeeping = true;
      appendLog(state, `${by.name} (Peacekeeper) is now under protection.`);
      return endTurn(state);
    }
    case 'foreignConsularTreaty': {
      if (!p.treatyPair) {
        appendLog(state, `${by.name} (Foreign Consular) — no treaty pair selected; turn fizzles.`);
        return endTurn(state);
      }
      const [a, b] = p.treatyPair;
      const sa = state.seats[a]!;
      const sb = state.seats[b]!;
      sa.tokens.treaty = b;
      sb.tokens.treaty = a;
      appendLog(state, `${by.name} (Foreign Consular) placed a Treaty between ${sa.name} and ${sb.name}.`);
      return endTurn(state);
    }
    case 'armsDealerSell': {
      // Open the sell-influence pick phase.
      appendLog(state, `${by.name} (Arms Dealer) — flip one of your cards for 4 coins + 1 weapon.`);
      state.phase = 'sellInfluencePick';
      return;
    }
    default:
      return endTurn(state);
  }
}

function characterLabel(c: CoupCharacter | null): string {
  return c ? CHARACTERS[c].name : '???';
}

// ============================================================================
// End-of-turn bookkeeping. Drop pending state, rotate to next living seat,
// and decay tokens that bind to the actor's next turn.
// ============================================================================

function endTurn(state: CoupPrivateState) {
  state.exchangeOffer = null;
  const finishedBy = state.pending?.by ?? null;
  state.pending = null;
  if (state.phase === 'gameOver') return;

  // Token decay model (kept intentionally simple):
  //   - peacekeeping clears when its HOLDER takes their next turn (handled at
  //     the top of declareGeneral / declareCharacter, not here, so a
  //     just-granted token survives until the holder acts).
  //   - treaty bonds persist until overwritten by a later Foreign Consular
  //     claim (no time-based decay).
  void finishedBy;

  state.currentSeat = nextLivingAfter(state, state.currentSeat);
  state.phase = 'turnStart';
}

// ============================================================================
// Block check helpers
// ============================================================================

function challengeWindowFinished(state: CoupPrivateState, pendingPasses: SeatIndex[], exclude: SeatIndex[]): boolean {
  const participants = challengeWindowParticipants(state, exclude);
  return participants.every((p) => pendingPasses.includes(p));
}

function pendingBlockers(state: CoupPrivateState): CoupCharacter[] {
  const p = state.pending;
  if (!p) return [];
  if (p.kind === 'general') {
    if (p.generalId === 'foreignAid') {
      return blockersFor(state.activeCharacters, 'foreignAid');
    }
    if (p.generalId === 'coup') {
      // Judge / Lawyer / Paramilitary / Guerrilla can block Coup in G54.
      return state.ruleset === 'g54' ? blockersFor(state.activeCharacters, 'coup') : [];
    }
    return [];
  }
  if (p.characterActionId === 'assassinate') {
    return blockersFor(state.activeCharacters, 'assassinate');
  }
  if (p.characterActionId === 'steal' || p.characterActionId === 'thiefSteal' || p.characterActionId === 'customSteal') {
    return blockersFor(state.activeCharacters, 'steal');
  }
  if (p.characterActionId === 'protectedEliminate') {
    // Guerrilla: only another Guerrilla blocks. We hand-roll this by checking
    // if Guerrilla is in the active set.
    return state.activeCharacters.includes('guerrilla') ? ['guerrilla'] : [];
  }
  if (p.characterActionId === 'paramilitaryRiot') {
    return state.activeCharacters.includes('paramilitary') ? ['paramilitary'] : [];
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
        tokens: { ...s.tokens },
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
            treatyPair: state.pending.treatyPair,
            pileOnPot: state.pending.pileOnPot
              ? { ...state.pending.pileOnPot, contributors: [...state.pending.pileOnPot.contributors], closed: [...state.pending.pileOnPot.closed] }
              : null,
            chipInPot: state.pending.chipInPot
              ? { ...state.pending.chipInPot, contributors: [...state.pending.chipInPot.contributors], passes: [...state.pending.chipInPot.passes] }
              : null,
            swapTarget: state.pending.swapInProgress?.target ?? null,
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
      return;
    case 'spyPickTarget':
      void action;
      return;
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
  }
}

// --- Active-turn declarations ----------------------------------------------

function declareGeneral(state: CoupPrivateState, id: GeneralActionId, target?: SeatIndex): void {
  if (state.phase !== 'turnStart') throw new Error(`Can't declare in phase ${state.phase}`);
  const cur = state.seats[state.currentSeat]!;
  // Active player's own peacekeeping expires when they start to act. Treaty
  // bonds persist until a NEW Foreign Consular claim overwrites them.
  cur.tokens.peacekeeping = false;
  if (cur.coins >= 10 && id !== 'coup') {
    throw new Error('You must coup at 10+ coins.');
  }
  const pending = emptyPending(state.currentSeat);
  pending.kind = 'general';
  pending.generalId = id;
  pending.target = target ?? null;

  switch (id) {
    case 'income': {
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
      assertTargetable(state, state.currentSeat, target);
      cur.coins -= 7;
      state.pending = pending;
      if (state.ruleset === 'g54' && isActionBlockable(state)) {
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
  cur.tokens.peacekeeping = false;
  if (cur.coins >= 10) throw new Error('You must coup at 10+ coins.');
  if (!state.activeCharacters.includes(action.claimedCharacter)) {
    throw new Error(`${characterLabel(action.claimedCharacter)} isn't in this game.`);
  }
  const charDef = CHARACTERS[action.claimedCharacter];
  if (!charDef.action || charDef.action.id !== action.characterActionId) {
    throw new Error(`${charDef.name} can't take that action.`);
  }
  if (cur.coins < charDef.action.cost) {
    throw new Error(`Not enough coins (need ${charDef.action.cost}).`);
  }
  cur.coins -= charDef.action.cost;
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
  pending.treatyPair = action.treatyPair ?? null;

  if (charDef.action.id === 'spyPeek') {
    pending.spyPeekCardIndex = action.inquisitorPeekCardIndex ?? 0;
  }

  // Validate target presence + token gates.
  if (charDef.action.target === 'other') {
    if (pending.target === null) throw new Error(`${charDef.name} requires a target.`);
    assertTargetable(state, state.currentSeat, pending.target);
  }
  if (charDef.action.target === 'pair') {
    if (!pending.treatyPair) throw new Error(`${charDef.name} requires a treaty pair.`);
    const [a, b] = pending.treatyPair;
    if (a === state.currentSeat || b === state.currentSeat) {
      throw new Error('Treaty pair must be two other seats.');
    }
    if (a === b) throw new Error('Treaty pair must be two distinct seats.');
    if (state.seats[a]?.eliminated || state.seats[b]?.eliminated) {
      throw new Error('Treaty seats must be alive.');
    }
  }

  state.pending = pending;
  appendLog(state, `${cur.name} claims ${charDef.name}.`);

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

// --- Challenge / block window ----------------------------------------------

function handleChallenge(state: CoupPrivateState, bySeat: SeatIndex): void {
  if (state.phase !== 'awaitingChallenge' && state.phase !== 'awaitingBlockChallenge') {
    throw new Error(`No challenge window open (${state.phase}).`);
  }
  const p = state.pending;
  if (!p) throw new Error('No pending action.');

  if (state.phase === 'awaitingChallenge') {
    if (bySeat === p.by) throw new Error("You can't challenge yourself.");
    if (state.seats[bySeat]!.eliminated) throw new Error("Eliminated seats can't challenge.");
    return resolveChallenge(state, bySeat, 'active');
  }
  const blocker = p.blocker!;
  if (bySeat === blocker.by) throw new Error("You can't challenge your own block.");
  if (state.seats[bySeat]!.eliminated) throw new Error("Eliminated seats can't challenge.");
  return resolveChallenge(state, bySeat, 'blocker');
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
    appendLog(
      state,
      `${state.seats[challenger]!.name} challenged — ${claimer.name} reveals ${CHARACTERS[claimedChar].name}. Challenger loses an influence.`,
    );
    const idx = claimer.influences.findIndex((i) => !i.revealed && i.char === claimedChar);
    const revealedCard = claimer.influences[idx]!;
    returnAndShuffle(state, [revealedCard.char]);
    const newCard = drawCard(state);
    revealedCard.char = newCard;
    if (livingInfluenceCount(state.seats[challenger]!) <= 1) {
      loseAnyInfluence(state.seats[challenger]!);
      checkWin(state);
      if (state.phase === 'gameOver') return;
      proceedAfterChallengeResolved(state, against, true);
      return;
    }
    p.loseInfluencePending = { seat: challenger, reason: 'failedChallenge' };
    p.passes = [];
    (p as unknown as { resumeAfterLose: 'continueAction' | 'continueBlock' }).resumeAfterLose =
      against === 'active' ? 'continueAction' : 'continueBlock';
    state.phase = 'loseInfluence';
    return;
  }
  appendLog(
    state,
    `${state.seats[challenger]!.name} challenged — ${claimer.name} did NOT have ${CHARACTERS[claimedChar].name}. Claimer loses an influence.`,
  );
  if (livingInfluenceCount(claimer) <= 1) {
    loseAnyInfluence(claimer);
    checkWin(state);
    if (state.phase === 'gameOver') return;
    proceedAfterChallengeResolved(state, against, false);
    return;
  }
  p.loseInfluencePending = { seat: claimerSeatIdx, reason: 'lostBluff' };
  p.passes = [];
  (p as unknown as { resumeAfterLose: 'fizzle' | 'continueAfterBlockBluff' }).resumeAfterLose =
    against === 'active' ? 'fizzle' : 'continueAfterBlockBluff';
  state.phase = 'loseInfluence';
}

function proceedAfterChallengeResolved(
  state: CoupPrivateState,
  against: 'active' | 'blocker',
  claimSuccess: boolean,
): void {
  const p = state.pending!;
  if (against === 'active') {
    if (claimSuccess) {
      if (isActionBlockable(state)) {
        state.phase = 'awaitingBlock';
        return;
      }
      resolveEffect(state);
      return;
    }
    appendLog(state, `${state.seats[p.by]!.name}'s action fizzles.`);
    endTurn(state);
    return;
  }
  if (claimSuccess) {
    appendLog(state, `${state.seats[p.blocker!.by]!.name}'s block stands. Action fizzles.`);
    endTurn(state);
    return;
  }
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
      resolveEffect(state);
    }
    return;
  }
  if (state.phase === 'awaitingBlockChallenge') {
    if (bySeat === p.blocker!.by) throw new Error("Can't pass your own block window.");
    if (!p.passes.includes(bySeat)) p.passes.push(bySeat);
    if (challengeWindowFinished(state, p.passes, [p.blocker!.by])) {
      appendLog(state, `Block by ${state.seats[p.blocker!.by]!.name} stands. Action fizzles.`);
      endTurn(state);
    }
    return;
  }
  if (state.phase === 'pileOnWindow') {
    return passPileOn(state, bySeat);
  }
  if (state.phase === 'chipInWindow') {
    return passChipIn(state, bySeat);
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
  // Steal can only be blocked by the targeted seat. Foreign Aid can be blocked
  // by anyone. Assassinate / Soldier-class / Coup the rules vary: in Classic
  // only the target blocks; in G54 a third party can block a Coup with a
  // Lawyer/Judge claim ("lawyered up", "judge intercedes"). We keep target-
  // only for steal+assassinate, but open Coup blocks to anyone (G54).
  if (
    p.kind === 'character' &&
    (p.characterActionId === 'steal' ||
      p.characterActionId === 'thiefSteal' ||
      p.characterActionId === 'customSteal') &&
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

// --- Reveal / lose / exchange ----------------------------------------------

function revealCard(state: CoupPrivateState, bySeat: SeatIndex, cardIndex: 0 | 1): void {
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
  const beforeRevealed = seat.influences[cardIndex]?.revealed ?? true;
  const blessed = livingInfluenceCount(seat) === 1 && seat.tokens.reviveBlessed;
  const flipped = loseInfluencePick(seat, cardIndex);
  if (!flipped && !blessed) {
    throw new Error('Card already revealed.');
  }
  if (blessed) {
    appendLog(state, `${seat.name} was blessed — they keep their last card (revive token spent).`);
  } else {
    const cardCharIdx = seat.influences[cardIndex]?.char;
    if (cardCharIdx && !beforeRevealed) {
      appendLog(
        state,
        `${seat.name} lost ${CHARACTERS[cardCharIdx].name} (${p.loseInfluencePending.reason}).`,
      );
    }
  }
  p.loseInfluencePending = null;
  checkWin(state);
  if ((state.phase as string) === 'gameOver') return;
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

// --- New: pile-on (Capitalist / Financier) ----------------------------------

function joinPileOn(state: CoupPrivateState, bySeat: SeatIndex): void {
  if (state.phase !== 'pileOnWindow') throw new Error(`Join not valid in phase ${state.phase}`);
  const p = state.pending!;
  const pot = p.pileOnPot;
  if (!pot) throw new Error('No pile-on pot.');
  if (pot.contributors.includes(bySeat)) throw new Error('Already joined.');
  if (state.seats[bySeat]!.eliminated) throw new Error('Eliminated seats can\'t join.');
  if (bySeat === p.by) throw new Error('Active seat already in the pot.');
  // Joiners implicitly claim the same character. We do NOT support per-joiner
  // challenges in this milestone — when the original claim survives a
  // challenge (or no challenge was raised), each joiner takes the coins.
  pot.contributors.push(bySeat);
  appendLog(state, `${state.seats[bySeat]!.name} piles on (+${pot.coinsEach}).`);
}

function passPileOn(state: CoupPrivateState, bySeat: SeatIndex): void {
  const p = state.pending!;
  const pot = p.pileOnPot;
  if (!pot) throw new Error('No pile-on pot.');
  if (!pot.closed.includes(bySeat)) pot.closed.push(bySeat);
  // Anyone living except active that hasn't already joined or closed.
  const livingOpponents = livingSeats(state).filter((s) => s !== p.by);
  const finished = livingOpponents.every((s) => pot.contributors.includes(s) || pot.closed.includes(s));
  if (finished) closePileOn(state, p.by);
}

function closePileOn(state: CoupPrivateState, bySeat: SeatIndex): void {
  if (state.phase !== 'pileOnWindow') throw new Error(`Close not valid in phase ${state.phase}`);
  const p = state.pending!;
  if (bySeat !== p.by) throw new Error('Only the opener can close the pile-on.');
  const pot = p.pileOnPot;
  if (!pot) throw new Error('No pile-on pot.');
  for (const s of pot.contributors) {
    state.seats[s]!.coins += pot.coinsEach;
  }
  appendLog(
    state,
    `Pile-on resolved: ${pot.contributors.length} contributors each take +${pot.coinsEach}.`,
  );
  endTurn(state);
}

// --- New: chip-in (Protestor / Anarchist) -----------------------------------

function chipIn(state: CoupPrivateState, bySeat: SeatIndex): void {
  if (state.phase !== 'chipInWindow') throw new Error(`Chip not valid in phase ${state.phase}`);
  const p = state.pending!;
  const pot = p.chipInPot;
  if (!pot) throw new Error('No chip-in pot.');
  if (bySeat === p.by) throw new Error('Active seat doesn\'t chip in.');
  if (state.seats[bySeat]!.eliminated) throw new Error('Eliminated seats can\'t chip.');
  if (pot.contributors.includes(bySeat)) throw new Error('Already chipped.');
  if (state.seats[bySeat]!.coins < 1) throw new Error('No coin to chip.');
  state.seats[bySeat]!.coins -= 1;
  pot.contributors.push(bySeat);
  // Anarchy / Protestor: paid coins go to treasury (i.e. lost). This matches
  // the "rally cost" framing in the house rules.
  appendLog(state, `${state.seats[bySeat]!.name} chipped in.`);
  if (pot.contributors.length >= pot.threshold) {
    // Threshold met — target loses an influence.
    const target = state.seats[p.target!]!;
    appendLog(state, `Rally threshold reached — ${target.name} loses an influence.`);
    if (livingInfluenceCount(target) <= 1) {
      loseAnyInfluence(target);
      checkWin(state);
      if ((state.phase as string) !== 'gameOver') endTurn(state);
      return;
    }
    p.loseInfluencePending = { seat: target.index, reason: 'chipIn' };
    p.chipInPot = null;
    state.phase = 'loseInfluence';
  }
}

function passChipIn(state: CoupPrivateState, bySeat: SeatIndex): void {
  const p = state.pending!;
  const pot = p.chipInPot;
  if (!pot) throw new Error('No chip-in pot.');
  if (bySeat === p.by) throw new Error('Active seat doesn\'t pass chip-in.');
  if (!pot.passes.includes(bySeat)) pot.passes.push(bySeat);
  const livingOpponents = livingSeats(state).filter((s) => s !== p.by);
  const finished = livingOpponents.every(
    (s) => pot.contributors.includes(s) || pot.passes.includes(s),
  );
  if (finished) {
    if (pot.contributors.length >= pot.threshold) {
      const target = state.seats[p.target!]!;
      if (livingInfluenceCount(target) <= 1) {
        loseAnyInfluence(target);
        checkWin(state);
        if ((state.phase as string) !== 'gameOver') endTurn(state);
        return;
      }
      p.loseInfluencePending = { seat: target.index, reason: 'chipIn' };
      p.chipInPot = null;
      state.phase = 'loseInfluence';
      return;
    }
    appendLog(state, `Rally fizzles — only ${pot.contributors.length}/${pot.threshold} chipped in.`);
    endTurn(state);
  }
}

// --- New: forceSwap (Newscaster / Reporter / Producer / Lobbyist / Diplomat)

function targetSwapPick(state: CoupPrivateState, bySeat: SeatIndex, cardIndex: 0 | 1): void {
  if (state.phase !== 'targetSwapPick') throw new Error(`Swap pick not valid in phase ${state.phase}`);
  const p = state.pending!;
  const swap = p.swapInProgress;
  if (!swap) throw new Error('No swap in progress.');
  if (bySeat !== swap.target) throw new Error('Only the swap target may pick.');
  const t = state.seats[swap.target]!;
  const inf = t.influences[cardIndex];
  if (!inf || inf.revealed) throw new Error('Pick an unrevealed card.');
  const returned = inf.char;
  inf.char = swap.drawnCard;
  returnAndShuffle(state, [returned]);
  // Record the swap result as a private peek for the active seat so they can
  // see what they got.
  state.privatePeeks[p.by]!.push({
    byActionId: 'inquisitorPeek',
    target: swap.target,
    card: swap.drawnCard,
    cardIndex: cardIndex,
  });
  appendLog(state, `${state.seats[swap.target]!.name} swapped a card with the deck.`);
  p.swapInProgress = null;
  endTurn(state);
}

// --- New: sellInfluence (Arms Dealer) ---------------------------------------

function sellInfluence(state: CoupPrivateState, bySeat: SeatIndex, cardIndex: 0 | 1): void {
  if (state.phase !== 'sellInfluencePick') throw new Error(`Sell not valid in phase ${state.phase}`);
  const p = state.pending!;
  if (bySeat !== p.by) throw new Error('Only the Arms Dealer may sell.');
  const seat = state.seats[bySeat]!;
  const inf = seat.influences[cardIndex];
  if (!inf || inf.revealed) throw new Error('Pick a face-down card.');
  if (livingInfluenceCount(seat) <= 1) {
    throw new Error("Can't sell your last influence.");
  }
  inf.revealed = true;
  seat.coins += 4;
  seat.tokens.weapons = Math.min(3, seat.tokens.weapons + 1);
  appendLog(
    state,
    `${seat.name} (Arms Dealer) sold ${CHARACTERS[inf.char].name} for 4 coins + 1 weapon (now ${seat.tokens.weapons}).`,
  );
  endTurn(state);
}

// ============================================================================
// Re-exports for UI
// ============================================================================

export { CHARACTERS } from './characters';
