# store/

Zustand stores, kept narrow:

- **`gameStore`** — current public view (per-seat redacted), the local seat, and the `dispatch` API the UI calls. On the host (solo, hot-seat, or online host) it also holds the full private state, applies actions (`hostApply`), and runs the **AI loop** for AI seats. It enforces which seats this device may view or act as (`controllableSeats`): online that's only your own seat; in hot-seat it's every human seat, never an AI seat. UIs use `useSeatSwitching()` for pass-and-play controls.
- **`networkStore`** — online play: connection, role (solo / host / guest / spectator), lobby, chat, presence, errors. Talks to the room through `net/transport` (Firebase in the app, `fakeTransport` in tests).
- **`hostLogic.ts`** — pure host-side decisions (seat requests, inbound-action vetting, per-device view fan-out), unit-tested in `hostLogic.test.ts`.

## Why the handler indirection?

`gameStore` must not import from `net/` or `networkStore`. The network store registers three hooks into the game store instead: `broadcastHandler` (guest: forward actions to the host), `hostAppliedListener` (host: publish views after every applied action), and `exitHandler` (what "Exit" means online — the host ends the match for everyone; a guest steps out to the lobby and can return).
