import type { SeatIndex } from '@/engine/types';

// ============================================================================
// Love Letter — host state
//
// 16-card micro deduction. Each player holds (at most) one card off-turn and
// briefly holds two cards during their own turn (draw → play). Hidden info is
// narrow but absolute: the deck composition is public, but no peer may ever
// learn another peer's hand except through a card effect that shows it to
// them (Priest, Baron, King). The redaction chokepoint is `viewFor` in
// `view.ts`; the per-seat slots are `yourHand`, `yourPriestPeek`,
// `yourSecret` and `yourKnowledge`.
// ============================================================================

// Rank = the printed card number. Used both for ordering (Baron compare) and
// as the discriminant in effect resolution. We never depend on rank-derived
// names for game logic — name is a UI concern.
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8];

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
// scoring. There are no per-card identities; duplicates are interchangeable
// (so a card value can never encode which physical copy / deck slot it is).
export type Card = Rank;

export type LoveLetterPhase =
  // Round just started; every seat needs to ack the deal before play begins
  // (so the per-seat "your card is…" reveal isn't blown away by the first
  // turn).
  | 'roundStart'
  // Active seat has drawn (the host auto-draws when a seat becomes active,
  // so the seat always sees both cards) and must choose a card to play.
  | 'turn'
  // Active seat played a Guard and must choose a target + guessed rank.
  | 'guardTargeting'
  // Played a Priest / Baron / King — pick a target.
  | 'priestTargeting'
  | 'baronTargeting'
  | 'kingTargeting'
  // Played a Prince — pick a target (may target self).
  | 'princeTargeting'
  // Resolution of an effect that should be shown to all players for a beat
  // before advancing (Guard hit/miss, Baron result, Prince discard...).
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
  // Public discard pile, in play order. Includes cards revealed on
  // elimination. Surfaced unredacted to every seat.
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
  card: 1;
}

// One entry per visible effect "beat". Drives the effectReveal panel.
//
// INVARIANT: everything in an EffectRecord is public. It is sent to every
// seat (and spectators) verbatim, so it may only name cards that were
// revealed face-up to the whole table. Anything only some seats may see
// goes in `EffectSecret`.
export interface EffectRecord {
  kind:
    | 'guardHit'
    | 'guardMiss'
    | 'baronCompare'
    | 'princeDiscard'
    | 'princessDiscard'
    | 'kingSwap'
    | 'handmaidShield'
    | 'priestPeek'
    | 'noTargets';
  actorSeat: SeatIndex;
  // Targeted seat for guard/baron/prince/king/priest; null for handmaid /
  // noTargets.
  targetSeat: SeatIndex | null;
  // The card that was played to cause this effect.
  playedCard: Card;
  // Guard: the rank guessed.
  guessedRank?: Rank;
  // Cards that became face-up for the whole table: Guard hit (the
  // eliminated target's card), Baron loser's card, Prince discard,
  // Princess discard, noTargets (the played card).
  revealedCards?: Card[];
  // Baron: who lost the compare (or null on tie).
  loserSeat?: SeatIndex | null;
  // Prince / Princess: was the discarded card the Princess?
  princeWasPrincess?: boolean;
  // Priest: the seat that saw the card.
  priestRevealedTo?: SeatIndex;
  // Public, card-safe description.
  message: string;
}

// Effect detail only the two participants may see. Baron: the two compared
// cards. King: the cards each side gave away (actorCard is now held by the
// target and vice versa).
export interface EffectSecret {
  kind: 'baron' | 'king';
  actorSeat: SeatIndex;
  targetSeat: SeatIndex;
  actorCard: Card;
  targetCard: Card;
}

// What one seat legitimately knows about another seat's current hand,
// learned through Priest / Baron (tie) / King. Maintained by the host so
// humans get a memory aid and the AI can play from its own knowledge only.
export type KnowledgeSource = 'priest' | 'baron' | 'king';

