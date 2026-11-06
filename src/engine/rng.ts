// Seeded RNG. Used by every game module so that role-deal, deck-shuffle, and
// AI tiebreakers are reproducible from a single seed.
//
// HIDDEN-INFO RULE: the seed (and any RNG cursor) is host-private. It is
// decided by the host at match start (`randomSeed()`) and must never appear
// in a public view, the lobby, or a log — the seed plus the game options is
// enough for a peer to recompute every deal. A future replay feature can
// publish it only after the game ends.
//
// Generator: sfc32 (128-bit state, non-linear), seeded from ALL 53 bits of
// the numeric seed through splitmix32. Earlier versions used mulberry32,
// whose 32-bit state could be brute-forced from public outcomes (revealed
// dice, the word layout) in seconds, after which every hidden draw was
// predictable. Not a CSPRNG — see README "Left to do: RNG hardening" — but
// it raises the search from 2^32 to 2^53 seeds for games that pass the full
// seed through.

export type RngState = { a: number; b: number; c: number; d: number };

function splitmix32(x: number): number {
  x = (x + 0x9e3779b9) | 0;
  let z = x;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

export function makeRng(seed: number): RngState {
  const n = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const lo = n >>> 0;
  const hi = Math.floor(n / 4294967296) >>> 0;
  const a = splitmix32(lo);
  const b = splitmix32(a ^ hi);
  const c = splitmix32(b ^ 0x6a09e667);
  const d = splitmix32(c ^ hi ^ 0xbb67ae85);
  const state: RngState = { a, b, c, d: d | 1 };
  // Warm up so nearby seeds diverge immediately.
  for (let i = 0; i < 12; i++) rngFloat(state);
  return state;
}

export function rngFloat(state: RngState): number {
  const t = (((state.a + state.b) | 0) + state.d) | 0;
  state.d = (state.d + 1) | 0;
  state.a = state.b ^ (state.b >>> 9);
  state.b = (state.c + (state.c << 3)) | 0;
  state.c = (state.c << 21) | (state.c >>> 11);
  state.c = (state.c + t) | 0;
  return (t >>> 0) / 4294967296;
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

/**
 * A fresh 53-bit match seed from the platform CSPRNG (falls back to
 * Math.random where `crypto` is unavailable). Host-only — see the rule above.
 */
export function randomSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const w = c.getRandomValues(new Uint32Array(2));
    return (w[0]! & 0x1fffff) * 4294967296 + w[1]!;
  }
  return Math.floor(Math.random() * 2 ** 53);
}

/**
 * Derive an independent 53-bit sub-seed (e.g. one stream per round / deck /
 * purpose). Use this instead of `seed ^ salt`: in JS `^` truncates to 32
 * bits, which shrinks a hidden stream back to a brute-forceable 2^32.
 */
export function subSeed(seed: number, ...salts: number[]): number {
  const n = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  let lo = n >>> 0;
  let hi = Math.floor(n / 4294967296) >>> 0;
  for (const s of salts) {
    const k = Number.isFinite(s) ? Math.trunc(s) : 0;
    lo = splitmix32(lo ^ (k >>> 0) ^ Math.imul(hi, 0x27d4eb2f));
    hi = splitmix32(hi ^ lo ^ (Math.floor(k / 4294967296) >>> 0));
  }
  return (hi & 0x1fffff) * 4294967296 + lo;
}
