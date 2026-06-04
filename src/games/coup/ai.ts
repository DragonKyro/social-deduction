import type { SeatIndex } from '@/engine/types';
import type { CoupGameAction } from './actions';
import type { CoupPrivateState } from './state';

// Stub. Phase 5 implements the real Coup AI.
//
// Plan: probability-weighted bluff scheduler. Track each opponent's claim
// history; estimate a per-character likelihood ratio for "actually has it"
// vs. "claimed it". Challenge when EV is positive (claim look-up is
// inconsistent with revealed history and our own influence). Bluff own
// claims at a rate proportional to how needed the action is.
export function aiChooseAction(state: CoupPrivateState, _seat: SeatIndex): CoupGameAction | null {
  void state;
  return null;
}
