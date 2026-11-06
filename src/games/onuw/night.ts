import type { SeatIndex } from '@/engine/types';
import { AWAKE_WOLF_CARDS, ROLES, isWerewolfCard } from './roles';
import type {
  OnuwNightObservation,
  OnuwNightStep,
  OnuwPrivateState,
  OnuwRoleId,
  OnuwSeatState,
} from './state';

// ============================================================================
// Night-action helpers
//
// Each helper takes the current state, the acting seat, and any action
// parameters, and returns the next state. They copy; never mutate.
//
// Looking at a card always shows its PRINTED face (`finalCard` / `card`);
// teams and win conditions use the EFFECTIVE role (`finalRole` / `role`).
// ============================================================================

function clone(state: OnuwPrivateState): OnuwPrivateState {
  return {
    ...state,
    seats: state.seats.map((s) => ({ ...s, observations: s.observations.slice() })),
    centerCards: state.centerCards.map((c) => ({ ...c })),
    nightSchedule: state.nightSchedule.map((step) => ({ ...step, seats: step.seats.slice() })),
    nightStepAcks: { ...state.nightStepAcks },
    piLooks: { ...state.piLooks },
    witchPeeks: { ...state.witchPeeks },
    alphaCenter: state.alphaCenter.slice(),
    revealed: state.revealed.slice(),
    setupAcked: { ...state.setupAcked },
    voteAcks: state.voteAcks.slice(),
    rolePool: state.rolePool.slice(),
    killedSeats: state.killedSeats.slice(),
    winners: state.winners.slice(),
    winningTeams: state.winningTeams.slice(),
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

export function addObservation(
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

function roleName(role: OnuwRoleId): string {
  return ROLES[role].name;
}

function neighbors(state: OnuwPrivateState, seat: SeatIndex): [SeatIndex, SeatIndex] {
  const n = state.seats.length;
  return [(seat - 1 + n) % n, (seat + 1) % n];
}

// === Who-is-who at wake time ================================================

// The role the Doppelganger copied, if `seat` is the Doppelganger.
function doppelRoleOf(state: OnuwPrivateState, seat: SeatIndex): OnuwRoleId | null {
  return state.doppelCopy && state.doppelCopy.seat === seat ? state.doppelCopy.role : null;
}

// Seats that open their eyes at the werewolf wake-up: dealt Werewolf /
// Alpha Wolf / Mystic Wolf, plus a Doppelganger that copied one of them.
export function awakeWolfSeats(state: OnuwPrivateState): SeatIndex[] {
  return state.seats
    .filter((s) => AWAKE_WOLF_CARDS.has(s.dealtRole) || AWAKE_WOLF_CARDS.has(doppelRoleOf(state, s.index) ?? 'villager'))
    .map((s) => s.index);
}

// Dream Wolves (incl. a Doppel-Dream Wolf): asleep, but they stick a thumb
// out so the other werewolves (and the Minion) see them.
function dreamWolfSeats(state: OnuwPrivateState): SeatIndex[] {
  return state.seats
    .filter((s) => s.dealtRole === 'dreamWolf' || doppelRoleOf(state, s.index) === 'dreamWolf')
    .map((s) => s.index);
}

// Werewolves `seat` sees at the werewolf wake-up (everyone but itself).
export function wolvesVisibleTo(state: OnuwPrivateState, seat: SeatIndex): SeatIndex[] {
  return [...awakeWolfSeats(state), ...dreamWolfSeats(state)]
    .filter((i, k, arr) => i !== seat && arr.indexOf(i) === k)
    .sort((a, b) => a - b);
}

export function isLoneWolf(state: OnuwPrivateState, seat: SeatIndex): boolean {
  return awakeWolfSeats(state).includes(seat) && wolvesVisibleTo(state, seat).length === 0;
}

// === Swap helpers ============================================================

export function swapSeatWithSeat(
  state: OnuwPrivateState,
  a: SeatIndex,
  b: SeatIndex,
): OnuwPrivateState {
  if (a === b) return state;
  const next = clone(state);
  const A = next.seats[a]!;
  const B = next.seats[b]!;
  next.seats[a] = { ...A, finalRole: B.finalRole, finalCard: B.finalCard };
  next.seats[b] = { ...B, finalRole: A.finalRole, finalCard: A.finalCard };
  return next;
}

export function swapSeatWithCenter(
  state: OnuwPrivateState,
  seat: SeatIndex,
  centerIndex: number,
): OnuwPrivateState {
  const next = clone(state);
  const S = next.seats[seat]!;
  const C = next.centerCards[centerIndex]!;
  next.seats[seat] = { ...S, finalRole: C.role, finalCard: C.card };
  next.centerCards[centerIndex] = { ...C, role: S.finalRole, card: S.finalCard };
  return next;
}

// === Base game ===============================================================

export function applySeerLookSeat(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  const card = state.seats[target]!.finalCard;
  return addObservation(state, seat, {
    text: `You looked at ${seatName(state, target)}'s card: the ${roleName(card)}.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target }, role: card }],
  });
}

export function applySeerLookCenter(
  state: OnuwPrivateState,
  seat: SeatIndex,
  centerIndices: [number, number],
): OnuwPrivateState {
  const [a, b] = centerIndices;
  const cardA = state.centerCards[a]!.card;
  const cardB = state.centerCards[b]!.card;
  return addObservation(state, seat, {
    text: `You looked at two center cards: ${centerLabel(a)} is the ${roleName(cardA)}, ${centerLabel(b)} is the ${roleName(cardB)}.`,
    entries: [
      { label: centerLabel(a), position: { kind: 'center', index: a }, role: cardA },
      { label: centerLabel(b), position: { kind: 'center', index: b }, role: cardB },
    ],
  });
}

export function applyRobberSwap(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  let next = swapSeatWithSeat(state, seat, target);
  const me = next.seats[seat]!;
  next = addObservation(next, seat, {
    text: `You stole ${seatName(state, target)}'s card and looked at it: the ${roleName(me.finalCard)}. You are now ${me.finalCard === me.finalRole ? 'that role' : 'whatever it became'}.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target }, role: me.finalCard }],
    youBecome: me.finalCard,
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
    text: `You swapped ${seatName(state, a)}'s and ${seatName(state, b)}'s cards.`,
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
    text: `You swapped your card with ${centerLabel(centerIndex)} without looking. You no longer know what you are.`,
    entries: [{ label: centerLabel(centerIndex), position: { kind: 'center', index: centerIndex } }],
    youBecome: 'unknown',
  });
  return next;
}

// === Werewolves =============================================================

export function applyWerewolfWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  const visible = wolvesVisibleTo(state, seat);
  const text =
    visible.length === 0
      ? 'You are the only werewolf. You may look at one center card.'
      : `Your fellow werewolves: ${visible.map((i) => seatName(state, i)).join(', ')}.`;
  return addObservation(state, seat, {
    text,
    entries: visible.map((i) => ({
      label: seatName(state, i),
      position: { kind: 'seat' as const, index: i },
      shownAs: 'werewolf' as const,
    })),
  });
}

export function applyLoneWolfPeek(
  state: OnuwPrivateState,
  seat: SeatIndex,
  centerIndex: number,
): OnuwPrivateState {
  const card = state.centerCards[centerIndex]!.card;
  return addObservation(state, seat, {
    text: `You looked at ${centerLabel(centerIndex)}: the ${roleName(card)}.`,
    entries: [{ label: centerLabel(centerIndex), position: { kind: 'center', index: centerIndex }, role: card }],
  });
}

// === Minion =================================================================

export function applyMinionWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  // Minion sees every werewolf (incl. Dream Wolf and a Doppel-werewolf);
  // the werewolves do NOT see the Minion.
  const wolves = [...awakeWolfSeats(state), ...dreamWolfSeats(state)]
    .filter((i, k, arr) => i !== seat && arr.indexOf(i) === k)
    .sort((a, b) => a - b);
  const text =
    wolves.length === 0
      ? 'No player is a werewolf — they are all in the center. Get someone else killed.'
      : `The werewolves: ${wolves.map((i) => seatName(state, i)).join(', ')}. They do not know you.`;
  return addObservation(state, seat, {
    text,
    entries: wolves.map((i) => ({
      label: seatName(state, i),
      position: { kind: 'seat' as const, index: i },
      shownAs: 'werewolf' as const,
    })),
  });
}

// === Masons =================================================================

export function applyMasonWake(state: OnuwPrivateState, seat: SeatIndex, stepSeats: readonly SeatIndex[]): OnuwPrivateState {
  const others = stepSeats.filter((i) => i !== seat);
  const text =
    others.length === 0
      ? 'You are the only Mason awake.'
      : `Your fellow Mason${others.length > 1 ? 's' : ''}: ${others.map((i) => seatName(state, i)).join(', ')}.`;
  return addObservation(state, seat, {
    text,
    entries: others.map((i) => ({
      label: seatName(state, i),
      position: { kind: 'seat' as const, index: i },
      shownAs: 'mason' as const,
    })),
  });
}

// === Insomniac ==============================================================

export function applyInsomniacWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  const me = state.seats[seat]!;
  return addObservation(state, seat, {
    text: `You looked at your own card at the end of the night: the ${roleName(me.finalCard)}.`,
    entries: [{ label: 'Your card', position: { kind: 'seat', index: seat }, role: me.finalCard }],
    youBecome: me.finalCard,
  });
}

