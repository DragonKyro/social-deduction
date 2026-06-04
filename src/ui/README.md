# ui/

React components. Layered:

- `home/HomeMenu.tsx` — game picker + solo/online toggle.
- `lobby/LobbyScreen.tsx` — seat claiming, game-options editing, start button (host only).
- `game/GameRouter.tsx` — switches on `publicView.gameId` and renders the matching `src/games/<id>/ui/GameView.tsx`.
- `shared/` — reusable widgets across games (chat, timer, vote tally, role-card layout). Empty for now.

Per-game UI lives next to the game logic under `src/games/<id>/ui/`, not here. The only thing the top-level `ui/` layer knows about specific games is the `GameRouter` import map.

## Conventions

- Components read from `useGameStore` / `useNetworkStore` directly. No prop-drilling state.
- Actions are dispatched via `useGameStore().dispatch(action)`. Solo/host loops apply them locally; guests forward over the wire.
- Hidden-info components (your role card, your night observation) read `view.yourX` fields. **Never** look at other seats' `yourX` — the host doesn't even send them to you.
