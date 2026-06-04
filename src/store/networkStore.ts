import { create } from 'zustand';
import { getGame } from '@/engine/registry';
import type {
  ActionEnvelope,
  GameId,
  PublicEnvelope,
  Seat,
  SeatIndex,
} from '@/engine/types';
import {
  bindRoom,
  getDisplayName,
  getOrCreateUuid,
  setDisplayName as persistDisplayName,
  type RoomBindings,
  type ChatMessage,
  type ConnectionState,
  type LobbyState,
  type LocalRole,
} from '@/net';
import { useGameStore } from './gameStore';

// ============================================================================
// networkStore
// ============================================================================
//
// Host-authoritative multiplayer. The host owns the LobbyState (seats + game
// options) and rebroadcasts it on every change. Guests send SeatRequest
// messages to claim/leave a seat; the host integrates them.
//
// In-game traffic uses two channels:
//   - `action` (peer → host): the host validates against its lobby's
//     seat→uuid mapping, applies via the module, and re-broadcasts redacted
//     views.
//   - `view` (host → peer, individually addressed): one envelope per peer,
//     never a broadcast. This is the chokepoint that keeps hidden info
//     hidden.
//
// AI seats are driven on the host only — the host's tick loop polls each
// AI seat for an action after applying a player action.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = any;

interface NetworkStore {
  connection: ConnectionState;
  role: LocalRole;
  uuid: string | null;
  displayName: string;
  hostUuid: string | null;
  lobby: LobbyState | null;
  chat: ChatMessage[];
  // peerUuid → online flag. Multiple Trystero peerIds can map to the same
  // UUID (testing in multiple tabs); the value is the count of peerIds
  // currently mapped to it. Marked online if > 0.
  onlinePeers: Record<string, number>;
  // Room code currently joined (host or guest). null if disconnected/solo.
  roomCode: string | null;

  // Online host or join.
  hostRoom: (
    roomCode: string,
    gameId: GameId,
    initial?: {
      seatCount: number;
      names: string[];
      options: Record<string, unknown>;
      seed?: number;
    },
  ) => void;
  joinRoom: (roomCode: string) => void;
  leaveRoom: () => void;

  // Host-only lobby mutators.
  setLobbyGameId: (gameId: GameId) => void;
  setLobbySeats: (seats: Seat[]) => void;
  setLobbyOptions: (options: Record<string, unknown>) => void;
  startGame: () => void;

  // Guest-only.
  requestSeat: (desiredSeat: number | 'leave') => void;
  setLocalName: (name: string) => void;

  // Chat.
  sendChat: (text: string) => void;
  pushChat: (msg: ChatMessage) => void;

  reset: () => void;
}

// Module-scoped room handle so we don't keep it inside the store (it's not
// serializable + Zustand renders shouldn't see it). Same pattern as Catan.
let activeRoom: RoomBindings | null = null;
// peerId → uuid mapping the host (or guest) has learned from `hello`.
let peerIdToUuid: Map<string, string> = new Map();
// Host-only: the host's private knowledge of each seat's uuid lives in the
// lobby itself (`Seat.uuid`). We don't duplicate it here.

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function teardown() {
  if (activeRoom) {
    try {
      activeRoom.leave();
    } catch {
      // ignore
    }
    activeRoom = null;
  }
  peerIdToUuid = new Map();
}

// ----------------------------------------------------------------------------
// Host helpers
// ----------------------------------------------------------------------------

// Build the game-specific seat list from the lobby's authoritative seats.
function emptyLobbyForGame(gameId: GameId): LobbyState {
  const mod = getGame(gameId);
  // Start with the game's recommended player count as the seat count, but
  // bounded by the game's range. Host can adjust by claiming/releasing.
  const initialPlayerCount = Math.min(mod.maxPlayers, Math.max(mod.minPlayers, 5));
  const defaults = mod.defaultConfig(initialPlayerCount);
  const seats: Seat[] = Array.from({ length: initialPlayerCount }, (_, i) => ({
    index: i,
    uuid: null,
    name: `Seat ${i + 1}`,
    isAI: false,
  }));
  return {
    gameId,
    seats,
    gameOptions: defaults.gameOptions,
    seed: defaults.seed,
  };
}

