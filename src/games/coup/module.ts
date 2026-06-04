import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { CoupGameAction } from './actions';
import type { CoupPrivateState, CoupPublicState } from './state';

export interface CoupOptions {
  // Use Inquisitor instead of Ambassador (Reformation expansion variant).
  useInquisitor: boolean;
}

export const coupModule: GameModule<CoupPrivateState, CoupPublicState, CoupGameAction> = {
  id: 'coup',
  displayName: 'Coup',
  minPlayers: 2,
  maxPlayers: 10, // Reformation supports up to 10; base box is 6

  createInitialState(config: GameConfig): CoupPrivateState {
    return {
      phase: 'setup',
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
      seats: state.seats.map((s) => ({
        index: s.index,
        name: `Seat ${s.index}`,
        coins: s.coins,
        influences: s.influences.map((inf) =>
          inf.revealed ? { char: inf.char, revealed: true } : { char: null, revealed: false },
        ),
        eliminated: s.eliminated,
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
    const options: CoupOptions = { useInquisitor: false };
    return {
      gameId: 'coup',
      seats: [],
      seed: 0,
      gameOptions: options as unknown as Record<string, unknown>,
    };
  },
};
