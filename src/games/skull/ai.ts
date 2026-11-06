import { makeRng, rngFloat, rngInt, type RngState } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { SkullAction } from './actions';
import type { Disk, PublicPlayer, SkullPrivateState, SkullPublicState } from './state';
import { viewFor } from './view';

// ============================================================================
// Skull AI.
//
// FAIRNESS: the AI decides from `viewFor(state, seat)` only — its own stack
// and hand, plus public table state (stack sizes, disk counts, flips, the
// bid log). It cannot see which stacks hold skulls or whether an opponent
// still owns one. Randomness is a hash of the view (the seed is private).
//
// Heuristics:
//  - Knows exactly how many of its own disks are safe: the roses above its
//    top-most skull (it must flip its whole stack first).
//  - Bids up to "own safe disks + a cautious share of opponents' disks";
//    with a skull buried in its stack it bids at most the roses above it,
//    occasionally overbids as bait.
//  - Flips the opponent least likely to show a skull: bidders and openers
//    are trusted, early passers distrusted, deep stacks safer on top.
// ============================================================================

export function aiChooseAction(state: SkullPrivateState, seat: SeatIndex): SkullAction | null {
  if (!state.players[seat]) return null;
  return chooseFromView(viewFor(state, seat), seat);
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rngFor(v: SkullPublicState, me: SeatIndex): RngState {
  return makeRng(
    hashString(
      JSON.stringify([
        me,
        v.roundNumber,
        v.phase,
        v.currentBid,
        v.yourStack,
        v.players.map((p) => [p.stackSize, p.disksTotal, p.wins]),
        v.bidLog.length,
        v.flips.length,
        v.history.length,
      ]),
    ),
  );
}

/** Roses on top of my stack before my first skull (all of them if no skull). */
function safeOwn(stack: readonly Disk[]): number {
  let n = 0;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i] === 'skull') break;
    n++;
  }
  return n;
}

function tableTotal(v: SkullPublicState): number {
  return v.players.reduce((a, p) => a + p.stackSize, 0);
}

function opponentsWithDisks(v: SkullPublicState, me: SeatIndex): PublicPlayer[] {
  return v.players.filter((p) => p.index !== me && !p.eliminated && p.stackSize > 0);
}

// How many opponent disks I'd expect to flip safely, picking the most
// trustworthy stacks first.
function opponentSafeEstimate(v: SkullPublicState, me: SeatIndex): number {
  const scores = opponentsWithDisks(v, me)
    .map((p) => ({ p, risk: skullRisk(v, p) }))
    .sort((a, b) => a.risk - b.risk);
  let expected = 0;
  let survive = 1;
  for (const { p, risk } of scores) {
    // Flip this stack's disks one by one; risk per disk ≈ risk.
    for (let k = 0; k < p.stackSize; k++) {
      survive *= 1 - Math.min(0.9, risk * (1 + k * 0.4));
      expected += survive;
    }
  }
  return expected;
}

// Probability the TOP disk of `p`'s stack is a skull, from public signals.
function skullRisk(v: SkullPublicState, p: PublicPlayer): number {
  // Prior: they placed their skull this round.
  let hasSkull = 0.45;
  // They may have lost their skull to an earlier failed challenge.
  if (p.disksTotal < 4) hasSkull *= 0.75;
  const mine = v.bidLog.filter((b) => b.seat === p.index);
  const raised = mine.some((b) => b.bid !== 'pass');
  const passedFirst = mine.length > 0 && mine[0]!.bid === 'pass';
  if (raised) hasSkull *= 0.35;
  else if (passedFirst) hasSkull *= 1.25;
  if (p.index === v.roundLeader) hasSkull *= 0.9;
  hasSkull = Math.min(0.95, hasSkull);
  // Given a skull somewhere in a stack of n, the top is a bit more likely
  // than uniform (people bury roses and finish with the skull).
  const n = Math.max(1, p.stackSize);
  return hasSkull * Math.min(1, 1.25 / n);
}

function myCapacity(v: SkullPublicState, me: SeatIndex, rng: RngState): number {
  const stack = v.yourStack;
  const own = safeOwn(stack);
  if (own < stack.length) return own; // a skull of mine is in the way
  const est = opponentSafeEstimate(v, me);
  // Mild optimism noise so the AI isn't perfectly predictable.
  return stack.length + Math.floor(est * (0.75 + rngFloat(rng) * 0.4));
}

