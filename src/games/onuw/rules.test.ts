import { describe, expect, it } from 'vitest';
import { onuwModule } from './module';
import { ackAll, act, awake, playNight, rig, voteAll } from './testkit';
import { viewFor, yourNightStep } from './view';

describe('ONUW — action validation', () => {
  it('rejects night actions during setup (a Doppelganger could act before the night began)', () => {
    const s = rig(['doppelganger', 'seer', 'werewolf'], ['villager', 'villager', 'robber']);
    expect(() => act(s, { type: 'doppelgangerCopy', bySeat: 0, targetSeat: 1 })).toThrow(/night/);
  });

  it('rejects acknowledging a role twice and unknown seats', () => {
    const s = rig(['seer', 'villager', 'werewolf'], ['villager', 'villager', 'robber']);
    const once = act(s, { type: 'ackRoleReveal', bySeat: 0 });
    expect(() => act(once, { type: 'ackRoleReveal', bySeat: 0 })).toThrow();
    expect(() => act(s, { type: 'ackRoleReveal', bySeat: 7 })).toThrow();
  });

  it("rejects acting in another role's step, and acting twice", () => {
    // seats: 0 werewolf+1 werewolf, 2 seer, 3 robber
    let s = ackAll(rig(['werewolf', 'werewolf', 'seer', 'robber'], ['villager', 'villager', 'villager']));
    // Werewolves are up; the Seer and Robber may not act yet.
    expect(() => act(s, { type: 'seerLookSeat', bySeat: 2, targetSeat: 0 })).toThrow();
    expect(() => act(s, { type: 'robberSwap', bySeat: 3, targetSeat: 0 })).toThrow();
    s = act(s, { type: 'nightAck', bySeat: 0 });
    expect(() => act(s, { type: 'nightAck', bySeat: 0 })).toThrow(/already acted/);
    s = act(s, { type: 'nightAck', bySeat: 1 });
    // Seer's turn: a non-seer seat can't use the Seer action.
    expect(() => act(s, { type: 'seerLookSeat', bySeat: 3, targetSeat: 0 })).toThrow();
    s = act(s, { type: 'seerLookSeat', bySeat: 2, targetSeat: 0 });
    expect(() => act(s, { type: 'seerLookSeat', bySeat: 2, targetSeat: 1 })).toThrow();
  });

  it('validates night targets (self, out of range, duplicates)', () => {
    let s = ackAll(rig(['seer', 'troublemaker', 'villager', 'villager'], ['werewolf', 'villager', 'robber']));
    // The lone werewolf step is empty (card in center), so the Seer is up.
    expect(awake(s)).toEqual([0]);
    expect(() => act(s, { type: 'seerLookSeat', bySeat: 0, targetSeat: 0 })).toThrow();
    expect(() => act(s, { type: 'seerLookSeat', bySeat: 0, targetSeat: 9 })).toThrow();
    expect(() => act(s, { type: 'seerLookCenter', bySeat: 0, centerIndices: [1, 1] })).toThrow();
    expect(() => act(s, { type: 'seerLookCenter', bySeat: 0, centerIndices: [0, 3] })).toThrow();
    s = act(s, { type: 'seerLookCenter', bySeat: 0, centerIndices: [0, 2] });
    // Robber step (center) is skipped silently; Troublemaker next.
    expect(awake(s)).toEqual([1]);
    expect(() => act(s, { type: 'troublemakerSwap', bySeat: 1, a: 1, b: 2 })).toThrow();
    expect(() => act(s, { type: 'troublemakerSwap', bySeat: 1, a: 2, b: 2 })).toThrow();
  });

  it('mandatory actions cannot be passed (Drunk must swap)', () => {
    const s = ackAll(rig(['drunk', 'villager', 'villager'], ['werewolf', 'werewolf', 'seer']));
    expect(awake(s)).toEqual([0]);
    expect(() => act(s, { type: 'nightAck', bySeat: 0 })).toThrow(/must act/);
    expect(act(s, { type: 'drunkSwap', bySeat: 0, centerIndex: 1 }).phase).toBe('day');
  });

  it('castVote rejects self-votes, bad targets and double votes', () => {
    let s = playNight(ackAll(rig(['werewolf', 'villager', 'villager'], ['villager', 'seer', 'robber'])));
    s = act(s, { type: 'startVote' });
    expect(() => act(s, { type: 'castVote', bySeat: 0, targetSeat: 0 })).toThrow();
    expect(() => act(s, { type: 'castVote', bySeat: 0, targetSeat: 5 })).toThrow();
    s = act(s, { type: 'castVote', bySeat: 0, targetSeat: 1 });
    expect(() => act(s, { type: 'castVote', bySeat: 0, targetSeat: 2 })).toThrow();
  });

  it('seatless controls are phase-guarded (startVote / resolveVotes / ackGameOver / startNight)', () => {
    const s = rig(['werewolf', 'villager', 'villager'], ['villager', 'seer', 'robber']);
    expect(() => act(s, { type: 'startVote' })).toThrow();
    expect(() => act(s, { type: 'resolveVotes' })).toThrow();
    expect(() => act(s, { type: 'ackGameOver' })).toThrow();
    expect(() => act(s, { type: 'startNight' })).toThrow();
    let d = playNight(ackAll(s));
    expect(() => act(d, { type: 'resolveVotes' })).toThrow();
    d = act(d, { type: 'startVote' });
    // Host override: count now with one ballot in.
    d = act(d, { type: 'castVote', bySeat: 1, targetSeat: 0 });
    const r = act(d, { type: 'resolveVotes' });
    expect(r.phase).toBe('resolution');
    expect(r.killedSeats).toEqual([]); // a single vote never kills
  });
});

