import type { SeatIndex } from '@/engine/types';
import type {
  EffectRecord,
  KnownCard,
  LoveLetterPrivateState,
  LoveLetterPublicState,
  PublicPlayer,
  RoundSummary,
} from './state';

// ============================================================================
// Love Letter — the redaction chokepoint.
//
// Everything a peer (or the AI) ever sees comes through here. Built field by
// field from the private state — never by spreading it — so a new private
// field can't leak by accident. Never included: `deck` (order or contents),
// `setAside`, `seed`, `rngCursor`, other seats' `hand`, `priestPeek` for
// non-actors, `effectSecret` for non-participants, others' `knowledge`.
// ============================================================================

function copyEffect(e: EffectRecord | null): EffectRecord | null {
  if (!e) return null;
  return {
    ...e,
    revealedCards: e.revealedCards ? e.revealedCards.slice() : undefined,
  };
}

function copyRound(r: RoundSummary): RoundSummary {
  const finalHands: RoundSummary['finalHands'] = {};
  for (const [k, v] of Object.entries(r.finalHands)) finalHands[Number(k)] = v.slice();
  return { ...r, finalHands, winnerSeats: r.winnerSeats.slice() };
}

/** Seats the current phase is still waiting to hear an ack from. */
export function pendingAcks(state: LoveLetterPrivateState): SeatIndex[] {
  const seats = state.seats.map((s) => s.index);
  switch (state.phase) {
    case 'roundStart':
      return seats.filter((i) => !state.startAcked[i]);
    case 'effectReveal':
      return seats.filter((i) => !state.revealAcked[i]);
    case 'priestReveal':
      return state.priestPeek ? [state.priestPeek.byActor] : [];
    case 'roundOver':
      return seats.filter((i) => !state.roundOverAcked[i]);
    default:
      return [];
  }
}

export function viewFor(
  state: LoveLetterPrivateState,
  seat: SeatIndex | null,
): LoveLetterPublicState {
  // A seat index that isn't at the table is treated as a spectator.
  const me = seat !== null && state.players[seat] ? seat : null;

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

  const yourHand = me !== null ? state.players[me]!.hand.slice() : [];
  const yourPriestPeek =
    me !== null && state.priestPeek !== null && state.priestPeek.byActor === me
      ? { target: state.priestPeek.target, card: state.priestPeek.card }
      : null;
  const sec = state.effectSecret;
  const yourSecret =
    me !== null && sec !== null && (sec.actorSeat === me || sec.targetSeat === me)
      ? { ...sec }
      : null;

  const yourKnowledge: KnownCard[] = [];
  if (me !== null) {
    const mine = state.knowledge[me] ?? {};
    for (const s of state.seats) {
      const k = mine[s.index];
      if (k && s.index !== me) yourKnowledge.push({ seat: s.index, card: k.card, source: k.source });
    }
  }

  const waitingOn = pendingAcks(state);

  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({ index: s.index, name: s.name })),
    players,
    currentSeat: state.currentSeat,
    roundNumber: state.roundNumber,
    tokensToWin: state.tokensToWin,
    deckRemaining: state.deck.length,
    setAsideFaceUp: state.setAsideFaceUp.slice(),
    lastEffect: copyEffect(state.lastEffect),
    lastRound:
      state.history.length > 0 ? copyRound(state.history[state.history.length - 1]!) : null,
    history: state.history.map(copyRound),
    matchWinners: state.matchWinners.slice(),
    log: state.log.map((l) => ({ round: l.round, text: l.text })),
    waitingOn,
    yourSeat: me,
    yourHand,
    isYourTurn: me !== null && me === state.currentSeat,
    yourPriestPeek,
    yourSecret,
    yourKnowledge,
    yourAckPending: me !== null && waitingOn.includes(me),
  };
}
