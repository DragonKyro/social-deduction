import type { SeatIndex } from '@/engine/types';

// Action union for ONUW. Each role's night action is a typed variant so
// the host can dispatch on `type` and reject illegal combinations (e.g.
// seer with no target, robber swapping with self).

export type OnuwAction =
  | { type: 'startNight' }
  | { type: 'seerLookSeat'; targetSeat: SeatIndex }
  | { type: 'seerLookCenter'; centerIndices: [number, number] }
  | { type: 'robberSwap'; targetSeat: SeatIndex }
  | { type: 'troublemakerSwap'; a: SeatIndex; b: SeatIndex }
  | { type: 'drunkSwap'; centerIndex: number }
  | { type: 'werewolfPass' } // werewolves see each other automatically; no decision unless lone wolf
  | { type: 'loneWolfPeekCenter'; centerIndex: number }
  | { type: 'insomniacWake' }
  | { type: 'minionWake' }
  | { type: 'masonWake' }
  | { type: 'hunterPass' }
  | { type: 'villagerPass' }
  | { type: 'startDay' }
  | { type: 'startVote' }
  | { type: 'castVote'; targetSeat: SeatIndex }
  | { type: 'resolveVotes' };
