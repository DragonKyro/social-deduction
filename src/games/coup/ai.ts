import { makeRng, rngFloat } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { CoupGameAction } from './actions';
import { CHARACTERS } from './characters';
import { legalTargets, mustCoup, STEAL_ACTIONS, validBlockersFor } from './rules';
import type { CoupCharacter, CoupPrivateState, CoupPublicState } from './state';
import { viewFor } from './view';

// ============================================================================
// Coup AI
//
// Fairness: the AI runs on the host and is handed the full private state,
// but the first thing it does is redact that state with `viewFor(state, seat)`
// (exactly what a human in that seat would receive) and decide from the view
// alone. It never sees opponents' face-down cards, the court deck, or the
// seed. The only thing derived from private state is a per-step random
// number stream, and the decision code only ever sees `rand()`.
//
// Liveness: the AI answers iff its seat is in `view.awaitingSeats` (the same
// list the reducer uses to close windows), and every action it builds is
// checked against the shared rule helpers, so it never stalls a solo game by
// returning an illegal move.
//
// Pure file: no DOM / no network / no store imports.
// ============================================================================

type Rand = () => number;

export function aiChooseAction(state: CoupPrivateState, seat: SeatIndex): CoupGameAction | null {
  const s = state.seats[seat];
  if (!s || s.eliminated || state.phase === 'gameOver') return null;
  const view = viewFor(state, seat);
  if (!view.awaitingSeats.includes(seat)) return null;
  const rng = makeRng(
    (state.seed ^ Math.imul(state.actionCount + 1, 0x9e3779b1) ^ Math.imul(seat + 1, 0x85ebca6b)) >>> 0,
  );
  return decide(view, seat, () => rngFloat(rng));
}

/** Decision core. Only ever sees one seat's redacted view. */
export function decide(view: CoupPublicState, me: SeatIndex, rand: Rand): CoupGameAction | null {
  const p = view.pending;
  switch (view.phase) {
    case 'turnStart':
      return chooseTurn(view, me, rand);
    case 'awaitingChallenge':
      if (!p?.claimedCharacter) return { type: 'pass', bySeat: me };
      return chooseChallenge(view, me, p.by, p.claimedCharacter, false, rand);
    case 'awaitingBlock':
      return chooseBlock(view, me, rand);
    case 'awaitingBlockChallenge':
      if (!p?.blocker) return { type: 'pass', bySeat: me };
      return chooseChallenge(view, me, p.blocker.by, p.blocker.character, true, rand);
    case 'loseInfluence':
    case 'targetSwapPick':
    case 'sellInfluencePick': {
      const idx = weakestCardIndex(view);
      if (idx === null) return null;
      if (view.phase === 'loseInfluence') return { type: 'pickInfluenceToLose', bySeat: me, cardIndex: idx };
      if (view.phase === 'targetSwapPick') return { type: 'targetSwapPick', bySeat: me, cardIndex: idx };
      return { type: 'sellInfluence', bySeat: me, cardIndex: idx };
    }
    case 'exchangePick':
      return chooseExchange(view, me);
    case 'spyPeek':
      return { type: 'ackPeek', bySeat: me };
    case 'pileOnWindow':
      // Joining is free and (house rule) unchallengeable; mostly join.
      return rand() < 0.85 ? { type: 'joinPileOn', bySeat: me } : { type: 'pass', bySeat: me };
    case 'chipInWindow': {
      const tgt = p?.target ?? null;
      if (tgt === null || view.seats[me]!.coins < 1) return { type: 'pass', bySeat: me };
      const leader = mostThreatening(view, me, livingOpponents(view, me));
      const join = (leader === tgt || threat(view, tgt) >= 7) && rand() < 0.65;
      return join ? { type: 'chipIn', bySeat: me } : { type: 'pass', bySeat: me };
    }
    default:
      return null;
  }
}

// ============================================================================
// Knowledge (from the view only)
// ============================================================================

function myHand(view: CoupPublicState): CoupCharacter[] {
  return view.yourInfluences.filter((i) => !i.revealed).map((i) => i.char);
}

