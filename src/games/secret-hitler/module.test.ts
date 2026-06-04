import { describe, expect, it } from 'vitest';
import type { GameConfig, SeatIndex } from '@/engine/types';
import { secretHitlerModule } from './module';
import type { ShAction } from './actions';
import type { ShPolicy, ShPrivateState, ShRoleId } from './state';
import { alignmentCounts, ELECTION_TRACKER_MAX, fascistTrack } from './tracks';

function apply(state: ShPrivateState, action: ShAction): ShPrivateState {
  return secretHitlerModule.applyAction(state, action, '');
}

function configFor(playerCount: number, seed = 42): GameConfig {
  return {
    gameId: 'secret-hitler',
    seats: [],
    seed,
    gameOptions: {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: `P${i + 1}`,
        isAI: false,
      })),
      rebalanced6p: false,
    },
  };
}

function ackAll(s: ShPrivateState): ShPrivateState {
  let cur = s;
  for (let i = 0; i < cur.seats.length; i++) {
    cur = apply(cur, { type: 'ackRoleReveal', bySeat: i });
  }
  return cur;
}

function findSeat(state: ShPrivateState, role: ShRoleId): SeatIndex {
  const s = state.seats.find((x) => x.role === role);
  if (!s) throw new Error(`No ${role} seat`);
  return s.index;
}

// Construct a state with a fixed deck on top, so legislative phases pull
// known policies. Convenience for win-track tests.
function withDeckTop(state: ShPrivateState, top: ShPolicy[]): ShPrivateState {
  const rest = state.policyDeck.filter(() => true);
  return { ...state, policyDeck: [...top, ...rest] };
}

describe('Secret Hitler — setup', () => {
  it('alignment counts match the rulebook', () => {
    expect(alignmentCounts(5)).toEqual({ liberals: 3, fascists: 2 });
    expect(alignmentCounts(7)).toEqual({ liberals: 4, fascists: 3 });
    expect(alignmentCounts(10)).toEqual({ liberals: 6, fascists: 4 });
  });

  it('fascist track gives peek at 5/6p, special election at 7+', () => {
    expect(fascistTrack(5)[2]).toBe('peekTop3');
    expect(fascistTrack(7)[2]).toBe('specialElection');
    expect(fascistTrack(9)[0]).toBe('investigate');
  });

  it('deals exactly one Hitler at every player count', () => {
    for (let n = 5; n <= 10; n++) {
      const state = secretHitlerModule.createInitialState(configFor(n));
      expect(state.seats.filter((s) => s.role === 'hitler')).toHaveLength(1);
      // Liberals + fascists + hitler add up to playerCount
      const { liberals, fascists } = alignmentCounts(n);
      expect(state.seats.filter((s) => s.role === 'liberal')).toHaveLength(liberals);
      expect(state.seats.filter((s) => s.role === 'fascist')).toHaveLength(fascists - 1);
    }
  });

  it('initial deck has 6 liberal + 11 fascist policies', () => {
    const state = secretHitlerModule.createInitialState(configFor(5));
    expect(state.policyDeck.length).toBe(17);
    expect(state.policyDeck.filter((p) => p === 'liberal')).toHaveLength(6);
    expect(state.policyDeck.filter((p) => p === 'fascist')).toHaveLength(11);
  });

  it('starts in setup phase with everyone unacked', () => {
    const state = secretHitlerModule.createInitialState(configFor(5));
    expect(state.phase).toBe('setup');
    expect(Object.values(state.setupAcked).every((v) => v === false)).toBe(true);
  });

  it('advances to nomination once every seat acks role reveal', () => {
    const initial = secretHitlerModule.createInitialState(configFor(5));
    const after = ackAll(initial);
    expect(after.phase).toBe('nomination');
  });
});

