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
  target: SeatIndex,
): Rank {
  // Probability the target holds rank `r`: among the unseen cards (deck +
  // target's hand), what fraction are rank `r`? We don't peek at target.
  // Skip 1 (illegal to guess Guard).
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
  // Count seen cards (discards + setAsideFaceUp + my own hand).
  const seen = new Map<Rank, number>();
  for (const p of Object.values(state.players)) {
    for (const c of p.discard) seen.set(c, (seen.get(c) ?? 0) + 1);
  }
  for (const c of state.setAsideFaceUp) seen.set(c, (seen.get(c) ?? 0) + 1);
  // Subtract our own held cards so we don't double-count.
  for (const c of state.players[seat]!.hand) {
    seen.set(c, (seen.get(c) ?? 0) + 1);
  }

  // Among target's most-recent discards: if their last play was high (6,7,8),
  // they almost certainly drew a fresh card last turn. We can't infer much.
  // Heuristic boost: if target hasn't played a Priest/Baron/King (5,6) but
  // those remain in circulation, slightly weight that they hold them.

  // Score each rank 2..8 by P(target holds it). Probability ∝ (unseen copies).
  const ranked: Array<{ rank: Rank; p: number }> = [];
  for (let r = 2 as Rank; r <= 8; r = (r + 1) as Rank) {
    const remaining = counts[r] - (seen.get(r) ?? 0);
    if (remaining <= 0) continue;
    // Weight higher ranks slightly more — they're harder to guess randomly,
    // so a correct guess is more valuable. (We don't see the target's card
    // either way; the EV equation is the same per-guess.)
    ranked.push({ rank: r, p: remaining });
  }
  if (ranked.length === 0) return 5;

  // Randomize among the TOP-2 by probability to avoid being predictable.
  ranked.sort((a, b) => b.p - a.p);
  const rng = makeRng(
    (state.seed ^ (state.roundNumber * 17) ^ (seat * 23) ^ target) >>> 0,
  );
  const top = ranked.slice(0, Math.min(2, ranked.length));
  return top[rngInt(rng, top.length)]!.rank;
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
      const guess = chooseGuardGuess(state, seat, target);
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
