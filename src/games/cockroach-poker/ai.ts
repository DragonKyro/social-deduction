import { makeRng, rngFloat } from '@/engine/rng';
import type { RngState } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { CockroachPokerAction } from './actions';
import { COPIES_PER_CREATURE, CREATURES, LOSING_ROW_COUNT } from './state';
import type { CockroachPokerPrivateState, CockroachPokerPublicState, Creature } from './state';
import { viewFor } from './view';

// ============================================================================
// Cockroach Poker AI.
//
// Fairness: decides from `viewFor(state, seat)` only. The in-transit card is
// known only if this seat has actually seen it (sent it, or peeked via the
// `peek` action); otherwise the AI estimates P(claim is true) from public
// rows and its own hand. The private seed is used only as an entropy source
// (hashed with seat / turn / chain length).
//
// Policy:
//  - Passing: shed a creature we're least exposed to, at the opponent most
//    exposed to it; tell the truth ~1/3 of the time.
//  - Holding an unseen card: compare the expected "damage" of calling true,
//    calling false, and peeking-and-passing (which still leaves us on the
//    hook if the next holder calls our new claim correctly).
//  - After peeking: pass to the unseen seat most exposed to the card.
// ============================================================================

const TRUTH_RATE = 0.36;

export function aiChooseAction(
  state: CockroachPokerPrivateState,
  seat: SeatIndex,
): CockroachPokerAction | null {
  if (!state.players[seat]) return null;
  const view = viewFor(state, seat);
  const rng = makeRng(
    mix(state.seed, seat, view.turnNumber, view.passChain.length, view.passHolderPeeked ? 1 : 0),
  );
  return decideFromView(view, rng);
}

/** Pure decision from a redacted view. Exported for fairness tests. */
export function decideFromView(view: CockroachPokerPublicState, rng: RngState): CockroachPokerAction | null {
  const seat = view.yourSeat;
  if (seat === null) return null;
  const me = view.players[seat];
  if (!me || me.lost) return null;

  switch (view.phase) {
    case 'dealPending':
    case 'revealing':
      if (!view.yourAckPending) return null;
      return view.phase === 'dealPending'
        ? { type: 'ackDeal', bySeat: seat }
        : { type: 'ackReveal', bySeat: seat };
    case 'gameOver':
      return null;
    case 'passing':
      if (view.currentSeat !== seat || view.yourHand.length === 0) return null;
      return choosePass(view, seat, rng);
    case 'decide':
      if (view.passHolder !== seat) return null;
      if (view.passHolderPeeked) return choosePassOn(view, seat, rng);
      return chooseDecision(view, seat, rng);
  }
}

/** How bad it is for `seat` to take a face-up `creature` (∞ if it loses). */
function damage(view: CockroachPokerPublicState, seat: SeatIndex, creature: Creature): number {
  const n = view.players[seat]!.row[creature];
  if (n + 1 >= LOSING_ROW_COUNT) return 100;
  return [1, 1.8, 4][n] ?? 4;
}

function opponents(view: CockroachPokerPublicState, seat: SeatIndex): SeatIndex[] {
  return view.players.filter((p) => !p.lost && p.index !== seat).map((p) => p.index);
}

function pick<T>(xs: readonly T[], rng: RngState): T {
  return xs[Math.floor(rngFloat(rng) * xs.length)]!;
}

/** A claim to make about `card` when passing to `target`. */
function chooseClaim(view: CockroachPokerPublicState, card: Creature, target: SeatIndex, rng: RngState): Creature {
  if (rngFloat(rng) < TRUTH_RATE) return card;
  // Lie: half the time name what the target fears most (a creature they
  // already collect), otherwise any other creature.
  const others = CREATURES.filter((c) => c !== card);
  if (rngFloat(rng) < 0.5) {
    const row = view.players[target]!.row;
    const feared = others.slice().sort((a, b) => row[b] - row[a])[0]!;
    if (row[feared] > 0) return feared;
  }
  return pick(others, rng);
}

