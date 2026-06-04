import type { SeatIndex } from '@/engine/types';
import type { ShAction } from './actions';
import type { ShPrivateState } from './state';

// Stub. Phase 3 implements the real Secret Hitler AI.
//
// Plan: liberals enact liberals, vote down chancellors whose hidden-info
// trail looks fascist. Fascists discard liberal policies when they can
// hide it (deck size + previous claims), vote up known fascist
// chancellors when the board is close to a 6-fascist win.
export function aiChooseAction(state: ShPrivateState, _seat: SeatIndex): ShAction | null {
  void state;
  return null;
}
