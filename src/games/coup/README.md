# Coup

2-6 player bluffing game. Each player starts with 2 face-down character cards. Each character grants a unique action; you may claim ANY character regardless of your real hand, but opponents may challenge. Fail a challenge and you lose an influence. Lose both = eliminated. Last player standing wins.

## Status

Hot-seat playable. The setup screen lets the host pick the **ruleset** (Classic / G54 / G54 + Anarchy) and curate the exact characters in this match's deck. Default is the five Classic characters.

## What's implemented

**General actions (always legal):**
- Income (+1 coin, no challenge / no block)
- Foreign Aid (+2 coins, blockable by Duke or Banker)
- Coup (pay 7, target loses an influence; 10-coin-rule enforced)

**Challenge / block flow:** full state machine over `awaitingChallenge → awaitingBlock → awaitingBlockChallenge → challengeReveal → loseInfluence`. Honest claims trigger card-swap + redraw; bluffs forfeit the claimer.

**Classic 5 characters** — Duke, Assassin, Captain, Ambassador, Contessa — fully implemented with rulebook accuracy, including cross-blocking (Captain + Ambassador both block steal).

**G54 — 8 characters fully implemented:**
- Banker (G54 Duke analogue)
- Tax Collector (1 from every other living player)
- Soldier (pay 3, no-block eliminate)
- Mercenary (pair-eliminate; partner pays 1)
- Thief (G54 Captain analogue; same-role blocking)
- Spy (private peek on a target card)
- Inquisitor (exchange 1 with the deck OR peek a target card)

**Anarchy — 1 character fully implemented:**
- Plantation Owner (+1 coin per living influence)

The remaining ~22 G54 / Anarchy characters appear in the picker with accurate rulebook descriptions but are greyed out — they exist in the character table and the type union but their custom mechanics (pile-on resolves, group-rally eliminate, token mechanics, etc.) aren't wired yet. The setup screen blocks selecting them so a host can't start an unplayable game.

**Ruleset differences:**
- Classic — cross-blocking (Captain + Ambassador both block steal).
- G54 — same-role only blocking; Captain steal can only be blocked by Captain, Ambassador exchange is unblockable.

**Cheatsheet:** the in-game view always shows a right-side panel listing every character in this match's deck with their power + general actions. This is your live reference during play.

## Scope (roadmap source-of-truth)

**Classic base** (Phase 5):
- 5 characters × 3 copies = 15-card deck: Duke, Assassin, Captain, Ambassador, Contessa
- Cross-blocking is allowed (Captain blocks steal AND Ambassador blocks steal)

**Coup: Rebellion G54** (Phase 5b):
- Standalone game. 25-character variable pool; each match picks 5-8.
- Characters are organized into 5 categories of 5 — **Finance**, **Communications**, **Force**, **Special Interest**, **Movement**.
- **Same-role-only blocking** per the G54 rulebook.
- Tokens enter the game state: Peacekeeping (untargetable while held), Treaty (pair-mutual non-targeting). Scaffolded in state; no character grants them yet.
- Deferred new mechanics: pile-on claims (Capitalist), self-scaling steal (Speculator), group-rally eliminations (Protestor).

**G54: Anarchy expansion** (Phase 5c) — on top of G54:
- 6 additional characters: Anarchist, Arms Dealer, Financier, Paramilitary, Plantation Owner, Socialist (World Bank may ship as a 7th depending on rulebook resolution).
- New **Social Media** general action — deferred.

We're skipping the original Reformation expansion. G54 + Anarchy gives more replayability per match (5-of-31 deck = thousands of distinct game-shapes) with the same base mechanic.

## Hidden info

Coup's redaction model is the messiest of the four games — the challenge window is a small state machine where:
- The active player's claim is public.
- The deck is fully hidden (deck-order leaks would break exchange + G54 Inquisitor entirely).
- Only the seat that owns an influence sees their own face-down cards (`yourInfluences`).
- During exchange, the pick set is shown ONLY to the active seat (`yourExchangeOffer`).
- Lost influences are public (`influences[i].revealed = true` → character is shown to everyone).
- Spy / Inquisitor peeks live in `yourPeeks` and are redacted out of every other seat's view.

## Files

- `state.ts` — host state shape (phases, seats, pending action, deck, peeks).
- `actions.ts` — discriminated union of every action a seat can dispatch.
- `characters.ts` — single declarative table of every character (Classic + G54 + Anarchy), with action / blocks / `implemented` flag. **This is where new characters land.** Adding a character that follows a standard action shape (gainCoins / steal / forceLoseInfluence / exchange / etc.) is one row.
- `setup.ts` — initial deal, character-set validation.
- `module.ts` — `GameModule` implementation + the full challenge/block state machine. The `applyAction` reducer is the single dispatch table.
- `ui/CoupSetup.tsx` — host setup screen with unified character checklist.
- `ui/GameView.tsx` — in-game view with the always-visible cheatsheet aside.
- `ui/CharacterArt.tsx` — inline SVG icons per character (matches ONUW / Avalon style).

## AI considerations

Bluffing isn't just heuristics — the AI needs a model of how often it bluffs and when to call others' bluffs. The Coup AI ships as a probability-table baseline (see `ai.ts`) that tracks each opponent's claim history and adjusts a per-claim "trust" weight. G54 widens the action space considerably, so the AI's claim/challenge policy is parameterized by the active character set rather than hardcoded. AI implementation is deferred to Phase 7.
