import { useMemo, useState } from 'react';
import { GAMES } from '@/engine/registry';
import type { Seat } from '@/engine/types';
import { useNetworkStore } from '@/store/networkStore';

// Online lobby. Two modes share this screen:
//   - host: shows the room code, the editable seat list (host can mark seats
//     open / AI, set their own name), per-game options summary, and the
//     "Start game" button.
//   - guest: shows the host's broadcast seat list, lets the local user claim
//     an open seat, and waits for the host to start.
// Chat is shared.

export function LobbyScreen() {
  const role = useNetworkStore((s) => s.role);
  const lobby = useNetworkStore((s) => s.lobby);
  const connection = useNetworkStore((s) => s.connection);
  const roomCode = useNetworkStore((s) => s.roomCode);
  const myUuid = useNetworkStore((s) => s.uuid);
  const onlinePeers = useNetworkStore((s) => s.onlinePeers);
  const displayName = useNetworkStore((s) => s.displayName);
  const setLocalName = useNetworkStore((s) => s.setLocalName);
  const leaveRoom = useNetworkStore((s) => s.leaveRoom);

  if (connection === 'connecting') {
    return (
      <main style={panelStyle}>
        <h2>Joining room…</h2>
        <p style={{ color: '#94a3b8' }}>
          Connecting to room <code>{roomCode}</code>. Waiting for the host's lobby.
        </p>
        <button onClick={leaveRoom}>Cancel</button>
      </main>
    );
  }

  if (!lobby) {
    return (
      <main style={panelStyle}>
        <h2>Lobby</h2>
        <p style={{ color: '#94a3b8' }}>No lobby state. Did the host disconnect?</p>
        <button onClick={leaveRoom}>Leave</button>
      </main>
    );
  }

  const mod = GAMES[lobby.gameId];
  const seatedUuid = lobby.seats.find((s) => s.uuid === myUuid);

  return (
    <main style={panelStyle}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>
            {mod.displayName} — Lobby ({role})
          </h1>
          <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
            Room code: <code style={{ color: '#cbd5e1' }}>{roomCode}</code> · Share
            this with friends to let them join.
          </div>
        </div>
        <button onClick={leaveRoom}>Leave</button>
      </header>

      <section style={sectionStyle}>
        <h3 style={h3Style}>Your name</h3>
        <input
          value={displayName}
          onChange={(e) => setLocalName(e.target.value)}
          style={{ padding: 6, minWidth: 220 }}
          maxLength={20}
        />
      </section>

      {role === 'host' ? (
        <HostSeatList lobby={lobby} myUuid={myUuid} onlinePeers={onlinePeers} />
      ) : (
        <GuestSeatList lobby={lobby} myUuid={myUuid} onlinePeers={onlinePeers} />
      )}

      <section style={sectionStyle}>
        <h3 style={h3Style}>Chat</h3>
        <ChatPane />
      </section>

      {role === 'host' && <HostControls />}
      {role === 'guest' && !seatedUuid && (
        <p style={{ color: '#94a3b8', marginTop: 12 }}>Pick an open seat to play.</p>
      )}
      {role === 'guest' && seatedUuid && (
        <p style={{ color: '#94a3b8', marginTop: 12 }}>
          Seated. Waiting for the host to start…
        </p>
      )}
    </main>
  );
}

// ----------------------------------------------------------------------------
// Host seat list
// ----------------------------------------------------------------------------

