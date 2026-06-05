# social-deduction

A multi-game social-deduction app, hosted on GitHub Pages and played peer-to-peer with friends. AI seats supported.

**▶ Play:** https://DragonKyro.github.io/social-deduction/

**Games:** One Night Ultimate Werewolf · Secret Hitler · Avalon · Coup · Codenames · Cross Clues · Love Letter · Skull · Liar's Dice · Liar's Poker · Cockroach Poker

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
    coup/           # Coup (Classic + G54 + Anarchy)
    codenames/      # Codenames
    cross-clues/    # Cross Clues
    love-letter/    # Love Letter
    skull/          # Skull
    liars-dice/     # Liar's Dice
    liars-poker/    # Liar's Poker
    cockroach-poker/# Cockroach Poker
  net/              # Trystero room binding, identity, typed channels
  store/            # Zustand: gameStore, networkStore
  ui/
    home/           # Home menu (game picker, solo/online)
    lobby/          # Lobby + seat claim
    game/           # GameRouter — dispatches to per-game UI
```

Per-game folders each contain `state.ts`, `actions.ts`, `module.ts`, `ai.ts`, a `ui/` subfolder, and a `README.md` covering scope + hidden-info nuances.

## Non-goals

- Persistent saves, accounts, matchmaking, lobby browser
- Anti-cheat (friends-only model)
- Server-side anything
- Voice chat (use Discord)

## Deployment

GitHub Pages, auto-deploy on push to `main` via `.github/workflows/deploy.yml`. The Vite `base` is `/social-deduction/` to match the repo name.

## Inspiration

The [Catan project](../catan/) one directory up is the reference for the engine / store / net layering. We copy its action-union engine, store layout, Trystero binding, persistent UUID, and Pages workflow. We deliberately diverge on the replication model (host-authoritative + redaction here, full-state replication there) because Catan has effectively no hidden info while social deduction is entirely hidden info.
