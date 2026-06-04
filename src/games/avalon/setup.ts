import { makeRng, rngInt, rngShuffle } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import { ROLES, isEvil, isGood } from './roles';
import { alignmentSplit } from './quest-tracks';
import type { AvalonRoleId, AvalonSeatState } from './state';

// Build the role pool for a match given the seat count and the special
// roles the host enabled. Fills remaining slots with Loyal Servants /
// Minions of Mordred so each side hits its required count.
export function buildRolePool(
  playerCount: number,
  enabledSpecials: AvalonRoleId[],
): AvalonRoleId[] {
  const { good, evil } = alignmentSplit(playerCount);

  // Always start with the required roles.
  const pool: AvalonRoleId[] = ['merlin', 'assassin'];

  // Add each enabled special exactly once (dedup, skip required which are
  // already in). Validate alignment counts as we add.
  const seen = new Set<AvalonRoleId>(pool);
  for (const r of enabledSpecials) {
    if (seen.has(r)) continue;
    if (ROLES[r].required) continue; // already in pool
    pool.push(r);
    seen.add(r);
  }

  // Count current good/evil and pad with generics.
  let goodInPool = pool.filter(isGood).length;
  let evilInPool = pool.filter(isEvil).length;

  if (goodInPool > good) {
    throw new Error(
      `Too many good special roles enabled for ${playerCount} players: ${goodInPool} > ${good}`,
    );
  }
  if (evilInPool > evil) {
    throw new Error(
      `Too many evil special roles enabled for ${playerCount} players: ${evilInPool} > ${evil}`,
    );
  }
  while (goodInPool < good) {
    pool.push('loyalServant');
    goodInPool++;
  }
  while (evilInPool < evil) {
    pool.push('minionOfMordred');
    evilInPool++;
  }

  return pool;
}

// Deal the role pool into seats. Uses the seeded RNG so a host that
// re-runs setup with the same seed gets the same deal.
export function dealRoles(
  seatCount: number,
  rolePool: AvalonRoleId[],
  seed: number,
): AvalonSeatState[] {
  if (rolePool.length !== seatCount) {
    throw new Error(`Role pool size ${rolePool.length} ≠ seat count ${seatCount}`);
  }
  const rng = makeRng(seed);
  const shuffled = rngShuffle(rng, rolePool);
  return shuffled.map((role, i) => ({
    index: i,
    name: `Seat ${i + 1}`,
    role,
    alignment: ROLES[role].alignment,
    voteApprove: null,
    questCard: null,
  }));
}

// Pick a random starting leader using the seeded RNG.
export function pickStartingLeader(seatCount: number, seed: number): SeatIndex {
  // Use a derived seed so leader pick doesn't waste an "interesting" slot
  // from the same RNG as role shuffle.
  const rng = makeRng(seed ^ 0x5a17_a1ea);
  return rngInt(rng, seatCount);
}

// Build the role-knowledge table.
//
// Per the rulebook:
//  - Merlin sees every evil seat EXCEPT Mordred.
//  - Percival sees Merlin AND Morgana (cannot tell apart — both labeled
//    "Merlin or Morgana").
//  - Evils (except Oberon) see each other (Oberon is hidden from the
//    party and the party is hidden from Oberon).
//  - Loyal Servants see nothing.
export function buildRoleKnowledge(
  seats: AvalonSeatState[],
): Record<SeatIndex, Array<{ seat: SeatIndex; label: string }>> {
  const knowledge: Record<SeatIndex, Array<{ seat: SeatIndex; label: string }>> = {};
  // Default every seat to no knowledge — overridden below for roles that
  // see someone. Loyal Servants stay at [] explicitly so callers don't
  // get `undefined` for valid seats.
  for (const s of seats) knowledge[s.index] = [];

  const merlinSeat = seats.find((s) => s.role === 'merlin');
  const percivalSeats = seats.filter((s) => s.role === 'percival');
  const evilSeats = seats.filter((s) => s.alignment === 'evil');

  // Merlin sees evils except Mordred.
  if (merlinSeat) {
    knowledge[merlinSeat.index] = evilSeats
      .filter((s) => s.role !== 'mordred')
      .map((s) => ({ seat: s.index, label: 'Evil' }));
  }

  // Percival sees Merlin & Morgana, both labeled identically.
  for (const p of percivalSeats) {
    const targets = seats.filter((s) => s.role === 'merlin' || s.role === 'morgana');
    knowledge[p.index] = targets.map((s) => ({ seat: s.index, label: 'Merlin or Morgana' }));
  }

  // Evils (except Oberon) see each other (also except Oberon as a target).
  for (const e of evilSeats) {
    if (e.role === 'oberon') {
      knowledge[e.index] = [];
      continue;
    }
    knowledge[e.index] = evilSeats
      .filter((s) => s.index !== e.index && s.role !== 'oberon')
      .map((s) => ({ seat: s.index, label: 'Evil' }));
  }

  return knowledge;
}
