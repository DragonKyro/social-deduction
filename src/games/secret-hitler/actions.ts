import type { SeatIndex } from '@/engine/types';
import type { ShPolicy } from './state';

export type ShAction =
  | { type: 'nominateChancellor'; chancellor: SeatIndex }
  | { type: 'castVote'; vote: 'ja' | 'nein' }
  | { type: 'presidentDiscard'; policy: ShPolicy; remaining: [ShPolicy, ShPolicy] }
  | { type: 'chancellorEnact'; policy: ShPolicy }
  | { type: 'requestVeto' }
  | { type: 'respondVeto'; accept: boolean }
  | { type: 'execInvestigate'; target: SeatIndex }
  | { type: 'execSpecialElection'; nextPresident: SeatIndex }
  | { type: 'execPeekTop3' }
  | { type: 'execExecute'; target: SeatIndex }
  | { type: 'concedeChancellorTopDeck' } // election tracker = 3 forces top-deck enact
  | { type: 'advanceTurn' };
