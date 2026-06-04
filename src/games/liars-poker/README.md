# Liar's Poker

2–8 player bluffing game over a standard 52-card deck. Declare a poker hand that exists somewhere across everyone's combined cards, or call liar.

## Setup options

- **Cards per player** — 1 to 5. Default 3.
- **Dummy-hand last life** — when a player loses their final card, they get one last round dealt a single card they cannot see but everyone else can. Default on.

## Hand ranking

Standard 8-category order: high card → pair → two pair → three of a kind → straight → flush → full house → four of a kind → straight flush. Within each category, **higher rank is stronger**, with one important exception:

- **Plain flushes invert** — lower top card is *stronger*. A 6-high flush beats an A-high flush. Rationale: a flush is declared by `{topRank, suit}` and requires the exact top card present + 4 strictly-lower same-suit cards. The lower the top, the fewer same-suit cards available below — hence harder to find.
- Straight flushes use **standard** high-rank-wins.

See [hands.ts](hands.ts) for the `compareClaim` + `claimExists` implementation and [hands.test.ts](hands.test.ts) for the inverted-flush coverage.

## Hidden info

Each seat's hand. The `viewFor` chokepoint exposes `yourHand` only to the owning seat. Dummy-hand inversion: a dummy seat's own `yourHand` is empty; every *other* seat sees `players[dummy].visibleHand`. On reveal, every seat sees `lastReveal.allHands`.

## Phase machine

- `dealPending` — cards dealt; every alive seat acks.
- `bidding` — active seat declares a strictly stronger hand OR calls liar.
- `revealing` — claim checked against combined pool; loser drops a card.
- `roundOver` — ack; redeal.
- `gameOver` — last seat not eliminated wins.

## End conditions

Last player with cards (or a dummy life remaining) wins.
