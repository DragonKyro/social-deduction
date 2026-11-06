import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { loveLetterModule } from '../module';
import type { LoveLetterPrivateState, LoveLetterPublicState } from '../state';
import { LoveLetterGameView } from './GameView';

function newGame(players: number, seed = 9): LoveLetterPrivateState {
  return loveLetterModule.createInitialState({
    gameId: 'love-letter',
    seats: [],
    seed,
    gameOptions: { players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, isAI: false })) },
  });
}

const FACE = /^(Guard|Priest|Baron|Handmaid|Prince|King|Countess|Princess) \(\d\)$/;
const faces = () => screen.queryAllByRole('img', { name: FACE }).length;
const view = () => useGameStore.getState().publicView?.view as LoveLetterPublicState;

afterEach(() => {
  act(() => useGameStore.getState().clearGame());
  cleanup();
  vi.useRealTimers();
});

describe('Love Letter view', () => {
  it('solo vs AI: only your own hand is face-up', () => {
    vi.useFakeTimers();
    const s = newGame(3);
    act(() => useGameStore.getState().startLocalGame(loveLetterModule, s, 0, { aiSeats: [1, 2] }));
    render(<LoveLetterGameView />);
    act(() => {
      vi.advanceTimersByTime(600); // both cards flipped; AI_STEP_DELAY (650) not reached
    });
    expect(screen.getByRole('heading', { name: 'Love Letter' })).toBeTruthy();
    expect(faces()).toBe(s.players[0]!.hand.length);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hot-seat: the hand-over cover keeps every card face out of the DOM', () => {
    vi.useFakeTimers();
    // A seed where seat 1 (a human) starts.
    let seed = 1;
    while (newGame(3, seed).currentSeat !== 1) seed++;
    act(() => useGameStore.getState().startLocalGame(loveLetterModule, newGame(3, seed), 0, { aiSeats: [2] }));
    render(<LoveLetterGameView />);
    // One click acks for both humans on the shared screen; the AI acks itself.
    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(view().phase).toBe('turn');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(useGameStore.getState().localSeat).toBeNull();
    expect(faces()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /I am P2/ }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useGameStore.getState().localSeat).toBe(1);
    expect(faces()).toBe(2);
  });

  it('online seat: no cover, no switching', () => {
    act(() => useGameStore.getState().startLocalGame(loveLetterModule, newGame(3), 1, { controllableSeats: [1] }));
    render(<LoveLetterGameView />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders every phase of an all-AI match without crashing', () => {
    vi.useFakeTimers();
    act(() =>
      useGameStore.getState().startLocalGame(loveLetterModule, newGame(2, 5), null, { aiSeats: [0, 1] }),
    );
    render(<LoveLetterGameView />);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const st = useGameStore.getState();
      if (st.module?.isFinished(st.privateState)) break;
      act(() => {
        vi.advanceTimersByTime(700);
      });
      seen.add(view().phase);
    }
    expect(view().phase).toBe('gameOver');
    expect(screen.getByText(/wins the Princess's heart/)).toBeTruthy();
    for (const p of ['turn', 'effectReveal', 'roundOver']) expect(seen.has(p)).toBe(true);
  });
});