describe('ONUW — Doppelganger timing', () => {
  it('Doppel-Troublemaker swaps immediately, before the Robber wakes', () => {
    // 0 doppel, 1 troublemaker, 2 robber, 3 villager
    let s = ackAll(rig(['doppelganger', 'troublemaker', 'robber', 'villager'], ['werewolf', 'seer', 'villager']));
    s = act(s, { type: 'doppelgangerCopy', bySeat: 0, targetSeat: 1 });
    // The Doppelganger is still awake, now as the Troublemaker.
    expect(awake(s)).toEqual([0]);
    expect(yourNightStep(s, 0)).toMatchObject({ role: 'troublemaker', asDoppelganger: true });
    s = act(s, { type: 'troublemakerSwap', bySeat: 0, a: 2, b: 3 });
    // The Robber (seat 2) now holds the Villager card; robbing seat 3 gets the Robber card.
    expect(awake(s)).toEqual([2]);
    s = act(s, { type: 'robberSwap', bySeat: 2, targetSeat: 3 });
    expect(s.seats[2]!.finalCard).toBe('robber');
  });

  it('Doppel-Werewolf wakes with the werewolves, and they see each other', () => {
    // 0 doppel, 1 werewolf, 2 villager
    let s = ackAll(rig(['doppelganger', 'werewolf', 'villager'], ['villager', 'seer', 'robber']));
    s = act(s, { type: 'doppelgangerCopy', bySeat: 0, targetSeat: 1 });
    expect(awake(s).sort()).toEqual([0, 1]);
    const wolfObs = s.seats[1]!.observations.at(-1)!;
    expect(wolfObs.entries.map((e) => e.position?.index)).toEqual([0]);
    expect(yourNightStep(s, 1)!.loneWolf).toBe(false);
    expect(s.seats[0]!.finalRole).toBe('werewolf');
    expect(s.seats[0]!.finalCard).toBe('doppelganger');
  });

  it('Doppel-Insomniac wakes after the Insomniac', () => {
    // 0 doppel, 1 insomniac, 2 troublemaker
    let s = ackAll(rig(['doppelganger', 'insomniac', 'troublemaker'], ['werewolf', 'villager', 'villager']));
    s = act(s, { type: 'doppelgangerCopy', bySeat: 0, targetSeat: 1 });
    expect(awake(s)).toEqual([2]); // troublemaker first
    s = act(s, { type: 'nightAck', bySeat: 2 });
    expect(awake(s)).toEqual([1]);
    s = act(s, { type: 'nightAck', bySeat: 1 });
    expect(awake(s)).toEqual([0]);
    expect(yourNightStep(s, 0)).toMatchObject({ role: 'insomniac', asDoppelganger: true });
    expect(s.seats[0]!.observations.at(-1)!.youBecome).toBe('doppelganger');
  });

  it('a Robber who steals the Doppelganger card sees "Doppelganger" but becomes the copied role', () => {
    // 0 doppel, 1 robber, 2 werewolf
    let s = ackAll(rig(['doppelganger', 'robber', 'werewolf'], ['villager', 'villager', 'seer']));
    s = act(s, { type: 'doppelgangerCopy', bySeat: 0, targetSeat: 2 }); // Doppel-Werewolf
    s = act(s, { type: 'nightAck', bySeat: 0 });
    s = act(s, { type: 'nightAck', bySeat: 2 });
    s = act(s, { type: 'robberSwap', bySeat: 1, targetSeat: 0 });
    expect(s.seats[1]!.finalCard).toBe('doppelganger');
    expect(s.seats[1]!.finalRole).toBe('werewolf');
    expect(s.seats[1]!.observations.at(-1)!.entries[0]!.role).toBe('doppelganger');
  });
});

