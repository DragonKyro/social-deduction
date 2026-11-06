import { makeRng, rngFloat } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { OnuwAction } from './actions';
import { ROLES, isWerewolfCard } from './roles';
import type { OnuwPrivateState, OnuwPublicState, OnuwRoleId, OnuwTeamId } from './state';
import { viewFor } from './view';

// ============================================================================
// One Night Ultimate Werewolf AI
//
// FAIRNESS: the AI receives the host's private state, but the first thing it
// does is redact it to its own seat (`viewFor(state, seat)`) and it reasons
// ONLY from that view: its dealt card, its own observations, and its own
// "your turn" prompt. The only other thing read from the private state is
// the seed, used purely as an entropy source for tie-breaks and bluff mixing
// (it is never used to reconstruct the deal).
//
// The AI acts in every phase where its seat is required to act — role
// acknowledgement, its night steps, its vote — and returns null otherwise
// (day discussion, waiting for others, resolution).
//
// Pure file: no DOM / no net / no store imports.
// ============================================================================

function makeChooser(state: OnuwPrivateState, view: OnuwPublicState, seat: SeatIndex) {
  // Entropy from (seed, seat, how far this seat has got) so successive
  // decisions differ but replays are deterministic.
  const progress = view.yourObservations.length * 31 + (view.yourNightStep?.looked.length ?? 0) * 7;
  const phaseSalt = ['setup', 'night', 'day', 'voting', 'resolution', 'gameOver'].indexOf(view.phase);
  const rng = makeRng((state.seed ^ Math.imul(seat + 1, 0x9e3779b1) ^ Math.imul(progress + phaseSalt + 1, 0x85ebca6b)) >>> 0);
  const roll = () => rngFloat(rng);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(roll() * xs.length)]!;
  return { roll, pick };
}

// What this seat knows, distilled from its observations.
interface Knowledge {
  me: SeatIndex;
  others: SeatIndex[];
  // The role this seat believes it holds now (null = no idea, e.g. Drunk).
  believed: OnuwRoleId | null;
  // Seats known (at some point tonight) to hold a werewolf.
  wolves: Set<SeatIndex>;
  // Seats known to hold a village card.
  village: Set<SeatIndex>;
  // Seats this seat knows hold a Tanner card.
  tanners: Set<SeatIndex>;
}

function knowledgeOf(view: OnuwPublicState): Knowledge {
  const me = view.yourSeat!;
  const others = view.seats.map((s) => s.index).filter((i) => i !== me);
  let believed: OnuwRoleId | null = view.yourDealtRole;
  const wolves = new Set<SeatIndex>();
  const village = new Set<SeatIndex>();
  const tanners = new Set<SeatIndex>();
  const learn = (seat: SeatIndex, card: OnuwRoleId) => {
    wolves.delete(seat);
    village.delete(seat);
    tanners.delete(seat);
    if (isWerewolfCard(card)) wolves.add(seat);
    else if (ROLES[card].team === 'tanner') tanners.add(seat);
    else if (ROLES[card].team === 'village') village.add(seat);
  };
  for (const obs of view.yourObservations) {
    if (obs.youBecome !== undefined) believed = obs.youBecome === 'unknown' ? null : obs.youBecome;
    for (const e of obs.entries) {
      if (!e.position || e.position.kind !== 'seat' || e.position.index === me) continue;
      if (e.role) learn(e.position.index, e.role);
      else if (e.shownAs === 'werewolf') wolves.add(e.position.index);
      else if (e.shownAs === 'mason' || e.shownAs === 'seer') village.add(e.position.index);
    }
  }
  // Flipped-up cards (Revealer) are public knowledge.
  for (const s of view.seats) if (s.flippedCard && s.index !== me) learn(s.index, s.flippedCard);
  return { me, others, believed, wolves, village, tanners };
}

function believedTeam(k: Knowledge): OnuwTeamId {
  if (!k.believed) return 'village';
  return ROLES[k.believed].team;
}

// =============================================================================
// Night
// =============================================================================