describe('Secret Hitler — party knowledge', () => {
  it('5p fascists and Hitler all see each other (small-table rule)', () => {
    const state = secretHitlerModule.createInitialState(configFor(5));
    const hitler = findSeat(state, 'hitler');
    const fascist = state.seats.find((s) => s.role === 'fascist')!.index;

    const hitlerView = secretHitlerModule.viewFor(state, hitler);
    expect(hitlerView.yourPartyKnowledge.map((k) => k.seat)).toContain(fascist);

    const fascistView = secretHitlerModule.viewFor(state, fascist);
    expect(fascistView.yourPartyKnowledge.map((k) => k.seat)).toContain(hitler);
  });

  it('7p Hitler does NOT see fascists; fascists still see Hitler', () => {
    const state = secretHitlerModule.createInitialState(configFor(7));
    const hitler = findSeat(state, 'hitler');
    const fascist = state.seats.find((s) => s.role === 'fascist')!.index;

    const hitlerView = secretHitlerModule.viewFor(state, hitler);
    expect(hitlerView.yourPartyKnowledge).toEqual([]);

    const fascistView = secretHitlerModule.viewFor(state, fascist);
    expect(fascistView.yourPartyKnowledge.map((k) => k.seat)).toContain(hitler);
  });

  it('liberals see nothing', () => {
    const state = secretHitlerModule.createInitialState(configFor(7));
    const liberal = state.seats.find((s) => s.role === 'liberal')!.index;
    const view = secretHitlerModule.viewFor(state, liberal);
    expect(view.yourPartyKnowledge).toEqual([]);
  });
});

describe('Secret Hitler — nomination & vote', () => {
  function gameStart(playerCount = 5): ShPrivateState {
    return ackAll(secretHitlerModule.createInitialState(configFor(playerCount)));
  }

  it('only the president can nominate', () => {
    const s = gameStart();
    const notPresident = (s.presidentSeat + 1) % s.seats.length;
    expect(() =>
      apply(s, { type: 'nominateChancellor', bySeat: notPresident, chancellor: 0 }),
    ).toThrow();
  });

  it('president cannot nominate themselves', () => {
    const s = gameStart();
    expect(() =>
      apply(s, {
        type: 'nominateChancellor',
        bySeat: s.presidentSeat,
        chancellor: s.presidentSeat,
      }),
    ).toThrow();
  });

  it('proceeds to electionVote after nomination', () => {
    let s = gameStart();
    const chancellor = (s.presidentSeat + 1) % s.seats.length;
    s = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor });
    expect(s.phase).toBe('electionVote');
    expect(s.chancellorCandidateSeat).toBe(chancellor);
  });

  it('votes are hidden mid-vote and visible on reveal', () => {
    let s = gameStart();
    const chancellor = (s.presidentSeat + 1) % s.seats.length;
    s = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor });
    s = apply(s, { type: 'castVote', bySeat: 0, vote: 'ja' });
    const midView = secretHitlerModule.viewFor(s, 4);
    expect(midView.seats.every((seat) => seat.voteCast === null)).toBe(true);
    // Finish voting.
    for (let i = 1; i < 5; i++) {
      s = apply(s, { type: 'castVote', bySeat: i, vote: 'ja' });
    }
    expect(s.phase).toBe('electionReveal');
    const revealView = secretHitlerModule.viewFor(s, 4);
    expect(revealView.seats.every((seat) => seat.voteCast !== null)).toBe(true);
  });

  it('ties reject the government (rulebook)', () => {
    let s = gameStart(6); // even count → possible tie
    const chancellor = (s.presidentSeat + 1) % s.seats.length;
    s = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor });
    for (let i = 0; i < 6; i++) {
      s = apply(s, { type: 'castVote', bySeat: i, vote: i < 3 ? 'ja' : 'nein' });
    }
    s = apply(s, { type: 'ackElectionReveal', bySeat: 0 });
    expect(s.phase).toBe('nomination');
    expect(s.board.electionTracker).toBe(1);
  });

  it('approved gov draws 3 cards to the president', () => {
    let s = gameStart();
    const chancellor = (s.presidentSeat + 1) % s.seats.length;
    s = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor });
    for (let i = 0; i < 5; i++) {
      s = apply(s, { type: 'castVote', bySeat: i, vote: 'ja' });
    }
    s = apply(s, { type: 'ackElectionReveal', bySeat: 0 });
    expect(s.phase).toBe('legislativePresident');
    expect(s.legislativeHand.length).toBe(3);
    expect(s.policyDeck.length).toBe(14); // 17 - 3
  });
});

