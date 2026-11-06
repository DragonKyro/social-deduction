import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameModule, SeatIndex } from '@/engine/types';
import { FakeServer, fakeTransport } from '@/net/fakeTransport';
import type { GuestEvents } from '@/net/transport';
import type { ChatMessage, LobbyState, ViewRecord } from '@/net/types';

// End-to-end host plumbing over the in-memory transport: a real networkStore
// + gameStore on the host, and raw transport "devices" for guests (so we see
// exactly what reaches each device).

const { secretModule } = vi.hoisted(() => {
  interface P {
    secrets: number[];
    seed: number;
    pokes: number[];
    turn: number;
  }
  type A = { type: 'poke'; bySeat: SeatIndex } | { type: 'advance' } | { type: 'noop' };
  const mod: GameModule<P, unknown, A> = {
    id: 'skull',
    displayName: 'Secrets',
    minPlayers: 2,
    maxPlayers: 6,
    createInitialState: (c) => ({
      secrets: c.seats.map((_, i) => (c.seed % 97) * 100 + 7000 + i),
      seed: c.seed,
      pokes: c.seats.map(() => 0),
      turn: 0,
    }),
    applyAction: (s, a) => {
      if (a.type === 'advance') return { ...s, turn: (s.turn + 1) % s.secrets.length };
      if (a.type === 'noop') return { ...s };
      if (a.bySeat !== s.turn) throw new Error('not your turn');
      const pokes = s.pokes.slice();
      pokes[a.bySeat]! += 1;
      return { ...s, pokes, turn: (s.turn + 1) % s.secrets.length };
    },
    viewFor: (s, seat) => ({
      yourSecret: seat === null ? null : s.secrets[seat],
      pokes: s.pokes,
      turn: s.turn,
    }),
    isFinished: () => false,
    defaultConfig: () => ({ gameId: 'skull', seats: [], seed: 0, gameOptions: {} }),
    aiChooseAction: (s, seat) => (s.turn === seat ? { type: 'poke', bySeat: seat } : null),
  };
  return { secretModule: mod };
});

vi.mock('@/engine/registry', () => ({
  GAMES: { skull: secretModule },
  getGame: () => secretModule,
}));

import { useNetworkStore, setTransportForTests } from './networkStore';
import { useGameStore } from './gameStore';

interface Device {
  lobby: LobbyState | null;
  view: ViewRecord | null;
  views: ViewRecord[];
  chat: ChatMessage[];
  send: (msg: Parameters<Awaited<ReturnType<ReturnType<typeof fakeTransport>['joinAsGuest']>>['send']>[0]) => Promise<void>;
}

async function joinDevice(server: FakeServer, uid: string, code: string): Promise<Device> {
  const t = fakeTransport(server, uid);
  const meta = await t.lookupRoom(code);
  const dev: Device = { lobby: null, view: null, views: [], chat: [], send: async () => {} };
  const events: GuestEvents = {
    lobby: (l) => (dev.lobby = l),
    view: (v) => {
      dev.view = v;
      if (v) dev.views.push(v);
    },
    chat: (m) => dev.chat.push(m),
    presence: () => {},
    connected: () => {},
  };
  const conn = await t.joinAsGuest(code, meta!, { uid, name: uid }, events);
  dev.send = (m) => conn.send(m);
  return dev;
}

let server: FakeServer;

beforeEach(() => {
  server = new FakeServer();
  setTransportForTests(fakeTransport(server, 'HOST'));
  window.confirm = () => true;
});

afterEach(() => {
  useNetworkStore.getState().reset();
  setTransportForTests(null);
  vi.useRealTimers();
});

async function hostWithGuest() {
  await useNetworkStore.getState().hostRoom('skull', {
    seatCount: 3,
    names: ['A', 'B', 'C'],
    options: { flavour: 'x', seed: 12345 },
  });
  const code = useNetworkStore.getState().roomCode!;
  const guest = await joinDevice(server, 'GUEST', code);
  await guest.send({ kind: 'seat', desiredSeat: 1, displayName: 'Gus' });
  return { code, guest };
}

