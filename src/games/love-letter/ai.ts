import { makeRng, rngFloat, type RngState } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { LoveLetterAction } from './actions';
import type { Card, LoveLetterPrivateState, LoveLetterPublicState, PublicPlayer, Rank } from './state';
import { RANK_COUNTS, RANKS } from './state';
import { viewFor } from './view';

// ============================================================================
// Love Letter AI.
//
// FAIRNESS: the AI only ever sees `viewFor(state, seat)` — the same redacted
// view a human in that seat gets. It counts cards from public discards, its
// own hand, the face-up set-aside cards, and what it has legitimately learned
// (Priest peeks, Baron ties, King swaps — `yourKnowledge`). It never reads
// another seat's hand, the deck or the face-down card. Randomness is derived
// from a hash of the view (the seed is host-private).
//
// Pure file; no DOM/net/store imports.
// ============================================================================

export function aiChooseAction(
  state: LoveLetterPrivateState,
  seat: SeatIndex,
): LoveLetterAction | null {
  if (!state.players[seat]) return null;
  return chooseFromView(viewFor(state, seat), seat);
}

// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rngFor(v: LoveLetterPublicState, seat: SeatIndex): RngState {
  const key = JSON.stringify([
    seat,
    v.roundNumber,
    v.phase,
    v.deckRemaining,
    v.yourHand,
    v.players.map((p) => p.discard),
    v.log.length,
  ]);
  return makeRng(hashString(key));
}

/** Copies of each rank this seat can't account for (deck + face-down + unknown hands). */
function unseenCounts(v: LoveLetterPublicState): Record<Rank, number> {
  const counts = { ...RANK_COUNTS };
  const take = (c: Card) => {
    counts[c] = Math.max(0, counts[c] - 1);
  };
  for (const p of v.players) p.discard.forEach(take);
  v.setAsideFaceUp.forEach(take);
  v.yourHand.forEach(take);
  for (const k of v.yourKnowledge) take(k.card);
  return counts;
}

function knownCard(v: LoveLetterPublicState, seat: SeatIndex): Card | null {
  return v.yourKnowledge.find((k) => k.seat === seat)?.card ?? null;
}

/** P(seat holds rank r) from this seat's point of view. */
function probHolds(
  v: LoveLetterPublicState,
  unseen: Record<Rank, number>,
  seat: SeatIndex,
  r: Rank,
): number {
  const k = knownCard(v, seat);
  if (k !== null) return k === r ? 1 : 0;
  const total = RANKS.reduce((a, x) => a + unseen[x], 0);
  return total > 0 ? unseen[r] / total : 0;
}

function distribution(v: LoveLetterPublicState, unseen: Record<Rank, number>, seat: SeatIndex): Array<[Rank, number]> {
  return RANKS.map((r) => [r, probHolds(v, unseen, seat, r)] as [Rank, number]);
}

function opponents(v: LoveLetterPublicState, me: SeatIndex): PublicPlayer[] {
  return v.players.filter((p) => p.index !== me && !p.eliminated && !p.protected);
}

function bestGuard(
  v: LoveLetterPublicState,
  unseen: Record<Rank, number>,
  me: SeatIndex,
  rng: RngState,
): { target: SeatIndex; guess: Rank; p: number } | null {
  let best: { target: SeatIndex; guess: Rank; p: number } | null = null;
  for (const o of opponents(v, me)) {
    for (const r of RANKS) {
      if (r === 1) continue;
      const p = probHolds(v, unseen, o.index, r) + rngFloat(rng) * 0.01 + o.tokens * 0.002;
      if (!best || p > best.p) best = { target: o.index, guess: r, p };
    }
  }
  return best;
}

function baronOdds(v: LoveLetterPublicState, unseen: Record<Rank, number>, target: SeatIndex, mine: Card) {
  let win = 0;
  let lose = 0;
  for (const [r, p] of distribution(v, unseen, target)) {
    if (r < mine) win += p;
    else if (r > mine) lose += p;
  }
  return { win, lose };
}

function expectedCard(v: LoveLetterPublicState, unseen: Record<Rank, number>, seat: SeatIndex): number {
  return distribution(v, unseen, seat).reduce((a, [r, p]) => a + r * p, 0);
}

function bestBaronTarget(v: LoveLetterPublicState, unseen: Record<Rank, number>, me: SeatIndex, mine: Card, rng: RngState) {
  let best: { target: SeatIndex; score: number } | null = null;
  for (const o of opponents(v, me)) {
    const { win, lose } = baronOdds(v, unseen, o.index, mine);
    const score = win - lose + rngFloat(rng) * 0.01;
    if (!best || score > best.score) best = { target: o.index, score };
  }
  return best;
}

function bestPrinceTarget(v: LoveLetterPublicState, unseen: Record<Rank, number>, me: SeatIndex, rng: RngState) {
  let best: { target: SeatIndex; score: number } | null = null;
  for (const o of opponents(v, me)) {
    // Knock out a Princess if we can; otherwise disrupt the strongest hand.
    const score =
      probHolds(v, unseen, o.index, 8) * 10 +
      expectedCard(v, unseen, o.index) * 0.2 +
      o.tokens * 0.3 +
      rngFloat(rng) * 0.05;
    if (!best || score > best.score) best = { target: o.index, score };
  }
  return best;
}

