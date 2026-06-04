# Skull

3–6 player bluffing game. Each player has 3 roses and 1 skull. Pass disks face-down; bid how many disks you can flip without revealing a skull; high bidder must deliver. All roses → +1 win. Hit a skull → lose a disk.

## Setup options

- **Challenge target** — 1, 2, or 3 wins. Default 2.

## Hidden info

Each seat's own face-down stack (which disks are roses vs. skulls and the order). The `viewFor` chokepoint exposes `yourStack` only to the owning seat; everyone else sees just `stackSize`.

## Phase machine

- `placeOpening` — every alive seat lays one starting disk before normal play.
- `placing` — active seat places another OR opens a bid.
- `bidding` — clockwise raise/pass until one bidder remains (or the bid hits the on-table disk total).
- `revealing` — challenger flips disks, starting with their own stack.
- `roundOver` — outcome shown; everyone acks to start the next round.
- `gameOver` — someone hit the challenge target.

## End conditions

- First to `challengeTarget` successful challenges wins.
- Lose all your disks → eliminated.
