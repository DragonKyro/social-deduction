import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { AvalonAction } from './actions';
import { aiChooseAction } from './ai';
import { ROLES, BASE_OPTIONAL_SPECIAL_ROLES } from './roles';
import { questTrack, MAX_REJECTED_PROPOSALS } from './quest-tracks';
import { buildRolePool, dealRoles, pickStartingLeader, buildRoleKnowledge } from './setup';
import { viewFor } from './view';
import type {
  AvalonPrivateState,
  AvalonPublicState,
  AvalonProposalRecord,
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
  // Special roles enabled beyond the required Merlin + Assassin. Base-box
  // specials only (Percival / Morgana / Mordred / Oberon).
  specialRoles: AvalonRoleId[];
  // Optional-module toggles. Scaffolded only: the engine IGNORES these and
  // never enables a module, so no half-wired phase is reachable.
  ladyOfTheLake: boolean;
  excalibur: boolean;
  twoLancelots: boolean;
}

function getOptions(config: GameConfig): AvalonOptions {
  return config.gameOptions as unknown as AvalonOptions;
}

// === Helper predicates / validators ==========================================

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

// Online, the network layer guarantees `action.bySeat` is the sender's seat,
// but the VALUE still comes off the wire: a non-integer like 1.5 or "2" would
// otherwise slip through `< 0 || >= n` checks and wedge the game (a "team
// member" that can never play its card).
function isSeat(state: AvalonPrivateState, seat: unknown): seat is SeatIndex {
  return typeof seat === 'number' && Number.isInteger(seat) && seat >= 0 && seat < state.seats.length;
}

function assertSeat(state: AvalonPrivateState, seat: unknown, what = 'seat'): asserts seat is SeatIndex {
  if (!isSeat(state, seat)) throw new Error(`Invalid ${what} ${String(seat)}`);
}

function assertBool(v: unknown, what: string): asserts v is boolean {
  if (typeof v !== 'boolean') throw new Error(`${what} must be a boolean`);
}

