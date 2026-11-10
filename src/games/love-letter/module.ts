import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { LoveLetterAction } from './actions';
import { aiChooseAction } from './ai';
import { buildInitial, dealRound, LOG_LIMIT, tokensToWinFor } from './setup';
import type {
  Card,
  EffectRecord,
  KnowledgeSource,
  LoveLetterPrivateState,
  LoveLetterPublicState,
  PlayerState,
  Rank,
  RoundSummary,
} from './state';
import { RANK_NAMES } from './state';
import { viewFor } from './view';

// ============================================================================
// Love Letter — module
//
// 16-card micro deduction. Hidden info: each seat's hand, the deck, the
// face-down set-aside card, and the results of private effects (Priest peek;
// Baron compare; King swap). `viewFor` (view.ts) is the single chokepoint;
// everything written to `lastEffect` / `log` here must be public-safe.
// ============================================================================

export interface LoveLetterSeatConfig {
  name: string;
  isAI: boolean;
}

export interface LoveLetterOptions {
  players: LoveLetterSeatConfig[];
}

function getOptions(config: GameConfig): LoveLetterOptions {
  return config.gameOptions as unknown as LoveLetterOptions;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function isSeat(state: LoveLetterPrivateState, seat: unknown): seat is SeatIndex {
  return typeof seat === 'number' && Number.isInteger(seat) && state.players[seat] !== undefined;
}

function isRank(r: unknown): r is Rank {
  return typeof r === 'number' && Number.isInteger(r) && r >= 1 && r <= 8;
}

function aliveSeats(state: LoveLetterPrivateState): SeatIndex[] {
  return state.seats.map((s) => s.index).filter((i) => !state.players[i]!.eliminated);
}

// Targetable seats: alive, not Handmaid-protected, and not the actor unless
// `allowSelf` (Prince).
export function targetableSeats(
  state: Pick<LoveLetterPrivateState, 'seats' | 'players'>,
  actor: SeatIndex,
  allowSelf: boolean,
): SeatIndex[] {
  return state.seats
    .map((s) => s.index)
    .filter((i) => {
      const p = state.players[i]!;
      if (p.eliminated) return false;
      if (i === actor) return allowSelf;
      return !p.protected;
    });
}

function everyone(record: Record<SeatIndex, boolean>, state: LoveLetterPrivateState): boolean {
  return state.seats.every((s) => record[s.index]);
}

function resetReveal(state: LoveLetterPrivateState): Record<SeatIndex, boolean> {
  const out: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) out[s.index] = false;
  return out;
}

function nameOf(state: LoveLetterPrivateState, seat: SeatIndex): string {
  return state.players[seat]!.name;
}

function withPlayer(
  state: LoveLetterPrivateState,
  seat: SeatIndex,
  patch: Partial<PlayerState>,
): LoveLetterPrivateState {
  return {
    ...state,
    players: {
      ...state.players,
      [seat]: { ...state.players[seat]!, ...patch },
    },
  };
}

function addLog(state: LoveLetterPrivateState, text: string): LoveLetterPrivateState {
  return {
    ...state,
    log: [...state.log, { round: state.roundNumber, text }].slice(-LOG_LIMIT),
  };
}

// ---- Knowledge bookkeeping -------------------------------------------------
// knowledge[observer][holder] = the card `observer` knows `holder` holds.

type Knowledge = LoveLetterPrivateState['knowledge'];

function cloneKnowledge(k: Knowledge): Knowledge {
  const out: Knowledge = {};
  for (const [obs, m] of Object.entries(k)) out[Number(obs)] = { ...m };
  return out;
}

function learn(
  state: LoveLetterPrivateState,
  observer: SeatIndex,
  holder: SeatIndex,
  card: Card,
  source: KnowledgeSource,
): LoveLetterPrivateState {
  if (observer === holder) return state;
  const k = cloneKnowledge(state.knowledge);
  k[observer] = { ...(k[observer] ?? {}), [holder]: { card, source } };
  return { ...state, knowledge: k };
}

// Holder's hand changed in a way nobody else can see (Prince redraw,
// elimination) — everything known about it is void.
function forgetHolder(state: LoveLetterPrivateState, holder: SeatIndex): LoveLetterPrivateState {
  const k = cloneKnowledge(state.knowledge);
  for (const obs of Object.keys(k)) delete k[Number(obs)]![holder];
  return { ...state, knowledge: k };
}

