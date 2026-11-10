import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useGameStore } from '@/store/gameStore';
import { codenamesModule } from '../module';
import type { CodenamesPrivateState } from '../state';
import { CodenamesGameView } from './GameView';

// Hot-seat hidden-info checks: the key card must never be in the DOM unless
// the current spymaster has explicitly opened their file for this clue.

function start(aiSeats: number[] = []): CodenamesPrivateState {
  const players = Array.from({ length: 4 }, (_, i) => ({ name: `P${i + 1}`, isAI: aiSeats.includes(i) }));
  const state = codenamesModule.createInitialState({
    gameId: 'codenames',
    seats: [],
    seed: 1234,
    gameOptions: { players, packs: ['classic'] },
  });
  const firstHuman = players.findIndex((p) => !p.isAI);
  useGameStore.getState().startLocalGame(codenamesModule, state, firstHuman, { aiSeats });
  return state;
}

function keyInDom(container: HTMLElement): boolean {
  return (
    container.querySelectorAll('[data-tint]').length > 0 ||
    container.querySelectorAll('[data-kind="assassin"]').length > 0 ||
    /\(key:/.test(container.innerHTML)
  );
}

afterEach(() => {
  cleanup();
  useGameStore.getState().clearGame();
});

describe('Codenames UI — hot-seat covers', () => {
  it('keeps the key out of the DOM until the spymaster opens it, and seals it after the clue', () => {
    const s = start();
    const spy = s.seats.find((x) => x.role === 'spymaster' && x.team === s.currentTeam)!;
    const { container } = render(<CodenamesGameView />);

    // Device starts covered, even though seat 0 may be the spymaster.
    expect(keyInDom(container)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`I am ${spy.name}`) }));
    expect(keyInDom(container)).toBe(true);
    expect(screen.getByRole('img', { name: /Key card/ })).toBeTruthy();

    // Transmit a clue → the file is sealed before the board returns.
    fireEvent.change(screen.getByPlaceholderText('ONE WORD'), { target: { value: 'qwertyz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Transmit' }));
    expect(useGameStore.getState().publicView!.view.phase).toBe('guessing');
    expect(keyInDom(container)).toBe(false);
    expect(screen.getByText('Transmission sent')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Open the board/ }));
    expect(keyInDom(container)).toBe(false);
    expect(useGameStore.getState().publicView!.view.yourRole).not.toBe('spymaster');
    // Operatives can guess: a card button exists.
    expect(screen.getAllByRole('button', { name: /^Guess / }).length).toBe(25);
  });

  it('two-step guess: first tap marks, second tap sends', () => {
    const s = start();
    const spy = s.seats.find((x) => x.role === 'spymaster' && x.team === s.currentTeam)!;
    act(() => {
      useGameStore.getState().dispatch({ type: 'giveClue', bySeat: spy.index, word: 'QWERTYZ', number: 1 });
    });
    render(<CodenamesGameView />);
    // localSeat may be a spymaster → seal first.
    const open = screen.queryByRole('button', { name: /Open the board/ });
    if (open) fireEvent.click(open);
    const card = screen.getAllByRole('button', { name: /^Guess / })[0]!;
    fireEvent.click(card);
    expect(useGameStore.getState().publicView!.view.guessesThisClue).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /^Confirm guess/ }));
    const v = useGameStore.getState().publicView!.view;
    expect(v.guessHistory.length).toBe(1);
  });

  it('a single human (vs AI) sees their own seat without covers', () => {
    // Seat 0 human (red spymaster in the default split), the rest AI.
    start([1, 2, 3]);
    const { container } = render(<CodenamesGameView />);
    expect(screen.queryByText(/Pass the device/)).toBeNull();
    // Seat 0 is a spymaster in the default split, so the key is theirs to see.
    expect(keyInDom(container)).toBe(true);
  });
});
