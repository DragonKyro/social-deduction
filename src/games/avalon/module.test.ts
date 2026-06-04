import { describe, expect, it } from 'vitest';
import type { GameConfig } from '@/engine/types';
import { avalonModule } from './module';
import type { AvalonOptions } from './module';
import type { AvalonAction } from './actions';
import type { AvalonPrivateState, AvalonRoleId } from './state';
import { buildRolePool } from './setup';
import { alignmentSplit, questTrack, MAX_REJECTED_PROPOSALS } from './quest-tracks';

// Test helper — engine's GameModule typed applyAction takes a 3rd `byUuid`
// arg, but tests don't care about identity. Wrap to drop it.
function apply(state: AvalonPrivateState, action: AvalonAction): AvalonPrivateState {
  return avalonModule.applyAction(state, action, '');
}

function configFor(playerCount: number, specialRoles: AvalonRoleId[] = [], seed = 42): GameConfig {
  const opts: AvalonOptions = {
    players: Array.from({ length: playerCount }, (_, i) => ({
      name: `P${i + 1}`,
      isAI: false,
    })),
    specialRoles,
    ladyOfTheLake: false,
    excalibur: false,
    twoLancelots: false,
  };
  return {
    gameId: 'avalon',
    seats: [],
    seed,
    gameOptions: opts as unknown as Record<string, unknown>,
  };
}

function ackEveryoneRoleReveal(state: AvalonPrivateState): AvalonPrivateState {
  let s = state;
  for (let i = 0; i < s.seats.length; i++) {
    s = apply(s, { type: 'ackRoleReveal', bySeat: i });
  }
  return s;
}

describe('Avalon — setup', () => {
  it('builds the right role pool for 5 players (3 good, 2 evil) with base specials', () => {
    const pool = buildRolePool(5, ['percival', 'morgana']);
    expect(pool).toHaveLength(5);
    const goodCount = pool.filter((r) => r === 'merlin' || r === 'percival' || r === 'loyalServant').length;
    const evilCount = pool.filter((r) => r === 'assassin' || r === 'morgana' || r === 'minionOfMordred').length;
    expect(goodCount).toBe(3);
    expect(evilCount).toBe(2);
  });

  it('alignment splits match the rulebook', () => {
    expect(alignmentSplit(5)).toEqual({ good: 3, evil: 2 });
    expect(alignmentSplit(7)).toEqual({ good: 4, evil: 3 });
    expect(alignmentSplit(10)).toEqual({ good: 6, evil: 4 });
  });

  it('quest 4 needs 2 fails at 7+ players, 1 fail otherwise', () => {
    expect(questTrack(5)[3]!.failsRequired).toBe(1);
    expect(questTrack(7)[3]!.failsRequired).toBe(2);
    expect(questTrack(10)[3]!.failsRequired).toBe(2);
  });

  it('rejects too many specials of one alignment', () => {
    expect(() =>
      buildRolePool(5, ['percival', 'mordred', 'morgana', 'oberon']),
    ).toThrow();
  });

  it('deal includes exactly one Merlin and one Assassin', () => {
    const state = avalonModule.createInitialState(configFor(7, ['percival', 'morgana', 'mordred']));
    expect(state.seats.filter((s) => s.role === 'merlin')).toHaveLength(1);
    expect(state.seats.filter((s) => s.role === 'assassin')).toHaveLength(1);
  });

  it('starts in setup phase with everyone unacked', () => {
    const state = avalonModule.createInitialState(configFor(5, ['percival', 'morgana']));
    expect(state.phase).toBe('setup');
    expect(Object.values(state.setupAcked).every((v) => v === false)).toBe(true);
  });

  it('advances to teamProposal once everyone acks role reveal', () => {
    const initial = avalonModule.createInitialState(configFor(5, ['percival', 'morgana']));
    const after = ackEveryoneRoleReveal(initial);
    expect(after.phase).toBe('teamProposal');
  });
});

