import type { GameConfig, GameModule } from '@/engine/types';
import type { CodenamesAction } from './actions';
import { aiChooseAction } from './ai';
import { clueNumberProblem, clueProblem, maxGuesses, visibleWords } from './rules';
import { codenamesViewFor } from './view';
import { buildBoard, pickStartingTeam, GRID_SIZE } from './setup';
import type {
  CodenamesClueRecord,
  CodenamesPrivateState,
  CodenamesPublicState,
  CodenamesSeatState,
  TeamColor,
} from './state';
import { buildPoolFromPacks, type WordPackId } from '@/words';

export type CodenamesRole = 'spymaster' | 'operative';

/** Team + role for one seat. */
export interface CodenamesTeamSlot {
  team: TeamColor;
  role: CodenamesRole;
}

export interface CodenamesSeatConfig {
  name: string;
  // Optional because the shared launcher / online lobby rebuild `players`
  // as plain `{ name, isAI }`. The seat's team + role then come from
  // `CodenamesOptions.teams` (or the default split).
  team?: TeamColor;
  role?: CodenamesRole;
  isAI?: boolean;
}

export interface CodenamesOptions {
  players: CodenamesSeatConfig[];
  // Seat-indexed team / role assignment. Lives outside `players` so it
  // survives `launchGame` and the online lobby overwriting `players`.
  // Ignored when its length doesn't match the seat count (the lobby changed
  // size) — the default split is used instead.
  teams?: CodenamesTeamSlot[];
  // Selected word packs (multi-select). Words are deduped across packs.
  // If empty/missing we fall back to ['classic'] so default behavior is
  // unchanged. Use the legacy `wordPool` field if you want to inject a
  // bespoke deck directly (precedence over packs when both are set).
  packs?: WordPackId[];
  wordPool?: string[];
}

function getOptions(config: GameConfig): CodenamesOptions {
  return config.gameOptions as unknown as CodenamesOptions;
}

function otherTeam(t: TeamColor): TeamColor {
  return t === 'red' ? 'blue' : 'red';
}

function isTeam(t: unknown): t is TeamColor {
  return t === 'red' || t === 'blue';
}

function isRole(r: unknown): r is CodenamesRole {
  return r === 'spymaster' || r === 'operative';
}

/**
 * Default split: first half red, second half blue; each team's first seat
 * is its spymaster. Valid for every supported count (4+ ⇒ 2+ per team).
 */
export function defaultTeams(count: number): CodenamesTeamSlot[] {
  const half = Math.ceil(count / 2);
  return Array.from({ length: count }, (_, i) => ({
    team: i < half ? ('red' as const) : ('blue' as const),
    role: i === 0 || i === half ? ('spymaster' as const) : ('operative' as const),
  }));
}

function resolveTeams(opts: CodenamesOptions): CodenamesTeamSlot[] {
  const players = opts.players ?? [];
  if (players.length > 0 && players.every((p) => isTeam(p.team) && isRole(p.role))) {
    return players.map((p) => ({ team: p.team!, role: p.role! }));
  }
  const teams = opts.teams;
  if (
    Array.isArray(teams) &&
    teams.length === players.length &&
    teams.every((t) => t && isTeam(t.team) && isRole(t.role))
  ) {
    return teams.map((t) => ({ team: t.team, role: t.role }));
  }
  return defaultTeams(players.length);
}

/** Problem with a team / role assignment, or null. Shared with the setup UI. */
export function teamsProblem(slots: readonly CodenamesTeamSlot[]): string | null {
  for (const team of ['red', 'blue'] as TeamColor[]) {
    const onTeam = slots.filter((p) => p.team === team);
    const spymasters = onTeam.filter((p) => p.role === 'spymaster').length;
    const operatives = onTeam.filter((p) => p.role === 'operative').length;
    if (spymasters !== 1) return `Team ${team} must have exactly one spymaster (got ${spymasters})`;
    if (operatives < 1) return `Team ${team} must have at least one operative`;
  }
  return null;
}

