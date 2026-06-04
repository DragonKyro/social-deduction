import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { AvalonAction } from './actions';
import { ROLES, BASE_OPTIONAL_SPECIAL_ROLES } from './roles';
import { questTrack, MAX_REJECTED_PROPOSALS } from './quest-tracks';
import { buildRolePool, dealRoles, pickStartingLeader, buildRoleKnowledge } from './setup';
import type {
  AvalonPrivateState,
  AvalonPublicState,
  AvalonRoleId,
  AvalonSeatState,
} from './state';

export interface AvalonSeatConfig {
  name: string;
  isAI: boolean;
}

export interface AvalonOptions {
  // List of player names + AI flags. Length determines player count.
  players: AvalonSeatConfig[];
  // Special roles enabled beyond the required Merlin + Assassin.
  specialRoles: AvalonRoleId[];
  // Optional-module toggles (scaffolded only — engine doesn't drive them yet).
  ladyOfTheLake: boolean;
  excalibur: boolean;
  twoLancelots: boolean;
}

function getOptions(config: GameConfig): AvalonOptions {
  return config.gameOptions as unknown as AvalonOptions;
}

// === Helper predicates / counters ============================================

function nextLeader(state: AvalonPrivateState): SeatIndex {
  return (state.currentLeaderSeat + 1) % state.seats.length;
}

function countQuestResult(track: AvalonPrivateState['questHistory'], result: 'success' | 'fail'): number {
  return track.filter((q) => q.result === result).length;
}

function currentSpec(state: AvalonPrivateState) {
  return state.questTrack[state.currentQuestNumber - 1]!;
}

function resetVotes(seats: AvalonSeatState[]): AvalonSeatState[] {
  return seats.map((s) => ({ ...s, voteApprove: null }));
}

function resetQuestCards(seats: AvalonSeatState[]): AvalonSeatState[] {
  return seats.map((s) => ({ ...s, questCard: null }));
}

// === Module ==================================================================

