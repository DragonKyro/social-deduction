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

- `state.ts` — phase enum, private state, public view shape (the single redaction chokepoint is `yourCoord`).
- `actions.ts` — discriminated action union (`ackSetup`, `submitClue`, `submitGuess`, `ackReveal`).
- `setup.ts` — seeded grid-word deal, coord-deck shuffle, and starting-seat pick (independent RNG streams).
- `module.ts` — `GameModule` impl: phase machine, validation, scoring, redaction.
- `ai.ts` — heuristic AI for filling solo/hot-seat seats. Not designed to play well.
- `word-packs/` — three bundled packs: `standard`, `spicy`, `kids`.
- `ui/CrossCluesSetup.tsx`, `ui/GameView.tsx` — host setup and per-seat play.
- `module.test.ts` — 31 tests covering deal determinism, phase transitions, redaction, scoring, rotation, AI smoke, and rating tiers.

## Hidden information model

Only the active clue-giver's coordinate is hidden. `viewFor` exposes `yourCoord` **only when** `phase === 'clueGiving'` AND `seat === currentClueGiver`. Spectators and every other seat get `null`. There is no `winnerTeam` (cooperative); `scoreRating` summarises the result instead.

## Rule clarifications

- **One-word clue**: trimmed, no internal whitespace, ≤ 32 chars. Hyphens and apostrophes are allowed (`fire-river`, `don't`). The engine doesn't enforce semantic single-word — that's a social-trust rule, same as the physical game.
- **Resolved cells can't be guessed**: the engine throws and the UI disables them.
- **Wrong guess paints the *true* cell red**, not the guessed cell. The guessed cell remains unresolved.
- **2-player game**: roles alternate naturally via `(clueGiver + 1) % 2`. Allowed but flagged "best with 3–6" in setup.
- **Reveal ack**: every seat must press Continue before the next round starts, matching the cooperative discussion tone.
