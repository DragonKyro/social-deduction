import type { SeatIndex } from '@/engine/types';
import { ROLES } from './roles';
import type {
  OnuwNightObservation,
  OnuwPrivateState,
  OnuwRoleId,
  OnuwSeatState,
} from './state';

// ============================================================================
// Night-action helpers
//
// Each helper takes the current state, the acting seat, and any action
// parameters, and returns the next state. They mutate copies; never the
// original.
// ============================================================================

function clone(state: OnuwPrivateState): OnuwPrivateState {
  return {
    ...state,
    seats: state.seats.map((s) => ({ ...s, observations: s.observations.slice() })),
    centerCards: state.centerCards.map((c) => ({ ...c })),
    nightSchedule: state.nightSchedule.map((step) => ({ ...step, seats: step.seats.slice() })),
    nightStepAcks: { ...state.nightStepAcks },
    setupAcked: { ...state.setupAcked },
    voteAcks: state.voteAcks.slice(),
    rolePool: state.rolePool.slice(),
    killedSeats: state.killedSeats.slice(),
    voteTally: { ...state.voteTally },
  };
}

function setSeat(
  state: OnuwPrivateState,
  seat: SeatIndex,
  patch: Partial<OnuwSeatState>,
): OnuwPrivateState {
  const next = clone(state);
  next.seats = next.seats.map((s, i) => (i === seat ? { ...s, ...patch } : s));
  return next;
}

function addObservation(
  state: OnuwPrivateState,
  seat: SeatIndex,
  obs: OnuwNightObservation,
): OnuwPrivateState {
  const next = clone(state);
  next.seats = next.seats.map((s, i) =>
    i === seat ? { ...s, observations: [...s.observations, obs] } : s,
  );
  return next;
}

function seatName(state: OnuwPrivateState, seat: SeatIndex): string {
  return state.seats[seat]?.name ?? `Seat ${seat + 1}`;
}

function centerLabel(index: number): string {
  return `Center ${index + 1}`;
}

// === Swap helpers ============================================================

export function swapSeatWithSeat(
  state: OnuwPrivateState,
  a: SeatIndex,
  b: SeatIndex,
): OnuwPrivateState {
  if (a === b) return state;
  const next = clone(state);
  const roleA = next.seats[a]!.finalRole;
  const roleB = next.seats[b]!.finalRole;
  next.seats[a] = { ...next.seats[a]!, finalRole: roleB };
  next.seats[b] = { ...next.seats[b]!, finalRole: roleA };
  return next;
}

export function swapSeatWithCenter(
  state: OnuwPrivateState,
  seat: SeatIndex,
  centerIndex: number,
): OnuwPrivateState {
  const next = clone(state);
  const seatRole = next.seats[seat]!.finalRole;
  const centerRole = next.centerCards[centerIndex]!.role;
  next.seats[seat] = { ...next.seats[seat]!, finalRole: centerRole };
  next.centerCards[centerIndex] = { ...next.centerCards[centerIndex]!, role: seatRole };
  return next;
}

// === Base game ===============================================================

export function applySeerLookSeat(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  const targetRole = state.seats[target]!.finalRole;
  return addObservation(state, seat, {
    text: `You looked at ${seatName(state, target)}'s card — they are the ${ROLES[targetRole].name}.`,
    entries: [
      { label: seatName(state, target), position: { kind: 'seat', index: target }, role: targetRole },
    ],
  });
}

export function applySeerLookCenter(
  state: OnuwPrivateState,
  seat: SeatIndex,
  centerIndices: [number, number],
): OnuwPrivateState {
  const [a, b] = centerIndices;
  const roleA = state.centerCards[a]!.role;
  const roleB = state.centerCards[b]!.role;
  return addObservation(state, seat, {
    text: `You peeked two center cards: ${centerLabel(a)} = ${ROLES[roleA].name}, ${centerLabel(b)} = ${ROLES[roleB].name}.`,
    entries: [
      { label: centerLabel(a), position: { kind: 'center', index: a }, role: roleA },
      { label: centerLabel(b), position: { kind: 'center', index: b }, role: roleB },
    ],
  });
}

export function applyRobberSwap(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  let next = swapSeatWithSeat(state, seat, target);
  const newRole = next.seats[seat]!.finalRole;
  next = addObservation(next, seat, {
    text: `You stole ${seatName(state, target)}'s card. You are now the ${ROLES[newRole].name}.`,
    entries: [
      { label: seatName(state, target), position: { kind: 'seat', index: target }, role: newRole },
    ],
  });
  return next;
}