// === Daybreak ===============================================================

export function applyDoppelgangerCopy(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  // The Doppelganger LOOKS at the target's card and becomes that role. The
  // Doppelganger card itself now counts as that role (effective), wherever
  // it travels — the printed card stays "Doppelganger".
  const copied = state.seats[target]!.finalCard;
  let next = setSeat(state, seat, { finalRole: copied });
  next = { ...next, doppelCopy: { seat, role: copied } };
  const mode = ROLES[copied].doppel;
  const how =
    mode === 'now'
      ? ' Take that action now.'
      : mode === 'join'
        ? ` You will wake with the ${roleName(copied)}.`
        : mode === 'after'
          ? ` You will wake again after the ${roleName(copied)}.`
          : '';
  next = addObservation(next, seat, {
    text: `You looked at ${seatName(state, target)}'s card: the ${roleName(copied)}. You are now the ${roleName(copied)}.${how}`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target }, role: copied }],
    youBecome: copied,
  });
  return scheduleDoppelganger(next, seat, copied);
}

// Place the Doppelganger in the rest of the night according to the copied
// role's `doppel` mode. The schedule is built from the full role pool, so
// the copied role's own step always exists.
function scheduleDoppelganger(
  state: OnuwPrivateState,
  seat: SeatIndex,
  copied: OnuwRoleId,
): OnuwPrivateState {
  const mode = ROLES[copied].doppel;
  if (!mode) return state;
  const next = clone(state);
  const schedule = next.nightSchedule;
  const later = (i: number) => i > next.nightStepIndex;
  const fresh = (role: OnuwRoleId): OnuwNightStep => ({
    stepIndex: -1,
    role,
    seats: [seat],
    doppel: true,
    resolved: false,
    interactive: ROLES[role].hasInteractiveAction,
  });
  if (mode === 'now') {
    schedule.splice(next.nightStepIndex + 1, 0, fresh(copied));
  } else if (mode === 'join') {
    // Werewolf variants all open their eyes at the shared werewolf wake.
    const joinRoles: OnuwRoleId[] = AWAKE_WOLF_CARDS.has(copied) ? ['werewolf', copied] : [copied];
    for (const role of new Set(joinRoles)) {
      const i = schedule.findIndex((s, k) => later(k) && s.role === role && !s.doppel);
      if (i >= 0) schedule[i] = { ...schedule[i]!, seats: [...schedule[i]!.seats, seat] };
      else schedule.splice(insertionPoint(next, role), 0, fresh(role));
    }
  } else {
    let i = -1;
    schedule.forEach((s, k) => {
      if (later(k) && s.role === copied) i = k;
    });
    schedule.splice(i >= 0 ? i + 1 : insertionPoint(next, copied), 0, fresh(copied));
  }
  next.nightSchedule = schedule.map((s, i) => ({ ...s, stepIndex: i }));
  return next;
}