function isApproved(votes: Array<boolean | null>): boolean {
  // Strict majority approves; a tie rejects (rulebook).
  const approve = votes.filter((v) => v === true).length;
  return approve > votes.length - approve;
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

    // Throws on Lancelots / unknown ids / alignment overflow.
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
      proposalHistory: [],
      currentLeaderSeat: startLeader,
      proposedTeam: [],
      failedProposalsThisQuest: 0,
      roleKnowledge,
      seed: config.seed,
      winnerTeam: null,
      assassinationTarget: null,
      // Optional modules are scaffolded only — never enabled, whatever the
      // options say.
      ladyOfTheLake: null,
      excalibur: null,
      lancelotSwapDeck: null,
      lancelotSwapsApplied: 0,
    };
  },

  applyAction(state: AvalonPrivateState, action: AvalonAction): AvalonPrivateState {
    if (state.phase === 'gameOver') throw new Error('The game is over');
    switch (action.type) {
      case 'ackRoleReveal': {
        if (state.phase !== 'setup') {
          throw new Error('ackRoleReveal only valid in setup phase');
        }
        assertSeat(state, action.bySeat);
        if (state.setupAcked[action.bySeat]) {
          throw new Error(`Seat ${action.bySeat} already acknowledged their role`);
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
        assertSeat(state, action.bySeat);
        if (action.bySeat !== state.currentLeaderSeat) {
          throw new Error('Only the current leader can propose a team');
        }
        if (!Array.isArray(action.team)) throw new Error('team must be an array of seats');
        for (const s of action.team) assertSeat(state, s, 'team seat');
        const spec = currentSpec(state);
        const team = [...new Set(action.team)].sort((a, b) => a - b);
        if (team.length !== spec.teamSize || action.team.length !== spec.teamSize) {
          throw new Error(`Quest ${state.currentQuestNumber} needs ${spec.teamSize} distinct players`);
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
        assertSeat(state, action.bySeat);
        assertBool(action.approve, 'approve');
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
        // Last token is down — the votes become public together, so this is
        // also the moment they enter the (public) proposal log.
        const votes = seats.map((s) => s.voteApprove === true);
        const record: AvalonProposalRecord = {
          questNumber: state.currentQuestNumber,
          attempt: state.failedProposalsThisQuest + 1,
          leader: state.currentLeaderSeat,
          team: state.proposedTeam.slice(),
          votes,
          approved: isApproved(votes),
        };
        return {
          ...state,
          seats,
          phase: 'teamVoteReveal',
          proposalHistory: [...state.proposalHistory, record],
        };
      }

      // Seatless "Continue" control. Online, only the host may send actions
      // without `bySeat` (enforced by the network layer). It's safe for anyone
      // who CAN send it: it is only valid in the reveal phase, carries no
      // payload, and its outcome is fully determined by votes already cast.
      case 'ackTeamVoteReveal': {
        if (state.phase !== 'teamVoteReveal') {
          throw new Error('ackTeamVoteReveal only valid in teamVoteReveal phase');
        }
        const approved = isApproved(state.seats.map((s) => s.voteApprove));

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
        assertSeat(state, action.bySeat);
        assertBool(action.success, 'success');
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
        // Resolve quest. Only the COUNT of fails is recorded.
        const spec = currentSpec(state);
        const failCount = state.proposedTeam.filter((s) => seats[s]!.questCard === false).length;
        const result: 'success' | 'fail' = failCount >= spec.failsRequired ? 'fail' : 'success';
        const record = {
          questNumber: state.currentQuestNumber,
          teamSize: spec.teamSize,
          failsRequired: spec.failsRequired,
          team: state.proposedTeam.slice(),
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

      // Seatless "Continue" control — see ackTeamVoteReveal.
      case 'ackQuestResolution': {
        if (state.phase !== 'questResolution') {
          throw new Error('ackQuestResolution only valid in questResolution phase');
        }
        const successes = countQuestResult(state.questHistory, 'success');
        const fails = countQuestResult(state.questHistory, 'fail');

        if (fails >= 3) {
          return { ...state, phase: 'gameOver', winnerTeam: 'evil', seats: resetQuestCards(state.seats) };
        }
        if (successes >= 3) {
          // Good wins the quest race; the Assassin (always dealt) gets a shot
          // at Merlin.
          const hasAssassin = state.seats.some((s) => s.role === 'assassin');
          if (hasAssassin) {
            return { ...state, phase: 'assassinPick', seats: resetQuestCards(state.seats) };
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
        assertSeat(state, action.bySeat);
        const assassinSeat = state.seats.find((s) => s.role === 'assassin');
        if (!assassinSeat || assassinSeat.index !== action.bySeat) {
          throw new Error('Only the Assassin can perform this action');
        }
        assertSeat(state, action.target, 'assassination target');
        // The Assassin names a GOOD player: not themselves, and not one of
        // the evil teammates they can see.
        if (action.target === assassinSeat.index) {
          throw new Error('The Assassin cannot target themselves');
        }
        const knownTeammates = (state.roleKnowledge[assassinSeat.index] ?? []).map((k) => k.seat);
        if (knownTeammates.includes(action.target)) {
          throw new Error('The Assassin must name a player they believe is good');
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

      // --- Optional modules (scaffolded; not driven) ------------------------
      // Rejected outright rather than silently accepted: a no-op "success"
      // would still bump the tick and fan out views for nothing.
      case 'ladyInvestigate':
      case 'ladyDeclare':
      case 'assignExcalibur':
      case 'useExcalibur':
        throw new Error(`${action.type}: optional modules are not implemented`);

      default:
        throw new Error(`Unknown action ${String((action as { type?: unknown }).type)}`);
    }
  },

  viewFor,

  isFinished(state: AvalonPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  aiChooseAction,

  defaultConfig(playerCount: number): GameConfig {
    // Default special-role recipe: Percival + Morgana first, then Mordred at
    // 7+. Common practice.
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
export function trimToFit(playerCount: number, specialRoles: AvalonRoleId[]): AvalonRoleId[] {
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
export { ROLES, BASE_OPTIONAL_SPECIAL_ROLES, viewFor };