export function applyTroublemakerSwap(
  state: OnuwPrivateState,
  seat: SeatIndex,
  a: SeatIndex,
  b: SeatIndex,
): OnuwPrivateState {
  let next = swapSeatWithSeat(state, a, b);
  next = addObservation(next, seat, {
    text: `You swapped ${seatName(state, a)} and ${seatName(state, b)}.`,
    entries: [
      { label: seatName(state, a), position: { kind: 'seat', index: a } },
      { label: seatName(state, b), position: { kind: 'seat', index: b } },
    ],
  });
  return next;
}

export function applyDrunkSwap(
  state: OnuwPrivateState,
  seat: SeatIndex,
  centerIndex: number,
): OnuwPrivateState {
  let next = swapSeatWithCenter(state, seat, centerIndex);
  next = addObservation(next, seat, {
    text: `You swapped your card with ${centerLabel(centerIndex)}. You do NOT know what you are now.`,
    entries: [{ label: centerLabel(centerIndex), position: { kind: 'center', index: centerIndex } }],
  });
  return next;
}

// === Werewolves =============================================================

// Wake-the-werewolves: each werewolf-seat sees all other werewolf-seats.
// If a seat is the lone werewolf, they may optionally peek one center card.
export function applyWerewolfWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  const wolves = state.seats
    .filter((s) => isWerewolfDealtRole(s.dealtRole) && s.dealtRole !== 'dreamWolf')
    .map((s) => s.index);
  const otherWolves = wolves.filter((i) => i !== seat);
  // Dream wolves are visible to other werewolves but don't wake themselves.
  const visibleDreamWolves = state.seats
    .filter((s) => s.dealtRole === 'dreamWolf')
    .map((s) => s.index);
  const visible = [...otherWolves, ...visibleDreamWolves].sort((a, b) => a - b);
  const text =
    visible.length === 0
      ? 'You are the lone werewolf. You may peek a center card.'
      : `Werewolves: ${visible.map((i) => seatName(state, i)).join(', ')}.`;
  return addObservation(state, seat, {
    text,
    entries: visible.map((i) => ({
      label: seatName(state, i),
      position: { kind: 'seat', index: i },
    })),
  });
}

function isWerewolfDealtRole(r: OnuwRoleId): boolean {
  return (
    r === 'werewolf' || r === 'alphaWolf' || r === 'mysticWolf' || r === 'dreamWolf'
  );
}

export function applyLoneWolfPeek(
  state: OnuwPrivateState,
  seat: SeatIndex,
  centerIndex: number,
): OnuwPrivateState {
  const role = state.centerCards[centerIndex]!.role;
  return addObservation(state, seat, {
    text: `Center card you peeked: ${centerLabel(centerIndex)} = ${ROLES[role].name}.`,
    entries: [{ label: centerLabel(centerIndex), position: { kind: 'center', index: centerIndex }, role }],
  });
}

// === Minion =================================================================

export function applyMinionWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  // Minion sees the werewolves; werewolves do NOT see the minion.
  const wolves = state.seats
    .filter((s) => isWerewolfDealtRole(s.dealtRole))
    .map((s) => s.index);
  const text =
    wolves.length === 0
      ? 'No werewolves are awake — they\'re in the center. Try to throw the vote yourself.'
      : `Werewolves: ${wolves.map((i) => seatName(state, i)).join(', ')}. They do not know you.`;
  return addObservation(state, seat, {
    text,
    entries: wolves.map((i) => ({
      label: seatName(state, i),
      position: { kind: 'seat', index: i },
    })),
  });
}

// === Masons =================================================================

export function applyMasonWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  const masons = state.seats.filter((s) => s.dealtRole === 'mason').map((s) => s.index);
  const others = masons.filter((i) => i !== seat);
  const text =
    others.length === 0
      ? 'You are the only Mason awake. Your fellow Mason is in the center.'
      : `Other Masons: ${others.map((i) => seatName(state, i)).join(', ')}.`;
  return addObservation(state, seat, {
    text,
    entries: others.map((i) => ({
      label: seatName(state, i),
      position: { kind: 'seat', index: i },
    })),
  });
}

// === Insomniac ==============================================================

export function applyInsomniacWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  const role = state.seats[seat]!.finalRole;
  return addObservation(state, seat, {
    text: `End of night — your card is now: ${ROLES[role].name}.`,
    entries: [{ label: 'Your card', position: { kind: 'seat', index: seat }, role }],
  });
}

