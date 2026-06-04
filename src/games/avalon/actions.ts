import type { SeatIndex } from '@/engine/types';

export type AvalonAction =
  | { type: 'proposeTeam'; team: SeatIndex[] }
  | { type: 'castTeamVote'; approve: boolean }
  | { type: 'playQuestCard'; success: boolean }
  | { type: 'assassinateMerlin'; target: SeatIndex }
  // Lady of the Lake — current holder picks a seat to investigate; the
  // engine privately reveals their alignment to ONLY the investigator.
  // After the reveal, holder publicly declares the alignment (true or
  // false — engine doesn't validate honesty; that's the game).
  | { type: 'ladyInvestigate'; target: SeatIndex }
  | { type: 'ladyDeclare'; declaredAlignment: 'good' | 'evil' }
  // Excalibur — quest leader assigns the sword to a team member (other
  // than themselves) after the team is approved.
  | { type: 'assignExcalibur'; holderSeat: SeatIndex }
  // Excalibur — holder optionally flips one teammate's quest card. Pass
  // `targetSeat: null` to decline.
  | { type: 'useExcalibur'; targetSeat: SeatIndex | null }
  | { type: 'advanceTurn' };
