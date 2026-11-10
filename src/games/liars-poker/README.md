# Liar's Poker

2–8 player bluffing game over a standard 52-card deck. Declare a poker hand that exists somewhere across everyone's combined cards, or call liar.

## Setup options

- **Cards per player** — 1 to 5. Default 3.
- **Dummy-hand last life** — when a player loses their final card, they keep playing with a single card they cannot see but everyone else can. Losing a round as a dummy eliminates them. Default on. (Off: losing your last card eliminates you.)

## Hand ranking

Standard order: high card → pair → two pair → three of a kind → straight → flush → full house → four of a kind → straight flush. Within each category, **higher rank is stronger**, with one important exception:

- **Plain flushes invert** — lower top card is *stronger*. A 6-high flush beats an A-high flush. A flush is declared by `{topRank, suit}` and requires the exact top card present + 4 strictly-lower same-suit cards; the lower the top, the fewer same-suit cards available below — hence rarer. Flush tops run 6..A (an ace is never low in a flush). Equal tops break ties by suit (♠ > ♥ > ♦ > ♣).
- Straights and straight flushes use **standard** high-rank-wins and may be **ace-low**: a 5-high straight is A-2-3-4-5.

Every claim from the wire goes through `normalizeClaim` (`hands.ts`): unknown kinds, out-of-range or fractional ranks, two pair given low-first or on one rank, full houses on one rank, straights topping below 5 and flushes topping below 6 are rejected. `allClaims()` lists all 372 legal claims in strength order; `claimExistsIn` evaluates against a rank-count / suit-bitmask summary of the pool. See [hands.test.ts](hands.test.ts).

## Hidden info

Each seat's hand. The `viewFor` chokepoint (`view.ts`, built field by field) exposes `yourHand` only to the owning seat. Dummy-hand inversion: a dummy seat's own `yourHand` and own `visibleHand` are empty; every *other* viewer (spectators included) sees `players[dummy].visibleHand`. On reveal, every seat sees `lastReveal.allHands` (also mirrored into `visibleHand`) — only in `revealing` / `roundOver` / `gameOver`; `dealRound` clears it. The RNG `seed` / `rngCursor` never leave the host.

## AI

`ai.ts` decides from `viewFor(state, seat)`: known cards = own hand (none if it is a dummy) + visible dummy cards; every other card in play is Monte-Carlo sampled from the rest of the deck (90 shared samples per decision). It compares the risk of calling against the best raise, with jitter and a bluff mixer. Tests assert the decision is invariant to cards the seat can't see — including a dummy AI's own card.

## Phase machine

- `dealPending` — cards dealt; every alive seat acks.
- `bidding` — active seat declares a strictly stronger hand OR calls liar.
- `revealing` — claim checked against the combined pool; loser drops a card (or becomes a dummy / is eliminated).
- `roundOver` — ack; redeal. The loser leads (next live seat if eliminated).
- `gameOver` — last seat not eliminated wins.

## UI

Smoky back room (`ui/`): green baize with vignette under a lamp, a padded wooden rail, drifting smoke, realistic cards (`PlayingCard.tsx`: corner indices, standard pip layouts with inverted lower pips, double-headed J/Q/K, engraved back). Cards deal in, flip at showdown (cards making the called hand glow), and each claim drops a clay chip on the pot. Pass-and-play uses a hand-off cover that keeps card faces (including other players' dummy cards) out of the DOM.
