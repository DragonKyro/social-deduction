import type { GameConfig } from '@/engine/types';
import type { AvalonAction } from './actions';
import type { AvalonOptions } from './module';
import { avalonModule } from './module';
import type { AvalonPrivateState, AvalonRoleId } from './state';

// Shared helpers for the Avalon test files. No vitest import here so this
// stays a plain module (tsc includes it).

export function apply(state: AvalonPrivateState, action: AvalonAction): AvalonPrivateState {
  return avalonModule.applyAction(state, action, '');
}

export function configFor(
  playerCount: number,
  specialRoles: AvalonRoleId[] = [],
  seed = 42,
  extra: Partial<AvalonOptions> = {},
): GameConfig {
  const opts: AvalonOptions = {
    players: Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}`, isAI: true })),
    specialRoles,
    ladyOfTheLake: false,
    excalibur: false,
    twoLancelots: false,
    ...extra,
  };
  return { gameId: 'avalon', seats: [], seed, gameOptions: opts as unknown as Record<string, unknown> };
}

export function newGame(playerCount: number, specialRoles: AvalonRoleId[] = [], seed = 42): AvalonPrivateState {
  return avalonModule.createInitialState(configFor(playerCount, specialRoles, seed));
}

export function ackAll(state: AvalonPrivateState): AvalonPrivateState {
  let s = state;
  for (let i = 0; i < s.seats.length; i++) s = apply(s, { type: 'ackRoleReveal', bySeat: i });
  return s;
}

/** Propose `team` as the current leader and have everyone vote `approve`. */
export function proposeAndVote(
  state: AvalonPrivateState,
  team: number[],
  approve: boolean | ((seat: number) => boolean),
): AvalonPrivateState {
  let s = apply(state, { type: 'proposeTeam', bySeat: state.currentLeaderSeat, team });
  for (let i = 0; i < s.seats.length; i++) {
    s = apply(s, { type: 'castTeamVote', bySeat: i, approve: typeof approve === 'function' ? approve(i) : approve });
  }
  return s;
}

/** Best special-role set for a player count (everything that fits). */
export function fullSpecials(playerCount: number): AvalonRoleId[] {
  if (playerCount >= 10) return ['percival', 'morgana', 'mordred', 'oberon'];
  if (playerCount >= 7) return ['percival', 'morgana', 'mordred'];
  return ['percival', 'morgana'];
}

/**
 * Drive a whole game with the AI. The harness plays the host's role for the
 * seatless "Continue" acks. Calls `onState` after every applied action.
 */
export function selfPlay(
  initial: AvalonPrivateState,
  onState: (s: AvalonPrivateState, action: AvalonAction | null) => void = () => {},
  maxSteps = 3000,
): AvalonPrivateState {
  let s = initial;
  onState(s, null);
  let steps = 0;
  while (s.phase !== 'gameOver') {
    if (++steps > maxSteps) throw new Error(`self-play stalled in ${s.phase}`);
    let next: AvalonPrivateState | null = null;
    for (let seat = 0; seat < s.seats.length && !next; seat++) {
      const a = avalonModule.aiChooseAction!(s, seat);
      if (!a) continue;
      if ('bySeat' in a && a.bySeat !== seat) throw new Error(`AI seat ${seat} acted as ${a.bySeat}`);
      next = apply(s, a);
      onState(next, a);
    }
    if (!next) {
      let ack: AvalonAction;
      if (s.phase === 'teamVoteReveal') ack = { type: 'ackTeamVoteReveal' };
      else if (s.phase === 'questResolution') ack = { type: 'ackQuestResolution' };
      else throw new Error(`no AI seat acted in phase ${s.phase}`);
      next = apply(s, ack);
      onState(next, ack);
    }
    s = next;
  }
  return s;
}
