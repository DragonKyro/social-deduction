import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { LoveLetterAction } from './actions';
import { aiChooseAction } from './ai';
import { buildInitial, dealRound, tokensToWinFor } from './setup';
import type {
  Card,
  EffectRecord,
  LoveLetterPrivateState,
  LoveLetterPublicState,
  PlayerState,
  PublicPlayer,
  Rank,
  RoundSummary,
} from './state';
import { RANK_NAMES } from './state';

// ============================================================================
// Love Letter — module
//
// 16-card micro deduction. Single hidden slot per peer (their own hand). The
// `viewFor` chokepoint redacts both `yourHand` (only owning seat sees it)
// and `yourPriestPeek` (only the actor that played the Priest sees its
// result). The deck itself is also private — never serialized into Public.
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

function isAlive(p: PlayerState): boolean {
  return !p.eliminated;
}

function aliveSeats(state: LoveLetterPrivateState): SeatIndex[] {
  return state.seats.map((s) => s.index).filter((i) => isAlive(state.players[i]!));
}

// Targetable seats: alive, not the actor, not Handmaid-protected. (Prince
// adds the actor-self exception; King keeps the actor-can't-be-self rule.)
function targetableSeats(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  allowSelf: boolean,
): SeatIndex[] {
  return aliveSeats(state).filter(
    (i) =>
      (allowSelf || i !== actor) &&
      !state.players[i]!.protected,
  );
}

function everyone(record: Record<SeatIndex, boolean>, seats: number): boolean {
  for (let i = 0; i < seats; i++) {
    if (!record[i]) return false;
  }
  return true;
}

function resetReveal(state: LoveLetterPrivateState): Record<SeatIndex, boolean> {
  const out: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) out[s.index] = false;
  return out;
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

// Eliminate the seat: drop hand into discard (face-up), mark eliminated.
function eliminateSeat(
  state: LoveLetterPrivateState,
  seat: SeatIndex,
): LoveLetterPrivateState {
  const p = state.players[seat]!;
  return withPlayer(state, seat, {
    discard: [...p.discard, ...p.hand],
    hand: [],
    eliminated: true,
    protected: false,
  });
}

// Advance to the next active seat (skipping eliminated), draw 1, clear that
// seat's Handmaid protection. Returns the next state; phase becomes 'turn'.
// If the deck is empty pre-draw, settle the round instead.
function startNextTurn(
  state: LoveLetterPrivateState,
): LoveLetterPrivateState {
  // Lone survivor — round over by last-standing.
  const alive = aliveSeats(state);
  if (alive.length <= 1) {
    return endRound(state, 'lastStanding');
  }
  // Walk forward from currentSeat until we find an alive seat.
  const n = state.seats.length;
  let next = state.currentSeat;
  for (let step = 1; step <= n; step++) {
    const candidate = (state.currentSeat + step) % n;
    if (!state.players[candidate]!.eliminated) {
      next = candidate;
      break;
    }
  }
  // Clear protection on the seat whose turn is about to start.
  const cleared = withPlayer(state, next, { protected: false });

  // Empty deck → settle by deck exhaustion (no draw possible).
  if (cleared.deck.length === 0) {
    return endRound(cleared, 'deckExhausted');
  }

  // Draw.
  const deck = cleared.deck.slice();
  const drawn = deck.shift()!;
  const handed = withPlayer({ ...cleared, deck }, next, {
    hand: [...cleared.players[next]!.hand, drawn],
  });

  return {
    ...handed,
    phase: 'turn',
    currentSeat: next,
    pendingCard: null,
    pendingGuardPlay: null,
  };
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
    // Pathological — should not happen with the standard rules (Princess
    // discards always self-eliminate, leaving others alive). Defensive:
    // award nobody.
    winners = [];
  } else {
    // Deck exhaustion compare. Highest-rank-in-hand wins; ties broken by
    // discard sum.
    const highest = Math.max(...alive.map((i) => state.players[i]!.hand[0] ?? 0));
    const topRank = alive.filter(
      (i) => (state.players[i]!.hand[0] ?? 0) === highest,
    );
    if (topRank.length === 1) {
      winners = topRank;
    } else {
      const discardSum = (i: SeatIndex) =>
        state.players[i]!.discard.reduce((a, b) => a + b, 0);
      const bestSum = Math.max(...topRank.map(discardSum));
      winners = topRank.filter((i) => discardSum(i) === bestSum);
    }
  }

  // Award tokens.
  let players = { ...state.players };
  for (const w of winners) {
    players[w] = { ...players[w]!, tokens: players[w]!.tokens + 1 };
  }

  const finalHands: Record<SeatIndex, Card[]> = {};
  for (const s of state.seats) {
    finalHands[s.index] = players[s.index]!.hand.slice();
  }

  const summary: RoundSummary = {
    roundNumber: state.roundNumber,
    finalHands,
    winnerSeats: winners.slice(),
    reason,
  };

  // Match win? Multiple winners share the round token; if any of them
  // crossed the target, they win the match. The rulebook gives the round
  // win to a single seat via discard-sum break, but defensively we surface
  // *all* seats currently at the target.
  const matchWinners = state.seats
    .map((s) => s.index)
    .filter((i) => players[i]!.tokens >= state.tokensToWin);

  const roundOverAcked: Record<SeatIndex, boolean> = {};
  for (const s of state.seats) roundOverAcked[s.index] = false;

  return {
    ...state,
    players,
    phase: matchWinners.length > 0 ? 'gameOver' : 'roundOver',
    history: [...state.history, summary],
    matchWinners,
    roundOverAcked,
    pendingCard: null,
    pendingGuardPlay: null,
  };
}

