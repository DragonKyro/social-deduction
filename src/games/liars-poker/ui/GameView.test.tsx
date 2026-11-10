import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { liarsPokerModule } from '../module';
import type { CardRank, LiarsPokerPrivateState } from '../state';
import { LiarsPokerGameView } from './GameView';

function newGame(players: number, seed = 9, cardsPerPlayer = 3): LiarsPokerPrivateState {
  return liarsPokerModule.createInitialState({
    gameId: 'liars-poker',
    seats: [],
    seed,
    gameOptions: {
      players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, isAI: false })),
      cardsPerPlayer,
      dummyHand: true,
    },
  });
}

const faceUp = () => screen.queryAllByRole('img', { name: / of (spades|hearts|diamonds|clubs)$/ }).length;

afterEach(() => {
  act(() => useGameStore.getState().clearGame());
  cleanup();
  vi.useRealTimers();
});

describe("Liar's Poker view", () => {
  it('solo vs AI: only your own cards are face-up', () => {
    act(() => useGameStore.getState().startLocalGame(liarsPokerModule, newGame(3), 0, { aiSeats: [1, 2] }));
    render(<LiarsPokerGameView />);
    expect(screen.getByRole('heading', { name: "Liar's Poker" })).toBeTruthy();
    expect(faceUp()).toBe(3);
  });

  it("a dummy sees everyone's dummy card but their own", () => {
    let s = newGame(3, 5, 1);
    // Make seat 0 a dummy with a known card.
    s = {
      ...s,
      players: {
        ...s.players,
        0: { ...s.players[0]!, isDummy: true, cardCount: 0, hand: [{ rank: 13 as CardRank, suit: 'hearts' }] },
      },
    };
    act(() => useGameStore.getState().startLocalGame(liarsPokerModule, s, 0, { aiSeats: [1, 2] }));
    render(<LiarsPokerGameView />);
    expect(screen.queryByRole('img', { name: 'King of hearts' })).toBeNull();
    act(() => useGameStore.getState().clearGame());
    cleanup();

    act(() => useGameStore.getState().startLocalGame(liarsPokerModule, s, 1, { aiSeats: [0, 2] }));
    render(<LiarsPokerGameView />);
    expect(screen.getByRole('img', { name: 'King of hearts' })).toBeTruthy();
  });

  it('hot-seat: no card faces in the DOM while the hand-off cover is up', () => {
    act(() => useGameStore.getState().startLocalGame(liarsPokerModule, newGame(3), 0, { aiSeats: [2] }));
    render(<LiarsPokerGameView />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(faceUp()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /I'm P1/ }));
    expect(faceUp()).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    expect(screen.getByText(/Pass the device to P2/)).toBeTruthy();
    expect(faceUp()).toBe(0);
  });

  it('renders every phase of an all-AI game without crashing', () => {
    vi.useFakeTimers();
    act(() =>
      useGameStore.getState().startLocalGame(liarsPokerModule, newGame(3, 4, 2), null, { aiSeats: [0, 1, 2] }),
    );
    render(<LiarsPokerGameView />);
    const seen = new Set<string>();
    for (let i = 0; i < 3000 && !useGameStore.getState().module?.isFinished(useGameStore.getState().privateState); i++) {
      act(() => {
        vi.advanceTimersByTime(700);
      });
      seen.add((useGameStore.getState().publicView?.view as { phase: string }).phase);
    }
    expect(seen).toContain('revealing');
    expect(seen).toContain('gameOver');
    expect(screen.getByText(/Last hand standing/)).toBeTruthy();
  });
});
