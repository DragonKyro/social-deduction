import type { SeatIndex } from '@/engine/types';

// Discriminated action union for ONUW. Every action a PLAYER takes carries
// `bySeat`; the host rejects it unless that seat is allowed to act right now
// (right phase, owns the current night step, hasn't already acted). Online,
// the network layer guarantees `bySeat` is the sender's real seat.
//
// Seatless actions (`startNight`, `startVote`, `resolveVotes`,
// `ackGameOver`) are host-only phase controls — the network layer only
// accepts actions without `bySeat` from the host.

export type OnuwAction =
  // === Setup / phase transitions ===
  | { type: 'ackRoleReveal'; bySeat: SeatIndex }
  // No-op kept for compatibility: the night starts automatically once every
  // seat has acknowledged their role.
  | { type: 'startNight' }

  // === Night actions ===
  // "Done / pass" for the seat's current night step. Accepted for
  // observation-only wake-ups and for optional actions; rejected when the
  // role's action is mandatory (Doppelganger, Drunk, The Thing, Alpha Wolf).
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
  // Witch: look at a center card first (`witchLook`), then she must give it
  // to a player (`witchSwap` with the same center card). `witchSwap` without
  // a prior look does both at once.
  | { type: 'witchLook'; bySeat: SeatIndex; centerIndex: number }
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
  // Host control: day → voting.
  | { type: 'startVote' }
  | { type: 'castVote'; bySeat: SeatIndex; targetSeat: SeatIndex }
  // Host override: count the votes now, treating seats that haven't voted
  // as abstaining. (Voting resolves automatically once every seat has voted.)
  | { type: 'resolveVotes' }
  // Host control: resolution → gameOver.
  | { type: 'ackGameOver' };
