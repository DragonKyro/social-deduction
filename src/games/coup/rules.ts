import type { SeatIndex } from '@/engine/types';
import { blockersFor } from './characters';
import type { CharacterActionId } from './characters';
import type { CoupCharacter, CoupPhase, CoupRuleset, GeneralActionId } from './state';

// ============================================================================
// Pure rule helpers shared by the engine (module.ts), the redactor (view.ts),
// the AI and the UI. Everything here is structurally typed over PUBLIC data
// (seat liveness, tokens, the declared action), so the same function answers
// "is this legal?" identically on the host's private state and on a peer's
// redacted view.
// ============================================================================

interface SeatLike {
  index: SeatIndex;
  eliminated: boolean;
  tokens: { peacekeeping: boolean; treaty: SeatIndex | null };
}

interface TableLike {
  seats: readonly SeatLike[];
}

interface PendingLike {
  by: SeatIndex;
  kind: 'general' | 'character';
  generalId: GeneralActionId | null;
  characterActionId: CharacterActionId | null;
  target: SeatIndex | null;
  blocker: { by: SeatIndex } | null;
  passes: readonly SeatIndex[];
  loseInfluencePending: { seat: SeatIndex } | null;
  pileOnPot: { contributors: readonly SeatIndex[]; closed: readonly SeatIndex[] } | null;
  chipInPot: { contributors: readonly SeatIndex[]; passes: readonly SeatIndex[] } | null;
}

export const STEAL_ACTIONS: readonly CharacterActionId[] = ['steal', 'thiefSteal', 'customSteal'];

export function livingSeatIndices(t: TableLike): SeatIndex[] {
  return t.seats.filter((s) => !s.eliminated).map((s) => s.index);
}

/** Why `by` may not target `target`, or null when the target is legal. */
export function targetBlockReason(t: TableLike, by: SeatIndex, target: SeatIndex): string | null {
  const tgt = t.seats[target];
  const me = t.seats[by];
  if (!tgt || !me || tgt.eliminated) return 'Invalid target.';
  if (target === by) return "You can't target yourself.";
  if (tgt.tokens.peacekeeping) return 'is under Peacekeeping protection.';
  // A Treaty is void once the bonded seats are the last two alive (it would
  // otherwise freeze the game forever).
  const bonded = tgt.tokens.treaty === by || me.tokens.treaty === target;
  if (bonded && livingSeatIndices(t).length > 2) return 'A Treaty bars that target.';
  return null;
}

export function canTarget(t: TableLike, by: SeatIndex, target: SeatIndex): boolean {
  return targetBlockReason(t, by, target) === null;
}

export function legalTargets(t: TableLike, by: SeatIndex): SeatIndex[] {
  return t.seats.filter((s) => canTarget(t, by, s.index)).map((s) => s.index);
}

/**
 * The 10-coin rule: a seat with 10+ coins must Coup. If tokens leave them no
 * legal Coup target (G54 Peacekeeper / Treaty), the obligation is waived for
 * the turn instead of deadlocking the game.
 */
export function mustCoup(t: TableLike & { seats: readonly (SeatLike & { coins: number })[] }, seat: SeatIndex): boolean {
  const s = t.seats[seat];
  if (!s || s.coins < 10) return false;
  return legalTargets(t, seat).length > 0;
}

/** Characters that may legally block the pending action. */
export function validBlockersFor(
  activeCharacters: readonly CoupCharacter[],
  ruleset: CoupRuleset,
  p: Pick<PendingLike, 'kind' | 'generalId' | 'characterActionId'> & { unblockable?: boolean },
): CoupCharacter[] {
  if (p.unblockable) return [];
  if (p.kind === 'general') {
    if (p.generalId === 'foreignAid') return blockersFor(activeCharacters, 'foreignAid');
    // Judge / Lawyer / Paramilitary / Guerrilla can block Coup in G54 only.
    if (p.generalId === 'coup') return ruleset === 'g54' ? blockersFor(activeCharacters, 'coup') : [];
    return [];
  }
  const id = p.characterActionId;
  if (id === 'assassinate') return blockersFor(activeCharacters, 'assassinate');
  if (id && STEAL_ACTIONS.includes(id)) return blockersFor(activeCharacters, 'steal');
  // Guerrilla / Paramilitary strikes: only the same role blocks (house rule).
  if (id === 'protectedEliminate') return activeCharacters.includes('guerrilla') ? ['guerrilla'] : [];
  if (id === 'paramilitaryRiot') return activeCharacters.includes('paramilitary') ? ['paramilitary'] : [];
  return [];
}

/**
 * Seats allowed to block the pending action. Targeted actions (steal,
 * assassinate, coup, strikes) can only be blocked by their target, exactly
 * like Classic Contessa / Captain. Foreign Aid has no target: anyone may
 * claim the Duke.
 */
export function blockEligibleSeats(t: TableLike, p: Pick<PendingLike, 'by' | 'target'>): SeatIndex[] {
  if (p.target !== null) {
    const tgt = t.seats[p.target];
    return tgt && !tgt.eliminated && p.target !== p.by ? [p.target] : [];
  }
  return livingSeatIndices(t).filter((s) => s !== p.by);
}

/**
 * Seats the current phase is waiting on. The engine closes a window exactly
 * when this list is empty, so the AI, the UI and the reducer all agree on
 * who still owes a response.
 */
export function awaitingSeatsFor(
  t: TableLike & { phase: CoupPhase; currentSeat: SeatIndex },
  p: PendingLike | null,
  swapTarget: SeatIndex | null,
): SeatIndex[] {
  const living = livingSeatIndices(t);
  switch (t.phase) {
    case 'turnStart':
      return living.includes(t.currentSeat) ? [t.currentSeat] : [];
    case 'awaitingChallenge':
      if (!p) return [];
      return living.filter((s) => s !== p.by && !p.passes.includes(s));
    case 'awaitingBlock':
      if (!p) return [];
      return blockEligibleSeats(t, p).filter((s) => !p.passes.includes(s));
    case 'awaitingBlockChallenge':
      if (!p || !p.blocker) return [];
      return living.filter((s) => s !== p.blocker!.by && !p.passes.includes(s));
    case 'loseInfluence':
      return p?.loseInfluencePending ? [p.loseInfluencePending.seat] : [];
    case 'exchangePick':
    case 'spyPeek':
    case 'sellInfluencePick':
      return p ? [p.by] : [];
    case 'targetSwapPick':
      return swapTarget !== null ? [swapTarget] : [];
    case 'pileOnWindow': {
      const pot = p?.pileOnPot;
      if (!p || !pot) return [];
      return living.filter((s) => s !== p.by && !pot.contributors.includes(s) && !pot.closed.includes(s));
    }
    case 'chipInWindow': {
      const pot = p?.chipInPot;
      if (!p || !pot) return [];
      return living.filter(
        (s) => s !== p.by && s !== p.target && !pot.contributors.includes(s) && !pot.passes.includes(s),
      );
    }
    default:
      return [];
  }
}
