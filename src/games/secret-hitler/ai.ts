import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { ShAction } from './actions';
import type { ShPrivateState, ShRoleId, ShSeatState } from './state';

// ============================================================================
// Secret Hitler AI
//
// Plays both teams. We have full host-side knowledge (own role, own party,
// known fascists for fascist seats), but we must not exploit knowledge of
// OTHER seats' hidden roles.
//
// Strategy outline:
//   - Liberals: enact liberal policies, vote down chancellors with a fascist
//     trail (board pressure + claim history). Investigate / execute seats
//     flagged by election + policy patterns.
//   - Fascists / Hitler: enact fascist policies when not caught (discard a
//     liberal whenever the cover story holds). Vote up government when
//     chancellor is on-team or board is close to a fascist win. Hitler
//     stays quiet — votes ja on its own fascist team and looks liberal.
//
// Pure file: no DOM / no net / no store imports.
// ============================================================================

function rngForSeat(state: ShPrivateState, seat: SeatIndex, salt: number): number {
  const rng = makeRng(
    (state.seed ^ (seat * 0x5a17) ^ (state.log.length * 17) ^ (salt * 101)) >>> 0,
  );
  return rngInt(rng, 10000) / 10000;
}

function aliveSeats(state: ShPrivateState): SeatIndex[] {
  return state.seats.filter((s) => s.alive).map((s) => s.index);
}

function knownFascistsTo(state: ShPrivateState, seat: SeatIndex): Set<SeatIndex> {
  // Re-derive from the role table — same rule as buildPartyKnowledge:
  // small-table (5-6p), fascists see all fascists + Hitler. 7+p, Hitler sees
  // nobody; regular fascists see each other + Hitler.
  const me = state.seats[seat];
  if (!me) return new Set();
  const out = new Set<SeatIndex>();
  const playerCount = state.seats.length;
  const smallTable = playerCount <= 6;
  if (me.role === 'liberal') return out;
  if (me.role === 'fascist') {
    for (const s of state.seats) {
      if (s.index !== seat && (s.role === 'fascist' || s.role === 'hitler')) {
        out.add(s.index);
      }
    }
    return out;
  }
  // Hitler
  if (smallTable) {
    for (const s of state.seats) {
      if (s.role === 'fascist') out.add(s.index);
    }
  }
  return out;
}

// Compute a "suspicion score" per seat from the public history. Higher = more
// likely fascist. Uses public log + investigation results visible to seat.
function suspicion(
  state: ShPrivateState,
  viewer: SeatIndex,
): Map<SeatIndex, number> {
  const out = new Map<SeatIndex, number>();
  for (const s of aliveSeats(state)) out.set(s, 0);

  // Anyone present at a fascist enact gets +1 (president + chancellor).
  for (const entry of state.log) {
    if (entry.kind === 'policyEnacted' && entry.policy === 'fascist') {
      out.set(entry.president, (out.get(entry.president) ?? 0) + 1);
      out.set(entry.chancellor, (out.get(entry.chancellor) ?? 0) + 1);
    }
  }
  // Investigation results known to viewer.
  for (const inv of state.investigations) {
    if (inv.by !== viewer) continue;
    out.set(inv.target, (out.get(inv.target) ?? 0) + (inv.party === 'fascist' ? 3 : -3));
  }
  // Known fascists are flat-out fascist to us (for fascist seats).
  for (const f of knownFascistsTo(state, viewer)) {
    out.set(f, (out.get(f) ?? 0) + 10);
  }
  // The viewer themselves is not a target of suspicion to themselves.
  out.delete(viewer);
  return out;
}

function mostSuspicious(state: ShPrivateState, viewer: SeatIndex): SeatIndex | null {
  const sus = suspicion(state, viewer);
  let best: SeatIndex | null = null;
  let bestVal = -Infinity;
  for (const [s, v] of sus) {
    if (state.seats[s]!.alive && v > bestVal) {
      bestVal = v;
      best = s;
    }
  }
  return best;
}