// Holder played `card`. If an observer knew holder held that rank, they no
// longer know whether the kept card is the known one or the fresh draw.
// If the played card differs from the known one, holder still holds it.
function onPlayed(state: LoveLetterPrivateState, holder: SeatIndex, card: Card): LoveLetterPrivateState {
  const k = cloneKnowledge(state.knowledge);
  for (const obs of Object.keys(k)) {
    const entry = k[Number(obs)]![holder];
    if (entry && entry.card === card) delete k[Number(obs)]![holder];
  }
  return { ...state, knowledge: k };
}

// Eliminate the seat: drop hand into discard (face-up), mark eliminated.
function eliminateSeat(
  state: LoveLetterPrivateState,
  seat: SeatIndex,
): LoveLetterPrivateState {
  const p = state.players[seat]!;
  const next = withPlayer(state, seat, {
    discard: [...p.discard, ...p.hand],
    hand: [],
    eliminated: true,
    protected: false,
  });
  const k = cloneKnowledge(forgetHolder(next, seat).knowledge);
  k[seat] = {};
  return { ...next, knowledge: k };
}

// Advance to the next active seat (skipping eliminated), draw 1, clear that
// seat's Handmaid protection. If the deck is empty, settle the round.
function startNextTurn(state: LoveLetterPrivateState): LoveLetterPrivateState {
  const base: LoveLetterPrivateState = {
    ...state,
    lastEffect: null,
    effectSecret: null,
    priestPeek: null,
    pendingCard: null,
    pendingGuardPlay: null,
  };
  const alive = aliveSeats(base);
  if (alive.length <= 1) {
    return endRound(base, 'lastStanding');
  }
  // Rulebook: the round ends when the deck is empty at the end of a turn.
  if (base.deck.length === 0) {
    return endRound(base, 'deckExhausted');
  }
  const n = base.seats.length;
  let next = base.currentSeat;
  for (let step = 1; step <= n; step++) {
    const candidate = (base.currentSeat + step) % n;
    if (!base.players[candidate]!.eliminated) {
      next = candidate;
      break;
    }
  }
  // Protection lasts "until your next turn".
  const cleared = withPlayer(base, next, { protected: false });
  const deck = cleared.deck.slice();
  const drawn = deck.shift()!;
  const handed = withPlayer({ ...cleared, deck }, next, {
    hand: [...cleared.players[next]!.hand, drawn],
  });
  return { ...handed, phase: 'turn', currentSeat: next };
}

// Settle the round. Determine winner(s), award tokens, check for match end.
function endRound(
  state: LoveLetterPrivateState,
  reason: RoundSummary['reason'],
): LoveLetterPrivateState {
  const alive = aliveSeats(state);
  let winners: SeatIndex[];

  if (alive.length === 1) {
    winners = alive;
  } else if (alive.length === 0) {
    winners = [];
  } else {
    // Deck exhaustion: highest card in hand wins; tie → highest discard sum;
    // still tied → every tied seat takes a token.
    const highest = Math.max(...alive.map((i) => state.players[i]!.hand[0] ?? 0));
    const topRank = alive.filter((i) => (state.players[i]!.hand[0] ?? 0) === highest);
    if (topRank.length === 1) {
      winners = topRank;
    } else {
      const discardSum = (i: SeatIndex) =>
        state.players[i]!.discard.reduce((a, b) => a + b, 0);
      const bestSum = Math.max(...topRank.map(discardSum));
      winners = topRank.filter((i) => discardSum(i) === bestSum);
    }
  }

  const players = { ...state.players };
  for (const w of winners) {
    players[w] = { ...players[w]!, tokens: players[w]!.tokens + 1 };
  }

  // Hands are only shown at a deckout showdown. A last-standing survivor
  // never reveals their card.
  const finalHands: Record<SeatIndex, Card[]> = {};
  for (const s of state.seats) {
    finalHands[s.index] = reason === 'deckExhausted' ? players[s.index]!.hand.slice() : [];
  }

  const summary: RoundSummary = {
    roundNumber: state.roundNumber,
    finalHands,
    winnerSeats: winners.slice(),
    reason,
  };

  const matchWinners = state.seats
    .map((s) => s.index)
    .filter((i) => players[i]!.tokens >= state.tokensToWin);

  const roundOverAcked: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) roundOverAcked[s.index] = false;

  const names = winners.map((w) => state.players[w]!.name).join(' & ') || 'Nobody';
  const text =
    reason === 'lastStanding'
      ? `${names} is the last one standing and wins the round.`
      : `The deck ran out. ${names} ${winners.length > 1 ? 'share' : 'wins'} the round.`;

  return addLog(
    {
      ...state,
      players,
      phase: matchWinners.length > 0 ? 'gameOver' : 'roundOver',
      history: [...state.history, summary],
      matchWinners,
      roundOverAcked,
      pendingCard: null,
      pendingGuardPlay: null,
    },
    text,
  );
}

