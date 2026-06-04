import { create } from 'zustand';
import type { GameId, PublicEnvelope, SeatIndex, StateTick } from '@/engine/types';

// ============================================================================
// Game store
// ============================================================================
//
// On the host, the store also holds the PRIVATE state. On peers, only the
// `publicView` is populated — that's the only thing they ever see.
//
// `dispatch(action)` is the local API for user actions. In solo / host
// mode it applies to private state and updates publicView. In guest mode
// it forwards the action to the host via the network store and waits for
// the host to send back an updated view.

// We hold the private state as `unknown` here — the engine layer doesn't
// know specific game shapes, and the UI consumes through the typed
// `publicView` per game module.
type AnyPrivateState = unknown;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPublicView = PublicEnvelope<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = any;

interface GameStore {
  gameId: GameId | null;
  // Host-only. Null on guests/spectators.
  privateState: AnyPrivateState | null;
  // The local seat's redacted view. Drives the entire UI.
  publicView: AnyPublicView | null;
  // Which seat the local peer occupies (null = spectator / not yet seated).
  localSeat: SeatIndex | null;

  // Local broadcast hook — wired by networkStore to send actions over the
  // wire. Lets gameStore stay decoupled from net imports.
  broadcastHandler: ((action: AnyAction) => void) | null;
  registerBroadcastHandler: (cb: ((action: AnyAction) => void) | null) => void;

  // Apply a public view (received from the host, or from local host loop).
  setPublicView: (env: AnyPublicView, localSeat: SeatIndex | null) => void;
  // Host-only: replace the private state and recompute local view.
  setPrivateState: (state: AnyPrivateState, tick: StateTick) => void;

  // User-facing API.
  dispatch: (action: AnyAction) => void;

  // Exit the current game back to the home menu.
  exitGame: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameId: null,
  privateState: null,
  publicView: null,
  localSeat: null,
  broadcastHandler: null,

  registerBroadcastHandler: (cb) => set({ broadcastHandler: cb }),

  setPublicView: (env, localSeat) =>
    set({ gameId: env.gameId, publicView: env, localSeat }),

  setPrivateState: (state, _tick) => set({ privateState: state }),

  dispatch: (action) => {
    const handler = get().broadcastHandler;
    if (handler) handler(action);
    // If no handler, we're in solo mode — solo game runner will pick up
    // the action via a different code path (not yet implemented).
  },

  exitGame: () =>
    set({
      gameId: null,
      privateState: null,
      publicView: null,
      localSeat: null,
    }),
}));
