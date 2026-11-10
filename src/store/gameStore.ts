import { create } from 'zustand';
import type { GameId, GameModule, PublicEnvelope, SeatIndex, StateTick } from '@/engine/types';

// ============================================================================
// Game store
// ============================================================================
//
// On the host (and in solo / hot-seat), the store also holds the PRIVATE state.
// On guests, only the `publicView` is populated — that's the only thing they
// ever see.
//
// `dispatch(action)` is the local API for user actions:
//   - solo / hot-seat / online host: applied to the private state here
//     (`hostApply`), the local view is re-redacted, any registered
//     `hostAppliedListener` (the online host's view fan-out) is notified, and
//     AI seats are stepped.
//   - online guest: forwarded to the host via `broadcastHandler`; the host
//     sends back a new redacted view.
//
// Seat switching is the hidden-info chokepoint on THIS device: `localSeat`
// decides whose redacted view the UI renders. `controllableSeats` is the set
// of seats this device may view or act as. Online it is only your own seat,
// so a host can't click a friend's seat panel and read their hand. In solo
// hot-seat it's every human seat (pass-and-play) and never an AI seat.

// The private state is `unknown` here — the engine layer doesn't know
// specific game shapes, and the UI consumes through the typed `publicView`.
type AnyPrivateState = unknown;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPublicView = PublicEnvelope<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModule = GameModule<any, any, any>;

/** Delay before an AI seat acts, so humans can follow what happened. */
export const AI_STEP_DELAY_MS = 650;

export interface StartLocalGameOptions {
  /** Seats driven by the host's AI. Never viewable / controllable locally. */
  aiSeats?: SeatIndex[];
  /**
   * Seats this device may view and act as. Omit (or null) in solo hot-seat
   * to allow every non-AI seat; online, pass just the local player's seat.
   */
  controllableSeats?: SeatIndex[] | null;
  /** Resume at this tick (host reload). Default 0. */
  tick?: StateTick;
}

interface GameStore {
  gameId: GameId | null;
  // The module driving the current game. Null when no game is loaded.
  module: AnyModule | null;
  // Host-only. Null on guests/spectators.
  privateState: AnyPrivateState | null;
  // Monotonically-incremented when the host applies an action. Guests use
  // this to ignore stale views.
  tick: StateTick;
  // The local seat's redacted view. Drives the entire UI.
  publicView: AnyPublicView | null;
  // Which seat the local device is rendering (null = spectator).
  localSeat: SeatIndex | null;
  // True if this client owns the host loop (solo, hot-seat, or online host).
  isHost: boolean;
  // Seats driven by AI on this host. Empty on guests.
  aiSeats: SeatIndex[];
  // Seats this device may switch to / act as. null = any non-AI seat (solo
  // hot-seat). Online: `[mySeat]` (or `[]` for a spectator).
  controllableSeats: SeatIndex[] | null;

  // Online guest: forwards dispatched actions to the host. Registered by
  // networkStore so gameStore stays decoupled from net imports.
  broadcastHandler: ((action: AnyAction) => void) | null;
  registerBroadcastHandler: (cb: ((action: AnyAction) => void) | null) => void;
  // Online host: called after every applied action (human or AI) so the
  // network layer can fan out per-seat redacted views.
  hostAppliedListener: ((state: AnyPrivateState, tick: StateTick) => void) | null;
  registerHostAppliedListener: (
    cb: ((state: AnyPrivateState, tick: StateTick) => void) | null,
  ) => void;
  // Online: what "Exit" means is decided by the network layer (host ends the
  // match for everyone, guest leaves the room). null = local exit to menu.
  exitHandler: (() => void) | null;
  registerExitHandler: (cb: (() => void) | null) => void;

  // Guest: apply a view received from the host.
  setPublicView: (env: AnyPublicView) => void;
  // Bind a fresh local-host game (solo / hot-seat / online host).
  startLocalGame: (
    module: AnyModule,
    initialState: AnyPrivateState,
    localSeat: SeatIndex | null,
    opts?: StartLocalGameOptions,
  ) => void;
  // Hot-seat helper: change the seat currently viewing the screen. No-op for
  // seats this device isn't allowed to view.
  setLocalSeat: (seat: SeatIndex | null) => void;

