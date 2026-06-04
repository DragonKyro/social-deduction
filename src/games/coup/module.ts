import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { CoupGameAction } from './actions';
import type { CoupPrivateState, CoupPublicState, CoupRuleset } from './state';

export interface CoupOptions {
  // Classic 5-character base, or G54 25-character pool with 5-of-25 picked
  // per match.
  ruleset: CoupRuleset;
  // G54 only. 'anarchy' adds 6+ characters and the Social Media general
  // action. Empty in classic.
  expansions: Array<'anarchy'>;
  // G54 only. If non-empty, use exactly these 5 characters; otherwise the
  // host picks 5 at random from the active pool (base 25, or 25+anarchy
  // when the expansion is on). Length must be 5.
  curatedCharacters?: string[];
}

export const coupModule: GameModule<CoupPrivateState, CoupPublicState, CoupGameAction> = {
  id: 'coup',
  displayName: 'Coup',
  minPlayers: 2,
  // Classic supports up to 6. G54 supports 3-6 base; Anarchy extends to
  // 3-6 (some retailers list "up to 10" — house-rule territory, deferred).
  // We expose 10 here and let the lobby clamp based on ruleset.
  maxPlayers: 10,

  createInitialState(config: GameConfig): CoupPrivateState {
    const opts = config.gameOptions as unknown as CoupOptions;
    return {
      phase: 'setup',
      ruleset: opts.ruleset,
      expansions: opts.expansions,
      activeCharacters: [],
      seats: [],
      deck: [],
      currentSeat: 0,
      pending: null,
      exchangeOffer: null,
      seed: config.seed,
      winnerSeat: null,
    };
  },

  applyAction(state: CoupPrivateState, _action: CoupGameAction): CoupPrivateState {
    return state;
  },

  viewFor(state: CoupPrivateState, seat: SeatIndex | null): CoupPublicState {
    const ownSeat = seat === null ? null : state.seats[seat];
    return {
      phase: state.phase,
      ruleset: state.ruleset,
      expansions: state.expansions,
      activeCharacters: state.activeCharacters,
      seats: state.seats.map((s) => ({
        index: s.index,
        name: `Seat ${s.index}`,
        coins: s.coins,
        influences: s.influences.map((inf) =>
          inf.revealed ? { char: inf.char, revealed: true } : { char: null, revealed: false },
        ),
        eliminated: s.eliminated,
        tokens: s.tokens,
      })),
      currentSeat: state.currentSeat,
      pending: state.pending,
      deckSize: state.deck.length,
      winnerSeat: state.winnerSeat,
      yourInfluences: ownSeat?.influences ?? [],
      yourExchangeOffer:
        seat !== null && state.currentSeat === seat ? state.exchangeOffer : null,
    };
  },

  isFinished(state: CoupPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  defaultConfig(_playerCount: number): GameConfig {
    // Default: classic 5-character base. The lobby UI lets the host
    // upgrade to G54 + optionally Anarchy.
    const options: CoupOptions = {
      ruleset: 'classic',
      expansions: [],
    };
    return {
      gameId: 'coup',
      seats: [],
      seed: 0,
      gameOptions: options as unknown as Record<string, unknown>,
    };
  },
};
