import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { liarsDiceModule } from '../module';
import type { LiarsDiceOptions } from '../module';
import styles from './LiarsDiceSetup.module.css';

interface Props {
  onBack: () => void;
}

const COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8];

export function LiarsDiceSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>(
    Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`),
  );
  const [wildOnes, setWildOnes] = useState(true);
  const [spotOn, setSpotOn] = useState(true);
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
    const opts: LiarsDiceOptions = {
      players: playerNames.map((name) => ({ name, isAI: false })),
      wildOnes,
      spotOn,
      startingDice: 5,
    };
    if (online) {
      const code = roomCode.trim();
      if (!code) return;
      useNetworkStore.getState().hostRoom(code, 'liars-dice', {
        seatCount: playerCount,
        names: playerNames,
        options: opts as unknown as Record<string, unknown>,
      });
      return;
    }
    const config = {
      gameId: 'liars-dice' as const,
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
    const initialState = liarsDiceModule.createInitialState(config);
    useGameStore.getState().startLocalGame(liarsDiceModule, initialState, 0);
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button onClick={onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 22 }}>Liar's Dice — Setup</h1>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Players</h3>
        <p className={styles.subtitle}>
          2–8 players. Everyone rolls 5 dice in a hidden cup.
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
        <h3 className={styles.h3}>House rules</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={wildOnes}
            onChange={(e) => setWildOnes(e.target.checked)}
          />
          <span>
            <b>1s are wild</b> — count toward any bid face (except when the bid is on 1s).
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={spotOn}
            onChange={(e) => setSpotOn(e.target.checked)}
          />
          <span>
            <b>Spot-on call</b> — claim the bid is exactly correct. Win → bidder loses a die.
          </span>
        </label>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>How to play</h3>
        <ul style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
          <li>Each round: roll your dice, hide them. Active seat opens with a bid like "three 4s" — meaning "at least three 4s exist across all dice".</li>
          <li>Next seat must raise (more dice OR same dice + higher face) OR call "liar".</li>
          <li>Liar wrong → caller loses a die. Liar right → bidder loses a die.</li>
          <li>Out of dice = out of the game. Last player wins.</li>
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
          <span>Host an online room</span>
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