// === Daybreak ===============================================================

export function applyDoppelgangerCopy(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  // The Doppelganger LOOKS at the target's card and becomes that role.
  // Their finalRole becomes the target's role; if that role has a later
  // wake step, the Doppelganger will participate in it.
  const targetRole = state.seats[target]!.finalRole;
  let next = setSeat(state, seat, { finalRole: targetRole });
  next = addObservation(next, seat, {
    text: `You copied ${seatName(state, target)} — you are now the ${ROLES[targetRole].name}. You will act with that role.`,
    entries: [
      { label: seatName(state, target), position: { kind: 'seat', index: target }, role: targetRole },
    ],
  });
  // Inject the appropriate downstream step IF the copied role has a wake
  // order > Doppelganger's (so the Doppelganger acts in the target's slot
  // later in the night). We add a new schedule entry with `seats: [seat]`
  // and the copied role's wakeOrder.
  const copiedSpec = ROLES[targetRole];
  if (copiedSpec.wakeOrder > ROLES['doppelganger'].wakeOrder && copiedSpec.wakeOrder < 1000) {
    next = injectFollowupStep(next, seat, targetRole);
  }
  return next;
}

function injectFollowupStep(
  state: OnuwPrivateState,
  seat: SeatIndex,
  role: OnuwRoleId,
): OnuwPrivateState {
  const next = clone(state);
  const wo = ROLES[role].wakeOrder;
  // Find the index to insert at: first existing step whose role wakeOrder > wo
  // and whose stepIndex > current cursor.
  const schedule = next.nightSchedule.slice();
  let insertAt = schedule.length;
  for (let i = next.nightStepIndex + 1; i < schedule.length; i++) {
    if (ROLES[schedule[i]!.role].wakeOrder > wo) {
      insertAt = i;
      break;
    }
  }
  schedule.splice(insertAt, 0, {
    stepIndex: -1, // re-numbered below
    role,
    seats: [seat],
    resolved: false,
    interactive: ROLES[role].hasInteractiveAction,
  });
  // Re-number step indices to stay contiguous.
  for (let i = 0; i < schedule.length; i++) {
    schedule[i] = { ...schedule[i]!, stepIndex: i };
  }
  next.nightSchedule = schedule;
  return next;
}

export function applyApprenticeSeerLook(
  state: OnuwPrivateState,
  seat: SeatIndex,
  centerIndex: number,
): OnuwPrivateState {
  const role = state.centerCards[centerIndex]!.role;
  return addObservation(state, seat, {
    text: `${centerLabel(centerIndex)} = ${ROLES[role].name}.`,
    entries: [{ label: centerLabel(centerIndex), position: { kind: 'center', index: centerIndex }, role }],
  });
}

export function applyParanormalLook(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  const targetRole = state.seats[target]!.finalRole;
  let next = addObservation(state, seat, {
    text: `${seatName(state, target)} = ${ROLES[targetRole].name}.`,
    entries: [
      { label: seatName(state, target), position: { kind: 'seat', index: target }, role: targetRole },
    ],
  });
  const targetTeam = ROLES[targetRole].team;
  if (targetTeam === 'werewolves' || targetTeam === 'tanner') {
    // Investigator joins that team — flip their finalRole's bookkeeping by
    // setting a "team override" using a synthetic role. Simpler approach:
    // change finalRole to a copy of the target role so vote-resolution
    // already handles the team.
    next = setSeat(next, seat, { finalRole: targetRole });
    next = addObservation(next, seat, {
      text: `You felt the pull — you become the ${ROLES[targetRole].name}. Stop investigating.`,
      entries: [],
    });
  }
  return next;
}

export function applyWitchSwap(
  state: OnuwPrivateState,
  seat: SeatIndex,
  centerIndex: number,
  target: SeatIndex,
): OnuwPrivateState {
  // Witch: peek center card, then place it on target. The target's role
  // returns to the center slot.
  const centerRole = state.centerCards[centerIndex]!.role;
  let next = addObservation(state, seat, {
    text: `You peeked ${centerLabel(centerIndex)} = ${ROLES[centerRole].name}, then gave it to ${seatName(state, target)}.`,
    entries: [
      { label: centerLabel(centerIndex), position: { kind: 'center', index: centerIndex }, role: centerRole },
    ],
  });
  next = swapSeatWithCenter(next, target, centerIndex);
  return next;
}