describe('Secret Hitler — legislative phase & redaction', () => {
  function toLegislative(): ShPrivateState {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(5)));
    const chancellor = (s.presidentSeat + 1) % s.seats.length;
    s = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor });
    for (let i = 0; i < 5; i++) s = apply(s, { type: 'castVote', bySeat: i, vote: 'ja' });
    return apply(s, { type: 'ackElectionReveal', bySeat: 0 });
  }

  it('only the president sees the 3-card draw', () => {
    const s = toLegislative();
    const presView = secretHitlerModule.viewFor(s, s.presidentSeat);
    expect(presView.yourLegislativeHand?.length).toBe(3);
    const otherView = secretHitlerModule.viewFor(s, (s.presidentSeat + 2) % s.seats.length);
    expect(otherView.yourLegislativeHand).toBeNull();
  });

  it('only the chancellor sees the 2-card hand after president discards', () => {
    let s = toLegislative();
    const president = s.presidentSeat;
    const chancellor = s.chancellorCandidateSeat!;
    s = apply(s, { type: 'presidentDiscard', bySeat: president, discardIndex: 0 });
    expect(s.phase).toBe('legislativeChancellor');
    expect(s.legislativeHand.length).toBe(2);

    const chancellorView = secretHitlerModule.viewFor(s, chancellor);
    expect(chancellorView.yourLegislativeHand?.length).toBe(2);
    // President can no longer see the cards after passing them.
    const presView = secretHitlerModule.viewFor(s, president);
    expect(presView.yourLegislativeHand).toBeNull();
  });

  it('chancellor enacting moves to policyReveal and updates the board', () => {
    let s = toLegislative();
    // Force the top 3 to be all liberal so we know what gets enacted.
    s = { ...s, legislativeHand: ['liberal', 'liberal', 'liberal'] };
    const president = s.presidentSeat;
    const chancellor = s.chancellorCandidateSeat!;
    s = apply(s, { type: 'presidentDiscard', bySeat: president, discardIndex: 0 });
    s = apply(s, { type: 'chancellorEnact', bySeat: chancellor, enactIndex: 0 });
    expect(s.phase).toBe('policyReveal');
    expect(s.board.liberalEnacted).toBe(1);
    expect(s.board.electionTracker).toBe(0);
    expect(s.lastElectedPresident).toBe(president);
    expect(s.lastElectedChancellor).toBe(chancellor);
  });
});

describe('Secret Hitler — election tracker top-deck', () => {
  it('3 consecutive failed governments → top-deck force enact and tracker resets', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(5)));
    // Force the top of the deck to be liberal so we know what enacts.
    s = withDeckTop(s, ['liberal']);

    for (let i = 0; i < ELECTION_TRACKER_MAX; i++) {
      const chancellor = (s.presidentSeat + 1) % s.seats.length;
      s = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor });
      for (let j = 0; j < 5; j++) {
        s = apply(s, { type: 'castVote', bySeat: j, vote: 'nein' });
      }
      s = apply(s, { type: 'ackElectionReveal', bySeat: 0 });
    }
    expect(s.phase).toBe('topDeckReveal');
    expect(s.board.liberalEnacted).toBe(1);
    expect(s.board.electionTracker).toBe(0);
    expect(s.lastElectedPresident).toBeNull();
    expect(s.lastElectedChancellor).toBeNull();
  });
});

