import { describe, expect, it } from 'vitest';
import { avalonModule } from '../module';
import { ackAll, apply, newGame, proposeAndVote } from '../test-utils';
import { endReason, nextLocalActor, pendingSeats, questRevealOrder } from './turns';

const viewFor = avalonModule.viewFor;

describe('Avalon UI — turn routing (public view only)', () => {
  it('setup: every unacked seat is pending; a device acts only for seats it controls', () => {
    let s = newGame(5);
    s = apply(s, { type: 'ackRoleReveal', bySeat: 0 });
    const v = viewFor(s, 0);
    expect(pendingSeats(v)).toEqual([1, 2, 3, 4]);
    // Online guest in seat 3: only ever itself.
    expect(nextLocalActor(viewFor(s, 3), 3, (x) => x === 3)).toBe(3);
    expect(nextLocalActor(viewFor(s, 0), 0, (x) => x === 0)).toBeNull();
    // Hot-seat with AI in seats 1 and 2: next human is seat 3.
    expect(nextLocalActor(v, 0, (x) => x !== 1 && x !== 2)).toBe(3);
  });

  it('teamVote: pending = seats without a token down, never decided by seat order', () => {
    let s = ackAll(newGame(5));
    s = apply(s, { type: 'proposeTeam', bySeat: s.currentLeaderSeat, team: [0, 1] });
    s = apply(s, { type: 'castTeamVote', bySeat: 3, approve: true });
    const v = viewFor(s, null);
    expect(pendingSeats(v)).toEqual([0, 1, 2, 4]);
    // The old UI walked seats 0..n in order, so a guest in seat 3 waited on
    // seat 0 forever; now seat 3's device simply has nothing to do.
    expect(nextLocalActor(viewFor(s, 3), 3, (x) => x === 3)).toBeNull();
    expect(nextLocalActor(viewFor(s, 4), 4, (x) => x === 4)).toBe(4);
  });

  it('questExecution: only team members who have not played', () => {
    let s = ackAll(newGame(5));
    s = proposeAndVote(s, [1, 3], true);
    s = apply(s, { type: 'ackTeamVoteReveal' });
    expect(pendingSeats(viewFor(s, null))).toEqual([1, 3]);
    s = apply(s, { type: 'playQuestCard', bySeat: 3, success: true });
    expect(pendingSeats(viewFor(s, null))).toEqual([1]);
  });

  it('reveal phases and assassinPick have no publicly pending seat', () => {
    let s = ackAll(newGame(5));
    s = proposeAndVote(s, [0, 1], true);
    expect(pendingSeats(viewFor(s, null))).toEqual([]);
    expect(pendingSeats(viewFor({ ...s, phase: 'assassinPick' }, null))).toEqual([]);
  });
});

describe('Avalon UI — quest reveal order', () => {
  it('has exactly failCount fails and depends only on public counts', () => {
    for (let q = 1; q <= 5; q++) {
      for (let size = 2; size <= 5; size++) {
        for (let fails = 0; fails <= size; fails++) {
          const order = questRevealOrder(q, size, fails);
          expect(order).toHaveLength(size);
          expect(order.filter((c) => !c)).toHaveLength(fails);
          expect(questRevealOrder(q, size, fails)).toEqual(order);
        }
      }
    }
  });
});

describe('Avalon UI — end reason', () => {
  it('reports five rejections', () => {
    let s = ackAll(newGame(5));
    for (let i = 0; i < 5; i++) {
      s = proposeAndVote(s, [0, 1], false);
      s = apply(s, { type: 'ackTeamVoteReveal' });
    }
    expect(endReason(viewFor(s, null))).toBe('fiveRejections');
  });
});
