import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { OnuwAction } from './actions';
import type {
  OnuwArtifactId,
  OnuwPrivateState,
  OnuwPublicState,
  OnuwRoleId,
} from './state';
import { emptyPrivateState } from './state';

// Stub implementation. Phase 1 fills in real role logic + night order.
// Kept as a placeholder so the registry compiles and the UI can wire up
// against the `GameModule` interface.

export interface OnuwOptions {
  // Selected role pool. Length must be `seats.length + 3` (3 center cards).
  // The pool may freely mix base + Daybreak + Bonus Roles entries — every
  // role from the unioned `OnuwRoleId` set plays inside the same engine.
  rolePool: OnuwRoleId[];
  // Bonus Roles only. Each artifact is dealt to a random seat at setup.
  // Empty array = no artifacts (default for base+Daybreak games).
  artifactPool: OnuwArtifactId[];
  // Day phase discussion length, in seconds. Default 300 (5 minutes).
  dayDurationSec: number;
  // If true, allow voting "no one" (a tie). Default true.
  allowNoLynch: boolean;
}

export const onuwModule: GameModule<OnuwPrivateState, OnuwPublicState, OnuwAction> = {
  id: 'onuw',
  displayName: 'One Night Ultimate Werewolf',
  minPlayers: 3,
  maxPlayers: 10,

  createInitialState(config: GameConfig): OnuwPrivateState {
    return emptyPrivateState(config.seed);
  },

  applyAction(state: OnuwPrivateState, _action: OnuwAction): OnuwPrivateState {
    return state;
  },

  viewFor(state: OnuwPrivateState, seat: SeatIndex | null): OnuwPublicState {
    return {
      phase: state.phase,
      seats: state.seats.map((s) => ({
        index: s.index,
        name: `Seat ${s.index}`,
        isAlive: !s.killed,
        hasVoted: s.voteTarget !== null,
        artifacts: s.artifacts,
        revealedRole: state.phase === 'gameOver' || state.phase === 'resolution' ? s.finalRole : null,
      })),
      rolePool: [],
      yourRole: seat === null ? null : (state.seats[seat]?.finalRole ?? null),
      yourObservation: seat === null ? null : (state.seats[seat]?.observation ?? null),
      yourVoteTarget: seat === null ? null : (state.seats[seat]?.voteTarget ?? null),
      winnerTeam: state.winnerTeam,
      timerMsRemaining: null,
    };
  },

  isFinished(state: OnuwPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  defaultConfig(playerCount: number): GameConfig {
    const baseRoles: OnuwRoleId[] = ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker'];
    const filler: OnuwRoleId[] = Array(Math.max(0, playerCount + 3 - baseRoles.length)).fill(
      'villager',
    );
    const options: OnuwOptions = {
      rolePool: [...baseRoles, ...filler].slice(0, playerCount + 3),
      artifactPool: [],
      dayDurationSec: 300,
      allowNoLynch: true,
    };
    return {
      gameId: 'onuw',
      seats: [],
      seed: 0,
      gameOptions: options as unknown as Record<string, unknown>,
    };
  },
};
