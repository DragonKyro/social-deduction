import { makeRng, rngFloat } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { AvalonAction } from './actions';
import type { AvalonPrivateState, AvalonPublicState } from './state';
import { viewFor } from './view';

// ============================================================================
// Avalon AI
//
// FAIRNESS: the host hands us the full private state, but every decision is
// made from `viewFor(state, seat)` — exactly what a human in that seat sees:
// own role/alignment, own row of the knowledge table, own vote and quest card,
// plus the public board (roles in play, quest results as fail COUNTS, the
// public vote log). The only other thing read from the private state is the
// match seed, used purely as a source of randomness (mixed with seat + game
// progress), never to recompute the deal.
//
// Model: "possible worlds". A seat enumerates every set of evil seats that is
// consistent with what it knows (≤ C(10,4) = 210 sets), hard-filtered by quest
// fail counts (a quest with k fails had ≥ k evils) and soft-weighted by
// behaviour (evils who hid on a quest, evils approving clean teams / rejecting
// dirty ones, evil leaders sending clean teams). From that:
//   P(seat is evil), and P(team is clean).
//
//   - Good leader: self + least likely evils. Good voter: approve a team that's
//     nearly as clean as the one they'd pick; always approve the 5th proposal.
//   - Merlin: knows the truth but votes "like a servant" a fair share of the
//     time so the Assassin can't just read his votes; follows the truth more
//     when the game is on the line. Leads with clean, publicly-trusted teams.
//   - Percival: exactly one of his Merlin/Morgana pair is evil (if Morgana is
//     in play) — a constraint, not "both are evil".
//   - Evil (not Oberon): approve teams with a known evil aboard, sometimes
//     approve clean ones to blend in. Fail quests; on 1-fail quests only the
//     lowest-seat known evil fails (they see each other: coordination without
//     a channel) to avoid incriminating double fails. Occasionally sandbag
//     quest 1. Leads with self + the seats the table trusts most.
//   - Oberon: knows no one; fails whenever on a quest.
//   - Assassin: scores candidates on how "Merlin-like" their public behaviour
//     was against the evils the Assassin knows.
//
// Seatless "Continue" acks (ackTeamVoteReveal / ackQuestResolution) are NOT
// the AI's to make: they're host controls, so humans get to watch the reveal.
// Returns null whenever this seat has nothing to do.
//
// Pure file: no DOM / no net / no store imports.
// ============================================================================

const EVIL_LABEL = 'Evil';

const EVIL_ROLES = new Set(['assassin', 'morgana', 'mordred', 'oberon', 'minionOfMordred']);

interface Ctx {
  view: AvalonPublicState;
  me: SeatIndex;
  n: number;
  evilCount: number;
  /** Seats this seat KNOWS are evil (its knowledge table; never Percival's pair). */
  knownEvil: Set<SeatIndex>;
  /** Deterministic per-decision random in [0, 1). */
  rand: (salt: number) => number;
}

function makeCtx(state: AvalonPrivateState, view: AvalonPublicState, me: SeatIndex): Ctx {
  const knownEvil = new Set<SeatIndex>();
  for (const k of view.yourRoleKnowledge) {
    if (k.label === EVIL_LABEL) knownEvil.add(k.seat);
  }
  const progress =
    view.questHistory.length * 977 + view.proposalHistory.length * 131 + view.failedProposalsThisQuest * 17;
  return {
    view,
    me,
    n: view.seats.length,
    evilCount: view.rolesInPlay.filter((r) => EVIL_ROLES.has(r)).length,
    knownEvil,
    rand: (salt: number) =>
      rngFloat(
        makeRng(
          (state.seed ^
            Math.imul(me + 1, 0x9e3779b1) ^
            Math.imul(progress + 1, 0x85ebca6b) ^
            Math.imul(salt + 1, 0x27d4eb2f)) >>>
            0,
        ),
      ),
  };
}

const isEvilMe = (ctx: Ctx) => ctx.view.yourAlignment === 'evil';
const inPlay = (ctx: Ctx, role: string) => ctx.view.rolesInPlay.some((r) => r === role);

