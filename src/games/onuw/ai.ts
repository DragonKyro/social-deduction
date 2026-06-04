import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { OnuwAction } from './actions';
import { ROLES } from './roles';
import type { OnuwPrivateState, OnuwRoleId } from './state';

// ============================================================================
// One Night Ultimate Werewolf AI
//
// One-night game with 30+ possible roles. The AI:
//   - Acks setup + walk-through immediately.
//   - For each interactive night step, picks a sensible default action based
//     on the role's "best play" (Seer looks at a player, Robber swaps with a
//     low-suspect, Troublemaker swaps two non-self seats, etc.).
//   - For the vote, votes for the most suspicious non-self seat (or no-lynch).
//
// We use the AI's own observations + dealtRole + finalRole to inform votes.
// Wolf seats vote for an apparent villager; village seats vote for the seat
// that looks most likely to be a wolf from observations.
//
// Pure file: no DOM / no net / no store imports.
// ============================================================================

function rngForSeat(state: OnuwPrivateState, seat: SeatIndex, salt: number): number {
  const rng = makeRng(
    (state.seed ^ (seat * 0x9e37) ^ (state.nightStepIndex * 13) ^ (salt * 101)) >>> 0,
  );
  return rngInt(rng, 10000) / 10000;
}

function nonSelfSeats(state: OnuwPrivateState, seat: SeatIndex): SeatIndex[] {
  return state.seats.filter((s) => s.index !== seat).map((s) => s.index);
}

function teamOfDealtRole(role: OnuwRoleId): 'village' | 'werewolves' | 'tanner' {
  return ROLES[role].team;
}

// Given an OBSERVATION list, what seats does this AI suspect are wolves?
function suspectedWolves(
  state: OnuwPrivateState,
  seat: SeatIndex,
): Set<SeatIndex> {
  const suspects = new Set<SeatIndex>();
  const me = state.seats[seat];
  if (!me) return suspects;
  for (const obs of me.observations) {
    for (const ent of obs.entries) {
      if (!ent.role || !ent.position) continue;
      const team = teamOfDealtRole(ent.role);
      if (team !== 'werewolves') continue;
      if (ent.position.kind === 'seat') suspects.add(ent.position.index);
    }
  }
  return suspects;
}

// Vote pick. Village seats vote a suspect; wolf seats vote a non-wolf seat;
// if no info, pick a deterministic non-self seat.
function pickVoteTarget(state: OnuwPrivateState, seat: SeatIndex): SeatIndex {
  const me = state.seats[seat]!;
  const myFinal = me.finalRole;
  const team = teamOfDealtRole(myFinal);
  const others = nonSelfSeats(state, seat);

  if (team === 'tanner') {
    // Tanner wants to be voted. Vote anyone other than self.
    return others[0]!;
  }

  if (team === 'werewolves') {
    // Pick a non-wolf seat by dealt role (we know other wolves from night
    // observations if we're a regular werewolf or alpha). Pick a seat NOT in
    // our suspects (from our perspective, a non-wolf).
    const susWolves = suspectedWolves(state, seat);
    const targets = others.filter((s) => !susWolves.has(s));
    if (targets.length > 0) return targets[0]!;
    return others[0]!;
  }

  // Village team. Use our observations.
  const susWolves = suspectedWolves(state, seat);
  if (susWolves.size > 0) {
    return Array.from(susWolves)[0]!;
  }
  // No info — vote a deterministic seat (next clockwise neighbor that isn't us).
  return others[Math.floor(rngForSeat(state, seat, 7) * others.length)]!;
}

// =============================================================================
// Night-step actions per role
// =============================================================================

