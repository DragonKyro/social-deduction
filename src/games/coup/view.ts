import type { SeatIndex } from '@/engine/types';
import { awaitingSeatsFor, validBlockersFor } from './rules';
import type { CoupPrivateState, CoupPublicState } from './state';

// ============================================================================
// viewFor — THE hidden-information chokepoint for Coup.
//
// Built field-by-field from an allow-list (never `...state`), and every
// array/object is copied so a view can't alias host state. What leaves:
//   - every seat's coins / tokens / liveness, and ONLY face-up cards;
//   - the declared action (claims are public by definition), minus the
//     force-swap drawn card and other host bookkeeping;
//   - deck SIZE (never contents/order), log + event feed (public by
//     construction);
//   - for `seat` only: its own hand, its exchange offer, its private peeks.
// What never leaves: deck, seed, rngCursor, other hands, swap drawn card,
// other seats' peeks, someone else's exchange offer.
// ============================================================================

export function viewFor(state: CoupPrivateState, seat: SeatIndex | null): CoupPublicState {
  const own = seat === null ? null : state.seats[seat] ?? null;
  const p = state.pending;
  const swapTarget = p?.swapInProgress?.target ?? null;
  return {
    phase: state.phase,
    ruleset: state.ruleset,
    expansions: [...state.expansions],
    activeCharacters: [...state.activeCharacters],
    seats: state.seats.map((s) => ({
      index: s.index,
      name: s.name,
      coins: s.coins,
      influences: s.influences.map((inf) =>
        inf.revealed ? { char: inf.char, revealed: true } : { char: null, revealed: false },
      ),
      eliminated: s.eliminated,
      tokens: { ...s.tokens },
    })),
    currentSeat: state.currentSeat,
    pending: p
      ? {
          by: p.by,
          claimedCharacter: p.claimedCharacter,
          kind: p.kind,
          generalId: p.generalId,
          characterActionId: p.characterActionId,
          target: p.target,
          blocker: p.blocker ? { by: p.blocker.by, character: p.blocker.character } : null,
          passes: [...p.passes],
          loseInfluencePending: p.loseInfluencePending ? { ...p.loseInfluencePending } : null,
          mercenaryPartner: p.mercenaryPartner,
          treatyPair: p.treatyPair ? [p.treatyPair[0], p.treatyPair[1]] : null,
          pileOnPot: p.pileOnPot
            ? {
                contributors: [...p.pileOnPot.contributors],
                coinsEach: p.pileOnPot.coinsEach,
                closed: [...p.pileOnPot.closed],
              }
            : null,
          chipInPot: p.chipInPot
            ? {
                contributors: [...p.chipInPot.contributors],
                threshold: p.chipInPot.threshold,
                passes: [...p.chipInPot.passes],
              }
            : null,
          swapTarget,
          unblockable: p.unblockable,
          validBlockers: validBlockersFor(state.activeCharacters, state.ruleset, p),
        }
      : null,
    deckSize: state.deck.length,
    log: [...state.log],
    events: state.events.map((e) => ({ ...e })),
    winnerSeat: state.winnerSeat,
    awaitingSeats: awaitingSeatsFor(state, p, swapTarget),
    yourSeat: seat,
    yourInfluences: own ? own.influences.map((i) => ({ char: i.char, revealed: i.revealed })) : [],
    yourExchangeOffer:
      seat !== null && state.phase === 'exchangePick' && p?.by === seat && state.exchangeOffer
        ? { cards: [...state.exchangeOffer.cards], keepCount: state.exchangeOffer.keepCount }
        : null,
    yourPeeks: seat !== null ? (state.privatePeeks[seat] ?? []).map((pk) => ({ ...pk })) : [],
  };
}
