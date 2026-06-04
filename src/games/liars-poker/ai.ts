import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { LiarsPokerAction } from './actions';
import { claimExists, compareClaim } from './hands';
import type { HandClaim } from './hands';
import type {
  Card,
  CardRank,
  LiarsPokerPrivateState,
  Suit,
} from './state';

// Liar's Poker AI.
//
// Strategy: estimate the combined pool. The AI knows its own hand + all
// visible dummy hands. Unknown cards are sampled from the remaining deck
// (52 minus known) uniformly. We score candidate claims by their probability
// of existing in the realized pool. Then:
//   - If no current claim: open with the strongest hand we have direct
//     evidence for (e.g. pair we hold).
//   - Else: cheapest legal raise whose pUnion >= threshold; if none, call liar.

const ALL_SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

function aliveSeats(state: LiarsPokerPrivateState): SeatIndex[] {
  return state.seats
    .map((s) => s.index)
    .filter((i) => !state.players[i]!.eliminated);
}

function knownCards(
  state: LiarsPokerPrivateState,
  seat: SeatIndex,
): Card[] {
  const out: Card[] = [];
  // Own hand (or empty if dummy).
  const me = state.players[seat]!;
  if (!me.isDummy) out.push(...me.hand);
  // Visible dummy hands (everyone except the dummy themselves sees them).
  for (const s of state.seats) {
    if (s.index === seat) continue;
    const p = state.players[s.index]!;
    if (p.isDummy && !p.eliminated) out.push(...p.hand);
  }
  return out;
}

function unknownCardCount(
  state: LiarsPokerPrivateState,
  seat: SeatIndex,
): number {
  // Total cards in everyone's hands minus what we already see.
  let total = 0;
  for (const i of aliveSeats(state)) {
    total += state.players[i]!.hand.length;
  }
  return total - knownCards(state, seat).length;
}

