import type { ShExecutivePower } from './state';

// ============================================================================
// Secret Hitler boards and counts (rulebook).
//
// `fascistTrackPowers[i]` is the power granted by enacting the (i+1)-th
// fascist policy. `null` means no power on that slot.
// ============================================================================

export interface ShCounts {
  liberals: number;
  fascists: number; // includes Hitler
}

const COUNTS: Record<number, ShCounts> = {
  5: { liberals: 3, fascists: 2 },
  6: { liberals: 4, fascists: 2 },
  7: { liberals: 4, fascists: 3 },
  8: { liberals: 5, fascists: 3 },
  9: { liberals: 5, fascists: 4 },
  10: { liberals: 6, fascists: 4 },
};

export function alignmentCounts(playerCount: number): ShCounts {
  const c = COUNTS[playerCount];
  if (!c) throw new Error(`No Secret Hitler counts for ${playerCount} players`);
  return c;
}

// Per-board fascist-track powers. Liberal track has no powers (just the
// 5-policy win condition).
const FASCIST_TRACKS: Record<number, (ShExecutivePower | null)[]> = {
  // 5-6p: small board
  5: [null, null, 'peekTop3', 'execute', 'execute'],
  6: [null, null, 'peekTop3', 'execute', 'execute'],
  // 7-8p: medium board
  7: [null, 'investigate', 'specialElection', 'execute', 'execute'],
  8: [null, 'investigate', 'specialElection', 'execute', 'execute'],
  // 9-10p: large board
  9: ['investigate', 'investigate', 'specialElection', 'execute', 'execute'],
  10: ['investigate', 'investigate', 'specialElection', 'execute', 'execute'],
};

export function fascistTrack(playerCount: number): (ShExecutivePower | null)[] {
  const t = FASCIST_TRACKS[playerCount];
  if (!t) throw new Error(`No Secret Hitler fascist track for ${playerCount} players`);
  return t;
}

// Liberal track length is always 5; win at 5 enacted liberal policies.
export const LIBERAL_TRACK_LENGTH = 5;
// Fascist track length is always 6; win at 6 enacted fascist policies, plus
// the "Hitler elected after 3 fascist policies" check.
export const FASCIST_TRACK_LENGTH = 6;
// Election tracker max: after 3 failed governments in a row, top-deck the
// next policy and reset.
export const ELECTION_TRACKER_MAX = 3;
// Veto unlocks at this many fascist policies enacted (rulebook: 5).
export const VETO_THRESHOLD = 5;
// Hitler-elected loss kicks in once this many fascist policies are enacted.
export const HITLER_CHANCELLOR_THRESHOLD = 3;

// Initial policy deck: 6 liberal + 11 fascist policies.
export const LIBERAL_POLICY_COUNT = 6;
export const FASCIST_POLICY_COUNT = 11;
