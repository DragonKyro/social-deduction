import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeatIndex } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import { avalonModule } from '../module';
import type { AvalonPrivateState } from '../state';
import { fullSpecials, newGame, selfPlay } from '../test-utils';
import { AvalonGameView } from './GameView';

// DOM-level checks: the real view renders every phase, and secrets never
// reach the DOM unless they're the viewer's own and uncovered.

function load(
  state: AvalonPrivateState,
  seat: SeatIndex | null,
  opts: { aiSeats?: SeatIndex[]; controllableSeats?: SeatIndex[] | null } = {},
) {
  useGameStore.setState({
    gameId: 'avalon',
    module: avalonModule,
    privateState: state,
    tick: 1,
    publicView: { gameId: 'avalon', tick: 1, view: avalonModule.viewFor(state, seat), seat },
    localSeat: seat,
    isHost: true,
    aiSeats: opts.aiSeats ?? [],
    controllableSeats: opts.controllableSeats ?? null,
    broadcastHandler: null,
  });
}

const ALLEGIANCE = /Loyal to Arthur|Servant of Mordred/;

afterEach(() => {
  cleanup();
  useGameStore.getState().clearGame();
});

describe('Avalon UI — renders every phase', () => {
  it('renders each state of a full game for a player and a spectator without throwing', () => {
    const states: AvalonPrivateState[] = [];
    selfPlay(newGame(7, fullSpecials(7), 4242), (s) => states.push(s));
    // Sample every phase change (plus the end) to keep the test quick.
    const sampled = states.filter((s, i) => i === 0 || s.phase !== states[i - 1]!.phase || i === states.length - 1);
    for (const s of sampled) {
      for (const seat of [0, null] as const) {
        load(s, seat, { aiSeats: [1, 2, 3, 4, 5, 6], controllableSeats: [0] });
        const { unmount } = render(<AvalonGameView />);
        expect(screen.getByText('Avalon')).toBeTruthy();
        unmount();
      }
    }
  });
});

describe('Avalon UI — hidden information in the DOM', () => {
  it('hot-seat: the cover hides the role until the right player confirms, and re-locks after', () => {
    const s = newGame(5, ['percival', 'morgana'], 11);
    load(s, 0); // every seat human, controllableSeats null => pass-and-play
    render(<AvalonGameView />);
    expect(screen.getByRole('dialog').textContent).toContain('Pass the device to P1');
    expect(document.body.textContent).not.toMatch(ALLEGIANCE);

    fireEvent.click(screen.getByRole('button', { name: 'I am P1' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Card is still face-down until turned over.
    expect(document.body.textContent).not.toMatch(ALLEGIANCE);
    fireEvent.click(screen.getByRole('button', { name: 'Turn over your card' }));
    expect(document.body.textContent).toContain(s.seats[0]!.alignment === 'good' ? 'Loyal to Arthur' : 'Servant of Mordred');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'I have memorised my role' }));
    });
    const after = useGameStore.getState().privateState as AvalonPrivateState;
    expect(after.setupAcked[0]).toBe(true);
    // Next player is P2: cover is back up and P1's card is gone from the DOM.
    expect(screen.getByRole('dialog').textContent).toContain('Pass the device to P2');
    expect(document.body.textContent).not.toMatch(ALLEGIANCE);
  });

  it('spectators never see a role card, knowledge chips or a vote before game over', () => {
    const states: AvalonPrivateState[] = [];
    selfPlay(newGame(8, fullSpecials(8), 77), (s) => states.push(s));
    for (const s of states.filter((x, i) => i % 7 === 0 && x.phase !== 'gameOver')) {
      load(s, null, { aiSeats: [0, 1, 2, 3, 4, 5, 6, 7], controllableSeats: [] });
      const { unmount } = render(<AvalonGameView />);
      const text = document.body.textContent ?? '';
      expect(text).not.toMatch(ALLEGIANCE);
      expect(text).not.toContain('☠ Evil');
      expect(text).not.toContain('✧ Merlin?');
      expect(text).not.toContain('Your token is down');
      expect(screen.queryByLabelText('Your role')).toBeNull();
      unmount();
    }
  });

  it("a solo player sees their own knowledge on the table (and only theirs)", () => {
    // Find a deal where seat 0 is Merlin.
    let s: AvalonPrivateState | null = null;
    for (let seed = 1; seed < 200 && !s; seed++) {
      const g = newGame(7, ['percival', 'morgana'], seed);
      if (g.seats[0]!.role === 'merlin') s = g;
    }
    s = { ...s!, phase: 'teamProposal', setupAcked: Object.fromEntries(s!.seats.map((x) => [x.index, true])) };
    load(s, 0, { aiSeats: [1, 2, 3, 4, 5, 6], controllableSeats: [0] });
    render(<AvalonGameView />);
    const chips = screen.getAllByText('☠ Evil');
    expect(chips).toHaveLength(s.roleKnowledge[0]!.length);
  });
});
