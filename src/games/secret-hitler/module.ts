import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { ShAction } from './actions';
import { aiChooseAction } from './ai';
import {
  buildInitialDeck,
  dealRoles,
  drawOne,
  drawThree,
  makeSeats,
  pickStartingPresident,
  reshuffleIfLow,
} from './setup';
import {
  ELECTION_TRACKER_MAX,
  FASCIST_TRACK_LENGTH,
  HITLER_CHANCELLOR_THRESHOLD,
  LIBERAL_TRACK_LENGTH,
  VETO_THRESHOLD,
  alignmentCounts,
  fascistTrack,
} from './tracks';
import { isEligibleChancellor, phaseForPower } from './rules';
import { viewFor } from './view';
import type {
  ShExecutivePower,
  ShPolicy,
  ShPrivateState,
  ShPublicState,
  ShSeatState,
} from './state';

// ============================================================================
// Secret Hitler module
//
// Host-authoritative: the host holds the only complete state (deck order +
// every role) and produces a redacted public view per seat. The chokepoint
// is `viewFor` (view.ts) — every hidden field is cleared except for the
// viewing seat's own slot.
//
// Action authorisation: every action carries `bySeat`. Online, the network
// layer guarantees `bySeat` is the sender's real seat, so the reducer only
// has to check that this seat is the one the rules let act right now.
// ============================================================================

export interface ShSeatConfig {
  name: string;
  isAI: boolean;
}

export interface ShOptions {
  players: ShSeatConfig[];
  // Variant (popularised by secrethitler.io): at 6 players the game starts
  // with one Fascist policy already on the board, taken from the deck. The
  // first 6p slot has no power, so nothing triggers.
  rebalanced6p: boolean;
}

function getOptions(config: GameConfig): ShOptions {
  return config.gameOptions as unknown as ShOptions;
}

// === Helpers ===============================================================

function nextAlive(seats: ShSeatState[], from: SeatIndex): SeatIndex {
  const n = seats.length;
  for (let step = 1; step <= n; step++) {
    const idx = (from + step) % n;
    if (seats[idx]!.alive) return idx;
  }
  // No one alive — caller checks before using.
  return from;
}

function resetVotes(seats: ShSeatState[]): ShSeatState[] {
  return seats.map((s) => ({ ...s, voteCast: null }));
}

/** Throws unless `bySeat` is a real seat index. Returns the seat. */
function seatOf(state: ShPrivateState, bySeat: unknown): ShSeatState {
  if (typeof bySeat !== 'number' || !Number.isInteger(bySeat)) {
    throw new Error(`Invalid seat ${String(bySeat)}`);
  }
  const seat = state.seats[bySeat];
  if (!seat) throw new Error(`Invalid seat ${bySeat}`);
  return seat;
}

function requireIndex(value: unknown, max: number, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`Invalid ${what} ${String(value)}`);
  }
  return value;
}

/** A living seat other than the president — the target of every power. */
function powerTarget(state: ShPrivateState, target: unknown, what: string): ShSeatState {
  if (typeof target !== 'number' || !Number.isInteger(target)) {
    throw new Error(`Invalid ${what} target`);
  }
  const seat = state.seats[target];
  if (!seat || !seat.alive) throw new Error(`Invalid ${what} target`);
  if (target === state.presidentSeat) throw new Error(`Cannot ${what} yourself`);
  return seat;
}

function checkInstantWin(state: ShPrivateState): ShPrivateState {
  if (state.board.liberalEnacted >= LIBERAL_TRACK_LENGTH) {
    return {
      ...state,
      phase: 'gameOver',
      winnerTeam: 'liberal',
      winReason: 'liberalTrack',
      log: [...state.log, { kind: 'gameOver', winner: 'liberal', reason: 'liberalTrack' }],
    };
  }
  if (state.board.fascistEnacted >= FASCIST_TRACK_LENGTH) {
    return {
      ...state,
      phase: 'gameOver',
      winnerTeam: 'fascist',
      winReason: 'fascistTrack',
      log: [...state.log, { kind: 'gameOver', winner: 'fascist', reason: 'fascistTrack' }],
    };
  }
  return state;
}

