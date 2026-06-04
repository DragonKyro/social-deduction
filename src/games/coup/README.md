# Coup

2-6 player bluffing game. Each player starts with 2 face-down character cards. Each character grants a unique action; you may claim ANY character regardless of your real hand, but opponents may challenge. Fail a challenge and you lose an influence. Lose both = eliminated. Last player standing wins.

## Scope

**Classic base game** ships first (Phase 5):
- 5 characters × 3 copies = 15-card deck: Duke, Assassin, Captain, Ambassador, Contessa
- Cross-blocking is allowed (Captain blocks steal AND Ambassador blocks steal)

**Coup: Rebellion G54** (Phase 5b):
- Standalone game. 25-character variable pool; each match picks **5 of 25**. Three copies of each = 15-card deck (same total as classic).
- Characters are organized into 5 categories of 5 — **Finance**, **Communications**, **Force**, **Special Interest**, **Movement**.
- **Same-role-only blocking** per the G54 rulebook (Captain-steal is blockable only by Captain, etc.).
- Tokens enter the game state: Peacekeeping (untargetable while held), Treaty (pair-mutual non-targeting).
- New character mechanics deferred from classic: pile-on claims (Capitalist), self-scaling steal (Speculator), group-rally eliminations (Protestor).

**G54: Anarchy expansion** (Phase 5c) — on top of G54:
- 6 additional characters: Anarchist, Arms Dealer, Financier, Paramilitary, Plantation Owner, Socialist (World Bank may ship as a 7th depending on rulebook resolution).
- New **Social Media** general action (not a character claim, but has its own challenge window).
- Match still picks 5 characters; Anarchy just widens the pool from 25 to ~31.

We're skipping the original Reformation expansion. G54 + Anarchy gives more replayability per match (random 5-of-25/31 deck = thousands of distinct game-shapes) with the same base mechanic.

## Hidden info

Coup's redaction model is the messiest of the four games — the challenge window is a small state machine where:
- The active player's claim is public.
- The deck is fully hidden (deck-order leaks would break exchange + G54 Inquisitor entirely).
- Only the challenged player sees their own cards.
- During exchange, the pick set is shown ONLY to the active seat (`yourExchangeOffer`).
- Lost influences are public (`influences[i].revealed = true` → character is shown to everyone).
- G54 Spy peeks: the peek result lives only in the spying seat's view; nobody else's view contains it.

The challenge/block window (`awaitingChallenge` → `awaitingBlock` → `challengeReveal` → `loseInfluence`) is the trickiest part of the engine to get right; it lands in Phase 5 with a dedicated state-machine module that classic and G54 share.

## Rule data

Per-character ability tables live under `rules/`:

- `rules/classicCharacters.ts` — the 5 base characters (Phase 5).
- `rules/g54Characters.ts` — the 25 G54 characters (Phase 5b).
- `rules/g54Anarchy.ts` — the 6+ Anarchy characters + Social Media (Phase 5c).

Each table entry is a discriminated record (`actionId`, cost, target type, blockable-by, challengeable, on-resolve handler). The engine's challenge/block machine reads from these tables, so adding a new character is one entry — no new switch arms in the engine.

## AI considerations

Bluffing isn't just heuristics — the AI needs a model of how often it bluffs and when to call others' bluffs. The Coup AI ships as a probability-table baseline (see `ai.ts`) that tracks each opponent's claim history and adjusts a per-claim "trust" weight. G54 widens the action space considerably, so the AI's claim/challenge policy is parameterized by the active 5-character set rather than hardcoded.