// Determine the next round's starting seat. Rulebook: most recent round
// winner. If multiple, the *first* listed (which itself was tie-broken by
// discard-sum). Falls back to the prior starting seat if nobody won (the
// pathological case).
function nextStartingSeat(state: LoveLetterPrivateState): SeatIndex {
  const last = state.history[state.history.length - 1];
  if (!last) return state.currentSeat;
  return last.winnerSeats[0] ?? state.currentSeat;
}

// ----------------------------------------------------------------------------
// Effect resolution
// ----------------------------------------------------------------------------

// Resolve a card play that doesn't need a target (Handmaid, Countess,
// Princess) AND record the discard. For target-requiring cards, the caller
// transitions phases first; resolveTarget* below handle the resolution.
function resolveSelfOnly(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  card: Card,
): LoveLetterPrivateState {
  let next = pushDiscard(state, actor, card);
  if (card === 4) {
    // Handmaid.
    next = withPlayer(next, actor, { protected: true });
    next = {
      ...next,
      phase: 'effectReveal',
      lastEffect: {
        kind: 'handmaidShield',
        actorSeat: actor,
        targetSeat: null,
        message: `${next.players[actor]!.name} is shielded by the Handmaid until their next turn.`,
      },
      revealAcked: resetReveal(next),
    };
    return next;
  }
  if (card === 7) {
    // Countess — pure discard. No reveal needed; just step turn directly.
    return startNextTurn(next);
  }
  if (card === 8) {
    // Princess — actor eliminated.
    next = eliminateSeat(next, actor);
    next = {
      ...next,
      phase: 'effectReveal',
      lastEffect: {
        kind: 'princeDiscard', // reuse: "card discarded was Princess → out"
        actorSeat: actor,
        targetSeat: actor,
        revealedCards: [8],
        princeWasPrincess: true,
        message: `${state.players[actor]!.name} discarded the Princess and is out of the round.`,
      },
      revealAcked: resetReveal(next),
    };
    return next;
  }
  throw new Error(`resolveSelfOnly called with non-self card: ${card}`);
}

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
  return withPlayer(state, actor, {
    hand,
    discard: [...p.discard, card],
  });
}