  // User-facing API.
  dispatch: (action: AnyAction) => void;
  // Host-only: apply an action as `byUuid`. Returns false when the module
  // rejects it. Used by dispatch, the AI loop, and the online host's inbox.
  hostApply: (action: AnyAction, byUuid: string) => boolean;

  // Exit the current game (routes through `exitHandler` when online).
  exitGame: () => void;
  // Unconditionally drop the local game (used by the network layer).
  clearGame: () => void;
}

/** True when this device may render / act as `seat`. */
export function canControlSeat(
  st: Pick<GameStore, 'controllableSeats' | 'aiSeats' | 'isHost' | 'broadcastHandler'>,
  seat: SeatIndex | null,
): boolean {
  if (seat === null) return true;
  if (st.aiSeats.includes(seat)) return false;
  if (st.controllableSeats === null) return st.isHost && !st.broadcastHandler;
  return st.controllableSeats.includes(seat);
}

function actionSeat(action: AnyAction): SeatIndex | null {
  const s = (action as { bySeat?: unknown } | null)?.bySeat;
  return typeof s === 'number' ? s : null;
}

let aiTimer: ReturnType<typeof setTimeout> | null = null;
let aiCursor = 0;

function cancelAI() {
  if (aiTimer) clearTimeout(aiTimer);
  aiTimer = null;
}

