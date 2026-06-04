import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { ShAction } from './actions';
import type { ShPrivateState, ShPublicState } from './state';

// Stub. Real implementation lands in Phase 3.

export interface ShOptions {
  // Rebalanced 6-player variant (community house-rule). Default false.
  rebalanced6p: boolean;
}

export const secretHitlerModule: GameModule<ShPrivateState, ShPublicState, ShAction> = {
  id: 'secret-hitler',
  displayName: 'Secret Hitler',
  minPlayers: 5,
  maxPlayers: 10,

  createInitialState(config: GameConfig): ShPrivateState {
    return {
      phase: 'setup',
      seats: [],
      board: {
        liberalEnacted: 0,
        fascistEnacted: 0,
        electionTracker: 0,
        vetoUnlocked: false,
      },
      policyDeck: [],
      policyDiscard: [],
      presidentSeat: 0,
      chancellorCandidateSeat: null,
      lastElectedPresident: null,
      lastElectedChancellor: null,
      legislativeHand: [],
      pendingExec: null,
      seed: config.seed,
      winnerTeam: null,
      investigations: [],
    };
  },

  applyAction(state: ShPrivateState, _action: ShAction): ShPrivateState {
    return state;
  },

  viewFor(state: ShPrivateState, seat: SeatIndex | null): ShPublicState {
    const ownSeat = seat === null ? null : state.seats[seat];
    return {
      phase: state.phase,
      seats: state.seats.map((s) => ({
        index: s.index,
        name: `Seat ${s.index}`,
        alive: s.alive,
        voteCast: state.phase === 'electionVote' ? null : s.voteCast,
        revealedRole: null,
      })),
      board: state.board,
      presidentSeat: state.presidentSeat,
      chancellorCandidateSeat: state.chancellorCandidateSeat,
      lastElectedPresident: state.lastElectedPresident,
      lastElectedChancellor: state.lastElectedChancellor,
      pendingExec: state.pendingExec,
      policyDeckSize: state.policyDeck.length,
      policyDiscardSize: state.policyDiscard.length,
      winnerTeam: state.winnerTeam,
      yourRole: ownSeat?.role ?? null,
      yourPartyKnowledge: [],
      yourLegislativeHand: null,
      yourInvestigations: seat === null
        ? []
        : state.investigations
            .filter((inv) => inv.by === seat)
            .map((inv) => ({ target: inv.target, party: inv.party })),
      yourPeek: null,
    };
  },

  isFinished(state: ShPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  defaultConfig(_playerCount: number): GameConfig {
    const options: ShOptions = { rebalanced6p: false };
    return {
      gameId: 'secret-hitler',
      seats: [],
      seed: 0,
      gameOptions: options as unknown as Record<string, unknown>,
    };
  },
};