describe('Avalon — role knowledge', () => {
  function findSeat(state: AvalonPrivateState, role: AvalonRoleId) {
    return state.seats.find((s) => s.role === role);
  }

  it('Merlin sees all evils when Mordred is NOT in play', () => {
    const state = avalonModule.createInitialState(configFor(7, ['percival', 'morgana']));
    const merlin = findSeat(state, 'merlin')!;
    const evilSeats = state.seats.filter((s) => s.alignment === 'evil').map((s) => s.index);
    const merlinKnown = state.roleKnowledge[merlin.index]!.map((k) => k.seat).sort();
    expect(merlinKnown).toEqual(evilSeats.sort());
  });

  it('Merlin does NOT see Mordred when Mordred is in play', () => {
    const state = avalonModule.createInitialState(configFor(7, ['mordred']));
    const merlin = findSeat(state, 'merlin')!;
    const mordred = findSeat(state, 'mordred')!;
    const merlinKnown = state.roleKnowledge[merlin.index]!.map((k) => k.seat);
    expect(merlinKnown).not.toContain(mordred.index);
  });

  it('Percival sees Merlin and Morgana indistinguishably', () => {
    const state = avalonModule.createInitialState(configFor(5, ['percival', 'morgana']));
    const percival = findSeat(state, 'percival')!;
    const merlin = findSeat(state, 'merlin')!;
    const morgana = findSeat(state, 'morgana')!;
    const known = state.roleKnowledge[percival.index]!;
    expect(known.map((k) => k.seat).sort()).toEqual([merlin.index, morgana.index].sort());
    // Labels are identical so Percival can't distinguish.
    expect(known.every((k) => k.label === known[0]!.label)).toBe(true);
  });

  it('Evils see each other (Oberon excluded both directions)', () => {
    const state = avalonModule.createInitialState(configFor(7, ['oberon']));
    const oberon = findSeat(state, 'oberon')!;
    const assassin = findSeat(state, 'assassin')!;
    // Oberon sees nothing.
    expect(state.roleKnowledge[oberon.index]).toEqual([]);
    // Assassin sees other evils but not Oberon.
    const assassinSees = state.roleKnowledge[assassin.index]!.map((k) => k.seat);
    expect(assassinSees).not.toContain(oberon.index);
  });

  it('Loyal Servants know nothing', () => {
    const state = avalonModule.createInitialState(configFor(5, []));
    const loyalty = state.seats.filter((s) => s.role === 'loyalServant');
    expect(loyalty.length).toBeGreaterThan(0);
    for (const s of loyalty) {
      expect(state.roleKnowledge[s.index]).toEqual([]);
    }
  });
});