export function applyVillageIdiotShift(
  state: OnuwPrivateState,
  seat: SeatIndex,
  direction: 'left' | 'right',
): OnuwPrivateState {
  // Rotate every seat's finalRole one slot in `direction`, EXCEPT seat
  // itself (the Idiot keeps their card). "Left" = role moves to lower
  // index; "right" = role moves to higher index. We collect all non-Idiot
  // seats in order and rotate.
  const next = clone(state);
  const others = next.seats.filter((s) => s.index !== seat);
  if (others.length === 0) return state;
  const roles = others.map((s) => s.finalRole);
  let rotated: OnuwRoleId[];
  if (direction === 'left') {
    rotated = [...roles.slice(1), roles[0]!];
  } else {
    rotated = [roles[roles.length - 1]!, ...roles.slice(0, -1)];
  }
  let idx = 0;
  next.seats = next.seats.map((s) => {
    if (s.index === seat) return s;
    return { ...s, finalRole: rotated[idx++]! };
  });
  return addObservation(next, seat, {
    text: `You shifted everyone's cards one slot to the ${direction}.`,
    entries: [],
  });
}

export function applyRevealerFlip(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  const targetRole = state.seats[target]!.finalRole;
  const team = ROLES[targetRole].team;
  let next = state;
  if (team === 'werewolves' || team === 'tanner') {
    next = addObservation(next, seat, {
      text: `You flipped ${seatName(state, target)} — they were a ${ROLES[targetRole].name}. You hide it again.`,
      entries: [
        { label: seatName(state, target), position: { kind: 'seat', index: target }, role: targetRole },
      ],
    });
  } else {
    next = addObservation(next, seat, {
      text: `You flipped ${seatName(state, target)} — they are the ${ROLES[targetRole].name}. The card stays face-up for the village.`,
      entries: [
        { label: seatName(state, target), position: { kind: 'seat', index: target }, role: targetRole },
      ],
    });
    // Make this public: append the observation to every other seat as a
    // public note. (Cheap implementation — observations are private, so
    // we'd actually want a separate public log. For now we narrate it on
    // the Revealer's own observation and rely on the player to announce.)
  }
  return next;
}

export function applyCuratorGive(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  // Curator gives a flavor artifact. We just narrate it.
  return addObservation(state, seat, {
    text: `You gave an artifact to ${seatName(state, target)}.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target } }],
  });
}

export function applyAlphaWolfConvert(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  // Alpha Wolf swaps the target's card with the "extra werewolf card"
  // (canonically a 4th werewolf card from the box). In our model, the
  // simplest equivalent is: the target's finalRole becomes 'werewolf'
  // and the displaced card goes to the center (slot 0).
  // We retain rule fidelity by NOT telling the target — they will only
  // discover their new role if something else (Insomniac etc.) tells them.
  let next = setSeat(state, target, { finalRole: 'werewolf' });
  next = addObservation(next, seat, {
    text: `${seatName(state, target)} is now a werewolf (they don't know it).`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target } }],
  });
  return next;
}

export function applyMysticWolfLook(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  const role = state.seats[target]!.finalRole;
  return addObservation(state, seat, {
    text: `${seatName(state, target)} = ${ROLES[role].name}.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target }, role }],
  });
}

// === Bonus roles ============================================================

export function applyBeholderWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  const seers = state.seats.filter((s) => s.dealtRole === 'seer').map((s) => s.index);
  const text =
    seers.length === 0
      ? 'The Seer card is in the center. You see no Seer awake.'
      : `Seer: ${seers.map((i) => seatName(state, i)).join(', ')}.`;
  return addObservation(state, seat, {
    text,
    entries: seers.map((i) => ({
      label: seatName(state, i),
      position: { kind: 'seat', index: i },
    })),
  });
}

export function applySquireWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  // Squire learns which positions (seat or center) currently hold a
  // werewolf card — at the time of waking (no swaps have happened yet).
  const wolfSeats = state.seats
    .filter((s) => isWerewolfDealtRole(s.dealtRole))
    .map((s) => ({ label: seatName(state, s.index), position: { kind: 'seat' as const, index: s.index } }));
  const wolfCenter = state.centerCards
    .filter((c) => isWerewolfDealtRole(c.role))
    .map((c) => ({ label: centerLabel(c.index), position: { kind: 'center' as const, index: c.index } }));
  const all = [...wolfSeats, ...wolfCenter];
  return addObservation(state, seat, {
    text: all.length === 0 ? 'No werewolf cards are in play (impossible!).' : `Werewolf cards: ${all.map((e) => e.label).join(', ')}.`,
    entries: all,
  });
}

export function applyEmpathWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  const n = state.seats.length;
  const left = (seat - 1 + n) % n;
  const right = (seat + 1) % n;
  const neighborSeats = [left, right];
  const wolfCount = neighborSeats.filter((i) => isWerewolfDealtRole(state.seats[i]!.dealtRole)).length;
  return addObservation(state, seat, {
    text: `Among your two neighbors (${seatName(state, left)}, ${seatName(state, right)}), there are ${wolfCount} werewolves.`,
    entries: neighborSeats.map((i) => ({ label: seatName(state, i), position: { kind: 'seat' as const, index: i } })),
  });
}

export function applyAuraSeerWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  // Count seats with a dealt role that has a wakeOrder < 1000 (i.e. acts at night).
  const wokeCount = state.seats.filter((s) => ROLES[s.dealtRole].wakeOrder < 1000 && s.index !== seat).length;
  return addObservation(state, seat, {
    text: `${wokeCount} other players woke up at night.`,
    entries: [],
  });
}

export function applyThingTap(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  return addObservation(state, seat, {
    text: `You tapped ${seatName(state, target)}.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target } }],
  });
}