function HostSeatList({
  lobby,
  myUuid,
  onlinePeers,
}: {
  lobby: ReturnType<typeof useNetworkStore.getState>['lobby'];
  myUuid: string | null;
  onlinePeers: Record<string, number>;
}) {
  const setLobbySeats = useNetworkStore((s) => s.setLobbySeats);
  if (!lobby) return null;
  const mod = GAMES[lobby.gameId];

  const setSeatCount = (n: number) => {
    const cur = lobby.seats.slice();
    if (n > cur.length) {
      for (let i = cur.length; i < n; i++) {
        cur.push({ index: i, uuid: null, name: `Seat ${i + 1}`, isAI: false });
      }
    } else {
      cur.length = n;
    }
    setLobbySeats(cur);
  };

  const toggleAI = (idx: number) => {
    const cur = lobby.seats.slice();
    const seat = cur[idx]!;
    if (seat.uuid === myUuid) return; // can't AI-flag the host's own seat
    if (seat.uuid && !seat.isAI) return; // can't AI-flag an occupied human seat
    cur[idx] = {
      ...seat,
      isAI: !seat.isAI,
      // Mark an AI seat with a stable synthetic uuid so the host loop can
      // route it. Clearing the AI flag returns it to "open".
      uuid: seat.isAI ? null : `ai:${idx}`,
      name: seat.isAI ? `Seat ${idx + 1}` : `AI ${idx + 1}`,
    };
    setLobbySeats(cur);
  };

  const renameSeat = (idx: number, name: string) => {
    const cur = lobby.seats.slice();
    cur[idx] = { ...cur[idx]!, name };
    setLobbySeats(cur);
  };

  return (
    <section style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
        <h3 style={{ ...h3Style, margin: 0 }}>Seats</h3>
        <div style={{ color: '#94a3b8', fontSize: 12 }}>
          {lobby.seats.length} / {mod.maxPlayers} (min {mod.minPlayers})
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            onClick={() => setSeatCount(Math.max(mod.minPlayers, lobby.seats.length - 1))}
            disabled={lobby.seats.length <= mod.minPlayers}
          >
            −
          </button>
          <button
            onClick={() => setSeatCount(Math.min(mod.maxPlayers, lobby.seats.length + 1))}
            disabled={lobby.seats.length >= mod.maxPlayers}
          >
            +
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {lobby.seats.map((seat, idx) => (
          <SeatRow
            key={idx}
            seat={seat}
            isMine={seat.uuid === myUuid}
            online={seat.uuid ? (onlinePeers[seat.uuid] ?? 0) > 0 || seat.isAI : false}
          >
            {seat.uuid === myUuid && (
              <input
                value={seat.name}
                onChange={(e) => renameSeat(idx, e.target.value)}
                maxLength={20}
                style={{ padding: 4, marginLeft: 8 }}
              />
            )}
            {!seat.uuid && (
              <button onClick={() => toggleAI(idx)} style={{ marginLeft: 'auto' }}>
                Mark AI
              </button>
            )}
            {seat.isAI && (
              <button onClick={() => toggleAI(idx)} style={{ marginLeft: 'auto' }}>
                Mark Open
              </button>
            )}
          </SeatRow>
        ))}
      </div>
    </section>
  );
}

function HostControls() {
  const lobby = useNetworkStore((s) => s.lobby);
  const startGame = useNetworkStore((s) => s.startGame);
  if (!lobby) return null;
  const mod = GAMES[lobby.gameId];
  const filled = lobby.seats.filter((s) => s.uuid !== null).length;
  const ready = filled === lobby.seats.length && filled >= mod.minPlayers;

  return (
    <footer style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        onClick={startGame}
        disabled={!ready}
        style={{
          background: ready ? '#10b981' : '#374151',
          color: 'white',
          padding: '10px 18px',
          fontWeight: 700,
          fontSize: 15,
        }}
      >
        Start game →
      </button>
      <span style={{ color: '#94a3b8', fontSize: 13 }}>
        {filled} / {lobby.seats.length} seats filled
        {filled < mod.minPlayers && ` · need ≥${mod.minPlayers}`}
      </span>
    </footer>
  );
}

// ----------------------------------------------------------------------------
// Guest seat list
// ----------------------------------------------------------------------------