describe('Avalon — team proposal & voting', () => {
  function startGame(playerCount = 5): AvalonPrivateState {
    const initial = avalonModule.createInitialState(configFor(playerCount, ['percival', 'morgana']));
    return ackEveryoneRoleReveal(initial);
  }

  it('only the current leader may propose', () => {
    const s = startGame();
    const notLeader = (s.currentLeaderSeat + 1) % s.seats.length;
    expect(() =>
      apply(s, { type: 'proposeTeam', bySeat: notLeader, team: [0, 1] }),
    ).toThrow();
  });

  it('rejects wrong-size teams', () => {
    const s = startGame();
    expect(() =>
      apply(s, {
        type: 'proposeTeam',
        bySeat: s.currentLeaderSeat,
        team: [0, 1, 2], // quest 1 needs 2 at 5p
      }),
    ).toThrow();
  });

  it('propose → teamVote phase, votes hidden mid-vote then public on reveal', () => {
    let s = startGame();
    s = apply(s, {
      type: 'proposeTeam',
      bySeat: s.currentLeaderSeat,
      team: [0, 1],
    });
    expect(s.phase).toBe('teamVote');

    // Two votes in. The third seat's view (during teamVote) must hide votes.
    s = apply(s, { type: 'castTeamVote', bySeat: 0, approve: true });
    s = apply(s, { type: 'castTeamVote', bySeat: 1, approve: false });
    const view = avalonModule.viewFor(s, 4);
    expect(view.seats.every((seat) => seat.voteApprove === null)).toBe(true);

    // Finish voting — phase moves to reveal and votes are exposed.
    s = apply(s, { type: 'castTeamVote', bySeat: 2, approve: true });
    s = apply(s, { type: 'castTeamVote', bySeat: 3, approve: false });
    s = apply(s, { type: 'castTeamVote', bySeat: 4, approve: true });
    expect(s.phase).toBe('teamVoteReveal');
    const revealView = avalonModule.viewFor(s, 4);
    expect(revealView.seats.every((seat) => seat.voteApprove !== null)).toBe(true);
  });

  it('approved vote (strict majority) advances to questExecution', () => {
    let s = startGame();
    s = apply(s, {
      type: 'proposeTeam',
      bySeat: s.currentLeaderSeat,
      team: [0, 1],
    });
    for (let i = 0; i < 5; i++) {
      s = apply(s, {
        type: 'castTeamVote',
        bySeat: i,
        approve: i < 3, // 3 approve, 2 reject
      });
    }
    s = apply(s, { type: 'ackTeamVoteReveal' });
    expect(s.phase).toBe('questExecution');
    expect(s.proposedTeam).toEqual([0, 1]);
    expect(s.failedProposalsThisQuest).toBe(0);
  });

  it('ties reject the team (rulebook)', () => {
    // 6p ⇒ even split possible
    let s = avalonModule.createInitialState(configFor(6, ['percival', 'morgana']));
    s = ackEveryoneRoleReveal(s);
    s = apply(s, {
      type: 'proposeTeam',
      bySeat: s.currentLeaderSeat,
      team: [0, 1],
    });
    for (let i = 0; i < 6; i++) {
      s = apply(s, { type: 'castTeamVote', bySeat: i, approve: i < 3 });
    }
    s = apply(s, { type: 'ackTeamVoteReveal' });
    expect(s.phase).toBe('teamProposal'); // back to a fresh proposal
    expect(s.failedProposalsThisQuest).toBe(1);
  });

  it('leader rotates after a rejected proposal', () => {
    let s = startGame();
    const startingLeader = s.currentLeaderSeat;
    s = apply(s, {
      type: 'proposeTeam',
      bySeat: startingLeader,
      team: [0, 1],
    });
    for (let i = 0; i < 5; i++) {
      s = apply(s, { type: 'castTeamVote', bySeat: i, approve: false });
    }
    s = apply(s, { type: 'ackTeamVoteReveal' });
    expect(s.currentLeaderSeat).toBe((startingLeader + 1) % 5);
    expect(s.failedProposalsThisQuest).toBe(1);
  });

  it('5 consecutive rejected proposals → evil wins', () => {
    let s = startGame();
    for (let i = 0; i < MAX_REJECTED_PROPOSALS; i++) {
      s = apply(s, {
        type: 'proposeTeam',
        bySeat: s.currentLeaderSeat,
        team: [0, 1],
      });
      for (let j = 0; j < 5; j++) {
        s = apply(s, { type: 'castTeamVote', bySeat: j, approve: false });
      }
      s = apply(s, { type: 'ackTeamVoteReveal' });
    }
    expect(s.phase).toBe('gameOver');
    expect(s.winnerTeam).toBe('evil');
  });
});

describe('Avalon — quest execution', () => {
  // Helper: drive the game to questExecution with a deterministic team.
  function toQuestExecution(playerCount = 5): AvalonPrivateState {
    let s = avalonModule.createInitialState(configFor(playerCount));
    s = ackEveryoneRoleReveal(s);
    const team = Array.from({ length: questTrack(playerCount)[0]!.teamSize }, (_, i) => i);
    s = apply(s, { type: 'proposeTeam', bySeat: s.currentLeaderSeat, team });
    for (let i = 0; i < playerCount; i++) {
      s = apply(s, { type: 'castTeamVote', bySeat: i, approve: true });
    }
    s = apply(s, { type: 'ackTeamVoteReveal' });
    return s;
  }

  it('good cannot play fail', () => {
    const s = toQuestExecution();
    const goodOnTeam = s.proposedTeam.find((i) => s.seats[i]!.alignment === 'good');
    if (goodOnTeam === undefined) {
      // skip - team had no good player (rare with random seed)
      return;
    }
    expect(() =>
      apply(s, { type: 'playQuestCard', bySeat: goodOnTeam, success: false }),
    ).toThrow();
  });

  it('quest only fails when failsRequired fails are played', () => {
    let s = toQuestExecution(5);
    // Force every team member to play success → quest succeeds.
    for (const seatIdx of s.proposedTeam) {
      // Override alignment for this test scenario — make sure good plays success.
      s = apply(s, { type: 'playQuestCard', bySeat: seatIdx, success: true });
    }
    expect(s.phase).toBe('questResolution');
    expect(s.questHistory[0]!.result).toBe('success');
    expect(s.questHistory[0]!.failCount).toBe(0);
  });

  it('one fail card fails the quest in standard mode', () => {
    let s = toQuestExecution(5);
    // Find an evil on the team to play fail; if none, skip.
    const evilOnTeam = s.proposedTeam.find((i) => s.seats[i]!.alignment === 'evil');
    if (evilOnTeam === undefined) return;
    // Everyone plays success except this seat.
    for (const seatIdx of s.proposedTeam) {
      const isEvilFailer = seatIdx === evilOnTeam;
      s = apply(s, {
        type: 'playQuestCard',
        bySeat: seatIdx,
        success: !isEvilFailer,
      });
    }
    expect(s.questHistory[0]!.result).toBe('fail');
  });

  it('advances quest number and rotates leader after acked quest resolution', () => {
    let s = toQuestExecution();
    for (const seatIdx of s.proposedTeam) {
      // Even evils play success here just to advance the quest cleanly.
      const align = s.seats[seatIdx]!.alignment;
      s = apply(s, {
        type: 'playQuestCard',
        bySeat: seatIdx,
        success: align === 'good' ? true : true,
      });
    }
    const leaderBefore = s.currentLeaderSeat;
    s = apply(s, { type: 'ackQuestResolution' });
    expect(s.phase).toBe('teamProposal');
    expect(s.currentQuestNumber).toBe(2);
    expect(s.currentLeaderSeat).toBe((leaderBefore + 1) % 5);
  });
});

