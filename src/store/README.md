# store/

Zustand stores. Two of them, kept narrow:

- **`gameStore`** — current public view (per-seat redacted), the local seat index, and the dispatch API the UI calls. On the host, also holds the full private state. Exposes `registerBroadcastHandler` so `networkStore` can wire up action forwarding without `gameStore` importing from `net/`.
- **`networkStore`** — connection state, role (solo/host/guest/spectator), lobby, chat, peer presence.

A third store may be added later for a log/timeline (Catan has one), but until we ship a replay feature there's no need.

## Why the broadcast handler indirection?

`gameStore` should not import from `net/`. The network store registers its broadcaster into the game store after both stores have been created, breaking the cycle. Same pattern as the Catan reference project.