// Translate the lobby's `Seat[]` + the game-specific options into the
// game-specific options shape with `players: [{name, isAI}]`. Most modules
// embed a `players` field; we overwrite it from the lobby. If a module
// doesn't use `players`, the extra key is harmless.
function injectPlayersIntoOptions(lobby: LobbyState): Record<string, unknown> {
  const players = lobby.seats.map((s) => ({ name: s.name, isAI: s.isAI }));
  return { ...lobby.gameOptions, players };
}

function hostBroadcastLobby() {
  const lobby = useNetworkStore.getState().lobby;
  if (!lobby || !activeRoom) return;
  activeRoom.sendLobby(lobby);
}

function hostBroadcastChat(msg: ChatMessage) {
  if (!activeRoom) return;
  activeRoom.sendChat(msg);
}

function hostApplyActionAndBroadcast(
  envelope: ActionEnvelope<unknown>,
  fromPeerId: string | null,
) {
  const { lobby } = useNetworkStore.getState();
  if (!lobby) return;
  const { module, privateState } = useGameStore.getState();
  if (!module || privateState === null) return;

  // Validate sender owns the seat they claim. byUuid must match seat.uuid.
  // (`fromPeerId === null` means the host applied it locally.)
  if (fromPeerId !== null) {
    const learnedUuid = peerIdToUuid.get(fromPeerId);
    if (!learnedUuid || learnedUuid !== envelope.byUuid) {
      // Spoofed envelope: drop silently.
      return;
    }
  }
  const claimedSeat = lobby.seats[envelope.bySeat];
  // AI seats are driven by the host; reject AI-seat actions from any peer.
  if (!claimedSeat || claimedSeat.uuid !== envelope.byUuid || claimedSeat.isAI) {
    return;
  }
  // Defense against action-payload spoofing: every game's action shape carries
  // a `bySeat` field that the per-game reducer trusts. A peer that owns seat 2
  // could otherwise submit an envelope with `envelope.bySeat=2` but
  // `action.bySeat=5` to act as another player. Enforce equality.
  const actionBySeat = (envelope.action as { bySeat?: SeatIndex } | null)?.bySeat;
  if (typeof actionBySeat === 'number' && actionBySeat !== envelope.bySeat) {
    return;
  }
  hostApplyAndBroadcastInternal(envelope);
}

// Apply (action OR AI action) and broadcast per-peer redacted views.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hostApplyAndBroadcastInternal(envelope: ActionEnvelope<any>) {
  const { lobby } = useNetworkStore.getState();
  if (!lobby) return;
  const { module, privateState, tick, localSeat } = useGameStore.getState();
  if (!module || privateState === null) return;

  let next;
  try {
    next = module.applyAction(privateState, envelope.action, envelope.byUuid);
  } catch (e) {
    // Illegal action — host ignores and does not rebroadcast.
    console.warn('[host] applyAction rejected:', (e as Error).message);
    return;
  }
  const newTick = tick + 1;
  // Update host's local state + own view.
  useGameStore.setState({
    privateState: next,
    tick: newTick,
    publicView: {
      gameId: module.id,
      tick: newTick,
      view: module.viewFor(next, localSeat),
      seat: localSeat,
    },
  });
  // Send a redacted view to every human peer that holds a seat. Spectators
  // also get one (seat=null) on their own snapshot request.
  if (!activeRoom) return;
  const seatByUuid: Map<string, Seat> = new Map();
  for (const s of lobby.seats) {
    if (s.uuid && !s.isAI) seatByUuid.set(s.uuid, s);
  }
  // For each connected peer, send the view redacted for THAT peer's seat.
  for (const [peerId, uuid] of peerIdToUuid) {
    const seat = seatByUuid.get(uuid);
    const seatIdx: SeatIndex | null = seat ? seat.index : null;
    const env: PublicEnvelope<unknown> = {
      gameId: module.id,
      tick: newTick,
      view: module.viewFor(next, seatIdx),
      seat: seatIdx,
    };
    activeRoom.sendView(env, peerId);
  }

  // After applying, schedule AI turns if any.
  hostMaybeStepAI();
}