function bestKingTarget(v: LoveLetterPublicState, unseen: Record<Rank, number>, me: SeatIndex, rng: RngState) {
  let best: { target: SeatIndex; score: number } | null = null;
  for (const o of opponents(v, me)) {
    const score = expectedCard(v, unseen, o.index) + rngFloat(rng) * 0.05;
    if (!best || score > best.score) best = { target: o.index, score };
  }
  return best;
}

function bestPriestTarget(v: LoveLetterPublicState, me: SeatIndex, rng: RngState) {
  let best: { target: SeatIndex; score: number } | null = null;
  for (const o of opponents(v, me)) {
    const score = (knownCard(v, o.index) === null ? 2 : 0) + o.tokens * 0.3 + rngFloat(rng) * 0.5;
    if (!best || score > best.score) best = { target: o.index, score };
  }
  return best;
}

// Score playing `card` while keeping `keep`.
function scorePlay(
  v: LoveLetterPublicState,
  unseen: Record<Rank, number>,
  me: SeatIndex,
  card: Card,
  keep: Card,
  rng: RngState,
): number {
  // Late in the round the kept card is what wins the showdown.
  const late = 1 - Math.min(1, v.deckRemaining / 11);
  const keepValue = keep * (0.15 + late * 0.6);
  const hasTargets = opponents(v, me).length > 0;
  let effect = 0;
  switch (card) {
    case 1: {
      const g = hasTargets ? bestGuard(v, unseen, me, rng) : null;
      effect = g ? g.p * 10 : 0;
      break;
    }
    case 2:
      effect = hasTargets ? 2.2 : 0.3;
      break;
    case 3: {
      const b = hasTargets ? bestBaronTarget(v, unseen, me, keep, rng) : null;
      effect = b ? b.score * 8 : 0.2;
      break;
    }
    case 4:
      effect = 2.6 + (keep >= 6 ? 2 : 0);
      break;
    case 5: {
      if (!hasTargets) {
        // Forced onto ourselves: we discard the kept card.
        effect = keep === 8 ? -100 : 1 - keep * 0.6;
      } else {
        const p = bestPrinceTarget(v, unseen, me, rng);
        effect = p ? Math.min(12, p.score) * 0.6 + 1 : 1;
      }
      break;
    }
    case 6: {
      if (!hasTargets) effect = 0.5;
      else if (keep === 8) effect = -25;
      else {
        const k = bestKingTarget(v, unseen, me, rng);
        effect = k ? (k.score - keep) * 0.7 - 0.6 : 0;
      }
      break;
    }
    case 7:
      effect = 0.8;
      break;
    case 8:
      effect = -1000;
      break;
  }
  return effect + keepValue + rngFloat(rng) * 0.4;
}

export function chooseFromView(v: LoveLetterPublicState, me: SeatIndex): LoveLetterAction | null {
  if (v.yourSeat !== me) return null;
  const rng = rngFor(v, me);
  switch (v.phase) {
    case 'roundStart':
      return v.yourAckPending ? { type: 'ackStart', bySeat: me } : null;
    case 'effectReveal':
      return v.yourAckPending ? { type: 'ackEffect', bySeat: me } : null;
    case 'priestReveal':
      return v.yourPriestPeek ? { type: 'ackPriest', bySeat: me } : null;
    case 'roundOver':
      return v.yourAckPending ? { type: 'ackRoundOver', bySeat: me } : null;
    case 'gameOver':
      return null;

    case 'turn': {
      if (v.currentSeat !== me) return null;
      const hand = v.yourHand;
      if (hand.length === 0) return null;
      if (hand.length === 1) return { type: 'playCard', bySeat: me, card: hand[0]! };
      const [c0, c1] = hand as [Card, Card];
      // Countess rule.
      if (hand.includes(7) && (hand.includes(5) || hand.includes(6))) {
        return { type: 'playCard', bySeat: me, card: 7 };
      }
      const unseen = unseenCounts(v);
      const s0 = scorePlay(v, unseen, me, c0, c1, rng);
      const s1 = scorePlay(v, unseen, me, c1, c0, rng);
      return { type: 'playCard', bySeat: me, card: s0 >= s1 ? c0 : c1 };
    }

    case 'guardTargeting': {
      if (v.currentSeat !== me) return null;
      const g = bestGuard(v, unseenCounts(v), me, rng);
      if (!g) return null;
      return { type: 'guardGuess', bySeat: me, target: g.target, guess: g.guess };
    }

    case 'priestTargeting': {
      if (v.currentSeat !== me) return null;
      const t = bestPriestTarget(v, me, rng);
      return t ? { type: 'chooseTarget', bySeat: me, target: t.target } : null;
    }

    case 'baronTargeting': {
      if (v.currentSeat !== me) return null;
      const mine = v.yourHand[0];
      if (mine === undefined) return null;
      const t = bestBaronTarget(v, unseenCounts(v), me, mine, rng);
      return t ? { type: 'chooseTarget', bySeat: me, target: t.target } : null;
    }

    case 'kingTargeting': {
      if (v.currentSeat !== me) return null;
      const t = bestKingTarget(v, unseenCounts(v), me, rng);
      return t ? { type: 'chooseTarget', bySeat: me, target: t.target } : null;
    }

    case 'princeTargeting': {
      if (v.currentSeat !== me) return null;
      const t = bestPrinceTarget(v, unseenCounts(v), me, rng);
      // Only Prince ourselves when nobody else is targetable.
      return { type: 'chooseTarget', bySeat: me, target: t ? t.target : me };
    }
  }
}