export const useGameStore = create<GameStore>((set, get) => {
  function scheduleAI() {
    if (aiTimer) return;
    const { aiSeats, isHost, module } = get();
    if (!isHost || aiSeats.length === 0 || !module?.aiChooseAction) return;
    aiTimer = setTimeout(() => {
      aiTimer = null;
      stepAI();
    }, AI_STEP_DELAY_MS);
  }

  // Ask each AI seat (round-robin from a rotating cursor, so simultaneous
  // decisions like votes don't always favour the lowest seat) for a move and
  // apply the first legal one. `hostApply` reschedules on success. If every
  // AI either passes or proposes an illegal move, the loop stops until the
  // next human action.
  function stepAI() {
    const { module, privateState, aiSeats, isHost } = get();
    if (!isHost || !module?.aiChooseAction || privateState === null) return;
    if (module.isFinished(privateState)) return;
    const n = aiSeats.length;
    const refused: SeatIndex[] = [];
    for (let k = 0; k < n; k++) {
      const seat = aiSeats[(aiCursor + k) % n]!;
      let action: AnyAction | null = null;
      try {
        action = module.aiChooseAction(privateState, seat);
      } catch (e) {
        console.warn(`[ai] seat ${seat} threw:`, (e as Error).message);
        continue;
      }
      if (!action) continue;
      const bySeat = actionSeat(action);
      if (bySeat !== null && bySeat !== seat) {
        console.warn(`[ai] seat ${seat} proposed an action for seat ${bySeat}; dropped`);
        continue;
      }
      if (get().hostApply(action, `ai:${seat}`)) {
        aiCursor = (aiCursor + k + 1) % n;
        return;
      }
      refused.push(seat);
    }
    if (refused.length > 0) {
      // Every AI that wanted to move proposed something illegal. If no human
      // can act either, the game is stuck — make that loud.
      console.error(
        `[ai] stalled: seat(s) ${refused.join(', ')} proposed only illegal moves; waiting for a human action.`,
      );
    }
  }

  return {
    gameId: null,
    module: null,
    privateState: null,
    tick: 0,
    publicView: null,
    localSeat: null,
    isHost: false,
    aiSeats: [],
    controllableSeats: null,
    broadcastHandler: null,
    hostAppliedListener: null,
    exitHandler: null,

    registerBroadcastHandler: (cb) => set({ broadcastHandler: cb }),
    registerHostAppliedListener: (cb) => set({ hostAppliedListener: cb }),
    registerExitHandler: (cb) => set({ exitHandler: cb }),

    setPublicView: (env) => {
      const { tick, publicView } = get();
      // Stale (an older write arriving late). A lower tick for a different
      // game id means the host started a new match, so accept it.
      if (publicView && publicView.gameId === env.gameId && env.tick < tick) return;
      set({ gameId: env.gameId, publicView: env, localSeat: env.seat, tick: env.tick });
    },

    startLocalGame: (module, initialState, localSeat, opts) => {
      cancelAI();
      aiCursor = 0;
      const aiSeats = opts?.aiSeats ?? [];
      const tick = opts?.tick ?? 0;
      const view = module.viewFor(initialState, localSeat);
      set({
        gameId: module.id,
        module,
        privateState: initialState,
        tick,
        publicView: { gameId: module.id, tick, view, seat: localSeat },
        localSeat,
        isHost: true,
        aiSeats,
        controllableSeats: opts?.controllableSeats ?? null,
      });
      get().hostAppliedListener?.(initialState, tick);
      scheduleAI();
    },

    setLocalSeat: (seat) => {
      const st = get();
      if (!canControlSeat(st, seat)) return;
      const { module, privateState, tick } = st;
      if (!module || privateState === null) return;
      const view = module.viewFor(privateState, seat);
      set({
        localSeat: seat,
        publicView: { gameId: module.id, tick, view, seat },
      });
    },

    dispatch: (action) => {
      const st = get();
      // Online guest — forward over the wire.
      if (!st.isHost && st.broadcastHandler) {
        st.broadcastHandler(action);
        return;
      }
      if (!st.isHost) return;
      // Local host: a human may only act as a seat this device controls.
      const bySeat = actionSeat(action);
      if (bySeat !== null && !canControlSeat(st, bySeat)) {
        console.warn(`[host] local action for seat ${bySeat} refused`);
        return;
      }
      if (!st.hostApply(action, '')) return;
    },

    hostApply: (action, byUuid) => {
      const { module, privateState, tick, localSeat, hostAppliedListener } = get();
      if (!module || privateState === null) return false;
      let next: AnyPrivateState;
      try {
        next = module.applyAction(privateState, action, byUuid);
      } catch (e) {
        console.warn('[host] applyAction rejected:', (e as Error).message);
        return false;
      }
      const newTick = tick + 1;
      set({
        privateState: next,
        tick: newTick,
        publicView: {
          gameId: module.id,
          tick: newTick,
          view: module.viewFor(next, localSeat),
          seat: localSeat,
        },
      });
      hostAppliedListener?.(next, newTick);
      scheduleAI();
      return true;
    },

    exitGame: () => {
      const handler = get().exitHandler;
      if (handler) {
        handler();
        return;
      }
      get().clearGame();
    },

    clearGame: () => {
      cancelAI();
      set({
        gameId: null,
        module: null,
        privateState: null,
        tick: 0,
        publicView: null,
        localSeat: null,
        isHost: false,
        aiSeats: [],
        controllableSeats: null,
      });
    },
  };
});

/**
 * Hook for per-game UIs: whether the seat switcher (hot-seat pass-and-play)
 * should be shown, and which seats it may offer. Online this is always
 * disabled — you only ever see your own seat.
 */
export function useSeatSwitching(): {
  enabled: boolean;
  canView: (seat: SeatIndex) => boolean;
  setLocalSeat: (seat: SeatIndex | null) => void;
} {
  const controllableSeats = useGameStore((s) => s.controllableSeats);
  const aiSeats = useGameStore((s) => s.aiSeats);
  const isHost = useGameStore((s) => s.isHost);
  const broadcastHandler = useGameStore((s) => s.broadcastHandler);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const st = { controllableSeats, aiSeats, isHost, broadcastHandler };
  const enabled =
    controllableSeats === null ? isHost && !broadcastHandler : controllableSeats.length > 1;
  return { enabled, canView: (seat) => canControlSeat(st, seat), setLocalSeat };
}
