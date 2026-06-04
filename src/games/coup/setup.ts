import { makeRng, rngShuffle } from '@/engine/rng';
import { CHARACTERS, CLASSIC_FIVE } from './characters';
import type { CoupCharacter, CoupPrivateState, CoupSeatState } from './state';

// ----------------------------------------------------------------------------
// Lobby-side validation. The host picks a character set; we enforce:
//   - At least 5 characters
//   - Each character is `implemented: true`
//   - No duplicates (each entry has 3 deck copies regardless)
// ----------------------------------------------------------------------------

export function validateCharacterSet(chars: readonly CoupCharacter[]): string | null {
  if (chars.length < 5) {
    return 'Pick at least 5 characters.';
  }
  if (chars.length > 8) {
    return 'Pick at most 8 characters for one match.';
  }
  const seen = new Set<CoupCharacter>();
  for (const c of chars) {
    if (seen.has(c)) return `Duplicate character: ${CHARACTERS[c].name}`;
    seen.add(c);
    if (!CHARACTERS[c].implemented) {
      return `${CHARACTERS[c].name} isn't implemented yet — pick a different character.`;
    }
  }
  return null;
}

// Sanity-check defaults to seed setup.
export const DEFAULT_CLASSIC_SET: CoupCharacter[] = CLASSIC_FIVE.slice();

// ----------------------------------------------------------------------------
// Initial deal.
// ----------------------------------------------------------------------------

export interface DealtSetup {
  seats: CoupSeatState[];
  deck: CoupCharacter[];
}

export function dealCoup(
  playerCount: number,
  activeCharacters: readonly CoupCharacter[],
  names: readonly string[],
  seed: number,
): DealtSetup {
  const rng = makeRng(seed);
  // Standard deck: 3 copies of each active character.
  const fullDeck: CoupCharacter[] = [];
  for (const c of activeCharacters) {
    fullDeck.push(c, c, c);
  }
  const shuffled = rngShuffle(rng, fullDeck);
  const seats: CoupSeatState[] = [];
  let cursor = 0;
  for (let i = 0; i < playerCount; i++) {
    const a = shuffled[cursor++]!;
    const b = shuffled[cursor++]!;
    seats.push({
      index: i,
      name: names[i] ?? `Seat ${i + 1}`,
      influences: [
        { char: a, revealed: false },
        { char: b, revealed: false },
      ],
      coins: 2,
      eliminated: false,
      tokens: { peacekeeping: false, treaty: null },
    });
  }
  const deck = shuffled.slice(cursor);
  return { seats, deck };
}

// Build the initial private state. Phase starts at `turnStart` for the first
// living player (seat 0).
export function buildInitialState(
  playerCount: number,
  activeCharacters: readonly CoupCharacter[],
  names: readonly string[],
  seed: number,
  ruleset: 'classic' | 'g54',
  expansions: Array<'anarchy'>,
): CoupPrivateState {
  const { seats, deck } = dealCoup(playerCount, activeCharacters, names, seed);
  const privatePeeks: Record<number, []> = {};
  for (let i = 0; i < playerCount; i++) privatePeeks[i] = [];
  return {
    phase: 'turnStart',
    ruleset,
    expansions,
    activeCharacters: [...activeCharacters],
    seats,
    deck,
    currentSeat: 0,
    pending: null,
    exchangeOffer: null,
    log: ['Game started.'],
    privatePeeks,
    seed,
    rngCursor: seed,
    winnerSeat: null,
  };
}
