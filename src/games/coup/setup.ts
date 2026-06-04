import { makeRng, rngShuffle } from '@/engine/rng';
import { CHARACTERS, CLASSIC_FIVE, categoryHistogram } from './characters';
import type { CoupCharacter, CoupPrivateState, CoupSeatState, CoupRuleset } from './state';

// ----------------------------------------------------------------------------
// Lobby-side validation.
//
// Canonical totals:
//   Classic         → exactly 5 (the canonical 5 are fixed; we still allow
//                     "deviation" so a host can sub in a G54 character but
//                     the count must be 5).
//   G54 (no Anarchy)→ exactly 5
//   G54 + Anarchy   → exactly 6
//
// Category distribution: canonical G54 is one character per category, but
// many friend groups prefer to mix-and-match. We surface a warning string
// alongside the hard error so the UI can show "may be unbalanced" without
// blocking start.
// ----------------------------------------------------------------------------

export interface ValidationResult {
  error: string | null;
  warning: string | null;
}

export function requiredCharacterCount(ruleset: CoupRuleset, anarchy: boolean): number {
  if (ruleset === 'classic') return 5;
  return anarchy ? 6 : 5;
}

export function validateCharacterSetFull(
  chars: readonly CoupCharacter[],
  ruleset: CoupRuleset,
  anarchy: boolean,
): ValidationResult {
  const required = requiredCharacterCount(ruleset, anarchy);
  if (chars.length !== required) {
    return {
      error: `Pick exactly ${required} characters (${ruleset === 'classic' ? 'Classic' : anarchy ? 'G54 + Anarchy' : 'G54'}).`,
      warning: null,
    };
  }
  const seen = new Set<CoupCharacter>();
  for (const c of chars) {
    if (seen.has(c)) return { error: `Duplicate character: ${CHARACTERS[c].name}`, warning: null };
    seen.add(c);
    if (!CHARACTERS[c].implemented) {
      return {
        error: `${CHARACTERS[c].name} isn't implemented yet — pick a different character.`,
        warning: null,
      };
    }
  }
  // Category balance warning. Canonical G54 expects one character per base
  // category; with Anarchy that becomes one anarchy character on top.
  if (ruleset === 'g54') {
    const hist = categoryHistogram(chars);
    const baseCategories = ['finance', 'communications', 'force', 'specialInterest', 'movement'] as const;
    const offBalance = baseCategories.some((cat) => hist[cat] !== 1);
    const anarchyOk = anarchy ? hist.anarchy === 1 : hist.anarchy === 0;
    if (offBalance || !anarchyOk) {
      return {
        error: null,
        warning:
          'Off-balance: canonical G54 is one character per base category' +
          (anarchy ? ' + one Anarchy character.' : '.') +
          ' Game may feel uneven.',
      };
    }
  }
  return { error: null, warning: null };
}

// Legacy single-string validator kept for back-compat with the engine entry
// point — falls back to the old behavior (5-8 free pick) for callers that
// don't know the ruleset. Module + setup UI use validateCharacterSetFull.
export function validateCharacterSet(chars: readonly CoupCharacter[]): string | null {
  if (chars.length < 5) return 'Pick at least 5 characters.';
  if (chars.length > 8) return 'Pick at most 8 characters for one match.';
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
      tokens: { peacekeeping: false, treaty: null, weapons: 0, reviveBlessed: false },
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