// Next round's starting seat: the previous round's winner (first listed on a
// split). Falls back to the prior seat in the pathological no-winner case.
function nextStartingSeat(state: LoveLetterPrivateState): SeatIndex {
  const last = state.history[state.history.length - 1];
  if (!last) return state.currentSeat;
  return last.winnerSeats[0] ?? state.currentSeat;
}

function toReveal(
  state: LoveLetterPrivateState,
  effect: EffectRecord,
): LoveLetterPrivateState {
  return addLog(
    {
      ...state,
      phase: 'effectReveal',
      lastEffect: effect,
      revealAcked: resetReveal(state),
    },
    effect.message,
  );
}

// ----------------------------------------------------------------------------
// Effect resolution
// ----------------------------------------------------------------------------

// Push a played card onto the actor's discard, removing it from their hand.
function pushDiscard(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  card: Card,
): LoveLetterPrivateState {
  const p = state.players[actor]!;
  const idx = p.hand.indexOf(card);
  if (idx === -1) {
    throw new Error(`Seat ${actor} tried to play ${RANK_NAMES[card]} but doesn't hold one`);
  }
  const hand = p.hand.slice();
  hand.splice(idx, 1);
  const next = withPlayer(state, actor, { hand, discard: [...p.discard, card] });
  return onPlayed(next, actor, card);
}

// Handmaid, Countess, Princess: no target. `state` already has the card in
// the actor's discard.
function resolveSelfOnly(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  card: Card,
): LoveLetterPrivateState {
  const name = nameOf(state, actor);
  if (card === 4) {
    const next = withPlayer(state, actor, { protected: true });
    return toReveal(next, {
      kind: 'handmaidShield',
      actorSeat: actor,
      targetSeat: null,
      playedCard: 4,
      message: `${name} played the Handmaid and is protected until their next turn.`,
    });
  }
  if (card === 7) {
    // Countess — pure discard, straight to the next turn.
    return startNextTurn(addLog(state, `${name} played the Countess.`));
  }
  if (card === 8) {
    const next = eliminateSeat(state, actor);
    return toReveal(next, {
      kind: 'princessDiscard',
      actorSeat: actor,
      targetSeat: actor,
      playedCard: 8,
      revealedCards: [8],
      princeWasPrincess: true,
      message: `${name} discarded the Princess and is out of the round.`,
    });
  }
  throw new Error(`resolveSelfOnly called with non-self card: ${card}`);
}

function resolveGuard(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  target: SeatIndex,
  guess: Rank,
): LoveLetterPrivateState {
  const a = nameOf(state, actor);
  const t = nameOf(state, target);
  const targetCard = state.players[target]!.hand[0];
  if (targetCard !== undefined && targetCard === guess) {
    return toReveal(eliminateSeat(state, target), {
      kind: 'guardHit',
      actorSeat: actor,
      targetSeat: target,
      playedCard: 1,
      guessedRank: guess,
      revealedCards: [targetCard],
      message: `${a}'s Guard named ${RANK_NAMES[guess]} — ${t} was holding it and is out!`,
    });
  }
  return toReveal(state, {
    kind: 'guardMiss',
    actorSeat: actor,
    targetSeat: target,
    playedCard: 1,
    guessedRank: guess,
    message: `${a}'s Guard named ${RANK_NAMES[guess]} for ${t} — wrong guess.`,
  });
}

