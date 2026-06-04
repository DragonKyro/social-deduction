# Coup

2-6 player bluffing game. Each player starts with 2 face-down character cards. Each character grants a unique action; you may claim ANY character regardless of your real hand, but opponents may challenge. Fail a challenge and you lose an influence. Lose both = eliminated. Last player standing wins.

## Status

Hot-seat playable. **All 37 characters across Classic, G54, and Anarchy execute end-to-end.** The setup screen lets the host pick the **ruleset** (Classic / G54 / G54 + Anarchy) and curate the exact characters in this match's deck. Default is the canonical one-per-category G54 lineup; deviating from one-per-category surfaces a non-blocking warning.

## What's implemented

**General actions (always legal):**
- Income (+1 coin)
- Foreign Aid (+2 coins, blockable by Duke / Banker / Bishop)
- Coup (pay 7, target loses an influence; in G54 blockable by Judge / Lawyer / Guerrilla / Paramilitary)

**Challenge / block flow:** full state machine `awaitingChallenge → awaitingBlock → awaitingBlockChallenge → challengeReveal → loseInfluence`. Honest claims trigger card-swap + redraw; bluffs forfeit the claimer.

**Classic (5 characters)** — Duke, Assassin, Captain, Ambassador, Contessa — fully implemented with cross-blocking (Captain + Ambassador both block steal).

**G54 (25 characters)** — five characters per category, all playable:

| Category | Characters |
|---|---|
| Finance | Banker, Capitalist, Speculator, Treasurer, Tax Collector |
| Communications | Newscaster, Reporter, Producer, Lobbyist, Spy |
| Force | Assassin (G54), Mercenary, Soldier, Guerrilla, Thief |
| Special Interest | Judge, Mayor, Priest, Lawyer, Bishop |
| Movement | Inquisitor, Protestor, Peacekeeper, Foreign Consular, Diplomat |

**Anarchy (7 characters)** — Anarchist, Arms Dealer, Financier, Paramilitary, Plantation Owner, Socialist, World Bank.

**Exotic mechanics** the engine now resolves:

- **Pile-on income** (Capitalist / Financier) — declare opens a `pileOnWindow`; opponents may join the pot for the same +N; closer-of-pile-on resolves payouts to every contributor.
- **Group-rally chip-in** (Protestor / Anarchist) — opponents may chip 1 coin each. When `ceil(opponents/2)` contributors are in, the target loses an influence.
- **Force-swap** (Newscaster / Reporter / Producer / Lobbyist / Diplomat) — draws 1 from the deck, then opens `targetSwapPick` for the target to pick which of their face-down cards to swap with it.
- **Tokens**:
  - `peacekeeping` — Peacekeeper grants this to themselves; opponents can't target them until they next act.
  - `treaty` — Foreign Consular pairs two seats; they can't target each other until a new Foreign Consular claim overwrites the bond.
  - `weapons` — Arms Dealer's sellInfluence grants +1 weapon (cap 3); each weapon adds +1 to your steals.
  - `reviveBlessed` — Bishop / Lawyer (self) and Priest (target) grant a one-shot save; the next loseInfluencePick that would eliminate the holder is canceled instead.
- **Custom-amount steal** (Speculator) — steals coins = min(own coins, 5).
- **Wealth redistribute** — Treasurer (equalize with target), Socialist (pool + redistribute evenly across living players), World Bank (+1 to every living player).
- **Coup blocks** (G54) — Judge / Lawyer / Guerrilla / Paramilitary can claim to block a Coup. Coup attacker still spends 7 coins; if the block stands, no influence is lost.
- **Arms Dealer sell** — flip one face-down card for 4 coins + 1 weapon token (can't sell your last influence).

**Category balance:**
- Total characters per match: 5 (Classic / G54) or 6 (G54 + Anarchy) — enforced strictly.
- One character per base category is the canonical G54 default. The setup screen seeds this default but lets the host pick freely; deviations show an off-balance warning.

**Ruleset differences:**
- Classic — cross-blocking (Captain + Ambassador both block steal).
- G54 — same-role only blocking; Captain steal can only be blocked by Captain, Ambassador exchange is unblockable.

**Cheatsheet:** the in-game view always shows a right-side panel listing every character in this match's deck with their power + general actions. Tokens are summarized when their granting character is in the deck.

## House rules

Several G54 / Anarchy characters lack a clear canonical rulebook citation. Where we've made a best-guess interpretation, the character description in the cheatsheet is prefixed `(house rule)` so a player at the table can flag a disagreement before the match instead of finding out mid-game. Examples:

- Newscaster / Reporter / Producer / Lobbyist / Diplomat — all interpreted as "draw 1 + force-swap a target card" with minor cost variations.
- Protestor / Anarchist — rally chip-in mechanic, threshold = ceil(opponents/2).
- Bishop / Priest / Lawyer — interpreted with extra revive-token + block-stacking semantics.
- Arms Dealer / Socialist / World Bank — interpreted as the simplest mechanic that fits the character's name.

If your group plays a different reading, edit `characters.ts` — actions are one-row entries pointing at the effect dispatcher in `module.ts`.

## Hidden info

Coup's redaction model is the messiest of the four games — the challenge window is a small state machine where:
- The active player's claim is public.
- The deck is fully hidden (deck-order leaks would break exchange + G54 Inquisitor entirely).
- Only the seat that owns an influence sees their own face-down cards (`yourInfluences`).
- During exchange, the pick set is shown ONLY to the active seat (`yourExchangeOffer`).
- Lost influences are public (`influences[i].revealed = true` → character is shown to everyone).
- Spy / Inquisitor / force-swap peeks live in `yourPeeks` and are redacted out of every other seat's view.
- Pile-on / chip-in pots are fully public.
- Treaty bonds + weapon counts are fully public (they're observable through play anyway).

## Files

- `state.ts` — host state shape: 14 phases, seats with tokens, pending action with pot / swap-in-progress / treaty-pair fields, deck, peeks.
- `actions.ts` — discriminated union of every action a seat can dispatch.
- `characters.ts` — single declarative table of every character (Classic + G54 + Anarchy), with action / blocks / `implemented` flag. **This is where new characters land.** Adding a character that follows a standard action shape (gainCoins / steal / forceLoseInfluence / exchange / pile-on / chip-in / force-swap / token-grant) is one row.
- `setup.ts` — initial deal, character-set validation, category-balance warning.
- `module.ts` — `GameModule` implementation + the full challenge/block/window state machine. The `applyAction` reducer is the single dispatch table.
- `ui/CoupSetup.tsx` — host setup screen with unified character checklist + category-balance feedback.
- `ui/GameView.tsx` — in-game view with the always-visible cheatsheet aside and 4 new phase panels (PileOn / ChipIn / TargetSwapPick / SellInfluence).
- `ui/CharacterArt.tsx` — inline SVG icons per character (matches ONUW / Avalon style).

## AI considerations

Bluffing isn't just heuristics — the AI needs a model of how often it bluffs and when to call others' bluffs. The Coup AI ships as a probability-table baseline (see `ai.ts`) that tracks each opponent's claim history and adjusts a per-claim "trust" weight. G54 widens the action space considerably, so the AI's claim/challenge policy is parameterized by the active character set rather than hardcoded. AI implementation is deferred to Phase 7.