function insertionPoint(state: OnuwPrivateState, role: OnuwRoleId): number {
  const wo = ROLES[role].wakeOrder;
  for (let i = state.nightStepIndex + 1; i < state.nightSchedule.length; i++) {
    if (ROLES[state.nightSchedule[i]!.role].wakeOrder > wo) return i;
  }
  return state.nightSchedule.length;
}

export function applyApprenticeSeerLook(
  state: OnuwPrivateState,
  seat: SeatIndex,
  centerIndex: number,
): OnuwPrivateState {
  const card = state.centerCards[centerIndex]!.card;
  return addObservation(state, seat, {
    text: `You looked at ${centerLabel(centerIndex)}: the ${roleName(card)}.`,
    entries: [{ label: centerLabel(centerIndex), position: { kind: 'center', index: centerIndex }, role: card }],
  });
}

// Returns the state plus whether the PI converted (and must stop).
export function applyParanormalLook(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): { state: OnuwPrivateState; converted: boolean } {
  const card = state.seats[target]!.finalCard;
  const convert = isWerewolfCard(card) || ROLES[card].team === 'tanner';
  let next = addObservation(state, seat, {
    text: convert
      ? `You looked at ${seatName(state, target)}'s card: the ${roleName(card)}. You feel the pull — you are now the ${roleName(card)}, and must stop.`
      : `You looked at ${seatName(state, target)}'s card: the ${roleName(card)}.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target }, role: card }],
    ...(convert ? { youBecome: card } : {}),
  });
  if (convert) {
    // The PI's card now counts as that role (team + win condition).
    next = setSeat(next, seat, { finalRole: card });
  }
  next = { ...next, piLooks: { ...next.piLooks, [seat]: [...(next.piLooks[seat] ?? []), target] } };
  return { state: next, converted: convert };
}

// Witch, part 1: look at a center card. She must then hand it out.
export function applyWitchLook(
  state: OnuwPrivateState,
  seat: SeatIndex,
  centerIndex: number,
): OnuwPrivateState {
  const card = state.centerCards[centerIndex]!.card;
  const next = addObservation(state, seat, {
    text: `You looked at ${centerLabel(centerIndex)}: the ${roleName(card)}. Now you must give it to a player.`,
    entries: [{ label: centerLabel(centerIndex), position: { kind: 'center', index: centerIndex }, role: card }],
  });
  return { ...next, witchPeeks: { ...next.witchPeeks, [seat]: centerIndex } };
}

// Witch, part 2: exchange the looked-at center card with any player's card
// (including her own). Without a prior look, she looks first.
export function applyWitchSwap(
  state: OnuwPrivateState,
  seat: SeatIndex,
  centerIndex: number,
  target: SeatIndex,
): OnuwPrivateState {
  let next = state.witchPeeks[seat] === centerIndex ? state : applyWitchLook(state, seat, centerIndex);
  const card = next.centerCards[centerIndex]!.card;
  const self = target === seat;
  next = addObservation(next, seat, {
    text: `You gave ${centerLabel(centerIndex)} (the ${roleName(card)}) to ${self ? 'yourself' : seatName(state, target)}; their old card went to the center.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target }, ...(self ? { role: card } : {}) }],
    ...(self ? { youBecome: card } : {}),
  });
  next = swapSeatWithCenter(next, target, centerIndex);
  return next;
}

