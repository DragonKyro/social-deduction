# Love Letter

Micro deduction for 2–4 players with the classic 16-card deck. The deck composition is public; each player holds at most one card off-turn, and one card is set aside face-down each round.

## How it works

1. **Setup.** Shuffle the 16-card deck. Remove one card face-down. In a 2-player game, reveal three more cards face-up. Deal one card to each player. The starting seat draws one (so they begin with two cards).
2. **Turn.** On your turn: draw one card so you have two, then **play one** and resolve its effect.
3. **Forced Countess.** If you hold the Countess together with the King or a Prince, you must play the Countess.
4. **Round end.** The round ends when only one player is left in, or when the deck is empty at the end of a turn. The winner is the last one in or, on deckout, the player holding the highest card (tie → highest sum of their discards; still tied → every tied player takes a token). The winner gains one token and starts the next round.
5. **Match end.** First to the per-count token target wins. **2p: 7, 3p: 5, 4p: 4** (rulebook).

## Card effects

| # | Card | Effect |
|---|------|--------|
| 1 | Guard ×5 | Name a non-Guard card and a player. If they hold it, they're out. |
| 2 | Priest ×2 | Privately look at another player's hand. |
| 3 | Baron ×2 | You and another player compare hands **in secret**; the lower card is out. Tie → nothing. |
| 4 | Handmaid ×2 | You're immune to other players' effects until your next turn. |
| 5 | Prince ×2 | A player (you may choose yourself) discards their hand and draws. Princess discarded → out. |
| 6 | King ×1 | Trade hands with another player. |
| 7 | Countess ×1 | Must be played if held with the King or a Prince. Otherwise no effect. |
| 8 | Princess ×1 | If you discard her, you're out. |

When every other player is Handmaid-protected, a targeting card is discarded with **no effect** (the Prince must then target yourself).

## Hidden information model

`view.ts` is the single redaction chokepoint. It builds the public view field by field and never includes `deck`, `setAside`, `seed`, `rngCursor`, other seats' `hand`, or the private effect records.

- **Hands.** Each seat's `hand` is sent only to that seat (`yourHand`); everyone else sees `handSize`. Spectators (`seat = null`, or an unknown seat index) get no hand at all.
- **Deck / set-aside / seed.** Host-only. The seed and RNG cursor would let a peer replay the shuffle, so they never leave the host.
- **Priest.** The peeked card is in `yourPriestPeek`, addressed only to the Priest player. Everyone else sees "X's Priest looks at Y's hand".
- **Baron.** Only the two players see both cards (`yourSecret`, kind `baron`). The public `lastEffect` names just the loser and the loser's card (it's discarded face-up when they're knocked out). On a tie nothing is revealed to anyone else.
- **King.** Both participants see which cards changed hands (`yourSecret`, kind `king`); bystanders only learn that a trade happened.
- **Knowledge.** The host tracks what each seat has legitimately learned about other hands (Priest peek, Baron tie, King trade) and keeps it correct as cards move: kept if the holder plays a different card, dropped if they play that rank or are Prince'd/knocked out, and moved with the cards on a King trade. A seat sees only its own entries (`yourKnowledge`): a memory aid for humans, and the AI's only source of hand information.
- **Round end.** Deckout hands are shown at the showdown. A last-standing survivor never reveals their card.
- **Public log.** `lastEffect` and `log` are public by construction: they only name cards that went face-up for the whole table.

## AI

`ai.ts` decides from `viewFor(state, seat)` only (`chooseFromView`), so it can't see what a human in that seat couldn't. It counts cards from discards, the face-up removed cards, its own hand and its `yourKnowledge`; it never reads the deck, the set-aside card or other hands. It names known cards with the Guard, Princes a known Princess, avoids Baron duels it's likely to lose, never discards the Princess voluntarily, honours the Countess rule, and values its kept card more as the deck runs down. Randomness comes from a hash of the view (the seed is private). It returns `null` whenever its seat has nothing to do.

## Hot-seat

The UI uses `useSeatSwitching()` (via `ui/hotseat.ts`). When another human seat must make a private decision, the screen drops to the spectator view and shows a "pass the device" cover. Shared beats (round start, reveals, round over) are acknowledged for every local human with one click. Online, switching is disabled.

## File layout

- `state.ts`: phases, private state, public view, effect / secret / knowledge types.
- `actions.ts`: discriminated action union (`ackStart`, `playCard`, `chooseTarget`, `guardGuess`, `ackEffect`, `ackPriest`, `ackRoundOver`).
- `setup.ts`: seeded shuffle, set-aside, per-seat deal, starting-seat pick.
- `module.ts`: `GameModule` impl. Validation, effect resolution, knowledge bookkeeping, round + match settlement.
- `view.ts`: `viewFor` (the redaction chokepoint).
- `ai.ts`: view-only heuristic AI.
- `ui/CardArt.tsx`: SVG card faces (per-rank portraits), the sealed-letter card back, and gem-heart tokens.
- `ui/GameView.tsx`: velvet table with animated stage (deal, play-to-discard, Priest peek flip, Baron duel, King swap, eliminations, token pop).
- `ui/LoveLetterSetup.tsx`: setup with per-seat AI toggles.
- `module.test.ts`: rules. `audit.test.ts`: redaction, validation, AI fairness, all-AI self-play. `ui/GameView.test.tsx`: DOM smoke tests (solo, hot-seat cover, online, all-AI match).

## Rule clarifications

- **Guard cannot name the Guard.** The engine rejects it (as well as any non-rank guess).
- **King cannot target yourself.**
- **Prince may target yourself** at any time; if every opponent is protected it must.
- **Prince on the Princess** → the target is out and doesn't draw.
- **Prince with an empty deck** → the target draws the face-down set-aside card.
- **Baron tie** → no effect; both players now know each other's card.
- **Starting seat** of round 2+ is the previous round's winner (first of the tied winners on a split).
