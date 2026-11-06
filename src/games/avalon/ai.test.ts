import { describe, expect, it } from 'vitest';
import { aiChooseAction } from './ai';
import { avalonModule } from './module';
import { buildRoleKnowledge } from './setup';
import type { AvalonPrivateState } from './state';
import { ackAll, apply, fullSpecials, newGame, proposeAndVote, selfPlay } from './test-utils';

describe('Avalon AI — self-play', () => {
  it('all-AI games finish without throwing or stalling (5–10p, many seeds)', () => {
    const winners = { good: 0, evil: 0 };
    let assassinations = 0;
    for (let n = 5; n <= 10; n++) {
      for (let seed = 1; seed <= 12; seed++) {
        const end = selfPlay(newGame(n, fullSpecials(n), seed * 7919 + n));
        expect(end.phase).toBe('gameOver');
        expect(end.winnerTeam).not.toBeNull();
        winners[end.winnerTeam!]++;
        if (end.assassinationTarget !== null) assassinations++;
      }
    }
    // Both sides win sometimes and the assassination phase is reached — i.e.
    // the AI isn't degenerate.
    expect(winners.good).toBeGreaterThan(0);
    expect(winners.evil).toBeGreaterThan(0);
    expect(assassinations).toBeGreaterThan(0);
  });

  it('also finishes with no specials and with Oberon in play', () => {
    for (const seed of [3, 4, 5, 6]) {
      expect(selfPlay(newGame(5, [], seed)).phase).toBe('gameOver');
      expect(selfPlay(newGame(7, ['oberon'], seed)).phase).toBe('gameOver');
      expect(selfPlay(newGame(10, ['oberon', 'mordred'], seed)).phase).toBe('gameOver');
    }
  });

  it('evil AIs never double-fail a one-fail quest (they can see each other)', () => {
    for (let n = 5; n <= 10; n++) {
      for (let seed = 1; seed <= 8; seed++) {
        // No Oberon: every evil sees every other evil.
        const specials = n >= 7 ? (['percival', 'morgana', 'mordred'] as const) : (['percival', 'morgana'] as const);
        const end = selfPlay(newGame(n, [...specials], seed * 31 + n));
        for (const q of end.questHistory) {
          if (q.failsRequired === 1) expect(q.failCount).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('Avalon AI — acts exactly when its seat must', () => {
  it('acks its role in setup, then stops', () => {
    const s = newGame(5, ['percival', 'morgana']);
    expect(aiChooseAction(s, 2)).toEqual({ type: 'ackRoleReveal', bySeat: 2 });
    const acked = apply(s, { type: 'ackRoleReveal', bySeat: 2 });
    expect(aiChooseAction(acked, 2)).toBeNull();
  });

  it('only the leader proposes; proposal is legal', () => {
    const s = ackAll(newGame(7, fullSpecials(7)));
    for (let i = 0; i < 7; i++) {
      const a = aiChooseAction(s, i);
      if (i === s.currentLeaderSeat) {
        expect(a?.type).toBe('proposeTeam');
        expect(() => apply(s, a!)).not.toThrow();
      } else {
        expect(a).toBeNull();
      }
    }
  });

  it('votes once, plays a quest card only when on the team, and good never fails', () => {
    for (let seed = 1; seed <= 10; seed++) {
      let s = ackAll(newGame(6, fullSpecials(6), seed));
      s = apply(s, { type: 'proposeTeam', bySeat: s.currentLeaderSeat, team: [0, 1] });
      const v0 = aiChooseAction(s, 0);
      expect(v0?.type).toBe('castTeamVote');
      s = apply(s, v0!);
      expect(aiChooseAction(s, 0)).toBeNull();
      for (let i = 1; i < 6; i++) s = apply(s, { type: 'castTeamVote', bySeat: i, approve: true });
      s = apply(s, { type: 'ackTeamVoteReveal' });
      for (let i = 0; i < 6; i++) {
        const a = aiChooseAction(s, i);
        if (i <= 1) {
          expect(a?.type).toBe('playQuestCard');
          if (s.seats[i]!.alignment === 'good') expect(a).toMatchObject({ success: true });
        } else {
          expect(a).toBeNull();
        }
      }
    }
  });

  it('never makes the seatless host acks (humans get to watch reveals)', () => {
    let s = ackAll(newGame(5, ['percival', 'morgana']));
    s = proposeAndVote(s, [0, 1], true);
    expect(s.phase).toBe('teamVoteReveal');
    for (let i = 0; i < 5; i++) expect(aiChooseAction(s, i)).toBeNull();
    s = apply(s, { type: 'ackTeamVoteReveal' });
    s = apply(s, { type: 'playQuestCard', bySeat: 0, success: true });
    s = apply(s, { type: 'playQuestCard', bySeat: 1, success: true });
    expect(s.phase).toBe('questResolution');
    for (let i = 0; i < 5; i++) expect(aiChooseAction(s, i)).toBeNull();
  });

  it('only the Assassin acts in assassinPick, and never names itself or a known teammate', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const s0 = ackAll(newGame(8, fullSpecials(8), seed));
      const s: AvalonPrivateState = { ...s0, phase: 'assassinPick' };
      const assassin = s.seats.find((x) => x.role === 'assassin')!.index;
      const teammates = s.roleKnowledge[assassin]!.map((k) => k.seat);
      for (let i = 0; i < 8; i++) {
        const a = aiChooseAction(s, i);
        if (i !== assassin) {
          expect(a).toBeNull();
          continue;
        }
        expect(a?.type).toBe('assassinateMerlin');
        const target = (a as { target: number }).target;
        expect(target).not.toBe(assassin);
        expect(teammates).not.toContain(target);
        expect(() => apply(s, a!)).not.toThrow();
      }
    }
  });

  it('returns null for an out-of-range seat', () => {
    const s = newGame(5);
    expect(aiChooseAction(s, 9)).toBeNull();
    expect(aiChooseAction(s, -1)).toBeNull();
  });
});

describe('Avalon AI — fairness (decides from its own view only)', () => {
  // Swap the hidden roles of two OTHER seats such that the viewer's own view
  // is unchanged. A fair AI must then make the identical decision.
  function swapRoles(s: AvalonPrivateState, a: number, b: number): AvalonPrivateState {
    const seats = s.seats.map((x) => ({ ...x }));
    const ra = seats[a]!;
    const rb = seats[b]!;
    [ra.role, rb.role] = [rb.role, ra.role];
    [ra.alignment, rb.alignment] = [rb.alignment, ra.alignment];
    return { ...s, seats, roleKnowledge: buildRoleKnowledge(seats) };
  }

  it('a Loyal Servant decides identically whoever the evils really are', () => {
    let differentWorlds = 0;
    for (let seed = 1; seed <= 25; seed++) {
      let s = ackAll(newGame(7, ['percival', 'morgana'], seed));
      const me = s.seats.find((x) => x.role === 'loyalServant')!.index;
      const good = s.seats.find((x) => x.index !== me && x.role === 'merlin')!.index;
      const evil = s.seats.find((x) => x.role === 'minionOfMordred' || x.role === 'assassin')!.index;
      // Same leader, same proposal in both worlds.
      s = apply(s, {
        type: 'proposeTeam',
        bySeat: s.currentLeaderSeat,
        team: [good, evil].sort((x, y) => x - y),
      });
      const other = swapRoles(s, good, evil);
      expect(avalonModule.viewFor(other, me)).toEqual(avalonModule.viewFor(s, me));
      expect(aiChooseAction(other, me)).toEqual(aiChooseAction(s, me));
      differentWorlds++;
    }
    expect(differentWorlds).toBe(25);
  });

  it('Percival does not mistake Merlin for evil (old regex bug: "Merlin or Morgana" matched /morgana/)', () => {
    // Percival on a 2-seat team with Merlin, quest 1: an AI that treats the
    // Merlin/Morgana pair as known evil rejects every time.
    let approvals = 0;
    const seeds = 30;
    for (let seed = 1; seed <= seeds; seed++) {
      let s = ackAll(newGame(5, ['percival', 'morgana'], seed));
      const percival = s.seats.find((x) => x.role === 'percival')!.index;
      const merlin = s.seats.find((x) => x.role === 'merlin')!.index;
      s = apply(s, {
        type: 'proposeTeam',
        bySeat: s.currentLeaderSeat,
        team: [percival, merlin].sort((x, y) => x - y),
      });
      const a = aiChooseAction(s, percival);
      expect(a?.type).toBe('castTeamVote');
      if ((a as { approve: boolean }).approve) approvals++;
    }
    expect(approvals).toBeGreaterThan(seeds / 2);
  });

  it('votes vary across repeated proposals in one quest (no frozen RNG)', () => {
    // The old RNG salt ignored the attempt number, so a seat's "random" vote
    // was identical for all five proposals of a quest.
    let varied = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let s = ackAll(newGame(5, [], seed));
      const votes: boolean[] = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        s = apply(s, { type: 'proposeTeam', bySeat: s.currentLeaderSeat, team: [0, 1] });
        const a = aiChooseAction(s, 4) as { approve: boolean };
        votes.push(a.approve);
        for (let i = 0; i < 5; i++) s = apply(s, { type: 'castTeamVote', bySeat: i, approve: false });
        s = apply(s, { type: 'ackTeamVoteReveal' });
      }
      if (new Set(votes).size > 1) varied++;
    }
    expect(varied).toBeGreaterThan(0);
  });
});
