import { makeRng, rngFloat } from '@/engine/rng';
import type { RngState } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { LiarsDiceAction } from './actions';
import { countMatching, legalBids } from './rules';
import type { Bid, LiarsDicePrivateState, LiarsDicePublicState } from './state';
import { viewFor } from './view';

// ============================================================================
// Liar's Dice AI.
//
// Fairness: the AI decides from `viewFor(state, seat)` only — the same
// redacted view a human in that seat gets. Its own dice are known; every
// other die is modelled as an independent uniform roll (binomial prior),
// never read. The private seed is used purely as an entropy source for the
// bluff mixer (hashed with seat / round / bid number), never to reconstruct
// rolls.
//
// Decision: score each option by the chance it costs us a die —
//   call liar  → P(bid is true)
//   spot on    → 1 − P(count is exact)
//   raise b    → P(b is false) × P(someone calls it)
// with a little jitter, plus a bluff mixer that sometimes bids a face we
// don't hold so our bids don't map 1:1 onto our cup.
// ============================================================================

const P_CALLED = 0.62;

export function aiChooseAction(
  state: LiarsDicePrivateState,
  seat: SeatIndex,
): LiarsDiceAction | null {
  if (!state.players[seat]) return null;
  const view = viewFor(state, seat);
  const rng = makeRng(mix(state.seed, seat, view.roundNumber, view.roundBids.length, view.phase.length));
  return decideFromView(view, rng);
}

/** Pure decision from a redacted view. Exported for fairness tests. */
export function decideFromView(view: LiarsDicePublicState, rng: RngState): LiarsDiceAction | null {
  const seat = view.yourSeat;
  if (seat === null) return null;
  const me = view.players[seat];
  if (!me || me.eliminated) return null;

  switch (view.phase) {
    case 'rollPending':
      return view.yourAckPending ? { type: 'ackRoll', bySeat: seat } : null;
    case 'revealing':
      return view.yourAckPending ? { type: 'ackReveal', bySeat: seat } : null;
    case 'roundOver':
      return view.yourAckPending ? { type: 'ackRoundOver', bySeat: seat } : null;
    case 'gameOver':
      return null;
    case 'bidding':
      if (view.currentSeat !== seat) return null;
      return chooseBidOrCall(view, seat, rng);
  }
}

function chooseBidOrCall(view: LiarsDicePublicState, seat: SeatIndex, rng: RngState): LiarsDiceAction {
  const prev = view.currentBid;
  const legal = legalBids(prev, view.totalDice, view.wildOnes);
  const scored = legal.map((bid) => ({ bid, p: odds(view, bid).atLeast }));

  if (prev === null) {
    return { type: 'placeBid', bySeat: seat, bid: openingBid(scored, rng) };
  }

  const prevOdds = odds(view, prev);
  type Option = { risk: number; action: LiarsDiceAction };
  const options: Option[] = [];
  const jitter = () => (rngFloat(rng) - 0.5) * 0.08;

  options.push({ risk: prevOdds.atLeast + jitter(), action: { type: 'call', bySeat: seat, kind: 'liar' } });
  if (view.spotOn) {
    options.push({
      risk: 1 - prevOdds.exact + jitter(),
      action: { type: 'call', bySeat: seat, kind: 'spotOn' },
    });
  }

  // Raises: prefer the safest, then the cheapest.
  const raises = scored
    .slice()
    .sort((a, b) => b.p - a.p || a.bid.count - b.bid.count)
    .slice(0, 6);
  for (const r of raises) {
    options.push({
      risk: (1 - r.p) * P_CALLED + jitter(),
      action: { type: 'placeBid', bySeat: seat, bid: r.bid },
    });
  }

  // Bluff mixer: occasionally make a semi-bluff raise instead.
  const ownDice = view.yourDice.length;
  const bluffP = Math.min(0.25, 0.08 + 0.02 * (view.totalDice - ownDice));
  if (prevOdds.atLeast > 0.35 && rngFloat(rng) < bluffP) {
    const semi = scored.filter((x) => x.p >= 0.3 && x.p < 0.55);
    if (semi.length > 0) {
      const pick = semi[Math.floor(rngFloat(rng) * semi.length)]!;
      return { type: 'placeBid', bySeat: seat, bid: pick.bid };
    }
  }

  options.sort((a, b) => a.risk - b.risk);
  return options[0]!.action;
}

function openingBid(scored: Array<{ bid: Bid; p: number }>, rng: RngState): Bid {
  // Push the opening as high as stays comfortably likely, with a random
  // margin so the opener's count isn't a readable function of the cup.
  const threshold = 0.6 + rngFloat(rng) * 0.15;
  const safe = scored.filter((x) => x.p >= threshold);
  if (safe.length > 0) {
    // Occasionally open on a face we're merely okay on (masks our best face).
    if (rngFloat(rng) < 0.2) return safe[Math.floor(rngFloat(rng) * safe.length)]!.bid;
    safe.sort((a, b) => b.bid.count - a.bid.count || b.p - a.p);
    return safe[0]!.bid;
  }
  const best = scored.slice().sort((a, b) => b.p - a.p || a.bid.count - b.bid.count);
  return best[0]!.bid;
}

/** P(actual ≥ bid.count) and P(actual = bid.count) from this seat's knowledge. */
export function odds(view: LiarsDicePublicState, bid: Bid): { atLeast: number; exact: number } {
  const mine = countMatching(view.yourDice, bid.face, view.wildOnes);
  const unseen = Math.max(0, view.totalDice - view.yourDice.length);
  const p = view.wildOnes && bid.face !== 1 ? 2 / 6 : 1 / 6;
  const need = bid.count - mine;
  let atLeast = 0;
  let exact = 0;
  for (let k = 0; k <= unseen; k++) {
    const pk = pmf(unseen, k, p);
    if (k >= need) atLeast += pk;
    if (k === need) exact = pk;
  }
  return { atLeast: Math.min(1, atLeast), exact };
}

function pmf(n: number, k: number, p: number): number {
  if (k < 0 || k > n) return 0;
  let logC = 0;
  for (let i = 1; i <= k; i++) logC += Math.log(n - k + i) - Math.log(i);
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p));
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
