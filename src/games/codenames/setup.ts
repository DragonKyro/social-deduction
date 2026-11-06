import { makeRng, rngFloat, rngShuffle } from '@/engine/rng';
import { CLASSIC_WORDS } from '@/words';
import { privateSeed, publicSeed } from './seed';
import type { CardKind, CodenamesCard, TeamColor } from './state';

// 25-card grid. Starting team gets 9, other team gets 8, then 7 bystanders
// and 1 assassin. Which team starts is itself determined by the seed.
export const GRID_SIZE = 25;
export const STARTING_TEAM_CARDS = 9;
export const OTHER_TEAM_CARDS = 8;
export const BYSTANDER_CARDS = 7;
export const ASSASSIN_CARDS = 1;

// Salts for the derived streams (see seed.ts). The words + starting team are
// public, so they come from `publicSeed`; the key comes from `privateSeed`
// and is never a continuation of the word stream.
const WORDS_SALT = 0x0c0de5;
const START_SALT = 0x10c0dead;
const KEY_SALT = 0x6b2fc0de;

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
  const wordsRng = makeRng(publicSeed(seed, WORDS_SALT));
  const words = rngShuffle(wordsRng, pool).slice(0, GRID_SIZE);

  const otherTeam: TeamColor = startingTeam === 'red' ? 'blue' : 'red';

  // Build the kind bag (9 + 8 + 7 + 1 = 25) and shuffle it on its own stream.
  const kindBag: CardKind[] = [
    ...Array<CardKind>(STARTING_TEAM_CARDS).fill(startingTeam),
    ...Array<CardKind>(OTHER_TEAM_CARDS).fill(otherTeam),
    ...Array<CardKind>(BYSTANDER_CARDS).fill('bystander'),
    ...Array<CardKind>(ASSASSIN_CARDS).fill('assassin'),
  ];
  const kinds = rngShuffle(makeRng(privateSeed(seed, KEY_SALT)), kindBag);

  return words.map((word, i) => ({
    index: i,
    word,
    kind: kinds[i]!,
    revealed: false,
  }));
}

// Determine the starting team from the seed. Public information (the
// starting team moves first and has 9 agents), so it uses the public stream.
export function pickStartingTeam(seed: number): TeamColor {
  const rng = makeRng(publicSeed(seed, START_SALT));
  return rngFloat(rng) < 0.5 ? 'red' : 'blue';
}
