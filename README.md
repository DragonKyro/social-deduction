# social-deduction

A multi-game social-deduction app, hosted on GitHub Pages. Play on one device (pass-and-play, or against AI seats) or online with friends. AI seats are supported everywhere.

**▶ Play:** https://DragonKyro.github.io/social-deduction/

**Games:** One Night Ultimate Werewolf · Secret Hitler · Avalon · Coup · Codenames · Cross Clues · Love Letter · Skull · Liar's Dice · Liar's Poker · Cockroach Poker

## Quickstart

```bash
npm install
npm run dev          # http://localhost:5173/social-deduction/
npm run test:run     # vitest single-run
npm run typecheck    # tsc, no emit
npm run build        # production build to dist/
npm run fix-lock     # after any install: point package-lock.json back at registry.npmjs.org
```

**Behind a corporate npm mirror?** If your machine sets `NPM_CONFIG_REGISTRY` (e.g. an Artifactory mirror), that overrides this repo's `.npmrc`. `npm install` then writes mirror URLs into `package-lock.json`, which GitHub Actions can't reach. Run `npm run fix-lock` after any install that changes the lockfile. CI refuses a lockfile with non-public URLs.

## How multiplayer works

Online play runs over **Firebase Realtime Database** (the shared `github-games-e7c7d` project; this app's data lives under `/social-deduction`). There's no server code: the host's browser runs the game, and the database relays messages and enforces who may read what.

1. The host picks a game and chooses **Host online**. A 5-letter room code and an invite link (`…/?room=CODE`) are generated.
2. Friends open the link, or type the code on the home screen, and sit in a seat. The host can mark seats as AI.
3. Each device signs in anonymously and silently; that uid is your seat. Reloading rejoins, and a host who reloads resumes the match.

**Hidden information** (roles, hands, night results, the RNG seed) lives only on the host. After every move the host writes each device its own redacted view to `views/{uid}`, and the security rules let only that uid read it. Peer A can't read peer B's view, even from devtools. See [CLAUDE.md → Hidden info model](./CLAUDE.md#hidden-info-model) and [src/net/README.md](./src/net/README.md).

### Deploying the database rules

The database is shared with other apps and has a single rules set, so never deploy a rules file directly. Run:

```bash
npm run deploy:rules   # merges database.rules.json's "social-deduction" key into the live rules, then deploys
npm run rules:smoke    # live check: guests can read only their own view, not others' / the host's / the inbox
```

`scripts/merge-db-rules.mjs` (the predeploy hook) keeps every other app's rules exactly as they are live.

## Project layout

```
src/
  engine/           # GameModule contract + registry + seeded RNG
  games/<id>/       # one folder per game: state, actions, module, view (redaction), AI, ui/, README
  net/              # Firebase room transport (+ in-memory fake for tests), identity, room links
  store/            # Zustand: gameStore (host state, AI loop, seat gating), networkStore (online), hostLogic
  ui/
    home/           # Home menu + tile art
    lobby/          # Online lobby
    game/           # GameRouter (lazy per-game views) + online overlay (chat, banners)
    shared/         # Theme, fonts, motion library, FlipCard, SVG helpers, launcher
database.rules.json # Rules for the /social-deduction key only
scripts/            # merge-db-rules (safe deploy), smoke-rules (live rules check), fix-lockfile
```

## Status

### Done

- [x] **11 games playable end-to-end**, solo, hot-seat or online. Each has a rules engine, a per-seat redacting `viewFor`, an AI, a themed UI, and a README.
  - One Night Ultimate Werewolf: base, Daybreak, bonus roles, artifacts
  - Secret Hitler (5–10 players)
  - Avalon: base roles
  - Coup: Classic + G54 + Anarchy, 37 characters
  - Codenames, Cross Clues, Love Letter, Skull, Liar's Dice (wild 1s with Perudo conversion, spot-on), Liar's Poker (inverted flushes, dummy-hand last life), Cockroach Poker
- [x] **Online multiplayer on Firebase RTDB:**
  - per-device view mailboxes enforced by security rules
  - generated room codes and invite links
  - reconnect and rejoin
  - host-reload resume
  - spectators
  - room chat (lobby plus an in-game drawer)
  - presence and host-offline banners
  - stale-room cleanup
- [x] **AI for every game**, in solo and online play, driven by one AI loop on the host. Every AI decides only from its own seat's view; tests check this by scrambling the hidden information and confirming the decision doesn't change.
- [x] **Hidden-information and rules audit (Nov 2026)** across all 11 games and the network layer. Highlights:
  - **Network:**
    - The lobby used to broadcast the RNG seed to every guest, so anyone could recompute every deal. The seed now stays on the host.
    - Online hosts could click a friend's seat to see their hand. Seat switching is now gated (`useSeatSwitching`).
    - Guests could send host-only phase controls. They're now refused.
    - A view went out on every action with a global counter, which let guests count secret night moves. Views are now sent only when they change, with a per-device counter.
  - **One Night Ultimate Werewolf:**
    - Final cards were visible after swaps.
    - Who is awake was public, and the night step counter revealed the center cards.
    - Hot-seat screens named the acting role.
    - The AI peeked at other roles.
    - Plus many rule fixes: Doppelganger timing, win conditions, Hunter chains, Witch, Alpha Wolf.
  - **Secret Hitler:**
    - Online voting only ever reached seat 0.
    - Investigation results stayed visible on the roster in hot-seat.
    - Rule fixes: vetoed governments are term-limited, a refused veto can't be re-proposed, the deck reshuffles at the right time.
  - **Avalon:**
    - Online guests could never vote.
    - The AI peeked at alignments.
    - Non-integer team seats could wedge a quest.
  - **Codenames and Cross Clues:**
    - Codenames couldn't start through the launcher or lobby, and had no AI.
    - The Cross Clues AI's clue was the answer.
    - The hidden key and deck now use a seed separate from the public word deal.
  - **Liar's Dice, Liar's Poker and Cockroach Poker:**
    - The Cockroach Poker AI read the passed card.
    - Peek-and-pass was blind, and an empty hand stalled the game.
    - Wild-1s bid ordering was wrong.
    - Impossible poker claims were accepted.
  - **All games:** malformed or out-of-phase actions are rejected; redaction tests cover every seat and the spectator view at every step of all-AI games; all-AI self-play tests check that games finish without stalling.
- [x] **Art and animation pass:**
  - self-hosted thematic fonts
  - shared motion library (deal, flip, stamp, shake, glow, tumble, fog, candle flicker)
  - illustrated SVG role cards, boards, cards and dice for every game
  - themed tables and setup screens
  - per-seat AI toggles on every setup screen
  - reduced-motion support
- [x] **Database rules deployed** (Nov 6 2026), and the live smoke test passes: a player can't read another player's view, the host's saved state or the inbox, can't write as someone else, and can't take over a room.
- [x] **CI** fails on type errors, runs the test suite (579 tests), and refuses a lockfile that points at a private npm mirror. Every package resolves from the public npm registry.

### Left to do

**Needs a decision or a playtest**

- [ ] **Online playtest across real devices.** Online play is covered by in-memory transport tests and the live rules check, but hasn't been played end-to-end on several phones and laptops yet.
- [ ] **Confirm two rule choices.**
  - Secret Hitler's "rebalanced 6p" option now starts with one Fascist policy enacted (the secrethitler.io variant).
  - In Coup, a successfully challenged action refunds its cost; a blocked one keeps it spent.

**Features**

- [ ] **Phase 8: phase-gated chat.** ONUW night silence, and dead-player spectate for Secret Hitler and Avalon. Chat works now but isn't gated by phase.
- [ ] **Phase 9: replay.** The host records the action log; replay runs `applyAction` from `createInitialState` and redacts per seat.
- [ ] **Phase 4b: Avalon optional modules** (Lady of the Lake, Excalibur, Two Lancelots). Scaffolded only, and unreachable from the UI.
- [ ] **Coup:** the Social Media general action.
- [ ] **RNG hardening, the last step.**
  - Done: match seeds are 53 bits from `crypto`. The generator went from 32-bit mulberry32 to 128-bit sfc32. Hidden-draw streams use `subSeed`, so they no longer collapse to 32 bits.
  - Left: it's still a seeded, non-cryptographic PRNG, so a 2^53 search over the seed is theoretically possible. The full fix is host-only crypto entropy for hidden draws, passed through `GameConfig`.
- [ ] **Liar's Dice option:** Perudo-style "calza" (the caller gains a die). Spot-on currently uses the README's house rule.
- [ ] **Show AI seats to online guests.** Guests can't currently tell which seats are AI during a match.

**Clean-up**

- [ ] **Shared hot-seat hand-off hook.** Several games now carry their own copy (`ui/useHotSeat.ts`); promote one to `src/ui/shared/`.
- [ ] **Move the word-association lexicon.** Codenames and Cross Clues share it from `games/codenames/lexicon.ts`; it belongs in `src/words/`.
- [ ] **Bundle.** Game views, setup screens and Firebase are already lazy chunks. The engines and word packs, pulled in through the registry, still make the main chunk about 520 KB.

## Non-goals

- Persistent saves, accounts, matchmaking, lobby browser
- Anti-cheat / verifiable randomness (friends-only model). Hidden-information redaction *is* a goal, and is enforced server-side.
- Server-side code
- Voice chat (use Discord)

## Deployment

GitHub Pages auto-deploys on push to `main` via `.github/workflows/deploy.yml`. It checks the lockfile uses the public registry, then typechecks, tests and builds. The Vite `base` is `/social-deduction/` to match the repo name. Database rules deploy separately (see above).

## Inspiration

The [Catan project](../catan/) one directory up is the reference for the engine / store / net layering and for the shared-database conventions (one top-level key per app, merged rules deploys, anonymous auth, day-bucketed room cleanup). We deliberately diverge on the replication model: host-authoritative with per-device redacted views here, full-state replication there. Catan has almost no hidden information; social deduction is mostly hidden information.
