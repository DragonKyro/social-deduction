import { describe, expect, it } from 'vitest';
import { avalonModule } from './module';
import { ROLES } from './roles';
import type { AvalonPrivateState, AvalonPublicState, AvalonRoleId } from './state';
import { ackAll, apply, fullSpecials, newGame, selfPlay } from './test-utils';

// ============================================================================
// Redaction tests for `viewFor` — the hidden-info chokepoint.
// ============================================================================

const viewFor = avalonModule.viewFor;

const YOUR_KEYS = [
  'yourSeat',
  'yourRole',
  'yourAlignment',
  'yourRoleKnowledge',
  'yourVote',
  'yourQuestCard',
  'yourLadyOfTheLakeReveals',
] as const;

function publicPart(v: AvalonPublicState): Record<string, unknown> {
  const c: Record<string, unknown> = { ...v };
  for (const k of YOUR_KEYS) delete c[k];
  return c;
}

const ROLE_IDS = Object.keys(ROLES) as AvalonRoleId[];

/** Every redaction invariant, checked against one host state. */
function assertRedacted(s: AvalonPrivateState) {
  const spectator = viewFor(s, null);
  const pub = publicPart(spectator);
  const json = JSON.stringify(spectator);

  // Host-only fields never leave the host, in any phase.
  expect(json).not.toMatch(/"seed"|"role"|"alignment"|"questCard"|"roleKnowledge"|"setupAcked"|"privateReveals"/);

  // Spectator: nothing private, ever.
  expect(spectator.yourSeat).toBeNull();
  expect(spectator.yourRole).toBeNull();
  expect(spectator.yourAlignment).toBeNull();
  expect(spectator.yourRoleKnowledge).toEqual([]);
  expect(spectator.yourVote).toBeNull();
  expect(spectator.yourQuestCard).toBeNull();

  // `rolesInPlay` is the announced character list: a multiset in canonical
  // role order, so it can't be mapped onto seats.
  expect(spectator.rolesInPlay).toEqual(
    s.seats.map((x) => x.role).sort((a, b) => ROLE_IDS.indexOf(a) - ROLE_IDS.indexOf(b)),
  );

  if (s.phase !== 'gameOver') {
    // No role id or alignment word appears anywhere else in a public view.
    const rest = JSON.stringify({ ...spectator, rolesInPlay: undefined });
    for (const r of ROLE_IDS) expect(rest).not.toContain(`"${r}"`);
    expect(json).not.toMatch(/"good"|"evil"/);
    for (const seat of spectator.seats) {
      expect(seat.revealedRole).toBeNull();
      expect(seat.revealedAlignment).toBeNull();
    }
  }
  if (s.phase === 'teamVote') {
    expect(spectator.seats.every((x) => x.voteApprove === null)).toBe(true);
  }

  for (let i = 0; i < s.seats.length; i++) {
    const v = viewFor(s, i);
    // Everything outside the `your*` slots is identical for every seat and
    // the spectator — so no seat's view can carry another seat's secret.
    expect(publicPart(v)).toEqual(pub);
    // The `your*` slots hold exactly the viewer's own secrets.
    expect(v.yourSeat).toBe(i);
    expect(v.yourRole).toBe(s.seats[i]!.role);
    expect(v.yourAlignment).toBe(s.seats[i]!.alignment);
    expect(v.yourRoleKnowledge).toEqual(s.roleKnowledge[i]);
    expect(v.yourVote).toBe(s.seats[i]!.voteApprove);
    expect(v.yourQuestCard).toBe(s.seats[i]!.questCard);
  }
}

