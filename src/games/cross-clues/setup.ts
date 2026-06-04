import { makeRng, rngInt, rngShuffle } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import { buildPoolFromPacks, type WordPackId } from '@/words';
import type {
  CellState,
  Coord,
  CrossCluesPrivateState,
} from './state';

// Derived-seed offsets so word-pick, deck-shuffle, and starting-seat picks
// don't share an RNG stream. Same trick as Avalon's pickStartingLeader.
const DECK_SEED_MASK = 0xc0_ff_ee_cc;
const LEADER_SEED_MASK = 0x00_00_c1_e5;

const GRID_SIZE = 5;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const WORDS_PER_GRID = GRID_SIZE * 2;

function buildEmptyGrid(): CellState[][] {
  const grid: CellState[][] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const row: CellState[] = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      row.push({
        resolved: false,
        token: null,
        resolvedOnRound: null,
        clueWord: null,
        guessedCoord: null,
      });
    }
    grid.push(row);
  }
  return grid;
}

function buildCoordDeck(): Coord[] {
  const cards: Coord[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      cards.push({ row: r, col: c });
    }
  }
  return cards;
}

// Build the initial private state for a match. Pure — deterministic from
// the seed + selected packs + seat names. Host calls this once at match
// start. Pack words are deduped before the deal.
export function buildInitial(
  names: string[],
  packs: readonly WordPackId[],
  seed: number,
): CrossCluesPrivateState {
  if (names.length < 2 || names.length > 6) {
    throw new Error(`Cross Clues needs 2-6 players (got ${names.length})`);
  }
  const pool = buildPoolFromPacks(packs.length > 0 ? packs : ['classic']);
  if (pool.length < WORDS_PER_GRID) {
    throw new Error(
      `Word pool only has ${pool.length} words; need ≥ ${WORDS_PER_GRID}`,
    );
  }

  // 1) Pick 10 words from the combined pool.
  const wordsRng = makeRng(seed);
  const shuffledWords = rngShuffle(wordsRng, pool);
  const rowWords = shuffledWords.slice(0, GRID_SIZE);
  const colWords = shuffledWords.slice(GRID_SIZE, WORDS_PER_GRID);

  // 2) Shuffle the 25 coord cards (independent stream).
  const deckRng = makeRng(seed ^ DECK_SEED_MASK);
  const deck = rngShuffle(deckRng, buildCoordDeck());
  if (deck.length !== TOTAL_CELLS) {
    throw new Error(`Internal: coord deck length ${deck.length}`);
  }

  // 3) Pick starting clue-giver (independent stream).
  const leaderRng = makeRng(seed ^ LEADER_SEED_MASK);
  const startingClueGiver = rngInt(leaderRng, names.length);
  const startingGuesser = (startingClueGiver + 1) % names.length;

  // 4) Pop the top card so round 1's coord is held immediately. The
  //    clue-giver only *sees* it once phase advances to 'clueGiving' —
  //    `yourCoord` redaction is gated on phase in viewFor.
  const remainingDeck = deck.slice();
  const currentCoord = remainingDeck.shift() ?? null;

  const seats = names.map((name, index) => ({ index, name }));
  const setupAcked: Record<SeatIndex, boolean> = {};
  const revealAcked: Record<SeatIndex, boolean> = {};
  for (const s of seats) {
    setupAcked[s.index] = false;
    revealAcked[s.index] = false;
  }

  return {
    phase: 'setup',
    seats,
    rowWords,
    colWords,
    grid: buildEmptyGrid(),
    remainingDeck,
    currentCoord,
    currentClue: null,
    currentClueGiver: startingClueGiver,
    currentGuesser: startingGuesser,
    roundNumber: 1,
    setupAcked,
    revealAcked,
    history: [],
    score: 0,
    packs: packs.slice(),
    seed,
  };
}

// Rotate the clue-giver/guesser roles one step around the table. Pure.
// 2-player case alternates naturally (mod 2).
export function rotateRoles(
  state: CrossCluesPrivateState,
): { clueGiver: SeatIndex; guesser: SeatIndex } {
  const n = state.seats.length;
  const clueGiver =
    state.currentClueGiver === null ? 0 : (state.currentClueGiver + 1) % n;
  const guesser = (clueGiver + 1) % n;
  return { clueGiver, guesser };
}
