import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useGameStore } from '@/store/gameStore';
import { crossCluesModule } from '../module';
import { coordLabel } from '../rules';
import type { CrossCluesPrivateState } from '../state';
import { CrossCluesGameView } from './GameView';

// Hot-seat hidden-info checks: the held coordinate must never be in the
// DOM unless the clue-giver has explicitly taken the device this round.

function start(): CrossCluesPrivateState {
  const players = Array.from({ length: 3 }, (_, i) => ({ name: `P${i + 1}`, isAI: false }));
  const state = crossCluesModule.createInitialState({
    gameId: 'cross-clues',
    seats: [],
    seed: 77,
    gameOptions: { players, packs: ['classic'] },
  });
  useGameStore.getState().startLocalGame(crossCluesModule, state, 0, { aiSeats: [] });
  return state;
}

function heldPrivate(): CrossCluesPrivateState {
  return useGameStore.getState().privateState as CrossCluesPrivateState;
}

afterEach(() => {
  cleanup();
  useGameStore.getState().clearGame();
});

describe('Cross Clues UI — hot-seat covers', () => {
  it('shows the coordinate only to the claimed clue-giver and hides it before the guess', () => {
    start();
    const { container } = render(<CrossCluesGameView />);
    // One press acknowledges for every human at the device.
    fireEvent.click(screen.getByRole('button', { name: "We're ready" }));
    const st = heldPrivate();
    expect(st.phase).toBe('clueGiving');
    const label = coordLabel(st.currentCoord!);
    const giver = st.seats[st.currentClueGiver!]!.name;

    expect(screen.queryByText('Your secret card')).toBeNull();
    expect(container.innerHTML).not.toContain('(your card)');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`I'm ${giver}`) }));
    expect(screen.getByText('Your secret card')).toBeTruthy();
    expect(container.innerHTML).toContain(`${label}:`);

    fireEvent.change(screen.getByLabelText('Your one-word clue'), { target: { value: 'zzyzx' } });
    fireEvent.click(screen.getByRole('button', { name: /Stick it on the board/ }));
    expect(heldPrivate().phase).toBe('guessing');
    // Still the holder's seat, but the card is covered before the table looks.
    expect(screen.queryByText('Your secret card')).toBeNull();
    expect(container.innerHTML).not.toContain('(your card)');

    fireEvent.click(screen.getByRole('button', { name: /Show the team/ }));
    expect(screen.queryByText('Your secret card')).toBeNull();
    expect(useGameStore.getState().publicView!.view.yourCoord).toBeNull();
    // The guesser can pick and confirm.
    const cells = screen.getAllByRole('button', { name: /^[A-E][1-5]:/ });
    expect(cells.length).toBe(25);
    fireEvent.click(cells[0]!);
    fireEvent.click(screen.getByRole('button', { name: /^Guess A1/ }));
    expect(heldPrivate().phase).toBe('revealRound');
  });
});
