# net/

Trystero/torrent WebRTC peer-to-peer plumbing. Identity, room binding, typed channels.

## Channels

| Channel | Direction | Purpose |
|---|---|---|
| `hello` | bidirectional | Handshake — exchange stable UUID + display name |
| `lobby` | host → all | Authoritative lobby state |
| `seatReq` | peer → host | Guest requests a seat claim/change |
| `start` | host → each peer | Game starts; first redacted view |
| `action` | peer → host | A move (must be valid for sender's seat) |
| `view` | host → each peer | Per-seat redacted public state. **Individually addressed.** |
| `snapReq` | peer → host | Rejoin / late-join: request current view |
| `snap` | host → one peer | Reply with current view + chat history |
| `chat` | bidirectional | Out-of-band chat (system + user messages) |

## Why split `action` and `view`?

Catan's reference model broadcasts actions and every peer reduces locally. For social deduction this leaks hidden info — every peer holding the full state could read other players' roles out of memory.

This app uses **host-authoritative** instead. Only the host reduces. The host produces a redacted view per peer via the game module's `viewFor(state, seat)` and sends each peer ONLY their own view. Other peers' views never leave the host. See `engine/README.md`.

## Trust model

This is friends-only — no anti-cheat. A malicious host could lie about views, and a malicious peer could DoS by spamming actions, but neither is a goal to defend against here. The encrypted-by-room-code wire is enough.
