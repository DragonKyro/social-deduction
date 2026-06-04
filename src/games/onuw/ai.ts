import type { SeatIndex } from '@/engine/types';
import type { OnuwAction } from './actions';
import type { OnuwPrivateState } from './state';

// Stub. Phase 1 implements the real ONUW AI.
//
// Plan: deterministic heuristic. Werewolves stay quiet on first claim, lie
// minimally to fit a self-consistent story. Villagers vote the seat that's
// claimed roles inconsistent with the role pool. Seer / Robber etc. make
// the canonical first-night moves. No memory across days (one night only).
export function aiChooseAction(state: OnuwPrivateState, _seat: SeatIndex): OnuwAction | null {
  void state;
  return null;
}