// The executive power earned by the n-th fascist policy at this table size.
function powerForFascistSlot(
  playerCount: number,
  fascistEnacted: number,
): ShExecutivePower | null {
  if (fascistEnacted < 1) return null;
  return fascistTrack(playerCount)[fascistEnacted - 1] ?? null;
}

function advanceAfterExecOrPolicy(state: ShPrivateState): ShPrivateState {
  // After a policy reveal (or executive power resolves), advance the round:
  //   - rotate president to the next alive seat
  //   - after a special election, rotation resumes to the left of the
  //     president who CALLED it (the special president is one-shot)
  //   - reset vote tracking + chancellor candidate
  const nextPresident = state.inSpecialElection
    ? nextAlive(state.seats, state.regularRotationSeat)
    : nextAlive(state.seats, state.presidentSeat);

  return {
    ...state,
    phase: 'nomination',
    presidentSeat: nextPresident,
    regularRotationSeat: nextPresident,
    inSpecialElection: false,
    chancellorCandidateSeat: null,
    seats: resetVotes(state.seats),
    pendingExec: null,
    legislativeHand: [],
    vetoRefused: false,
    pendingInvestigation: null,
    pendingPeek: null,
    lastEnactedPolicy: null,
    lastEnactedViaTopDeck: false,
  };
}

// A failed election (or an accepted veto) advances the tracker. At the max
// the country is thrown into chaos: the top policy is enacted, powers are
// ignored, and term limits are forgotten.
function advanceTracker(state: ShPrivateState): ShPrivateState {
  const tracker = state.board.electionTracker + 1;
  if (tracker >= ELECTION_TRACKER_MAX) {
    const drawn = drawOne(state);
    return enactPolicy(
      {
        ...state,
        policyDeck: drawn.deck,
        policyDiscard: drawn.discard,
        reshuffleCount: drawn.reshuffleCount,
        legislativeHand: [],
        chancellorCandidateSeat: null, // chaos has no government
      },
      drawn.drawn,
      true,
    );
  }
  const next = nextAlive(state.seats, state.regularRotationSeat);
  return {
    ...state,
    board: { ...state.board, electionTracker: tracker },
    phase: 'nomination',
    presidentSeat: next,
    regularRotationSeat: next,
    inSpecialElection: false,
    chancellorCandidateSeat: null,
    legislativeHand: [],
    vetoRefused: false,
    seats: resetVotes(state.seats),
  };
}

// Enact a policy — updates the board, queues an executive power if
// appropriate, resets the election tracker, and reshuffles a low deck.
function enactPolicy(
  state: ShPrivateState,
  policy: ShPolicy,
  viaTopDeck: boolean,
): ShPrivateState {
  const liberalEnacted = state.board.liberalEnacted + (policy === 'liberal' ? 1 : 0);
  const fascistEnacted = state.board.fascistEnacted + (policy === 'fascist' ? 1 : 0);

  let next: ShPrivateState = reshuffleIfLow({
    ...state,
    board: {
      liberalEnacted,
      fascistEnacted,
      electionTracker: 0,
      vetoUnlocked: fascistEnacted >= VETO_THRESHOLD,
    },
    lastEnactedPolicy: policy,
    lastEnactedViaTopDeck: viaTopDeck,
    // Chaos: "existing term-limits are forgotten".
    lastElectedPresident: viaTopDeck ? null : state.lastElectedPresident,
    lastElectedChancellor: viaTopDeck ? null : state.lastElectedChancellor,
    log: [
      ...state.log,
      viaTopDeck
        ? { kind: 'topDeckEnacted', policy }
        : {
            kind: 'policyEnacted',
            policy,
            president: state.presidentSeat,
            chancellor: state.chancellorCandidateSeat ?? state.presidentSeat,
            viaTopDeck: false,
          },
    ],
  });

  next = checkInstantWin(next);
  if (next.phase === 'gameOver') return next;

  // Top-deck enacts do NOT trigger powers (rulebook).
  const power =
    policy === 'fascist' && !viaTopDeck
      ? powerForFascistSlot(state.seats.length, fascistEnacted)
      : null;
  return {
    ...next,
    // Show the enacted policy first; the power phase follows on ack.
    phase: viaTopDeck ? 'topDeckReveal' : 'policyReveal',
    pendingExec: power,
  };
}

