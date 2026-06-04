import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { AvalonAction } from './actions';
import type { AvalonPrivateState, AvalonPublicState, AvalonRoleId } from './state';

export interface AvalonOptions {
  // Role pool beyond the required (merlin + assassin + filler loyal + filler minion).
  // Order in this list doesn't affect deal order — module shuffles internally.
  specialRoles: AvalonRoleId[];
  // Optional modules — independent toggles, freely stackable.
  ladyOfTheLake: boolean;
  excalibur: boolean;
  twoLancelots: boolean;
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
      ladyOfTheLake: null,
      excalibur: null,
      lancelotSwapDeck: null,
      lancelotSwapsApplied: 0,
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
      ladyOfTheLake: state.ladyOfTheLake
        ? {
            enabled: true,
            holder: state.ladyOfTheLake.holder,
            pastHolders: state.ladyOfTheLake.pastHolders,
          }
        : null,
      excalibur: state.excalibur
        ? {
            enabled: state.excalibur.enabled,
            holderSeat: state.excalibur.holderSeat,
            usedOnSeat: state.excalibur.usedOnSeat,
          }
        : null,
      lancelotSwapsApplied: state.lancelotSwapDeck ? state.lancelotSwapsApplied : null,
      yourRole: ownSeat?.role ?? null,
      yourAlignment: ownSeat?.alignment ?? null,
      yourRoleKnowledge: seat === null ? [] : (state.roleKnowledge[seat] ?? []),
      yourQuestCard: ownSeat?.questCard ?? null,
      yourLadyOfTheLakeReveals:
        seat === null || !state.ladyOfTheLake
          ? []
          : state.ladyOfTheLake.privateReveals
              .filter((r) => r.by === seat)
              .map((r) => ({ target: r.target, alignment: r.alignment })),
    };
  },

  isFinished(state: AvalonPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  defaultConfig(playerCount: number): GameConfig {
    const specialRoles: AvalonRoleId[] = playerCount >= 7 ? ['percival', 'morgana'] : [];
    const options: AvalonOptions = {
      specialRoles,
      // Default optional modules on for 7+ player tables, off for 5-6p.
      // Lady of the Lake is the most-common third-party module; Excalibur
      // is also common at 7+ but doubles the team-vote-then-act complexity.
      ladyOfTheLake: playerCount >= 7,
      excalibur: false,
      twoLancelots: false,
    };
    return {
      gameId: 'avalon',
      seats: [],
      seed: 0,
      gameOptions: options as unknown as Record<string, unknown>,
    };
  },
};
