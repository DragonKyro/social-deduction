import type { SeatIndex } from '@/engine/types';
import type { AvalonAction } from './actions';
import type { AvalonPrivateState } from './state';

// Stub. Phase 4 implements the real Avalon AI.
//
// Plan: Merlin proposes teams of confirmed-good (without being obvious).
// Evils on quests fail when they can afford to (quest still loses with a
// single fail). Approvals lean liberal-good unless quest team contains
// known evils. Assassin shot uses a posterior over Merlin candidates.
export function aiChooseAction(state: AvalonPrivateState, _seat: SeatIndex): AvalonAction | null {
  void state;
  return null;
}