export function applyVillageIdiotShift(
  state: OnuwPrivateState,
  seat: SeatIndex,
  direction: 'left' | 'right',
): OnuwPrivateState {
  // Move every card except the Idiot's own one seat to the left (towards
  // lower indices) or right (towards higher indices), skipping the Idiot.
  const next = clone(state);
  const others = next.seats.filter((s) => s.index !== seat);
  if (others.length < 2) return state;
  const cards = others.map((s) => ({ role: s.finalRole, card: s.finalCard }));
  const rotated =
    direction === 'left' ? [...cards.slice(1), cards[0]!] : [cards[cards.length - 1]!, ...cards.slice(0, -1)];
  let idx = 0;
  next.seats = next.seats.map((s) => {
    if (s.index === seat) return s;
    const c = rotated[idx++]!;
    return { ...s, finalRole: c.role, finalCard: c.card };
  });
  return addObservation(next, seat, {
    text: `You moved everyone else's card one seat to the ${direction}.`,
    entries: [],
  });
}

export function applyRevealerFlip(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  const card = state.seats[target]!.finalCard;
  const hide = isWerewolfCard(card) || ROLES[card].team === 'tanner';
  let next = addObservation(state, seat, {
    text: hide
      ? `You flipped ${seatName(state, target)}'s card: the ${roleName(card)}. You turned it back face-down.`
      : `You flipped ${seatName(state, target)}'s card: the ${roleName(card)}. It stays face-up for everyone to see.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target }, role: card }],
  });
  if (!hide) {
    next = { ...next, revealed: [...next.revealed, { seat: target, card }] };
  }
  return next;
}

export function applyCuratorGive(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  // Artifacts are flavor in this build — narrate only.
  return addObservation(state, seat, {
    text: `You placed an artifact on ${seatName(state, target)}'s card.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target } }],
  });
}

