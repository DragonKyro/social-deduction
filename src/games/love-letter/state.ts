import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Love Letter — host state
//
// 16-card micro deduction. Each player holds (at most) one card off-turn and
// briefly holds two cards during their own turn (draw → play). Hidden info is
// narrow but absolute: the entire deck composition is public, but no peer
// may ever learn another peer's hand. The single redaction chokepoint is
// `yourHand` (and the privately-viewed Priest result, surfaced only to the
// player who used the Priest).
// ============================================================================

// Rank = the printed card number. Used both for ordering (Baron compare) and
// as the discriminant in effect resolution. We never depend on rank-derived
// names for game logic — name is a UI concern.
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const RANK_NAMES: Record<Rank, string> = {
  1: 'Guard',
  2: 'Priest',
  3: 'Baron',
  4: 'Handmaid',
  5: 'Prince',
  6: 'King',
  7: 'Countess',
  8: 'Princess',
};

// Base-set distribution. Sums to 16.
export const RANK_COUNTS: Record<Rank, number> = {
  1: 5,
  2: 2,
  3: 2,
  4: 2,
  5: 2,
  6: 1,
  7: 1,
  8: 1,
};

// A card is fully identified by its rank for the purposes of effects and
// scoring. There are no per-card identities; duplicates are interchangeable.
export type Card = Rank;

export type LoveLetterPhase =
  // Round just started; every seat needs to ack the deal before play begins
  // (so the per-seat "your card is…" reveal isn't blown away by the first
  // turn).
  | 'roundStart'
  // Active seat needs to draw (or has drawn and is choosing a play). We
  // collapse draw+play into a single phase: the host auto-draws when a seat
  // becomes active, so the seat always sees both cards.
  | 'turn'
  // Active seat played a Guard and must choose a target + guessed rank.
  // (Targeting + guess are split out of the play so the UI can collect them
  // separately; see `pendingPlay`.)
  | 'guardTargeting'
  // Played a Priest / Baron / King — pick a target.
  | 'priestTargeting'
  | 'baronTargeting'
  | 'kingTargeting'
  // Played a Prince — pick a target (may target self).
  | 'princeTargeting'
  // Resolution of an effect that should be shown to all players for a beat
  // before advancing (Guard hit/miss, Baron compare result, Prince discard).
  // Everyone must ack.
  | 'effectReveal'
  // Priest peek result: only the seat that played the Priest sees the
  // target's card. Other seats see "X is peeking at Y's card". The actor
  // acks to advance.
  | 'priestReveal'
  // Round is over — show summary, then ack to start next round.
  | 'roundOver'
  // Match is over — someone hit the token target.
  | 'gameOver';

export interface PlayerState {
  index: SeatIndex;
  name: string;
  // Card(s) currently in hand. 0 (eliminated this round), 1 (off-turn), or
  // 2 (active seat between draw and play).
  hand: Card[];
  // Public discard pile, in play order. Includes cards revealed via Princess
  // self-elimination. Surfaced unredacted to every seat.
  discard: Card[];
  // True when this seat played Handmaid and hasn't started a new turn yet.
  // Cleared at the start of the seat's next turn.
  protected: boolean;
  // True if the seat was eliminated THIS round. Reset at round start.
  eliminated: boolean;
  // Total tokens won across all completed rounds in this match.
  tokens: number;
}

export interface PendingGuardPlay {
  // The Guard card itself is already in the actor's discard before we
  // collect target + guess (so the UI can show it landed). Just stash the
  // rank for clarity.
  card: 1;
}

// One entry per visible effect "beat". Drives the effectReveal panel.
export interface EffectRecord {
  kind:
    | 'guardHit'
    | 'guardMiss'
    | 'baronCompare'
    | 'princeDiscard'
    | 'kingSwap'
    | 'handmaidShield'
    | 'priestPeek'
    | 'noTargets';
  actorSeat: SeatIndex;
  // Targeted seat for guard/baron/prince/king/priest; null for handmaid /
  // noTargets / self-target prince when we want to render generically.
  targetSeat: SeatIndex | null;
  // Guard: the rank guessed. Other kinds: omitted.
  guessedRank?: Rank;
  // Guard hit / Baron compare / Prince discard: the card(s) revealed.
  revealedCards?: Card[];
  // Baron: who lost the compare (or null on tie).
  loserSeat?: SeatIndex | null;
  // Prince: was the discarded card the Princess? Drives the "out" UI.
  princeWasPrincess?: boolean;
  // The seat whose card was just shown (for Priest reveal). null otherwise.
  priestRevealedTo?: SeatIndex;
  // Free-form short tag for the UI; computed at record time.
  message: string;
}