/** Evil seats this seat can name for sure (itself included when evil). */
function evilTeam(ctx: Ctx): Set<SeatIndex> {
  const out = new Set(ctx.knownEvil);
  if (isEvilMe(ctx)) out.add(ctx.me);
  return out;
}

// ----------------------------------------------------------------------------
// Possible-worlds belief
// ----------------------------------------------------------------------------

interface Belief {
  pEvil: number[];
  pClean: (team: SeatIndex[]) => number;
}

type Perspective = 'self' | 'public' | 'servant';

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/**
 * Belief over evil sets.
 *  - 'self':    everything this seat knows (good seats only).
 *  - 'servant': as a Loyal Servant in this chair would see it (just "I'm good").
 *  - 'public':  what the table at large can infer (no private knowledge) —
 *               what evils use to look trustworthy.
 */
function belief(ctx: Ctx, perspective: Perspective): Belief {
  const { view, me, n, evilCount } = ctx;
  const bit = (s: SeatIndex) => 1 << s;
  let mustEvil = 0;
  let mustGood = 0;
  let pairMask = 0; // Percival: exactly `pairEvil` of these are evil
  let pairEvil = -1;
  if (perspective !== 'public') mustGood |= bit(me);
  if (perspective === 'self') {
    for (const e of ctx.knownEvil) mustEvil |= bit(e);
    if (view.yourRole === 'merlin' && !inPlay(ctx, 'mordred')) {
      // Merlin sees every evil when Mordred is absent.
      mustGood |= ((1 << n) - 1) & ~mustEvil;
    }
    if (view.yourRole === 'percival') {
      for (const k of view.yourRoleKnowledge) pairMask |= bit(k.seat);
      pairEvil = inPlay(ctx, 'morgana') ? 1 : 0;
    }
  }

  const masks: number[] = [];
  const weights: number[] = [];
  let total = 0;
  const all = (1 << n) - 1;
  for (let m = 0; m <= all; m++) {
    if (popcount(m) !== evilCount) continue;
    if ((m & mustEvil) !== mustEvil || (m & mustGood) !== 0) continue;
    if (pairEvil >= 0 && popcount(m & pairMask) !== pairEvil) continue;
    let w = 1;
    let ok = true;
    for (const q of view.questHistory) {
      let onTeam = 0;
      for (const t of q.team) if (m & bit(t)) onTeam++;
      if (onTeam < q.failCount) {
        ok = false;
        break;
      }
      // Evils who played success instead of failing: possible, less likely.
      w *= Math.pow(0.45, onTeam - q.failCount);
    }
    if (!ok) continue;
    for (const p of view.proposalHistory) {
      let dirty = false;
      for (const t of p.team) if (m & bit(t)) dirty = true;
      p.votes.forEach((v, s) => {
        if (!(m & bit(s))) return;
        if (v && !dirty) w *= 0.8; // evil approving a clean team
        if (!v && dirty) w *= 0.75; // evil rejecting a team with evil on it
      });
      if (m & bit(p.leader) && !dirty) w *= 0.8; // evil leader sending a clean team
    }
    masks.push(m);
    weights.push(w);
    total += w;
  }

  const pEvil = new Array<number>(n).fill(evilCount / n);
  if (total > 0) {
    pEvil.fill(0);
    masks.forEach((m, i) => {
      for (let s = 0; s < n; s++) if (m & bit(s)) pEvil[s]! += weights[i]! / total;
    });
  }
  return {
    pEvil,
    pClean: (team) => {
      if (total <= 0) return 0.5;
      let tm = 0;
      for (const t of team) tm |= bit(t);
      let clean = 0;
      masks.forEach((m, i) => {
        if ((m & tm) === 0) clean += weights[i]!;
      });
      return clean / total;
    },
  };
}