function chooseNightAction(state: OnuwPrivateState, view: OnuwPublicState): OnuwAction | null {
  const step = view.yourNightStep;
  if (!step) return null;
  const k = knowledgeOf(view);
  const { roll, pick } = makeChooser(state, view, k.me);
  const seat = k.me;
  const ack: OnuwAction = { type: 'nightAck', bySeat: seat };
  const centers = view.centerCards.map((c) => c.index);
  const unknownOthers = k.others.filter((i) => !k.wolves.has(i) && !k.village.has(i));
  const someone = () => pick(unknownOthers.length > 0 ? unknownOthers : k.others);
  const n = view.seats.length;

  switch (step.role) {
    case 'doppelganger':
      return { type: 'doppelgangerCopy', bySeat: seat, targetSeat: pick(k.others) };

    case 'werewolf':
      if (step.loneWolf && roll() < 0.8) {
        return { type: 'loneWolfPeekCenter', bySeat: seat, centerIndex: pick(centers) };
      }
      return ack;
    case 'alphaWolf': {
      const targets = k.others.filter((i) => !k.wolves.has(i));
      if (targets.length === 0) return ack;
      return { type: 'alphaWolfConvert', bySeat: seat, targetSeat: pick(targets) };
    }
    case 'mysticWolf': {
      const targets = k.others.filter((i) => !k.wolves.has(i));
      if (targets.length === 0 || roll() < 0.1) return ack;
      return { type: 'mysticWolfLook', bySeat: seat, targetSeat: pick(targets) };
    }

    case 'seer':
      if (roll() < 0.6) return { type: 'seerLookSeat', bySeat: seat, targetSeat: someone() };
      {
        const a = pick(centers);
        const b = pick(centers.filter((c) => c !== a));
        return { type: 'seerLookCenter', bySeat: seat, centerIndices: [a, b] };
      }
    case 'apprenticeSeer':
      return { type: 'apprenticeSeerLook', bySeat: seat, centerIndex: pick(centers) };
    case 'paranormalInvestigator': {
      const fresh = unknownOthers.filter((i) => !step.looked.includes(i));
      const pool = fresh.length > 0 ? fresh : k.others.filter((i) => !step.looked.includes(i));
      if (pool.length === 0 || (step.looked.length === 1 && roll() < 0.4)) {
        return { type: 'paranormalStop', bySeat: seat };
      }
      return { type: 'paranormalLook', bySeat: seat, targetSeat: pick(pool) };
    }
    case 'robber': {
      if (roll() < 0.25) return { type: 'robberSkip', bySeat: seat };
      // A village Robber avoids stealing a known werewolf card.
      const safe = k.others.filter((i) => !k.wolves.has(i) && !k.tanners.has(i));
      return { type: 'robberSwap', bySeat: seat, targetSeat: pick(safe.length > 0 ? safe : k.others) };
    }
    case 'witch': {
      if (roll() < 0.3) return { type: 'witchSkip', bySeat: seat };
      return { type: 'witchSwap', bySeat: seat, centerIndex: pick(centers), targetSeat: pick(k.others) };
    }
    case 'troublemaker': {
      if (k.others.length < 2 || roll() < 0.15) return ack;
      const a = pick(k.others);
      const b = pick(k.others.filter((i) => i !== a));
      return { type: 'troublemakerSwap', bySeat: seat, a, b };
    }
    case 'villageIdiot':
      if (roll() < 0.4) return { type: 'villageIdiotSkip', bySeat: seat };
      return { type: 'villageIdiotShift', bySeat: seat, direction: roll() < 0.5 ? 'left' : 'right' };
    case 'drunk':
      return { type: 'drunkSwap', bySeat: seat, centerIndex: pick(centers) };
    case 'revealer':
      if (roll() < 0.2) return { type: 'revealerSkip', bySeat: seat };
      return { type: 'revealerFlip', bySeat: seat, targetSeat: someone() };
    case 'curator':
      if (roll() < 0.2) return ack;
      return { type: 'curatorGive', bySeat: seat, targetSeat: pick(k.others) };

    case 'thing':
      return { type: 'thingTap', bySeat: seat, targetSeat: roll() < 0.5 ? (seat + 1) % n : (seat - 1 + n) % n };
    case 'bodySnatcher':
      if (roll() < 0.4) return ack;
      return { type: 'bodySnatcherSwap', bySeat: seat, targetSeat: someone() };
    case 'windyWendy':
      if (roll() < 0.5) return ack;
      return {
        type: 'windyWendyShift',
        bySeat: seat,
        sourceSeat: pick(k.others),
        direction: roll() < 0.5 ? 'left' : 'right',
      };
    case 'defenderEr':
      return { type: 'defenderProtect', bySeat: seat, targetSeat: pick(view.seats.map((s) => s.index)) };

    default:
      // Observation-only wake-ups (Minion, Mason, Insomniac, …): acknowledge.
      return step.canPass ? ack : null;
  }
}

// =============================================================================
// Vote
// =============================================================================

function pickVoteTarget(state: OnuwPrivateState, view: OnuwPublicState): SeatIndex {
  const k = knowledgeOf(view);
  const { roll, pick } = makeChooser(state, view, k.me);
  const team = believedTeam(k);
  const notWolves = k.others.filter((i) => !k.wolves.has(i));

  if (team === 'tanner') {
    // Vote randomly; a Tanner wants attention, not a particular kill.
    return pick(k.others);
  }
  if (team === 'werewolves') {
    // Push the vote onto someone who isn't a werewolf — a known villager if
    // possible (they're the ones claiming information).
    const known = k.others.filter((i) => k.village.has(i));
    if (known.length > 0 && roll() < 0.6) return pick(known);
    return pick(notWolves.length > 0 ? notWolves : k.others);
  }
  // Village: vote a known werewolf; otherwise someone not known to be safe
  // (and never a known Tanner).
  const wolves = k.others.filter((i) => k.wolves.has(i));
  if (wolves.length > 0) return pick(wolves);
  const unknown = k.others.filter((i) => !k.village.has(i) && !k.tanners.has(i));
  return pick(unknown.length > 0 ? unknown : k.others);
}

// =============================================================================
// Top-level
// =============================================================================

export function aiChooseAction(state: OnuwPrivateState, seat: SeatIndex): OnuwAction | null {
  const view = viewFor(state, seat);
  if (view.yourSeat === null) return null;
  const mine = view.seats[seat]!;
  switch (view.phase) {
    case 'setup':
      return mine.hasAckedSetup ? null : { type: 'ackRoleReveal', bySeat: seat };
    case 'night':
      return chooseNightAction(state, view);
    case 'voting':
      return mine.hasVoted ? null : { type: 'castVote', bySeat: seat, targetSeat: pickVoteTarget(state, view) };
    case 'day':
    case 'resolution':
    case 'gameOver':
      return null;
  }
}