// Guard target+guess resolution.
function resolveGuard(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  target: SeatIndex,
  guess: Rank,
): LoveLetterPrivateState {
  if (guess === 1) {
    throw new Error('Guard cannot guess Guard');
  }
  const t = state.players[target]!;
  const targetCard = t.hand[0];
  let next = state;
  let kind: EffectRecord['kind'];
  let message: string;
  if (targetCard !== undefined && targetCard === guess) {
    next = eliminateSeat(next, target);
    kind = 'guardHit';
    message = `${state.players[actor]!.name} guessed ${RANK_NAMES[guess]} on ${t.name} — correct! ${t.name} is out.`;
  } else {
    kind = 'guardMiss';
    message = `${state.players[actor]!.name} guessed ${RANK_NAMES[guess]} on ${t.name} — wrong.`;
  }
  return {
    ...next,
    phase: 'effectReveal',
    lastEffect: {
      kind,
      actorSeat: actor,
      targetSeat: target,
      guessedRank: guess,
      revealedCards: kind === 'guardHit' && targetCard !== undefined ? [targetCard] : undefined,
      message,
    },
    revealAcked: resetReveal(next),
  };
}

// Priest target resolution: send a private peek to the actor.
function resolvePriest(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  target: SeatIndex,
): LoveLetterPrivateState {
  const t = state.players[target]!;
  const card = t.hand[0]!;
  return {
    ...state,
    phase: 'priestReveal',
    priestPeek: { byActor: actor, target, card },
    lastEffect: {
      kind: 'priestPeek',
      actorSeat: actor,
      targetSeat: target,
      priestRevealedTo: actor,
      message: `${state.players[actor]!.name} is peeking at ${t.name}'s card.`,
    },
    revealAcked: resetReveal(state),
  };
}

// Baron target resolution: compare hands, loser out, tie → no effect.
function resolveBaron(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  target: SeatIndex,
): LoveLetterPrivateState {
  const aCard = state.players[actor]!.hand[0]!;
  const bCard = state.players[target]!.hand[0]!;
  let loser: SeatIndex | null;
  let next = state;
  let message: string;
  if (aCard === bCard) {
    loser = null;
    message = `${state.players[actor]!.name} and ${state.players[target]!.name} tied on the Baron compare (both ${RANK_NAMES[aCard]}). No effect.`;
  } else if (aCard > bCard) {
    loser = target;
    next = eliminateSeat(next, target);
    message = `Baron: ${state.players[actor]!.name} (${RANK_NAMES[aCard]}) beat ${state.players[target]!.name} (${RANK_NAMES[bCard]}). ${state.players[target]!.name} is out.`;
  } else {
    loser = actor;
    next = eliminateSeat(next, actor);
    message = `Baron: ${state.players[target]!.name} (${RANK_NAMES[bCard]}) beat ${state.players[actor]!.name} (${RANK_NAMES[aCard]}). ${state.players[actor]!.name} is out.`;
  }
  return {
    ...next,
    phase: 'effectReveal',
    lastEffect: {
      kind: 'baronCompare',
      actorSeat: actor,
      targetSeat: target,
      revealedCards: [aCard, bCard],
      loserSeat: loser,
      message,
    },
    revealAcked: resetReveal(next),
  };
}

// Prince target resolution: target discards their hand and draws (from
// deck, or from setAside if deck is empty). Princess-discarded → out.
function resolvePrince(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  target: SeatIndex,
): LoveLetterPrivateState {
  const t = state.players[target]!;
  const discarded = t.hand[0]!;
  let next = state;
  // Move the held card to discard (without redrawing yet).
  next = withPlayer(next, target, {
    hand: [],
    discard: [...t.discard, discarded],
  });
  let wasPrincess = false;
  let message: string;
  if (discarded === 8) {
    // Princess discarded → out, no redraw.
    wasPrincess = true;
    next = eliminateSeat(next, target);
    message = `${state.players[actor]!.name} played Prince on ${t.name}, who discarded the Princess and is out.`;
  } else {
    // Redraw. Prefer the deck; fall back to setAside if empty.
    if (next.deck.length > 0) {
      const deck = next.deck.slice();
      const drawn = deck.shift()!;
      next = { ...next, deck };
      next = withPlayer(next, target, { hand: [drawn] });
    } else if (next.setAside !== null) {
      const drawn = next.setAside;
      next = { ...next, setAside: null };
      next = withPlayer(next, target, { hand: [drawn] });
    }
    message = `${state.players[actor]!.name} played Prince on ${t.name}; ${t.name} discarded ${RANK_NAMES[discarded]} and redrew.`;
  }
  return {
    ...next,
    phase: 'effectReveal',
    lastEffect: {
      kind: 'princeDiscard',
      actorSeat: actor,
      targetSeat: target,
      revealedCards: [discarded],
      princeWasPrincess: wasPrincess,
      message,
    },
    revealAcked: resetReveal(next),
  };
}

