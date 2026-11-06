# Cockroach Poker

3–6 player bluffing game. Pass face-down creature cards with a claim ("This is a rat"). The receiver calls it true or false, or peeks and passes it onward. Get 4 of any one creature face-up in front of you → you lose.

## Setup

No options — just player count + names (+ AI seats). 64-card deck (8 creatures × 8), dealt evenly; leftovers (1 at 3p, 4 at 5–6p) are set aside unseen and never stored.

## Rules as implemented

- **Pass** (`startPass`): the active seat picks a card from hand, names any creature, and slides it to any other seat.
- **Call** (`decide`): the holder says `truth` (it IS the claim) or `lie` (it is NOT). The card flips. A correct call sends it face-up to the seat that passed it to the holder (the most recent claimant, not necessarily the original sender); a wrong call keeps it face-up with the holder.
- **Peek & pass on** (`peek`, then `passOn`): the holder looks at the card first, then MUST pass it on with a new (or the same) claim to a seat that hasn't seen it this chain. Peeking is refused when nobody unseen remains — the last holder must call.
- Whoever takes the card face-up starts the next turn.
- **Losing**: 4 of one creature face-up (checked after everyone acks the reveal), or having to start a turn with no cards in hand. One loser; everyone else wins.

## Hidden info

Each seat's hand contents, and the card in transit — visible to the original sender and every seat that has peeked (`pass.seenBy`). The `viewFor` chokepoint (`view.ts`, built field by field) exposes `yourHand` to the owner and `yourPeekedCard` only to seats in `seenBy`; who has seen it, the claims and the chain are public (as at a real table). `lastReveal` exists only in `revealing` / `gameOver`. The RNG `seed` never leaves the host.

## AI

`ai.ts` decides from `viewFor(state, seat)`. An unpeeked holder does not know the card: it estimates P(claim true) from face-up rows and its own hand (0 when every copy is accounted for), compares the expected damage of calling true / false / peeking, and only learns the card by actually peeking. Passers shed creatures they're least exposed to, aim at the opponent most exposed, and tell the truth ~1/3 of the time. A per-turn nonce keeps choices unpredictable.

## Phase machine

- `dealPending` — cards dealt; every seat acks.
- `passing` — active seat picks a card + claim + target.
- `decide` — holder calls, or peeks (then must pass on).
- `revealing` — card flipped and placed; everyone acks.
- `gameOver` — a seat has lost (`lossReason`: `fourOfAKind` | `emptyHand`).

## UI

Comic-gothic parlour (`ui/`): eight cartoon creatures (`CreatureArt.tsx`, each drawn once as an SVG `<symbol>` and reused via `<use>`) in pointed-arch card frames. The passed card slides across the table, lifts when you peek, and flips on the call with a TRUE/LIE stamp; face-up penalty rows stack visibly, pulse red at three and stamp OUT at four. Pass-and-play uses a hand-off cover that keeps hands and the peeked card out of the DOM.