function GuestSeatList({
  lobby,
  myUuid,
  onlinePeers,
}: {
  lobby: ReturnType<typeof useNetworkStore.getState>['lobby'];
  myUuid: string | null;
  onlinePeers: Record<string, number>;
}) {
  const requestSeat = useNetworkStore((s) => s.requestSeat);
  if (!lobby) return null;
  const myCurrentSeat = lobby.seats.find((s) => s.uuid === myUuid);

  return (
    <section style={sectionStyle}>
      <h3 style={h3Style}>Seats</h3>
      <div style={{ display: 'grid', gap: 6 }}>
        {lobby.seats.map((seat, idx) => {
          const canClaim = !seat.uuid && !seat.isAI;
          return (
            <SeatRow
              key={idx}
              seat={seat}
              isMine={seat.uuid === myUuid}
              online={seat.uuid ? (onlinePeers[seat.uuid] ?? 0) > 0 || seat.isAI : false}
            >
              {canClaim && (
                <button onClick={() => requestSeat(idx)} style={{ marginLeft: 'auto' }}>
                  Claim
                </button>
              )}
              {seat.uuid === myUuid && (
                <button onClick={() => requestSeat('leave')} style={{ marginLeft: 'auto' }}>
                  Leave seat
                </button>
              )}
            </SeatRow>
          );
        })}
      </div>
      {myCurrentSeat && (
        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>
          You hold seat {myCurrentSeat.index + 1}.
        </p>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Seat row
// ----------------------------------------------------------------------------

function SeatRow({
  seat,
  isMine,
  online,
  children,
}: {
  seat: Seat;
  isMine: boolean;
  online: boolean;
  children?: React.ReactNode;
}) {
  let label: string;
  let color: string;
  if (seat.isAI) {
    label = 'AI';
    color = '#a78bfa';
  } else if (!seat.uuid) {
    label = 'Open';
    color = '#64748b';
  } else if (isMine) {
    label = 'You';
    color = '#10b981';
  } else {
    label = online ? 'Online' : 'Offline';
    color = online ? '#60a5fa' : '#f87171';
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        background: isMine ? '#1e293b' : '#0f172a',
        border: `1px solid ${isMine ? '#10b981' : '#1f2937'}`,
        borderRadius: 4,
      }}
    >
      <span
        style={{
          minWidth: 28,
          textAlign: 'center',
          background: '#1f2937',
          padding: '2px 6px',
          borderRadius: 3,
          fontSize: 12,
        }}
      >
        {seat.index + 1}
      </span>
      <span style={{ minWidth: 110, fontWeight: 600 }}>
        {seat.uuid || seat.isAI ? seat.name : <em style={{ color: '#64748b' }}>(open)</em>}
      </span>
      <span style={{ color, fontSize: 12, padding: '2px 6px', border: `1px solid ${color}`, borderRadius: 3 }}>
        {label}
      </span>
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Chat
// ----------------------------------------------------------------------------

function ChatPane() {
  const chat = useNetworkStore((s) => s.chat);
  const sendChat = useNetworkStore((s) => s.sendChat);
  const myUuid = useNetworkStore((s) => s.uuid);
  const [draft, setDraft] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sendChat(text);
    setDraft('');
  };

  const lines = useMemo(() => chat.slice(-50), [chat]);

  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1f2937',
        borderRadius: 4,
        padding: 8,
      }}
    >
      <div
        style={{
          height: 140,
          overflowY: 'auto',
          fontSize: 13,
          fontFamily: 'monospace',
          marginBottom: 8,
        }}
      >
        {lines.length === 0 && (
          <div style={{ color: '#64748b' }}>No messages yet. Say hi!</div>
        )}
        {lines.map((m) => (
          <div key={m.id} style={{ marginBottom: 2 }}>
            <span
              style={{
                color: m.senderUuid === myUuid ? '#10b981' : '#60a5fa',
                fontWeight: 700,
              }}
            >
              {m.senderName}:
            </span>{' '}
            <span style={{ color: '#cbd5e1' }}>{m.text}</span>
          </div>
        ))}
      </div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          maxLength={200}
          style={{ flex: 1, padding: 6 }}
        />
        <button type="submit" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Styles
// ----------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
  padding: 24,
  maxWidth: 720,
  margin: '0 auto',
};

const sectionStyle: React.CSSProperties = {
  background: '#0b1220',
  border: '1px solid #1f2937',
  borderRadius: 6,
  padding: 16,
  marginBottom: 16,
};

const h3Style: React.CSSProperties = { margin: '0 0 12px 0', fontSize: 14, color: '#cbd5e1' };