let aiStepTimer: ReturnType<typeof setTimeout> | null = null;
function hostMaybeStepAI() {
  if (aiStepTimer) return;
  aiStepTimer = setTimeout(() => {
    aiStepTimer = null;
    const { lobby } = useNetworkStore.getState();
    const { module, privateState } = useGameStore.getState();
    if (!lobby || !module || privateState === null) return;
    if (!module.aiChooseAction) return;
    for (const seat of lobby.seats) {
      if (!seat.isAI) continue;
      const action = module.aiChooseAction(privateState, seat.index);
      if (!action) continue;
      hostApplyAndBroadcastInternal({
        action,
        byUuid: `ai:${seat.index}`,
        bySeat: seat.index,
      });
      return; // Only step one AI per tick; the post-apply call re-schedules.
    }
  }, 250);
}

// ----------------------------------------------------------------------------
// Store
// ----------------------------------------------------------------------------

export const useNetworkStore = create<NetworkStore>((set, get) => {
  // Defer wiring the broadcastHandler until the store is constructed (so we
  // can reference `get()`).
  return {
    connection: 'disconnected',
    role: 'solo',
    uuid: null,
    displayName: 'Player',
    hostUuid: null,
    lobby: null,
    chat: [],
    onlinePeers: {},
    roomCode: null,

    // ----- Host -----
    hostRoom: (roomCode, gameId, initial) => {
      teardown();
      // Always start from a fresh dispatch chain so we don't stack wrappers
      // across host→guest→host transitions.
      uninstallHostDispatchHook();
      const uuid = getOrCreateUuid();
      const displayName = getDisplayName();
      const room = bindRoom(roomCode);
      activeRoom = room;
      let lobby: LobbyState;
      if (initial) {
        const seats: Seat[] = Array.from({ length: initial.seatCount }, (_, i) => ({
          index: i,
          uuid: null,
          name: initial.names[i] ?? `Seat ${i + 1}`,
          isAI: false,
        }));
        lobby = {
          gameId,
          seats,
          gameOptions: initial.options,
          seed: initial.seed ?? Math.floor(Math.random() * 2 ** 31),
        };
      } else {
        lobby = emptyLobbyForGame(gameId);
      }
      // Host occupies seat 0 by default — overwrite its name with the host's
      // persistent display name.
      lobby.seats[0] = { ...lobby.seats[0]!, uuid, name: displayName };
      set({
        connection: 'lobby',
        role: 'host',
        uuid,
        displayName,
        hostUuid: uuid,
        lobby,
        chat: [],
        onlinePeers: { [uuid]: 1 },
        roomCode,
      });
      // Register the broadcastHandler so the host can apply its OWN actions
      // through the same path (via the local gameStore.dispatch's host path,
      // we don't actually need the handler — it goes the local route). But
      // we set it to null on the host explicitly so dispatch picks the host
      // path even when isHost is true.
      useGameStore.getState().registerBroadcastHandler(null);
      // Override gameStore.dispatch path: host dispatch should broadcast
      // views after applying. We do this by hooking applyAction at dispatch
      // time. Simpler: override `dispatch` via a wrapper installed below.
      installHostDispatchHook();
      wireHostHandlers(room);
    },

    // ----- Guest -----
    joinRoom: (roomCode) => {
      teardown();
      const uuid = getOrCreateUuid();
      const displayName = getDisplayName();
      const room = bindRoom(roomCode);
      activeRoom = room;
      set({
        connection: 'connecting',
        role: 'guest',
        uuid,
        displayName,
        hostUuid: null,
        lobby: null,
        chat: [],
        onlinePeers: { [uuid]: 1 },
        roomCode,
      });
      wireGuestHandlers(room);
      // Tell the gameStore to forward dispatched actions over the wire.
      useGameStore.getState().registerBroadcastHandler((action) => {
        const st = get();
        if (!activeRoom || st.lobby == null || st.uuid == null) return;
        const seat = st.lobby.seats.find((s) => s.uuid === st.uuid);
        if (!seat) return;
        activeRoom.sendAction({
          action,
          byUuid: st.uuid,
          bySeat: seat.index,
        });
      });
      uninstallHostDispatchHook();
    },

    leaveRoom: () => {
      teardown();
      uninstallHostDispatchHook();
      useGameStore.getState().registerBroadcastHandler(null);
      useGameStore.getState().exitGame();
      set({
        connection: 'disconnected',
        role: 'solo',
        hostUuid: null,
        lobby: null,
        chat: [],
        onlinePeers: {},
        roomCode: null,
      });
    },

    // ----- Host-only lobby mutators -----
    setLobbyGameId: (gameId) => {
      const { lobby, role } = get();
      if (role !== 'host') return;
      const fresh = emptyLobbyForGame(gameId);
      // Preserve host's seat (uuid + name) at index 0, if it fits.
      const hostSeat = lobby?.seats.find((s) => s.uuid === get().uuid);
      if (hostSeat && fresh.seats[0]) {
        fresh.seats[0] = { ...fresh.seats[0], uuid: hostSeat.uuid, name: hostSeat.name };
      }
      // Re-place any seated guests onto the new seat list (best effort).
      if (lobby) {
        let nextSeatIdx = 1;
        for (const s of lobby.seats) {
          if (!s.uuid || s.uuid === hostSeat?.uuid) continue;
          while (nextSeatIdx < fresh.seats.length && fresh.seats[nextSeatIdx]!.uuid) {
            nextSeatIdx++;
          }
          if (nextSeatIdx < fresh.seats.length) {
            fresh.seats[nextSeatIdx] = {
              ...fresh.seats[nextSeatIdx]!,
              uuid: s.uuid,
              name: s.name,
              isAI: s.isAI,
            };
            nextSeatIdx++;
          }
        }
      }
      set({ lobby: fresh });
      hostBroadcastLobby();
    },

    setLobbySeats: (seats) => {
      const { role, lobby } = get();
      if (role !== 'host' || !lobby) return;
      set({ lobby: { ...lobby, seats } });
      hostBroadcastLobby();
    },

    setLobbyOptions: (options) => {
      const { role, lobby } = get();
      if (role !== 'host' || !lobby) return;
      set({ lobby: { ...lobby, gameOptions: options } });
      hostBroadcastLobby();
    },

    startGame: () => {
      const { role, lobby, uuid } = get();
      if (role !== 'host' || !lobby || !uuid) return;
      const mod = getGame(lobby.gameId);
      // Build the game-specific config from the lobby.
      const options = injectPlayersIntoOptions(lobby);
      const config = {
        gameId: lobby.gameId,
        seats: lobby.seats,
        seed: lobby.seed,
        gameOptions: options,
      };
      let initialState;
      try {
        initialState = mod.createInitialState(config);
      } catch (e) {
        console.warn('[host] createInitialState failed:', (e as Error).message);
        return;
      }
      const hostSeat = lobby.seats.find((s) => s.uuid === uuid);
      const hostSeatIdx: SeatIndex | null = hostSeat ? hostSeat.index : null;
      // Set host's own state.
      useGameStore.getState().startLocalGame(mod, initialState, hostSeatIdx);
      set({ connection: 'in-game' });
      // Send a `start` envelope to each connected peer with their redacted view.
      if (!activeRoom) return;
      for (const [peerId, peerUuid] of peerIdToUuid) {
        const seat = lobby.seats.find((s) => s.uuid === peerUuid && !s.isAI);
        const seatIdx: SeatIndex | null = seat ? seat.index : null;
        const view: PublicEnvelope<unknown> = {
          gameId: mod.id,
          tick: 0,
          view: mod.viewFor(initialState, seatIdx),
          seat: seatIdx,
        };
        activeRoom.sendStart({ gameId: mod.id, tick: 0, view }, peerId);
      }
      hostMaybeStepAI();
    },

    // ----- Guest -----
    requestSeat: (desiredSeat) => {
      const st = get();
      if (!activeRoom || !st.uuid) return;
      activeRoom.sendSeatRequest({
        uuid: st.uuid,
        desiredSeat,
        displayName: st.displayName,
      });
    },

    setLocalName: (name) => {
      persistDisplayName(name);
      set({ displayName: name });
      const st = get();
      if (st.role === 'host' && st.lobby && st.uuid) {
        const seats = st.lobby.seats.map((s) =>
          s.uuid === st.uuid ? { ...s, name } : s,
        );
        set({ lobby: { ...st.lobby, seats } });
        hostBroadcastLobby();
      } else if (st.role === 'guest' && activeRoom && st.uuid) {
        // Have the host integrate it via a seatReq (re-state current seat
        // claim with new name; host will rebroadcast).
        const seat = st.lobby?.seats.find((s) => s.uuid === st.uuid);
        activeRoom.sendSeatRequest({
          uuid: st.uuid,
          desiredSeat: seat ? seat.index : 'leave',
          displayName: name,
        });
      }
    },

    // ----- Chat -----
    sendChat: (text) => {
      const st = get();
      if (!st.uuid) return;
      const msg: ChatMessage = {
        id: uid(),
        senderUuid: st.uuid,
        senderName: st.displayName,
        text,
        timestamp: Date.now(),
        kind: 'user',
      };
      // Show locally; also send. The host echoes everyone's messages so the
      // receive handler will dedupe by id.
      set((s) => ({ chat: [...s.chat, msg] }));
      if (activeRoom) activeRoom.sendChat(msg);
    },

    pushChat: (msg) =>
      set((s) =>
        s.chat.some((m) => m.id === msg.id) ? s : { chat: [...s.chat, msg] },
      ),

    reset: () => {
      teardown();
      uninstallHostDispatchHook();
      useGameStore.getState().registerBroadcastHandler(null);
      set({
        connection: 'disconnected',
        role: 'solo',
        uuid: null,
        hostUuid: null,
        lobby: null,
        chat: [],
        onlinePeers: {},
        roomCode: null,
      });
    },
  };
});