describe('Secret Hitler — win conditions', () => {
  it('5 enacted liberal policies → liberals win', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(5)));
    s = { ...s, board: { ...s.board, liberalEnacted: 4 } };
    s = { ...s, legislativeHand: ['liberal', 'fascist', 'fascist'] };
    const chancellor = (s.presidentSeat + 1) % s.seats.length;
    s = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor });
    for (let i = 0; i < 5; i++) s = apply(s, { type: 'castVote', bySeat: i, vote: 'ja' });
    s = apply(s, { type: 'ackElectionReveal', bySeat: 0 });
    // Override the drawn hand (since drawing reshuffles); we re-set it.
    s = { ...s, legislativeHand: ['liberal', 'fascist', 'fascist'] };
    s = apply(s, { type: 'presidentDiscard', bySeat: s.presidentSeat, discardIndex: 1 });
    s = apply(s, { type: 'chancellorEnact', bySeat: chancellor, enactIndex: 0 });
    expect(s.phase).toBe('gameOver');
    expect(s.winnerTeam).toBe('liberal');
    expect(s.winReason).toBe('liberalTrack');
  });

  it('6 enacted fascist policies → fascists win', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(5)));
    s = {
      ...s,
      board: { ...s.board, fascistEnacted: 5, vetoUnlocked: true },
    };
    s = { ...s, legislativeHand: ['fascist', 'fascist', 'liberal'] };
    const chancellor = (s.presidentSeat + 1) % s.seats.length;
    s = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor });
    for (let i = 0; i < 5; i++) s = apply(s, { type: 'castVote', bySeat: i, vote: 'ja' });
    s = apply(s, { type: 'ackElectionReveal', bySeat: 0 });
    s = { ...s, legislativeHand: ['fascist', 'fascist', 'liberal'] };
    s = apply(s, { type: 'presidentDiscard', bySeat: s.presidentSeat, discardIndex: 2 });
    s = apply(s, { type: 'chancellorEnact', bySeat: chancellor, enactIndex: 0 });
    expect(s.phase).toBe('gameOver');
    expect(s.winnerTeam).toBe('fascist');
    expect(s.winReason).toBe('fascistTrack');
  });

  it('Hitler elected chancellor after 3 fascist policies → fascists win', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(5)));
    s = { ...s, board: { ...s.board, fascistEnacted: 3 } };
    const hitler = findSeat(s, 'hitler');
    // Ensure president != Hitler so the nomination is legal.
    if (s.presidentSeat === hitler) {
      s = { ...s, presidentSeat: (hitler + 1) % s.seats.length };
    }
    s = apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor: hitler });
    for (let i = 0; i < 5; i++) s = apply(s, { type: 'castVote', bySeat: i, vote: 'ja' });
    s = apply(s, { type: 'ackElectionReveal', bySeat: 0 });
    expect(s.phase).toBe('gameOver');
    expect(s.winnerTeam).toBe('fascist');
    expect(s.winReason).toBe('hitlerElected');
  });

  it('executing Hitler → liberals win', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(7)));
    // Manually drive to execExecute phase. Just place state directly.
    const hitler = findSeat(s, 'hitler');
    const president = (hitler + 1) % s.seats.length;
    s = {
      ...s,
      phase: 'execExecute',
      presidentSeat: president,
      pendingExec: 'execute',
    };
    s = apply(s, { type: 'execExecute', bySeat: president, target: hitler });
    expect(s.phase).toBe('gameOver');
    expect(s.winnerTeam).toBe('liberal');
    expect(s.winReason).toBe('hitlerExecuted');
  });

  it('executing a non-Hitler advances the round and the target is dead', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(7)));
    const hitler = findSeat(s, 'hitler');
    const liberal = s.seats.find((x) => x.role === 'liberal' && x.index !== hitler)!.index;
    const president = (liberal + 1) % s.seats.length;
    s = { ...s, phase: 'execExecute', presidentSeat: president, pendingExec: 'execute' };
    s = apply(s, { type: 'execExecute', bySeat: president, target: liberal });
    expect(s.phase).toBe('nomination');
    expect(s.seats[liberal]!.alive).toBe(false);
  });
});