function resolvePriest(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  target: SeatIndex,
): LoveLetterPrivateState {
  const card = state.players[target]!.hand[0]!;
  const learned = learn(state, actor, target, card, 'priest');
  const message = `${nameOf(state, actor)}'s Priest looks at ${nameOf(state, target)}'s hand.`;
  return addLog(
    {
      ...learned,
      phase: 'priestReveal',
      priestPeek: { byActor: actor, target, card },
      lastEffect: {
        kind: 'priestPeek',
        actorSeat: actor,
        targetSeat: target,
        playedCard: 2,
        priestRevealedTo: actor,
        message,
      },
      revealAcked: resetReveal(state),
    },
    message,
  );
}

// Baron: the two players compare in secret. Only the loser's card becomes
// public (they're knocked out and discard it face-up); on a tie nothing is
// revealed to anyone else.
function resolveBaron(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  target: SeatIndex,
): LoveLetterPrivateState {
  const aCard = state.players[actor]!.hand[0]!;
  const bCard = state.players[target]!.hand[0]!;
  const a = nameOf(state, actor);
  const t = nameOf(state, target);
  const secret = { kind: 'baron' as const, actorSeat: actor, targetSeat: target, actorCard: aCard, targetCard: bCard };
  if (aCard === bCard) {
    let next = learn(state, actor, target, bCard, 'baron');
    next = learn(next, target, actor, aCard, 'baron');
    return toReveal(
      { ...next, effectSecret: secret },
      {
        kind: 'baronCompare',
        actorSeat: actor,
        targetSeat: target,
        playedCard: 3,
        loserSeat: null,
        message: `${a}'s Baron: ${a} and ${t} compare hands in secret — a tie. Nobody is out.`,
      },
    );
  }
  const loser = aCard > bCard ? target : actor;
  const loserCard = aCard > bCard ? bCard : aCard;
  const next = eliminateSeat(state, loser);
  return toReveal(
    { ...next, effectSecret: secret },
    {
      kind: 'baronCompare',
      actorSeat: actor,
      targetSeat: target,
      playedCard: 3,
      loserSeat: loser,
      revealedCards: [loserCard],
      message: `${a}'s Baron: ${a} and ${t} compare hands in secret. ${nameOf(state, loser)} loses with the ${RANK_NAMES[loserCard]} and is out.`,
    },
  );
}

// Prince: target discards their hand face-up and draws (from the deck, or
// the face-down set-aside card if the deck is empty). Princess → out.
function resolvePrince(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  target: SeatIndex,
): LoveLetterPrivateState {
  const tp = state.players[target]!;
  const discarded = tp.hand[0]!;
  const a = nameOf(state, actor);
  const t = nameOf(state, target);
  const self = actor === target;
  let next = withPlayer(state, target, { hand: [], discard: [...tp.discard, discarded] });
  next = forgetHolder(next, target);
  if (discarded === 8) {
    next = eliminateSeat(next, target);
    return toReveal(next, {
      kind: 'princeDiscard',
      actorSeat: actor,
      targetSeat: target,
      playedCard: 5,
      revealedCards: [8],
      princeWasPrincess: true,
      message: self
        ? `${a} turns the Prince on themself and must discard the Princess — ${a} is out!`
        : `${a}'s Prince forces ${t} to discard the Princess — ${t} is out!`,
    });
  }
  if (next.deck.length > 0) {
    const deck = next.deck.slice();
    const drawn = deck.shift()!;
    next = withPlayer({ ...next, deck }, target, { hand: [drawn] });
  } else if (next.setAside !== null) {
    const drawn = next.setAside;
    next = withPlayer({ ...next, setAside: null }, target, { hand: [drawn] });
  }
  return toReveal(next, {
    kind: 'princeDiscard',
    actorSeat: actor,
    targetSeat: target,
    playedCard: 5,
    revealedCards: [discarded],
    princeWasPrincess: false,
    message: self
      ? `${a} turns the Prince on themself, discarding the ${RANK_NAMES[discarded]} and drawing a new card.`
      : `${a}'s Prince forces ${t} to discard the ${RANK_NAMES[discarded]} and draw a new card.`,
  });
}