function rankAsc(ctx: Ctx, score: number[], salt: number): SeatIndex[] {
  const jitter = score.map((_, s) => (ctx.rand(salt + s) - 0.5) * 0.04);
  return ctx.view.seats
    .map((s) => s.index)
    .sort((a, b) => score[a]! + jitter[a]! - (score[b]! + jitter[b]!) || a - b);
}

function teamSize(ctx: Ctx): number {
  return ctx.view.questTrack[ctx.view.currentQuestNumber - 1]!.teamSize;
}

function goodPickTeam(ctx: Ctx, b: Belief): SeatIndex[] {
  const order = rankAsc(ctx, b.pEvil, 100).filter((s) => s !== ctx.me);
  return [ctx.me, ...order].slice(0, teamSize(ctx)).sort((a, c) => a - c);
}

// ----------------------------------------------------------------------------
// Decisions
// ----------------------------------------------------------------------------

function pickTeam(ctx: Ctx): SeatIndex[] {
  const { view, me } = ctx;
  const size = teamSize(ctx);
  const spec = view.questTrack[view.currentQuestNumber - 1]!;

  if (isEvilMe(ctx)) {
    // Look clean to the table: self + the seats the PUBLIC trusts most,
    // skipping fellow evils unless the quest needs two fails.
    const evil = evilTeam(ctx);
    const order = rankAsc(ctx, belief(ctx, 'public').pEvil, 200);
    const team: SeatIndex[] = [me];
    if (spec.failsRequired >= 2) {
      const partner = order.find((s) => evil.has(s) && s !== me);
      if (partner !== undefined) team.push(partner);
    }
    for (const s of order) {
      if (team.length >= size) break;
      if (!team.includes(s) && !evil.has(s)) team.push(s);
    }
    for (const s of order) {
      if (team.length >= size) break;
      if (!team.includes(s)) team.push(s);
    }
    return team.sort((a, b) => a - b);
  }

  if (view.yourRole === 'merlin') {
    // Clean team, ordered by what the table already trusts (so the pick looks
    // explainable from public evidence).
    const pub = belief(ctx, 'servant').pEvil;
    const order = rankAsc(ctx, pub, 300).filter((s) => s !== me && !ctx.knownEvil.has(s));
    return [me, ...order].slice(0, size).sort((a, b) => a - b);
  }
  return goodPickTeam(ctx, belief(ctx, 'self'));
}

function servantVote(ctx: Ctx, b: Belief, salt: number): boolean {
  const team = ctx.view.proposedTeam;
  const pc = b.pClean(team);
  const best = b.pClean(goodPickTeam(ctx, b));
  if (pc >= 0.85) return true;
  const slack = 0.72 + (ctx.rand(salt) - 0.5) * 0.2;
  return pc >= best * slack;
}

function decideVote(ctx: Ctx): boolean {
  const { view } = ctx;
  const team = view.proposedTeam;
  const lastChance = view.failedProposalsThisQuest >= 4;
  const evilQuestWins = view.questHistory.filter((q) => q.result === 'fail').length;
  const goodQuestWins = view.questHistory.filter((q) => q.result === 'success').length;

  if (isEvilMe(ctx)) {
    const evil = evilTeam(ctx);
    const evilAboard = team.some((t) => evil.has(t));
    const r = ctx.rand(3);
    if (evilAboard) return lastChance || r < 0.9;
    // A clean team is bad news, but rejecting everything clean is a tell.
    if (goodQuestWins >= 2) return false; // can't afford it
    return r < (lastChance ? 0.5 : 0.35);
  }

  if (lastChance) return true;
  if (view.yourRole === 'merlin') {
    const truthClean = !team.some((t) => ctx.knownEvil.has(t));
    const disguise = servantVote(ctx, belief(ctx, 'servant'), 4);
    if (disguise === truthClean) return truthClean;
    // Disagreement: the truth wins more often when the game is on the line.
    const critical = evilQuestWins >= 2 || view.failedProposalsThisQuest >= 3;
    return ctx.rand(5) < (critical ? 0.9 : 0.6) ? truthClean : disguise;
  }
  return servantVote(ctx, belief(ctx, 'self'), 4);
}

