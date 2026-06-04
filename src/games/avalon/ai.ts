import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { AvalonAction } from './actions';
import type {
  AvalonPrivateState,
  AvalonRoleId,
  AvalonSeatState,
} from './state';

// ============================================================================
// Avalon AI
//
// Plays both teams. We have access to the host's full private state, but we
// must only use what the seat's own viewFor would surface (own role + own
// role-knowledge list).
//
// Strategy:
//   - Good (Loyal Servant): pick teams of seats with lowest "evil suspicion".
//     Vote down a team containing a suspected evil. Always play success on
//     quests.
//   - Merlin: same as Loyal but uses known-evil set as the suspicion floor.
//     Tries NOT to be too obvious (mixes high/low suspects into picks).
//   - Percival: trusts both Merlin candidates as priors.
//   - Evil minions / Mordred / Morgana: vote up teams that put them on, fail
//     quests they're on (a single fail loses a quest — coordinate via team
//     composition, but no comms here, so just always fail unless we judge
//     a sandbag is needed). Vote up early teams to advance and learn.
//   - Oberon: doesn't know teammates. Plays evil heuristically — fails on
//     missions, suspects high-status seats.
//   - Assassin: shoots the highest-suspicion candidate for Merlin from the
//     evil's perspective.
//
// Pure file: no DOM / no net / no store imports.
// ============================================================================

function rngForSeat(state: AvalonPrivateState, seat: SeatIndex, salt: number): number {
  const rng = makeRng(
    (state.seed ^ (seat * 0x37c5) ^ (state.questHistory.length * 41) ^ (salt * 101)) >>> 0,
  );
  return rngInt(rng, 10000) / 10000;
}

function knownEvilsTo(state: AvalonPrivateState, seat: SeatIndex): Set<SeatIndex> {
  const me = state.seats[seat];
  if (!me) return new Set();
  const out = new Set<SeatIndex>();
  // Direct from role-knowledge labels.
  const knowledge = state.roleKnowledge[seat] ?? [];
  for (const k of knowledge) {
    // Anything we KNOW is evil. Labels include 'minion of mordred', 'morgana',
    // 'assassin', 'minionOrMorgana', etc. — anything labeled good is goodish.
    if (/evil|minion|morgana|mordred|assassin|oberon/i.test(k.label)) {
      out.add(k.seat);
    }
  }
  // Evil seats know other evils (except Oberon).
  if (me.alignment === 'evil' && me.role !== 'oberon') {
    for (const s of state.seats) {
      if (s.index !== seat && s.alignment === 'evil' && s.role !== 'oberon') {
        out.add(s.index);
      }
    }
  }
  return out;
}

function knownGoodTo(state: AvalonPrivateState, seat: SeatIndex): Set<SeatIndex> {
  const out = new Set<SeatIndex>();
  const me = state.seats[seat];
  if (!me) return out;
  if (me.role === 'percival') {
    // Percival knows Merlin or Morgana — both look like 'merlin-or-morgana'.
    // We can't distinguish; treat them as low priors of "evil" and slight prior
    // of "good".
    for (const k of state.roleKnowledge[seat] ?? []) {
      // Don't mark them good — uncertainty. Skipping is the right move.
      void k;
    }
  }
  return out;
}

// Suspicion is a function of:
//  - quest history: seats that have been on failed quests get + per fail
//  - known evils to us: maxed out
//  - randomness so two AIs don't pick the exact same team.
function suspicion(
  state: AvalonPrivateState,
  viewer: SeatIndex,
): Map<SeatIndex, number> {
  const out = new Map<SeatIndex, number>();
  for (const s of state.seats) out.set(s.index, 0);
  for (const q of state.questHistory) {
    if (q.result === 'fail') {
      for (const ts of q.team) {
        // A fail on a team of size N with K fails: each member contributes
        // K/N to suspicion in expectation.
        out.set(ts, (out.get(ts) ?? 0) + q.failCount / q.team.length);
      }
    }
  }
  for (const evil of knownEvilsTo(state, viewer)) {
    out.set(evil, (out.get(evil) ?? 0) + 10);
  }
  for (const good of knownGoodTo(state, viewer)) {
    out.set(good, (out.get(good) ?? 0) - 5);
  }
  // Add small per-seat jitter so two AIs don't always pick identical teams.
  for (const s of state.seats) {
    const j = (rngForSeat(state, viewer ^ s.index, 11) - 0.5) * 0.6;
    out.set(s.index, (out.get(s.index) ?? 0) + j);
  }
  // Viewer doesn't get a "self" score that matters for picking — set to 0.
  out.set(viewer, -1); // slightly prefer self as good
  return out;
}

function isEvilSeat(seat: AvalonSeatState): boolean {
  return seat.alignment === 'evil';
}

