import { useState } from 'react';
import { GAMES } from '@/engine/registry';
import type { Seat } from '@/engine/types';
import { inviteLink } from '@/net';
import type { LobbyState } from '@/net';
import { useNetworkStore } from '@/store/networkStore';
import { GameTileArt } from '@/ui/home/GameTileArt';
import { ChatPanel } from '@/ui/shared/ChatPanel';
import styles from './LobbyScreen.module.css';

// Online lobby. The host sees the room code + invite link, edits seats
// (open / AI / count) and starts the match; guests claim an open seat and
// wait. Both share chat. If a match is running, guests who stepped out (or
// spectators) can return to it from here.

export function LobbyScreen() {
  const role = useNetworkStore((s) => s.role);
  const lobby = useNetworkStore((s) => s.lobby);
  const connection = useNetworkStore((s) => s.connection);
  const roomCode = useNetworkStore((s) => s.roomCode);
  const leaveRoom = useNetworkStore((s) => s.leaveRoom);
  const error = useNetworkStore((s) => s.error);
  const clearError = useNetworkStore((s) => s.clearError);

  if (connection === 'connecting' || !lobby) {
    return (
      <main className={styles.root}>
        <div className={`${styles.panel} ${styles.connecting}`}>
          <div className={styles.spinner} aria-hidden />
          <h2>{role === 'host' ? 'Opening your room…' : 'Joining room…'}</h2>
          <p className={styles.dim}>
            {roomCode ? (
              <>
                Room <span className={styles.inlineCode}>{roomCode}</span>
              </>
            ) : (
              'Contacting the game server.'
            )}
          </p>
          <button onClick={leaveRoom}>Cancel</button>
        </div>
      </main>
    );
  }

  const mod = GAMES[lobby.gameId];

  const leave = () => {
    if (
      role === 'host' &&
      typeof window.confirm === 'function' &&
      !window.confirm('Close this room for everyone?')
    ) {
      return;
    }
    leaveRoom();
  };

  return (
    <main className={styles.root}>
      <header className={styles.hero}>
        <div className={styles.heroArt} aria-hidden>
          <GameTileArt id={lobby.gameId} />
        </div>
        <div className={styles.heroBody}>
          <div className={styles.kicker}>{role === 'host' ? 'Your room' : role === 'spectator' ? 'Watching' : 'Lobby'}</div>
          <h1 className={styles.title}>{mod.displayName}</h1>
          {roomCode && <RoomCode code={roomCode} />}
        </div>
        <button className={styles.leave} onClick={leave}>
          {role === 'host' ? 'Close room' : 'Leave'}
        </button>
      </header>

      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button onClick={clearError} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <StatusBanners lobby={lobby} />

      <div className={styles.columns}>
        <div className={styles.mainCol}>
          <NameCard />
          {role === 'host' ? <HostSeatList lobby={lobby} /> : <GuestSeatList lobby={lobby} />}
          {role === 'host' && <HostControls lobby={lobby} />}
        </div>
        <aside className={styles.sideCol}>
          <section className={styles.panel}>
            <h3 className={styles.h3}>Table talk</h3>
            <ChatPanel height={260} />
          </section>
          <section className={`${styles.panel} ${styles.note}`}>
            <h3 className={styles.h3}>Secrets stay secret</h3>
            <p className={styles.dim}>
              The host’s device deals the game. Each player is sent only their own view, and the server
              won’t let anyone read another player’s. Use voice chat (e.g. Discord) for table talk if you
              like.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? code : inviteLink(code));
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard blocked: the code is on screen anyway.
    }
  };
  return (
    <div className={styles.codeRow}>
      <div className={styles.code} aria-label={`Room code ${code.split('').join(' ')}`}>
        {code.split('').map((ch, i) => (
          <span key={i} style={{ '--i': i } as React.CSSProperties}>
            {ch}
          </span>
        ))}
      </div>
      <div className={styles.codeActions}>
        <button onClick={() => copy('code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
        <button onClick={() => copy('link')}>{copied === 'link' ? 'Copied!' : 'Copy invite link'}</button>
      </div>
    </div>
  );
}

function StatusBanners({ lobby }: { lobby: LobbyState }) {
  const role = useNetworkStore((s) => s.role);
  const hostUuid = useNetworkStore((s) => s.hostUuid);
  const onlinePeers = useNetworkStore((s) => s.onlinePeers);
  const linkUp = useNetworkStore((s) => s.linkUp);
  const matchHidden = useNetworkStore((s) => s.matchHidden);
  const resumeMatch = useNetworkStore((s) => s.resumeMatch);
  const hostOnline = !!hostUuid && (onlinePeers[hostUuid] ?? 0) > 0;
  return (
    <>
      {!linkUp && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>Connection lost — reconnecting…</div>
      )}
      {role !== 'host' && !hostOnline && linkUp && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          The host is offline. Everything resumes when they’re back.
        </div>
      )}
      {role !== 'host' && lobby.inGame && (
        <div className={`${styles.banner} ${styles.bannerGold}`}>
          <span>A match is in progress.</span>
          {matchHidden && <button onClick={resumeMatch}>Return to the match →</button>}
        </div>
      )}
    </>
  );
}

