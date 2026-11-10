import { makeRng, rngInt, rngShuffle } from '@/engine/rng';
import type { GameConfig, SeatIndex } from '@/engine/types';
import { secretHitlerModule } from './module';
import { buildPartyKnowledge } from './setup';
import { SHARED_ACK_PHASES } from './rules';
import type { ShAction } from './actions';
import type { ShPrivateState, ShRoleId } from './state';

// Test-only helpers shared by the Secret Hitler test files (not imported by
// app code). Kept framework-free: failures throw.

export function configFor(
  playerCount: number,
  seed = 42,
  opts: { aiSeats?: SeatIndex[] | 'all'; rebalanced6p?: boolean } = {},
): GameConfig {
  const ai = opts.aiSeats ?? [];
  return {
    gameId: 'secret-hitler',
    seats: [],
    seed,
    gameOptions: {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: `P${i + 1}`,
        isAI: ai === 'all' ? true : ai.includes(i),
      })),
      rebalanced6p: opts.rebalanced6p ?? false,
    },
  };
}

export interface SelfPlayResult {
  state: ShPrivateState;
  steps: number;
}

/**
 * Drive a game with the AI. Seats in `humanSeats` are played by the same AI
 * logic but also dismiss shared reveal screens (which AI leaves to humans).
 * Every proposed action must be legal; a step where nobody can act throws.
 */
export function playSelf(
  config: GameConfig,
  opts: { humanSeats?: SeatIndex[]; visit?: (s: ShPrivateState) => void; maxSteps?: number } = {},
): SelfPlayResult {
  const mod = secretHitlerModule;
  const humans = new Set(opts.humanSeats ?? []);
  let state = mod.createInitialState(config);
  const n = state.seats.length;
  const maxSteps = opts.maxSteps ?? 5000;
  let cursor = 0;
  for (let step = 0; step < maxSteps; step++) {
    opts.visit?.(state);
    if (mod.isFinished(state)) return { state, steps: step };
    let next: ShPrivateState | null = null;
    for (let k = 0; k < n && !next; k++) {
      const seat = (cursor + k) % n;
      const action = mod.aiChooseAction!(state, seat);
      if (!action) continue;
      if (action.bySeat !== seat) {
        throw new Error(`seat ${seat} proposed an action for seat ${action.bySeat}`);
      }
      next = applyOrExplain(state, action, seat);
      cursor = (seat + 1) % n;
    }
    if (!next && humans.size > 0 && SHARED_ACK_PHASES.has(state.phase)) {
      const human = [...humans][0]!;
      next = applyOrExplain(state, sharedAck(state, human), human);
    }
    if (!next) throw new Error(`stalled in phase ${state.phase} at step ${step}`);
    state = next;
  }
  throw new Error(`game did not finish within ${maxSteps} steps (phase ${state.phase})`);
}

function sharedAck(state: ShPrivateState, seat: SeatIndex): ShAction {
  if (state.phase === 'electionReveal') return { type: 'ackElectionReveal', bySeat: seat };
  if (state.phase === 'policyReveal') return { type: 'ackPolicyReveal', bySeat: seat };
  return { type: 'ackTopDeckReveal', bySeat: seat };
}

function applyOrExplain(state: ShPrivateState, action: ShAction, seat: SeatIndex): ShPrivateState {
  try {
    return secretHitlerModule.applyAction(state, action, `ai:${seat}`);
  } catch (e) {
    throw new Error(
      `illegal AI action ${JSON.stringify(action)} in phase ${state.phase}: ${(e as Error).message}`,
    );
  }
}

/** Which seats' roles `viewer` is entitled to know (incl. itself). */
export function knownRoleSeats(state: ShPrivateState, viewer: SeatIndex | null): Set<SeatIndex> {
  const known = new Set<SeatIndex>();
  if (state.phase === 'gameOver') {
    for (const s of state.seats) known.add(s.index);
    return known;
  }
  if (viewer === null) return known;
  known.add(viewer);
  for (const k of buildPartyKnowledge(state.seats)[viewer] ?? []) known.add(k.seat);
  return known;
}

