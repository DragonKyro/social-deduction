# Coup

2-6 player bluffing game. Each player starts with 2 face-down character cards. Each character grants a unique action; you may claim ANY character regardless of your real hand, but opponents may challenge. Fail a challenge and you lose an influence. Lose both = eliminated. Last player standing wins.

## Status

Solo vs AI, pass-and-play (with handoff covers) and online. **All 37 characters across Classic, G54, and Anarchy execute end-to-end.** The setup screen lets the host pick the **ruleset** (Classic / G54 / G54 + Anarchy) and curate the exact characters in this match's deck. Default is the canonical one-per-category G54 lineup; deviating from one-per-category surfaces a non-blocking warning.

## What's implemented

**General actions (always legal):**
- Income (+1 coin)
- Foreign Aid (+2 coins, blockable by Duke / Banker / Bishop)
- Coup (pay 7, target loses an influence; in G54 blockable by Judge / Lawyer / Guerrilla / Paramilitary)

**Challenge / block flow:** `awaitingChallenge → awaitingBlock → awaitingBlockChallenge → loseInfluence`. Challenges resolve on the spot: an honest claimer's card is shown, shuffled back and replaced face-down (challenger loses an influence); a bluffer loses an influence of their choice and the action fails. Targeted actions (steal, assassinate, strikes, G54 coup) can only be blocked by their target; Foreign Aid by anyone. Every response window waits exactly on `awaitingSeats` (`rules.ts`), which the reducer, the AI and the UI all share. Action costs are paid on declaration. They stay spent if the action is blocked (Contessa: "the fee paid for the assassin remains spent"), and are refunded if the claim is successfully challenged (official rule: "any coins paid as the cost of the action are returned to the player"). Every action carries `bySeat`; the reducer checks it against the phase (only the current seat declares).

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
  - `peacekeeping` — Peacekeeper grants this to themselves; opponents can't target them until they next act. If tokens leave a 10+ coin seat with no legal Coup target, the must-coup rule is waived for that turn.
  - `treaty` — Foreign Consular pairs two seats; they can't target each other until a new Foreign Consular claim overwrites the bond. Void once the pair are the last two alive.
  - `weapons` — Arms Dealer's sellInfluence grants +1 weapon (cap 3); each weapon adds +1 to your steals.
  - `reviveBlessed` — Bishop / Lawyer (self) and Priest (target) grant a one-shot save; the next loss that would eliminate the holder is cancelled instead. Each seat can be saved **once per game** (`reviveUsed`), otherwise a Lawyer re-blessing every turn is immortal.
