# social-deduction

A multi-game social-deduction app, hosted on GitHub Pages and played peer-to-peer with friends. AI seats supported.

**Games:**
- 🐺 **One Night Ultimate Werewolf** (with planned Daybreak + Bonus Roles)
- 🗳️ **Secret Hitler**
- ⚔️ **Avalon** (with planned Lady of the Lake, Excalibur, Two Lancelots)
- 🎭 **Coup** (with planned Rebellion G54 + Anarchy)
- 🕵️ **Codenames** (party word-association)
- 🧭 **Cross Clues** (cooperative word-association)
- 💌 **Love Letter** (16-card micro deduction)

## Status

Six games are playable in hot-seat / solo mode: **One Night Ultimate Werewolf** (base + Daybreak + Bonus Roles), **Avalon** (base box), **Coup** (Classic + full G54 + Anarchy — all 37 characters), **Codenames**, **Cross Clues**, and **Love Letter** (base 16-card set). Secret Hitler and the remaining Avalon modules are stubbed. Online multiplayer is deferred to Phase 6. See [CLAUDE.md](./CLAUDE.md) for the full architecture and roadmap.

## Quickstart

```bash
npm install
npm run dev          # http://localhost:5173/social-deduction/
npm run test:run     # vitest single-run
npm run typecheck    # tsc, no emit
npm run build        # production build to dist/
```

## How multiplayer works

No server. Peer-to-peer WebRTC via [Trystero](https://github.com/dmotz/trystero) (BitTorrent trackers for signaling). One peer hosts; others join with a short room code. Identity is a UUID kept in `localStorage`, so a seat survives a refresh.

**Hidden information** (roles, drawn cards, night observations) lives only on the host. The host sends each peer an individually-redacted view — peer A never sees peer B's role. This is fundamentally different from a typical full-replication design (e.g. Catan-style); social deduction can't tolerate every peer holding the full state. See [CLAUDE.md → Hidden info model](./CLAUDE.md#hidden-info-model).

## Project layout

```
src/
  engine/           # GameModule contract + registry + seeded RNG
  games/
    onuw/           # One Night Ultimate Werewolf
    secret-hitler/  # Secret Hitler
    avalon/         # Avalon
    coup/           # Coup
    codenames/      # Codenames
    cross-clues/    # Cross Clues
    love-letter/    # Love Letter
  net/              # Trystero room binding, identity, typed channels
  store/            # Zustand: gameStore, networkStore
  ui/
    home/           # Home menu (game picker, solo/online)
    lobby/          # Lobby + seat claim
    game/           # GameRouter — dispatches to per-game UI
```

Per-game folders each contain `state.ts`, `actions.ts`, `module.ts`, `ai.ts`, a `ui/` subfolder, and a `README.md` covering scope + hidden-info nuances.

## Roadmap

1. ✅ Phase 0 — Project scaffold
2. ✅ Phase 0b — Home menu + solo flow
3. ✅ Phase 1 — ONUW base (11 roles)
4. ✅ Phase 2 — ONUW Daybreak expansion
5. ✅ Phase 2b — ONUW Bonus Roles pack (16 roles + artifacts)
6. Phase 3 — Secret Hitler base game
7. ✅ Phase 4 — Avalon base box
8. Phase 4b — Avalon optional modules (Lady of the Lake, Excalibur, Two Lancelots)
9. ✅ Phase 5 — Coup classic base game
10. ✅ Phase 5b/c — Coup G54 + Anarchy (all 37 characters playable; one-per-category balance enforced with non-blocking off-balance warning)
11. ✅ Phase 10 — Cross Clues (coop)
12. ✅ Phase 11 — Codenames (party word-association)
13. ✅ Phase 12 — Love Letter (16-card micro deduction)
14. Phase 6 — Online multiplayer wiring
15. Phase 7 — AI for all games
16. Phase 8 — In-game chat + phase-gated visibility
17. Phase 9 — Replay

See [CLAUDE.md](./CLAUDE.md#roadmap) for the full plan.

## Non-goals

- Persistent saves, accounts, matchmaking, lobby browser
- Anti-cheat (friends-only model)
- Server-side anything
- Voice chat (use Discord)

## Deployment

GitHub Pages, auto-deploy on push to `main` via `.github/workflows/deploy.yml`. The Vite `base` is `/social-deduction/` to match the repo name.

## Inspiration

The [Catan project](../catan/) one directory up is the reference for the engine / store / net layering. We copy its action-union engine, store layout, Trystero binding, persistent UUID, and Pages workflow. We deliberately diverge on the replication model (host-authoritative + redaction here, full-state replication there) because Catan has effectively no hidden info while social deduction is entirely hidden info.
