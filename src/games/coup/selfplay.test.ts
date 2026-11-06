import { describe, expect, it } from 'vitest';
import type { GameConfig } from '@/engine/types';
import type { CoupGameAction } from './actions';
import { aiChooseAction } from './ai';
import { CLASSIC_FIVE, G54_BALANCED_DEFAULT } from './characters';
import { coupModule } from './module';
import type { CoupOptions } from './module';
import type { CoupCharacter, CoupPrivateState } from './state';

// All-AI self-play, stepping the AI exactly like the solo game loop in
// gameStore (round-robin from a rotating cursor, first non-null move wins).
// A game must finish: no AI may throw, propose an illegal move, or leave the
// table with nobody able to act.

function start(players: number, seed: number, ruleset: 'classic' | 'g54', characters: CoupCharacter[], anarchy = false) {
  const options: CoupOptions = {
    players: Array.from({ length: players }, (_, i) => ({ name: `AI ${i + 1}`, isAI: true })),
    ruleset,
    expansions: anarchy ? ['anarchy'] : [],
    characters,
  };
  const config: GameConfig = { gameId: 'coup', seats: [], seed, gameOptions: options as unknown as Record<string, unknown> };
  return coupModule.createInitialState(config);
}

function selfPlay(state: CoupPrivateState, maxSteps = 4000): { state: CoupPrivateState; steps: number } {
  let s = state;
  let cursor = 0;
  const n = s.seats.length;
  for (let step = 0; step < maxSteps; step++) {
    if (coupModule.isFinished(s)) return { state: s, steps: step };
    let applied = false;
    for (let k = 0; k < n; k++) {
      const seat = (cursor + k) % n;
      const a: CoupGameAction | null = aiChooseAction(s, seat);
      if (!a) continue;
      expect((a as { bySeat: number }).bySeat, 'AI acted for another seat').toBe(seat);
      try {
        s = coupModule.applyAction(s, a, `ai:${seat}`);
      } catch (e) {
        throw new Error(`seat ${seat} proposed illegal ${JSON.stringify(a)} in ${s.phase}: ${(e as Error).message}`);
      }
      cursor = (cursor + k + 1) % n;
      applied = true;
      break;
    }
    if (!applied) throw new Error(`stalled in phase ${s.phase} (awaiting ${JSON.stringify(coupModule.viewFor(s, null).awaitingSeats)})`);
  }
  throw new Error('game did not finish');
}

const G54_DECKS: Array<{ chars: CoupCharacter[]; anarchy?: boolean }> = [
  { chars: G54_BALANCED_DEFAULT },
  { chars: ['capitalist', 'spy', 'mercenary', 'judge', 'foreignConsular'] },
  { chars: ['speculator', 'newscaster', 'guerrilla', 'priest', 'peacekeeper'] },
  { chars: ['treasurer', 'lobbyist', 'thief', 'lawyer', 'protestor'] },
  { chars: ['taxCollector', 'producer', 'assassinG54', 'bishop', 'diplomat'] },
  { chars: ['banker', 'reporter', 'soldier', 'mayor', 'inquisitor'] },
  { chars: ['banker', 'spy', 'soldier', 'judge', 'inquisitor', 'armsDealer'], anarchy: true },
  { chars: ['capitalist', 'spy', 'mercenary', 'lawyer', 'peacekeeper', 'financier'], anarchy: true },
  { chars: ['treasurer', 'lobbyist', 'guerrilla', 'priest', 'protestor', 'paramilitary'], anarchy: true },
  { chars: ['taxCollector', 'producer', 'thief', 'bishop', 'diplomat', 'socialist'], anarchy: true },
  { chars: ['speculator', 'reporter', 'assassinG54', 'mayor', 'foreignConsular', 'worldBank'], anarchy: true },
  { chars: ['banker', 'newscaster', 'soldier', 'judge', 'inquisitor', 'anarchist'], anarchy: true },
  { chars: ['banker', 'spy', 'mercenary', 'judge', 'inquisitor', 'plantationOwner'], anarchy: true },
];

describe('coup AI self-play', () => {
  it('Classic: finishes for 2-6 players over many seeds', () => {
    for (let players = 2; players <= 6; players++) {
      for (let seed = 1; seed <= 12; seed++) {
        const { state } = selfPlay(start(players, seed * 7919 + players, 'classic', CLASSIC_FIVE));
        expect(state.phase).toBe('gameOver');
        expect(state.winnerSeat).not.toBeNull();
        expect(state.seats.filter((x) => !x.eliminated)).toHaveLength(1);
      }
    }
  });

  it('G54 + Anarchy: finishes for every exotic deck', () => {
    for (const deck of G54_DECKS) {
      for (const players of [3, 4, 6]) {
        for (let seed = 1; seed <= 4; seed++) {
          const { state } = selfPlay(start(players, seed * 104729 + players, 'g54', deck.chars, deck.anarchy));
          expect(state.phase, `deck ${deck.chars.join(',')}`).toBe('gameOver');
        }
      }
    }
  });

  it('AI decisions ignore hidden information it is not entitled to', () => {
    // Swap every opponent's face-down cards + the deck: the AI's move from
    // seat 0 must not change, because it only reads its own redacted view.
    for (let seed = 1; seed <= 30; seed++) {
      let s = start(4, seed, 'classic', CLASSIC_FIVE);
      // Advance a few AI steps to reach varied phases.
      for (let i = 0; i < seed % 9; i++) {
        let moved = false;
        for (let seat = 0; seat < 4 && !moved; seat++) {
          const a = aiChooseAction(s, seat);
          if (a) {
            s = coupModule.applyAction(s, a, '');
            moved = true;
          }
        }
        if (coupModule.isFinished(s)) break;
      }
      for (let seat = 0; seat < 4; seat++) {
        const t: CoupPrivateState = JSON.parse(JSON.stringify(s));
        const pool = t.activeCharacters;
        let j = seed;
        for (const other of t.seats) {
          if (other.index === seat) continue;
          for (const inf of other.influences) if (!inf.revealed) inf.char = pool[j++ % pool.length]!;
        }
        t.deck = t.deck.map(() => pool[j++ % pool.length]!);
        expect(JSON.stringify(aiChooseAction(t, seat))).toBe(JSON.stringify(aiChooseAction(s, seat)));
      }
    }
  });
});
