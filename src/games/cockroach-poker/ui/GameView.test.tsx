import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { cockroachPokerModule } from '../module';
import { CREATURES } from '../state';
import type { CockroachPokerPrivateState, Creature } from '../state';
import { CockroachPokerGameView } from './GameView';

function newGame(players: number, seed = 9): CockroachPokerPrivateState {
  return cockroachPokerModule.createInitialState({
    gameId: 'cockroach-poker',
    seats: [],
    seed,
    gameOptions: { players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, isAI: false })) },
  });
}

const LABELS = ['Rat', 'Fly', 'Spider', 'Cockroach', 'Toad', 'Bat', 'Scorpion', 'Stink Bug'];
/** Face-up creature cards rendered (card faces have role img + creature name). */
const faces = () => screen.queryAllByRole('img').filter((el) => LABELS.includes(el.getAttribute('aria-label') ?? '')).length;

afterEach(() => {
  act(() => useGameStore.getState().clearGame());
  cleanup();
  vi.useRealTimers();
});

describe('Cockroach Poker view', () => {
  it('renders your hand and nobody else’s', () => {
    act(() => useGameStore.getState().startLocalGame(cockroachPokerModule, newGame(4), 0, { aiSeats: [1, 2, 3] }));
    render(<CockroachPokerGameView />);
    expect(screen.getByRole('heading', { name: 'Cockroach Poker' })).toBeTruthy();
    const hand = useGameStore.getState().publicView!.view.yourHand as Creature[];
    expect(faces()).toBe(new Set(hand).size);
  });

  it('the passer sees the card in transit; the holder does not until they peek', () => {
    let s = newGame(3);
    s = { ...s, phase: 'passing', currentSeat: 0, players: { ...s.players } };
    for (const i of [0, 1, 2]) s.players[i] = { ...s.players[i]!, dealAcked: true, hand: ['rat', 'bat', 'toad'] };
    s = cockroachPokerModule.applyAction(s, { type: 'startPass', bySeat: 0, handIndex: 0, claim: 'fly', target: 1 }, '');
    // Holder's view (online-style single seat): no Rat face anywhere except its own hand.
    act(() => useGameStore.getState().startLocalGame(cockroachPokerModule, s, 1, { controllableSeats: [1] }));
    render(<CockroachPokerGameView />);
    expect(screen.queryByText(/You know: it's really/)).toBeNull();
    const before = screen.queryAllByRole('img', { name: 'Rat' }).length;
    fireEvent.click(screen.getByRole('button', { name: /Peek, then pass it on/ }));
    expect(screen.getByText(/You peeked: it/)).toBeTruthy();
    expect(screen.getByText(/now pass it on to someone/)).toBeTruthy();
    expect(screen.queryAllByRole('img', { name: 'Rat' }).length).toBeGreaterThan(before);
  });

  it('hot-seat: no hand in the DOM while the cover is up', () => {
    act(() => useGameStore.getState().startLocalGame(cockroachPokerModule, newGame(3), 0, { aiSeats: [2] }));
    render(<CockroachPokerGameView />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(faces()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /I'm P1/ }));
    expect(faces()).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /sorted my hand/ }));
    expect(screen.getByText(/Pass the device to P2/)).toBeTruthy();
    expect(faces()).toBe(0);
  });

  it('renders every phase of an all-AI game without crashing', () => {
    vi.useFakeTimers();
    act(() =>
      useGameStore.getState().startLocalGame(cockroachPokerModule, newGame(4, 4), null, { aiSeats: [0, 1, 2, 3] }),
    );
    render(<CockroachPokerGameView />);
    const seen = new Set<string>();
    for (let i = 0; i < 3000 && !useGameStore.getState().module?.isFinished(useGameStore.getState().privateState); i++) {
      act(() => {
        vi.advanceTimersByTime(700);
      });
      seen.add((useGameStore.getState().publicView?.view as { phase: string }).phase);
    }
    expect(seen).toContain('decide');
    expect(seen).toContain('gameOver');
    expect(screen.getByText(/Infested!/)).toBeTruthy();
    expect(CREATURES.length).toBe(8);
  });
});