// ============================================================================
// Wire-handlers
// ============================================================================

function wireHostHandlers(room: RoomBindings) {
  room.recvHello((msg, peerId) => {
    peerIdToUuid.set(peerId, msg.uuid);
    useNetworkStore.setState((s) => {
      const next = { ...s.onlinePeers };
      next[msg.uuid] = (next[msg.uuid] ?? 0) + 1;
      return { onlinePeers: next };
    });
    // Reply with hello so the guest knows our uuid (and the host marker).
    const st = useNetworkStore.getState();
    if (st.uuid) {
      room.sendHello({ uuid: st.uuid, displayName: st.displayName }, peerId);
    }
    // Send current lobby immediately so the newcomer renders something.
    const lobby = st.lobby;
    if (lobby) room.sendLobby(lobby, peerId);
    // If a game is already in progress, snapshot the current view so the
    // peer can rejoin. Mirror the snapReq path.
    sendSnapshotTo(peerId, msg.uuid);
  });

  room.recvSeatRequest((msg /* , _peerId */) => {
    const st = useNetworkStore.getState();
    if (!st.lobby) return;
    const seats = st.lobby.seats.slice();
    // First, clear any seat the requester currently holds (so claim moves them).
    for (let i = 0; i < seats.length; i++) {
      if (seats[i]!.uuid === msg.uuid) {
        seats[i] = { ...seats[i]!, uuid: null, name: `Seat ${i + 1}`, isAI: false };
      }
    }
    if (msg.desiredSeat === 'leave') {
      useNetworkStore.setState({ lobby: { ...st.lobby, seats } });
      hostBroadcastLobby();
      return;
    }
    const idx = msg.desiredSeat;
    if (idx < 0 || idx >= seats.length) return;
    const target = seats[idx]!;
    // Refuse if seat is occupied by a different uuid or by an AI.
    if (target.uuid && target.uuid !== msg.uuid) return;
    if (target.isAI) return;
    seats[idx] = {
      ...target,
      uuid: msg.uuid,
      name: msg.displayName?.trim() || target.name,
      isAI: false,
    };
    useNetworkStore.setState({ lobby: { ...st.lobby, seats } });
    hostBroadcastLobby();
  });

  room.recvAction((envelope, peerId) => {
    hostApplyActionAndBroadcast(envelope, peerId);
  });

  room.recvSnapshotRequest((_msg, peerId) => {
    const uuid = peerIdToUuid.get(peerId);
    if (!uuid) return;
    sendSnapshotTo(peerId, uuid);
  });

  room.recvChat((msg, _peerId) => {
    // Host appends + re-broadcasts (so all peers see same ordering). Dedupe
    // by id in case the host receives its own message back.
    useNetworkStore.setState((s) =>
      s.chat.some((m) => m.id === msg.id) ? s : { chat: [...s.chat, msg] },
    );
    hostBroadcastChat(msg);
  });

  room.onPeerJoin((peerId) => {
    // Send our hello immediately so the guest learns the host uuid.
    const st = useNetworkStore.getState();
    if (st.uuid) {
      room.sendHello({ uuid: st.uuid, displayName: st.displayName }, peerId);
    }
  });

  room.onPeerLeave((peerId) => {
    const uuid = peerIdToUuid.get(peerId);
    peerIdToUuid.delete(peerId);
    if (!uuid) return;
    useNetworkStore.setState((s) => {
      const next = { ...s.onlinePeers };
      next[uuid] = Math.max(0, (next[uuid] ?? 0) - 1);
      if (next[uuid] === 0) delete next[uuid];
      return { onlinePeers: next };
    });
  });
}