describe('Avalon — win conditions', () => {
  function force3Wins(): AvalonPrivateState {
    // Hand-fabricate quest history: 3 successes.
    let s = avalonModule.createInitialState(configFor(5, ['percival', 'morgana']));
    s = ackEveryoneRoleReveal(s);
    s = {
      ...s,
      questHistory: [
        { questNumber: 1, teamSize: 2, failsRequired: 1, team: [0, 1], failCount: 0, result: 'success' },
        { questNumber: 2, teamSize: 3, failsRequired: 1, team: [0, 1, 2], failCount: 0, result: 'success' },
        { questNumber: 3, teamSize: 2, failsRequired: 1, team: [0, 1], failCount: 0, result: 'success' },
      ],
      phase: 'questResolution',
      currentQuestNumber: 3,
    };
    return s;
  }

  function force3Fails(): AvalonPrivateState {
    let s = avalonModule.createInitialState(configFor(5));
    s = ackEveryoneRoleReveal(s);
    s = {
      ...s,
      questHistory: [
        { questNumber: 1, teamSize: 2, failsRequired: 1, team: [0, 1], failCount: 1, result: 'fail' },
        { questNumber: 2, teamSize: 3, failsRequired: 1, team: [0, 1, 2], failCount: 1, result: 'fail' },
        { questNumber: 3, teamSize: 2, failsRequired: 1, team: [0, 1], failCount: 1, result: 'fail' },
      ],
      phase: 'questResolution',
      currentQuestNumber: 3,
    };
    return s;
  }

  it('3 quest successes triggers assassinPick (when Assassin in play)', () => {
    const s = force3Wins();
    const next = apply(s, { type: 'ackQuestResolution' });
    expect(next.phase).toBe('assassinPick');
  });

  it('3 quest fails → evil wins immediately', () => {
    const s = force3Fails();
    const next = apply(s, { type: 'ackQuestResolution' });
    expect(next.phase).toBe('gameOver');
    expect(next.winnerTeam).toBe('evil');
  });

  it('Assassin hits Merlin → evil wins', () => {
    let s = force3Wins();
    s = apply(s, { type: 'ackQuestResolution' });
    expect(s.phase).toBe('assassinPick');
    const merlinSeat = s.seats.find((x) => x.role === 'merlin')!.index;
    const assassinSeat = s.seats.find((x) => x.role === 'assassin')!.index;
    const next = apply(s, {
      type: 'assassinateMerlin',
      bySeat: assassinSeat,
      target: merlinSeat,
    });
    expect(next.phase).toBe('gameOver');
    expect(next.winnerTeam).toBe('evil');
  });

  it('Assassin misses Merlin → good wins', () => {
    let s = force3Wins();
    s = apply(s, { type: 'ackQuestResolution' });
    const merlinSeat = s.seats.find((x) => x.role === 'merlin')!.index;
    const assassinSeat = s.seats.find((x) => x.role === 'assassin')!.index;
    const wrongTarget = s.seats.find(
      (x) => x.alignment === 'good' && x.index !== merlinSeat,
    )!.index;
    const next = apply(s, {
      type: 'assassinateMerlin',
      bySeat: assassinSeat,
      target: wrongTarget,
    });
    expect(next.phase).toBe('gameOver');
    expect(next.winnerTeam).toBe('good');
  });

  it('only the Assassin can perform the assassination', () => {
    let s = force3Wins();
    s = apply(s, { type: 'ackQuestResolution' });
    const merlinSeat = s.seats.find((x) => x.role === 'merlin')!.index;
    const notAssassin = s.seats.find((x) => x.role !== 'assassin')!.index;
    expect(() =>
      apply(s, {
        type: 'assassinateMerlin',
        bySeat: notAssassin,
        target: merlinSeat,
      }),
    ).toThrow();
  });
});

