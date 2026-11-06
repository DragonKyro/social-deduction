# Codenames

Word-association deduction. Two teams (red and blue), each with one
spymaster and one or more operatives. A 5×5 grid of words is dealt face
up; the spymasters see a private key that colors each word as red, blue,
bystander, or assassin. Spymasters take turns giving a one-word clue +
a number, and their team's operatives try to identify the words that
match.

This implementation follows the published base-game rules.

## Files

- `state.ts` — `CodenamesPrivateState` / `CodenamesPublicState`, card
  shape, phase enum.
- `actions.ts` — `giveClue`, `guessCard`, `endGuessing`.
- `setup.ts` + `seed.ts` — deals the 25-card board (9 / 8 / 7 / 1). The
  word layout + starting team come from a *public* derived seed and the key
  from a separate *private* one (see "Hidden-info chokepoint").
- `rules.ts` — clue validation (`clueProblem`), `maxGuesses`,
  `visibleWords`; shared by reducer, AI and UI.
- `view.ts` — `codenamesViewFor`, the redaction chokepoint.
- `module.ts` — engine reducer. Validates clues, gates guesses, switches
  the current team on a wrong guess or hint cap, and ends the game when
  a team flips all their cards or the assassin.
- `ai.ts` + `lexicon.ts` — heuristic AI over a hand-curated word
  association lexicon (also used by Cross Clues' AI).
- `ui/` — setup screen, dossier-themed game view, agent-portrait sprite
  (`ui/art.tsx`).

## Options

`players` is overwritten by the shared launcher and the online lobby with
plain `{ name, isAI }`, so each seat's team + role travel separately in
`options.teams` (seat-indexed `{ team, role }`). Legacy `players[i].team /
role` still wins when every seat has them. If `teams` is missing or its
length doesn't match the seat count (the lobby changed size), the default
split is used: first half red, second half blue, first seat of each team is
its spymaster.

## Phase machine

```
clue → guessing → clue → … → gameOver
```

- `clue`: current team's spymaster types a single word + a number 0–9.
  0 = the rulebook's "zero" clue (unlimited guesses). The clue may not be
  any form of a word still face-up on the board (plural / tense / -er, or a
  compound containing a 4+ letter visible word). Covered words become legal
  again, as in the rulebook. ≤ 24 chars; letters, digits, inner hyphens /
  apostrophes.
- `guessing`: any operative on the current team taps a card.
  - **Correct guess** (own color): turn continues. Up to `clueNumber + 1`
    guesses total. Unlimited (0) keeps going as long as they hit own
    cards.
  - **Wrong guess** (opponent / bystander): turn ends immediately.
  - **Assassin**: game over, guessing team loses.
  - **All own cards revealed**: game over, that team wins.
  - **End turn button**: operatives may stop voluntarily after at least
    one guess. Cannot stop before guessing at least once.

## Hidden-info chokepoint

`viewFor` (`view.ts`) redacts each card's `kind` to `null` unless: the card
is already revealed (everyone sees revealed cards), the viewer is a
spymaster (they see the full key from the start), or the game is over
(final reveal). Spectators (`seat = null`) and out-of-range seats get the
operative view. Nothing else in the view is derived from the key (tests
assert an operative's view is byte-identical under a permuted key), and the
seed is never copied into a view.

Seed: the word order is public, so if the key came from the same stream (or
a cheap function of the same small seed) a peer could brute-force the seed
from the board and recompute the key. The key therefore comes from
`privateSeed`, which also mixes in the match seed's bits above 2^32. With
today's 31-bit seeds this is hardening only; a wider host seed makes it a
real separation.

## Hot-seat flow

Uses `useSeatSwitching()` only. With more than one human on the device:

- **Clue**: a manila "eyes only" folder covers the table until the current
  (human) spymaster presses "open the file" for *this* clue; only then is
  the device switched to their seat and the key rendered.
- **After the clue**: the device is still on the spymaster's seat, so the
  view is covered ("transmission sent") — the key is not rendered — until
  someone opens the board for the table, which switches to a non-spymaster
  seat. Guesses are sent as a human operative of the current team, with a
  tap-twice confirm.
- A single human (vs AI) or an online player just sees their own seat.

## AI

`aiChooseAction` works only from `codenamesViewFor(state, seat)`, so an AI
operative never sees the key (tested: identical decisions under a permuted
key) while an AI spymaster uses its own spymaster view.

- Spymaster: for every theme key in the lexicon, simulates how an operative
  would rank the face-up words and counts its own agents ranked strictly
  above every other word; picks the largest safe count, never with the
  assassin within reach. Falls back to a rhyme / prefix clue for one agent,
  then to any legal word, so it never stalls.
- Operative: ranks face-up words by relatedness to the clue (plus leftovers
  from the team's earlier clues), always makes the mandatory first guess,
  stops when nothing looks related. AI operatives defer to any human
  operative on their team.

## Player counts

4–16. Default split puts the first half on red and the second half on
blue, with each team's lowest-numbered seat as its spymaster. The setup
screen lets the host re-team and re-crown spymasters with a tap.

## Not implemented yet

- Codenames Duet, Pictures, and Deep Undercover variants.
- Timer / "trust your spymaster" sand timer.