function faceDownCount(view: CoupPublicState, seat: SeatIndex): number {
  return view.seats[seat]!.influences.filter((i) => !i.revealed).length;
}

function revealedCount(view: CoupPublicState, c: CoupCharacter): number {
  let n = 0;
  for (const s of view.seats) for (const inf of s.influences) if (inf.revealed && inf.char === c) n++;
  return n;
}

// Copies of `c` whose location I don't know (opponents' hands + deck).
function unknownCopies(view: CoupPublicState, c: CoupCharacter): number {
  if (!view.activeCharacters.includes(c)) return 0;
  const mine = myHand(view).filter((x) => x === c).length;
  return Math.max(0, 3 - revealedCount(view, c) - mine);
}

function unknownTotal(view: CoupPublicState): number {
  return view.activeCharacters.reduce((acc, c) => acc + unknownCopies(view, c), 0);
}

/** P(seat holds at least one `c`), hypergeometric over the unknown pool. */
function pHas(view: CoupPublicState, seat: SeatIndex, c: CoupCharacter): number {
  const n = faceDownCount(view, seat);
  const k = unknownCopies(view, c);
  const u = unknownTotal(view);
  if (n <= 0 || k <= 0 || u <= 0) return 0;
  let none = 1;
  for (let i = 0; i < n; i++) none *= Math.max(0, u - k - i) / (u - i);
  return 1 - none;
}

function livingOpponents(view: CoupPublicState, me: SeatIndex): SeatIndex[] {
  return view.seats.filter((s) => !s.eliminated && s.index !== me).map((s) => s.index);
}

function threat(view: CoupPublicState, seat: SeatIndex): number {
  const s = view.seats[seat]!;
  return s.coins + faceDownCount(view, seat) * 3;
}

function mostThreatening(view: CoupPublicState, _me: SeatIndex, pool: SeatIndex[]): SeatIndex | null {
  let best: SeatIndex | null = null;
  let bestScore = -Infinity;
  for (const s of pool) {
    const t = threat(view, s);
    if (t > bestScore) {
      bestScore = t;
      best = s;
    }
  }
  return best;
}

/** How much a card is worth holding, from this seat's point of view. */
function cardValue(c: CoupCharacter): number {
  const spec = CHARACTERS[c];
  let v = 0;
  const a = spec.action;
  if (a) {
    switch (a.effect) {
      case 'gainCoins':
        v = (a.amount ?? 3) + 1;
        break;
      case 'forceLoseInfluence':
      case 'protectedEliminate':
      case 'paramilitaryRiot':
        v = 4.5;
        break;
      case 'taxLevy':
      case 'mayorIncome':
      case 'lawyerSwing':
      case 'stealCoins':
      case 'customSteal':
        v = 3;
        break;
      case 'bishopBless':
      case 'plantationIncome':
      case 'pileOnIncome':
        v = 2.5;
        break;
      case 'exchange':
      case 'inquisitorExchange':
        v = 2;
        break;
      default:
        v = 1;
    }
  }
  for (const b of spec.blocks) v += b.blocks === 'assassinate' || b.blocks === 'coup' ? 2.5 : 1.5;
  return v;
}

function weakestCardIndex(view: CoupPublicState): 0 | 1 | null {
  let pick: number | null = null;
  let low = Infinity;
  view.yourInfluences.forEach((inf, i) => {
    if (inf.revealed) return;
    const v = cardValue(inf.char);
    if (v < low) {
      low = v;
      pick = i;
    }
  });
  return pick as 0 | 1 | null;
}

// ============================================================================
// Turn start
// ============================================================================

