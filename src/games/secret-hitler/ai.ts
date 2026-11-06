import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { ShAction } from './actions';
import { eligibleChancellors, SHARED_ACK_PHASES } from './rules';
import type { ShPolicy, ShPrivateState, ShPublicState } from './state';
import { HITLER_CHANCELLOR_THRESHOLD, LIBERAL_TRACK_LENGTH } from './tracks';
import { viewFor } from './view';

// ============================================================================
// Secret Hitler AI
//
// FAIRNESS: the AI decides from `viewFor(state, seat)` — the exact redacted
// view a human in that seat would get — and never reads roles, hands, the
// deck or other seats' investigation results from the private state. The
// only other private input is `state.seed`, used purely as an entropy source
// for the AI's own coin flips (it is never used to reconstruct the deal).
// The redaction test suite checks this by permuting hidden information and
// asserting the AI's choice doesn't change.
//
// Strategy outline (heuristic, with randomised mixing so it isn't trivially
// readable):
//   - Liberals: enact liberal policies, distrust governments that enacted
//     fascist policies, fear untested chancellors once Hitler can win by
//     election, investigate / execute the most suspicious seat.
//   - Fascists: know their team (and Hitler); pass fascist policies when
//     they can get away with it, back team governments, push Hitler into the
//     chancellorship once 3 fascist policies are down, never shoot a
//     teammate.
//   - Hitler: plays like a cautious liberal to build trust; at small tables
//     it knows its fascist and leans on them.
//
// Pure file: no DOM / no net / no store imports.
// ============================================================================

type Rand = (salt: number) => number;

function makeRand(state: ShPrivateState, seat: SeatIndex): Rand {
  const base = (state.seed ^ Math.imul(seat + 1, 0x5a17_9e37) ^ Math.imul(state.log.length + 1, 0x2c1b_3c6d)) >>> 0;
  return (salt: number) => {
    const rng = makeRng((base ^ Math.imul(salt + 1, 0x27d4_eb2f)) >>> 0);
    return rngInt(rng, 1_000_000) / 1_000_000;
  };
}

export function aiChooseAction(state: ShPrivateState, seat: SeatIndex): ShAction | null {
  if (!state.seats[seat]) return null;
  return decide(viewFor(state, seat), makeRand(state, seat));
}

// ---------------------------------------------------------------------------
// Knowledge derived from the view
// ---------------------------------------------------------------------------

interface Mind {
  v: ShPublicState;
  me: SeatIndex;
  fascistTeam: boolean;
  isHitler: boolean;
  /** Teammates this seat KNOWS (fascists see Hitler; small-table Hitler sees fascists). */
  allies: Set<SeatIndex>;
  hitler: SeatIndex | null;
  /** Higher = more likely fascist, from this seat's point of view. */
  sus: Map<SeatIndex, number>;
  /** Chancellors elected after 3+ fascist policies without the game ending. */
  notHitler: Set<SeatIndex>;
  rand: Rand;
}

function buildMind(v: ShPublicState, rand: Rand): Mind | null {
  const me = v.yourSeat;
  if (me === null || v.yourRole === null) return null;
  const fascistTeam = v.yourParty === 'fascist';
  const allies = new Set<SeatIndex>();
  let hitler: SeatIndex | null = v.yourRole === 'hitler' ? me : null;
  for (const k of v.yourPartyKnowledge) {
    allies.add(k.seat);
    if (k.role === 'hitler') hitler = k.seat;
  }

  const sus = new Map<SeatIndex, number>();
  for (const s of v.seats) if (s.index !== me) sus.set(s.index, 0);
  const bump = (s: SeatIndex, d: number) => {
    if (sus.has(s)) sus.set(s, (sus.get(s) ?? 0) + d);
  };

  const notHitler = new Set<SeatIndex>();
  // Policies already on the board before the first logged one (the
  // rebalanced-6p variant starts with one).
  let fascistSoFar =
    v.board.fascistEnacted -
    v.log.filter(
      (e) => (e.kind === 'policyEnacted' || e.kind === 'topDeckEnacted') && e.policy === 'fascist',
    ).length;
  let lastGov: { votes: Array<'ja' | 'nein' | null> } | null = null;
  for (const e of v.log) {
    switch (e.kind) {
      case 'electionResult':
        if (e.approved) {
          lastGov = e;
          if (fascistSoFar >= HITLER_CHANCELLOR_THRESHOLD) notHitler.add(e.chancellor);
        }
        break;
      case 'policyEnacted':
        if (e.policy === 'fascist') {
          bump(e.president, 1);
          bump(e.chancellor, 1.4);
          if (lastGov) lastGov.votes.forEach((vote, i) => vote === 'ja' && bump(i, 0.15));
        } else {
          bump(e.president, -0.5);
          bump(e.chancellor, -0.7);
        }
        lastGov = null;
        fascistSoFar += e.policy === 'fascist' ? 1 : 0;
        break;
      case 'topDeckEnacted':
        fascistSoFar += e.policy === 'fascist' ? 1 : 0;
        break;
      case 'vetoUsed':
        lastGov = null;
        break;
      default:
        break;
    }
  }

  for (const inv of v.yourInvestigations) bump(inv.target, inv.party === 'fascist' ? 8 : -5);
  // Fascists rate their own team as "fascist" so liberal-looking logic still
  // works when reused; callers check `allies` explicitly where it matters.
  for (const a of allies) bump(a, 10);

  return {
    v,
    me,
    fascistTeam,
    isHitler: v.yourRole === 'hitler',
    allies,
    hitler,
    sus,
    notHitler,
    rand,
  };
}