function leastSuspicious(state: ShPrivateState, viewer: SeatIndex): SeatIndex | null {
  const sus = suspicion(state, viewer);
  let best: SeatIndex | null = null;
  let bestVal = Infinity;
  for (const [s, v] of sus) {
    if (state.seats[s]!.alive && v < bestVal) {
      bestVal = v;
      best = s;
    }
  }
  return best;
}

function isFascistTeam(role: ShRoleId): boolean {
  return role === 'fascist' || role === 'hitler';
}

// Should we vote Ja on this government?
function voteJa(state: ShPrivateState, seat: SeatIndex): boolean {
  const me = state.seats[seat]!;
  const chancellor = state.chancellorCandidateSeat;
  if (chancellor === null) return false;
  const r = rngForSeat(state, seat, 3);

  if (isFascistTeam(me.role)) {
    // Fascist: vote up if chancellor is fascist OR if it's me. Always ja on a
    // known-team chancellor. Otherwise mostly ja to advance fascist agenda
    // unless board pressure is high.
    const known = knownFascistsTo(state, seat);
    if (chancellor === seat) return true;
    if (known.has(chancellor)) return true;
    // Hitler-elected check: at 3+ fascist policies, electing Hitler is an
    // instant fascist win. If chancellor IS hitler (from a fascist's view),
    // ja.
    if (state.board.fascistEnacted >= 3 && state.seats[chancellor]!.role === 'hitler') {
      return true;
    }
    // Otherwise, 60% ja to keep the game moving.
    return r < 0.6;
  }

  // Liberal: vote against known-bad governments. Vote down if either the
  // president or chancellor has high suspicion. Otherwise ja.
  const sus = suspicion(state, seat);
  const presSus = sus.get(state.presidentSeat) ?? 0;
  const chanSus = sus.get(chancellor) ?? 0;
  // At 3+ fascist policies, never approve a fresh, untested chancellor —
  // they could be Hitler.
  if (state.board.fascistEnacted >= 3 && chanSus >= 0 && r < 0.45) {
    return false;
  }
  if (presSus >= 2 || chanSus >= 2) return false;
  return r < 0.85;
}

// Discard a policy from a 3-card hand (president).
function presidentDiscard(
  state: ShPrivateState,
  seat: SeatIndex,
): 0 | 1 | 2 {
  const me = state.seats[seat]!;
  const hand = state.legislativeHand;
  // Index where each policy lives.
  const liberalIdx: number[] = [];
  const fascistIdx: number[] = [];
  for (let i = 0; i < hand.length; i++) {
    if (hand[i] === 'liberal') liberalIdx.push(i);
    else fascistIdx.push(i);
  }
  if (isFascistTeam(me.role)) {
    // Fascist: discard a liberal if possible (always).
    if (liberalIdx.length > 0) return liberalIdx[0] as 0 | 1 | 2;
    return fascistIdx[0] as 0 | 1 | 2;
  }
  // Liberal: discard a fascist if possible.
  if (fascistIdx.length > 0) return fascistIdx[0] as 0 | 1 | 2;
  return liberalIdx[0] as 0 | 1 | 2;
}

// Enact from a 2-card hand (chancellor).
function chancellorEnact(state: ShPrivateState, seat: SeatIndex): 0 | 1 {
  const me = state.seats[seat]!;
  const hand = state.legislativeHand;
  const liberalIdx = hand.findIndex((p) => p === 'liberal');
  const fascistIdx = hand.findIndex((p) => p === 'fascist');
  if (isFascistTeam(me.role)) {
    if (fascistIdx >= 0) return fascistIdx as 0 | 1;
    return 0;
  }
  if (liberalIdx >= 0) return liberalIdx as 0 | 1;
  return 0;
}

// Used when nominating a chancellor: term-limit-aware pick.
function termLimitedSet(state: ShPrivateState): Set<SeatIndex> {
  const out = new Set<SeatIndex>();
  if (state.lastElectedChancellor !== null) out.add(state.lastElectedChancellor);
  const alive = aliveSeats(state).length;
  if (alive > 5 && state.lastElectedPresident !== null) {
    out.add(state.lastElectedPresident);
  }
  return out;
}