function chooseTurn(view: CoupPublicState, me: SeatIndex, rand: Rand): CoupGameAction | null {
  const self = view.seats[me]!;
  const targets = legalTargets(view, me);
  const best = mostThreatening(view, me, targets);

  if (mustCoup(view, me) && best !== null) {
    return { type: 'declareGeneral', bySeat: me, generalId: 'coup', target: best };
  }

  const hand = myHand(view);
  const myLives = hand.length;
  const opps = livingOpponents(view, me).length;
  const options: Array<{ action: CoupGameAction; score: number }> = [];

  options.push({ action: { type: 'declareGeneral', bySeat: me, generalId: 'income' }, score: 1 });

  const faBlockers = validBlockersFor(view.activeCharacters, view.ruleset, {
    kind: 'general',
    generalId: 'foreignAid',
    characterActionId: null,
  });
  const faRisk = faBlockers.length === 0 ? 0 : Math.min(0.9, 0.25 * opps);
  options.push({
    action: { type: 'declareGeneral', bySeat: me, generalId: 'foreignAid' },
    score: 2 * (1 - faRisk) + 0.3,
  });

  if (self.coins >= 7 && best !== null) {
    // In G54 a Coup below 10 coins can be blocked (Judge, Lawyer, ...); a
    // forced Coup at 10+ can't, so it's usually worth saving up.
    const coupBlockable =
      validBlockersFor(view.activeCharacters, view.ruleset, {
        kind: 'general',
        generalId: 'coup',
        characterActionId: null,
      }).length > 0;
    const score = coupBlockable
      ? 2.2
      : 5 + (faceDownCount(view, best) === 1 ? 1.5 : 0) + (self.coins >= 9 ? 2 : 0);
    options.push({ action: { type: 'declareGeneral', bySeat: me, generalId: 'coup', target: best }, score });
  }

  for (const c of view.activeCharacters) {
    const built = buildDeclare(view, me, c, rand);
    if (!built) continue;
    let score = built.score;
    if (!hand.includes(c)) {
      // Bluff: a fully revealed character is a guaranteed catch.
      if (revealedCount(view, c) >= 3) continue;
      const pCaught = 1 - Math.pow(1 - 0.22, opps);
      const lossCost = myLives >= 2 ? 3 : 9;
      score -= pCaught * lossCost;
    }
    options.push({ action: built.action, score });
  }

  // Remember blocks that held: don't keep paying for a strike the target
  // has already blocked (public events only).
  for (const o of options) {
    const a = o.action;
    if (a.type !== 'declareGeneral' && a.type !== 'declareCharacter') continue;
    const tgt = a.target;
    if (tgt === undefined || tgt === null) continue;
    const blockers = validBlockersFor(view.activeCharacters, view.ruleset, {
      kind: a.type === 'declareGeneral' ? 'general' : 'character',
      generalId: a.type === 'declareGeneral' ? a.generalId : null,
      characterActionId: a.type === 'declareCharacter' ? a.characterActionId : null,
      unblockable: false,
    });
    o.score -= 3 * Math.min(2, blocksAgainstMe(view, me, tgt, blockers));
  }

  // Noise mixes strategies so the AI isn't pattern-exploitable.
  let pick = options[0]!;
  let top = -Infinity;
  for (const o of options) {
    const s = o.score + rand() * 1.4;
    if (s > top) {
      top = s;
      pick = o;
    }
  }
  return pick.action;
}

// How many recent blocks by `seat` against me used one of `blockers` and
// were not exposed as bluffs.
function blocksAgainstMe(view: CoupPublicState, me: SeatIndex, seat: SeatIndex, blockers: CoupCharacter[]): number {
  let n = 0;
  view.events.forEach((e, i) => {
    if (e.kind !== 'block' || e.seat !== seat || e.against !== me || !blockers.includes(e.character)) return;
    const exposed = view.events
      .slice(i + 1)
      .some((x) => x.kind === 'challenge' && x.onBlock && x.claimer === seat && !x.honest);
    if (!exposed) n++;
  });
  return n;
}

