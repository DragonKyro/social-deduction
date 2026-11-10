import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { onuwModule } from '../module';
import type { OnuwPrivateState } from '../state';
import { makeConfig, rig, selfPlay } from '../testkit';
import { viewFor } from '../view';
import { OnuwGameView } from './GameView';

// UI smoke tests: the real screen, driven through the store. The key check
// is DOM-level: what a person looking at the shared screen can read.

afterEach(() => {
  cleanup();
  useGameStore.getState().clearGame();
});

const text = () => document.body.textContent ?? '';
const click = (label: RegExp | string) => fireEvent.click(screen.getByRole('button', { name: label }));

describe('ONUW UI — pass-and-play keeps secrets off the shared screen', () => {
  it('role reveal → night hand-offs → day, with the spectator view between players', () => {
    const s = rig(['seer', 'werewolf', 'villager'], ['robber', 'troublemaker', 'villager']);
    act(() => useGameStore.getState().startLocalGame(onuwModule, s, 0));
    render(<OnuwGameView />);

    // Shared screen: spectator view, no role anywhere.
    expect(useGameStore.getState().localSeat).toBeNull();
    expect(text()).toContain('Pass the device to P1');
    expect(text()).not.toContain('Seer');

    click(/I am P1/);
    expect(useGameStore.getState().localSeat).toBe(0);
    click('Turn over your card');
    expect(text()).toContain('The Seer');
    click(/I'll remember/);

    // Back to the shared screen: P1's card is gone from the DOM.
    expect(useGameStore.getState().localSeat).toBeNull();
    expect(text()).toContain('Pass the device to P2');
    expect(text()).not.toContain('Seer');

    click(/I am P2/);
    click('Turn over your card');
    click(/I'll remember/);
    click(/I am P3/);
    click('Turn over your card');
    click(/I'll remember/);
    expect(useGameStore.getState().privateState).toMatchObject({ phase: 'night' });

    // Night: the curtain goes round in seat order and never names a role.
    expect(text()).toContain('Pass the device to P1');
    expect(text()).not.toMatch(/Werewolf|Seer/);
    click(/I am P1/);
    expect(text()).toContain('Nothing stirs for you right now');
    click('Pass the device on');

    expect(text()).toContain('Pass the device to P2');
    click(/I am P2/);
    expect(text()).toContain('You are the only werewolf');
    click("Don't look");
    click(/Close my eyes/);
    expect(text()).not.toContain('You are the only werewolf');

    click(/I am P3/);
    click('Pass the device on');
    click(/I am P1/);
    expect(text()).toContain('The Seer');
    click('Look at nothing');
    // Night is over; P1 still sees their own (empty) notes until they close.
    expect(useGameStore.getState().privateState).toMatchObject({ phase: 'day' });
    click(/hide my notes/);

    // Day, shared: public table + cheatsheet; nobody's notes.
    expect(useGameStore.getState().localSeat).toBeNull();
    expect(text()).toContain('Call the vote');
    expect(text()).not.toContain('You are the only werewolf');
  });
});

describe('ONUW UI — every phase renders, and a seat sees only its own notes', () => {
  function states(seed: number): OnuwPrivateState[] {
    const out: OnuwPrivateState[] = [];
    const pool = onuwModule.defaultConfig(5).gameOptions.rolePool as Parameters<typeof makeConfig>[0];
    selfPlay(onuwModule.createInitialState(makeConfig(pool, 5, seed)), (s) => out.push(s));
    return out;
  }

  for (const seat of [null, 0, 3] as const) {
    it(`seat ${seat}`, () => {
      const all = states(77);
      act(() =>
        useGameStore.getState().startLocalGame(onuwModule, all[0]!, seat, {
          aiSeats: [],
          controllableSeats: seat === null ? [] : [seat],
        }),
      );
      render(<OnuwGameView />);
      all.forEach((st, tick) => {
        act(() => {
          useGameStore.setState({
            privateState: st,
            tick,
            publicView: { gameId: 'onuw', tick, view: viewFor(st, seat), seat },
          });
        });
        const dom = text();
        const over = st.phase === 'resolution' || st.phase === 'gameOver';
        if (over) return;
        for (const other of st.seats) {
          if (other.index === seat) continue;
          for (const o of other.observations) {
            const mine = seat !== null && st.seats[seat]!.observations.some((x) => x.text.includes(o.text));
            if (!mine) expect(dom).not.toContain(o.text);
          }
        }
      });
    });
  }
});