function decideQuestCard(ctx: Ctx): boolean {
  const { view, me } = ctx;
  if (!isEvilMe(ctx)) return true; // good MUST play success
  const spec = view.questTrack[view.currentQuestNumber - 1]!;
  if (view.yourRole === 'oberon') return false; // can't coordinate; always fail
  const evil = evilTeam(ctx);
  const evilOnTeam = view.proposedTeam.filter((t) => evil.has(t));
  const evilQuestWins = view.questHistory.filter((q) => q.result === 'fail').length;
  const goodQuestWins = view.questHistory.filter((q) => q.result === 'success').length;
  if (spec.failsRequired >= 2) {
    // Everyone fails when the bar is reachable; a lone evil mostly stays
    // hidden (a single fail wouldn't sink the quest anyway).
    if (evilOnTeam.length >= spec.failsRequired) return false;
    return ctx.rand(9) >= 0.3;
  }
  // 1-fail quest: only the lowest-seat known evil fails (no double fails).
  if (Math.min(...evilOnTeam) !== me) return true;
  // Must-fail situations: this quest wins it, or loses it.
  if (evilQuestWins >= 2 || goodQuestWins >= 2) return false;
  // Sandbag quest 1 now and then to build trust.
  if (view.currentQuestNumber === 1 && ctx.rand(5) < 0.25) return true;
  return false;
}

function pickMerlin(ctx: Ctx): SeatIndex {
  const { view, me } = ctx;
  const evil = evilTeam(ctx);
  const dirty = (team: SeatIndex[]) => team.some((t) => evil.has(t));
  let best: SeatIndex | null = null;
  let bestScore = -Infinity;
  for (const s of view.seats) {
    if (s.index === me || evil.has(s.index)) continue;
    let score = (ctx.rand(400 + s.index) - 0.5) * 0.6;
    for (const p of view.proposalHistory) {
      const d = dirty(p.team);
      const v = p.votes[s.index];
      const onTeam = p.team.includes(s.index);
      // Rejecting a dirty team you're NOT on is the classic Merlin tell.
      if (d) score += v ? -0.6 : onTeam ? 0.4 : 1;
      else score += v ? 0.2 : -0.4;
      if (p.leader === s.index) score += d ? -1.2 : 0.4;
    }
    if (score > bestScore) {
      best = s.index;
      bestScore = score;
    }
  }
  // Fallback (shouldn't happen: good always outnumbers evil).
  return best ?? view.seats.find((s) => s.index !== me)!.index;
}

// =============================================================================
// Top-level
// =============================================================================

export function aiChooseAction(state: AvalonPrivateState, seat: SeatIndex): AvalonAction | null {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.seats.length) return null;
  const view = viewFor(state, seat);
  const mine = view.seats[seat]!;
  const ctx = () => makeCtx(state, view, seat);

  switch (view.phase) {
    case 'setup':
      return mine.hasAckedSetup ? null : { type: 'ackRoleReveal', bySeat: seat };

    case 'teamProposal':
      if (view.currentLeaderSeat !== seat) return null;
      return { type: 'proposeTeam', bySeat: seat, team: pickTeam(ctx()) };

    case 'teamVote':
      if (view.yourVote !== null || mine.hasVoted) return null;
      return { type: 'castTeamVote', bySeat: seat, approve: decideVote(ctx()) };

    case 'questExecution':
      if (!view.proposedTeam.includes(seat) || view.yourQuestCard !== null) return null;
      return { type: 'playQuestCard', bySeat: seat, success: decideQuestCard(ctx()) };

    case 'assassinPick':
      if (view.yourRole !== 'assassin') return null;
      return { type: 'assassinateMerlin', bySeat: seat, target: pickMerlin(ctx()) };

    // Host-only "Continue" controls, the end, and the scaffolded modules.
    case 'teamVoteReveal':
    case 'questResolution':
    case 'gameOver':
    case 'ladyOfTheLake':
    case 'excaliburAssign':
    case 'excaliburUse':
      return null;
  }
}
