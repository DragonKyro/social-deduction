// Standard Avalon quest tables (rulebook).
//
// `teamSize`: how many players the leader must pick for that quest.
// `failsRequired`: how many fail cards make the quest fail. Normally 1;
// the famous exception is quest 4 at 7+ player tables, which needs 2.

export interface QuestSpec {
  teamSize: number;
  failsRequired: number;
}

const TRACKS: Record<number, QuestSpec[]> = {
  5: [
    { teamSize: 2, failsRequired: 1 },
    { teamSize: 3, failsRequired: 1 },
    { teamSize: 2, failsRequired: 1 },
    { teamSize: 3, failsRequired: 1 },
    { teamSize: 3, failsRequired: 1 },
  ],
  6: [
    { teamSize: 2, failsRequired: 1 },
    { teamSize: 3, failsRequired: 1 },
    { teamSize: 4, failsRequired: 1 },
    { teamSize: 3, failsRequired: 1 },
    { teamSize: 4, failsRequired: 1 },
  ],
  7: [
    { teamSize: 2, failsRequired: 1 },
    { teamSize: 3, failsRequired: 1 },
    { teamSize: 3, failsRequired: 1 },
    { teamSize: 4, failsRequired: 2 },
    { teamSize: 4, failsRequired: 1 },
  ],
  8: [
    { teamSize: 3, failsRequired: 1 },
    { teamSize: 4, failsRequired: 1 },
    { teamSize: 4, failsRequired: 1 },
    { teamSize: 5, failsRequired: 2 },
    { teamSize: 5, failsRequired: 1 },
  ],
  9: [
    { teamSize: 3, failsRequired: 1 },
    { teamSize: 4, failsRequired: 1 },
    { teamSize: 4, failsRequired: 1 },
    { teamSize: 5, failsRequired: 2 },
    { teamSize: 5, failsRequired: 1 },
  ],
  10: [
    { teamSize: 3, failsRequired: 1 },
    { teamSize: 4, failsRequired: 1 },
    { teamSize: 4, failsRequired: 1 },
    { teamSize: 5, failsRequired: 2 },
    { teamSize: 5, failsRequired: 1 },
  ],
};

export function questTrack(playerCount: number): QuestSpec[] {
  const track = TRACKS[playerCount];
  if (!track) throw new Error(`No Avalon quest track for ${playerCount} players`);
  return track;
}

// Good/evil split by player count (rulebook).
const SPLIT: Record<number, { good: number; evil: number }> = {
  5: { good: 3, evil: 2 },
  6: { good: 4, evil: 2 },
  7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 },
  9: { good: 6, evil: 3 },
  10: { good: 6, evil: 4 },
};

export function alignmentSplit(playerCount: number): { good: number; evil: number } {
  const s = SPLIT[playerCount];
  if (!s) throw new Error(`No Avalon alignment split for ${playerCount} players`);
  return s;
}

// Maximum proposal rejections before evil auto-wins. 5 consecutive rejected
// votes = evil wins (rulebook).
export const MAX_REJECTED_PROPOSALS = 5;