function susOf(m: Mind, s: SeatIndex): number {
  return m.sus.get(s) ?? 0;
}

/** Pick the candidate with the lowest (or highest) score, with a little jitter. */
function pickBy(
  m: Mind,
  candidates: SeatIndex[],
  score: (s: SeatIndex) => number,
  salt: number,
  lowest = true,
): SeatIndex | null {
  if (candidates.length === 0) return null;
  let best: SeatIndex | null = null;
  let bestVal = Infinity;
  for (const c of candidates) {
    const jitter = m.rand(salt * 31 + c) * 0.6;
    const val = (lowest ? score(c) : -score(c)) + jitter;
    if (val < bestVal) {
      bestVal = val;
      best = c;
    }
  }
  return best;
}

function alive(m: Mind): SeatIndex[] {
  return m.v.seats.filter((s) => s.alive).map((s) => s.index);
}

function count(hand: readonly ShPolicy[], p: ShPolicy): number {
  return hand.filter((x) => x === p).length;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export function decide(v: ShPublicState, rand: Rand): ShAction | null {
  const m = buildMind(v, rand);
  if (!m) return null;
  const me = m.me;
  const mySeat = v.seats[me]!;

  // Shared reveal screens: leave them for a human to dismiss so people can
  // read the result. Only an all-AI table dismisses them itself.
  if (SHARED_ACK_PHASES.has(v.phase)) {
    if (!v.seats.every((s) => s.isAI)) return null;
    const firstAlive = v.seats.find((s) => s.alive)?.index ?? 0;
    if (me !== firstAlive) return null;
    if (v.phase === 'electionReveal') return { type: 'ackElectionReveal', bySeat: me };
    if (v.phase === 'policyReveal') return { type: 'ackPolicyReveal', bySeat: me };
    return { type: 'ackTopDeckReveal', bySeat: me };
  }

  if (v.phase === 'setup') {
    return mySeat.hasAckedSetup ? null : { type: 'ackRoleReveal', bySeat: me };
  }
  if (!mySeat.alive) return null;

  const isPresident = me === v.presidentSeat;
  switch (v.phase) {
    case 'nomination': {
      if (!isPresident) return null;
      const chancellor = chooseChancellor(m);
      return chancellor === null ? null : { type: 'nominateChancellor', bySeat: me, chancellor };
    }
    case 'electionVote': {
      if (mySeat.hasVoted) return null;
      return { type: 'castVote', bySeat: me, vote: voteJa(m) ? 'ja' : 'nein' };
    }
    case 'legislativePresident': {
      const hand = v.yourLegislativeHand;
      if (!isPresident || !hand || hand.length !== 3) return null;
      return { type: 'presidentDiscard', bySeat: me, discardIndex: chooseDiscard(m, hand) };
    }
    case 'legislativeChancellor': {
      const hand = v.yourLegislativeHand;
      if (me !== v.chancellorCandidateSeat || !hand || hand.length !== 2) return null;
      if (wantsVeto(m, hand)) return { type: 'chancellorRequestVeto', bySeat: me };
      return { type: 'chancellorEnact', bySeat: me, enactIndex: chooseEnact(m, hand) };
    }
    case 'vetoRequested': {
      if (!isPresident) return null;
      return { type: 'presidentRespondVeto', bySeat: me, accept: acceptVeto(m) };
    }
    case 'execInvestigate': {
      if (!isPresident) return null;
      const candidates = v.seats
        .filter((s) => s.alive && s.index !== me && !s.investigated)
        .map((s) => s.index);
      const target = m.fascistTeam
        ? // Investigate someone off-team; the result is cover for a lie.
          pickBy(m, nonAllies(m, candidates), (s) => susOf(m, s), 11)
        : pickBy(m, candidates, (s) => susOf(m, s), 11, false);
      const pick = target ?? candidates[0];
      return pick === undefined ? null : { type: 'execInvestigate', bySeat: me, target: pick };
    }
    case 'execInvestigateReveal':
      return isPresident ? { type: 'ackInvestigateReveal', bySeat: me } : null;
    case 'execSpecialElection': {
      if (!isPresident) return null;
      const candidates = alive(m).filter((s) => s !== me);
      let pick: SeatIndex | null = null;
      if (m.fascistTeam) {
        const team = candidates.filter((s) => m.allies.has(s));
        pick = team.length > 0 && m.rand(12) < 0.8 ? pickBy(m, team, () => 0, 12) : null;
      }
      // Otherwise hand it to whoever looks most trustworthy (to a fascist:
      // by public record, so the choice doesn't out the team).
      pick ??= pickBy(m, candidates, (s) => (m.fascistTeam ? publicSus(m, s) : susOf(m, s)), 13);
      return pick === null ? null : { type: 'execSpecialElection', bySeat: me, nextPresident: pick };
    }
    case 'execPeek':
      return isPresident ? { type: 'ackPeek', bySeat: me } : null;
    case 'execExecute': {
      if (!isPresident) return null;
      const candidates = alive(m).filter((s) => s !== me);
      let pick: SeatIndex | null;
      if (m.fascistTeam && m.allies.size > 0) {
        // Never shoot a known teammate. Remove whoever the table trusts most.
        const targets = nonAllies(m, candidates);
        pick = pickBy(m, targets.length ? targets : candidates, (s) => susOf(m, s), 14);
      } else {
        // Liberals (and blind Hitler, for cover) shoot the most suspicious.
        pick = pickBy(m, candidates, (s) => susOf(m, s), 14, false);
      }
      return pick === null ? null : { type: 'execExecute', bySeat: me, target: pick };
    }
    default:
      return null;
  }
}

function nonAllies(m: Mind, seats: SeatIndex[]): SeatIndex[] {
  return seats.filter((s) => !m.allies.has(s));
}

/** Liberals (and Hitler, for cover) judge governments the same way. */
function liberalRisk(m: Mind, president: SeatIndex, chancellor: SeatIndex): number {
  let risk = Math.max(0, susOf(m, president)) * 0.6 + susOf(m, chancellor);
  // Once Hitler can win by election, an untested chancellor is a gamble.
  if (
    m.v.board.fascistEnacted >= HITLER_CHANCELLOR_THRESHOLD &&
    !m.notHitler.has(chancellor) &&
    chancellor !== m.me
  ) {
    risk += m.v.board.fascistEnacted >= 4 ? 2.2 : 1.4;
  }
  return risk;
}

function chooseChancellor(m: Mind): SeatIndex | null {
  const eligible = eligibleChancellors(m.v);
  if (eligible.length === 0) return null;
  const f = m.v.board.fascistEnacted;

  if (m.fascistTeam && m.allies.size > 0) {
    // Hitler in the chancellorship wins outright at 3+ fascist policies.
    if (
      !m.isHitler &&
      f >= HITLER_CHANCELLOR_THRESHOLD &&
      m.hitler !== null &&
      eligible.includes(m.hitler) &&
      m.rand(1) < 0.85
    ) {
      return m.hitler;
    }
    const team = eligible.filter((s) => m.allies.has(s));
    const teamBias = m.isHitler ? 0.3 : 0.5;
    if (team.length > 0 && m.rand(2) < teamBias) return pickBy(m, team, () => 0, 3);
    // Otherwise look honest: pick someone the table trusts (by public record).
    return pickBy(m, nonAllies(m, eligible).length ? nonAllies(m, eligible) : eligible, (s) => publicSus(m, s), 4);
  }
  // Liberal, or blind Hitler playing liberal.
  return pickBy(m, eligible, (s) => liberalRisk(m, m.me, s), 5);
}

/** Suspicion from public record only (no team knowledge), for bluffing. */
function publicSus(m: Mind, s: SeatIndex): number {
  return susOf(m, s) - (m.allies.has(s) ? 10 : 0);
}

function voteJa(m: Mind): boolean {
  const v = m.v;
  const chancellor = v.chancellorCandidateSeat;
  if (chancellor === null) return false;
  const president = v.presidentSeat;
  const chaosNext = v.board.electionTracker >= 2;
  const r = m.rand(20);

  if (president === m.me || chancellor === m.me) return r < 0.97;

  if (m.fascistTeam && m.allies.size > 0) {
    if (
      chancellor === m.hitler &&
      v.board.fascistEnacted >= HITLER_CHANCELLOR_THRESHOLD
    ) {
      return true;
    }
    if (m.allies.has(chancellor) || m.allies.has(president)) return r < 0.9;
    // Mixed: don't be the obvious contrarian.
    return r < (chaosNext ? 0.6 : 0.5);
  }

  const risk = liberalRisk(m, president, chancellor);
  let pJa = risk <= 0.3 ? 0.88 : risk < 1.5 ? 0.6 : risk < 3 ? 0.3 : 0.08;
  if (chaosNext) pJa += 0.2;
  if (m.isHitler) pJa += 0.05;
  return r < pJa;
}

function chooseDiscard(m: Mind, hand: ShPolicy[]): 0 | 1 | 2 {
  const lib = hand.map((p, i) => (p === 'liberal' ? i : -1)).filter((i) => i >= 0);
  const fas = hand.map((p, i) => (p === 'fascist' ? i : -1)).filter((i) => i >= 0);
  const first = (xs: number[]) => xs[0] as 0 | 1 | 2;
  if (!m.fascistTeam) return fas.length > 0 ? first(fas) : first(lib);
  if (lib.length === 0) return first(fas);
  if (fas.length === 0) return first(lib);
  // Fascist president with a mixed hand.
  const chancellor = m.v.chancellorCandidateSeat;
  const teamChancellor = chancellor !== null && m.allies.has(chancellor);
  const libsDown = m.v.board.liberalEnacted;
  const pDumpLiberal = teamChancellor
    ? 0.95
    : libsDown >= LIBERAL_TRACK_LENGTH - 2
      ? 0.9
      : m.isHitler
        ? 0.45
        : 0.65;
  return m.rand(30) < pDumpLiberal ? first(lib) : first(fas);
}

function chooseEnact(m: Mind, hand: ShPolicy[]): 0 | 1 {
  const li = hand.indexOf('liberal');
  const fi = hand.indexOf('fascist');
  if (!m.fascistTeam) return (li >= 0 ? li : 0) as 0 | 1;
  if (fi < 0) return 0;
  if (li < 0) return fi as 0 | 1;
  // Fascist chancellor with L+F: usually enact F, sometimes build trust early.
  const b = m.v.board;
  const safeToBluff = b.liberalEnacted <= 2 && b.fascistEnacted <= 2;
  const pBluff = safeToBluff ? (m.isHitler ? 0.4 : 0.2) : 0;
  return (m.rand(40) < pBluff ? li : fi) as 0 | 1;
}

function wantsVeto(m: Mind, hand: ShPolicy[]): boolean {
  const v = m.v;
  if (!v.board.vetoUnlocked || v.vetoRefused) return false;
  if (!m.fascistTeam) return count(hand, 'liberal') === 0 && m.rand(50) < 0.92;
  return (
    count(hand, 'fascist') === 0 &&
    v.board.liberalEnacted >= LIBERAL_TRACK_LENGTH - 2 &&
    m.rand(50) < 0.75
  );
}

function acceptVeto(m: Mind): boolean {
  const passed = m.v.yourPassedPolicies;
  if (!passed) return false;
  if (!m.fascistTeam) return count(passed, 'liberal') === 0;
  return count(passed, 'fascist') === 0 && m.rand(60) < 0.85;
}
