import type { GameConfig, GameModule, SeatIndex } from '@/engine/types';
import type { ShAction } from './actions';
import { aiChooseAction } from './ai';
import {
  buildInitialDeck,
  buildPartyKnowledge,
  dealRoles,
  drawOne,
  drawThree,
  makeSeats,
  pickStartingPresident,
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
import type {
  ShPhase,
  ShPolicy,
  ShPrivateState,
  ShPublicSeatState,
  ShPublicState,
  ShSeatState,
} from './state';

// ============================================================================
// Secret Hitler module
//
// Host-authoritative: the host holds the only complete state (deck order +
// every role) and produces a redacted public view per seat. The chokepoint
// is `viewFor` — every hidden field MUST be cleared except for the viewing
// seat's own slot.
// ============================================================================

export interface ShSeatConfig {
  name: string;
  isAI: boolean;
}

export interface ShOptions {
  players: ShSeatConfig[];
  rebalanced6p: boolean; // reserved for a future variant; unused in base
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

function aliveCount(seats: ShSeatState[]): number {
  return seats.filter((s) => s.alive).length;
}

function resetVotes(seats: ShSeatState[]): ShSeatState[] {
  return seats.map((s) => ({ ...s, voteCast: null }));
}

function termLimitedSeats(state: ShPrivateState): Set<SeatIndex> {
  // Rulebook: last elected chancellor is always term-limited. Last elected
  // president is term-limited too — UNLESS only 5 players remain alive
  // (in which case only the chancellor is term-limited).
  const out = new Set<SeatIndex>();
  if (state.lastElectedChancellor !== null) out.add(state.lastElectedChancellor);
  if (aliveCount(state.seats) > 5 && state.lastElectedPresident !== null) {
    out.add(state.lastElectedPresident);
  }
  return out;
}

function isEligibleChancellor(state: ShPrivateState, target: SeatIndex): boolean {
  if (target === state.presidentSeat) return false;
  const seat = state.seats[target];
  if (!seat || !seat.alive) return false;
  if (termLimitedSeats(state).has(target)) return false;
  return true;
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

// Resolve the executive power earned by enacting a fascist policy in this
// player count. If no power is awarded, returns null.
function powerForFascistSlot(playerCount: number, fascistEnacted: number): ShPhase | null {
  if (fascistEnacted < 1) return null;
  const track = fascistTrack(playerCount);
  const power = track[fascistEnacted - 1] ?? null;
  if (!power) return null;
  switch (power) {
    case 'investigate':
      return 'execInvestigate';
    case 'specialElection':
      return 'execSpecialElection';
    case 'peekTop3':
      return 'execPeek';
    case 'execute':
      return 'execExecute';
  }
}

function advanceAfterExecOrPolicy(state: ShPrivateState): ShPrivateState {
  // After a policy reveal (or executive power resolves), advance the round:
  //   - rotate president to the next alive seat
  //   - if we were in a special election, return to the regular rotation seat
  //     (the special-election president is one-shot)
  //   - reset vote tracking + chancellor candidate
  let nextPresident: SeatIndex;
  if (state.inSpecialElection) {
    // After a special election round, regular rotation resumes from the
    // seat AFTER `regularRotationSeat`.
    nextPresident = nextAlive(state.seats, state.regularRotationSeat);
  } else {
    nextPresident = nextAlive(state.seats, state.presidentSeat);
  }

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
    pendingInvestigation: null,
    pendingPeek: null,
    lastEnactedPolicy: null,
    lastEnactedViaTopDeck: false,
  };
}

// Enact a policy at slot `policy` — updates the board, queues an executive
// power if appropriate, and resets the election tracker.
function enactPolicy(
  state: ShPrivateState,
  policy: ShPolicy,
  viaTopDeck: boolean,
): ShPrivateState {
  const liberalEnacted = state.board.liberalEnacted + (policy === 'liberal' ? 1 : 0);
  const fascistEnacted = state.board.fascistEnacted + (policy === 'fascist' ? 1 : 0);
  const vetoUnlocked = fascistEnacted >= VETO_THRESHOLD;

  // After a top-deck enact, term limits are temporarily lifted per rulebook.
  // We model this by clearing the last-elected fields on a top-deck enact.
  const lastElectedPresident = viaTopDeck ? null : state.lastElectedPresident;
  const lastElectedChancellor = viaTopDeck ? null : state.lastElectedChancellor;

  let next: ShPrivateState = {
    ...state,
    board: {
      liberalEnacted,
      fascistEnacted,
      electionTracker: 0,
      vetoUnlocked,
    },
    lastEnactedPolicy: policy,
    lastEnactedViaTopDeck: viaTopDeck,
    lastElectedPresident,
    lastElectedChancellor,
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
  };

  // Liberal track win.
  next = checkInstantWin(next);
  if (next.phase === 'gameOver') return next;

  // Queue an exec power if a fascist policy was just enacted (top-deck
  // enacts do NOT trigger powers — rulebook).
  if (policy === 'fascist' && !viaTopDeck) {
    const execPhase = powerForFascistSlot(state.seats.length, fascistEnacted);
    if (execPhase) {
      return {
        ...next,
        // Use a transient "policyReveal" phase first so the UI can show the
        // enacted policy; on ack, jump into the exec phase.
        phase: 'policyReveal',
        pendingExec:
          execPhase === 'execInvestigate'
            ? 'investigate'
            : execPhase === 'execSpecialElection'
              ? 'specialElection'
              : execPhase === 'execPeek'
                ? 'peekTop3'
                : 'execute',
      };
    }
  }

  // Top-deck enacts use a dedicated reveal phase; otherwise a regular reveal.
  return { ...next, phase: viaTopDeck ? 'topDeckReveal' : 'policyReveal' };
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
    const seats = makeSeats(playerNames, roles);
    // partyKnowledge isn't stored — it's recomputed in viewFor since it
    // never mutates (cheap and avoids accidentally over-serialising).
    void buildPartyKnowledge(seats);

    const startPresident = pickStartingPresident(playerCount, config.seed);

    const setupAcked: Record<SeatIndex, boolean> = {};
    for (let i = 0; i < playerCount; i++) setupAcked[i] = false;

    return {
      phase: 'setup',
      seats,
      setupAcked,
      board: {
        liberalEnacted: 0,
        fascistEnacted: 0,
        electionTracker: 0,
        vetoUnlocked: false,
      },
      policyDeck: buildInitialDeck(config.seed),
      policyDiscard: [],
      presidentSeat: startPresident,
      regularRotationSeat: startPresident,
      inSpecialElection: false,
      chancellorCandidateSeat: null,
      lastElectedPresident: null,
      lastElectedChancellor: null,
      legislativeHand: [],
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
    switch (action.type) {
      case 'ackRoleReveal': {
        if (state.phase !== 'setup') {
          throw new Error('ackRoleReveal only valid in setup phase');
        }
        if (action.bySeat < 0 || action.bySeat >= state.seats.length) {
          throw new Error(`Invalid seat ${action.bySeat}`);
        }
        const acked = { ...state.setupAcked, [action.bySeat]: true };
        const everyone = state.seats.every((s) => acked[s.index]);
        return { ...state, setupAcked: acked, phase: everyone ? 'nomination' : 'setup' };
      }

      case 'nominateChancellor': {
        if (state.phase !== 'nomination') {
          throw new Error('nominateChancellor only valid in nomination phase');
        }
        if (action.bySeat !== state.presidentSeat) {
          throw new Error('Only the current president can nominate a chancellor');
        }
        if (!isEligibleChancellor(state, action.chancellor)) {
          throw new Error(`Seat ${action.chancellor} is not an eligible chancellor`);
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
        const seat = state.seats[action.bySeat];
        if (!seat || !seat.alive) {
          throw new Error(`Seat ${action.bySeat} cannot vote`);
        }
        if (seat.voteCast !== null) {
          throw new Error(`Seat ${action.bySeat} already voted`);
        }
        const seats = state.seats.map((s, i) =>
          i === action.bySeat ? { ...s, voteCast: action.vote } : s,
        );
        const allVoted = seats.every((s) => !s.alive || s.voteCast !== null);
        if (!allVoted) return { ...state, seats };
        return { ...state, seats, phase: 'electionReveal' };
      }

      case 'ackElectionReveal': {
        if (state.phase !== 'electionReveal') {
          throw new Error('ackElectionReveal only valid in electionReveal phase');
        }
        const jaCount = state.seats.filter((s) => s.alive && s.voteCast === 'ja').length;
        const neinCount = state.seats.filter((s) => s.alive && s.voteCast === 'nein').length;
        const approved = jaCount > neinCount; // ties reject
        const chancellor = state.chancellorCandidateSeat;
        const log = [
          ...state.log,
          {
            kind: 'electionResult' as const,
            president: state.presidentSeat,
            chancellor: chancellor ?? state.presidentSeat,
            approved,
            jaCount,
            neinCount,
          },
        ];

        if (approved) {
          // Hitler-elected loss check: at >= 3 fascist policies enacted, electing
          // Hitler as chancellor is an instant fascist win.
          if (
            chancellor !== null &&
            state.seats[chancellor]!.role === 'hitler' &&
            state.board.fascistEnacted >= HITLER_CHANCELLOR_THRESHOLD
          ) {
            return {
              ...state,
              phase: 'gameOver',
              winnerTeam: 'fascist',
              winReason: 'hitlerElected',
              chancellorCandidateSeat: chancellor,
              log: [...log, { kind: 'gameOver', winner: 'fascist', reason: 'hitlerElected' }],
            };
          }
          // Government formed → president draws 3.
          const drawn = drawThree(state);
          return {
            ...state,
            policyDeck: drawn.deck,
            policyDiscard: drawn.discard,
            reshuffleCount: drawn.reshuffleCount,
            legislativeHand: drawn.drawn,
            phase: 'legislativePresident',
            log,
          };
        }

        // Rejection — bump tracker; if it hits max, top-deck force enact.
        const tracker = state.board.electionTracker + 1;
        if (tracker >= ELECTION_TRACKER_MAX) {
          const drawn = drawOne(state);
          // Force-enact the drawn card. enactPolicy() will reset the tracker,
          // clear term limits, and route into 'topDeckReveal' (or directly to
          // gameOver if it crosses a track threshold).
          const enacted = enactPolicy(
            {
              ...state,
              policyDeck: drawn.deck,
              policyDiscard: drawn.discard,
              reshuffleCount: drawn.reshuffleCount,
              chancellorCandidateSeat: null, // top-deck has no chancellor
              log,
            },
            drawn.drawn,
            true,
          );
          // Crucially, top-deck enacts do NOT trigger exec powers; enactPolicy
          // already handles that via the viaTopDeck argument.
          return enacted;
        }
        // Tracker advanced but not exhausted — leader rotates.
        const next = nextAlive(state.seats, state.regularRotationSeat);
        return {
          ...state,
          board: { ...state.board, electionTracker: tracker },
          phase: 'nomination',
          presidentSeat: next,
          regularRotationSeat: next,
          inSpecialElection: false,
          chancellorCandidateSeat: null,
          seats: resetVotes(state.seats),
          log,
        };
      }

      case 'presidentDiscard': {
        if (state.phase !== 'legislativePresident') {
          throw new Error('presidentDiscard only valid in legislativePresident phase');
        }
        if (action.bySeat !== state.presidentSeat) {
          throw new Error('Only the president can discard');
        }
        if (state.legislativeHand.length !== 3) {
          throw new Error('Legislative hand must have exactly 3 cards');
        }
        const idx = action.discardIndex;
        if (idx < 0 || idx > 2) throw new Error('Invalid discard index');
        const remaining = state.legislativeHand.filter((_, i) => i !== idx);
        const discarded = state.legislativeHand[idx]!;
        return {
          ...state,
          policyDiscard: [...state.policyDiscard, discarded],
          legislativeHand: remaining,
          phase: 'legislativeChancellor',
        };
      }

      case 'chancellorEnact': {
        if (state.phase !== 'legislativeChancellor') {
          throw new Error('chancellorEnact only valid in legislativeChancellor phase');
        }
        if (action.bySeat !== state.chancellorCandidateSeat) {
          throw new Error('Only the chancellor can enact');
        }
        if (state.legislativeHand.length !== 2) {
          throw new Error('Chancellor must choose from exactly 2 cards');
        }
        const idx = action.enactIndex;
        if (idx < 0 || idx > 1) throw new Error('Invalid enact index');
        const enacted = state.legislativeHand[idx]!;
        const discarded = state.legislativeHand[1 - idx]!;

        // Government is now successful → set term-limit history.
        const next = enactPolicy(
          {
            ...state,
            legislativeHand: [],
            policyDiscard: [...state.policyDiscard, discarded],
            lastElectedPresident: state.presidentSeat,
            lastElectedChancellor: state.chancellorCandidateSeat,
          },
          enacted,
          false,
        );
        return next;
      }

      case 'chancellorRequestVeto': {
        if (state.phase !== 'legislativeChancellor') {
          throw new Error('chancellorRequestVeto only valid in legislativeChancellor phase');
        }
        if (!state.board.vetoUnlocked) {
          throw new Error('Veto is not unlocked yet (need 5 fascist policies)');
        }
        if (action.bySeat !== state.chancellorCandidateSeat) {
          throw new Error('Only the chancellor can request a veto');
        }
        return { ...state, phase: 'vetoRequested' };
      }

      case 'presidentRespondVeto': {
        if (state.phase !== 'vetoRequested') {
          throw new Error('presidentRespondVeto only valid in vetoRequested phase');
        }
        if (action.bySeat !== state.presidentSeat) {
          throw new Error('Only the president can respond to a veto');
        }
        if (action.accept) {
          // Veto accepted: both remaining cards go to discard; election
          // tracker advances. If tracker hits max, top-deck force enact.
          const discarded = state.legislativeHand;
          const tracker = state.board.electionTracker + 1;
          const log = [
            ...state.log,
            {
              kind: 'vetoUsed' as const,
              president: state.presidentSeat,
              chancellor: state.chancellorCandidateSeat ?? state.presidentSeat,
            },
          ];
          if (tracker >= ELECTION_TRACKER_MAX) {
            const drawn = drawOne({
              ...state,
              policyDiscard: [...state.policyDiscard, ...discarded],
              legislativeHand: [],
            });
            const enacted = enactPolicy(
              {
                ...state,
                policyDeck: drawn.deck,
                policyDiscard: drawn.discard,
                reshuffleCount: drawn.reshuffleCount,
                legislativeHand: [],
                chancellorCandidateSeat: null,
                log,
              },
              drawn.drawn,
              true,
            );
            return enacted;
          }
          // Tracker bumps, rotation advances.
          const next = nextAlive(state.seats, state.regularRotationSeat);
          return {
            ...state,
            board: { ...state.board, electionTracker: tracker },
            phase: 'nomination',
            policyDiscard: [...state.policyDiscard, ...discarded],
            legislativeHand: [],
            presidentSeat: next,
            regularRotationSeat: next,
            inSpecialElection: false,
            chancellorCandidateSeat: null,
            seats: resetVotes(state.seats),
            log,
          };
        }
        // Veto rejected — back to chancellor's enact choice.
        return { ...state, phase: 'legislativeChancellor' };
      }

      case 'ackPolicyReveal': {
        if (state.phase !== 'policyReveal') {
          throw new Error('ackPolicyReveal only valid in policyReveal phase');
        }
        // If a power was queued, jump to its phase. Otherwise advance round.
        if (state.pendingExec) {
          const phase: ShPhase =
            state.pendingExec === 'investigate'
              ? 'execInvestigate'
              : state.pendingExec === 'specialElection'
                ? 'execSpecialElection'
                : state.pendingExec === 'peekTop3'
                  ? 'execPeek'
                  : 'execExecute';
          // Peek snapshots the top of the deck right now (reshuffling if
          // needed) so the peeking president sees what they will draw next.
          if (phase === 'execPeek') {
            const peek = drawThree(state);
            // drawThree returns drawn + the rest; we must put the drawn cards
            // BACK on top of the deck (peek doesn't consume them).
            const restoredDeck = [...peek.drawn, ...peek.deck];
            return {
              ...state,
              phase,
              policyDeck: restoredDeck,
              policyDiscard: peek.discard,
              reshuffleCount: peek.reshuffleCount,
              pendingPeek: { by: state.presidentSeat, policies: peek.drawn },
              log: [...state.log, { kind: 'peek', by: state.presidentSeat }],
            };
          }
          return { ...state, phase };
        }
        return advanceAfterExecOrPolicy(state);
      }

      case 'ackTopDeckReveal': {
        if (state.phase !== 'topDeckReveal') {
          throw new Error('ackTopDeckReveal only valid in topDeckReveal phase');
        }
        // Re-check win conditions in case the top-deck enact crossed a track.
        const winChecked = checkInstantWin(state);
        if (winChecked.phase === 'gameOver') return winChecked;
        return advanceAfterExecOrPolicy(state);
      }

      case 'execInvestigate': {
        if (state.phase !== 'execInvestigate') {
          throw new Error('execInvestigate only valid in execInvestigate phase');
        }
        if (action.bySeat !== state.presidentSeat) {
          throw new Error('Only the president can investigate');
        }
        const target = state.seats[action.target];
        if (!target || !target.alive) throw new Error('Invalid investigation target');
        if (action.target === state.presidentSeat) {
          throw new Error('Cannot investigate yourself');
        }
        if (target.hasBeenInvestigated) {
          throw new Error('That seat has already been investigated');
        }
        const party = target.party;
        const investigation = { by: state.presidentSeat, target: action.target, party };
        return {
          ...state,
          phase: 'execInvestigateReveal',
          seats: state.seats.map((s, i) =>
            i === action.target ? { ...s, hasBeenInvestigated: true } : s,
          ),
          pendingInvestigation: investigation,
          investigations: [...state.investigations, investigation],
          log: [
            ...state.log,
            { kind: 'investigation', by: state.presidentSeat, target: action.target },
          ],
        };
      }

      case 'ackInvestigateReveal': {
        if (state.phase !== 'execInvestigateReveal') {
          throw new Error('ackInvestigateReveal only valid in execInvestigateReveal phase');
        }
        if (action.bySeat !== state.presidentSeat) {
          throw new Error('Only the investigating president can ack');
        }
        return advanceAfterExecOrPolicy({ ...state, pendingInvestigation: null });
      }

      case 'execSpecialElection': {
        if (state.phase !== 'execSpecialElection') {
          throw new Error('execSpecialElection only valid in execSpecialElection phase');
        }
        if (action.bySeat !== state.presidentSeat) {
          throw new Error('Only the president can call a special election');
        }
        const target = state.seats[action.nextPresident];
        if (!target || !target.alive) throw new Error('Invalid special-election target');
        if (action.nextPresident === state.presidentSeat) {
          throw new Error('Cannot special-elect yourself');
        }
        // Save the regular rotation pointer; mark a special election so that
        // after the round ends we resume from the regular slot.
        return {
          ...state,
          phase: 'nomination',
          presidentSeat: action.nextPresident,
          inSpecialElection: true,
          chancellorCandidateSeat: null,
          pendingExec: null,
          log: [
            ...state.log,
            {
              kind: 'specialElection',
              by: state.presidentSeat,
              nextPresident: action.nextPresident,
            },
          ],
        };
      }

      case 'ackPeek': {
        if (state.phase !== 'execPeek') {
          throw new Error('ackPeek only valid in execPeek phase');
        }
        if (action.bySeat !== state.presidentSeat) {
          throw new Error('Only the peeking president can ack');
        }
        return advanceAfterExecOrPolicy({ ...state, pendingPeek: null });
      }

      case 'execExecute': {
        if (state.phase !== 'execExecute') {
          throw new Error('execExecute only valid in execExecute phase');
        }
        if (action.bySeat !== state.presidentSeat) {
          throw new Error('Only the president can execute');
        }
        const target = state.seats[action.target];
        if (!target || !target.alive) throw new Error('Invalid execution target');
        if (action.target === state.presidentSeat) {
          throw new Error('Cannot execute yourself');
        }
        const killedHitler = target.role === 'hitler';
        const seats = state.seats.map((s, i) =>
          i === action.target ? { ...s, alive: false, voteCast: null } : s,
        );
        const log = [
          ...state.log,
          { kind: 'execution' as const, by: state.presidentSeat, target: action.target },
        ];
        if (killedHitler) {
          return {
            ...state,
            seats,
            phase: 'gameOver',
            winnerTeam: 'liberal',
            winReason: 'hitlerExecuted',
            log: [...log, { kind: 'gameOver', winner: 'liberal', reason: 'hitlerExecuted' }],
          };
        }
        return advanceAfterExecOrPolicy({ ...state, seats, log });
      }
    }
  },

  viewFor(state: ShPrivateState, seat: SeatIndex | null): ShPublicState {
    const own = seat === null ? null : (state.seats[seat] ?? null);
    const gameOver = state.phase === 'gameOver';
    // Hide votes while votes are still being cast.
    const hideVotes = state.phase === 'electionVote';

    const partyKnowledge = own ? buildPartyKnowledge(state.seats)[own.index]! : [];

    // Surface the legislative hand only to the active legislator:
    //   - President sees the 3-card draw during legislativePresident.
    //   - Chancellor sees the 2-card hand during legislativeChancellor /
    //     vetoRequested. The president does NOT see the chancellor's 2.
    let yourLegislativeHand: ShPolicy[] | null = null;
    if (
      seat !== null &&
      ((state.phase === 'legislativePresident' && seat === state.presidentSeat) ||
        ((state.phase === 'legislativeChancellor' || state.phase === 'vetoRequested') &&
          seat === state.chancellorCandidateSeat))
    ) {
      yourLegislativeHand = state.legislativeHand.slice();
    }

    const yourInvestigations =
      seat === null
        ? []
        : state.investigations
            .filter((inv) => inv.by === seat)
            .map((inv) => ({ target: inv.target, party: inv.party }));

    const yourPeek =
      seat !== null &&
      state.phase === 'execPeek' &&
      state.pendingPeek &&
      state.pendingPeek.by === seat
        ? state.pendingPeek.policies.slice()
        : null;

    const yourPendingInvestigationResult =
      seat !== null &&
      state.phase === 'execInvestigateReveal' &&
      state.pendingInvestigation &&
      state.pendingInvestigation.by === seat
        ? { target: state.pendingInvestigation.target, party: state.pendingInvestigation.party }
        : null;

    const seats: ShPublicSeatState[] = state.seats.map((s) => ({
      index: s.index,
      name: s.name,
      alive: s.alive,
      voteCast: hideVotes ? null : s.voteCast,
      hasAckedSetup: !!state.setupAcked[s.index],
      revealedRole: gameOver ? s.role : null,
    }));

    return {
      phase: state.phase,
      seats,
      board: state.board,
      trackPowers: fascistTrack(state.seats.length),
      presidentSeat: state.presidentSeat,
      chancellorCandidateSeat: state.chancellorCandidateSeat,
      lastElectedPresident: state.lastElectedPresident,
      lastElectedChancellor: state.lastElectedChancellor,
      inSpecialElection: state.inSpecialElection,
      policyDeckSize: state.policyDeck.length,
      policyDiscardSize: state.policyDiscard.length,
      pendingExec: state.pendingExec,
      lastEnactedPolicy: state.lastEnactedPolicy,
      lastEnactedViaTopDeck: state.lastEnactedViaTopDeck,
      winnerTeam: state.winnerTeam,
      winReason: state.winReason,
      log: state.log,
      yourSeat: seat,
      yourRole: own?.role ?? null,
      yourParty: own?.party ?? null,
      yourPartyKnowledge: partyKnowledge,
      yourLegislativeHand,
      yourInvestigations,
      yourPeek,
      yourPendingInvestigationResult,
    };
  },

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