describe('Secret Hitler — executive powers', () => {
  it('investigation: only the investigator sees the result, persists in yourInvestigations', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(7)));
    const president = s.presidentSeat;
    const target = (president + 2) % s.seats.length;
    s = { ...s, phase: 'execInvestigate', pendingExec: 'investigate' };
    s = apply(s, { type: 'execInvestigate', bySeat: president, target });
    expect(s.phase).toBe('execInvestigateReveal');
    expect(s.pendingInvestigation?.party).toBe(s.seats[target]!.party);

    const presView = secretHitlerModule.viewFor(s, president);
    expect(presView.yourPendingInvestigationResult?.target).toBe(target);
    expect(presView.yourPendingInvestigationResult?.party).toBe(s.seats[target]!.party);

    const otherView = secretHitlerModule.viewFor(s, (president + 1) % 7);
    expect(otherView.yourPendingInvestigationResult).toBeNull();
    expect(otherView.yourInvestigations).toEqual([]);

    // After ack, the investigator still holds it in yourInvestigations.
    s = apply(s, { type: 'ackInvestigateReveal', bySeat: president });
    expect(s.phase).toBe('nomination');
    const presViewLater = secretHitlerModule.viewFor(s, president);
    expect(presViewLater.yourInvestigations).toHaveLength(1);
    expect(presViewLater.yourInvestigations[0]!.target).toBe(target);
  });

  it('investigation: Hitler shows up as Fascist (party only)', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(7)));
    const hitler = findSeat(s, 'hitler');
    const president = (hitler + 1) % s.seats.length;
    s = { ...s, phase: 'execInvestigate', presidentSeat: president, pendingExec: 'investigate' };
    s = apply(s, { type: 'execInvestigate', bySeat: president, target: hitler });
    expect(s.pendingInvestigation?.party).toBe('fascist');
  });

  it('investigation: cannot re-investigate the same seat', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(7)));
    const president = s.presidentSeat;
    const target = (president + 1) % s.seats.length;
    s = {
      ...s,
      phase: 'execInvestigate',
      pendingExec: 'investigate',
      seats: s.seats.map((seat, i) =>
        i === target ? { ...seat, hasBeenInvestigated: true } : seat,
      ),
    };
    expect(() =>
      apply(s, { type: 'execInvestigate', bySeat: president, target }),
    ).toThrow();
  });

  it('peek: only the peeking president sees the next 3 cards, deck is unchanged', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(5)));
    const deckBefore = s.policyDeck.slice();
    const president = s.presidentSeat;
    // Manually arrive at policyReveal with pendingExec=peekTop3.
    s = {
      ...s,
      phase: 'policyReveal',
      pendingExec: 'peekTop3',
      lastEnactedPolicy: 'fascist',
    };
    s = apply(s, { type: 'ackPolicyReveal', bySeat: president });
    expect(s.phase).toBe('execPeek');
    expect(s.pendingPeek?.by).toBe(president);
    expect(s.pendingPeek?.policies.length).toBe(3);
    // Deck content unchanged.
    expect(s.policyDeck.length).toBe(deckBefore.length);

    const presView = secretHitlerModule.viewFor(s, president);
    expect(presView.yourPeek?.length).toBe(3);
    const otherView = secretHitlerModule.viewFor(s, (president + 1) % 5);
    expect(otherView.yourPeek).toBeNull();
  });

  it('special election: chosen seat becomes president, rotation resumes after', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(7)));
    const originalPres = s.presidentSeat;
    const chosen = (originalPres + 3) % s.seats.length;
    s = { ...s, phase: 'execSpecialElection', pendingExec: 'specialElection' };
    s = apply(s, {
      type: 'execSpecialElection',
      bySeat: originalPres,
      nextPresident: chosen,
    });
    expect(s.presidentSeat).toBe(chosen);
    expect(s.inSpecialElection).toBe(true);
    // After a full successful round, presidency returns to the seat after
    // the original.
    const chancellor = (chosen + 1) % s.seats.length;
    s = apply(s, { type: 'nominateChancellor', bySeat: chosen, chancellor });
    for (let i = 0; i < 7; i++) {
      if (s.seats[i]!.alive) s = apply(s, { type: 'castVote', bySeat: i, vote: 'ja' });
    }
    s = apply(s, { type: 'ackElectionReveal', bySeat: 0 });
    // Force a known liberal enact to leave gameover off.
    s = { ...s, legislativeHand: ['liberal', 'liberal', 'liberal'] };
    s = apply(s, { type: 'presidentDiscard', bySeat: chosen, discardIndex: 0 });
    s = apply(s, { type: 'chancellorEnact', bySeat: chancellor, enactIndex: 0 });
    s = apply(s, { type: 'ackPolicyReveal', bySeat: 0 });
    expect(s.inSpecialElection).toBe(false);
    // Regular rotation should resume from originalPres + 1.
    expect(s.presidentSeat).toBe((originalPres + 1) % s.seats.length);
  });
});

