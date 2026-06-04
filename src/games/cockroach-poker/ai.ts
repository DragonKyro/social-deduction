import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { CockroachPokerAction } from './actions';
import { CREATURES } from './state';
import type {
  CockroachPokerPrivateState,
  Creature,
} from './state';

// Cockroach Poker AI.
//
// Strategy:
//  - On your turn (passing): pick a card you have plenty of (so losing it
//    from your row hurts less), claim it's a different creature that the
//    target has the most of (to maximize threat). Pick target with the
//    fewest current row counts (more headroom for you to fish).
//  - On decide: if the in-transit card is something you have 3 already of,
//    accept/challenge in whichever way avoids it landing in your row. If
//    we can pass on, pass to someone with low row counts.

function aliveSeats(state: CockroachPokerPrivateState): SeatIndex[] {
  return state.seats
    .map((s) => s.index)
    .filter((i) => !state.players[i]!.lost);
}

function rngFor(state: CockroachPokerPrivateState, seat: SeatIndex): number {
  const rng = makeRng(
    state.seed ^ (seat * 53) ^ ((state.pass?.chain.length ?? 0) * 11),
  );
  return rngInt(rng, 100);
}

function pickPassTarget(
  state: CockroachPokerPrivateState,
  selfSeat: SeatIndex,
  blockedSeats: SeatIndex[],
  card: Creature | null,
): SeatIndex | null {
  const candidates = aliveSeats(state).filter(
    (i) => i !== selfSeat && !blockedSeats.includes(i),
  );
  if (candidates.length === 0) return null;
  // Weight each candidate by how close they are to losing on THIS card (3+
  // already → highest priority target). Then break ties by total row count
  // (overall pressure), then by a per-seat jitter so we don't always hit
  // the same seat first.
  const scored = candidates.map((i) => {
    const p = state.players[i]!;
    const onCreature = card ? p.row[card] : 0;
    // Strong preference for seats already at 3 on this creature.
    const lossWeight = onCreature >= 3 ? 100 : onCreature * 5;
    const total = sumRow(p.row);
    const jitter =
      rngInt(
        makeRng((state.seed ^ (selfSeat * 41) ^ (i * 23)) >>> 0),
        100,
      ) / 100;
    return { i, score: lossWeight + total + jitter };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.i;
}

function sumRow(row: Record<Creature, number>): number {
  let n = 0;
  for (const c of CREATURES) n += row[c];
  return n;
}

export function aiChooseAction(
  state: CockroachPokerPrivateState,
  seat: SeatIndex,
): CockroachPokerAction | null {
  if (state.players[seat]!.lost) return null;
  switch (state.phase) {
    case 'dealPending':
      if (state.players[seat]!.dealAcked) return null;
      return { type: 'ackDeal', bySeat: seat };

    case 'revealing':
      if (state.revealAcked[seat]) return null;
      return { type: 'ackReveal', bySeat: seat };

    case 'passing': {
      if (seat !== state.currentSeat) return null;
      const me = state.players[seat]!;
      if (me.hand.length === 0) return null;
      // Pick a card we have multiples of in hand (least painful to lose).
      const counts = new Map<Creature, number>();
      for (const c of me.hand) counts.set(c, (counts.get(c) ?? 0) + 1);
      let chosen: Creature = me.hand[0]!;
      let chosenCount = 0;
      let chosenIdx = 0;
      for (let i = 0; i < me.hand.length; i++) {
        const c = me.hand[i]!;
        const n = counts.get(c) ?? 0;
        if (n > chosenCount) {
          chosenCount = n;
          chosen = c;
          chosenIdx = i;
        }
      }
      // Decide whether to lie. Lie if we have any other creatures to choose.
      const r = rngFor(state, seat);
      const otherCreatures = CREATURES.filter((c) => c !== chosen);
      const willLie = r < 70;
      const claim = willLie
        ? otherCreatures[rngFor(state, seat ^ 13) % otherCreatures.length]!
        : chosen;
      const target = pickPassTarget(state, seat, [], chosen);
      if (target === null) return null;
      return {
        type: 'startPass',
        bySeat: seat,
        handIndex: chosenIdx,
        claim,
        target,
      };
    }

    case 'decide': {
      const p = state.pass;
      if (!p || p.holder !== seat) return null;
      const me = state.players[seat]!;
      // We can peek (always know the card here).
      const card = p.card;
      const myCount = me.row[card];
      // If we already have 3 of this card, we MUST get rid of it. Try to
      // pass it on; otherwise call lie if claim is wrong, truth otherwise.
      const claimCorrect = card === p.claim;
      const passOptions = aliveSeats(state).filter(
        (i) => i !== seat && !p.seenBy.includes(i),
      );
      if (myCount >= 3 && passOptions.length > 0) {
        // Must rid: pass it on, picking target by row pressure.
        const target = pickPassTarget(state, seat, p.seenBy, card);
        if (target !== null) {
          // Lie about the card to maximize pressure on target — 70% lie,
          // 30% truth (so we're not fully predictable).
          const r = rngFor(state, seat ^ 23);
          const others = CREATURES.filter((c) => c !== card);
          const claim = r < 70 ? others[r % others.length]! : card;
          return { type: 'peekAndPass', bySeat: seat, claim, target };
        }
      }
      // Tactical pass-on opportunity: if we have NO copies of this card and
      // can deflect to someone with many, do it (their row pressure suffers).
      if (myCount === 0 && passOptions.length > 0) {
        const r = rngFor(state, seat ^ 47);
        if (r < 30) {
          const target = pickPassTarget(state, seat, p.seenBy, card);
          if (target !== null) {
            const others = CREATURES.filter((c) => c !== card);
            const claim = r < 15 ? others[r % others.length]! : card;
            return { type: 'peekAndPass', bySeat: seat, claim, target };
          }
        }
      }
      // Otherwise: call correctly based on what we know (we peeked).
      return {
        type: 'decide',
        bySeat: seat,
        call: claimCorrect ? 'truth' : 'lie',
      };
    }

    case 'gameOver':
      return null;
  }
}