describe('ONUW — role details', () => {
  it('Paranormal Investigator gets two looks even with an earlier observation (old count bug)', () => {
    // Doppel copies PI: it already has one observation before its first look.
    let s = ackAll(rig(['doppelganger', 'paranormalInvestigator', 'villager', 'seer'], ['werewolf', 'villager', 'robber']));
    s = act(s, { type: 'doppelgangerCopy', bySeat: 0, targetSeat: 1 });
    s = act(s, { type: 'paranormalLook', bySeat: 0, targetSeat: 2 });
    // Still awake for a second look.
    expect(yourNightStep(s, 0)).toMatchObject({ role: 'paranormalInvestigator', looked: [2] });
    expect(() => act(s, { type: 'paranormalLook', bySeat: 0, targetSeat: 2 })).toThrow();
    s = act(s, { type: 'paranormalLook', bySeat: 0, targetSeat: 3 });
    expect(yourNightStep(s, 0)).toBeNull();
  });

  it('Paranormal Investigator stops and converts on a werewolf card', () => {
    let s = ackAll(rig(['paranormalInvestigator', 'werewolf', 'villager'], ['villager', 'seer', 'robber']));
    s = act(s, { type: 'nightAck', bySeat: 1 });
    s = act(s, { type: 'paranormalLook', bySeat: 0, targetSeat: 1 });
    expect(yourNightStep(s, 0)).toBeNull();
    expect(s.seats[0]!.finalRole).toBe('werewolf');
    expect(s.seats[0]!.finalCard).toBe('paranormalInvestigator');
  });

  it("The Thing's tapped neighbor is told (it was flavor-only before)", () => {
    let s = ackAll(rig(['thing', 'villager', 'villager'], ['werewolf', 'seer', 'robber']));
    s = act(s, { type: 'thingTap', bySeat: 0, targetSeat: 1 });
    expect(viewFor(s, 1).yourObservations.at(-1)!.text).toMatch(/P1 is The Thing/);
    expect(viewFor(s, 2).yourObservations).toEqual([]);
    expect(() => act(ackAll(rig(['thing', 'villager', 'villager', 'villager'], ['werewolf', 'seer', 'robber'])), { type: 'thingTap', bySeat: 0, targetSeat: 2 })).toThrow(/neighbor/);
  });

  it('Revealer flips a village card face-up publicly — from daybreak, not during the night', () => {
    let s = ackAll(rig(['revealer', 'seer', 'insomniac', 'villager'], ['werewolf', 'villager', 'robber']));
    s = act(s, { type: 'nightAck', bySeat: 1 }); // seer passes
    s = act(s, { type: 'nightAck', bySeat: 2 }); // insomniac
    s = act(s, { type: 'revealerFlip', bySeat: 0, targetSeat: 1 });
    expect(s.phase).toBe('day');
    expect(viewFor(s, 3).seats[1]!.flippedCard).toBe('seer');
    expect(viewFor(s, null).seats[1]!.flippedCard).toBe('seer');
  });

  it('Revealer leaves a werewolf card face-down', () => {
    let s = ackAll(rig(['revealer', 'werewolf', 'villager'], ['werewolf', 'villager', 'robber']));
    s = act(s, { type: 'loneWolfSkip', bySeat: 1 });
    s = act(s, { type: 'revealerFlip', bySeat: 0, targetSeat: 1 });
    expect(viewFor(s, null).seats.every((x) => x.flippedCard === null)).toBe(true);
  });

  it('lone-wolf peek: allowed alone, refused with a partner, and a Dream Wolf counts as a partner', () => {
    let s = ackAll(rig(['werewolf', 'villager', 'villager'], ['werewolf', 'villager', 'robber']));
    expect(yourNightStep(s, 0)!.loneWolf).toBe(true);
    s = act(s, { type: 'loneWolfPeekCenter', bySeat: 0, centerIndex: 2 });
    expect(s.seats[0]!.observations.at(-1)!.entries[0]!.role).toBe('robber');

    const pair = ackAll(rig(['werewolf', 'werewolf', 'villager'], ['villager', 'villager', 'robber']));
    expect(() => act(pair, { type: 'loneWolfPeekCenter', bySeat: 0, centerIndex: 0 })).toThrow();

    const dream = ackAll(rig(['werewolf', 'dreamWolf', 'villager'], ['villager', 'villager', 'robber']));
    expect(yourNightStep(dream, 0)!.loneWolf).toBe(false);
    expect(dream.seats[0]!.observations[0]!.entries.map((e) => e.position?.index)).toEqual([1]);
    expect(() => act(dream, { type: 'loneWolfPeekCenter', bySeat: 0, centerIndex: 0 })).toThrow();
  });

  it('Alpha Wolf must convert a non-werewolf, and the displaced card goes to the alpha slot', () => {
    let s = ackAll(rig(['alphaWolf', 'werewolf', 'seer', 'villager'], ['villager', 'villager', 'robber']));
    s = act(s, { type: 'nightAck', bySeat: 0 });
    s = act(s, { type: 'nightAck', bySeat: 1 });
    expect(awake(s)).toEqual([0]);
    expect(() => act(s, { type: 'nightAck', bySeat: 0 })).toThrow(/must act/);
    expect(() => act(s, { type: 'alphaWolfConvert', bySeat: 0, targetSeat: 1 })).toThrow(/non-werewolf/);
    s = act(s, { type: 'alphaWolfConvert', bySeat: 0, targetSeat: 3 });
    expect(s.seats[3]!.finalRole).toBe('werewolf');
    expect(s.alphaCenter).toEqual([{ role: 'villager', card: 'villager' }]);
    // The converted player is not told.
    expect(s.seats[3]!.observations).toEqual([]);
  });

  it('Witch looks first, then must hand out that same card (she used to choose a target blind)', () => {
    // 0 witch, 1 villager, 2 villager
    let s = ackAll(rig(['witch', 'villager', 'villager'], ['werewolf', 'tanner', 'robber']));
    expect(awake(s)).toEqual([0]);
    s = act(s, { type: 'witchLook', bySeat: 0, centerIndex: 1 });
    expect(viewFor(s, 0).yourObservations.at(-1)!.entries[0]!.role).toBe('tanner');
    expect(yourNightStep(s, 0)).toMatchObject({ centerPeeked: 1, canPass: false });
    expect(() => act(s, { type: 'witchSkip', bySeat: 0 })).toThrow(/must act/);
    expect(() => act(s, { type: 'witchLook', bySeat: 0, centerIndex: 2 })).toThrow();
    expect(() => act(s, { type: 'witchSwap', bySeat: 0, centerIndex: 2, targetSeat: 1 })).toThrow(/looked at/);
    s = act(s, { type: 'witchSwap', bySeat: 0, centerIndex: 1, targetSeat: 2 });
    expect(s.seats[2]!.finalRole).toBe('tanner');
    expect(s.centerCards[1]!.card).toBe('villager');
    // The target isn't told.
    expect(s.seats[2]!.observations).toEqual([]);
  });

  it('Minion sees the werewolves; werewolves do not see the Minion', () => {
    const s = ackAll(rig(['werewolf', 'minion', 'villager'], ['werewolf', 'villager', 'robber']));
    expect(s.seats[0]!.observations[0]!.entries).toEqual([]);
    const m = act(s, { type: 'nightAck', bySeat: 0 });
    expect(m.seats[1]!.observations[0]!.entries.map((e) => e.position?.index)).toEqual([0]);
  });
});