// === Module ================================================================

export const secretHitlerModule: GameModule<ShPrivateState, ShPublicState, ShAction> = {
  id: 'secret-hitler',
  displayName: 'Secret Hitler',
  minPlayers: 5,
  maxPlayers: 10,

  createInitialState(config: GameConfig): ShPrivateState {
    const opts = getOptions(config);
    const players = opts.players ?? [];
    const playerCount = players.length;
    if (playerCount < this.minPlayers || playerCount > this.maxPlayers) {
      throw new Error(
        `Secret Hitler requires ${this.minPlayers}-${this.maxPlayers} players (got ${playerCount})`,
      );
    }
    const roles = dealRoles(playerCount, config.seed);
    const playerNames = players.map((p, i) => p.name?.trim() || `Player ${i + 1}`);
    const seats = makeSeats(
      playerNames,
      roles,
      players.map((p) => p.isAI === true),
    );
    // Party knowledge isn't stored — viewFor recomputes it from the roles.

    const startPresident = pickStartingPresident(playerCount, config.seed);

    const setupAcked: Record<SeatIndex, boolean> = {};
    for (let i = 0; i < playerCount; i++) setupAcked[i] = false;

    let policyDeck = buildInitialDeck(config.seed);
    let fascistEnacted = 0;
    if (opts.rebalanced6p === true && playerCount === 6) {
      const idx = policyDeck.indexOf('fascist');
      policyDeck = policyDeck.filter((_, i) => i !== idx);
      fascistEnacted = 1;
    }

    return {
      phase: 'setup',
      seats,
      setupAcked,
      board: {
        liberalEnacted: 0,
        fascistEnacted,
        electionTracker: 0,
        vetoUnlocked: false,
      },
      policyDeck,
      policyDiscard: [],
      presidentSeat: startPresident,
      regularRotationSeat: startPresident,
      inSpecialElection: false,
      chancellorCandidateSeat: null,
      lastElectedPresident: null,
      lastElectedChancellor: null,
      legislativeHand: [],
      vetoRefused: false,
      pendingExec: null,
      lastEnactedPolicy: null,
      lastEnactedViaTopDeck: false,
      pendingInvestigation: null,
      pendingPeek: null,
      investigations: [],
      seed: config.seed,
      reshuffleCount: 0,
      winnerTeam: null,
      winReason: null,
      log: [],
    };
  },

  applyAction(state: ShPrivateState, action: ShAction): ShPrivateState {
    if (state.phase === 'gameOver') throw new Error('The game is over');
    const actor = seatOf(state, action.bySeat);

    switch (action.type) {
      case 'ackRoleReveal': {
        if (state.phase !== 'setup') {
          throw new Error('ackRoleReveal only valid in setup phase');
        }
        const acked = { ...state.setupAcked, [actor.index]: true };
        const everyone = state.seats.every((s) => acked[s.index]);
        return { ...state, setupAcked: acked, phase: everyone ? 'nomination' : 'setup' };
      }

      case 'nominateChancellor': {
        if (state.phase !== 'nomination') {
          throw new Error('nominateChancellor only valid in nomination phase');
        }
        if (actor.index !== state.presidentSeat) {
          throw new Error('Only the current president can nominate a chancellor');
        }
        if (!isEligibleChancellor(state, action.chancellor)) {
          throw new Error(`Seat ${String(action.chancellor)} is not an eligible chancellor`);
        }
        return {
          ...state,
          chancellorCandidateSeat: action.chancellor,
          seats: resetVotes(state.seats),
          phase: 'electionVote',
        };
      }

      case 'castVote': {
        if (state.phase !== 'electionVote') {
          throw new Error('castVote only valid in electionVote phase');
        }
        if (action.vote !== 'ja' && action.vote !== 'nein') {
          throw new Error('Vote must be ja or nein');
        }
        if (!actor.alive) throw new Error(`Seat ${actor.index} is dead and cannot vote`);
        if (actor.voteCast !== null) throw new Error(`Seat ${actor.index} already voted`);
        const seats = state.seats.map((s) =>
          s.index === actor.index ? { ...s, voteCast: action.vote } : s,
        );
        const allVoted = seats.every((s) => !s.alive || s.voteCast !== null);
        return { ...state, seats, phase: allVoted ? 'electionReveal' : 'electionVote' };
      }

      case 'ackElectionReveal': {
        if (state.phase !== 'electionReveal') {
          throw new Error('ackElectionReveal only valid in electionReveal phase');
        }
        const chancellor = state.chancellorCandidateSeat;
        if (chancellor === null) throw new Error('No chancellor candidate');
        const jaCount = state.seats.filter((s) => s.alive && s.voteCast === 'ja').length;
        const neinCount = state.seats.filter((s) => s.alive && s.voteCast === 'nein').length;
        const approved = jaCount > neinCount; // ties reject
        const log = [
          ...state.log,
          {
            kind: 'electionResult' as const,
            president: state.presidentSeat,
            chancellor,
            approved,
            jaCount,
            neinCount,
            votes: state.seats.map((s) => (s.alive ? s.voteCast : null)),
          },
        ];

        if (!approved) return advanceTracker({ ...state, log });

        // Hitler elected chancellor once 3+ fascist policies are down.
        if (
          state.seats[chancellor]!.role === 'hitler' &&
          state.board.fascistEnacted >= HITLER_CHANCELLOR_THRESHOLD
        ) {
          return {
            ...state,
            phase: 'gameOver',
            winnerTeam: 'fascist',
            winReason: 'hitlerElected',
            log: [...log, { kind: 'gameOver', winner: 'fascist', reason: 'hitlerElected' }],
          };
        }
        // Government formed. Term limits attach to the ELECTED government
        // (so they still apply if it later vetoes). President draws 3.
        const drawn = drawThree(state);
        return {
          ...state,
          policyDeck: drawn.deck,
          policyDiscard: drawn.discard,
          reshuffleCount: drawn.reshuffleCount,
          legislativeHand: drawn.drawn,
          vetoRefused: false,
          lastElectedPresident: state.presidentSeat,
          lastElectedChancellor: chancellor,
          phase: 'legislativePresident',
          log,
        };
      }

      case 'presidentDiscard': {
        if (state.phase !== 'legislativePresident') {
          throw new Error('presidentDiscard only valid in legislativePresident phase');
        }
        if (actor.index !== state.presidentSeat) {
          throw new Error('Only the president can discard');
        }
        if (state.legislativeHand.length !== 3) {
          throw new Error('Legislative hand must have exactly 3 cards');
        }
        const idx = requireIndex(action.discardIndex, 2, 'discard index');
        return {
          ...state,
          policyDiscard: [...state.policyDiscard, state.legislativeHand[idx]!],
          legislativeHand: state.legislativeHand.filter((_, i) => i !== idx),
          phase: 'legislativeChancellor',
        };
      }

      case 'chancellorEnact': {
        if (state.phase !== 'legislativeChancellor') {
          throw new Error('chancellorEnact only valid in legislativeChancellor phase');
        }
        if (actor.index !== state.chancellorCandidateSeat) {
          throw new Error('Only the chancellor can enact');
        }
        if (state.legislativeHand.length !== 2) {
          throw new Error('Chancellor must choose from exactly 2 cards');
        }
        const idx = requireIndex(action.enactIndex, 1, 'enact index');
        const enacted = state.legislativeHand[idx]!;
        const discarded = state.legislativeHand[1 - idx]!;
        return enactPolicy(
          {
            ...state,
            legislativeHand: [],
            policyDiscard: [...state.policyDiscard, discarded],
          },
          enacted,
          false,
        );
      }

      case 'chancellorRequestVeto': {
        if (state.phase !== 'legislativeChancellor') {
          throw new Error('chancellorRequestVeto only valid in legislativeChancellor phase');
        }
        if (!state.board.vetoUnlocked) {
          throw new Error('Veto is not unlocked yet (need 5 fascist policies)');
        }
        if (actor.index !== state.chancellorCandidateSeat) {
          throw new Error('Only the chancellor can request a veto');
        }
        if (state.vetoRefused) {
          throw new Error('The president already refused a veto this session');
        }
        return { ...state, phase: 'vetoRequested' };
      }

      case 'presidentRespondVeto': {
        if (state.phase !== 'vetoRequested') {
          throw new Error('presidentRespondVeto only valid in vetoRequested phase');
        }
        if (actor.index !== state.presidentSeat) {
          throw new Error('Only the president can respond to a veto');
        }
        const chancellor = state.chancellorCandidateSeat ?? state.presidentSeat;
        if (action.accept !== true) {
          // Refused: the chancellor must enact, and can't ask again.
          return {
            ...state,
            phase: 'legislativeChancellor',
            vetoRefused: true,
            log: [
              ...state.log,
              { kind: 'vetoDenied', president: state.presidentSeat, chancellor },
            ],
          };
        }
        // Accepted: both policies are discarded and the tracker advances
        // ("each use of the veto represents an inactive government").
        const afterVeto = reshuffleIfLow({
          ...state,
          policyDiscard: [...state.policyDiscard, ...state.legislativeHand],
          legislativeHand: [],
          log: [
            ...state.log,
            { kind: 'vetoUsed' as const, president: state.presidentSeat, chancellor },
          ],
        });
        return advanceTracker(afterVeto);
      }

      case 'ackPolicyReveal': {
        if (state.phase !== 'policyReveal') {
          throw new Error('ackPolicyReveal only valid in policyReveal phase');
        }
        if (!state.pendingExec) return advanceAfterExecOrPolicy(state);
        const phase = phaseForPower(state.pendingExec);
        if (phase === 'execPeek') {
          // Snapshot the top 3 without consuming them.
          const peek = drawThree(state);
          return {
            ...state,
            phase,
            policyDeck: [...peek.drawn, ...peek.deck],
            policyDiscard: peek.discard,
            reshuffleCount: peek.reshuffleCount,
            pendingPeek: { by: state.presidentSeat, policies: peek.drawn.slice() },
            log: [...state.log, { kind: 'peek', by: state.presidentSeat }],
          };
        }
        return { ...state, phase };
      }

      case 'ackTopDeckReveal': {
        if (state.phase !== 'topDeckReveal') {
          throw new Error('ackTopDeckReveal only valid in topDeckReveal phase');
        }
        return advanceAfterExecOrPolicy(state);
      }

      case 'execInvestigate': {
        if (state.phase !== 'execInvestigate') {
          throw new Error('execInvestigate only valid in execInvestigate phase');
        }
        if (actor.index !== state.presidentSeat) {
          throw new Error('Only the president can investigate');
        }
        const target = powerTarget(state, action.target, 'investigate');
        if (target.hasBeenInvestigated) {
          throw new Error('That seat has already been investigated');
        }
        // Party membership only: Hitler reads as Fascist.
        const investigation = { by: actor.index, target: target.index, party: target.party };
        return {
          ...state,
          phase: 'execInvestigateReveal',
          seats: state.seats.map((s) =>
            s.index === target.index ? { ...s, hasBeenInvestigated: true } : s,
          ),
          pendingInvestigation: investigation,
          investigations: [...state.investigations, investigation],
          log: [
            ...state.log,
            { kind: 'investigation', by: actor.index, target: target.index },
          ],
        };
      }

      case 'ackInvestigateReveal': {
        if (state.phase !== 'execInvestigateReveal') {
          throw new Error('ackInvestigateReveal only valid in execInvestigateReveal phase');
        }
        if (actor.index !== state.presidentSeat) {
          throw new Error('Only the investigating president can ack');
        }
        return advanceAfterExecOrPolicy({ ...state, pendingInvestigation: null });
      }

      case 'execSpecialElection': {
        if (state.phase !== 'execSpecialElection') {
          throw new Error('execSpecialElection only valid in execSpecialElection phase');
        }
        if (actor.index !== state.presidentSeat) {
          throw new Error('Only the president can call a special election');
        }
        // Any other living player, even a term-limited one.
        const target = powerTarget(state, action.nextPresident, 'special-elect');
        // regularRotationSeat keeps pointing at the caller, so rotation
        // resumes to their left after the special round.
        return {
          ...state,
          phase: 'nomination',
          presidentSeat: target.index,
          inSpecialElection: true,
          chancellorCandidateSeat: null,
          seats: resetVotes(state.seats),
          pendingExec: null,
          lastEnactedPolicy: null,
          lastEnactedViaTopDeck: false,
          log: [
            ...state.log,
            { kind: 'specialElection', by: actor.index, nextPresident: target.index },
          ],
        };
      }

      case 'ackPeek': {
        if (state.phase !== 'execPeek') {
          throw new Error('ackPeek only valid in execPeek phase');
        }
        if (actor.index !== state.presidentSeat) {
          throw new Error('Only the peeking president can ack');
        }
        return advanceAfterExecOrPolicy({ ...state, pendingPeek: null });
      }

      case 'execExecute': {
        if (state.phase !== 'execExecute') {
          throw new Error('execExecute only valid in execExecute phase');
        }
        if (actor.index !== state.presidentSeat) {
          throw new Error('Only the president can execute');
        }
        const target = powerTarget(state, action.target, 'execute');
        const seats = state.seats.map((s) =>
          s.index === target.index ? { ...s, alive: false, voteCast: null } : s,
        );
        const log = [
          ...state.log,
          { kind: 'execution' as const, by: actor.index, target: target.index },
        ];
        if (target.role === 'hitler') {
          return {
            ...state,
            seats,
            phase: 'gameOver',
            winnerTeam: 'liberal',
            winReason: 'hitlerExecuted',
            log: [...log, { kind: 'gameOver', winner: 'liberal', reason: 'hitlerExecuted' }],
          };
        }
        // A non-Hitler execution reveals nothing else about the target.
        return advanceAfterExecOrPolicy({ ...state, seats, log });
      }
    }
    throw new Error(`Unknown action ${(action as { type?: unknown }).type as string}`);
  },

  viewFor,

  isFinished(state: ShPrivateState): boolean {
    return state.phase === 'gameOver';
  },

  defaultConfig(playerCount: number): GameConfig {
    const count = Math.max(this.minPlayers, Math.min(this.maxPlayers, playerCount));
    const options: ShOptions = {
      players: Array.from({ length: count }, (_, i) => ({
        name: `Player ${i + 1}`,
        isAI: false,
      })),
      rebalanced6p: false,
    };
    return {
      gameId: 'secret-hitler',
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: options as unknown as Record<string, unknown>,
    };
  },

  aiChooseAction,
};

// Re-exports useful for the UI.
export { alignmentCounts, fascistTrack, ELECTION_TRACKER_MAX };
