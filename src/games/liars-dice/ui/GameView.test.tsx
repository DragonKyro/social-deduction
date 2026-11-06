import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { liarsDiceModule } from '../module';
import type { LiarsDicePrivateState } from '../state';
import { LiarsDiceGameView } from './GameView';

function newGame(players: number, seed = 9): LiarsDicePrivateState {
  return liarsDiceModule.createInitialState({
    gameId: 'liars-dice',
    seats: [],
    seed,
    gameOptions: {
      players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, isAI: false })),
      wildOnes: true,
      spotOn: true,
      startingDice: 5,
    },
  });
}

const dieCount = () => screen.queryAllByRole('img', { name: /^die showing/ }).length;

afterEach(() => {
  act(() => useGameStore.getState().clearGame());
  cleanup();
  vi.useRealTimers();
});

describe("Liar's Dice view", () => {
  it('solo vs AI: shows only your own dice, opponents stay cupped', () => {
    act(() => useGameStore.getState().startLocalGame(liarsDiceModule, newGame(3), 0, { aiSeats: [1, 2] }));
    render(<LiarsDiceGameView />);
    expect(screen.getByRole('heading', { name: "Liar's Dice" })).toBeTruthy();
    expect(dieCount()).toBe(5);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hot-seat: the hand-off cover keeps every die out of the DOM until revealed', () => {
    act(() => useGameStore.getState().startLocalGame(liarsDiceModule, newGame(3), 0, { aiSeats: [2] }));
    render(<LiarsDiceGameView />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(dieCount()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /I'm P1/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(dieCount()).toBe(5);

    fireEvent.click(screen.getByRole('button', { name: /seen my dice/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Pass the device to P2/)).toBeTruthy();
    expect(dieCount()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /I'm P2/ }));
    expect(useGameStore.getState().localSeat).toBe(1);
    expect(dieCount()).toBe(5);
  });

  it('online seat: no cover and no seat switching', () => {
    act(() =>
      useGameStore.getState().startLocalGame(liarsDiceModule, newGame(3), 1, { controllableSeats: [1] }),
    );
    render(<LiarsDiceGameView />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(dieCount()).toBe(5);
  });

  it('renders every phase of an all-AI game without crashing', () => {
    vi.useFakeTimers();
    act(() =>
      useGameStore.getState().startLocalGame(liarsDiceModule, newGame(3, 4), null, { aiSeats: [0, 1, 2] }),
    );
    render(<LiarsDiceGameView />);
    const seen = new Set<string>();
    for (let i = 0; i < 3000 && !useGameStore.getState().module?.isFinished(useGameStore.getState().privateState); i++) {
      act(() => {
        vi.advanceTimersByTime(700);
      });
      seen.add((useGameStore.getState().publicView?.view as { phase: string }).phase);
    }
    expect(seen).toContain('revealing');
    expect(seen).toContain('gameOver');
    expect(screen.getByText(/Last cup standing/)).toBeTruthy();
  });
});