function teamApprove(state: AvalonPrivateState, seat: SeatIndex): boolean {
  const me = state.seats[seat]!;
  const team = state.proposedTeam;
  const sus = suspicion(state, seat);
  const r = rngForSeat(state, seat, 3);

  // 5th proposal — always approve to avoid the auto-evil-win.
  if (state.failedProposalsThisQuest >= 4) return true;

  if (isEvilSeat(me)) {
    // Evil: ja if at least one evil is on the team. (We KNOW our teammates
    // unless we're Oberon.)
    const evils = knownEvilsTo(state, seat);
    evils.add(seat); // we count
    const evilOnTeam = team.some((t) => evils.has(t));
    if (evilOnTeam) return true;
    // No evil on team = we want to fail this. But voting nein 100% gives us
    // away. Mix: 60% nein, 40% ja.
    return r < 0.4;
  }
  // Good: nein if a known-evil is on team; otherwise mostly ja.
  const evils = knownEvilsTo(state, seat);
  for (const t of team) {
    if (evils.has(t)) return false;
  }
  // Count high-suspicion members.
  const highSus = team.filter((t) => (sus.get(t) ?? 0) >= 1.0).length;
  if (highSus >= 2) return r < 0.25;
  if (highSus >= 1) return r < 0.55;
  return r < 0.9;
}

// Pick a team. Good picks lowest-suspicion N seats including self. Evil picks
// at least one evil if possible (the team leader has to put themselves on if
// they're evil).
function pickTeam(state: AvalonPrivateState, seat: SeatIndex): SeatIndex[] {
  const me = state.seats[seat]!;
  const spec = state.questTrack[state.currentQuestNumber - 1]!;
  const teamSize = spec.teamSize;
  const sus = suspicion(state, seat);
  const candidates = state.seats.map((s) => s.index);
  const sortedAsc = [...candidates].sort((a, b) => (sus.get(a) ?? 0) - (sus.get(b) ?? 0));
  if (isEvilSeat(me)) {
    // Put self on (you fail) + N-1 least-suspicious others.
    const team: SeatIndex[] = [seat];
    for (const s of sortedAsc) {
      if (team.length >= teamSize) break;
      if (team.includes(s)) continue;
      team.push(s);
    }
    return team.slice(0, teamSize);
  }
  // Good: pick the N least suspicious.
  return sortedAsc.slice(0, teamSize);
}

// Quest play: success unless we're evil. Evil considers a sandbag if there's
// already enough fails to fail anyway and concealing identity helps.
function questPlay(state: AvalonPrivateState, seat: SeatIndex): boolean {
  const me = state.seats[seat]!;
  if (me.alignment === 'good') return true;
  // Evil: always play fail. We could sandbag occasionally but with no comms
  // it's safer to ALWAYS fail (single fail loses quest in most cases).
  return false;
}

// Assassin's Merlin guess: pick the seat we think is Merlin. We use the
// quest history + proposal patterns. Merlin will avoid putting known-evils
// on teams, so a seat that consistently picks evil-free teams is suspect.
function assassinPick(state: AvalonPrivateState, seat: SeatIndex): SeatIndex {
  const knownEvils = knownEvilsTo(state, seat);
  knownEvils.add(seat);
  // Candidates: seats whose team-vote patterns look like they know who the
  // evils are. Compute "anti-evil score" — number of times this seat was on
  // a successful quest + voted ja on those teams.
  const scores: Map<SeatIndex, number> = new Map();
  for (const s of state.seats) {
    if (knownEvils.has(s.index)) continue;
    let score = 0;
    for (const q of state.questHistory) {
      if (q.result === 'success' && q.team.includes(s.index)) score += 1;
      if (q.result === 'fail' && q.team.includes(s.index)) score -= 2;
    }
    scores.set(s.index, score);
  }
  let best: SeatIndex | null = null;
  let bestScore = -Infinity;
  for (const [s, sc] of scores) {
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  if (best !== null) return best;
  // Fallback: lowest-index non-evil.
  for (const s of state.seats) {
    if (!knownEvils.has(s.index)) return s.index;
  }
  return state.seats[0]!.index;
}

// =============================================================================
// Top-level
// =============================================================================

export function aiChooseAction(
  state: AvalonPrivateState,
  seat: SeatIndex,
): AvalonAction | null {
  switch (state.phase) {
    case 'setup': {
      if (state.setupAcked[seat]) return null;
      return { type: 'ackRoleReveal', bySeat: seat };
    }

    case 'teamProposal': {
      if (seat !== state.currentLeaderSeat) return null;
      const team = pickTeam(state, seat);
      return { type: 'proposeTeam', bySeat: seat, team };
    }

    case 'teamVote': {
      if (state.seats[seat]!.voteApprove !== null) return null;
      return { type: 'castTeamVote', bySeat: seat, approve: teamApprove(state, seat) };
    }

    case 'teamVoteReveal': {
      // First alive seat acks (action doesn't carry bySeat in this case).
      if (seat !== 0) return null;
      return { type: 'ackTeamVoteReveal' };
    }

    case 'questExecution': {
      if (!state.proposedTeam.includes(seat)) return null;
      if (state.seats[seat]!.questCard !== null) return null;
      return { type: 'playQuestCard', bySeat: seat, success: questPlay(state, seat) };
    }

    case 'questResolution': {
      if (seat !== 0) return null;
      return { type: 'ackQuestResolution' };
    }

    case 'assassinPick': {
      const assassin = state.seats.find((s) => s.role === 'assassin');
      if (!assassin || assassin.index !== seat) return null;
      return { type: 'assassinateMerlin', bySeat: seat, target: assassinPick(state, seat) };
    }

    case 'gameOver':
      return null;

    // Optional modules — scaffolded; module doesn't drive them yet.
    case 'ladyOfTheLake':
    case 'excaliburAssign':
    case 'excaliburUse':
      return null;
  }
  void seat;
  void ({} as AvalonRoleId);
  return null;
}
