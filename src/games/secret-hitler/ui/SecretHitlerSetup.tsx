import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { secretHitlerModule } from '../module';
import { alignmentCounts, fascistTrack } from '../tracks';
import type { ShOptions } from '../module';
import styles from './SecretHitlerSetup.module.css';

// Local-host setup screen for Secret Hitler. The host picks player count
// (5-10), edits names + AI flags, and starts the game. Roles are dealt
// automatically — there are no role toggles.

interface Props {
  onBack: () => void;
}

export function SecretHitlerSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(5);
  const [names, setNames] = useState<string[]>([
    'Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5',
    'AI 6', 'AI 7', 'AI 8', 'AI 9', 'AI 10',
  ]);
  const [aiFlags, setAiFlags] = useState<boolean[]>(() => [
    false, false, false, false, false, true, true, true, true, true,
  ]);
  const [online, setOnline] = useState(false);
  const [roomCode, setRoomCode] = useState('');

  const counts = alignmentCounts(playerCount);
  const track = fascistTrack(playerCount);

  const startGame = () => {
    const playerNames = Array.from({ length: playerCount }, (_, i) =>
      (names[i] ?? `Player ${i + 1}`).trim() || `Player ${i + 1}`,
    );
    const flags = Array.from({ length: playerCount }, (_, i) => aiFlags[i] ?? false);
    const opts: ShOptions = {
      players: playerNames.map((name, i) => ({ name, isAI: flags[i]! })),
      rebalanced6p: false,
    };
    if (online) {
      const code = roomCode.trim();
      if (!code) return;
      useNetworkStore.getState().hostRoom(code, 'secret-hitler', {
        seatCount: playerCount,
        names: playerNames,
        options: opts as unknown as Record<string, unknown>,
      });
      return;
    }
    const config = {
      gameId: 'secret-hitler' as const,
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
    const initialState = secretHitlerModule.createInitialState(config);
    useGameStore.getState().startLocalGame(secretHitlerModule, initialState, 0);
  };

  const powerLabel = (
    p: ReturnType<typeof fascistTrack>[number],
  ): string => {
    if (!p) return '—';
    if (p === 'investigate') return 'Investigate';
    if (p === 'specialElection') return 'Special election';
    if (p === 'peekTop3') return 'Peek top 3';
    return 'Execution';
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button onClick={onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 22 }}>Secret Hitler — Setup</h1>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Players</h3>
        <div className={styles.countControls}>
          {[5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              className={n === playerCount ? styles.countActive : ''}
              onClick={() => setPlayerCount(n)}
            >
              {n}
            </button>
          ))}
          <span style={{ marginLeft: 12, color: '#94a3b8', fontSize: 13 }}>
            {counts.liberals} liberals · {counts.fascists - 1} fascists · 1 Hitler
          </span>
        </div>
        <div className={styles.nameGrid}>
          {Array.from({ length: playerCount }, (_, i) => (
            <div key={i} className={styles.nameRow}>
              <span className={styles.seatNumber}>{i + 1}</span>
              <input
                className={styles.nameInput}
                value={names[i] ?? `Player ${i + 1}`}
                onChange={(e) =>
                  setNames((cur) => {
                    const next = cur.slice();
                    next[i] = e.target.value;
                    return next;
                  })
                }
                maxLength={20}
              />
              <label className={styles.aiToggle}>
                <input
                  type="checkbox"
                  checked={aiFlags[i] ?? false}
                  onChange={(e) =>
                    setAiFlags((cur) => {
                      const next = cur.slice();
                      next[i] = e.target.checked;
                      return next;
                    })
                  }
                />
                <span>AI</span>
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Fascist board powers</h3>
        <p className={styles.subtitle}>
          Each enacted fascist policy lights up a slot. Some slots grant the president an
          executive power immediately after enactment.
        </p>
        <div className={styles.trackPreview}>
          {track.map((p, i) => (
            <div key={i} className={styles.trackTile}>
              <span className={styles.trackSlot}>F{i + 1}</span>
              <span className={styles.trackPower}>{powerLabel(p)}</span>
            </div>
          ))}
          <div className={`${styles.trackTile} ${styles.trackTileWin}`}>
            <span className={styles.trackSlot}>F6</span>
            <span className={styles.trackPower}>FASCIST WIN</span>
          </div>
        </div>
        <p className={styles.subtitle} style={{ marginTop: 8 }}>
          Veto unlocks at 5 fascist policies. Hitler elected chancellor at 3+ fascist
          policies = instant fascist win. Executing Hitler = instant liberal win.
        </p>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Multiplayer</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
          <span>Host an online room (other players join with the room code)</span>
        </label>
        {online && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>Room code:</span>
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="any string (share with friends)"
              maxLength={32}
              style={{ padding: 6, minWidth: 240 }}
            />
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        <button
          className={styles.startButton}
          disabled={online && !roomCode.trim()}
          onClick={startGame}
        >
          {online ? 'Open lobby →' : 'Start game →'}
        </button>
      </footer>
    </div>
  );
}
