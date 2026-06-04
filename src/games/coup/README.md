# Coup

2-10 player bluffing game. Each player starts with 2 face-down character cards out of a 5-character deck (Duke, Assassin, Captain, Ambassador, Contessa — 3 of each = 15 cards). Each character grants a unique action; you may claim ANY action regardless of your real hand, but opponents can challenge — if challenged and you can't prove the claim, you lose an influence. Lose both = eliminated. Last player standing wins.

## Scope

**Base game** ships first (Phase 5).

**Expansions** (planned, Phase 5+):
- **Reformation** — Inquisitor (replaces Ambassador in some configs), allegiance/faction mechanic, increases max players to 10.
- **Inquisitor variant** — drop-in Ambassador replacement (no allegiance complexity).
- **Anarchy** — adds Reformer, Censor (planned, later).

## Hidden info

Coup has the messiest redaction model of the four games — the challenge window is a small state machine where:
- The active player's claim is public.
- The deck is fully hidden (deck order leaking would break exchange entirely).
- Only the challenged player sees their own cards.
- During exchange, the 4-card pick set is shown ONLY to the active seat (`yourExchangeOffer`).
- Lost influences are public (`influences[i].revealed = true` → the character is shown to everyone).

The challenge/block window (`awaitingChallenge` → `awaitingBlock`) is the trickiest part of the engine to get right; that lands in Phase 5 with a dedicated state-machine module.

## AI considerations

Bluffing isn't just heuristics — the AI needs a model of how often it bluffs and when to call others' bluffs. The Coup AI ships as a probability-table baseline (see `ai.ts`) that tracks each opponent's claim history and adjusts a per-claim "trust" weight. Not strong, but more interesting than always-pass.
