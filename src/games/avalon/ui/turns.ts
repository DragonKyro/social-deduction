import type { SeatIndex } from '@/engine/types';
import type { AvalonPublicState } from '../state';

// Pure helpers for "who should act on this device next", derived ONLY from
// the public view (so they work identically for a guest, the host, and a
// hot-seat device). No React, no store.

/**
 * Seats that still owe an action this phase, as far as the PUBLIC view can
 * tell. The Assassin isn't publicly known, so assassinPick is handled by the
 * Assassin's own view (`yourRole === 'assassin'`), not by this list.
 */
export function pendingSeats(view: AvalonPublicState): SeatIndex[] {
  switch (view.phase) {
    case 'setup':
      return view.seats.filter((s) => !s.hasAckedSetup).map((s) => s.index);
    case 'teamProposal':
      return [view.currentLeaderSeat];
    case 'teamVote':
      return view.seats.filter((s) => !s.hasVoted).map((s) => s.index);
    case 'questExecution':
      return view.proposedTeam.filter((s) => !view.seats[s]?.hasPlayedQuestCard);
    default:
      return [];
  }
}

/**
 * The seat this device should act as next: the current local seat if it still
 * owes an action, else the first pending seat this device may control (hot
 * seat). Null when nobody here needs to act.
 */
export function nextLocalActor(
  view: AvalonPublicState,
  localSeat: SeatIndex | null,
  canView: (seat: SeatIndex) => boolean,
): SeatIndex | null {
  const pending = pendingSeats(view).filter(canView);
  if (localSeat !== null && pending.includes(localSeat)) return localSeat;
  return pending[0] ?? null;
}

/**
 * Display order for a quest's revealed cards. Built from the public COUNTS
 * only, shuffled by a hash of the quest number — so the order can never be
 * mapped back onto the seats that played them.
 */
export function questRevealOrder(questNumber: number, teamSize: number, failCount: number): boolean[] {
  const cards: boolean[] = Array.from({ length: teamSize }, (_, i) => i >= failCount);
  let h = (questNumber * 2654435761 + teamSize * 40503 + failCount * 977) >>> 0;
  for (let i = cards.length - 1; i > 0; i--) {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    const j = h % (i + 1);
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return cards; // true = success, false = fail
}

/** Roman numerals for quest numbers. */
export function roman(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}

export type GameEndReason = 'assassinHit' | 'assassinMiss' | 'threeFails' | 'fiveRejections' | 'threeSuccesses';

/** Why the game ended, from public info only. */
export function endReason(view: AvalonPublicState): GameEndReason | null {
  if (view.phase !== 'gameOver') return null;
  if (view.assassinationTarget !== null) {
    return view.winnerTeam === 'evil' ? 'assassinHit' : 'assassinMiss';
  }
  if (view.failedProposalsThisQuest >= 5) return 'fiveRejections';
  if (view.questHistory.filter((q) => q.result === 'fail').length >= 3) return 'threeFails';
  return 'threeSuccesses';
}
