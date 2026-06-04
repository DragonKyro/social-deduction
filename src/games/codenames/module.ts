import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { CodenamesAction } from './actions';
import { buildBoard, pickStartingTeam } from './setup';
import type {
  CodenamesClueRecord,
  CodenamesPrivateState,
  CodenamesPublicCard,
  CodenamesPublicState,
  CodenamesSeatState,
  TeamColor,
} from './state';

export interface CodenamesSeatConfig {
  name: string;
  team: TeamColor;
  // Exactly one spymaster per team. Other team members are operatives.
  role: 'spymaster' | 'operative';
  isAI: boolean;
}

export interface CodenamesOptions {
  players: CodenamesSeatConfig[];
  // Optional override of the default word pool. We don't expose this in
  // the UI yet — it's a hook for themed decks.
  wordPool?: string[];
}

function getOptions(config: GameConfig): CodenamesOptions {
  return config.gameOptions as unknown as CodenamesOptions;
}

function otherTeam(t: TeamColor): TeamColor {
  return t === 'red' ? 'blue' : 'red';
}

function teamRemaining(state: CodenamesPrivateState, team: TeamColor): number {
  return state.cards.filter((c) => c.kind === team && !c.revealed).length;
}

// Compute a clue's bonus-guess cap. A clue of N permits up to N+1 guesses
// in total (rulebook: "you may always make one guess in addition to your
// clue number"). N = 0 means "Unlimited" — operatives may keep going as
// long as they hit their own cards, with no bonus cap.
function maxGuesses(clueNumber: number): number {
  if (clueNumber <= 0) return Infinity;
  return clueNumber + 1;
}

