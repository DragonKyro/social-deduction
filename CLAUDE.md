# CLAUDE.md

Context for Claude working in this repo.

## What this is

A multi-game social-deduction app: **One Night Ultimate Werewolf**, **Secret Hitler**, **Avalon**, **Coup**, **Codenames**, **Cross Clues**, and **Love Letter**, hosted on GitHub Pages. WebRTC peer-to-peer multiplayer via Trystero; AI seats supported. No backend.

The Catan project one directory up (`../catan/`) is the inspirational reference for the engine / store / net layering. Read its CLAUDE.md for the patterns we're echoing — they're proven against 6 expansions there. **One critical difference: this app is host-authoritative with redacted per-peer views, not full-state replication.** Catan can replicate the full state because Catan has no hidden information beyond dev cards (and even those leak from action logs); social deduction breaks if every peer holds every role. See the "Hidden info model" section below.

## Tech stack (locked)

TypeScript, Vite, React 19, Trystero (WebRTC torrent), Zustand for state, Vitest for tests. No backend — GitHub Pages is static-only.

## Architecture

Five layers, separated by directory:

- **`src/engine/`** — pure game-agnostic plumbing. Defines the `GameModule` contract (private state, action, public view + per-seat redactor) and the cross-game registry. No React, no DOM, no network imports.
- **`src/games/<id>/`** — one folder per game. Each implements `GameModule` and ships its own state/actions/AI/UI. Currently: `onuw/`, `secret-hitler/`, `avalon/`, `coup/`, `codenames/`, `cross-clues/`, `love-letter/`. Adding a new game = new folder + registry entry, no engine changes.
- **`src/net/`** — Trystero wrapper. Typed channels for hello/lobby/seatReq/start/action/view/snap/chat, persistent UUID via localStorage. Consumed only by `networkStore`.
- **`src/store/`** — two Zustand stores: `gameStore` (private state on host, public view everywhere) and `networkStore` (connection, role, lobby, chat).
- **`src/ui/`** — React. `home/` and `lobby/` are game-agnostic; `game/GameRouter.tsx` dispatches to the per-game UI under `src/games/<id>/ui/`.

The game logic layer must not import from `src/ui`, `src/net`, or `src/store`. The net layer may import from `src/engine` and `src/games/*/index.ts` (for type unions) but not `src/ui`. Path alias: `@/` → `src/`.

## Hidden info model

This is the load-bearing architectural decision. **Every game has private information that must not leak to peers.** ONUW roles, Secret Hitler policy hands, Avalon role-knowledge tables, Coup face-down cards — none of these can ever be sent to a peer that doesn't own them.

The model:

1. **Host holds the only complete state** (`Private`). Peers hold only their own `Public` view.
2. Every game module exposes `viewFor(state: Private, seat: SeatIndex | null): Public`. **This is the single chokepoint that redacts hidden info.** Spectators pass `seat = null`.
3. The network layer sends `view` messages individually addressed per peer. Peer A never receives Peer B's view. The same `action` action results in N different `view` messages on the wire, one per peer.
4. AI runs on the host only. AI seats receive a private-state slice the same way humans do (`viewFor(state, seat)`).
5. Host validates every incoming action against the sender's claimed seat + UUID before applying.

What this means for new code:

- **Adding hidden state to a game?** Put it in `Private` only. Redact it in `viewFor`. Add a `yourFoo` slot in `Public` if the owning seat needs to see it.
- **Adding a new game?** Don't reach for full-state replication "for simplicity". The cost shows up as a cheating exploit the day someone opens devtools.

## Multiplayer model

- **Trystero `/torrent`** for WebRTC signaling. No backend. App ID `social-deduction-v1`; room code doubles as the password for E2E encryption.
- Trystero `peerId` is volatile. Stable identity is a `localStorage` UUID (`social-deduction.uuid`), exchanged via the `hello` channel. Local-testing escape hatch: append `?fresh` to switch to sessionStorage.
- **Host-authoritative reduction**. Only the host applies actions. Host sends back per-peer redacted views.
- **Lobby**: host-authoritative. Guests `seatReq`; host integrates and rebroadcasts `lobby`.
- **Rejoin / spectator**: when a peer joins mid-game, the host responds with `snap` (current view + chat history). Newcomer's role: UUID matches a seat → guest; otherwise spectator.
- **Disconnect**: pause indefinitely. UI shows offline dot. Multiple peers can map to one UUID (testing); we only emit "disconnected" once the last peer for that UUID leaves.
- **AI in online**: only the host runs AI. If the host drops, AIs freeze. Same as Catan.
- **Chat**: in-memory in `networkStore.chat`, not part of `Private`. Game-specific phases may gate chat (e.g. ONUW night phase silences chat).
- No anti-cheat — friends-only.

## Game-specific notes

See each game's README:
- `src/games/onuw/README.md` — One Night Ultimate Werewolf
- `src/games/secret-hitler/README.md` — Secret Hitler
- `src/games/avalon/README.md` — Avalon
- `src/games/coup/README.md` — Coup
- `src/games/codenames/README.md` — Codenames (party word-association, 2-team)
- `src/games/cross-clues/README.md` — Cross Clues (cooperative word game)
- `src/games/love-letter/README.md` — Love Letter (16-card micro deduction)

## Conventions