export interface RoundSummary {
  // 1..N — index of this round in the match.
  roundNumber: number;
  // Final hands of every still-in player at deck exhaustion (empty array
  // for eliminated players). Determines tiebreak via discard sum.
  finalHands: Record<SeatIndex, Card[]>;
  // The set of seats that won a token this round. Multiple winners are
  // possible on a tied deckout (rare; rulebook splits the token by
  // discard-sum, so we record the seat(s) that hold the actual token).
  winnerSeats: SeatIndex[];
  // How the round ended.
  reason: 'lastStanding' | 'deckExhausted';
}

export interface LoveLetterPrivateState {
  phase: LoveLetterPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: Record<SeatIndex, PlayerState>;
  // Whose turn it is. Stays valid through targeting / priestReveal phases —
  // returns to the *actor* of the play.
  currentSeat: SeatIndex;
  // Round 1..N (1-indexed). Increments at the start of each round AFTER the
  // round-over ack from everyone.
  roundNumber: number;
  // Token target for match win. Derived from player count at setup.
  tokensToWin: number;

  // The deck stack — top is index 0; we shift() on draw. Never exposed.
  deck: Card[];
  // The card removed face-down at round start. Never revealed (except in
  // 2-player where the three additional face-up cards live in
  // `setAsideFaceUp`). Never exposed.
  setAside: Card | null;
  // 2-player only: three cards revealed at round start so the deck has a
  // known floor. Exposed publicly.
  setAsideFaceUp: Card[];

  // A Guard play populates this while we collect target + guess. Cleared on
  // resolution.
  pendingGuardPlay: PendingGuardPlay | null;
  // The card the active seat is currently resolving. Captures the card-in-
  // play across the few phases between play and resolution.
  pendingCard: Card | null;

  // The last effect to resolve — surfaced in `effectReveal` phase. Cleared
  // when entering 'turn' for the next active seat.
  lastEffect: EffectRecord | null;
  // Priest peek result, addressed to the seat that played the priest.
  // Cleared on priestReveal ack.
  priestPeek: { byActor: SeatIndex; target: SeatIndex; card: Card } | null;

  // Acks for the reveal phases. Reset at every transition INTO a reveal.
  revealAcked: Record<SeatIndex, boolean>;
  // Acks for the initial deal — every seat must "I've seen my card" before
  // the active seat may play.
  startAcked: Record<SeatIndex, boolean>;
  // Acks for round-over — every seat must continue before the next round.
  roundOverAcked: Record<SeatIndex, boolean>;

  // Append-only round results.
  history: RoundSummary[];
  // Seats that won the match (allows for a tie at the same final round, but
  // typically a single seat). Populated only in 'gameOver'.
  matchWinners: SeatIndex[];
  seed: number;
  // Persistent RNG cursor so re-rolling rounds in the same match keeps the
  // stream advancing (matches the convention used by the rest of the games).
  rngCursor: number;
}

// ============================================================================
// Public view
// ============================================================================

export interface PublicPlayer {
  index: SeatIndex;
  name: string;
  handSize: number;
  discard: Card[]; // public — full discard is visible to everyone
  protected: boolean;
  eliminated: boolean;
  tokens: number;
}

export interface LoveLetterPublicState {
  phase: LoveLetterPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: PublicPlayer[];
  currentSeat: SeatIndex;
  roundNumber: number;
  tokensToWin: number;
  deckRemaining: number;
  setAsideFaceUp: Card[];
  // Resolution of the last effect — populated during effectReveal /
  // priestReveal so the UI can describe what happened.
  lastEffect: EffectRecord | null;
  // The most-recently-completed round summary (drives the roundOver panel).
  lastRound: RoundSummary | null;
  history: RoundSummary[];
  matchWinners: SeatIndex[];

  // ----- Redacted per-seat slots -----
  yourSeat: SeatIndex | null;
  // The seat's own hand. 0/1/2 cards — populated only for the owning seat.
  yourHand: Card[];
  // True if the active seat is the one viewing and they've drawn but not
  // yet played. (Pure convenience for the UI; can be derived from hand size
  // + currentSeat.)
  isYourTurn: boolean;
  // Priest result, only sent to the actor who played the priest.
  yourPriestPeek: { target: SeatIndex; card: Card } | null;
  // True if THIS seat has acked the current reveal/start/roundOver state.
  yourAckPending: boolean;
}
