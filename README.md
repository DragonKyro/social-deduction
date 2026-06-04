# social-deduction

A multi-game social-deduction app, hosted on GitHub Pages and played peer-to-peer with friends. AI seats supported.

**Games:**
- 🐺 **One Night Ultimate Werewolf** (with planned Daybreak expansion)
- 🗳️ **Secret Hitler**
- ⚔️ **The Resistance: Avalon**
- 🎭 **Coup** (with planned Reformation expansion)

## Status

Project scaffold (Phase 0). The engine contract, network plumbing, store layout, and per-game stubs are in place; no game is playable yet. See [CLAUDE.md](./CLAUDE.md) for the architecture and roadmap.

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
    avalon/         # The Resistance: Avalon
    coup/           # Coup
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
2. Phase 0b — Home menu + solo flow
3. Phase 1 — ONUW base game (11 roles, night order, day vote)
4. Phase 2 — ONUW Daybreak expansion
5. Phase 3 — Secret Hitler base game
6. Phase 4 — Avalon (base box + 2 Lancelots)
7. Phase 5 — Coup base game
8. Phase 5b — Coup Reformation
9. Phase 6 — Online multiplayer wiring
10. Phase 7 — AI for all four games
11. Phase 8 — In-game chat + phase-gated visibility
12. Phase 9 — Replay

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