// King: swap hands. Both participants learn both cards (they each held one);
// nobody else learns either.
function resolveKing(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  target: SeatIndex,
): LoveLetterPrivateState {
  const a = state.players[actor]!.hand.slice();
  const b = state.players[target]!.hand.slice();
  let next = withPlayer(state, actor, { hand: b });
  next = withPlayer(next, target, { hand: a });
  // Bystanders' knowledge follows the cards.
  const k = cloneKnowledge(next.knowledge);
  for (const obsKey of Object.keys(k)) {
    const obs = Number(obsKey);
    if (obs === actor || obs === target) continue;
    const m = k[obs]!;
    const ka = m[actor];
    const kt = m[target];
    delete m[actor];
    delete m[target];
    if (kt) m[actor] = kt;
    if (ka) m[target] = ka;
  }
  next = { ...next, knowledge: k };
  if (a[0] !== undefined) next = learn(next, actor, target, a[0], 'king');
  if (b[0] !== undefined) next = learn(next, target, actor, b[0], 'king');
  return toReveal(
    {
      ...next,
      effectSecret:
        a[0] !== undefined && b[0] !== undefined
          ? { kind: 'king', actorSeat: actor, targetSeat: target, actorCard: a[0], targetCard: b[0] }
          : null,
    },
    {
      kind: 'kingSwap',
      actorSeat: actor,
      targetSeat: target,
      playedCard: 6,
      message: `${nameOf(state, actor)}'s King: ${nameOf(state, actor)} and ${nameOf(state, target)} trade hands.`,
    },
  );
}

// Every potential target is Handmaid-protected: the card is discarded with
// no effect.
function resolveNoTargets(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  card: Card,
): LoveLetterPrivateState {
  return toReveal(state, {
    kind: 'noTargets',
    actorSeat: actor,
    targetSeat: null,
    playedCard: card,
    revealedCards: [card],
    message: `${nameOf(state, actor)} played the ${RANK_NAMES[card]}, but nobody can be targeted — no effect.`,
  });
}

// If the actor holds Countess AND (King or Prince), they MUST play Countess.
export function countessForced(hand: readonly Card[], attempted: Card): boolean {
  return hand.includes(7) && (hand.includes(5) || hand.includes(6)) && attempted !== 7;
}

// ============================================================================
// Module
// ============================================================================

export const loveLetterModule: GameModule<
  LoveLetterPrivateState,
  LoveLetterPublicState,
  LoveLetterAction
