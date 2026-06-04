import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { skullModule } from '../module';
import type { SkullOptions } from '../module';
import styles from './SkullSetup.module.css';

interface Props {
  onBack: () => void;
}

const COUNT_OPTIONS = [3, 4, 5, 6];
const TARGET_OPTIONS = [1, 2, 3] as const;

export function SkullSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>([
    'Player 1',
    'Player 2',
    'Player 3',
    'Player 4',
    'Player 5',
    'Player 6',
  ]);
  const [challengeTarget, setChallengeTarget] = useState<1 | 2 | 3>(2);
  const [online, setOnline] = useState(false);
  const [roomCode, setRoomCode] = useState('');

  const updateName = (i: number, value: string) => {
    setNames((cur) => {
      const next = cur.slice();
      next[i] = value;
      return next;
    });
  };

  const startGame = () => {
    const playerNames = Array.from({ length: playerCount }, (_, i) =>
      (names[i] ?? `Player ${i + 1}`).trim() || `Player ${i + 1}`,
    );
    const opts: SkullOptions = {
      players: playerNames.map((name) => ({ name, isAI: false })),
      challengeTarget,
    };
    if (online) {
      const code = roomCode.trim();
      if (!code) return;
      useNetworkStore.getState().hostRoom(code, 'skull', {
        seatCount: playerCount,
        names: playerNames,
        options: opts as unknown as Record<string, unknown>,
      });
      return;
    }
    const config = {
      gameId: 'skull' as const,
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
    const initialState = skullModule.createInitialState(config);
    useGameStore.getState().startLocalGame(skullModule, initialState, 0);
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button onClick={onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 22 }}>Skull — Setup</h1>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Players</h3>
        <p className={styles.subtitle}>
          3–6 players. Each starts with 3 roses and 1 skull.
        </p>
        <div className={styles.countControls}>
          {COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              className={n === playerCount ? styles.countActive : ''}
              onClick={() => setPlayerCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
        {Array.from({ length: playerCount }, (_, i) => (
          <div className={styles.nameRow} key={i}>
            <span className={styles.seatNumber}>{i + 1}</span>
            <input
              className={styles.nameInput}
              value={names[i] ?? ''}
              onChange={(e) => updateName(i, e.target.value)}
              maxLength={20}
            />
          </div>
        ))}
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Challenge target</h3>
        <p className={styles.subtitle}>
          How many successful challenges to win the match. Default 2.
        </p>
        <div className={styles.countControls}>
          {TARGET_OPTIONS.map((n) => (
            <button
              key={n}
              className={n === challengeTarget ? styles.countActive : ''}
              onClick={() => setChallengeTarget(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>How to play</h3>
        <ul style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
          <li>Each round: every player places one disk face-down. Then players take turns placing more or opening a bid ("I can flip N roses without a skull").</li>
          <li>Bidders raise or pass clockwise. Highest bidder must flip that many disks — starting with their own stack, then opponents' (top down).</li>
          <li>All roses → you win 1 challenge. Hit a skull → you lose a disk (the engine picks rose first).</li>
          <li>First to {challengeTarget} successful challenge{challengeTarget === 1 ? '' : 's'} wins the match.</li>
          <li>Lose all your disks → you're out.</li>
        </ul>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Multiplayer</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={online}
            onChange={(e) => setOnline(e.target.checked)}
          />
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
