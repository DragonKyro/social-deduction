import { create } from 'zustand';
import type { GameId, GameModule, PublicEnvelope, SeatIndex, StateTick } from '@/engine/types';

// ============================================================================
// Game store
// ============================================================================
//
// On the host (and in solo / hot-seat), the store also holds the PRIVATE state.
// On peers, only the `publicView` is populated — that's the only thing they
// ever see.
//
// `dispatch(action)` is the local API for user actions. In solo / hot-seat
// mode it applies to private state directly and re-renders the public view
// for the current `localSeat` (which can change mid-game for hot-seat).
// In guest mode it forwards the action to the host via the network store
// and waits for the host to send back an updated view.

// We hold the private state as `unknown` here — the engine layer doesn't
// know specific game shapes, and the UI consumes through the typed
// `publicView` per game module.
type AnyPrivateState = unknown;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPublicView = PublicEnvelope<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModule = GameModule<any, any, any>;

interface GameStore {
  gameId: GameId | null;
  // The module driving the current game (used by the local-host loop to
  // apply actions and recompute views). Null when no game is loaded.
  module: AnyModule | null;
  // Host-only. Null on guests/spectators.
  privateState: AnyPrivateState | null;
  // Monotonically-incremented when the host applies an action. Peers use
  // this to ignore stale snapshots.
  tick: StateTick;
  // The local seat's redacted view. Drives the entire UI.
  publicView: AnyPublicView | null;
  // Which seat the local peer occupies (null = spectator / not yet seated).
  // In hot-seat solo mode this changes whenever the "currently acting" seat
  // changes — `setLocalSeat` and the auto-rotate helpers below mutate it.
  localSeat: SeatIndex | null;
  // True if this client owns the host loop (solo, hot-seat host, or online host).
  isHost: boolean;

  // Local broadcast hook — wired by networkStore to send actions over the
  // wire. Lets gameStore stay decoupled from net imports.
  broadcastHandler: ((action: AnyAction) => void) | null;
  registerBroadcastHandler: (cb: ((action: AnyAction) => void) | null) => void;

  // Apply a public view (received from the host, or from local host loop).
  setPublicView: (env: AnyPublicView, localSeat: SeatIndex | null) => void;
  // Host-only: replace the private state and recompute local view.
  setPrivateState: (state: AnyPrivateState, tick: StateTick) => void;
  // Bind a fresh local-host game. Used by solo/hot-seat startup.
  startLocalGame: (
    module: AnyModule,
    initialState: AnyPrivateState,
    localSeat: SeatIndex | null,
  ) => void;
  // Hot-seat helper: change the seat currently viewing the screen.
  setLocalSeat: (seat: SeatIndex | null) => void;

  // User-facing API.
  dispatch: (action: AnyAction) => void;

  // Exit the current game back to the home menu.
  exitGame: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameId: null,
  module: null,
  privateState: null,
  tick: 0,
  publicView: null,
  localSeat: null,
  isHost: false,
  broadcastHandler: null,

  registerBroadcastHandler: (cb) => set({ broadcastHandler: cb }),

  setPublicView: (env, localSeat) =>
    set({ gameId: env.gameId, publicView: env, localSeat, tick: env.tick }),

  setPrivateState: (state, tick) => set({ privateState: state, tick }),

  startLocalGame: (module, initialState, localSeat) => {
    const view = module.viewFor(initialState, localSeat);
    set({
      gameId: module.id,
      module,
      privateState: initialState,
      tick: 0,
      publicView: { gameId: module.id, tick: 0, view, seat: localSeat },
      localSeat,
      isHost: true,
    });
  },

  setLocalSeat: (seat) => {
    const { module, privateState, tick } = get();
    if (!module || privateState === null) {
      set({ localSeat: seat });
      return;
    }
    const view = module.viewFor(privateState, seat);
    set({
      localSeat: seat,
      publicView: { gameId: module.id, tick, view, seat },
    });
  },

  dispatch: (action) => {
    const { module, privateState, tick, localSeat, isHost, broadcastHandler } = get();
    // Online guest mode — forward over the wire.
    if (!isHost && broadcastHandler) {
      broadcastHandler(action);
      return;
    }
    // Local host loop (solo / hot-seat / online host).
    if (!module || privateState === null) return;
    const next = module.applyAction(privateState, action, /* byUuid */ '');
    const newTick = tick + 1;
    const view = module.viewFor(next, localSeat);
    set({
      privateState: next,
      tick: newTick,
      publicView: { gameId: module.id, tick: newTick, view, seat: localSeat },
    });
  },

  exitGame: () =>
    set({
      gameId: null,
      module: null,
      privateState: null,
      tick: 0,
      publicView: null,
      localSeat: null,
      isHost: false,
    }),
}));