function sendSnapshotTo(peerId: string, uuid: string) {
  if (!activeRoom) return;
  const st = useNetworkStore.getState();
  if (!st.lobby) return;
  const { module, privateState, tick } = useGameStore.getState();
  if (!module || privateState === null) {
    // Game hasn't started; lobby already sent on hello — nothing more.
    return;
  }
  const seat = st.lobby.seats.find((s) => s.uuid === uuid && !s.isAI);
  const seatIdx: SeatIndex | null = seat ? seat.index : null;
  const view: PublicEnvelope<unknown> = {
    gameId: module.id,
    tick,
    view: module.viewFor(privateState, seatIdx),
    seat: seatIdx,
  };
  activeRoom.sendSnapshot(
    {
      view,
      chat: st.chat,
      hostUuid: st.uuid ?? '',
      seatUuids: st.lobby.seats.map((s) => s.uuid),
    },
    peerId,
  );
}

function wireGuestHandlers(room: RoomBindings) {
  // Send our hello immediately when we see any peer (the host should be in
  // the room when we connect, but Trystero fires onPeerJoin asynchronously).
  room.onPeerJoin((peerId) => {
    const st = useNetworkStore.getState();
    if (st.uuid) room.sendHello({ uuid: st.uuid, displayName: st.displayName }, peerId);
  });

  room.recvHello((msg, peerId) => {
    peerIdToUuid.set(peerId, msg.uuid);
    useNetworkStore.setState((s) => {
      const next = { ...s.onlinePeers };
      next[msg.uuid] = (next[msg.uuid] ?? 0) + 1;
      return { onlinePeers: next };
    });
  });

  room.recvLobby((state, peerId) => {
    // Whoever broadcasts the lobby IS the host. If their hello arrived
    // first, peerIdToUuid maps; otherwise we'll fall back to setting it on
    // the next hello (recvHello rebroadcasts onlinePeers but not hostUuid).
    const peerUuid = peerIdToUuid.get(peerId) ?? null;
    useNetworkStore.setState((s) => ({
      lobby: state,
      hostUuid: peerUuid ?? s.hostUuid,
      connection: 'lobby',
    }));
  });

  room.recvStart((msg, peerId) => {
    const hostUuid = peerIdToUuid.get(peerId) ?? null;
    const mod = getGame(msg.gameId);
    // Apply the redacted public view to the local game store. Guest has no
    // private state.
    useGameStore.setState({
      gameId: msg.view.gameId,
      module: mod,
      privateState: null,
      tick: msg.view.tick,
      publicView: msg.view,
      localSeat: msg.view.seat,
      isHost: false,
    });
    useNetworkStore.setState({ connection: 'in-game', hostUuid });
  });

  room.recvView((envelope, _peerId) => {
    const { tick } = useGameStore.getState();
    if (envelope.tick < tick) return; // stale
    useGameStore.setState({
      gameId: envelope.gameId,
      publicView: envelope,
      tick: envelope.tick,
      localSeat: envelope.seat,
    });
  });

  room.recvSnapshot((msg, peerId) => {
    const hostUuid = peerIdToUuid.get(peerId) ?? msg.hostUuid;
    const mod = getGame(msg.view.gameId);
    useGameStore.setState({
      gameId: msg.view.gameId,
      module: mod,
      privateState: null,
      tick: msg.view.tick,
      publicView: msg.view,
      localSeat: msg.view.seat,
      isHost: false,
    });
    useNetworkStore.setState({
      connection: 'in-game',
      hostUuid,
      chat: msg.chat,
    });
  });

  room.recvChat((msg, _peerId) => {
    useNetworkStore.setState((s) =>
      s.chat.some((m) => m.id === msg.id) ? s : { chat: [...s.chat, msg] },
    );
  });

  room.onPeerLeave((peerId) => {
    const uuid = peerIdToUuid.get(peerId);
    peerIdToUuid.delete(peerId);
    if (!uuid) return;
    useNetworkStore.setState((s) => {
      const next = { ...s.onlinePeers };
      next[uuid] = Math.max(0, (next[uuid] ?? 0) - 1);
      if (next[uuid] === 0) delete next[uuid];
      return { onlinePeers: next };
    });
  });
}