// King target resolution: swap actor's and target's hands.
function resolveKing(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  target: SeatIndex,
): LoveLetterPrivateState {
  const a = state.players[actor]!.hand.slice();
  const b = state.players[target]!.hand.slice();
  let next = withPlayer(state, actor, { hand: b });
  next = withPlayer(next, target, { hand: a });
  return {
    ...next,
    phase: 'effectReveal',
    lastEffect: {
      kind: 'kingSwap',
      actorSeat: actor,
      targetSeat: target,
      message: `${state.players[actor]!.name} swapped hands with ${state.players[target]!.name}.`,
    },
    revealAcked: resetReveal(next),
  };
}

// No-effect resolution when every potential target is Handmaid-protected
// or otherwise unreachable. Card still goes to discard; turn advances after
// the reveal ack.
function resolveNoTargets(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  card: Card,
): LoveLetterPrivateState {
  return {
    ...state,
    phase: 'effectReveal',
    lastEffect: {
      kind: 'noTargets',
      actorSeat: actor,
      targetSeat: null,
      revealedCards: [card],
      message: `${state.players[actor]!.name} played ${RANK_NAMES[card]}, but no valid targets — no effect.`,
    },
    revealAcked: resetReveal(state),
  };
}

// Validate a Countess-forced discard: if the actor holds Countess AND
// (King or Prince), they MUST play Countess. (Rulebook enforces.)
function countessForced(actor: PlayerState, attempted: Card): boolean {
  const has = (r: Rank) => actor.hand.includes(r);
  if (has(7) && (has(5) || has(6)) && attempted !== 7) return true;
  return false;
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  applyAction(
    state: LoveLetterPrivateState,
    action: LoveLetterAction,
  ): LoveLetterPrivateState {
    switch (action.type) {
      case 'ackStart': {
        if (state.phase !== 'roundStart') {
          throw new Error('ackStart only valid in roundStart phase');
        }
        const startAcked = { ...state.startAcked, [action.bySeat]: true };
        if (!everyone(startAcked, state.seats.length)) {
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
        const actor = state.players[action.bySeat]!;
        if (countessForced(actor, action.card)) {
          throw new Error(
            'You must play the Countess when also holding the King or Prince',
          );
        }
        if (!actor.hand.includes(action.card)) {
          throw new Error(`You don't hold a ${RANK_NAMES[action.card]}`);
        }

        // Self-resolving cards (Handmaid, Countess, Princess) go through
        // resolveSelfOnly which handles their own discard. Everything else
        // we discard up front and then transition to targeting.
        const card = action.card;
        if (card === 4 || card === 7 || card === 8) {
          return resolveSelfOnly(state, action.bySeat, card);
        }

        // Targeting cards. Push discard, set pendingCard, transition.
        const afterDiscard = pushDiscard(state, action.bySeat, card);
        const allowSelf = card === 5; // Prince can target self
        // King cannot target self per rulebook (no point swapping with
        // yourself anyway, and the rulebook explicitly says you can't).
        const targets = targetableSeats(afterDiscard, action.bySeat, allowSelf);
        // Guard: if every other alive seat is protected, no-target resolve.
        // Same for Priest/Baron/King/Prince when targets list is empty.
        // Special case: Prince with allowSelf — the actor is always a
        // valid self-target (they're alive on their own turn) UNLESS we're
        // edge-casing in the future. So Prince never auto-resolves to
        // noTargets.
        if (targets.length === 0) {
          return resolveNoTargets(afterDiscard, action.bySeat, card);
        }

        let phase: LoveLetterPrivateState['phase'];
        if (card === 1) phase = 'guardTargeting';
        else if (card === 2) phase = 'priestTargeting';
        else if (card === 3) phase = 'baronTargeting';
        else if (card === 5) phase = 'princeTargeting';
        else if (card === 6) phase = 'kingTargeting';
        else throw new Error(`Unhandled targeting card: ${card}`);

        return {
          ...afterDiscard,
          phase,
          pendingCard: card,
          pendingGuardPlay: card === 1 ? { card: 1 } : null,
        };
      }

      case 'chooseTarget': {
        if (action.bySeat !== state.currentSeat) {
          throw new Error('Only the active seat may target');
        }
        const allowSelf = state.phase === 'princeTargeting';
        if (
          state.phase !== 'priestTargeting' &&
          state.phase !== 'baronTargeting' &&
          state.phase !== 'kingTargeting' &&
          state.phase !== 'princeTargeting'
        ) {
          throw new Error(`chooseTarget invalid in phase ${state.phase}`);
        }
        const valid = targetableSeats(state, action.bySeat, allowSelf);
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
        const valid = targetableSeats(state, action.bySeat, /*allowSelf*/ false);
        if (!valid.includes(action.target)) {
          throw new Error(`Target seat ${action.target} is not valid`);
        }
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
        if (!everyone(revealAcked, state.seats.length)) {
          return { ...state, revealAcked };
        }
        // Acked — advance.
        const cleared = { ...state, revealAcked };
        return startNextTurn(cleared);
      }

      case 'ackPriest': {
        if (state.phase !== 'priestReveal') {
          throw new Error('ackPriest only valid in priestReveal phase');
        }
        // Only the actor advances (everyone else just sees "X is peeking").
        if (state.priestPeek && action.bySeat !== state.priestPeek.byActor) {
          throw new Error('Only the Priest player may ack the peek');
        }
        return startNextTurn({
          ...state,
          priestPeek: null,
        });
      }

      case 'ackRoundOver': {
        if (state.phase !== 'roundOver') {
          throw new Error('ackRoundOver only valid in roundOver phase');
        }
        const roundOverAcked = {
          ...state.roundOverAcked,
          [action.bySeat]: true,
        };
        if (!everyone(roundOverAcked, state.seats.length)) {
          return { ...state, roundOverAcked };
        }
        // Deal next round.
        const starter = nextStartingSeat(state);
        const next = dealRound(
          { ...state, roundNumber: state.roundNumber + 1, roundOverAcked },
          starter,
        );
        return next;
      }
    }
  },

  viewFor(
    state: LoveLetterPrivateState,
    seat: SeatIndex | null,
  ): LoveLetterPublicState {
    const players: PublicPlayer[] = state.seats.map((s) => {
      const p = state.players[s.index]!;
      return {
        index: s.index,
        name: s.name,
        handSize: p.hand.length,
        discard: p.discard.slice(),
        protected: p.protected,
        eliminated: p.eliminated,
        tokens: p.tokens,
      };
    });

    const yourHand = seat !== null ? state.players[seat]!.hand.slice() : [];
    const yourPriestPeek =
      seat !== null &&
      state.priestPeek !== null &&
      state.priestPeek.byActor === seat
        ? { target: state.priestPeek.target, card: state.priestPeek.card }
        : null;

    // yourAckPending: whichever ack-record is gating this phase.
    let yourAckPending = false;
    if (seat !== null) {
      if (state.phase === 'roundStart') yourAckPending = !state.startAcked[seat];
      else if (state.phase === 'effectReveal')
        yourAckPending = !state.revealAcked[seat];
      else if (state.phase === 'priestReveal')
        yourAckPending = state.priestPeek?.byActor === seat;
      else if (state.phase === 'roundOver')
        yourAckPending = !state.roundOverAcked[seat];
    }

    return {
      phase: state.phase,
      seats: state.seats.map((s) => ({ index: s.index, name: s.name })),
      players,
      currentSeat: state.currentSeat,
      roundNumber: state.roundNumber,
      tokensToWin: state.tokensToWin,
      deckRemaining: state.deck.length,
      setAsideFaceUp: state.setAsideFaceUp.slice(),
      lastEffect: state.lastEffect,
      lastRound:
        state.history.length > 0
          ? state.history[state.history.length - 1]!
          : null,
      history: state.history.slice(),
      matchWinners: state.matchWinners.slice(),
      yourSeat: seat,
      yourHand,
      isYourTurn: seat !== null && seat === state.currentSeat,
      yourPriestPeek,
      yourAckPending,
    };
  },

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