function NameCard() {
  const displayName = useNetworkStore((s) => s.displayName);
  const setLocalName = useNetworkStore((s) => s.setLocalName);
  return (
    <section className={styles.panel}>
      <label className={styles.nameRow}>
        <span className={styles.h3}>Your name</span>
        <input
          value={displayName}
          onChange={(e) => setLocalName(e.target.value)}
          maxLength={20}
          className={styles.nameInput}
        />
      </label>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Seats
// ----------------------------------------------------------------------------

function HostSeatList({ lobby }: { lobby: LobbyState }) {
  const setLobbySeats = useNetworkStore((s) => s.setLobbySeats);
  const myUuid = useNetworkStore((s) => s.uuid);
  const onlinePeers = useNetworkStore((s) => s.onlinePeers);
  const mod = GAMES[lobby.gameId];
  const locked = lobby.inGame;

  const setSeatCount = (n: number) => {
    const cur = lobby.seats.slice();
    if (n > cur.length) {
      for (let i = cur.length; i < n; i++) cur.push({ index: i, uuid: null, name: `Seat ${i + 1}`, isAI: false });
    } else {
      // Never drop the host's own seat.
      while (cur.length > n) {
        const last = cur[cur.length - 1]!;
        if (last.uuid === myUuid) break;
        cur.pop();
      }
    }
    setLobbySeats(cur);
  };

  const toggleAI = (idx: number) => {
    const cur = lobby.seats.slice();
    const seat = cur[idx]!;
    if (seat.uuid === myUuid) return;
    if (seat.uuid && !seat.isAI) return; // occupied by a human
    cur[idx] = seat.isAI
      ? { ...seat, isAI: false, uuid: null, name: `Seat ${idx + 1}` }
      : { ...seat, isAI: true, uuid: `ai:${idx}`, name: `AI ${idx + 1}` };
    setLobbySeats(cur);
  };

  const kick = (idx: number) => {
    const cur = lobby.seats.slice();
    cur[idx] = { ...cur[idx]!, uuid: null, isAI: false, name: `Seat ${idx + 1}` };
    setLobbySeats(cur);
  };

  return (
    <section className={styles.panel}>
      <div className={styles.seatHeader}>
        <h3 className={styles.h3}>Seats</h3>
        <span className={styles.dim}>
          {lobby.seats.length} of {mod.minPlayers}–{mod.maxPlayers}
        </span>
        <div className={styles.stepper}>
          <button
            onClick={() => setSeatCount(Math.max(mod.minPlayers, lobby.seats.length - 1))}
            disabled={locked || lobby.seats.length <= mod.minPlayers}
            aria-label="Remove a seat"
          >
            −
          </button>
          <button
            onClick={() => setSeatCount(Math.min(mod.maxPlayers, lobby.seats.length + 1))}
            disabled={locked || lobby.seats.length >= mod.maxPlayers}
            aria-label="Add a seat"
          >
            +
          </button>
        </div>
      </div>
      <div className={`${styles.seats} sd-stagger`}>
        {lobby.seats.map((seat, idx) => (
          <SeatRow key={idx} seat={seat} index={idx} isMine={seat.uuid === myUuid} onlinePeers={onlinePeers}>
            {!locked && !seat.uuid && <button onClick={() => toggleAI(idx)}>Make AI</button>}
            {!locked && seat.isAI && <button onClick={() => toggleAI(idx)}>Open seat</button>}
            {!locked && seat.uuid && !seat.isAI && seat.uuid !== myUuid && (
              <button onClick={() => kick(idx)}>Unseat</button>
            )}
          </SeatRow>
        ))}
      </div>
    </section>
  );
}

function GuestSeatList({ lobby }: { lobby: LobbyState }) {
  const requestSeat = useNetworkStore((s) => s.requestSeat);
  const myUuid = useNetworkStore((s) => s.uuid);
  const onlinePeers = useNetworkStore((s) => s.onlinePeers);
  const mine = lobby.seats.find((s) => s.uuid === myUuid);
  const locked = lobby.inGame;

  return (
    <section className={styles.panel}>
      <div className={styles.seatHeader}>
        <h3 className={styles.h3}>Seats</h3>
        <span className={styles.dim}>
          {mine ? `You’re in seat ${mine.index + 1}.` : locked ? 'Seats are locked during a match.' : 'Pick an open seat to play.'}
        </span>
      </div>
      <div className={`${styles.seats} sd-stagger`}>
        {lobby.seats.map((seat, idx) => (
          <SeatRow key={idx} seat={seat} index={idx} isMine={seat.uuid === myUuid} onlinePeers={onlinePeers}>
            {!locked && !seat.uuid && !seat.isAI && <button onClick={() => requestSeat(idx)}>Sit here</button>}
            {!locked && seat.uuid === myUuid && <button onClick={() => requestSeat('leave')}>Stand up</button>}
          </SeatRow>
        ))}
      </div>
      {!locked && mine && <p className={styles.dim}>Waiting for the host to start…</p>}
    </section>
  );
}

function SeatRow({
  seat,
  index,
  isMine,
  onlinePeers,
  children,
}: {
  seat: Seat;
  index: number;
  isMine: boolean;
  onlinePeers: Record<string, number>;
  children?: React.ReactNode;
}) {
  const online = seat.isAI || (!!seat.uuid && (onlinePeers[seat.uuid] ?? 0) > 0);
  let status: { label: string; cls: string };
  if (seat.isAI) status = { label: 'AI', cls: styles.tagAi! };
  else if (!seat.uuid) status = { label: 'Open', cls: styles.tagOpen! };
  else if (isMine) status = { label: 'You', cls: styles.tagYou! };
  else status = online ? { label: 'Online', cls: styles.tagOnline! } : { label: 'Offline', cls: styles.tagOffline! };
  return (
    <div
      className={`${styles.seat} ${isMine ? styles.seatMine : ''} ${!seat.uuid && !seat.isAI ? styles.seatOpen : ''}`}
      style={{ '--i': index } as React.CSSProperties}
    >
      <span className={styles.seatNo}>{index + 1}</span>
      <span className={`${styles.dot} ${online ? styles.dotOn : ''}`} aria-hidden />
      <span className={styles.seatName}>{seat.uuid || seat.isAI ? seat.name : <em>empty chair</em>}</span>
      <span className={`${styles.tag} ${status.cls}`}>{status.label}</span>
      <span className={styles.seatActions}>{children}</span>
    </div>
  );
}

function HostControls({ lobby }: { lobby: LobbyState }) {
  const startGame = useNetworkStore((s) => s.startGame);
  const endMatch = useNetworkStore((s) => s.endMatch);
  const mod = GAMES[lobby.gameId];
  const filled = lobby.seats.filter((s) => s.uuid !== null).length;
  const ready = filled === lobby.seats.length && filled >= mod.minPlayers;
  if (lobby.inGame) {
    return (
      <footer className={styles.footer}>
        <button className={styles.secondary} onClick={endMatch}>
          End the running match
        </button>
      </footer>
    );
  }
  return (
    <footer className={styles.footer}>
      <button className={styles.start} onClick={startGame} disabled={!ready}>
        {lobby.match > 0 ? 'Deal a new game →' : 'Start the game →'}
      </button>
      <span className={styles.dim}>
        {ready
          ? 'Everyone’s seated.'
          : `${filled} of ${lobby.seats.length} seats filled — fill or make AI the rest.`}
      </span>
    </footer>
  );
}
