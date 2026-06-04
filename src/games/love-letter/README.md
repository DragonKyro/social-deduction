# Love Letter

Micro deduction for 2–4 players. The 16-card deck is fully public; each player holds at most one card off-turn, and a single card is set aside face-down each round.

## How it works

1. **Setup.** Shuffle the 16-card deck. Remove one card face-down. In a 2-player game, reveal three more cards face-up. Deal one card to each player. The starting seat draws one (so they begin with two cards).
2. **Turn.** On your turn: draw one card (if you haven't already) so you have two, then **play one** and resolve its effect.
3. **Forced Countess.** If you hold the Countess together with the King or the Prince, you must play the Countess.
4. **Round end.** The round ends when only one player is left in, or when the deck runs out. The winner is the last in or, on deckout, the player holding the highest-rank card (tie → highest sum of discarded ranks). The winner gains one token.
5. **Match end.** First to the per-count token target wins the suit. **2p: 7, 3p: 5, 4p: 4** (rulebook).

## Card effects

| # | Card | Effect |
|---|------|--------|
| 1 | Guard ×5 | Name a non-Guard rank and target. Correct → target is out. |
| 2 | Priest ×2 | Privately see a target's hand. |
| 3 | Baron ×2 | Compare hands with a target. Lower is out. Tie → no effect. |
| 4 | Handmaid ×2 | You're immune to other players' effects until your next turn. |
| 5 | Prince ×2 | Target (including yourself) discards & redraws. Princess discarded → out. |
| 6 | King ×1 | Swap hands with a target. |
| 7 | Countess ×1 | Mandatory discard if held with King or Prince. Otherwise harmless. |
| 8 | Princess ×1 | If you ever discard this, you're out. |

When every other player is Handmaid-protected (or otherwise has no valid target), a targeting card discards with **no effect**.

## File layout

- `state.ts` — phase enum, private state, public view (the redaction chokepoints are `yourHand` and `yourPriestPeek`).
- `actions.ts` — discriminated action union (`ackStart`, `playCard`, `chooseTarget`, `guardGuess`, `ackEffect`, `ackPriest`, `ackRoundOver`).
- `setup.ts` — seeded shuffle, set-aside, per-seat deal, starting-seat pick. Independent RNG streams.
- `module.ts` — `GameModule` impl: phase machine, effect resolution, round + match settlement.
- `ai.ts` — heuristic AI for filling hot-seat seats. Honors the Countess rule and never plays the Princess voluntarily, but otherwise plays passively.
- `ui/LoveLetterSetup.tsx`, `ui/GameView.tsx` — host setup and per-seat play.
- `module.test.ts` — 29 tests covering deal determinism, redaction, every card effect, Countess force, round-end conditions, AI smoke, and the no-targets edge case.

## Hidden information model

- Every player's `hand` is private to that seat. The owning seat receives `yourHand`; everyone else sees only `handSize` for that player.
- The face-down `setAside` card and the entire `deck` are private to the host. Neither is ever serialized into the public view.
- The Priest peek is addressed only to the actor: `yourPriestPeek` is populated only for the seat that played the Priest. Everyone else sees "X is peeking at Y's card" but not the card itself.
- Discards are fully public — they're the only deduction signal the game gives you.

## Rule clarifications

- **Guard cannot guess Guard.** The engine rejects the action.
- **King cannot target self.** The engine rejects (there'd be no effect anyway).
- **Prince may target self.** Self-Prince discards your own hand and redraws (useful if you'd be forced to discard the Princess on your own turn — but voluntarily discarding the Princess via Prince still eliminates you).
- **Prince on Princess** discards the Princess → target is out and does NOT redraw.
- **Prince on empty deck** redraws from the face-down `setAside` card (rulebook).
- **Baron tie** is no effect for both players — both keep their cards and stay in.
- **Round-end tiebreak** on deckout: highest rank in hand wins; if still tied, highest sum of cards in their discard. Token may be split if still tied at that point (rare; the engine surfaces all tied seats).
- **Starting seat** of round 2+ is the seat that won the previous round (or, on a tie, the first of the tied seats — which itself was tie-broken by discard sum).