/**
 * Re-randomise every piece of hidden information `viewer` is NOT entitled
 * to: other seats' roles (keeping the role multiset), parties of seats the
 * viewer hasn't investigated, the order/content split of deck + discard +
 * hand, and other seats' sealed ballots. If redaction is correct, the
 * viewer's view (and the AI's decision for that seat) can't change.
 */
export function permuteHidden(
  state: ShPrivateState,
  viewer: SeatIndex | null,
  salt: number,
): ShPrivateState {
  if (state.phase === 'gameOver') return state;
  const rng = makeRng(salt >>> 0);

  // --- Roles ---------------------------------------------------------------
  const fixed = knownRoleSeats(state, viewer);
  if (viewer !== null) {
    for (const inv of state.investigations) if (inv.by === viewer) fixed.add(inv.target);
  }
  const free = state.seats.filter((s) => !fixed.has(s.index)).map((s) => s.index);
  const shuffledRoles = rngShuffle(
    rng,
    free.map((i) => state.seats[i]!.role),
  );
  const roleOf = new Map<SeatIndex, ShRoleId>(free.map((seat, k) => [seat, shuffledRoles[k]!]));
  let seats = state.seats.map((s) => {
    const role = roleOf.get(s.index) ?? s.role;
    return { ...s, role, party: role === 'liberal' ? ('liberal' as const) : ('fascist' as const) };
  });

  // --- Sealed ballots --------------------------------------------------------
  if (state.phase === 'electionVote') {
    seats = seats.map((s) =>
      s.index !== viewer && s.voteCast !== null
        ? { ...s, voteCast: rngInt(rng, 2) === 0 ? ('ja' as const) : ('nein' as const) }
        : s,
    );
  }

  const partyOf = (i: SeatIndex) => seats[i]!.party;
  const investigations = state.investigations.map((inv) => ({ ...inv, party: partyOf(inv.target) }));
  const pendingInvestigation = state.pendingInvestigation
    ? { ...state.pendingInvestigation, party: partyOf(state.pendingInvestigation.target) }
    : null;

  // --- Policy cards ----------------------------------------------------------
  const chancellorStep =
    state.phase === 'legislativeChancellor' || state.phase === 'vetoRequested';
  const handKnown =
    viewer !== null &&
    ((state.phase === 'legislativePresident' && viewer === state.presidentSeat) ||
      (chancellorStep &&
        (viewer === state.presidentSeat || viewer === state.chancellorCandidateSeat)));
  const peekKnown =
    viewer !== null && state.phase === 'execPeek' && state.pendingPeek?.by === viewer;
  const fixedTop = peekKnown ? 3 : 0;
  const deckTop = state.policyDeck.slice(0, fixedTop);
  const deckRest = state.policyDeck.slice(fixedTop);
  const pool = rngShuffle(rng, [
    ...deckRest,
    ...state.policyDiscard,
    ...(handKnown ? [] : state.legislativeHand),
  ]);
  let k = 0;
  const take = (len: number) => {
    const out = pool.slice(k, k + len);
    k += len;
    return out;
  };
  const policyDeck = [...deckTop, ...take(deckRest.length)];
  const policyDiscard = take(state.policyDiscard.length);
  const legislativeHand = handKnown ? state.legislativeHand.slice() : take(state.legislativeHand.length);
  const pendingPeek = state.pendingPeek
    ? { ...state.pendingPeek, policies: policyDeck.slice(0, 3) }
    : null;

  return {
    ...state,
    seats,
    investigations,
    pendingInvestigation,
    policyDeck,
    policyDiscard,
    legislativeHand,
    pendingPeek,
  };
}

/** Recursively collect every object key in a JSON-ish value. */
export function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) allKeys(v, out);
  } else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      out.add(key);
      allKeys(v, out);
    }
  }
  return out;
}
