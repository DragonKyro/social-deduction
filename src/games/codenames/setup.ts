import { makeRng, rngFloat, rngShuffle } from '@/engine/rng';
import { CLASSIC_WORDS } from '@/words';
import type { CardKind, CodenamesCard, TeamColor } from './state';

// 25-card grid. Starting team gets 9, other team gets 8, then 7 bystanders
// and 1 assassin. Which team starts is itself determined by the seed so the
// host can't peek.
export const GRID_SIZE = 25;
export const STARTING_TEAM_CARDS = 9;
export const OTHER_TEAM_CARDS = 8;
export const BYSTANDER_CARDS = 7;
export const ASSASSIN_CARDS = 1;

// Pick the 25 words and assign each one a card kind. Returns the cards in
// final 5×5 order (index 0..24).
export function buildBoard(
  seed: number,
  startingTeam: TeamColor,
  pool: readonly string[] = CLASSIC_WORDS,
): CodenamesCard[] {
  if (pool.length < GRID_SIZE) {
    throw new Error(`Word pool needs at least ${GRID_SIZE} entries (got ${pool.length})`);
  }
  const rng = makeRng(seed);
  const shuffledPool = rngShuffle(rng, pool);
  const words = shuffledPool.slice(0, GRID_SIZE);

  const otherTeam: TeamColor = startingTeam === 'red' ? 'blue' : 'red';

  // Build the kind bag (9 + 8 + 7 + 1 = 25) and shuffle it.
  const kindBag: CardKind[] = [
    ...Array(STARTING_TEAM_CARDS).fill(startingTeam),
    ...Array(OTHER_TEAM_CARDS).fill(otherTeam),
    ...Array(BYSTANDER_CARDS).fill('bystander'),
    ...Array(ASSASSIN_CARDS).fill('assassin'),
  ];
  const kinds = rngShuffle(rng, kindBag);

  return words.map((word, i) => ({
    index: i,
    word,
    kind: kinds[i]!,
    revealed: false,
  }));
}

// Determine the starting team from the seed. We could just always pick red,
// but seeding it keeps replays deterministic and prevents the host from
// inferring board state from "we always start red".
export function pickStartingTeam(seed: number): TeamColor {
  // Use a derived seed so this doesn't consume from the same RNG stream as
  // the board shuffle.
  const rng = makeRng(seed ^ 0x10c0_dead);
  return rngFloat(rng) < 0.5 ? 'red' : 'blue';
}
