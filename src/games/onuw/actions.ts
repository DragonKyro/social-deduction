import type { SeatIndex } from '@/engine/types';

// Discriminated action union for ONUW. Every action carries `bySeat` (the
// seat the actor believes they hold) so the host can verify it against
// the lobby record. Night-step actions are scoped to the role that just
// woke; the host rejects an action that doesn't match the current step.

export type OnuwAction =
  // === Setup / phase transitions ===
  | { type: 'ackRoleReveal'; bySeat: SeatIndex }
  | { type: 'startNight' }

  // === Night actions ===
  // Most "pass / acknowledge my view" actions are bundled under a single
  // `nightAck`. The host knows which step the seat is in from `state`.
  | { type: 'nightAck'; bySeat: SeatIndex }

  // -- Base game --
  | { type: 'seerLookSeat'; bySeat: SeatIndex; targetSeat: SeatIndex }
  | { type: 'seerLookCenter'; bySeat: SeatIndex; centerIndices: [number, number] }
  | { type: 'robberSwap'; bySeat: SeatIndex; targetSeat: SeatIndex }
  | { type: 'robberSkip'; bySeat: SeatIndex }
  | { type: 'troublemakerSwap'; bySeat: SeatIndex; a: SeatIndex; b: SeatIndex }
  | { type: 'drunkSwap'; bySeat: SeatIndex; centerIndex: number }
  | { type: 'loneWolfPeekCenter'; bySeat: SeatIndex; centerIndex: number }
  | { type: 'loneWolfSkip'; bySeat: SeatIndex }

  // -- Daybreak --
  | { type: 'doppelgangerCopy'; bySeat: SeatIndex; targetSeat: SeatIndex }
  | { type: 'apprenticeSeerLook'; bySeat: SeatIndex; centerIndex: number }
  | { type: 'paranormalLook'; bySeat: SeatIndex; targetSeat: SeatIndex }
  | { type: 'paranormalStop'; bySeat: SeatIndex }
  | { type: 'witchSwap'; bySeat: SeatIndex; centerIndex: number; targetSeat: SeatIndex }
  | { type: 'witchSkip'; bySeat: SeatIndex }
  | { type: 'villageIdiotShift'; bySeat: SeatIndex; direction: 'left' | 'right' }
  | { type: 'villageIdiotSkip'; bySeat: SeatIndex }
  | { type: 'revealerFlip'; bySeat: SeatIndex; targetSeat: SeatIndex }
  | { type: 'revealerSkip'; bySeat: SeatIndex }
  | { type: 'curatorGive'; bySeat: SeatIndex; targetSeat: SeatIndex }
  | { type: 'alphaWolfConvert'; bySeat: SeatIndex; targetSeat: SeatIndex }
  | { type: 'mysticWolfLook'; bySeat: SeatIndex; targetSeat: SeatIndex }

  // -- Bonus roles --
  | { type: 'thingTap'; bySeat: SeatIndex; targetSeat: SeatIndex }
  | { type: 'bodySnatcherSwap'; bySeat: SeatIndex; targetSeat: SeatIndex }
  | { type: 'windyWendyShift'; bySeat: SeatIndex; sourceSeat: SeatIndex; direction: 'left' | 'right' }
  | { type: 'defenderProtect'; bySeat: SeatIndex; targetSeat: SeatIndex }

  // === Day / voting / resolution ===
  | { type: 'startVote' }
  | { type: 'castVote'; bySeat: SeatIndex; targetSeat: SeatIndex }
  | { type: 'resolveVotes' }
  | { type: 'ackGameOver' };