export function chooseFromView(v: SkullPublicState, me: SeatIndex): SkullAction | null {
  if (v.yourSeat !== me) return null;
  const rng = rngFor(v, me);
  const meP = v.players.find((p) => p.index === me);
  if (!meP) return null;
  const hand = v.yourRemaining;
  const table = tableTotal(v);

  switch (v.phase) {
    case 'placeOpening': {
      if (v.currentSeat !== me || meP.eliminated) return null;
      if (hand.roses === 0) return { type: 'placeDisk', bySeat: me, disk: 'skull' };
      const skull = hand.skulls > 0 && rngFloat(rng) < 0.22;
      return { type: 'placeDisk', bySeat: me, disk: skull ? 'skull' : 'rose' };
    }

    case 'placing': {
      if (v.currentSeat !== me || meP.eliminated) return null;
      const inHand = hand.roses + hand.skulls;
      const cap = myCapacity(v, me, rng);
      const hasSkullDown = safeOwn(v.yourStack) < v.yourStack.length;
      const alive = v.players.filter((p) => !p.eliminated).length;
      const r = rngFloat(rng);
      let wantBid = false;
      if (inHand === 0) wantBid = true;
      else if (cap >= 1) {
        const pressure = Math.max(0, table - alive);
        const p = hasSkullDown ? 0.18 + pressure * 0.06 : 0.25 + pressure * 0.15;
        wantBid = r < Math.min(0.85, p);
      }
      if (wantBid) {
        let bid: number;
        if (hasSkullDown) bid = Math.max(1, Math.min(cap, 1 + rngInt(rng, Math.max(1, cap))));
        else bid = Math.max(1, cap - (rngFloat(rng) < 0.5 ? 1 : 0));
        return { type: 'openBid', bySeat: me, bid: Math.max(1, Math.min(table, bid)) };
      }
      const skull = hand.skulls > 0 && !hasSkullDown && rngFloat(rng) < 0.3;
      if (skull || hand.roses === 0) return { type: 'placeDisk', bySeat: me, disk: 'skull' };
      return { type: 'placeDisk', bySeat: me, disk: 'rose' };
    }

    case 'bidding': {
      if (v.currentSeat !== me || v.passed[me] || v.currentBidder === me) return null;
      const raiseTo = v.currentBid + 1;
      if (raiseTo > table) return { type: 'passBid', bySeat: me };
      const cap = myCapacity(v, me, rng);
      const hasSkullDown = safeOwn(v.yourStack) < v.yourStack.length;
      const r = rngFloat(rng);
      if (raiseTo <= cap && r < 0.88) {
        const jump = raiseTo + 1 <= cap && raiseTo + 1 <= table && rngFloat(rng) < 0.2 ? 1 : 0;
        return { type: 'raiseBid', bySeat: me, bid: raiseTo + jump };
      }
      // Bait: nudge the bid up with a skull waiting, hoping someone else
      // takes the challenge. Risky, so rare and never near the cap.
      if (hasSkullDown && raiseTo <= table - 2 && r < 0.12) {
        return { type: 'raiseBid', bySeat: me, bid: raiseTo };
      }
      return { type: 'passBid', bySeat: me };
    }

    case 'revealing': {
      if (v.challenger !== me) return null;
      if (v.yourStack.length > 0) return { type: 'flipNext', bySeat: me };
      const opps = opponentsWithDisks(v, me);
      if (opps.length === 0) return null;
      let best: { seat: SeatIndex; risk: number } | null = null;
      for (const p of opps) {
        const risk = skullRisk(v, p) + rngFloat(rng) * 0.03;
        if (!best || risk < best.risk) best = { seat: p.index, risk };
      }
      return { type: 'flipNext', bySeat: me, fromSeat: best!.seat };
    }

    case 'discarding': {
      if (v.challenger !== me) return null;
      // Keep the skull while we still have roses to spare (it's our only
      // defence); with one rose left keep the rose so we can still win.
      if (hand.roses === 0) return { type: 'discardDisk', bySeat: me, disk: 'skull' };
      if (hand.skulls === 0 || hand.roses >= 2) return { type: 'discardDisk', bySeat: me, disk: 'rose' };
      return { type: 'discardDisk', bySeat: me, disk: 'skull' };
    }

    case 'chooseLeader': {
      if (v.challenger !== me) return null;
      const alive = v.players.filter((p) => !p.eliminated && p.index !== me);
      if (alive.length === 0) return null;
      // Hand the lead to whoever is furthest from winning.
      const fewest = Math.min(...alive.map((p) => p.wins));
      const pool = alive.filter((p) => p.wins === fewest);
      return { type: 'chooseLeader', bySeat: me, seat: pool[rngInt(rng, pool.length)]!.index };
    }

    case 'roundOver':
      return v.yourAckPending ? { type: 'ackRoundOver', bySeat: me } : null;

    case 'gameOver':
      return null;
  }
}