// ============================================================================
// Host dispatch hook
// ============================================================================
//
// gameStore.dispatch's host path applies actions to private state directly.
// For multiplayer host, we ALSO need to broadcast a per-peer redacted view
// after every applied action. We achieve that by wrapping the existing
// `dispatch` action when the host enters online mode. This avoids gameStore
// importing from net/.

type Dispatch = (action: AnyAction) => void;
let originalDispatch: Dispatch | null = null;

function installHostDispatchHook() {
  if (originalDispatch) return;
  const store = useGameStore;
  const cur = store.getState().dispatch;
  originalDispatch = cur;
  store.setState({
    dispatch: (action: AnyAction) => {
      const st = useNetworkStore.getState();
      const { isHost, localSeat } = useGameStore.getState();
      const hostUuid = st.uuid;
      if (!isHost || st.role !== 'host' || !hostUuid || localSeat === null) {
        // Fall back to the original (works for hot-seat solo too).
        cur(action);
        return;
      }
      hostApplyAndBroadcastInternal({
        action,
        byUuid: hostUuid,
        bySeat: localSeat,
      });
    },
  });
}

function uninstallHostDispatchHook() {
  if (!originalDispatch) return;
  useGameStore.setState({ dispatch: originalDispatch });
  originalDispatch = null;
}