function chooseNightAction(
  state: OnuwPrivateState,
  seat: SeatIndex,
): OnuwAction | null {
  const step = state.nightSchedule[state.nightStepIndex];
  if (!step) return null;
  if (!step.seats.includes(seat)) return null;
  // Skip if already acked this step.
  const acked = state.nightStepAcks[step.stepIndex] ?? [];
  if (acked.includes(seat)) return null;

  const others = nonSelfSeats(state, seat);
  const someoneElse = others[Math.floor(rngForSeat(state, seat, 11) * others.length)] ?? 0;

  switch (step.role) {
    // Roles with no interactive action: ack and move on.
    case 'mason':
    case 'minion':
    case 'insomniac':
    case 'beholder':
    case 'squire':
    case 'empath':
    case 'auraSeer':
      return { type: 'nightAck', bySeat: seat };

    case 'seer':
      // 60% look at a player, 40% peek 2 center cards.
      if (rngForSeat(state, seat, 17) < 0.6) {
        return { type: 'seerLookSeat', bySeat: seat, targetSeat: someoneElse };
      }
      return { type: 'seerLookCenter', bySeat: seat, centerIndices: [0, 1] };

    case 'robber': {
      // Robber: 70% swap with someone, 30% skip.
      if (rngForSeat(state, seat, 23) < 0.7) {
        return { type: 'robberSwap', bySeat: seat, targetSeat: someoneElse };
      }
      return { type: 'robberSkip', bySeat: seat };
    }
    case 'troublemaker': {
      // Swap two non-self seats.
      const candidates = others;
      if (candidates.length < 2) return { type: 'nightAck', bySeat: seat };
      const a = candidates[0]!;
      const b = candidates[1]!;
      return { type: 'troublemakerSwap', bySeat: seat, a, b };
    }
    case 'drunk':
      // Drunk: swap with center 0 (deterministic).
      return { type: 'drunkSwap', bySeat: seat, centerIndex: 0 };

    case 'werewolf':
    case 'alphaWolf':
    case 'mysticWolf': {
      // Lone-wolf peek if applicable, else skip ack via loneWolfSkip / nightAck.
      const wolves = state.seats.filter(
        (s) =>
          s.dealtRole === 'werewolf' ||
          s.dealtRole === 'alphaWolf' ||
          s.dealtRole === 'mysticWolf',
      );
      const isLoneWolf = wolves.length === 1 && wolves[0]!.index === seat;
      if (step.role === 'mysticWolf' && step.seats.includes(seat)) {
        // Mystic Wolf phase: peek at someone.
        return { type: 'mysticWolfLook', bySeat: seat, targetSeat: someoneElse };
      }
      if (step.role === 'alphaWolf' && step.seats.includes(seat)) {
        // Convert someone to a wolf.
        return { type: 'alphaWolfConvert', bySeat: seat, targetSeat: someoneElse };
      }
      if (isLoneWolf && rngForSeat(state, seat, 29) < 0.7) {
        return { type: 'loneWolfPeekCenter', bySeat: seat, centerIndex: 0 };
      }
      return { type: 'loneWolfSkip', bySeat: seat };
    }

    // --- Daybreak ---
    case 'doppelganger':
      return { type: 'doppelgangerCopy', bySeat: seat, targetSeat: someoneElse };
    case 'apprenticeSeer':
      return { type: 'apprenticeSeerLook', bySeat: seat, centerIndex: 0 };
    case 'paranormalInvestigator':
      // Look at one seat, then stop.
      return { type: 'paranormalLook', bySeat: seat, targetSeat: someoneElse };
    case 'witch':
      return {
        type: 'witchSwap',
        bySeat: seat,
        centerIndex: 0,
        targetSeat: someoneElse,
      };
    case 'villageIdiot':
      return {
        type: 'villageIdiotShift',
        bySeat: seat,
        direction: rngForSeat(state, seat, 31) < 0.5 ? 'left' : 'right',
      };
    case 'revealer':
      return { type: 'revealerFlip', bySeat: seat, targetSeat: someoneElse };
    case 'curator':
      return { type: 'curatorGive', bySeat: seat, targetSeat: someoneElse };

    // --- Bonus pack ---
    case 'thing': {
      const n = state.seats.length;
      const right = (seat + 1) % n;
      return { type: 'thingTap', bySeat: seat, targetSeat: right };
    }
    case 'bodySnatcher':
      return { type: 'bodySnatcherSwap', bySeat: seat, targetSeat: someoneElse };
    case 'windyWendy':
      return {
        type: 'windyWendyShift',
        bySeat: seat,
        sourceSeat: someoneElse,
        direction: 'right',
      };
    case 'defenderEr':
      return { type: 'defenderProtect', bySeat: seat, targetSeat: someoneElse };

    default:
      // Any role we don't special-case — just ack the step.
      return { type: 'nightAck', bySeat: seat };
  }
}

// =============================================================================
// Top-level
// =============================================================================

export function aiChooseAction(
  state: OnuwPrivateState,
  seat: SeatIndex,
): OnuwAction | null {
  switch (state.phase) {
    case 'setup': {
      if (state.setupAcked[seat]) return null;
      return { type: 'ackRoleReveal', bySeat: seat };
    }
    case 'night': {
      return chooseNightAction(state, seat);
    }
    case 'day': {
      // Solo / hot-seat: a human triggers vote. AI doesn't trigger it.
      return null;
    }
    case 'voting': {
      if (state.seats[seat]!.voteTarget !== null) return null;
      return {
        type: 'castVote',
        bySeat: seat,
        targetSeat: pickVoteTarget(state, seat),
      };
    }
    case 'resolution':
    case 'gameOver':
      return null;
  }
}