export function applyAlphaWolfConvert(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  // Exchange the center werewolf card with the target's card. The displaced
  // card goes to the Alpha's center slot. The target is NOT told.
  const t = state.seats[target]!;
  let next = setSeat(state, target, { finalRole: 'werewolf', finalCard: 'werewolf' });
  next = { ...next, alphaCenter: [...next.alphaCenter, { role: t.finalRole, card: t.finalCard }] };
  next = addObservation(next, seat, {
    text: `You gave ${seatName(state, target)} the center werewolf card. They are now a werewolf (and don't know it).`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target }, role: 'werewolf' }],
  });
  return next;
}

export function applyMysticWolfLook(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  const card = state.seats[target]!.finalCard;
  return addObservation(state, seat, {
    text: `You looked at ${seatName(state, target)}'s card: the ${roleName(card)}.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target }, role: card }],
  });
}

// === Bonus roles ============================================================

export function applyBeholderWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  const seers = state.seats
    .filter((s) => s.index !== seat && (s.dealtRole === 'seer' || doppelRoleOf(state, s.index) === 'seer'))
    .map((s) => s.index);
  const text =
    seers.length === 0
      ? 'No player is the Seer — the Seer card is in the center.'
      : `The Seer: ${seers.map((i) => seatName(state, i)).join(', ')}.`;
  return addObservation(state, seat, {
    text,
    entries: seers.map((i) => ({
      label: seatName(state, i),
      position: { kind: 'seat' as const, index: i },
      shownAs: 'seer' as const,
    })),
  });
}

export function applySquireWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  // House variant: the Squire learns which positions (seats or center)
  // currently hold a werewolf CARD — not which werewolf it is.
  const wolfSeats = state.seats
    .filter((s) => s.index !== seat && isWerewolfCard(s.finalCard))
    .map((s) => ({
      label: seatName(state, s.index),
      position: { kind: 'seat' as const, index: s.index },
      shownAs: 'werewolf' as const,
    }));
  const wolfCenter = state.centerCards
    .filter((c) => isWerewolfCard(c.card))
    .map((c) => ({
      label: centerLabel(c.index),
      position: { kind: 'center' as const, index: c.index },
      shownAs: 'werewolf' as const,
    }));
  const all = [...wolfSeats, ...wolfCenter];
  return addObservation(state, seat, {
    text:
      all.length === 0
        ? 'There are no werewolf cards anywhere you can see.'
        : `Werewolf cards lie at: ${all.map((e) => e.label).join(', ')}.`,
    entries: all,
  });
}

export function applyEmpathWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  const [left, right] = neighbors(state, seat);
  const near = left === right ? [left] : [left, right];
  const wolfCount = near.filter((i) => isWerewolfCard(state.seats[i]!.finalCard)).length;
  return addObservation(state, seat, {
    text: `Among your neighbors (${near.map((i) => seatName(state, i)).join(', ')}), ${wolfCount === 1 ? 'there is 1 werewolf' : `there are ${wolfCount} werewolves`}.`,
    entries: [],
  });
}

export function applyAuraSeerWake(state: OnuwPrivateState, seat: SeatIndex): OnuwPrivateState {
  // House variant: count the OTHER seats that woke at any point tonight.
  const woke = new Set<SeatIndex>();
  for (const step of state.nightSchedule) for (const s of step.seats) woke.add(s);
  woke.delete(seat);
  return addObservation(state, seat, {
    text: `${woke.size} other player${woke.size === 1 ? '' : 's'} woke up during the night.`,
    entries: [],
  });
}

export function applyThingTap(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  let next = addObservation(state, seat, {
    text: `You tapped ${seatName(state, target)} on the shoulder.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target } }],
  });
  // The tapped player feels it — they learn The Thing sits beside them.
  next = addObservation(next, target, {
    text: `In the night, someone tapped your shoulder: ${seatName(state, seat)} is The Thing.`,
    entries: [{ label: seatName(state, seat), position: { kind: 'seat', index: seat }, shownAs: 'thing' }],
  });
  return next;
}