- Strict TypeScript. No `any` unless genuinely necessary (a few `unknown` and `any` escapes are needed at the engine-as-generic-host boundary; they're commented).
- Co-locate tests next to the code: `module.ts` and `module.test.ts` side by side.
- Game logic is pure: no DOM, no React, no network imports. Same purity for AI files.
- Public views are minimal: don't surface state that isn't needed for rendering or AI input. Every extra field is a hidden-info audit later.
- Action shapes are discriminated unions on `type`. Module dispatchers switch on `type`.

## Commands

- `npm run dev` — local dev server at http://localhost:5173/social-deduction/
- `npm run build` — production build (`tsc` typecheck then `vite build`)
- `npm run test` — Vitest watch
- `npm run test:run` — Vitest single run
- `npm run typecheck` — `tsc` (no emit)

## Deployment

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on push to `main`. The Vite `base` is `/social-deduction/` to match the repo name. If the repo is renamed, update `base` in `vite.config.ts`.

## Roadmap

- [x] Phase 0 — Project scaffold (this commit)
- [ ] Phase 0b — Home menu wiring, solo + lobby flow, persistent identity
- [ ] Phase 1 — One Night Ultimate Werewolf base game (11 base roles, night order, day vote, hot-seat)
- [ ] Phase 2 — ONUW Daybreak expansion (10 expansion roles incl. Doppelganger)
- [ ] Phase 2b — ONUW Bonus Roles pack (16 consolidated bonus roles + 6 artifact tokens + #11/#12 seat tokens)
- [ ] Phase 3 — Secret Hitler base game (5-10p)
- [ ] Phase 4 — Avalon base box (Merlin, Assassin, Percival, Morgana, Mordred, Oberon)
- [ ] Phase 4b — Avalon optional modules (Lady of the Lake, Excalibur, Two Lancelots — independent, stackable)
- [x] Phase 5 — Coup classic base game (5 characters, challenge/block state machine, exchange, lose-influence)
- [x] Phase 5b/c — Coup: G54 + Anarchy as a unified picker. Classic, G54 (25-character pool), and Anarchy (+7 characters) all share one setup screen and one character-rules table at `src/games/coup/characters.ts`. **All 37 characters playable** end-to-end. Engine handles pile-on (Capitalist / Financier), group-rally chip-in (Protestor / Anarchist), force-swap (Newscaster / Reporter / Producer / Lobbyist / Diplomat), token grants (Peacekeeping / Treaty / weapons / reviveBlessed), custom-amount steal (Speculator), expanded block tables (Bishop / Lawyer / Judge / Paramilitary / Guerrilla coup-block), and wealth redistribution (Treasurer / Socialist / World Bank). Same-role-only blocking applies in G54 mode; Classic keeps cross-blocking. **Category balance**: canonical G54 is one character per base category (Finance / Comms / Force / Special Interest / Movement; +1 Anarchy with the expansion). Setup enforces total character count strictly (5 / 5 / 6) and surfaces a non-blocking warning when distribution drifts off one-per-category. Characters whose canonical rulebook source is unclear are prefixed `(house rule)` in their description so a player at the table isn't misled. Social Media general action still deferred.
- [ ] Phase 6 — Online multiplayer wiring (Trystero, host-redacted views, lobby, rejoin)
- [ ] Phase 7 — AI for all four games (one heuristic level per game)
- [ ] Phase 8 — In-game chat + phase-gated visibility (night-silence, dead-spectate, etc.)
- [ ] Phase 9 — Game history / replay (host records action log, redacted per-seat replay)
- [x] Phase 10 — Cross Clues (coop word game): 5×5 secret-word grid, 25-coord deck, host-authoritative clue-giver redaction, themed word packs (Standard / Spicy / Kids), final-score tiers (16 great / 21 legendary / 25 perfect). No winner team — uses `score` + `scoreRating` instead.
- [x] Phase 11 — Codenames (party word-association, 2-team).
- [x] Phase 12 — Love Letter (16-card micro deduction): 2–4 players, base-set 16-card deck (Princess/Countess/King/Prince ×2/Handmaid ×2/Baron ×2/Priest ×2/Guard ×5). Per-seat single hidden card is the only redaction; Priest peek is privately addressed to the actor. Full effect resolution incl. Countess-with-King/Prince force, Prince-on-Princess elimination, redraw-from-setAside on empty deck, deck-exhaustion compare + discard-sum tiebreak. Token target scales with player count (2p:7, 3p:5, 4p:4).

## Non-goals (do not implement)

- Persistent game saves between sessions (beyond the current localStorage UUID + name)
- User accounts, matchmaking, lobby browser
- Anti-cheat / verifiable randomness (friends-only model)
- Server-side anything
- Voice chat (we'll suggest Discord in docs and move on)

## Where to start next

Phase 0b: wire `HomeMenu` to actually pick a game and start a solo session. The pieces needed:
1. A `solo` mode in `networkStore` that doesn't open a Trystero room.
2. A "solo runner" that lives in `gameStore` (or beside it) — applies actions to private state directly and calls `viewFor` to refresh the public view.
3. `HomeMenu` buttons that build the initial `GameConfig` from `module.defaultConfig`, call `module.createInitialState`, and stuff the result into the store.

Once solo works for any one game (ONUW is smallest — start there), Phase 1's real game logic can land without UI/store rework.

## Reference: Catan project

`../catan/` is a working full-replication multiplayer Trystero app with 6 expansions, 9 Seafarers scenarios, 8 Fun Maps, and a complete heuristic AI. **Patterns to copy**: action-union engine, store layering, Trystero room binding, persistent UUID + ?fresh escape hatch, GitHub Pages deploy workflow, dev-card-style hidden info logging (deliberately omits stolen resource). **Patterns to deliberately diverge from**: full-state replication (we go host-authoritative), all-peers-reduce (we go host-reduces-only), action broadcast (we go peer→host action / host→peer view).
