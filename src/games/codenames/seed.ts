import { subSeed } from '@/engine/rng';
// Seed splitting for Codenames' deal.
//
// The word layout is public; the key card is not. If both came from one
// RNG stream (or two streams that are cheap functions of the same small
// seed), anyone could brute-force the seed from the visible word order and
// recompute the key. So the PUBLIC outputs (words, starting team) and the
// PRIVATE output (the key) draw from different derived seeds:
//
//   - publicSeed  uses only the low 32 bits of the match seed;
//   - privateSeed also mixes in the bits above 2^32.
//
// With today's 31-bit match seed the high bits are zero, so this is
// hardening only; once the host hands modules a wider seed (up to 2^53),
// recovering `publicSeed` from the word order no longer yields the key.

function fmix32(input: number): number {
  let h = input >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function lowBits(seed: number): number {
  return seed >>> 0;
}

function highBits(seed: number): number {
  return Math.floor(Math.abs(seed) / 4294967296) >>> 0;
}

// Both derive full 53-bit streams from the whole seed (engine/rng subSeed),
// so recovering the public stream gives no shortcut to the key.
export function publicSeed(seed: number, salt: number): number {
  return subSeed(seed, salt);
}

export function privateSeed(seed: number, salt: number): number {
  return subSeed(seed, 0x3c6ef372, salt, fmix32(highBits(seed) ^ lowBits(seed)));
}
