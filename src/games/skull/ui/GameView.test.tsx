import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { skullModule } from '../module';
import type { SkullPrivateState, SkullPublicState } from '../state';
import { SkullGameView } from './GameView';

function newGame(players: number, seed = 9): SkullPrivateState {
  return skullModule.createInitialState({
    gameId: 'skull',
    seats: [],
    seed,
    gameOptions: {
      players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, isAI: false })),
      challengeTarget: 2,
    },
  });
}

const faces = () => screen.queryAllByRole('img', { name: /^(rose|skull) disk$/ }).length;
const view = () => useGameStore.getState().publicView?.view as SkullPublicState;

afterEach(() => {
  act(() => useGameStore.getState().clearGame());
  cleanup();
  vi.useRealTimers();
});

describe('Skull view', () => {
  it('solo vs AI: only your own disks are face-up', () => {
    act(() => useGameStore.getState().startLocalGame(skullModule, newGame(4), 0, { aiSeats: [1, 2, 3] }));
    render(<SkullGameView />);
    expect(screen.getByRole('heading', { name: 'Skull' })).toBeTruthy();
    expect(faces()).toBe(4); // 3 roses + 1 skull in your hand
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hot-seat: the hand-over cover hides every disk face', () => {
    let seed = 1;
    while (newGame(3, seed).currentSeat !== 0) seed++;
    act(() => useGameStore.getState().startLocalGame(skullModule, newGame(3, seed), 0, { aiSeats: [] }));
    render(<SkullGameView />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Place a skull/ }));
    // Seat 1 must place next: the screen drops to a spectator view + cover.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(useGameStore.getState().localSeat).toBeNull();
    expect(faces()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /I'm P2/ }));
    expect(useGameStore.getState().localSeat).toBe(1);
    expect(faces()).toBe(4);
  });

  it('online seat: no cover, no switching', () => {
    act(() => useGameStore.getState().startLocalGame(skullModule, newGame(3), 1, { controllableSeats: [1] }));
    render(<SkullGameView />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders every phase of an all-AI match without crashing', () => {
    vi.useFakeTimers();
    act(() => useGameStore.getState().startLocalGame(skullModule, newGame(4, 7), null, { aiSeats: [0, 1, 2, 3] }));
    render(<SkullGameView />);
    const seen = new Set<string>();
    for (let i = 0; i < 6000; i++) {
      const st = useGameStore.getState();
      if (st.module?.isFinished(st.privateState)) break;
      act(() => {
        vi.advanceTimersByTime(700);
      });
      seen.add(view().phase);
      // Spectators never see a face-down disk's face: every face on screen
      // is a public flip.
      expect(faces()).toBeLessThanOrEqual(view().flips.length + 1);
    }
    expect(view().phase).toBe('gameOver');
    expect(screen.getByText(/takes the bar!/)).toBeTruthy();
    for (const p of ['placeOpening', 'placing', 'bidding', 'revealing', 'roundOver']) expect(seen.has(p)).toBe(true);
  });
});