/** The opponent most exposed to `card` among `candidates`, with jitter. */
function bestTarget(view: CockroachPokerPublicState, card: Creature, candidates: SeatIndex[], rng: RngState): SeatIndex {
  let best = candidates[0]!;
  let bestScore = -Infinity;
  for (const t of candidates) {
    const p = view.players[t]!;
    const total = CREATURES.reduce((n, c) => n + p.row[c], 0);
    const score = p.row[card] * 3 + total * 0.3 + rngFloat(rng) * 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

function choosePass(view: CockroachPokerPublicState, seat: SeatIndex, rng: RngState): CockroachPokerAction {
  // Shed the creature we're least exposed to (if it bounces back it hurts
  // least), preferring ones we hold several of. Jitter keeps it unreadable.
  const myRow = view.players[seat]!.row;
  let bestIdx = 0;
  let bestScore = -Infinity;
  view.yourHand.forEach((c, i) => {
    const held = view.yourHand.filter((x) => x === c).length;
    const score = -myRow[c] * 2 + held * 0.4 + rngFloat(rng) * 1.2;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });
  const card = view.yourHand[bestIdx]!;
  const target = bestTarget(view, card, opponents(view, seat), rng);
  return { type: 'startPass', bySeat: seat, handIndex: bestIdx, claim: chooseClaim(view, card, target, rng), target };
}

/** P(the in-transit card really is `claim`), from public info + own hand. */
export function pClaimTrue(view: CockroachPokerPublicState, claim: Creature): number {
  const faceUp = (c: Creature) => view.players.reduce((n, p) => n + p.row[c], 0);
  const mineInHand = (c: Creature) => view.yourHand.filter((x) => x === c).length;
  const copiesLeft = Math.max(0, COPIES_PER_CREATURE - faceUp(claim) - mineInHand(claim));
  if (copiesLeft === 0) return 0;
  let unknownTotal = 0;
  for (const c of CREATURES) unknownTotal += Math.max(0, COPIES_PER_CREATURE - faceUp(c) - mineInHand(c));
  // Scarcity scales the base truth rate: a creature with many unseen copies
  // is more plausibly what was passed.
  const scarcity = (copiesLeft / Math.max(1, unknownTotal)) * CREATURES.length;
  return Math.max(0.04, Math.min(0.88, TRUTH_RATE + 0.12 * (scarcity - 1)));
}

function chooseDecision(view: CockroachPokerPublicState, seat: SeatIndex, rng: RngState): CockroachPokerAction {
  const claim = view.passClaim!;
  const p = pClaimTrue(view, claim);
  const others = CREATURES.filter((c) => c !== claim);
  const avgOtherDamage = others.reduce((n, c) => n + damage(view, seat, c), 0) / others.length;
  const jitter = () => (rngFloat(rng) - 0.5) * 0.3;

  // Call "true": wrong when it isn't the claim → we take some other creature.
  const truthCost = (1 - p) * avgOtherDamage + jitter();
  // Call "false": wrong when it is the claim → we take the claimed creature.
  const lieCost = p * damage(view, seat, claim) + jitter();
  const options: Array<{ cost: number; action: CockroachPokerAction }> = [
    { cost: truthCost, action: { type: 'decide', bySeat: seat, call: 'truth' } },
    { cost: lieCost, action: { type: 'decide', bySeat: seat, call: 'lie' } },
  ];
  // Peek-and-pass: we learn the card and become the claimant, so we only
  // eat it if the next holder calls us correctly (~45%).
  const targets = opponents(view, seat).filter((i) => !view.passSeenBy.includes(i));
  if (targets.length > 0) {
    const expected = p * damage(view, seat, claim) + (1 - p) * avgOtherDamage;
    options.push({ cost: 0.45 * expected + 0.15 + jitter(), action: { type: 'peek', bySeat: seat } });
  }
  options.sort((a, b) => a.cost - b.cost);
  return options[0]!.action;
}

function choosePassOn(view: CockroachPokerPublicState, seat: SeatIndex, rng: RngState): CockroachPokerAction | null {
  const card = view.yourPeekedCard;
  const targets = opponents(view, seat).filter((i) => !view.passSeenBy.includes(i));
  if (card === null || targets.length === 0) return null; // engine never allows this
  const target = bestTarget(view, card, targets, rng);
  return { type: 'passOn', bySeat: seat, claim: chooseClaim(view, card, target, rng), target };
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