function closeClue(
  state: CodenamesPrivateState,
  reason: CodenamesClueRecord['closedReason'],
): CodenamesPrivateState {
  if (!state.currentClue) return state;
  const idx = state.clueHistory.length - 1;
  const updated = state.clueHistory.map((r, i) =>
    i === idx ? { ...r, closed: true, closedReason: reason, correctGuesses: state.guessesThisClue } : r,
  );
  return {
    ...state,
    clueHistory: updated,
    currentClue: null,
    guessesThisClue: 0,
  };
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
    // Validate team / role composition: exactly one spymaster per team and
    // at least one operative per team.
    for (const team of ['red', 'blue'] as TeamColor[]) {
      const onTeam = players.filter((p) => p.team === team);
      const spymasters = onTeam.filter((p) => p.role === 'spymaster');
      const operatives = onTeam.filter((p) => p.role === 'operative');
      if (spymasters.length !== 1) {
        throw new Error(`Team ${team} must have exactly one spymaster (got ${spymasters.length})`);
      }
      if (operatives.length < 1) {
        throw new Error(`Team ${team} must have at least one operative`);
      }
    }

    const startingTeam = pickStartingTeam(config.seed);
    const cards = buildBoard(config.seed, startingTeam, opts.wordPool);
    const seats: CodenamesSeatState[] = players.map((p, i) => ({
      index: i,
      name: p.name,
      team: p.team,
      role: p.role,
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
        const seat = state.seats[action.bySeat];
        if (!seat) throw new Error(`Invalid seat ${action.bySeat}`);
        if (seat.team !== state.currentTeam) {
          throw new Error("Only the current team's spymaster may give a clue");
        }
        if (seat.role !== 'spymaster') {
          throw new Error('Only the spymaster may give a clue');
        }
        const trimmed = action.word.trim();
        if (!trimmed) throw new Error('Clue word is required');
        if (/\s/.test(trimmed)) throw new Error('Clue must be a single word');
        // 0 = unlimited; otherwise 1..9 (board only has 9 cards for the
        // starting team, so capping at 9 is plenty).
        if (!Number.isInteger(action.number) || action.number < 0 || action.number > 9) {
          throw new Error('Clue number must be an integer 0–9');
        }
        // Rulebook: clue can't be one of the words on the board, even ones
        // already revealed — once it's been used it stays off-limits.
        const upper = trimmed.toUpperCase();
        if (state.cards.some((c) => c.word.toUpperCase() === upper)) {
          throw new Error('Clue may not match a word on the board');
        }
        const clue = {
          word: upper,
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
        const seat = state.seats[action.bySeat];
        if (!seat) throw new Error(`Invalid seat ${action.bySeat}`);
        if (seat.team !== state.currentTeam) {
          throw new Error("Only the current team's operatives may guess");
        }
        if (seat.role !== 'operative') {
          throw new Error('Spymasters do not guess');
        }
        const card = state.cards[action.cardIndex];
        if (!card) throw new Error(`Invalid card index ${action.cardIndex}`);
        if (card.revealed) throw new Error('Card already revealed');
        if (!state.currentClue) throw new Error('No active clue');

        // Reveal the card and log the guess.
        const cards = state.cards.map((c, i) =>
          i === action.cardIndex ? { ...c, revealed: true } : c,
        );
        const guessHistory = [
          ...state.guessHistory,
          {
            cardIndex: action.cardIndex,
            word: card.word,
            kind: card.kind,
            byTeam: seat.team,
            bySeat: seat.index,
            clueIndex: state.clueHistory.length - 1,
          },
        ];

        // Did they hit the assassin? Instant loss for the guessing team.
        if (card.kind === 'assassin') {
          let next: CodenamesPrivateState = {
            ...state,
            cards,
            guessHistory,
            guessesThisClue: state.guessesThisClue + 1,
          };
          next = closeClue(next, 'hitAssassin');
          return {
            ...next,
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
            let next: CodenamesPrivateState = {
              ...state,
              cards,
              guessHistory,
              guessesThisClue: state.guessesThisClue + 1,
            };
            next = closeClue(next, 'capReached');
            return {
              ...next,
              phase: 'gameOver',
              winnerTeam: seat.team,
              loserTeam: null,
            };
          }
          // Otherwise, increment guess counter and check the cap. If they
          // hit the cap exactly, turn ends; otherwise they may guess again
          // or stop voluntarily.
          const guessesAfter = state.guessesThisClue + 1;
          const cap = maxGuesses(state.currentClue.number);
          if (guessesAfter >= cap) {
            let next: CodenamesPrivateState = {
              ...state,
              cards,
              guessHistory,
              guessesThisClue: guessesAfter,
            };
            next = closeClue(next, 'capReached');
            return {
              ...next,
              phase: 'clue',
              currentTeam: otherTeam(seat.team),
            };
          }
          return {
            ...state,
            cards,
            guessHistory,
            guessesThisClue: guessesAfter,
          };
        }

        // Wrong color (opponent or bystander): turn ends. Opponent's card
        // might have closed out the game for them.
        const opponent = otherTeam(seat.team);
        const opponentRemaining = cards.filter((c) => c.kind === opponent && !c.revealed).length;
        let next: CodenamesPrivateState = {
          ...state,
          cards,
          guessHistory,
          guessesThisClue: state.guessesThisClue + 1,
        };
        next = closeClue(next, 'hitWrong');
        if (card.kind === opponent && opponentRemaining === 0) {
          // We just flipped the opponent's last card — they win.
          return {
            ...next,
            phase: 'gameOver',
            winnerTeam: opponent,
            loserTeam: null,
          };
        }
        return {
          ...next,
          phase: 'clue',
          currentTeam: opponent,
        };
      }

      case 'endGuessing': {
        if (state.phase !== 'guessing') {
          throw new Error('endGuessing only valid in guessing phase');
        }
        const seat = state.seats[action.bySeat];
        if (!seat) throw new Error(`Invalid seat ${action.bySeat}`);
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
        const next = closeClue(state, 'endedVoluntarily');
        return {
          ...next,
          phase: 'clue',
          currentTeam: otherTeam(seat.team),
        };
      }
    }
  },

  viewFor(state: CodenamesPrivateState, seat: SeatIndex | null): CodenamesPublicState {
    const own = seat === null ? null : (state.seats[seat] ?? null);
    const isSpymaster = own?.role === 'spymaster';
    const gameOver = state.phase === 'gameOver';

    const cards: CodenamesPublicCard[] = state.cards.map((c) => ({
      index: c.index,
      word: c.word,
      revealed: c.revealed,
      // A card's kind is visible if: it's been revealed, OR the viewer is a
      // spymaster (they see the key from the start), OR the game is over.
      kind: c.revealed || isSpymaster || gameOver ? c.kind : null,
    }));

    return {
      phase: state.phase,
      seats: state.seats.map((s) => ({
        index: s.index,
        name: s.name,
        team: s.team,
        role: s.role,
      })),
      cards,
      startingTeam: state.startingTeam,
      currentTeam: state.currentTeam,
      currentClue: state.currentClue,
      guessesThisClue: state.guessesThisClue,
      remaining: {
        red: teamRemaining(state, 'red'),
        blue: teamRemaining(state, 'blue'),
      },
      clueHistory: state.clueHistory,
      guessHistory: state.guessHistory,
      winnerTeam: state.winnerTeam,
      loserTeam: state.loserTeam,
      yourSeat: seat,
      yourTeam: own?.team ?? null,
      yourRole: own?.role ?? null,
    };
  },

  isFinished(state: CodenamesPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  defaultConfig(playerCount: number): GameConfig {
    // Balanced 2v2 default at the lower end; scale up by adding operatives.
    // Spymasters are always seats 0 (red) and 1 (blue) by default.
    const half = Math.ceil(playerCount / 2);
    const players: CodenamesSeatConfig[] = Array.from({ length: playerCount }, (_, i) => {
      const team: TeamColor = i < half ? 'red' : 'blue';
      // First seat on each team is its spymaster.
      const isFirstOnTeam = i === 0 || i === half;
      return {
        name: `Player ${i + 1}`,
        team,
        role: isFirstOnTeam ? 'spymaster' : 'operative',
        isAI: false,
      };
    });
    const opts: CodenamesOptions = { players };
    return {
      gameId: 'codenames',
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
  },
};