> = {
  id: 'love-letter',
  displayName: 'Love Letter',
  minPlayers: 2,
  maxPlayers: 4,

  createInitialState(config: GameConfig): LoveLetterPrivateState {
    const opts = getOptions(config);
    const playerCount = opts.players?.length ?? 0;
    if (playerCount < this.minPlayers || playerCount > this.maxPlayers) {
      throw new Error(
        `Love Letter requires ${this.minPlayers}-${this.maxPlayers} players (got ${playerCount})`,
      );
    }
    return buildInitial(
      opts.players.map((p) => p.name),
      config.seed,
    );
  },

  // `byUuid` is unused: the network layer guarantees `action.bySeat` is the
  // sender's real seat; we validate that seat against phase + turn here.
  applyAction(
    state: LoveLetterPrivateState,
    action: LoveLetterAction,
  ): LoveLetterPrivateState {
    if (!action || !isSeat(state, action.bySeat)) {
      throw new Error('Unknown seat');
    }
    switch (action.type) {
      case 'ackStart': {
        if (state.phase !== 'roundStart') {
          throw new Error('ackStart only valid in roundStart phase');
        }
        const startAcked = { ...state.startAcked, [action.bySeat]: true };
        if (!everyone(startAcked, state)) {
          return { ...state, startAcked };
        }
        return { ...state, startAcked, phase: 'turn' };
      }

      case 'playCard': {
        if (state.phase !== 'turn') {
          throw new Error('playCard only valid on your turn');
        }
        if (action.bySeat !== state.currentSeat) {
          throw new Error(`Not seat ${action.bySeat}'s turn`);
        }
        if (!isRank(action.card)) throw new Error('Unknown card');
        const actor = state.players[action.bySeat]!;
        if (!actor.hand.includes(action.card)) {
          throw new Error(`You don't hold a ${RANK_NAMES[action.card]}`);
        }
        if (countessForced(actor.hand, action.card)) {
          throw new Error('You must play the Countess when also holding the King or Prince');
        }

        const card = action.card;
        const afterDiscard = pushDiscard(state, action.bySeat, card);
        if (card === 4 || card === 7 || card === 8) {
          return resolveSelfOnly(afterDiscard, action.bySeat, card);
        }

        // Targeting cards. Prince may always target self, so it never falls
        // through to noTargets.
        const targets = targetableSeats(afterDiscard, action.bySeat, card === 5);
        if (targets.length === 0) {
          return resolveNoTargets(afterDiscard, action.bySeat, card);
        }

        let phase: LoveLetterPrivateState['phase'];
        if (card === 1) phase = 'guardTargeting';
        else if (card === 2) phase = 'priestTargeting';
        else if (card === 3) phase = 'baronTargeting';
        else if (card === 5) phase = 'princeTargeting';
        else phase = 'kingTargeting';

        return {
          ...afterDiscard,
          phase,
          pendingCard: card,
          pendingGuardPlay: card === 1 ? { card: 1 } : null,
        };
      }

      case 'chooseTarget': {
        if (
          state.phase !== 'priestTargeting' &&
          state.phase !== 'baronTargeting' &&
          state.phase !== 'kingTargeting' &&
          state.phase !== 'princeTargeting'
        ) {
          throw new Error(`chooseTarget invalid in phase ${state.phase}`);
        }
        if (action.bySeat !== state.currentSeat) {
          throw new Error('Only the active seat may target');
        }
        const valid = targetableSeats(state, action.bySeat, state.phase === 'princeTargeting');
        if (!valid.includes(action.target)) {
          throw new Error(`Target seat ${action.target} is not valid`);
        }
        if (state.phase === 'priestTargeting') {
          return resolvePriest(state, action.bySeat, action.target);
        }
        if (state.phase === 'baronTargeting') {
          return resolveBaron(state, action.bySeat, action.target);
        }
        if (state.phase === 'kingTargeting') {
          return resolveKing(state, action.bySeat, action.target);
        }
        return resolvePrince(state, action.bySeat, action.target);
      }

      case 'guardGuess': {
        if (state.phase !== 'guardTargeting') {
          throw new Error('guardGuess only valid in guardTargeting phase');
        }
        if (action.bySeat !== state.currentSeat) {
          throw new Error('Only the active seat may guess');
        }
        const valid = targetableSeats(state, action.bySeat, false);
        if (!valid.includes(action.target)) {
          throw new Error(`Target seat ${action.target} is not valid`);
        }
        if (!isRank(action.guess)) throw new Error('Unknown rank');
        if (action.guess === 1) {
          throw new Error('Guard cannot guess Guard');
        }
        return resolveGuard(state, action.bySeat, action.target, action.guess);
      }

      case 'ackEffect': {
        if (state.phase !== 'effectReveal') {
          throw new Error('ackEffect only valid in effectReveal phase');
        }
        const revealAcked = { ...state.revealAcked, [action.bySeat]: true };
        if (!everyone(revealAcked, state)) {
          return { ...state, revealAcked };
        }
        return startNextTurn({ ...state, revealAcked });
      }

      case 'ackPriest': {
        if (state.phase !== 'priestReveal') {
          throw new Error('ackPriest only valid in priestReveal phase');
        }
        if (state.priestPeek && action.bySeat !== state.priestPeek.byActor) {
          throw new Error('Only the Priest player may ack the peek');
        }
        return startNextTurn(state);
      }

      case 'ackRoundOver': {
        if (state.phase !== 'roundOver') {
          throw new Error('ackRoundOver only valid in roundOver phase');
        }
        const roundOverAcked = { ...state.roundOverAcked, [action.bySeat]: true };
        if (!everyone(roundOverAcked, state)) {
          return { ...state, roundOverAcked };
        }
        const starter = nextStartingSeat(state);
        return dealRound(
          { ...state, roundNumber: state.roundNumber + 1, roundOverAcked },
          starter,
        );
      }

      default:
        throw new Error('Unknown action');
    }
  },

  viewFor,

  isFinished(state: LoveLetterPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  aiChooseAction,

  defaultConfig(playerCount: number): GameConfig {
    const opts: LoveLetterOptions = {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: `Player ${i + 1}`,
        isAI: false,
      })),
    };
    return {
      gameId: 'love-letter',
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
  },
};

export { tokensToWinFor };