describe('ONUW — win conditions', () => {
  const night = (seats: Parameters<typeof rig>[0], center: Parameters<typeof rig>[1]) =>
    playNight(ackAll(rig(seats, center)));

  it('killing the Minion is not a werewolf death — werewolves win', () => {
    // 0 werewolf, 1 minion, 2 villager, 3 villager
    const s = voteAll(night(['werewolf', 'minion', 'villager', 'villager'], ['villager', 'seer', 'robber']), [1, 2, 1, 1]);
    expect(s.killedSeats).toEqual([1]);
    expect(s.winningTeams).toEqual(['werewolves']);
    expect(s.winners).toEqual([0, 1]);
  });

  it('Tanner and a werewolf both die → Tanner AND village win', () => {
    // 0 tanner, 1 werewolf, 2 villager, 3 villager
    const s = voteAll(night(['tanner', 'werewolf', 'villager', 'villager'], ['villager', 'seer', 'robber']), [1, 0, 0, 1]);
    expect(s.killedSeats.sort()).toEqual([0, 1]);
    expect(s.winningTeams).toEqual(['village', 'tanner']);
    expect(s.winners).toEqual([0, 2, 3]);
  });

  it('Tanner dies, no werewolf dies → werewolves do NOT win', () => {
    const s = voteAll(night(['tanner', 'werewolf', 'villager', 'villager'], ['villager', 'seer', 'robber']), [1, 0, 0, 0]);
    expect(s.winningTeams).toEqual(['tanner']);
  });

  it('no werewolves in play and nobody dies → village wins', () => {
    const s = voteAll(night(['villager', 'seer', 'robber'], ['werewolf', 'werewolf', 'villager']), [1, 2, 0]);
    expect(s.killedSeats).toEqual([]);
    expect(s.winningTeams).toEqual(['village']);
  });

  it('no werewolves in play, a villager dies → Minion wins, village loses (old code gave it to "werewolves" even with no Minion)', () => {
    const m = voteAll(night(['minion', 'villager', 'villager'], ['werewolf', 'werewolf', 'seer']), [1, 0, 1]);
    expect(m.killedSeats).toEqual([1]);
    expect(m.winningTeams).toEqual(['werewolves']);
    expect(m.winners).toEqual([0]);

    const none = voteAll(night(['villager', 'villager', 'seer'], ['werewolf', 'werewolf', 'minion']), [1, 0, 1]);
    expect(none.killedSeats).toEqual([1]);
    expect(none.winningTeams).toEqual([]);
    expect(none.winners).toEqual([]);
  });

  it('Hunter takes their vote target with them', () => {
    // 0 hunter, 1 werewolf, 2 villager, 3 villager — hunter voted the wolf.
    const s = voteAll(night(['hunter', 'werewolf', 'villager', 'villager'], ['villager', 'seer', 'robber']), [1, 0, 0, 0]);
    expect(s.killedSeats).toEqual([0, 1]);
    expect(s.winningTeams).toEqual(['village']);
  });

  it('votes against the Prince do not count, but the ballots stay on record', () => {
    // 0 prince, 1 werewolf, 2 villager, 3 villager
    const s = voteAll(night(['prince', 'werewolf', 'villager', 'villager'], ['villager', 'seer', 'robber']), [1, 0, 0, 1]);
    expect(s.killedSeats).toEqual([1]);
    expect(s.voteTally[0]).toBe(0);
    expect(s.seats[2]!.voteTarget).toBe(0);
  });

  it('a 3+ way tie of single votes kills nobody', () => {
    const s = voteAll(night(['werewolf', 'villager', 'villager'], ['villager', 'seer', 'robber']), [1, 2, 0]);
    expect(s.killedSeats).toEqual([]);
    expect(s.winningTeams).toEqual(['werewolves']);
  });

  it('ties at the top kill every tied player', () => {
    const s = voteAll(night(['werewolf', 'villager', 'villager', 'villager'], ['villager', 'seer', 'robber']), [1, 0, 0, 1]);
    expect(s.killedSeats.sort()).toEqual([0, 1]);
    expect(s.winningTeams).toEqual(['village']);
  });

  it('uses the card at the END of the night (Robber who stole a werewolf is a werewolf)', () => {
    // 0 robber, 1 werewolf, 2 villager
    let s = ackAll(rig(['robber', 'werewolf', 'villager'], ['villager', 'seer', 'minion']));
    s = act(s, { type: 'nightAck', bySeat: 1 });
    s = act(s, { type: 'robberSwap', bySeat: 0, targetSeat: 1 });
    s = voteAll(s, [2, 0, 0]);
    expect(s.killedSeats).toEqual([0]);
    expect(s.winningTeams).toEqual(['village']);
    expect(s.winners).toEqual([1, 2]);
    expect(onuwModule.isFinished(act(s, { type: 'ackGameOver' }))).toBe(true);
  });
});
