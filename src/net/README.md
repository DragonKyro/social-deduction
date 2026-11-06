# net/

The room transport for online play: **Firebase Realtime Database** (project `github-games-e7c7d`, shared with other web apps), behind an interface so the stores can run against an in-memory server in tests. Everything this app stores lives under `/social-deduction` (`DB_ROOT` in `firebaseRoom.ts`).

- `transport.ts` — the interface (`RoomTransport` → `HostConnection` / `GuestConnection`, `HostEvents` / `GuestEvents`), `ServerUnreachableError`.
- `firebaseRoom.ts` — the Firebase implementation (anonymous sign-in, room layout, presence, stale-room sweep). Loaded lazily by `networkStore`, so the SDK only downloads when someone goes online.
- `fakeTransport.ts` — test-only in-memory server that mirrors the access rules (each device only ever receives its own view; only the host reads the inbox).
- `types.ts` — lobby, chat, presence, inbox and view-record types. `identity.ts` — display name, `?fresh` mode, room codes. `roomLink.ts` — `?room=CODE` in the URL (reload rejoins; invite links).
- Security rules: `database.rules.json` at the repo root, covering only the `social-deduction` key. The database has **one** rules set for every app, so deploys go through `scripts/merge-db-rules.mjs` (the predeploy hook in `firebase.json`), which swaps this app's key into the live rules and keeps the other apps' keys untouched.

## Room layout (`social-deduction/rooms/{CODE}`)

| Node | Who reads | Who writes | Contents |
|---|---|---|---|
| `meta` | anyone in the room | creator, once | `{ hostUid, createdAt, build, v }` |
| `lobby` | anyone in the room | host | JSON `LobbyState` (seats, options, `inGame`, `match`) — **never the seed** |
| `views/{uid}` | **only `{uid}`** | host | JSON `{ match, env }` — that device's redacted `PublicEnvelope` |
| `host` | **only the host** | host | JSON saved private state, so a reloaded host resumes |
| `inbox/{pushId}` | **only the host** | anyone, as themselves | `{ uid, p }` — seat requests and actions; the rules force `uid === auth.uid` |
| `chat/{pushId}` | anyone in the room | anyone, as themselves | `{ uid, name, text, at }` |
| `presence/{pushId}` | anyone in the room | its owner | `{ uid, name }`, removed by `onDisconnect` |

The room deliberately has **no room-level `.read` rule**: rules cascade, so one would open `views/` — every player's secrets — to everybody.

Rooms are cleaned up like the other apps on the database: a `roomDays` / `roomIndex` day bucket, and each new room's host sweeps rooms over a week old that nobody is connected to.

## Multiplayer model

- **Identity** is the device's anonymous Firebase uid (persisted by Firebase Auth; `?fresh` keeps it per tab for local testing). `Seat.uuid` holds it. The rules tie every inbox / chat / presence write to its author, so the host never trusts identities claimed inside payloads.
- **Host-authoritative.** Only the host reduces (`gameStore.hostApply`). It vets each inbound action (`store/hostLogic.ts`: the sender must hold the seat named by `action.bySeat`; seatless phase controls are host-only), applies it, then writes every connected device its own `viewFor(state, seat)` in one atomic multi-path update. Spectators get `viewFor(state, null)`.
- **The seed** is generated on the host at match start and never written anywhere peers can read (seed + options would let anyone recompute every deal).
- **Rejoin.** A device's latest view stays in `views/{uid}`, so a reconnecting guest picks it up immediately; newcomers mid-match are written a view when their presence appears. A host that reloads (same uid) resumes from `host`.
- **Disconnect.** Presence drives online dots; if the host is away the match pauses (guests see a banner).

## Rules of this layer

- No imports from `@/ui` or `@/store`.
- May import from `@/engine` for types.
- Keep it thin — no game rules here.
