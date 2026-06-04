import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { crossCluesModule } from '../module';
import type { CrossCluesOptions } from '../module';
import { DEFAULT_PACK_ID, PACKS } from '../word-packs';
import styles from './CrossCluesSetup.module.css';

// Local-host setup for Cross Clues. Picks player count (2-6), per-seat
// names, and a word pack. Mirrors the layout of AvalonSetup/CodenamesSetup.

interface Props {
  onBack: () => void;
}

const COUNT_OPTIONS = [2, 3, 4, 5, 6];

export function CrossCluesSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>([
    'Player 1',
    'Player 2',
    'Player 3',
    'Player 4',
    'Player 5',
    'Player 6',
  ]);
  const [packId, setPackId] = useState<string>(DEFAULT_PACK_ID);
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
    const opts: CrossCluesOptions = {
      players: playerNames.map((name) => ({ name, isAI: false })),
      packId,
    };
    if (online) {
      const code = roomCode.trim();
      if (!code) return;
      useNetworkStore.getState().hostRoom(code, 'cross-clues', {
        seatCount: playerCount,
        names: playerNames,
        options: opts as unknown as Record<string, unknown>,
      });
      return;
    }
    const config = {
      gameId: 'cross-clues' as const,
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
    const initialState = crossCluesModule.createInitialState(config);
    useGameStore.getState().startLocalGame(crossCluesModule, initialState, 0);
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button onClick={onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 22 }}>Cross Clues — Setup</h1>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Players</h3>
        <p className={styles.subtitle}>
          2–6 players. Best with 3–6. Each round one player privately holds a grid coordinate
          and gives a one-word clue; the next player submits the team&apos;s guess.
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
        <h3 className={styles.h3}>Word pack</h3>
        <div className={styles.packGrid}>
          {Object.values(PACKS).map((pack) => (
            <button
              key={pack.id}
              type="button"
              className={`${styles.packCard} ${pack.id === packId ? styles.active : ''}`}
              onClick={() => setPackId(pack.id)}
            >
              <span className={styles.packName}>{pack.displayName}</span>
              <span className={styles.packDescription}>{pack.description}</span>
              <span className={styles.packCount}>{pack.words.length} words</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>How to play</h3>
        <ul style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
          <li>10 secret words land on a 5×5 grid: 5 as row labels (A–E), 5 as column labels (1–5).</li>
          <li>Each round, the clue-giver privately draws a coordinate (e.g., C3) and writes a <b>one-word clue</b> connecting the row word and column word.</li>
          <li>The team discusses; the designated guesser submits ONE guess. Correct → green token, wrong → red token on the true cell.</li>
          <li>Play all 25 coordinates. Score 16+ is great, 21+ legendary, 25 perfect.</li>
        </ul>
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
