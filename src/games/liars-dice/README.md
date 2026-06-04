# Liar's Dice

2–8 player bluffing game. Each player rolls 5 dice in a hidden cup. Bid up ("at least N of face F across all dice") or call liar.

## Setup options

- **1s are wild** — count toward any bid face (except when the bid IS on 1s). Default on.
- **Spot-on call** — claim the bid is exactly correct. Right → bidder loses a die; wrong → caller does. Default on.

## Hidden info

Each seat's rolled dice values. The `viewFor` chokepoint exposes `yourDice` only to the owning seat; everyone else sees just `diceCount`. On reveal, `lastReveal.allDice` makes everyone's dice public for the round recap.

## Phase machine

- `rollPending` — dice are rolled; every alive seat acks.
- `bidding` — active seat bids up (more dice or higher face) OR calls.
- `revealing` — actual count vs. bid; loser drops a die.
- `roundOver` — ack; reroll.
- `gameOver` — last seat with dice wins.

## End conditions

Last player with any dice remaining wins.
