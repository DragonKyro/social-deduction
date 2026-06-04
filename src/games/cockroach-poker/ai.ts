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
): SeatIndex | null {
  const candidates = aliveSeats(state).filter(
    (i) => i !== selfSeat && !blockedSeats.includes(i),
  );
  if (candidates.length === 0) return null;
  // Pick the seat with the highest total row count (most pressure).
  candidates.sort((a, b) => {
    const sa = sumRow(state.players[a]!.row);
    const sb = sumRow(state.players[b]!.row);
    return sb - sa;
  });
  return candidates[0]!;
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
      const target = pickPassTarget(state, seat, []);
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
        // Pass on. Pick a target with low row counts.
        const target = pickPassTarget(state, seat, p.seenBy);
        if (target !== null) {
          // Lie about the card to maximize pressure on target.
          const r = rngFor(state, seat ^ 23);
          const claim =
            r < 70
              ? CREATURES.filter((c) => c !== card)[
                  r % (CREATURES.length - 1)
                ]!
              : card;
          return { type: 'peekAndPass', bySeat: seat, claim, target };
        }
      }
      // Otherwise: call correctly based on what we know.
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