// Build a legal declareCharacter for `c` (or null) with a heuristic score.
function buildDeclare(
  view: CoupPublicState,
  me: SeatIndex,
  c: CoupCharacter,
  rand: Rand,
): { action: CoupGameAction; score: number } | null {
  const spec = CHARACTERS[c];
  const a = spec.action;
  if (!a || !spec.implemented) return null;
  const self = view.seats[me]!;
  if (self.coins < a.cost) return null;
  const base = { type: 'declareCharacter' as const, bySeat: me, claimedCharacter: c, characterActionId: a.id };
  const targets = legalTargets(view, me);
  const opps = livingOpponents(view, me);

  switch (a.effect) {
    case 'gainCoins':
      return { action: base, score: (a.amount ?? 3) + (self.coins + (a.amount ?? 3) >= 7 ? 0.5 : 0) };
    case 'taxLevy':
      return { action: base, score: opps.filter((s) => view.seats[s]!.coins > 0).length };
    case 'mayorIncome':
      return { action: base, score: 2 };
    case 'lawyerSwing':
      return { action: base, score: 2.5 };
    case 'bishopBless':
      return { action: base, score: 1.8 };
    case 'plantationIncome':
      return { action: base, score: faceDownCount(view, me) };
    case 'pileOnIncome':
      return { action: base, score: (a.amount ?? 2) - 0.4 };
    case 'stealCoins':
    case 'customSteal': {
      const per = a.effect === 'customSteal' ? Math.min(self.coins, 5) : 2 + Math.min(3, self.tokens.weapons);
      let tgt: SeatIndex | null = null;
      let take = 0;
      for (const t of targets) {
        const got = Math.min(per, view.seats[t]!.coins);
        if (got > take) {
          take = got;
          tgt = t;
        }
      }
      if (tgt === null || take <= 0) return null;
      return { action: { ...base, target: tgt }, score: take * 1.3 };
    }
    case 'forceLoseInfluence':
    case 'protectedEliminate':
    case 'paramilitaryRiot': {
      const tgt = mostThreatening(view, me, targets);
      if (tgt === null) return null;
      const score = 5.5 + (faceDownCount(view, tgt) === 1 ? 1.5 : 0);
      if (a.id === 'mercenaryHire') {
        const partner = opps.find((s) => s !== tgt && view.seats[s]!.coins >= 1);
        if (partner === undefined) return null;
        return { action: { ...base, target: tgt, mercenaryPartner: partner }, score };
      }
      return { action: { ...base, target: tgt }, score };
    }
    case 'exchange':
      return { action: base, score: myHand(view).every((h) => cardValue(h) < 4) ? 2.2 : 1 };
    case 'inquisitorExchange':
      return { action: { ...base, inquisitorBranch: 'exchange' }, score: 1.2 };
    case 'spyPeek':
    case 'forceSwap': {
      if (targets.length === 0) return null;
      const tgt = targets[Math.floor(rand() * targets.length)]!;
      const slot = view.seats[tgt]!.influences.findIndex((i) => !i.revealed);
      if (slot === -1) return null;
      return {
        action: { ...base, target: tgt, inquisitorPeekCardIndex: slot as 0 | 1 },
        score: a.effect === 'spyPeek' ? 0.5 : 0.6,
      };
    }
    case 'peacekeeperShield':
      return { action: base, score: self.coins >= 5 ? 1.8 : 0.8 };
    case 'wealthRedistribute': {
      if (c === 'treasurer') {
        let tgt: SeatIndex | null = null;
        let gain = 0;
        for (const t of targets) {
          const g = Math.floor((view.seats[t]!.coins - self.coins) / 2);
          if (g > gain) {
            gain = g;
            tgt = t;
          }
        }
        return tgt === null ? null : { action: { ...base, target: tgt }, score: gain };
      }
      if (c === 'socialist') {
        const alive = view.seats.filter((s) => !s.eliminated);
        const avg = alive.reduce((acc, s) => acc + s.coins, 0) / alive.length;
        const gain = avg - self.coins;
        return gain > 0.5 ? { action: base, score: gain } : null;
      }
      return { action: base, score: 1 };
    }
    case 'armsDealerSell':
      return faceDownCount(view, me) >= 2 && self.coins + 4 >= 7 ? { action: base, score: 1.5 } : null;
    case 'chipInEliminate': {
      if (opps.length < 3) return null;
      const tgt = mostThreatening(view, me, targets);
      return tgt === null ? null : { action: { ...base, target: tgt }, score: 1.2 };
    }
    default:
      // priestRevive (blesses an opponent), foreignConsularTreaty: not worth it.
      return null;
  }
}

// ============================================================================
// Responses
// ============================================================================