export const avalonModule: GameModule<AvalonPrivateState, AvalonPublicState, AvalonAction> = {
  id: 'avalon',
  displayName: 'Avalon',
  minPlayers: 5,
  maxPlayers: 10,

  createInitialState(config: GameConfig): AvalonPrivateState {
    const opts = getOptions(config);
    const players = opts.players ?? [];
    const playerCount = players.length;
    if (playerCount < this.minPlayers || playerCount > this.maxPlayers) {
      throw new Error(`Avalon requires ${this.minPlayers}-${this.maxPlayers} players (got ${playerCount})`);
    }

    const pool = buildRolePool(playerCount, opts.specialRoles ?? []);
    const dealtSeats = dealRoles(playerCount, pool, config.seed);
    // Overlay player names on top of the seat list.
    const seats: AvalonSeatState[] = dealtSeats.map((s, i) => ({
      ...s,
      name: players[i]?.name ?? `Seat ${i + 1}`,
    }));
    const roleKnowledge = buildRoleKnowledge(seats);
    const startLeader = pickStartingLeader(playerCount, config.seed);

    const setupAcked: Record<SeatIndex, boolean> = {};
    for (let i = 0; i < playerCount; i++) setupAcked[i] = false;

    return {
      phase: 'setup',
      seats,
      setupAcked,
      currentQuestNumber: 1,
      questTrack: questTrack(playerCount),
      questHistory: [],
      currentLeaderSeat: startLeader,
      proposedTeam: [],
      failedProposalsThisQuest: 0,
      roleKnowledge,
      seed: config.seed,
      winnerTeam: null,
      assassinationTarget: null,
      ladyOfTheLake: null,
      excalibur: null,
      lancelotSwapDeck: null,
      lancelotSwapsApplied: 0,
    };
  },

  applyAction(state: AvalonPrivateState, action: AvalonAction): AvalonPrivateState {
    // Wrap most branches in a fresh state object so reducers stay immutable.
    switch (action.type) {
      case 'ackRoleReveal': {
        if (state.phase !== 'setup') {
          throw new Error('ackRoleReveal only valid in setup phase');
        }
        if (action.bySeat < 0 || action.bySeat >= state.seats.length) {
          throw new Error(`Invalid seat ${action.bySeat}`);
        }
        const acked: Record<SeatIndex, boolean> = { ...state.setupAcked, [action.bySeat]: true };
        const everyone = state.seats.every((s) => acked[s.index]);
        return {
          ...state,
          setupAcked: acked,
          phase: everyone ? 'teamProposal' : 'setup',
        };
      }

      case 'proposeTeam': {
        if (state.phase !== 'teamProposal') {
          throw new Error('proposeTeam only valid in teamProposal phase');
        }
        if (action.bySeat !== state.currentLeaderSeat) {
          throw new Error('Only the current leader can propose a team');
        }
        const spec = currentSpec(state);
        const team = [...new Set(action.team)].sort((a, b) => a - b);
        if (team.length !== spec.teamSize) {
          throw new Error(`Quest ${state.currentQuestNumber} needs ${spec.teamSize} players`);
        }
        for (const s of team) {
          if (s < 0 || s >= state.seats.length) throw new Error(`Invalid seat ${s}`);
        }
        return {
          ...state,
          proposedTeam: team,
          seats: resetVotes(state.seats),
          phase: 'teamVote',
        };
      }

      case 'castTeamVote': {
        if (state.phase !== 'teamVote') {
          throw new Error('castTeamVote only valid in teamVote phase');
        }
        if (action.bySeat < 0 || action.bySeat >= state.seats.length) {
          throw new Error(`Invalid seat ${action.bySeat}`);
        }
        if (state.seats[action.bySeat]!.voteApprove !== null) {
          throw new Error(`Seat ${action.bySeat} has already voted`);
        }
        const seats = state.seats.map((s, i) =>
          i === action.bySeat ? { ...s, voteApprove: action.approve } : s,
        );
        const everyoneVoted = seats.every((s) => s.voteApprove !== null);
        if (!everyoneVoted) {
          return { ...state, seats };
        }
        return { ...state, seats, phase: 'teamVoteReveal' };
      }

      case 'ackTeamVoteReveal': {
        if (state.phase !== 'teamVoteReveal') {
          throw new Error('ackTeamVoteReveal only valid in teamVoteReveal phase');
        }
        const approveCount = state.seats.filter((s) => s.voteApprove === true).length;
        const rejectCount = state.seats.length - approveCount;
        const approved = approveCount > rejectCount;

        if (approved) {
          // Move to quest execution. Clear quest cards on the new team.
          return {
            ...state,
            phase: 'questExecution',
            seats: resetQuestCards(state.seats),
            failedProposalsThisQuest: 0,
          };
        }
        // Rejected: bump counter, pass leader. If counter hits MAX, evil wins.
        const newFails = state.failedProposalsThisQuest + 1;
        if (newFails >= MAX_REJECTED_PROPOSALS) {
          return {
            ...state,
            phase: 'gameOver',
            winnerTeam: 'evil',
            failedProposalsThisQuest: newFails,
            seats: resetVotes(state.seats),
            proposedTeam: [],
          };
        }
        return {
          ...state,
          phase: 'teamProposal',
          currentLeaderSeat: nextLeader(state),
          failedProposalsThisQuest: newFails,
          seats: resetVotes(state.seats),
          proposedTeam: [],
        };
      }

      case 'playQuestCard': {
        if (state.phase !== 'questExecution') {
          throw new Error('playQuestCard only valid in questExecution phase');
        }
        if (!state.proposedTeam.includes(action.bySeat)) {
          throw new Error(`Seat ${action.bySeat} is not on this quest team`);
        }
        const playing = state.seats[action.bySeat]!;
        if (playing.questCard !== null) {
          throw new Error(`Seat ${action.bySeat} already played a card`);
        }
        if (playing.alignment === 'good' && !action.success) {
          throw new Error('Good players must play success');
        }
        const seats = state.seats.map((s, i) =>
          i === action.bySeat ? { ...s, questCard: action.success } : s,
        );

        const allPlayed = state.proposedTeam.every((s) => seats[s]!.questCard !== null);
        if (!allPlayed) {
          return { ...state, seats };
        }
        // Resolve quest.
        const spec = currentSpec(state);
        const failCount = state.proposedTeam.filter((s) => seats[s]!.questCard === false).length;
        const result: 'success' | 'fail' = failCount >= spec.failsRequired ? 'fail' : 'success';
        const record = {
          questNumber: state.currentQuestNumber,
          teamSize: spec.teamSize,
          failsRequired: spec.failsRequired,
          team: state.proposedTeam,
          failCount,
          result,
        };
        return {
          ...state,
          seats,
          questHistory: [...state.questHistory, record],
          phase: 'questResolution',
        };
      }

      case 'ackQuestResolution': {
        if (state.phase !== 'questResolution') {
          throw new Error('ackQuestResolution only valid in questResolution phase');
        }
        const successes = countQuestResult(state.questHistory, 'success');
        const fails = countQuestResult(state.questHistory, 'fail');

        if (fails >= 3) {
          return { ...state, phase: 'gameOver', winnerTeam: 'evil' };
        }
        if (successes >= 3) {
          // Good wins the quest race; assassin gets a shot at Merlin.
          const hasAssassin = state.seats.some((s) => s.role === 'assassin');
          if (hasAssassin) {
            return { ...state, phase: 'assassinPick' };
          }
          return { ...state, phase: 'gameOver', winnerTeam: 'good' };
        }
        // Quest race ongoing: advance to next quest, next leader.
        return {
          ...state,
          phase: 'teamProposal',
          currentQuestNumber: state.currentQuestNumber + 1,
          currentLeaderSeat: nextLeader(state),
          proposedTeam: [],
          failedProposalsThisQuest: 0,
          seats: resetVotes(resetQuestCards(state.seats)),
        };
      }

      case 'assassinateMerlin': {
        if (state.phase !== 'assassinPick') {
          throw new Error('assassinateMerlin only valid in assassinPick phase');
        }
        const assassinSeat = state.seats.find((s) => s.role === 'assassin');
        if (!assassinSeat || assassinSeat.index !== action.bySeat) {
          throw new Error('Only the Assassin can perform this action');
        }
        if (action.target < 0 || action.target >= state.seats.length) {
          throw new Error(`Invalid assassination target ${action.target}`);
        }
        const targetRole = state.seats[action.target]!.role;
        const winner: 'good' | 'evil' = targetRole === 'merlin' ? 'evil' : 'good';
        return {
          ...state,
          phase: 'gameOver',
          assassinationTarget: action.target,
          winnerTeam: winner,
        };
      }

      // --- Optional modules (scaffolded; not yet driven) ------------------
      case 'ladyInvestigate':
      case 'ladyDeclare':
      case 'assignExcalibur':
      case 'useExcalibur':
        return state;
    }
  },

  viewFor(state: AvalonPrivateState, seat: SeatIndex | null): AvalonPublicState {
    const own = seat === null ? null : state.seats[seat] ?? null;
    const gameOver = state.phase === 'gameOver';

    // During teamVote phase we suppress all per-seat votes so they can't be
    // observed mid-tally. They become public on the teamVoteReveal screen.
    const hideVotes = state.phase === 'teamVote';

    return {
      phase: state.phase,
      seats: state.seats.map((s) => ({
        index: s.index,
        name: s.name,
        voteApprove: hideVotes ? null : s.voteApprove,
        isCurrentLeader: s.index === state.currentLeaderSeat,
        isOnProposedTeam: state.proposedTeam.includes(s.index),
        hasAckedSetup: !!state.setupAcked[s.index],
        revealedRole: gameOver ? s.role : null,
        revealedAlignment: gameOver ? s.alignment : null,
      })),
      currentQuestNumber: state.currentQuestNumber,
      questTrack: state.questTrack,
      questHistory: state.questHistory,
      failedProposalsThisQuest: state.failedProposalsThisQuest,
      proposedTeam: state.proposedTeam,
      currentLeaderSeat: state.currentLeaderSeat,
      winnerTeam: state.winnerTeam,
      questCardsSubmitted:
        state.phase === 'questExecution'
          ? state.proposedTeam.filter((s) => state.seats[s]?.questCard !== null).length
          : 0,
      assassinationTarget: state.assassinationTarget,
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
      yourSeat: seat,
      yourRole: own?.role ?? null,
      yourAlignment: own?.alignment ?? null,
      yourRoleKnowledge: seat === null ? [] : state.roleKnowledge[seat] ?? [],
      yourQuestCard: own?.questCard ?? null,
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
    // Default special-role recipe: Percival + Morgana first, then Mordred at
    // 7+, then Oberon at 10. Common practice.
    const specialRoles: AvalonRoleId[] = [];
    if (playerCount >= 5) {
      specialRoles.push('percival', 'morgana');
    }
    if (playerCount >= 7) {
      specialRoles.push('mordred');
    }
    // Trim to fit alignment quotas.
    const safeSpecials = trimToFit(playerCount, specialRoles);

    const options: AvalonOptions = {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: `Player ${i + 1}`,
        isAI: false,
      })),
      specialRoles: safeSpecials,
      ladyOfTheLake: false,
      excalibur: false,
      twoLancelots: false,
    };
    return {
      gameId: 'avalon',
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: options as unknown as Record<string, unknown>,
    };
  },
};

// Used by both `defaultConfig` and the lobby UI to clamp special-role
// selections to the alignment quotas for the player count.
function trimToFit(playerCount: number, specialRoles: AvalonRoleId[]): AvalonRoleId[] {
  try {
    buildRolePool(playerCount, specialRoles);
    return specialRoles;
  } catch {
    // Drop one at a time from the tail until it fits.
    let cur = specialRoles.slice();
    while (cur.length > 0) {
      cur = cur.slice(0, -1);
      try {
        buildRolePool(playerCount, cur);
        return cur;
      } catch {
        // keep trimming
      }
    }
    return [];
  }
}

// Re-exports for UI consumers.
export { ROLES, BASE_OPTIONAL_SPECIAL_ROLES };