// Estimate probability that the combined pool contains the claim. We do this
// by Monte-Carlo: sample unknown cards from the rest of the deck and test.
function pClaimTrue(
  state: LiarsPokerPrivateState,
  seat: SeatIndex,
  claim: HandClaim,
): number {
  const known = knownCards(state, seat);
  const unknown = unknownCardCount(state, seat);
  if (unknown === 0) {
    return claimExists(claim, known) ? 1 : 0;
  }
  // Build the rest of the deck.
  const seen = new Set<string>();
  for (const c of known) seen.add(`${c.rank}-${c.suit}`);
  const deck: Card[] = [];
  for (const s of ALL_SUITS) {
    for (let r = 2; r <= 14; r++) {
      const key = `${r}-${s}`;
      if (!seen.has(key)) deck.push({ rank: r as CardRank, suit: s });
    }
  }
  const trials = 60;
  let hits = 0;
  const rng = makeRng(state.seed ^ (state.roundNumber * 19) ^ (seat * 31));
  for (let t = 0; t < trials; t++) {
    // Fisher-Yates partial shuffle.
    const copy = deck.slice();
    for (let i = copy.length - 1; i > copy.length - 1 - unknown; i--) {
      const j = rngInt(rng, i + 1);
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    const sample = copy.slice(copy.length - unknown);
    const pool = known.concat(sample);
    if (claimExists(claim, pool)) hits += 1;
  }
  return hits / trials;
}

// Generate a small set of candidate next-raises.
function generateCandidates(
  state: LiarsPokerPrivateState,
  seat: SeatIndex,
): HandClaim[] {
  const candidates: HandClaim[] = [];
  // Use the AI's known cards to enumerate plausible bumps.
  const known = knownCards(state, seat);
  const ranksIHave = new Set<CardRank>(known.map((c) => c.rank));
  // High cards
  for (let r = 7; r <= 14; r++) {
    candidates.push({ kind: 'highCard', rank: r as CardRank });
  }
  // Pairs
  for (let r = 2; r <= 14; r++) {
    candidates.push({ kind: 'pair', rank: r as CardRank });
  }
  // Two pair (use ranks I have at least some evidence for)
  const evidenceRanks = Array.from(ranksIHave);
  for (const a of evidenceRanks) {
    for (const b of evidenceRanks) {
      if (a !== b) {
        candidates.push({
          kind: 'twoPair',
          highRank: Math.max(a, b) as CardRank,
          lowRank: Math.min(a, b) as CardRank,
        });
      }
    }
  }
  // Three of a kind
  for (let r = 2; r <= 14; r++) {
    candidates.push({ kind: 'threeKind', rank: r as CardRank });
  }
  // Straights
  for (let top = 6; top <= 14; top++) {
    candidates.push({ kind: 'straight', topRank: top as CardRank });
  }
  // Flushes
  for (const s of ALL_SUITS) {
    for (let top = 6; top <= 14; top++) {
      candidates.push({ kind: 'flush', topRank: top as CardRank, suit: s });
    }
  }
  // Full houses, four of a kind, straight flushes — only if there's any
  // chance with known evidence.
  for (let r = 2; r <= 14; r++) {
    candidates.push({ kind: 'fourKind', rank: r as CardRank });
  }
  for (const s of ALL_SUITS) {
    for (let top = 6; top <= 14; top++) {
      candidates.push({
        kind: 'straightFlush',
        topRank: top as CardRank,
        suit: s,
      });
    }
  }
  return candidates;
}

export function aiChooseAction(
  state: LiarsPokerPrivateState,
  seat: SeatIndex,
): LiarsPokerAction | null {
  if (state.players[seat]!.eliminated) return null;
  switch (state.phase) {
    case 'dealPending':
      if (state.players[seat]!.dealAcked) return null;
      return { type: 'ackDeal', bySeat: seat };

    case 'revealing':
      if (state.revealAcked[seat]) return null;
      return { type: 'ackReveal', bySeat: seat };

    case 'roundOver':
      if (state.roundOverAcked[seat]) return null;
      return { type: 'ackRoundOver', bySeat: seat };

    case 'bidding': {
      if (seat !== state.currentSeat) return null;
      const prev = state.currentClaim;
      // Should we call?
      if (prev !== null) {
        const pTrue = pClaimTrue(state, seat, prev);
        const rng = makeRng(state.seed ^ (state.roundNumber * 11) ^ (seat * 41));
        const j = rngInt(rng, 15) / 100;
        if (pTrue < 0.35 + j) {
          return { type: 'callLiar', bySeat: seat };
        }
      }
      const candidates = generateCandidates(state, seat).filter(
        (c) => prev === null || compareClaim(prev, c) === -1,
      );
      const scored = candidates.map((c) => ({
        claim: c,
        p: pClaimTrue(state, seat, c),
      }));

      // Bluff mixer: with small probability, leap to a much stronger (but
      // less safe) claim. Punishes opponents who learn the "always pick
      // weakest safe claim" pattern. Bluff rate scales with own card count
      // (more cards = more cover for a bluff).
      const me = state.players[seat]!;
      const bluffP = Math.min(
        0.22,
        0.06 + 0.04 * (me.cardCount || state.cardsPerPlayer),
      );
      const jr = makeRng(
        (state.seed ^ (seat * 0x9e37) ^ (state.roundNumber * 53)) >>> 0,
      );
      const j = rngInt(jr, 100) / 100;
      const wantBluff = j < bluffP;

      const safe = scored.filter((x) => x.p >= 0.5);
      const semi = scored.filter((x) => x.p >= 0.25 && x.p < 0.5);

      if (wantBluff && semi.length > 0) {
        // Sort by strength descending — pick a STRONGER claim than necessary.
        semi.sort((a, b) =>
          prev === null
            ? compareClaim(b.claim, a.claim)
            : compareClaim(b.claim, a.claim),
        );
        return { type: 'placeClaim', bySeat: seat, claim: semi[0]!.claim };
      }

      if (safe.length === 0) {
        if (prev !== null) {
          return { type: 'callLiar', bySeat: seat };
        }
        return {
          type: 'placeClaim',
          bySeat: seat,
          claim: { kind: 'highCard', rank: 7 as CardRank },
        };
      }
      // Pick the WEAKEST safe claim.
      safe.sort((a, b) => compareClaim(a.claim, b.claim));
      return { type: 'placeClaim', bySeat: seat, claim: safe[0]!.claim };
    }

    case 'gameOver':
      return null;
  }
}
