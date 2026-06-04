import type { SeatIndex } from '@/engine/types';

// Avalon action union. All actions that act on a specific seat carry
// `bySeat`. In solo/hot-seat mode the UI fills this in based on which
// seat is currently active. In online play the network layer verifies
// `bySeat` against the envelope's `bySeat` (which is tied to the sender's
// UUID), so a peer can't spoof another seat's action.

export type AvalonAction =
  | { type: 'ackRoleReveal'; bySeat: SeatIndex }
  | { type: 'proposeTeam'; bySeat: SeatIndex; team: SeatIndex[] }
  | { type: 'castTeamVote'; bySeat: SeatIndex; approve: boolean }
  // Acknowledging the team-vote reveal isn't seat-sensitive in solo;
  // online we'd track per-seat acks. For now any seat advancing is fine.
  | { type: 'ackTeamVoteReveal' }
  | { type: 'playQuestCard'; bySeat: SeatIndex; success: boolean }
  | { type: 'ackQuestResolution' }
  | { type: 'assassinateMerlin'; bySeat: SeatIndex; target: SeatIndex }

  // ---- Optional modules (scaffolded; engine doesn't yet drive them) ----
  | { type: 'ladyInvestigate'; bySeat: SeatIndex; target: SeatIndex }
  | { type: 'ladyDeclare'; bySeat: SeatIndex; declaredAlignment: 'good' | 'evil' }
  | { type: 'assignExcalibur'; bySeat: SeatIndex; holderSeat: SeatIndex }
  | { type: 'useExcalibur'; bySeat: SeatIndex; targetSeat: SeatIndex | null };
