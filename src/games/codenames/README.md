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
- `setup.ts` — deals the 25-card board (9 / 8 / 7 / 1 by team, bystander,
  assassin) using the seeded RNG.
- `module.ts` — engine reducer. Validates clues, gates guesses, switches
  the current team on a wrong guess or hint cap, and ends the game when
  a team flips all their cards or the assassin.
- `words.ts` — default word pool (~330 words). Hosts can override via
  `CodenamesOptions.wordPool`, though the UI doesn't expose that knob
  yet.
- `ui/` — setup screen + hot-seat aware game view.

## Phase machine

```
clue → guessing → clue → … → gameOver
```

- `clue`: current team's spymaster types a single word + a number 0–9.
  0 = "unlimited" per rulebook. The clue cannot match any word on the
  board (including already-revealed ones).
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

`viewFor` redacts each card's `kind` to `null` unless: the card is
already revealed (everyone sees revealed cards), the viewer is a
spymaster (they see the full key from the start), or the game is over
(final reveal).

The operatives' view contains no hint of which un-flipped cards are
red/blue/bystander/assassin. That's the whole point of the chokepoint.

## Hot-seat flow

The game view shows a "pass the device" cover screen between turns:

- During the **clue** phase, only the current team's spymaster should
  see the screen (they alone see the key).
- During the **guessing** phase, the current team's operatives discuss
  out loud; the spymaster must stay silent. The cover screen prompts
  any operative to claim the device.

In online play we'll rely on per-peer `viewFor` redaction — the cover
screen doesn't matter when each peer has their own device.

## Player counts

4–16. Default split puts the first half on red and the second half on
blue, with each team's lowest-numbered seat as its spymaster. The setup
screen lets the host re-team and re-crown spymasters with a tap.

## Not implemented yet

- AI seats (no `aiChooseAction`). Spymastering needs a clue generator;
  operatives need an associator. Both are hard enough to be its own
  phase — out of scope for first wiring.
- Codenames Duet, Pictures, and Deep Undercover variants.
- Themed deck pickers in the UI (the `wordPool` hook exists, no UI for
  it yet).
- Timer / "trust your spymaster" sand timer.
