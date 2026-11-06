import type { SeatIndex } from '@/engine/types';
import { ROLES, isWerewolfCard } from './roles';
import type { OnuwPrivateState, OnuwSeatState, OnuwTeamId } from './state';

// ============================================================================
// Vote resolution + win conditions
//
// Votes (official rules):
//  - Every player votes for another player. The player(s) with the most
//    votes die; ties kill every tied player.
//  - If no player receives more than one vote, nobody dies
//    (`allowNoLynch === false` is a house variant: then the 1-vote tie dies).
//  - Hunter: if the Hunter dies, the player the Hunter voted for dies too
//    (chains, e.g. through a Doppel-Hunter).
//  - Prince (bonus): votes against the Prince don't count; the Prince can't
//    be killed by the Hunter either.
//  - Ricochet Rhino (bonus): every vote against the Rhino goes to the next
//    seat clockwise instead.
//
// Winning (official rules, using each card's EFFECTIVE role at dawn):
//  - Village wins if at least one werewolf dies, or if no player is a
//    werewolf and nobody dies.
//  - Werewolf team wins if at least one player is a werewolf and no
//    werewolf dies — unless a Tanner died. If no player is a werewolf, the
//    werewolf team (Minion, …) wins if someone dies, none of them died, and
//    no Tanner died.
//  - A Tanner wins if they die (and the village can win alongside them).
//  - Minion / Squire / Rhino are werewolf TEAM, not werewolves: their death
//    doesn't count as "a werewolf died".
//  - Cursed (bonus, house variant): a killed Cursed counts as a werewolf.
//  - Family Man (bonus): on the werewolf team if a werewolf sits next to him.
// ============================================================================

export interface VoteOutcome {
  tally: Record<SeatIndex, number>;
  killed: SeatIndex[];
}

export function tallyVotes(state: OnuwPrivateState): VoteOutcome {
  const seats = state.seats;
  const n = seats.length;
  const redirect = (t: SeatIndex) => (seats[t]!.finalRole === 'ricochetRhino' ? (t + 1) % n : t);
  const killable = (t: SeatIndex) => seats[t]!.finalRole !== 'prince';

  const tally: Record<SeatIndex, number> = {};
  for (let i = 0; i < n; i++) tally[i] = 0;
  for (const voter of seats) {
    if (voter.voteTarget === null) continue;
    const t = redirect(voter.voteTarget);
    if (!killable(t)) continue;
    tally[t] = (tally[t] ?? 0) + 1;
  }

  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, tally[i]!);
  let killed: SeatIndex[] = [];
  if (max >= 2 || (max === 1 && !state.allowNoLynch)) {
    killed = seats.filter((s) => tally[s.index] === max).map((s) => s.index);
  }

  // Hunter chain.
  const dead = new Set(killed);
  const queue = killed.slice();
  while (queue.length > 0) {
    const k = queue.shift()!;
    const s = seats[k]!;
    if (s.finalRole !== 'hunter' || s.voteTarget === null) continue;
    const t = redirect(s.voteTarget);
    if (!killable(t) || dead.has(t)) continue;
    dead.add(t);
    killed.push(t);
    queue.push(t);
  }
  return { tally, killed };
}

export function teamAtDawn(state: OnuwPrivateState, seat: OnuwSeatState, dead: ReadonlySet<SeatIndex>): OnuwTeamId {
  const role = seat.finalRole;
  if (role === 'cursed' && dead.has(seat.index)) return 'werewolves';
  if (role === 'familyMan') {
    const n = state.seats.length;
    const near = [(seat.index - 1 + n) % n, (seat.index + 1) % n];
    if (near.some((i) => isWerewolfCard(state.seats[i]!.finalRole))) return 'werewolves';
  }
  return ROLES[role].team;
}

export function determineWinners(
  state: OnuwPrivateState,
  killed: readonly SeatIndex[],
): { winners: SeatIndex[]; winningTeams: OnuwTeamId[] } {
  const dead = new Set(killed);
  const seats = state.seats;
  const wolvesInPlay = seats.some((s) => isWerewolfCard(s.finalRole));
  const wolfKilled = killed.some((i) => {
    const r = seats[i]!.finalRole;
    return isWerewolfCard(r) || r === 'cursed';
  });
  const tannerKilled = killed.some((i) => ROLES[seats[i]!.finalRole].team === 'tanner');

  const villageWins = wolfKilled || (!wolvesInPlay && killed.length === 0);
  const wolvesWin = wolvesInPlay
    ? !wolfKilled && !tannerKilled
    : killed.length > 0 &&
      !tannerKilled &&
      killed.every((i) => teamAtDawn(state, seats[i]!, dead) !== 'werewolves');

  const winners: SeatIndex[] = [];
  const teams = new Set<OnuwTeamId>();
  for (const s of seats) {
    const team = teamAtDawn(state, s, dead);
    const won = team === 'village' ? villageWins : team === 'werewolves' ? wolvesWin : dead.has(s.index);
    if (won) {
      winners.push(s.index);
      teams.add(team);
    }
  }
  const order: OnuwTeamId[] = ['village', 'werewolves', 'tanner'];
  return { winners, winningTeams: order.filter((t) => teams.has(t)) };
}

export function resolveVotes(state: OnuwPrivateState): OnuwPrivateState {
  const { tally, killed } = tallyVotes(state);
  const { winners, winningTeams } = determineWinners(state, killed);
  const dead = new Set(killed);
  return {
    ...state,
    seats: state.seats.map((s) => (dead.has(s.index) ? { ...s, killed: true } : s)),
    killedSeats: killed,
    voteTally: tally,
    winners,
    winningTeams,
    phase: 'resolution',
  };
}
