import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { LoveLetterAction } from './actions';
import type {
  Card,
  LoveLetterPrivateState,
  Rank,
} from './state';

// Love Letter AI. Lightweight heuristic — designed for filling hot-seat
// games, not for tournament play. Pure file; no DOM/net/store imports.
//
// Behavior:
//  - Acks all reveal phases promptly.
//  - Honors the Countess-with-King/Prince forced-discard rule.
//  - Prefers safe plays: Handmaid > Priest/Baron (low-rank target) > the
//    higher of the two cards in hand. Never plays the Princess voluntarily.
//  - Picks a deterministic target seat (lowest-index non-protected alive
//    non-self), with `chooseTarget` for Priest/Baron/King/Prince.
//  - Guard: targets the lowest-index non-protected non-self alive seat;
//    guesses a non-Guard rank deterministically (rotates by round number).

function aliveTargets(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  allowSelf: boolean,
): SeatIndex[] {
  return state.seats
    .map((s) => s.index)
    .filter((i) => {
      const p = state.players[i]!;
      if (p.eliminated) return false;
      if (!allowSelf && i === actor) return false;
      if (p.protected) return false;
      return true;
    });
}

function pickTarget(
  state: LoveLetterPrivateState,
  actor: SeatIndex,
  allowSelf: boolean,
): SeatIndex | null {
  const ts = aliveTargets(state, actor, allowSelf);
  if (ts.length === 0) return null;
  // Prefer the seat with the fewest discards (intuitively, less is known
  // about them so deduction info is most valuable).
  return ts.reduce((best, cur) => {
    const bDisc = state.players[best]!.discard.length;
    const cDisc = state.players[cur]!.discard.length;
    return cDisc < bDisc ? cur : best;
  }, ts[0]!);
}

function chooseGuardGuess(
  state: LoveLetterPrivateState,
  seat: SeatIndex,
): Rank {
  // Rotate through 2..8 deterministically based on round + seat. We DON'T
  // peek at the target's actual card here — the AI is intentionally weak.
  // Skip 1 (illegal). Skip already-fully-discarded ranks if all copies are
  // visible (no chance of being held). Falls back to 5 if everything else
  // is impossible.
  const seen = new Map<Rank, number>();
  for (const p of Object.values(state.players)) {
    for (const c of p.discard) {
      seen.set(c, (seen.get(c) ?? 0) + 1);
    }
  }
  for (const c of state.setAsideFaceUp) {
    seen.set(c, (seen.get(c) ?? 0) + 1);
  }
  const counts: Record<Rank, number> = {
    1: 5,
    2: 2,
    3: 2,
    4: 2,
    5: 2,
    6: 1,
    7: 1,
    8: 1,
  };
  const order: Rank[] = [5, 6, 8, 3, 4, 7, 2];
  const rng = makeRng(state.seed ^ (state.roundNumber * 17) ^ seat);
  const offset = rngInt(rng, order.length);
  for (let i = 0; i < order.length; i++) {
    const rank = order[(i + offset) % order.length]!;
    if ((seen.get(rank) ?? 0) < counts[rank]) return rank;
  }
  return 5;
}

// Decide which of the two held cards to play. Returns the rank to discard.
function chooseCardToPlay(
  state: LoveLetterPrivateState,
  seat: SeatIndex,
): Card {
  const hand = state.players[seat]!.hand;
  if (hand.length < 2) return hand[0]!;

  // Countess force.
  const has = (r: Rank) => hand.includes(r);
  if (has(7) && (has(5) || has(6))) return 7;

  // Never play the Princess voluntarily.
  const noPrincess = hand.filter((c) => c !== 8);
  const candidates = noPrincess.length > 0 ? noPrincess : hand;

  // Preference order. Handmaid first when paired with a low value; then
  // Priest (info), then King swap, then prince, then baron, then guard.
  const PRIORITY: Card[] = [4, 2, 6, 5, 3, 1, 7, 8];
  for (const r of PRIORITY) {
    if (candidates.includes(r)) return r;
  }
  return candidates[0]!;
}

export function aiChooseAction(
  state: LoveLetterPrivateState,
  seat: SeatIndex,
): LoveLetterAction | null {
  switch (state.phase) {
    case 'roundStart':
      if (state.startAcked[seat]) return null;
      return { type: 'ackStart', bySeat: seat };

    case 'effectReveal':
      if (state.revealAcked[seat]) return null;
      return { type: 'ackEffect', bySeat: seat };

    case 'priestReveal':
      // Only the actor advances.
      if (!state.priestPeek || state.priestPeek.byActor !== seat) return null;
      return { type: 'ackPriest', bySeat: seat };

    case 'roundOver':
      if (state.roundOverAcked[seat]) return null;
      return { type: 'ackRoundOver', bySeat: seat };

    case 'turn': {
      if (seat !== state.currentSeat) return null;
      const card = chooseCardToPlay(state, seat);
      return { type: 'playCard', bySeat: seat, card };
    }

    case 'guardTargeting': {
      if (seat !== state.currentSeat) return null;
      const target = pickTarget(state, seat, false);
      if (target === null) {
        // No valid targets — engine should already have resolved noTargets.
        return null;
      }
      const guess = chooseGuardGuess(state, seat);
      return { type: 'guardGuess', bySeat: seat, target, guess };
    }

    case 'priestTargeting':
    case 'baronTargeting':
    case 'kingTargeting': {
      if (seat !== state.currentSeat) return null;
      const target = pickTarget(state, seat, false);
      if (target === null) return null;
      return { type: 'chooseTarget', bySeat: seat, target };
    }

    case 'princeTargeting': {
      if (seat !== state.currentSeat) return null;
      // Prince can target self; only do so if no opponent target is
      // available (otherwise self-Prince discards your own card for nothing).
      let target = pickTarget(state, seat, /*allowSelf*/ false);
      if (target === null) target = seat;
      return { type: 'chooseTarget', bySeat: seat, target };
    }

    case 'gameOver':
      return null;
  }
}
