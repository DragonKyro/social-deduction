import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { LiarsDiceAction } from './actions';
import type {
  Bid,
  DieFace,
  LiarsDicePrivateState,
} from './state';

// Liar's Dice AI.
//
// Idea: from the AI's own dice we know the "guaranteed" count of each face.
// Other players' dice are unknown — model each as uniform 1..6, with the
// adjustment that a 1 also counts when wildOnes is enabled (unless the bid
// face IS 1). The probability that the actual count meets-or-exceeds the
// bid drives raise/call decisions.

function aliveSeats(state: LiarsDicePrivateState): SeatIndex[] {
  return state.seats
    .map((s) => s.index)
    .filter((i) => !state.players[i]!.eliminated);
}

function unseenDiceCount(
  state: LiarsDicePrivateState,
  ownSeat: SeatIndex,
): number {
  return aliveSeats(state)
    .filter((i) => i !== ownSeat)
    .reduce((sum, i) => sum + state.players[i]!.diceCount, 0);
}

// Probability that a single unseen die contributes to face `face`.
function pPerDie(state: LiarsDicePrivateState, face: DieFace): number {
  if (state.wildOnes && face !== 1) return 2 / 6;
  return 1 / 6;
}

// Binomial PMF: P(k of n with p).
function pmf(n: number, k: number, p: number): number {
  if (k < 0 || k > n) return 0;
  // log-binomial to avoid overflow
  let logC = 0;
  for (let i = 1; i <= k; i++) {
    logC += Math.log(n - k + i) - Math.log(i);
  }
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

// Probability that the bid is true: actual >= bid.count (or === for spot-on).
function pBidTrue(
  state: LiarsDicePrivateState,
  ownSeat: SeatIndex,
  bid: Bid,
): { atLeast: number; exact: number } {
  // My contribution.
  const mine = state.players[ownSeat]!.dice.reduce((s, d) => {
    if (d === bid.face) return s + 1;
    if (state.wildOnes && bid.face !== 1 && d === 1) return s + 1;
    return s;
  }, 0);
  const n = unseenDiceCount(state, ownSeat);
  const p = pPerDie(state, bid.face);
  const need = Math.max(0, bid.count - mine);
  // P(at least `need` successes out of n with prob p)
  let atLeast = 0;
  let exact = 0;
  for (let k = 0; k <= n; k++) {
    const pk = pmf(n, k, p);
    if (k >= need) atLeast += pk;
    if (k === need) exact = pk;
  }
  return { atLeast, exact };
}

// Pick the cheapest legal raise (increment count by 1 OR increment face if
// possible). Prefer the choice with the highest "true" probability.
function nextRaise(
  state: LiarsDicePrivateState,
  ownSeat: SeatIndex,
): Bid | null {
  const prev = state.currentBid;
  const totalDice = aliveSeats(state).reduce(
    (s, i) => s + state.players[i]!.diceCount,
    0,
  );

  const candidates: Bid[] = [];
  if (prev === null) {
    // Open bid — pick a reasonable starting bid: 1× our most common face
    // (or 2× if we have multiples).
    const counts: Record<DieFace, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const d of state.players[ownSeat]!.dice) counts[d] += 1;
    let bestFace: DieFace = 2;
    let bestCount = 0;
    for (let f = 2; f <= 6; f++) {
      const fa = f as DieFace;
      if (counts[fa] > bestCount) {
        bestCount = counts[fa];
        bestFace = fa;
      }
    }
    candidates.push({ count: Math.max(1, bestCount + 1), face: bestFace });
  } else {
    // Same count, higher face (if possible).
    if (prev.face < 6) {
      candidates.push({ count: prev.count, face: (prev.face + 1) as DieFace });
    }
    // Higher count (+1), same or different face.
    if (prev.count + 1 <= totalDice) {
      candidates.push({ count: prev.count + 1, face: prev.face });
      for (let f = 2; f <= 6; f++) {
        const fa = f as DieFace;
        if (fa !== prev.face) {
          candidates.push({ count: prev.count + 1, face: fa });
        }
      }
    }
  }

  // Score all candidates.
  const scored = candidates.map((c) => ({
    bid: c,
    p: pBidTrue(state, ownSeat, c).atLeast,
  }));
  const safe = scored.filter((x) => x.p >= 0.5);

  // Bluff mixer: with some probability, place a slightly LESS safe bid (a
  // semi-bluff). This breaks the rule "the bot only bids when ≥50% safe",
  // which is exploitable. Bluff rate scales with how many dice remain (more
  // dice → less risky to bluff; opponents have less posterior info).
  const ownDice = state.players[ownSeat]!.diceCount;
  const bluffP = Math.min(0.3, 0.06 + 0.04 * (totalDice - ownDice));
  const j = rngInt(makeRng((state.seed ^ (ownSeat * 71) ^ (state.roundNumber * 13)) >>> 0), 100) / 100;
  const wantBluff = j < bluffP;

  if (wantBluff) {
    // Pick a semi-safe (0.3-0.5) candidate if one exists.
    const semi = scored.filter((x) => x.p >= 0.3 && x.p < 0.5);
    if (semi.length > 0) {
      semi.sort((a, b) => b.p - a.p);
      return semi[0]!.bid;
    }
  }

  if (safe.length === 0) {
    return candidates[0] ?? null;
  }
  safe.sort((a, b) => b.p - a.p);
  return safe[0]!.bid;
}

export function aiChooseAction(
  state: LiarsDicePrivateState,
  seat: SeatIndex,
): LiarsDiceAction | null {
  if (state.players[seat]!.eliminated) return null;

  switch (state.phase) {
    case 'rollPending':
      if (state.players[seat]!.rollAcked) return null;
      return { type: 'ackRoll', bySeat: seat };

    case 'revealing':
      if (state.revealAcked[seat]) return null;
      return { type: 'ackReveal', bySeat: seat };

    case 'roundOver':
      if (state.roundOverAcked[seat]) return null;
      return { type: 'ackRoundOver', bySeat: seat };

    case 'bidding': {
      if (seat !== state.currentSeat) return null;
      const prev = state.currentBid;
      if (prev !== null) {
        // Should we call?
        const { atLeast, exact } = pBidTrue(state, seat, prev);
        // jitter for non-determinism by seat+round
        const rng = makeRng(state.seed ^ (state.roundNumber * 7) ^ (seat * 11));
        const j = rngInt(rng, 10) / 100;
        if (atLeast < 0.25 + j) {
          return { type: 'call', bySeat: seat, kind: 'liar' };
        }
        if (state.spotOn && exact > 0.35) {
          return { type: 'call', bySeat: seat, kind: 'spotOn' };
        }
      }
      const raise = nextRaise(state, seat);
      if (raise) return { type: 'placeBid', bySeat: seat, bid: raise };
      // If there's nothing legal, must call (only happens at game-over edge).
      if (prev !== null) return { type: 'call', bySeat: seat, kind: 'liar' };
      return null;
    }

    case 'gameOver':
      return null;
  }
}
