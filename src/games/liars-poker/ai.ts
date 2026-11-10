import { makeRng, rngFloat, rngInt } from '@/engine/rng';
import type { RngState } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { LiarsPokerAction } from './actions';
import { ALL_RANKS, ALL_SUITS, allClaims, claimExistsIn, compareClaim, poolStats } from './hands';
import type { HandClaim, PoolStats } from './hands';
import type { Card, LiarsPokerPrivateState, LiarsPokerPublicState } from './state';
import { viewFor } from './view';

// ============================================================================
// Liar's Poker AI.
//
// Fairness: decides from `viewFor(state, seat)` only. Known cards are the
// seat's own hand plus any dummy cards it is allowed to see; a dummy AI
// does NOT know its own card. Every other card in play is unknown and is
// Monte-Carlo sampled from the rest of the deck — never read. The private
// seed is used only as an entropy source for sampling / bluff mixing.
//
// Decision: score each option by the chance it costs us a card —
//   call liar → P(current claim exists)
//   raise c   → P(c doesn't exist) × P(someone calls it)
// with jitter, plus a bluff mixer that sometimes overclaims.
// ============================================================================

const TRIALS = 90;
const P_CALLED = 0.6;
const CLAIMS = allClaims();

export function aiChooseAction(
  state: LiarsPokerPrivateState,
  seat: SeatIndex,
): LiarsPokerAction | null {
  if (!state.players[seat]) return null;
  const view = viewFor(state, seat);
  const rng = makeRng(mix(state.seed, seat, view.roundNumber, view.roundClaims.length, 0x51));
  return decideFromView(view, rng);
}

/** Pure decision from a redacted view. Exported for fairness tests. */
export function decideFromView(view: LiarsPokerPublicState, rng: RngState): LiarsPokerAction | null {
  const seat = view.yourSeat;
  if (seat === null) return null;
  const me = view.players[seat];
  if (!me || me.eliminated) return null;
  switch (view.phase) {
    case 'dealPending':
      return view.yourAckPending ? { type: 'ackDeal', bySeat: seat } : null;
    case 'revealing':
      return view.yourAckPending ? { type: 'ackReveal', bySeat: seat } : null;
    case 'roundOver':
      return view.yourAckPending ? { type: 'ackRoundOver', bySeat: seat } : null;
    case 'gameOver':
      return null;
    case 'bidding':
      if (view.currentSeat !== seat) return null;
      return chooseClaimOrCall(view, seat, rng);
  }
}

/** Cards this seat can legitimately see right now. */
export function knownCards(view: LiarsPokerPublicState): Card[] {
  const out: Card[] = view.yourHand.slice();
  for (const p of view.players) {
    if (p.index === view.yourSeat || p.eliminated) continue;
    out.push(...p.visibleHand);
  }
  return out;
}

/** Monte-Carlo samples of the full combined pool, consistent with the view. */
function samplePools(view: LiarsPokerPublicState, rng: RngState): PoolStats[] {
  const known = knownCards(view);
  const unknown = Math.max(0, view.totalCards - known.length);
  const seen = new Set(known.map((c) => `${c.rank}${c.suit}`));
  const rest: Card[] = [];
  for (const suit of ALL_SUITS) for (const rank of ALL_RANKS) if (!seen.has(`${rank}${suit}`)) rest.push({ rank, suit });
  if (unknown === 0) return [poolStats(known)];
  const out: PoolStats[] = [];
  for (let t = 0; t < TRIALS; t++) {
    const deck = rest.slice();
    for (let i = deck.length - 1; i > deck.length - 1 - unknown && i > 0; i--) {
      const j = rngInt(rng, i + 1);
      [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }
    out.push(poolStats(known.concat(deck.slice(deck.length - unknown))));
  }
  return out;
}

function probability(claim: HandClaim, samples: PoolStats[]): number {
  let hits = 0;
  for (const s of samples) if (claimExistsIn(claim, s)) hits += 1;
  return hits / samples.length;
}

function chooseClaimOrCall(view: LiarsPokerPublicState, seat: SeatIndex, rng: RngState): LiarsPokerAction {
  const prev = view.currentClaim;
  const samples = samplePools(view, rng);
  const raises = CLAIMS.filter((c) => prev === null || compareClaim(prev, c) === -1).map((claim) => ({
    claim,
    p: probability(claim, samples),
  }));

  if (prev === null) {
    return { type: 'placeClaim', bySeat: seat, claim: openingClaim(raises, rng) };
  }
  if (raises.length === 0) return { type: 'callLiar', bySeat: seat };

  const pPrev = probability(prev, samples);
  const jitter = () => (rngFloat(rng) - 0.5) * 0.08;

  // Bluff mixer: sometimes overclaim instead of the "obvious" move.
  const myCards = me(view).handSize;
  const bluffP = Math.min(0.22, 0.07 + 0.03 * myCards);
  if (pPrev > 0.4 && rngFloat(rng) < bluffP) {
    const semi = raises.filter((x) => x.p >= 0.25 && x.p < 0.5);
    if (semi.length > 0) {
      return { type: 'placeClaim', bySeat: seat, claim: semi[Math.floor(rngFloat(rng) * semi.length)]!.claim };
    }
  }

  // Best raise: highest probability, weakest on ties (don't jump needlessly).
  let best = raises[0]!;
  for (const r of raises) if (r.p > best.p + 1e-9) best = r;
  const raiseRisk = (1 - best.p) * P_CALLED + jitter();
  const callRisk = pPrev + jitter();
  return callRisk < raiseRisk
    ? { type: 'callLiar', bySeat: seat }
    : { type: 'placeClaim', bySeat: seat, claim: best.claim };
}

function openingClaim(raises: Array<{ claim: HandClaim; p: number }>, rng: RngState): HandClaim {
  // Open with the strongest claim that's still comfortably likely, with a
  // random threshold so the opener isn't a readable function of the hand.
  const threshold = 0.62 + rngFloat(rng) * 0.15;
  const safe = raises.filter((x) => x.p >= threshold);
  if (safe.length === 0) {
    let best = raises[0]!;
    for (const r of raises) if (r.p > best.p) best = r;
    return best.claim;
  }
  if (rngFloat(rng) < 0.25) return safe[Math.floor(rngFloat(rng) * safe.length)]!.claim;
  return safe[safe.length - 1]!.claim; // raises are weakest-first
}

function me(view: LiarsPokerPublicState) {
  return view.players[view.yourSeat!]!;
}

function mix(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    h ^= part >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 15;
  }
  return h >>> 0;
}