export function applyBodySnatcherSwap(
  state: OnuwPrivateState,
  seat: SeatIndex,
  target: SeatIndex,
): OnuwPrivateState {
  let next = swapSeatWithSeat(state, seat, target);
  const me = next.seats[seat]!;
  next = addObservation(next, seat, {
    text: `You took ${seatName(state, target)}'s body: you now hold the ${roleName(me.finalCard)}.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target }, role: me.finalCard }],
    youBecome: me.finalCard,
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
    text: `You blew ${seatName(state, source)}'s card over to ${seatName(state, targetSeat)} (and theirs back).`,
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
    text: `You silently watched over ${seatName(state, target)}.`,
    entries: [{ label: seatName(state, target), position: { kind: 'seat', index: target } }],
  });
}

// === Auto / observational wake steps =======================================
//
// Observation-only roles get their information the moment their step comes
// up; the seat then acknowledges with `nightAck`.

export function runAutoStep(state: OnuwPrivateState, step: OnuwNightStep): OnuwPrivateState {
  let next = state;
  const seats = step.seats;
  switch (step.role) {
    case 'werewolf':
      for (const s of seats) next = applyWerewolfWake(next, s);
      return next;
    case 'minion':
      for (const s of seats) next = applyMinionWake(next, s);
      return next;
    case 'mason':
      for (const s of seats) next = applyMasonWake(next, s, seats);
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

export const OBSERVATIONAL_ROLES: ReadonlySet<OnuwRoleId> = new Set<OnuwRoleId>([
  'werewolf',
  'minion',
  'mason',
  'insomniac',
  'beholder',
  'squire',
  'empath',
  'auraSeer',
]);