function closeClue(
  state: CodenamesPrivateState,
  reason: CodenamesClueRecord['closedReason'],
): CodenamesPrivateState {
  if (!state.currentClue) return state;
  const idx = state.clueHistory.length - 1;
  // Only contacts with the team's own agents count; a guess that ends the
  // turn on a wrong card is not a correct guess.
  const correct = state.guessHistory.filter((g) => g.clueIndex === idx && g.kind === g.byTeam).length;
  const updated = state.clueHistory.map((r, i) =>
    i === idx ? { ...r, closed: true, closedReason: reason, correctGuesses: correct } : r,
  );
  return {
    ...state,
    clueHistory: updated,
    currentClue: null,
    guessesThisClue: 0,
  };
}

function seatFor(state: CodenamesPrivateState, bySeat: unknown): CodenamesSeatState {
  const seat = typeof bySeat === 'number' && Number.isInteger(bySeat) ? state.seats[bySeat] : undefined;
  if (!seat) throw new Error(`Invalid seat ${String(bySeat)}`);
  return seat;
}

// === Module ==================================================================

export const codenamesModule: GameModule<
  CodenamesPrivateState,
  CodenamesPublicState,
  CodenamesAction
> = {
  id: 'codenames',
  displayName: 'Codenames',
  minPlayers: 4,
  maxPlayers: 16,

  createInitialState(config: GameConfig): CodenamesPrivateState {
    const opts = getOptions(config);
    const players = opts.players ?? [];
    if (players.length < this.minPlayers || players.length > this.maxPlayers) {
      throw new Error(`Codenames requires ${this.minPlayers}-${this.maxPlayers} players (got ${players.length})`);
    }
    // Team / role composition: exactly one spymaster per team and at least
    // one operative per team.
    const slots = resolveTeams(opts);
    const problem = teamsProblem(slots);
    if (problem) throw new Error(problem);

    const startingTeam = pickStartingTeam(config.seed);
    // Resolve word pool: explicit wordPool wins, else union of selected
    // packs, else classic default. We require ≥ 25 unique words after
    // dedup so the deal can never starve.
    const resolvedPool = opts.wordPool
      ? opts.wordPool
      : buildPoolFromPacks(opts.packs && opts.packs.length > 0 ? opts.packs : ['classic']);
    const cards = buildBoard(config.seed, startingTeam, resolvedPool);
    const seats: CodenamesSeatState[] = players.map((p, i) => ({
      index: i,
      name: p.name,
      team: slots[i]!.team,
      role: slots[i]!.role,
      isAI: !!p.isAI,
    }));

    return {
      phase: 'clue',
      seats,
      cards,
      startingTeam,
      currentTeam: startingTeam,
      currentClue: null,
      guessesThisClue: 0,
      clueHistory: [],
      guessHistory: [],
      seed: config.seed,
      winnerTeam: null,
      loserTeam: null,
    };
  },

  applyAction(state: CodenamesPrivateState, action: CodenamesAction): CodenamesPrivateState {
    if (state.phase === 'gameOver') {
      throw new Error('Game is already over');
    }
    switch (action.type) {
      case 'giveClue': {
        if (state.phase !== 'clue') {
          throw new Error('giveClue only valid in clue phase');
        }
        const seat = seatFor(state, action.bySeat);
        if (seat.team !== state.currentTeam) {
          throw new Error("Only the current team's spymaster may give a clue");
        }
        if (seat.role !== 'spymaster') {
          throw new Error('Only the spymaster may give a clue');
        }
        // 0 = unlimited; otherwise 1..9 (the starting team only has 9).
        const numberProblem = clueNumberProblem(action.number);
        if (numberProblem) throw new Error(numberProblem);
        // Rulebook: one word, not any form of a word still visible on the
        // board. Covered (revealed) words become legal again.
        const problem = clueProblem(action.word, visibleWords(state.cards));
        if (problem) throw new Error(problem);
        const clue = {
          word: action.word.trim().toUpperCase(),
          number: action.number,
          byTeam: seat.team,
          bySeat: seat.index,
        };
        const record: CodenamesClueRecord = {
          ...clue,
          correctGuesses: 0,
          closed: false,
          closedReason: null,
        };
        return {
          ...state,
          phase: 'guessing',
          currentClue: clue,
          guessesThisClue: 0,
          clueHistory: [...state.clueHistory, record],
        };
      }

      case 'guessCard': {
        if (state.phase !== 'guessing') {
          throw new Error('guessCard only valid in guessing phase');
        }
        const seat = seatFor(state, action.bySeat);
        if (seat.team !== state.currentTeam) {
          throw new Error("Only the current team's operatives may guess");
        }
        if (seat.role !== 'operative') {
          throw new Error('Spymasters do not guess');
        }
        const idx = action.cardIndex;
        if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= GRID_SIZE) {
          throw new Error(`Invalid card index ${String(idx)}`);
        }
        const card = state.cards[idx];
        if (!card) throw new Error(`Invalid card index ${idx}`);
        if (card.revealed) throw new Error('Card already revealed');
        if (!state.currentClue) throw new Error('No active clue');

        // Reveal the card and log the guess.
        const cards = state.cards.map((c, i) => (i === idx ? { ...c, revealed: true } : c));
        const guessHistory = [
          ...state.guessHistory,
          {
            cardIndex: idx,
            word: card.word,
            kind: card.kind,
            byTeam: seat.team,
            bySeat: seat.index,
            clueIndex: state.clueHistory.length - 1,
          },
        ];
        const base: CodenamesPrivateState = {
          ...state,
          cards,
          guessHistory,
          guessesThisClue: state.guessesThisClue + 1,
        };

        // Did they hit the assassin? Instant loss for the guessing team.
        if (card.kind === 'assassin') {
          return {
            ...closeClue(base, 'hitAssassin'),
            phase: 'gameOver',
            winnerTeam: otherTeam(seat.team),
            loserTeam: seat.team,
          };
        }

        // Correct guess: card belongs to the guessing team.
        if (card.kind === seat.team) {
          // Win check first — last card of your color flips => you win.
          const myRemaining = cards.filter((c) => c.kind === seat.team && !c.revealed).length;
          if (myRemaining === 0) {
            return {
              ...closeClue(base, 'capReached'),
              phase: 'gameOver',
              winnerTeam: seat.team,
              loserTeam: null,
            };
          }
          // Hit the N+1 cap → turn ends; otherwise they may guess again or
          // stop voluntarily.
          if (base.guessesThisClue >= maxGuesses(state.currentClue.number)) {
            return {
              ...closeClue(base, 'capReached'),
              phase: 'clue',
              currentTeam: otherTeam(seat.team),
            };
          }
          return base;
        }

        // Wrong color (opponent or bystander): turn ends. Opponent's card
        // might have closed out the game for them.
        const opponent = otherTeam(seat.team);
        const opponentRemaining = cards.filter((c) => c.kind === opponent && !c.revealed).length;
        const closed = closeClue(base, 'hitWrong');
        if (card.kind === opponent && opponentRemaining === 0) {
          // We just flipped the opponent's last card — they win.
          return { ...closed, phase: 'gameOver', winnerTeam: opponent, loserTeam: null };
        }
        return { ...closed, phase: 'clue', currentTeam: opponent };
      }

      case 'endGuessing': {
        if (state.phase !== 'guessing') {
          throw new Error('endGuessing only valid in guessing phase');
        }
        const seat = seatFor(state, action.bySeat);
        if (seat.team !== state.currentTeam) {
          throw new Error("Only the current team's operatives may end the turn");
        }
        if (seat.role !== 'operative') {
          throw new Error('Spymasters do not end the guessing turn');
        }
        // Rulebook: the operatives must make at least one guess on their
        // turn. Enforce it.
        if (state.guessesThisClue < 1) {
          throw new Error('You must make at least one guess before ending the turn');
        }
        return {
          ...closeClue(state, 'endedVoluntarily'),
          phase: 'clue',
          currentTeam: otherTeam(seat.team),
        };
      }

      default:
        throw new Error(`Unknown action ${(action as { type?: unknown }).type as string}`);
    }
  },

  viewFor: codenamesViewFor,

  isFinished(state: CodenamesPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  aiChooseAction,

  defaultConfig(playerCount: number): GameConfig {
    // Balanced default; spymasters are the first seat of each team.
    const teams = defaultTeams(playerCount);
    const players: CodenamesSeatConfig[] = teams.map((t, i) => ({
      name: `Player ${i + 1}`,
      team: t.team,
      role: t.role,
      isAI: false,
    }));
    const opts: CodenamesOptions = { players, teams, packs: ['classic'] };
    return {
      gameId: 'codenames',
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
  },
};