export interface KnownCard {
  seat: SeatIndex;
  card: Card;
  source: KnowledgeSource;
}

// Public play-by-play line. Same invariant as EffectRecord: public only.
export interface LogEntry {
  round: number;
  text: string;
}

export interface RoundSummary {
  // 1..N — index of this round in the match.
  roundNumber: number;
  // Final hands of every still-in player at deck exhaustion (empty array
  // for eliminated players). Empty for every seat on a last-standing win:
  // the survivor never has to show their card.
  finalHands: Record<SeatIndex, Card[]>;
  // The set of seats that won a token this round. Multiple winners only on
  // a deckout tie that survives the discard-sum tiebreak.
  winnerSeats: SeatIndex[];
  // How the round ended.
  reason: 'lastStanding' | 'deckExhausted';
}

export interface LoveLetterPrivateState {
  phase: LoveLetterPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  players: Record<SeatIndex, PlayerState>;
  // Whose turn it is. Stays valid through targeting / priestReveal phases.
  currentSeat: SeatIndex;
  // Round 1..N (1-indexed).
  roundNumber: number;
  // Token target for match win. Derived from player count at setup.
  tokensToWin: number;

  // The deck stack — top is index 0; we shift() on draw. Never exposed.
  deck: Card[];
  // The card removed face-down at round start. Never exposed.
  setAside: Card | null;
  // 2-player only: three cards revealed at round start. Exposed publicly.
  setAsideFaceUp: Card[];

  // A Guard play populates this while we collect target + guess.
  pendingGuardPlay: PendingGuardPlay | null;
  // The card the active seat is currently resolving.
  pendingCard: Card | null;

  // The last effect to resolve (public-safe; see EffectRecord).
  lastEffect: EffectRecord | null;
  // Participant-only detail of the last effect (Baron / King).
  effectSecret: EffectSecret | null;
  // Priest peek result, addressed to the seat that played the priest.
  // Cleared on priestReveal ack.
  priestPeek: { byActor: SeatIndex; target: SeatIndex; card: Card } | null;
  // knowledge[observer][holder] — see KnownCard. Reset every round.
  knowledge: Record<SeatIndex, Partial<Record<SeatIndex, { card: Card; source: KnowledgeSource }>>>;

  // Acks for the reveal phases. Reset at every transition INTO a reveal.
  revealAcked: Record<SeatIndex, boolean>;
  // Acks for the initial deal.
  startAcked: Record<SeatIndex, boolean>;
  // Acks for round-over.
  roundOverAcked: Record<SeatIndex, boolean>;

  // Public play-by-play (capped).
  log: LogEntry[];
  // Append-only round results.
  history: RoundSummary[];
  // Seats that won the match. Populated only in 'gameOver'.
  matchWinners: SeatIndex[];
  // Host-only. Never serialized into a view (it would let a peer replay the
  // shuffle and read the whole deck).
  seed: number;
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
  // Resolution of the last effect (public-safe).
  lastEffect: EffectRecord | null;
  // The most-recently-completed round summary (drives the roundOver panel).
  lastRound: RoundSummary | null;
  history: RoundSummary[];
  matchWinners: SeatIndex[];
  log: LogEntry[];
  // Seats whose acknowledgement the current phase is still waiting on.
  // Public (everyone can see who hasn't clicked Continue yet).
  waitingOn: SeatIndex[];

  // ----- Redacted per-seat slots -----
  yourSeat: SeatIndex | null;
  // The seat's own hand. 0/1/2 cards — populated only for the owning seat.
  yourHand: Card[];
  isYourTurn: boolean;
  // Priest result, only sent to the actor who played the priest.
  yourPriestPeek: { target: SeatIndex; card: Card } | null;
  // Baron / King detail, only sent to the two participants.
  yourSecret: EffectSecret | null;
  // What you know about other seats' current hands.
  yourKnowledge: KnownCard[];
  // True if THIS seat has to ack the current reveal/start/roundOver state.
  yourAckPending: boolean;
}
