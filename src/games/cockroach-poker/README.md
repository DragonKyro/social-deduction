# Cockroach Poker

3–6 player bluffing game. Pass face-down creature cards with a verbal claim ("This is a rat"). Receiver believes, challenges, or peeks-and-passes onward. Get 4 of any one creature face-up in front of you → you lose.

## Setup

No options — just player count + names. 64-card deck (8 creatures × 8).

## Hidden info

Each seat's hand contents. The face-down card *in transit* is visible to (a) the original sender and (b) any seat that has peeked at it this chain. The `viewFor` chokepoint exposes `yourHand` to the owning seat and `yourPeekedCard` to seats in `pass.seenBy`. After reveal, the card is public.

## Phase machine

- `dealPending` — cards dealt; every alive seat acks.
- `passing` — active seat picks a card, claims a creature, sends to a target.
- `decide` — current holder decides: believe (truth), reject (lie), or peek-and-pass on (must include a new claim + a target who hasn't seen the card).
- `revealing` — wrong guesser takes the card face-up.
- `gameOver` — match ends when any seat has 4 of one creature.

## End conditions

Single loser — the seat that hits 4 of one creature face-up.
