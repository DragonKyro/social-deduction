// Seeded RNG (mulberry32). Used by every game module so that role-deal,
// deck-shuffle, and AI tiebreakers are reproducible from a single seed.
// The seed is decided at game-start time by the host and included in the
// initial public view so peers can also rebuild the deterministic stream
// (needed for replays / cross-checking if we add anti-cheat later).

export type RngState = { value: number };

export function makeRng(seed: number): RngState {
  return { value: seed >>> 0 };
}

export function rngFloat(state: RngState): number {
  state.value = (state.value + 0x6d2b79f5) >>> 0;
  let t = state.value;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rngInt(state: RngState, maxExclusive: number): number {
  return Math.floor(rngFloat(state) * maxExclusive);
}

export function rngShuffle<T>(state: RngState, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rngInt(state, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
