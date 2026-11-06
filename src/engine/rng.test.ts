import { describe, expect, it } from 'vitest';
import { makeRng, randomSeed, rngFloat, rngShuffle, subSeed } from './rng';

describe('engine rng', () => {
  it('is deterministic per seed and uses all 53 bits', () => {
    const draw = (seed: number) => Array.from({ length: 8 }, ((r) => () => rngFloat(r))(makeRng(seed)));
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
    // Seeds differing only above bit 32 give different streams (mulberry32 didn't).
    expect(draw(7)).not.toEqual(draw(7 + 2 ** 40));
  });

  it('subSeed keeps entropy above 32 bits and separates purposes', () => {
    const s = 2 ** 52 + 12345;
    expect(subSeed(s, 1)).not.toBe(subSeed(s, 2));
    expect(subSeed(s, 1)).not.toBe(subSeed(s - 2 ** 40, 1));
    expect(subSeed(s, 1, 0)).not.toBe(subSeed(s, 1, 1));
    for (let i = 0; i < 50; i++) {
      const v = subSeed(randomSeed(), i);
      expect(Number.isSafeInteger(v) && v >= 0 && v < 2 ** 53).toBe(true);
    }
    expect(Array.from({ length: 50 }, (_, i) => subSeed(s, i)).some((v) => v >= 2 ** 32)).toBe(true);
  });

  it('randomSeed is a fresh 53-bit integer', () => {
    const seeds = Array.from({ length: 20 }, randomSeed);
    expect(new Set(seeds).size).toBe(20);
    expect(seeds.every((v) => Number.isSafeInteger(v) && v >= 0)).toBe(true);
  });

  it('shuffles are permutations', () => {
    const out = rngShuffle(makeRng(9), [1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
