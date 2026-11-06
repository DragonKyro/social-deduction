# Skull

3–6 player bluffing game. Each player has 3 roses and 1 skull. Lay disks face-down, bid how many you can flip without revealing a skull, and the high bidder must deliver: all of their own stack first, then the top disks of opponents' stacks of their choice. All roses → a won challenge (2 wins the match). A skull → the challenger loses a disk.

## Setup options

- **Challenge target**: 1, 2 or 3 wins. Default (and official) 2.

## Rules as implemented (official)

- **Placing.** Everyone lays one disk face-down (sequential here; stacks are hidden, so the order doesn't matter). Then, in turn, each player adds a disk or opens the bidding. A player with no disks left in hand must bid.
- **Bidding.** Raise or pass clockwise. Passing is final for the round. The bid can't exceed the disks on the table; reaching that number starts the challenge at once.
- **Challenge.** The high bidder flips their whole stack first (top down), then the top disk of any opponent's stack, one at a time, until they have the bid in roses or hit a skull.
- **Success.** The challenger wins a challenge. Flipped disks go back to their owners.
- **Hitting someone else's skull.** That skull's owner removes **one of the challenger's disks at random, face-down**. The engine draws it with the host RNG. Only the challenger learns which disk it was.
- **Hitting your own skull.** The challenger **chooses** which of their disks to discard (`discardDisk`), face-down. Only they know which.
- **Next round.** The challenger starts. If they were knocked out, the owner of the skull that did it starts. If it was their own skull, they choose who starts (`chooseLeader`).
- **Out.** Lose your last disk and you're out of the match. The last player with disks wins outright.

Earlier versions of this module always took a rose, announced it, and destroyed every flipped disk. None of that was a deliberate house rule, and all three are fixed (see `audit.test.ts`).

## Hidden information

`view.ts` is the single redaction chokepoint (built field by field, never by spreading private state).

- **Stacks.** A stack's contents are sent only to its owner (`yourStack`). Everyone else gets `stackSize`. Flipped disks are public (`flips`, `players[i].revealed`).
- **Disk split.** How many roses / skulls a player still owns is private (`yourRemaining` for the owner). Everyone else sees counts only (`disksTotal`, `handCount`), so nobody can tell whether a player still has their skull.
- **Lost disk.** `RoundSummary.diskLost` is nulled for everyone except the loser. All disks are gathered back into hands the moment a challenge resolves, so stack sizes can't hint at what was lost.
- **Seed / RNG cursor.** Host-only (they'd predict the random loss).
- **Spectators** (`seat = null`) get no stack, an empty hand and no lost-disk identity.

## Phase machine

`placeOpening` → `placing` → `bidding` → `revealing` → (`discarding` → (`chooseLeader`)) → `roundOver` → next round, or `gameOver`.

## AI

`ai.ts` plays from `viewFor(state, seat)` only (`chooseFromView`). It knows its own stack exactly (how many roses sit above its own skull), but nothing about opponents beyond public signals: stack sizes, disk counts, flips and the bid log (bidders are trusted, early passers distrusted, deep stacks safer on top). It bluff-places skulls, occasionally bait-raises with a buried skull, keeps its skull when discarding while it has roses to spare, and hands the lead to the player furthest from winning. Randomness comes from a hash of the view.

## Hot-seat

The UI uses `useSeatSwitching()` (via `ui/hotseat.ts`). Whenever another human must place, bid or flip, the screen drops to the spectator view behind a "slide it over" cover. Round-over acks are taken for every local human at once. Online, switching is disabled.

## File layout

- `state.ts`, `actions.ts`, `setup.ts` (deal, `gatherDisks`, `nextRound`), `module.ts` (rules + validation), `view.ts` (redaction), `ai.ts`.
- `ui/DiskArt.tsx`: leather/cork coaster disks (rose, skull, tribal back) per tribe colour, plus win medals.
- `ui/GameView.tsx`: wooden bar table with animated drops, bid pops, one-by-one flips, skull-hit shake and red flash, disk loss and the challenge-won flourish.
- `ui/SkullSetup.tsx`: setup with per-seat AI toggles.
- `module.test.ts`: basic flow. `audit.test.ts`: rules fixes, redaction, validation, AI fairness, all-AI self-play. `ui/GameView.test.tsx`: DOM smoke tests.