function pickChancellor(state: ShPrivateState, seat: SeatIndex): SeatIndex | null {
  const me = state.seats[seat]!;
  const limited = termLimitedSet(state);
  const candidates = aliveSeats(state).filter(
    (i) => i !== seat && !limited.has(i),
  );
  if (candidates.length === 0) return null;

  if (isFascistTeam(me.role)) {
    // Fascist nominee: prefer a known fascist team member. If at >= 3 fascist
    // policies, prefer Hitler if available (instant win condition).
    const known = knownFascistsTo(state, seat);
    if (state.board.fascistEnacted >= 3) {
      const hitler = candidates.find(
        (i) => state.seats[i]!.role === 'hitler',
      );
      if (hitler !== undefined) return hitler;
    }
    const knownAlive = candidates.find((i) => known.has(i));
    if (knownAlive !== undefined) return knownAlive;
    // Fall back to least-suspicious so we look honest.
    const lowSus = leastSuspicious(state, seat);
    if (lowSus !== null && candidates.includes(lowSus)) return lowSus;
    return candidates[0]!;
  }
  // Liberal: pick the lowest-suspicion candidate.
  const sus = suspicion(state, seat);
  candidates.sort((a, b) => (sus.get(a) ?? 0) - (sus.get(b) ?? 0));
  return candidates[0]!;
}

// =============================================================================
// Top-level
// =============================================================================

