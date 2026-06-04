import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { AvalonAction } from './actions';
import type { AvalonPrivateState, AvalonPublicState, AvalonRoleId } from './state';

export interface AvalonOptions {
  // Role pool beyond the required (merlin + assassin + filler loyal + filler minion).
  // Order in this list doesn't affect deal order — module shuffles internally.
  specialRoles: AvalonRoleId[];
}

export const avalonModule: GameModule<AvalonPrivateState, AvalonPublicState, AvalonAction> = {
  id: 'avalon',
  displayName: 'The Resistance: Avalon',
  minPlayers: 5,
  maxPlayers: 10,

  createInitialState(config: GameConfig): AvalonPrivateState {
    return {
      phase: 'setup',
      seats: [],
      currentQuestNumber: 1,
      questHistory: [],
      currentLeaderSeat: 0,
      proposedTeam: [],
      failedProposalsThisQuest: 0,
      roleKnowledge: {},
      seed: config.seed,
      winnerTeam: null,
      assassinationTarget: null,
    };
  },

  applyAction(state: AvalonPrivateState, _action: AvalonAction): AvalonPrivateState {
    return state;
  },

  viewFor(state: AvalonPrivateState, seat: SeatIndex | null): AvalonPublicState {
    const ownSeat = seat === null ? null : state.seats[seat];
    return {
      phase: state.phase,
      seats: state.seats.map((s) => ({
        index: s.index,
        name: `Seat ${s.index}`,
        voteApprove:
          state.phase === 'teamVote' || state.phase === 'teamProposal' ? null : s.voteApprove,
        isCurrentLeader: s.index === state.currentLeaderSeat,
        isOnProposedTeam: state.proposedTeam.includes(s.index),
        revealedRole: state.phase === 'gameOver' ? s.role : null,
      })),
      currentQuestNumber: state.currentQuestNumber,
      questTrack: [],
      questHistory: state.questHistory,
      failedProposalsThisQuest: state.failedProposalsThisQuest,
      proposedTeam: state.proposedTeam,
      currentLeaderSeat: state.currentLeaderSeat,
      winnerTeam: state.winnerTeam,
      yourRole: ownSeat?.role ?? null,
      yourAlignment: ownSeat?.alignment ?? null,
      yourRoleKnowledge: seat === null ? [] : (state.roleKnowledge[seat] ?? []),
      yourQuestCard: ownSeat?.questCard ?? null,
    };
  },

  isFinished(state: AvalonPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  defaultConfig(playerCount: number): GameConfig {
    const specialRoles: AvalonRoleId[] = playerCount >= 7 ? ['percival', 'morgana'] : [];
    const options: AvalonOptions = { specialRoles };
    return {
      gameId: 'avalon',
      seats: [],
      seed: 0,
      gameOptions: options as unknown as Record<string, unknown>,
    };
  },
};