describe('networkStore over the fake transport', () => {
  it('creates a room with a generated code; guests can claim seats', async () => {
    const { code, guest } = await hostWithGuest();
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    const lobby = useNetworkStore.getState().lobby!;
    expect(lobby.seats[0]!.uuid).toBe('HOST');
    expect(lobby.seats[1]).toMatchObject({ uuid: 'GUEST', name: 'Gus' });
    expect(guest.lobby?.seats[1]!.uuid).toBe('GUEST');
  });

  it('never publishes the seed: not in lobby options, not in any view', async () => {
    const { code, guest } = await hostWithGuest();
    expect(JSON.stringify(guest.lobby)).not.toContain('12345');
    await guest.send({ kind: 'seat', desiredSeat: 1 });
    useNetworkStore.getState().setLobbySeats(
      useNetworkStore.getState().lobby!.seats.map((s, i) => (i === 2 ? { ...s, uuid: 'ai:2', isAI: true, name: 'Bot' } : s)),
    );
    useNetworkStore.getState().startGame();
    const seed = (useGameStore.getState().privateState as { seed: number }).seed;
    expect(seed).not.toBe(12345); // fresh per match, chosen by the host
    expect(JSON.stringify(guest.lobby)).not.toContain(`"seed"`);
    expect(server.rawView(code, 'GUEST')).not.toContain(String(seed));
  });

  it('each device receives only its own redacted view', async () => {
    const { code, guest } = await hostWithGuest();
    useNetworkStore.getState().setLobbySeats(
      useNetworkStore.getState().lobby!.seats.map((s, i) => (i === 2 ? { ...s, uuid: 'ai:2', isAI: true, name: 'Bot' } : s)),
    );
    useNetworkStore.getState().startGame();
    const secrets = (useGameStore.getState().privateState as { secrets: number[] }).secrets;
    expect(guest.view?.env.seat).toBe(1);
    expect((guest.view?.env.view as { yourSecret: number }).yourSecret).toBe(secrets[1]);
    const raw = server.rawView(code, 'GUEST')!;
    expect(raw).not.toContain(String(secrets[0]));
    expect(raw).not.toContain(String(secrets[2]));
    // The host renders its own seat locally; it isn't written a view.
    expect(server.rawView(code, 'HOST')).toBeUndefined();

    // A spectator joining mid-match gets the seat-null view, no secrets.
    const watcher = await joinDevice(server, 'WATCHER', code);
    expect(watcher.view?.env.seat).toBeNull();
    for (const s of secrets) expect(JSON.stringify(watcher.view)).not.toContain(String(s));
  });

  it('refuses impersonation and seatless actions from guests; applies legit ones', async () => {
    const { guest } = await hostWithGuest();
    useNetworkStore.getState().setLobbySeats(
      useNetworkStore.getState().lobby!.seats.map((s, i) => (i === 2 ? { ...s, uuid: 'ai:2', isAI: true, name: 'Bot' } : s)),
    );
    useNetworkStore.getState().startGame();
    const tick0 = useGameStore.getState().tick;
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await guest.send({ kind: 'action', action: { type: 'poke', bySeat: 0 } }); // as the host
    await guest.send({ kind: 'action', action: { type: 'poke', bySeat: 2 } }); // as the AI
    await guest.send({ kind: 'action', action: { type: 'advance' } }); // host-only control
    expect(useGameStore.getState().tick).toBe(tick0);

    // Host acts (seat 0's turn), then the guest acts on its own turn.
    useGameStore.getState().dispatch({ type: 'poke', bySeat: 0 });
    await guest.send({ kind: 'action', action: { type: 'poke', bySeat: 1 } });
    const st = useGameStore.getState().privateState as { pokes: number[] };
    expect(st.pokes).toEqual([1, 1, 0]);
    expect((guest.view?.env.view as { pokes: number[] }).pokes).toEqual([1, 1, 0]);
  });

  it('only re-sends a view when it changed, with a per-device sequence (no action-count side channel)', async () => {
    const { guest } = await hostWithGuest();
    useNetworkStore.getState().setLobbySeats(
      useNetworkStore.getState().lobby!.seats.map((s, i) => (i === 2 ? { ...s, uuid: 'ai:2', isAI: true, name: 'Bot' } : s)),
    );
    useNetworkStore.getState().startGame();
    const sent = guest.views.length;
    // Seatless host control that changes only the turn marker → guest view changes.
    useGameStore.getState().dispatch({ type: 'advance' });
    expect(guest.views.length).toBe(sent + 1);
    // Re-applying a no-op-for-the-guest change sends nothing.
    useGameStore.getState().hostApply({ type: 'noop' }, '');
    expect(guest.views.length).toBe(sent + 1);
    // Sequence numbers count this device's views only, not the host's actions.
    expect(guest.views.map((v) => v.env.tick)).toEqual(guest.views.map((_, i) => i));
    expect(useGameStore.getState().tick).toBe(2);
  });

  it('online host cannot switch to (or act as) another seat', async () => {
    await hostWithGuest();
    useNetworkStore.getState().setLobbySeats(
      useNetworkStore.getState().lobby!.seats.map((s, i) => (i === 2 ? { ...s, uuid: 'ai:2', isAI: true, name: 'Bot' } : s)),
    );
    useNetworkStore.getState().startGame();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useGameStore.getState().setLocalSeat(1);
    expect(useGameStore.getState().localSeat).toBe(0);
    expect((useGameStore.getState().publicView!.view as { yourSecret: number }).yourSecret).toBe(
      (useGameStore.getState().privateState as { secrets: number[] }).secrets[0],
    );
    const tick = useGameStore.getState().tick;
    useGameStore.getState().dispatch({ type: 'poke', bySeat: 1 });
    expect(useGameStore.getState().tick).toBe(tick);
  });

  it('runs AI seats on the host and publishes their moves', async () => {
    vi.useFakeTimers();
    const { guest } = await hostWithGuest();
    useNetworkStore.getState().setLobbySeats(
      useNetworkStore.getState().lobby!.seats.map((s, i) => (i === 2 ? { ...s, uuid: 'ai:2', isAI: true, name: 'Bot' } : s)),
    );
    useNetworkStore.getState().startGame();
    useGameStore.getState().dispatch({ type: 'poke', bySeat: 0 });
    await guest.send({ kind: 'action', action: { type: 'poke', bySeat: 1 } });
    await vi.advanceTimersByTimeAsync(1000);
    const st = useGameStore.getState().privateState as { pokes: number[]; turn: number };
    expect(st.pokes).toEqual([1, 1, 1]);
    expect((guest.view?.env.view as { pokes: number[] }).pokes).toEqual([1, 1, 1]);
  });

  it('ending the match clears every view; a new match starts fresh for guests', async () => {
    const { guest } = await hostWithGuest();
    useNetworkStore.getState().setLobbySeats(
      useNetworkStore.getState().lobby!.seats.map((s, i) => (i === 2 ? { ...s, uuid: 'ai:2', isAI: true, name: 'Bot' } : s)),
    );
    useNetworkStore.getState().startGame();
    expect(guest.view?.match).toBe(1);
    useNetworkStore.getState().endMatch();
    expect(guest.view).toBeNull();
    expect(guest.lobby?.inGame).toBe(false);
    useNetworkStore.getState().startGame();
    expect(guest.view?.match).toBe(2);
    expect(guest.view?.env.tick).toBe(0);
  });

  it('a reloaded host resumes the match from its saved state', async () => {
    const { code, guest } = await hostWithGuest();
    useNetworkStore.getState().setLobbySeats(
      useNetworkStore.getState().lobby!.seats.map((s, i) => (i === 2 ? { ...s, uuid: 'ai:2', isAI: true, name: 'Bot' } : s)),
    );
    useNetworkStore.getState().startGame();
    useGameStore.getState().dispatch({ type: 'poke', bySeat: 0 });
    const before = useGameStore.getState().privateState;
    const tick = useGameStore.getState().tick;

    // "Reload": this device forgets everything, then opens ?room=CODE again.
    useNetworkStore.setState({ role: 'solo' });
    useGameStore.getState().clearGame();
    await useNetworkStore.getState().joinRoom(code);

    expect(useNetworkStore.getState().role).toBe('host');
    expect(useGameStore.getState().privateState).toEqual(before);
    expect(useGameStore.getState().tick).toBe(tick);
    await guest.send({ kind: 'action', action: { type: 'poke', bySeat: 1 } });
    expect((useGameStore.getState().privateState as { pokes: number[] }).pokes).toEqual([1, 1, 0]);
  });

  it('guests see a clear error for unknown room codes', async () => {
    setTransportForTests(fakeTransport(server, 'LOST'));
    await useNetworkStore.getState().joinRoom('ZZZZZ');
    expect(useNetworkStore.getState().connection).toBe('disconnected');
    expect(useNetworkStore.getState().error).toMatch(/no room ZZZZZ/i);
    await useNetworkStore.getState().joinRoom('!!');
    expect(useNetworkStore.getState().error).toMatch(/4–6 letters/);
  });

  it('chat goes through the room for everyone', async () => {
    const { guest } = await hostWithGuest();
    useNetworkStore.getState().sendChat('hello table');
    expect(guest.chat.map((m) => m.text)).toEqual(['hello table']);
    expect(useNetworkStore.getState().chat.map((m) => m.senderUuid)).toEqual(['HOST']);
  });
});