- **Custom-amount steal** (Speculator) — steals coins = min(own coins, 5).
- **Wealth redistribute** — Treasurer (equalize with target), Socialist (pool + redistribute evenly across living players), World Bank (+1 to every living player).
- **Coup blocks** (G54) — the Coup's target can claim Judge / Lawyer / Guerrilla / Paramilitary to block it. The attacker still spends 7 coins. A Coup **forced by 10+ coins can't be blocked** (otherwise two Guerrilla or Lawyer holders deadlock forever; found by AI self-play).
- **Arms Dealer sell** — flip one face-down card for 4 coins + 1 weapon token (can't sell your last influence).

**Category balance:**
- Total characters per match: 5 (Classic / G54) or 6 (G54 + Anarchy) — enforced strictly.
- One character per base category is the canonical G54 default. The setup screen seeds this default but lets the host pick freely; deviations show an off-balance warning.

**Ruleset differences:**
- Classic — cross-blocking (Captain + Ambassador both block steal).
- G54 — blocks come straight from each character's `blocks` list in `characters.ts` (e.g. Bishop / Inquisitor / Speculator / Thief all block steals). Only Guerrilla and Paramilitary strikes are same-role-only. Coups are blockable only in G54.

**Cheatsheet:** the in-game view always shows a right-side panel listing every character in this match's deck with their power + general actions. Tokens are summarized when their granting character is in the deck.

## House rules

Several G54 / Anarchy characters lack a clear canonical rulebook citation. Where we've made a best-guess interpretation, the character description in the cheatsheet is prefixed `(house rule)` so a player at the table can flag a disagreement before the match instead of finding out mid-game. Examples:

- Newscaster / Reporter / Producer / Lobbyist / Diplomat — all interpreted as "draw 1 + force-swap a target card" with minor cost variations.
- Protestor / Anarchist — rally chip-in mechanic, threshold = ceil(opponents/2).
- Bishop / Priest / Lawyer — interpreted with extra revive-token + block-stacking semantics.
- Arms Dealer / Socialist / World Bank — interpreted as the simplest mechanic that fits the character's name.

If your group plays a different reading, edit `characters.ts` — actions are one-row entries pointing at the effect dispatcher in `module.ts`.

## Hidden info

`view.ts` is the single redactor (an allow-list, every field copied). `redaction.test.ts` scrambles everything a seat may not know (other hands, deck contents and order, seed, force-swap card, other seats' peeks and exchange offers) and asserts that seat's JSON view is byte-identical, in every phase.
- The active player's claim is public.
- The deck is fully hidden (deck-order leaks would break exchange + G54 Inquisitor entirely).
- Only the seat that owns an influence sees their own face-down cards (`yourInfluences`).
- During exchange, the pick set is shown ONLY to the active seat (`yourExchangeOffer`).
- Lost influences are public (`influences[i].revealed = true` → character is shown to everyone).
- When a proven card is replaced from the deck, only the owner learns the replacement (`redraw` event carries no identity).
- `events` (the animation feed) only names claimed characters and cards that are face-up.
- `seed` / `rngCursor` never leave the host (they would let a peer recompute the deck).
- Spy / Inquisitor / force-swap peeks live in `yourPeeks` and are redacted out of every other seat's view.
- Pile-on / chip-in pots are fully public.
- Treaty bonds + weapon counts are fully public (they're observable through play anyway).

## Files

- `state.ts` — host state shape: 14 phases, seats with tokens, pending action with pot / swap-in-progress / treaty-pair fields, deck, peeks.
- `actions.ts` — discriminated union of every action a seat can dispatch.
- `characters.ts` — single declarative table of every character (Classic + G54 + Anarchy), with action / blocks / `implemented` flag. **This is where new characters land.** Adding a character that follows a standard action shape (gainCoins / steal / forceLoseInfluence / exchange / pile-on / chip-in / force-swap / token-grant) is one row.
- `setup.ts` — initial deal, character-set validation, category-balance warning.
- `module.ts` — `GameModule` implementation + the full challenge/block/window state machine. The `applyAction` reducer is the single dispatch table.
- `rules.ts` — pure rule helpers over public data (targeting, must-coup, valid blockers, `awaitingSeatsFor`) shared by reducer, view, AI and UI.
- `view.ts` — `viewFor`, the redaction chokepoint.
- `ui/CoupSetup.tsx` — setup: ruleset presets, seats with Human/AI toggles (`aiSeats` → `launchGame`), role picker with category balance.
- `ui/GameView.tsx` — the court table: seat plaques, treasury + court deck, your hand, decree panels per phase, chronicle, cheatsheet. Seat switching only via `useSeatSwitching()`; pass-and-play shows a curtain cover at every handoff.
- `ui/useTableFx.ts` — animations driven by the public event feed + coin diffs (coin/card flights, challenge clash, block shield, strike slash, toasts).
- `ui/CharacterArt.tsx` + `ui/portraits.tsx` — gilded portrait cards (painted busts for the Classic five, heraldic medallions for the rest), ornate card back, coin stacks.

## AI

`ai.ts` redacts first (`viewFor(state, seat)`) and decides only from that view, so it can't see opponents' cards or the deck; `selfplay.test.ts` checks that scrambling hidden info never changes its move. It answers exactly when its seat is in `awaitingSeats` and only builds moves validated by `rules.ts`. Heuristics: hypergeometric P(holds X) from unseen copies for challenges, scored action menu with bluff penalties and noise, honest blocks always / bluff-blocks by stakes, memory of blocks that held (public events). Self-play over Classic 2-6p and 13 G54 / Anarchy decks must finish without an illegal move or a stall.