function isStrikeOn(view: CoupPublicState, me: SeatIndex): boolean {
  const p = view.pending;
  if (!p || p.target !== me) return false;
  if (p.kind === 'general') return p.generalId === 'coup';
  const eff = p.claimedCharacter ? CHARACTERS[p.claimedCharacter].action?.effect : undefined;
  return (
    eff === 'forceLoseInfluence' ||
    eff === 'protectedEliminate' ||
    eff === 'paramilitaryRiot' ||
    eff === 'chipInEliminate'
  );
}

function chooseChallenge(
  view: CoupPublicState,
  me: SeatIndex,
  claimer: SeatIndex,
  claimed: CoupCharacter,
  onBlock: boolean,
  rand: Rand,
): CoupGameAction {
  const p = view.pending!;
  const pHonest = pHas(view, claimer, claimed);
  if (pHonest <= 0) return { type: 'challenge', bySeat: me };

  const lives = myHand(view).length;
  let threshold = 0.22;
  if (!onBlock && isStrikeOn(view, me)) {
    const blockers = p.validBlockers;
    const canBlockHonestly = blockers.some((b) => myHand(view).includes(b));
    // Facing elimination with nothing to block with: challenging is free-ish.
    threshold = canBlockHonestly ? 0.08 : lives <= 1 ? 0.6 : 0.38;
  } else {
    if (onBlock && p.by === me) threshold = 0.33;
    if (lives <= 1) threshold -= 0.08;
    const eff = CHARACTERS[claimed].action?.effect;
    if (!onBlock && eff === 'gainCoins' && view.seats[claimer]!.coins + 3 >= 7) threshold += 0.06;
  }
  const jitter = (rand() - 0.5) * 0.16;
  return pHonest < threshold + jitter ? { type: 'challenge', bySeat: me } : { type: 'pass', bySeat: me };
}

function chooseBlock(view: CoupPublicState, me: SeatIndex, rand: Rand): CoupGameAction {
  const p = view.pending!;
  const valid = p.validBlockers;
  if (valid.length === 0) return { type: 'pass', bySeat: me };
  const hand = myHand(view);
  const honest = valid.find((c) => hand.includes(c));
  if (honest) return { type: 'declareBlock', bySeat: me, character: honest };

  // Bluff-block: pick the most believable blocker.
  const believable = valid
    .filter((c) => revealedCount(view, c) < 3)
    .sort((a, b) => unknownCopies(view, b) - unknownCopies(view, a));
  if (believable.length === 0) return { type: 'pass', bySeat: me };
  const lives = hand.length;
  let bluffP = 0;
  const isSteal = p.kind === 'character' && p.characterActionId !== null && STEAL_ACTIONS.includes(p.characterActionId);
  if (isStrikeOn(view, me)) {
    bluffP = p.kind === 'general' ? 0.25 : lives <= 1 ? 0.7 : 0.4;
  } else if (isSteal) {
    bluffP = view.seats[me]!.coins > 0 ? 0.18 : 0;
  } else if (p.kind === 'general' && p.generalId === 'foreignAid') {
    bluffP = lives >= 2 ? 0.08 : 0;
  }
  return rand() < bluffP
    ? { type: 'declareBlock', bySeat: me, character: believable[0]! }
    : { type: 'pass', bySeat: me };
}

function chooseExchange(view: CoupPublicState, me: SeatIndex): CoupGameAction | null {
  const offer = view.yourExchangeOffer;
  if (!offer) return null;
  const order = offer.cards.map((c, i) => ({ i, c, v: cardValue(c) })).sort((a, b) => b.v - a.v);
  const keep: number[] = [];
  const keptChars: CoupCharacter[] = [];
  // Prefer two different characters (more claims you can make honestly).
  for (const o of order) {
    if (keep.length >= offer.keepCount) break;
    if (keptChars.includes(o.c)) continue;
    keep.push(o.i);
    keptChars.push(o.c);
  }
  for (const o of order) {
    if (keep.length >= offer.keepCount) break;
    if (!keep.includes(o.i)) keep.push(o.i);
  }
  return { type: 'exchangeReturn', bySeat: me, keepIndices: keep };
}
