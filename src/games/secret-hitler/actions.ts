import type { SeatIndex } from '@/engine/types';
import type { ShPolicy } from './state';

// Secret Hitler action union. Every action carries `bySeat` so the host can
// validate the sender against their seat assignment.

export type ShAction =
  | { type: 'ackRoleReveal'; bySeat: SeatIndex }
  | { type: 'nominateChancellor'; bySeat: SeatIndex; chancellor: SeatIndex }
  | { type: 'castVote'; bySeat: SeatIndex; vote: 'ja' | 'nein' }
  | { type: 'ackElectionReveal'; bySeat: SeatIndex }
  | { type: 'presidentDiscard'; bySeat: SeatIndex; discardIndex: 0 | 1 | 2 }
  | { type: 'chancellorEnact'; bySeat: SeatIndex; enactIndex: 0 | 1 }
  | { type: 'chancellorRequestVeto'; bySeat: SeatIndex }
  | { type: 'presidentRespondVeto'; bySeat: SeatIndex; accept: boolean }
  | { type: 'ackPolicyReveal'; bySeat: SeatIndex }
  | { type: 'ackTopDeckReveal'; bySeat: SeatIndex }
  | { type: 'execInvestigate'; bySeat: SeatIndex; target: SeatIndex }
  | { type: 'ackInvestigateReveal'; bySeat: SeatIndex }
  | { type: 'execSpecialElection'; bySeat: SeatIndex; nextPresident: SeatIndex }
  | { type: 'ackPeek'; bySeat: SeatIndex }
  | { type: 'execExecute'; bySeat: SeatIndex; target: SeatIndex };

// Helper type referenced by tests.
export type ShPolicySlot = ShPolicy;