describe('Avalon — viewFor redaction', () => {
  it('holds every invariant at every step of full games (5–10p, several seeds)', () => {
    let checked = 0;
    for (let n = 5; n <= 10; n++) {
      for (const seed of [1, 7, 99]) {
        selfPlay(newGame(n, fullSpecials(n), seed * 1000 + n), (s) => {
          assertRedacted(s);
          checked++;
        });
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('rolesInPlay is identical across different deals of the same config', () => {
    const a = viewFor(newGame(8, ['percival', 'morgana', 'mordred'], 1), null).rolesInPlay;
    for (const seed of [2, 3, 4, 5]) {
      expect(viewFor(newGame(8, ['percival', 'morgana', 'mordred'], seed), null).rolesInPlay).toEqual(a);
    }
  });

  it('private role only visible to its own seat', () => {
    const s = newGame(5, ['percival', 'morgana']);
    for (let i = 0; i < s.seats.length; i++) {
      const view = viewFor(s, i);
      expect(view.yourRole).toBe(s.seats[i]!.role);
      expect(view.yourAlignment).toBe(s.seats[i]!.alignment);
    }
  });

  it('roles revealed at game over for everyone, spectators included', () => {
    const s = ackAll(newGame(5));
    const ended = { ...s, phase: 'gameOver' as const, winnerTeam: 'good' as const };
    const view = viewFor(ended, null);
    view.seats.forEach((seat, i) => {
      expect(seat.revealedRole).toBe(s.seats[i]!.role);
      expect(seat.revealedAlignment).toBe(s.seats[i]!.alignment);
    });
  });

  it('treats an out-of-range / non-integer seat as a spectator', () => {
    const s = newGame(5, ['percival', 'morgana']);
    for (const bad of [5, 99, -1, 1.5]) {
      const v = viewFor(s, bad);
      expect(v.yourSeat).toBeNull();
      expect(v.yourRole).toBeNull();
      expect(v.yourRoleKnowledge).toEqual([]);
    }
  });

  it('team votes are hidden until the last vote, then revealed together', () => {
    let s = ackAll(newGame(5, ['percival', 'morgana']));
    s = apply(s, { type: 'proposeTeam', bySeat: s.currentLeaderSeat, team: [0, 1] });
    const casts = [true, false, true, false];
    casts.forEach((approve, seat) => {
      s = apply(s, { type: 'castTeamVote', bySeat: seat, approve });
      const spectator = viewFor(s, null);
      expect(spectator.seats.every((x) => x.voteApprove === null)).toBe(true);
      // Who has voted is public; how is not.
      expect(spectator.seats.filter((x) => x.hasVoted).length).toBe(seat + 1);
      // You can see your own vote; nobody else's.
      expect(viewFor(s, seat).yourVote).toBe(approve);
      expect(viewFor(s, 4).seats[seat]!.voteApprove).toBeNull();
    });
    expect(viewFor(s, null).proposalHistory).toEqual([]);
    s = apply(s, { type: 'castTeamVote', bySeat: 4, approve: true });
    const revealed = viewFor(s, null);
    expect(revealed.phase).toBe('teamVoteReveal');
    expect(revealed.seats.map((x) => x.voteApprove)).toEqual([true, false, true, false, true]);
    expect(revealed.proposalHistory).toHaveLength(1);
    expect(revealed.proposalHistory[0]!.votes).toEqual([true, false, true, false, true]);
    expect(revealed.proposalHistory[0]!.approved).toBe(true);
  });

  it('quest cards are anonymous: views do not depend on WHO played the fail', () => {
    // Put both evils on the team, then compare "A fails, B succeeds" with
    // "A succeeds, B fails". Only the viewer's own card may differ.
    const base = ackAll(newGame(5, ['percival', 'morgana'], 1234));
    const evils = base.seats.filter((x) => x.alignment === 'evil').map((x) => x.index);
    const goodViewer = base.seats.find((x) => x.alignment === 'good')!.index;
    let s = apply(base, { type: 'proposeTeam', bySeat: base.currentLeaderSeat, team: evils });
    for (let i = 0; i < 5; i++) s = apply(s, { type: 'castTeamVote', bySeat: i, approve: true });
    s = apply(s, { type: 'ackTeamVoteReveal' });
    expect(s.phase).toBe('questExecution');

    const [a, b] = evils as [number, number];
    const halfA = apply(s, { type: 'playQuestCard', bySeat: a, success: false });
    const halfB = apply(s, { type: 'playQuestCard', bySeat: a, success: true });
    expect(viewFor(halfA, null)).toEqual(viewFor(halfB, null));
    expect(viewFor(halfA, goodViewer)).toEqual(viewFor(halfB, goodViewer));
    expect(viewFor(halfA, null).questCardsSubmitted).toBe(1);

    const doneA = apply(halfA, { type: 'playQuestCard', bySeat: b, success: true });
    const doneB = apply(halfB, { type: 'playQuestCard', bySeat: b, success: false });
    expect(doneA.phase).toBe('questResolution');
    expect(viewFor(doneA, null)).toEqual(viewFor(doneB, null));
    expect(viewFor(doneA, goodViewer)).toEqual(viewFor(doneB, goodViewer));
    expect(viewFor(doneA, null).questHistory[0]!.failCount).toBe(1);
    // ...and the evils' own views differ only in their own card.
    expect(viewFor(doneA, a).yourQuestCard).toBe(false);
    expect(viewFor(doneB, a).yourQuestCard).toBe(true);
  });

  it('quest card visible only to the playing seat', () => {
    let s = ackAll(newGame(5));
    s = apply(s, { type: 'proposeTeam', bySeat: s.currentLeaderSeat, team: [0, 1] });
    for (let i = 0; i < 5; i++) s = apply(s, { type: 'castTeamVote', bySeat: i, approve: true });
    s = apply(s, { type: 'ackTeamVoteReveal' });
    s = apply(s, { type: 'playQuestCard', bySeat: 0, success: true });
    expect(viewFor(s, 0).yourQuestCard).toBe(true);
    expect(viewFor(s, 2).yourQuestCard).toBeNull();
    expect(viewFor(s, 2).seats[0]!.hasPlayedQuestCard).toBe(true);
    expect(viewFor(s, 2).seats[1]!.hasPlayedQuestCard).toBe(false);
  });

  it('views are copies: mutating a view never touches host state', () => {
    let s = ackAll(newGame(5));
    s = apply(s, { type: 'proposeTeam', bySeat: s.currentLeaderSeat, team: [0, 1] });
    const v = viewFor(s, 0);
    v.proposedTeam.push(4);
    v.yourRoleKnowledge.push({ seat: 3, label: 'Evil' });
    expect(s.proposedTeam).toEqual([0, 1]);
    expect(viewFor(s, 0).yourRoleKnowledge).toEqual(s.roleKnowledge[0]);
  });
});