describe('Secret Hitler — veto', () => {
  it('veto is locked until 5 fascist policies', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(5)));
    s = { ...s, phase: 'legislativeChancellor', legislativeHand: ['fascist', 'liberal'] };
    s = { ...s, chancellorCandidateSeat: (s.presidentSeat + 1) % s.seats.length };
    expect(() =>
      apply(s, { type: 'chancellorRequestVeto', bySeat: s.chancellorCandidateSeat! }),
    ).toThrow();
  });

  it('veto accepted: both cards discarded, election tracker bumps', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(5)));
    s = {
      ...s,
      board: { ...s.board, fascistEnacted: 5, vetoUnlocked: true },
      phase: 'legislativeChancellor',
      legislativeHand: ['fascist', 'fascist'],
      chancellorCandidateSeat: (s.presidentSeat + 1) % s.seats.length,
    };
    s = apply(s, { type: 'chancellorRequestVeto', bySeat: s.chancellorCandidateSeat! });
    expect(s.phase).toBe('vetoRequested');
    s = apply(s, { type: 'presidentRespondVeto', bySeat: s.presidentSeat, accept: true });
    expect(s.phase).toBe('nomination');
    expect(s.board.electionTracker).toBe(1);
    expect(s.legislativeHand.length).toBe(0);
  });

  it('veto rejected: phase returns to chancellor enact', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(5)));
    s = {
      ...s,
      board: { ...s.board, fascistEnacted: 5, vetoUnlocked: true },
      phase: 'legislativeChancellor',
      legislativeHand: ['fascist', 'fascist'],
      chancellorCandidateSeat: (s.presidentSeat + 1) % s.seats.length,
    };
    s = apply(s, { type: 'chancellorRequestVeto', bySeat: s.chancellorCandidateSeat! });
    s = apply(s, { type: 'presidentRespondVeto', bySeat: s.presidentSeat, accept: false });
    expect(s.phase).toBe('legislativeChancellor');
  });
});

describe('Secret Hitler — viewFor redaction', () => {
  it('private role only visible to its own seat', () => {
    const s = secretHitlerModule.createInitialState(configFor(5));
    for (let i = 0; i < s.seats.length; i++) {
      const view = secretHitlerModule.viewFor(s, i);
      expect(view.yourRole).toBe(s.seats[i]!.role);
      expect(view.yourParty).toBe(s.seats[i]!.party);
    }
  });

  it('public seats never expose role until game over', () => {
    const s = secretHitlerModule.createInitialState(configFor(5));
    const view = secretHitlerModule.viewFor(s, 0);
    for (const seat of view.seats) {
      expect(seat.revealedRole).toBeNull();
    }
  });

  it('roles revealed at game over for everyone', () => {
    let s = secretHitlerModule.createInitialState(configFor(5));
    s = { ...s, phase: 'gameOver', winnerTeam: 'liberal', winReason: 'liberalTrack' };
    const view = secretHitlerModule.viewFor(s, null);
    for (const seat of view.seats) {
      expect(seat.revealedRole).not.toBeNull();
    }
  });

  it('spectator view (seat=null) has no private info', () => {
    const s = secretHitlerModule.createInitialState(configFor(5));
    const view = secretHitlerModule.viewFor(s, null);
    expect(view.yourRole).toBeNull();
    expect(view.yourParty).toBeNull();
    expect(view.yourPartyKnowledge).toEqual([]);
    expect(view.yourLegislativeHand).toBeNull();
    expect(view.yourPeek).toBeNull();
  });
});

describe('Secret Hitler — term limits', () => {
  it('chancellor is always term-limited next round', () => {
    let s = ackAll(secretHitlerModule.createInitialState(configFor(7)));
    const presidentSeat = s.presidentSeat;
    const chancellor = (presidentSeat + 1) % s.seats.length;
    s = apply(s, { type: 'nominateChancellor', bySeat: presidentSeat, chancellor });
    for (let i = 0; i < 7; i++) s = apply(s, { type: 'castVote', bySeat: i, vote: 'ja' });
    s = apply(s, { type: 'ackElectionReveal', bySeat: 0 });
    s = { ...s, legislativeHand: ['liberal', 'liberal', 'liberal'] };
    s = apply(s, { type: 'presidentDiscard', bySeat: presidentSeat, discardIndex: 0 });
    s = apply(s, { type: 'chancellorEnact', bySeat: chancellor, enactIndex: 0 });
    s = apply(s, { type: 'ackPolicyReveal', bySeat: 0 });
    expect(s.phase).toBe('nomination');
    expect(s.lastElectedChancellor).toBe(chancellor);
    expect(() =>
      apply(s, { type: 'nominateChancellor', bySeat: s.presidentSeat, chancellor }),
    ).toThrow();
  });
});
