import { makeRng, rngInt, rngShuffle } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import { alignmentCounts, FASCIST_POLICY_COUNT, LIBERAL_POLICY_COUNT } from './tracks';
import type { ShPolicy, ShPrivateState, ShRoleId, ShSeatState } from './state';

// Deal roles using the seeded RNG. Returns one ShRoleId per seat in seat order.
export function dealRoles(playerCount: number, seed: number): ShRoleId[] {
  const { liberals, fascists } = alignmentCounts(playerCount);
  const pool: ShRoleId[] = [];
  for (let i = 0; i < liberals; i++) pool.push('liberal');
  // Hitler is one fascist seat; remaining fascists are 'fascist'.
  pool.push('hitler');
  for (let i = 0; i < fascists - 1; i++) pool.push('fascist');
  if (pool.length !== playerCount) {
    throw new Error(
      `Secret Hitler role-pool size ${pool.length} ≠ ${playerCount} players`,
    );
  }
  const rng = makeRng(seed);
  return rngShuffle(rng, pool);
}

export function makeSeats(playerNames: string[], roles: ShRoleId[]): ShSeatState[] {
  if (playerNames.length !== roles.length) {
    throw new Error('name/role count mismatch');
  }
  return roles.map((role, i) => ({
    index: i,
    name: playerNames[i] ?? `Seat ${i + 1}`,
    role,
    party: role === 'liberal' ? 'liberal' : 'fascist',
    alive: true,
    voteCast: null,
    hasBeenInvestigated: false,
  }));
}

// Pick the starting president using the seeded RNG. Derived seed so the deal
// and the leader-pick don't share an "interesting" stream slot.
export function pickStartingPresident(playerCount: number, seed: number): SeatIndex {
  const rng = makeRng(seed ^ 0x5a17_a1eb);
  return rngInt(rng, playerCount);
}

// Build the initial 17-card policy deck (6 liberal, 11 fascist) shuffled
// with the seeded RNG.
export function buildInitialDeck(seed: number): ShPolicy[] {
  const deck: ShPolicy[] = [];
  for (let i = 0; i < LIBERAL_POLICY_COUNT; i++) deck.push('liberal');
  for (let i = 0; i < FASCIST_POLICY_COUNT; i++) deck.push('fascist');
  const rng = makeRng(seed ^ 0xdec0_de01);
  return rngShuffle(rng, deck);
}

// Reshuffle the discard into the deck. Called when the deck has < 3 cards.
// Uses a derived RNG so reshuffles stay deterministic across reshuffles.
export function reshuffleDeck(
  remainingDeck: ShPolicy[],
  discard: ShPolicy[],
  seed: number,
  reshuffleCount: number,
): { deck: ShPolicy[]; discard: ShPolicy[] } {
  const combined = [...remainingDeck, ...discard];
  const rng = makeRng((seed ^ 0xc1ea_ca11) + reshuffleCount * 0x9e3779b1);
  return {
    deck: rngShuffle(rng, combined),
    discard: [],
  };
}

// Build the per-seat party-knowledge table.
//
// Rules:
//  - 5 or 6 players: every fascist (incl. Hitler) sees the other fascists
//    AND Hitler knows the fascists (the special small-table rule is that
//    Hitler ALSO sees the other fascist).
//  - 7+ players: regular fascists see each other and Hitler; Hitler sees
//    nothing (acts blind).
//  - Liberals see nothing.
export function buildPartyKnowledge(
  seats: ShSeatState[],
): Record<SeatIndex, Array<{ seat: SeatIndex; role: ShRoleId }>> {
  const out: Record<SeatIndex, Array<{ seat: SeatIndex; role: ShRoleId }>> = {};
  for (const s of seats) out[s.index] = [];

  const playerCount = seats.length;
  const smallTable = playerCount <= 6;

  const fascists = seats.filter((s) => s.role === 'fascist');
  const hitler = seats.find((s) => s.role === 'hitler');
  if (!hitler) return out;

  // Regular fascists always see the other fascists + Hitler.
  for (const f of fascists) {
    const known: Array<{ seat: SeatIndex; role: ShRoleId }> = [];
    for (const other of fascists) {
      if (other.index === f.index) continue;
      known.push({ seat: other.index, role: 'fascist' });
    }
    known.push({ seat: hitler.index, role: 'hitler' });
    out[f.index] = known;
  }

  // Hitler's knowledge: small-table only.
  if (smallTable) {
    out[hitler.index] = fascists.map((f) => ({ seat: f.index, role: 'fascist' }));
  } else {
    out[hitler.index] = [];
  }

  return out;
}

// Draw up to 3 cards from the deck; if the deck shrinks below 3 along the way,
// reshuffle the discard in before continuing.
export function drawThree(
  state: ShPrivateState,
): { drawn: [ShPolicy, ShPolicy, ShPolicy]; deck: ShPolicy[]; discard: ShPolicy[]; reshuffleCount: number } {
  let deck = state.policyDeck.slice();
  let discard = state.policyDiscard.slice();
  let reshuffleCount = state.reshuffleCount;

  if (deck.length < 3) {
    const reshuffled = reshuffleDeck(deck, discard, state.seed, reshuffleCount);
    deck = reshuffled.deck;
    discard = reshuffled.discard;
    reshuffleCount += 1;
  }

  // Draw from the top (index 0).
  const drawn = [deck[0]!, deck[1]!, deck[2]!] as [ShPolicy, ShPolicy, ShPolicy];
  const rest = deck.slice(3);
  return { drawn, deck: rest, discard, reshuffleCount };
}

// Draw a single top-deck card for forced enactment (election tracker = 3).
export function drawOne(
  state: ShPrivateState,
): { drawn: ShPolicy; deck: ShPolicy[]; discard: ShPolicy[]; reshuffleCount: number } {
  let deck = state.policyDeck.slice();
  let discard = state.policyDiscard.slice();
  let reshuffleCount = state.reshuffleCount;

  if (deck.length < 1) {
    const reshuffled = reshuffleDeck(deck, discard, state.seed, reshuffleCount);
    deck = reshuffled.deck;
    discard = reshuffled.discard;
    reshuffleCount += 1;
  }
  const drawn = deck[0]!;
  return { drawn, deck: deck.slice(1), discard, reshuffleCount };
}