export function applyBodySnatcherSwap(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  let next = swapSeatWithSeat(state, seat, target);
  const newRole = next.seats[seat]!.finalRole;
  next = addObservation(next, seat, {
    text: `You stole ${seatName(state, target)}'s body. You are now the ${ROLES[newRole].name}.`,
    entries: [
      { label: seatName(state, target), position: { kind: 'seat', index: target }, role: newRole },
    ],
  });
  return next;
}

export function applyWindyWendyShift(
  state: OnuwPrivateState,
  seat: SeatIndex,
  source: SeatIndex,
  direction: 'left' | 'right',
): OnuwPrivateState {
  const n = state.seats.length;
  const targetSeat = direction === 'left' ? (source - 1 + n) % n : (source + 1) % n;
  let next = swapSeatWithSeat(state, source, targetSeat);
  next = addObservation(next, seat, {
    text: `You shifted ${seatName(state, source)}'s card to ${seatName(state, targetSeat)}.`,
    entries: [
      { label: seatName(state, source), position: { kind: 'seat', index: source } },
      { label: seatName(state, targetSeat), position: { kind: 'seat', index: targetSeat } },
    ],
  });
  return next;
}

export function applyDefenderProtect(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  return addObservation(state, seat, {
    text: `You silently protect ${seatName(state, target)}.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target } }],
  });
}

// === Auto / passive wake steps =============================================
//
// Some roles auto-resolve when their step comes up (no action submitted):
// Dream Wolf (no observation), Innocent Bystander, etc. We expose a single
// "runAutoStep" helper so the dispatch can call it once and move on.

export function runAutoStep(state: OnuwPrivateState, role: OnuwRoleId, seats: readonly SeatIndex[]): OnuwPrivateState {
  let next = state;
  switch (role) {
    case 'werewolf':
    case 'alphaWolf':
    case 'mysticWolf':
      // The wake observation is the same for every wolf seat — see the
      // others. We auto-apply this so the seat just confirms the view.
      for (const s of seats) next = applyWerewolfWake(next, s);
      return next;
    case 'dreamWolf':
      // No-op (Dream Wolf stays asleep).
      return next;
    case 'minion':
      for (const s of seats) next = applyMinionWake(next, s);
      return next;
    case 'mason':
      for (const s of seats) next = applyMasonWake(next, s);
      return next;
    case 'insomniac':
      for (const s of seats) next = applyInsomniacWake(next, s);
      return next;
    case 'beholder':
      for (const s of seats) next = applyBeholderWake(next, s);
      return next;
    case 'squire':
      for (const s of seats) next = applySquireWake(next, s);
      return next;
    case 'empath':
      for (const s of seats) next = applyEmpathWake(next, s);
      return next;
    case 'auraSeer':
      for (const s of seats) next = applyAuraSeerWake(next, s);
      return next;
    default:
      return next;
  }
}

// Some auto roles still want an "ack" from each seat so the host can move
// the cursor only after every owning seat has tapped through. The list
// below identifies which observational-only roles surface a per-seat
// "I saw it" gate.
export const OBSERVATIONAL_ROLES_NEED_ACK: ReadonlySet<OnuwRoleId> = new Set<OnuwRoleId>([
  'werewolf',
  'alphaWolf',
  'mysticWolf',
  'minion',
  'mason',
  'insomniac',
  'beholder',
  'squire',
  'empath',
  'auraSeer',
]);
