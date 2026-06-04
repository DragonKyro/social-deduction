import type { SeatIndex } from '@/engine/types';

export type AvalonAction =
  | { type: 'proposeTeam'; team: SeatIndex[] }
  | { type: 'castTeamVote'; approve: boolean }
  | { type: 'playQuestCard'; success: boolean }
  | { type: 'assassinateMerlin'; target: SeatIndex }
  | { type: 'advanceTurn' };
