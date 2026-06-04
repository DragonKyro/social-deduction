# engine/

Game-agnostic plumbing shared by every social-deduction module.

- `types.ts` — the `GameModule` contract. Each game implements `createInitialState`, `applyAction`, `viewFor` (hidden-info redaction), `isFinished`, `defaultConfig`, and optional `aiChooseAction`.
- `registry.ts` — central lookup of all known games. Add a new game by appending it here.
- `rng.ts` — seeded mulberry32. Use this for any game randomness so matches are reproducible.

The engine has **no** network, store, UI, or per-game imports. Game modules under `src/games/<id>/` plug into this contract; the network and store layers consume the registry by id.

## Hidden information rule

The host holds the only complete `Private` state. Peers and AIs receive only what `viewFor(state, seat)` returns for their own seat. **All hidden info (roles, drawn cards, night observations) MUST be filtered through `viewFor` before it touches the wire.** Other peers' redacted views never leave the host.