export function aiChooseAction(
  state: ShPrivateState,
  seat: SeatIndex,
): ShAction | null {
  const me = state.seats[seat];
  if (!me || !me.alive) return null;

  switch (state.phase) {
    case 'setup': {
      if (state.setupAcked[seat]) return null;
      return { type: 'ackRoleReveal', bySeat: seat };
    }

    case 'nomination': {
      if (seat !== state.presidentSeat) return null;
      const chancellor = pickChancellor(state, seat);
      if (chancellor === null) return null;
      return { type: 'nominateChancellor', bySeat: seat, chancellor };
    }

    case 'electionVote': {
      if (!state.seats[seat]!.alive) return null;
      if (state.seats[seat]!.voteCast !== null) return null;
      return {
        type: 'castVote',
        bySeat: seat,
        vote: voteJa(state, seat) ? 'ja' : 'nein',
      };
    }

    case 'electionReveal': {
      // Any seat may ack — game advances when an alive seat acks. For
      // simplicity ack from the president if they're alive, else any seat.
      const aliveFirst = state.seats.find((s) => s.alive)?.index ?? null;
      if (aliveFirst === null) return null;
      if (seat !== aliveFirst) return null;
      return { type: 'ackElectionReveal', bySeat: seat };
    }

    case 'legislativePresident': {
      if (seat !== state.presidentSeat) return null;
      if (state.legislativeHand.length !== 3) return null;
      return {
        type: 'presidentDiscard',
        bySeat: seat,
        discardIndex: presidentDiscard(state, seat),
      };
    }

    case 'legislativeChancellor': {
      if (seat !== state.chancellorCandidateSeat) return null;
      if (state.legislativeHand.length !== 2) return null;
      // Should we request a veto? Only if vetoUnlocked AND we hold two
      // fascists AND we're liberal (we'd rather not enact). Or fascist with
      // two liberals when we don't want a liberal track lead.
      if (state.board.vetoUnlocked) {
        const lib = state.legislativeHand.filter((p) => p === 'liberal').length;
        const myMe = state.seats[seat]!;
        const r = rngForSeat(state, seat, 5);
        if (isFascistTeam(myMe.role) && lib >= 2 && r < 0.6) {
          return { type: 'chancellorRequestVeto', bySeat: seat };
        }
        if (!isFascistTeam(myMe.role) && lib === 0 && r < 0.6) {
          return { type: 'chancellorRequestVeto', bySeat: seat };
        }
      }
      return {
        type: 'chancellorEnact',
        bySeat: seat,
        enactIndex: chancellorEnact(state, seat),
      };
    }

    case 'vetoRequested': {
      if (seat !== state.presidentSeat) return null;
      const me2 = state.seats[seat]!;
      // Accept veto if we're on the same team as the chancellor's apparent
      // motive (proxy via our own role + remaining cards).
      const lib = state.legislativeHand.filter((p) => p === 'liberal').length;
      const r = rngForSeat(state, seat, 6);
      if (isFascistTeam(me2.role)) {
        return { type: 'presidentRespondVeto', bySeat: seat, accept: lib === 2 && r < 0.7 };
      }
      // Liberal: accept veto when there's no liberal to enact.
      return { type: 'presidentRespondVeto', bySeat: seat, accept: lib === 0 && r < 0.7 };
    }

    case 'policyReveal': {
      // Any alive seat may ack. Have the lowest-index alive seat advance.
      const aliveFirst = state.seats.find((s) => s.alive)?.index ?? null;
      if (aliveFirst === null) return null;
      if (seat !== aliveFirst) return null;
      return { type: 'ackPolicyReveal', bySeat: seat };
    }

    case 'topDeckReveal': {
      const aliveFirst = state.seats.find((s) => s.alive)?.index ?? null;
      if (aliveFirst === null) return null;
      if (seat !== aliveFirst) return null;
      return { type: 'ackTopDeckReveal', bySeat: seat };
    }

    case 'execInvestigate': {
      if (seat !== state.presidentSeat) return null;
      // Pick an alive seat who hasn't been investigated.
      const candidates = state.seats.filter(
        (s) => s.alive && s.index !== seat && !s.hasBeenInvestigated,
      );
      if (candidates.length === 0) return null;
      const me2 = state.seats[seat]!;
      let target: ShSeatState | undefined;
      if (isFascistTeam(me2.role)) {
        // Investigate a liberal so we can later claim they're fascist with a
        // "trust me" lie. Pick least suspicious target.
        const lowSus = leastSuspicious(state, seat);
        target = lowSus !== null ? candidates.find((c) => c.index === lowSus) : undefined;
      } else {
        const highSus = mostSuspicious(state, seat);
        target = highSus !== null ? candidates.find((c) => c.index === highSus) : undefined;
      }
      if (!target) target = candidates[0];
      return { type: 'execInvestigate', bySeat: seat, target: target!.index };
    }

    case 'execInvestigateReveal': {
      if (seat !== state.presidentSeat) return null;
      return { type: 'ackInvestigateReveal', bySeat: seat };
    }

    case 'execSpecialElection': {
      if (seat !== state.presidentSeat) return null;
      const me2 = state.seats[seat]!;
      const candidates = state.seats.filter((s) => s.alive && s.index !== seat);
      if (candidates.length === 0) return null;
      let pick: number;
      if (isFascistTeam(me2.role)) {
        const known = knownFascistsTo(state, seat);
        const knownPick = candidates.find((c) => known.has(c.index));
        pick = knownPick ? knownPick.index : candidates[0]!.index;
      } else {
        const low = leastSuspicious(state, seat);
        pick = low !== null && candidates.some((c) => c.index === low) ? low : candidates[0]!.index;
      }
      return { type: 'execSpecialElection', bySeat: seat, nextPresident: pick };
    }

    case 'execPeek': {
      if (seat !== state.presidentSeat) return null;
      return { type: 'ackPeek', bySeat: seat };
    }

    case 'execExecute': {
      if (seat !== state.presidentSeat) return null;
      const me2 = state.seats[seat]!;
      const candidates = state.seats.filter((s) => s.alive && s.index !== seat);
      if (candidates.length === 0) return null;
      let pick: number;
      if (isFascistTeam(me2.role)) {
        // Avoid killing teammates and especially avoid killing Hitler.
        const known = knownFascistsTo(state, seat);
        const safeTargets = candidates.filter(
          (c) => !known.has(c.index) && state.seats[c.index]!.role !== 'hitler',
        );
        pick = safeTargets.length > 0 ? safeTargets[0]!.index : candidates[0]!.index;
      } else {
        const high = mostSuspicious(state, seat);
        pick = high !== null && candidates.some((c) => c.index === high) ? high : candidates[0]!.index;
      }
      return { type: 'execExecute', bySeat: seat, target: pick };
    }

    case 'gameOver':
      return null;
  }
  return null;
}
