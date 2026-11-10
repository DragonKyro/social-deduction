# Liar's Dice

2–8 player bluffing game. Each player rolls 5 dice in a hidden cup. Bid up ("at least N of face F across all dice") or call liar.

## Setup options

- **1s are wild** — 1s count toward any other face. Default on. Bidding 1s follows the Perudo conversion (`rules.ts › isLegalRaise`):
  - the opening bid of a round may not be on 1s;
  - non-1s → non-1s: raise the count, or keep it and raise the face;
  - non-1s → 1s: count ≥ ⌈previous count / 2⌉;
  - 1s → 1s: count must go up;
  - 1s → non-1s: count ≥ previous count × 2 + 1.
  - A bid on 1s counts only 1s.
- **Spot-on call** — claim the bid is exactly correct. Right → bidder loses a die; wrong → caller does. Default on. (House variant: classic Perudo "calza" gives the caller a die back instead.)

Without wild 1s, 1 is simply the lowest face. Bids can never exceed the dice still in play.

## Hidden info

Each seat's rolled dice values. The `viewFor` chokepoint (`view.ts`, built field by field — never by spreading private state) exposes `yourDice` only to the owning seat; everyone else sees just `diceCount`. `lastReveal.allDice` is populated only once a call resolves and is only surfaced in `revealing` / `roundOver` / `gameOver`; `rerollAll` clears it before the next roll, so fresh dice never ride along with the old recap. `history` keeps past (already public) reveals. The RNG `seed` / `rngCursor` never leave the host. Spectators get no dice.

## AI

`ai.ts` decides from `viewFor(state, seat)` only: its own dice are known, every other die is a binomial prior (p = 1/3 for a wild-able face, 1/6 otherwise). It compares the risk of calling liar, spot-on, and the best few raises, with jitter and a bluff mixer. The private seed is used purely as an entropy source. Tests assert the AI's choice is invariant to opponents' hidden dice.

## Phase machine

- `rollPending` — dice are rolled; every alive seat acks.
- `bidding` — active seat bids up OR calls (liar / spot-on).
- `revealing` — actual count vs. bid; loser drops a die; every alive seat acks.
- `roundOver` — ack; reroll. The loser leads the next round (next live seat if they're out).
- `gameOver` — last seat with dice wins.

Every action is validated: right phase, a real still-alive `bySeat`, turn order, a well-formed bid (integer count, face 1–6), and no duplicate acks.

## UI

Pirate tavern (`ui/`): plank table with grain and candlelight, leather cups (`DiceArt.tsx`), ivory dice with proper pip layouts. Cups shake until their owner has looked, dice tumble in on each roll, cups lift on the reveal, dice that count toward the bid glow, and the loser's die rolls off the table. Pass-and-play uses a hand-off cover (`ui/useHotSeat.ts`) that keeps every die out of the DOM until the right player reveals.