describe('Avalon — viewFor redaction', () => {
  it('private role only visible to its own seat', () => {
    const s = avalonModule.createInitialState(configFor(5, ['percival', 'morgana']));
    for (let i = 0; i < s.seats.length; i++) {
      const view = avalonModule.viewFor(s, i);
      expect(view.yourRole).toBe(s.seats[i]!.role);
      expect(view.yourAlignment).toBe(s.seats[i]!.alignment);
    }
  });

  it('public seats never expose role/alignment until game over', () => {
    const s = avalonModule.createInitialState(configFor(5, ['percival', 'morgana']));
    const view = avalonModule.viewFor(s, 0);
    for (const seat of view.seats) {
      expect(seat.revealedRole).toBeNull();
      expect(seat.revealedAlignment).toBeNull();
    }
  });

  it('roles revealed at game over for everyone', () => {
    // Force a game-over state.
    let s = avalonModule.createInitialState(configFor(5));
    s = ackEveryoneRoleReveal(s);
    const ended = { ...s, phase: 'gameOver' as const, winnerTeam: 'good' as const };
    const view = avalonModule.viewFor(ended, null);
    for (const seat of view.seats) {
      expect(seat.revealedRole).not.toBeNull();
      expect(seat.revealedAlignment).not.toBeNull();
    }
  });

  it('spectator view (seat=null) has no private info', () => {
    const s = avalonModule.createInitialState(configFor(5));
    const view = avalonModule.viewFor(s, null);
    expect(view.yourRole).toBeNull();
    expect(view.yourAlignment).toBeNull();
    expect(view.yourRoleKnowledge).toEqual([]);
    expect(view.yourQuestCard).toBeNull();
  });

  it('quest card visible only to the playing seat', () => {
    let s = avalonModule.createInitialState(configFor(5));
    s = ackEveryoneRoleReveal(s);
    s = apply(s, {
      type: 'proposeTeam',
      bySeat: s.currentLeaderSeat,
      team: [0, 1],
    });
    for (let i = 0; i < 5; i++) {
      s = apply(s, { type: 'castTeamVote', bySeat: i, approve: true });
    }
    s = apply(s, { type: 'ackTeamVoteReveal' });
    // Seat 0 plays success.
    s = apply(s, { type: 'playQuestCard', bySeat: 0, success: true });
    const ownView = avalonModule.viewFor(s, 0);
    expect(ownView.yourQuestCard).toBe(true);
    // Other seat sees nothing.
    const otherView = avalonModule.viewFor(s, 2);
    expect(otherView.yourQuestCard).toBeNull();
    // Public count is 1.
    expect(otherView.questCardsSubmitted).toBe(1);
  });

  it('role knowledge handed to its owner only', () => {
    const s = avalonModule.createInitialState(configFor(7, ['percival', 'morgana', 'mordred']));
    const merlin = s.seats.find((x) => x.role === 'merlin')!;
    const merlinView = avalonModule.viewFor(s, merlin.index);
    expect(merlinView.yourRoleKnowledge.length).toBeGreaterThan(0);
    // Pick a different seat — they should not see Merlin's knowledge.
    const otherIdx = (merlin.index + 1) % s.seats.length;
    const otherView = avalonModule.viewFor(s, otherIdx);
    // Compare: their knowledge is for THEIR seat, not Merlin's.
    expect(otherView.yourRoleKnowledge).toEqual(s.roleKnowledge[otherIdx]);
  });
});

describe('Avalon — defaults', () => {
  it('default config picks Percival + Morgana at 5p', () => {
    const cfg = avalonModule.defaultConfig(5);
    const opts = cfg.gameOptions as unknown as AvalonOptions;
    expect(opts.specialRoles).toContain('percival');
    expect(opts.specialRoles).toContain('morgana');
  });

  it('default config adds Mordred at 7p', () => {
    const cfg = avalonModule.defaultConfig(7);
    const opts = cfg.gameOptions as unknown as AvalonOptions;
    expect(opts.specialRoles).toContain('mordred');
  });
});
