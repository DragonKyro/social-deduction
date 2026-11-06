# Cross Clues

Cooperative word game for 2–6 players (best with 3–6). Players share a 5×5 grid of secret words and try to guide each other to coordinates with one-word clues.

## How it works

1. **Setup.** Deal 10 secret words onto the grid: 5 as row labels (A–E) and 5 as column labels (1–5). Everyone studies the grid for a moment, then acks.
2. **Clue.** The active clue-giver privately draws the top of a shuffled 25-card coordinate deck (e.g. `C3`). Only they see it. They write a **single-word clue** that connects the row word and the column word.
3. **Guess.** The next player in turn order — the designated guesser — submits the team's single guess.
4. **Reveal.** Correct → green token on the held coordinate. Wrong → red token on the held coordinate (not on the guess). Either way, the cell is now resolved.
5. **Rotate.** The clue-giver shifts +1 around the table; the new guesser is +1 from them. Repeat until all 25 coordinates are played.

Final score is correct guesses out of 25. Rulebook tiers: **16+ great**, **21+ legendary**, **25 perfect**.

## File layout

- `state.ts` — phase enum, private state, public view shape.
- `actions.ts` — discriminated action union (`ackSetup`, `submitClue`, `submitGuess`, `ackReveal`).
- `setup.ts` + `seed.ts` — seeded grid-word deal (public stream), coord-deck shuffle (private stream), starting-seat pick.
- `rules.ts` — clue validation (`clueProblem` / `normalizeClue`), coordinate checks, labels.
- `view.ts` — `crossCluesViewFor`, the redaction chokepoint.
- `module.ts` — `GameModule` impl: phase machine, validation, scoring.
- `ai.ts` — heuristic AI over the shared association lexicon (`@/games/codenames/lexicon`).
- `ui/CrossCluesSetup.tsx`, `ui/GameView.tsx` — notebook-themed setup and per-seat play.
- `module.test.ts`, `audit.test.ts`, `ui/GameView.test.tsx` — rules, redaction, AI self-play, hot-seat covers.

## Hidden information model

The held coordinate and the deck order are the only hidden information. `viewFor` exposes `yourCoord` **only** to the current clue-giver, while they hold the card (`clueGiving` and the `guessing` that follows). Spectators and every other seat get `null`; once the round resolves the coordinate is public via `lastRound` and the grid. Tests assert every non-holder view is byte-identical whichever card is held. The deck comes from a separate private derived seed so it can't be recomputed from the public word deal (hardening; see `seed.ts`). There is no `winnerTeam` (cooperative); `scoreRating` summarises the result instead.

## Hot-seat flow

With more than one human on the device (via `useSeatSwitching()`): a "pass the notebook" note covers the grid until the clue-giver claims the device for this round; their card is dealt face-down and flipped up. After the clue is sent the card is covered again before the table sees the board, and the device guesses as the designated guesser (tap a square, then confirm). Setup / reveal acknowledgements are a single press for every human at the device.

## AI

`aiChooseAction` works only from the seat's own view, so an AI guesser never sees the held card (tested). The clue-giver tries every word in the shared lexicon and keeps the one that singles out its square (row word + column word) above every other open square; if none does, it writes a legal blend of the two words (OCEAN × PIANO → "OCEAIANO"). The guesser scores open squares by how strongly the clue relates to both words (themes, rhymes, blends).

## Rule clarifications

- **One-word clue**: trimmed, no internal whitespace, ≤ 32 chars. Hyphens and apostrophes are allowed (`zz-top`, `don't`), but neither the clue nor any hyphen/apostrophe-separated part may be (a form of) one of the 10 grid words — otherwise `OCEAN-PIANO` would just name the answer. Semantic single-word is a social-trust rule, same as the physical game.
- **Resolved cells can't be guessed**: the engine throws and the UI disables them.
- **Wrong guess**: the card is discarded — its *true* cell is crossed out (red), not the guessed cell. The guessed cell remains open.
- **Designated guesser**: the physical game has the table agree on a guess; here the seat after the clue-giver enters it while the others discuss. The clue-giver can't guess.
- **2-player game**: roles alternate naturally via `(clueGiver + 1) % 2`. Allowed but flagged "best with 3–6" in setup.
- **Reveal ack**: every seat must press Continue before the next round starts, matching the cooperative discussion tone.
