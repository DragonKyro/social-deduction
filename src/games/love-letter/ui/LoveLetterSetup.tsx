import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { loveLetterModule } from '../module';
import type { LoveLetterOptions } from '../module';
import { tokensToWinFor } from '../setup';
import styles from './LoveLetterSetup.module.css';

// Local-host setup for Love Letter. Picks player count (2-4), per-seat
// names. Mirrors the Cross Clues / Codenames setup pattern.

interface Props {
  onBack: () => void;
}

const COUNT_OPTIONS = [2, 3, 4];

export function LoveLetterSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(3);
  const [names, setNames] = useState<string[]>([
    'Player 1',
    'Player 2',
    'Player 3',
    'Player 4',
  ]);
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
    const opts: LoveLetterOptions = {
      players: playerNames.map((name) => ({ name, isAI: false })),
    };
    if (online) {
      const code = roomCode.trim();
      if (!code) return;
      useNetworkStore.getState().hostRoom(code, 'love-letter', {
        seatCount: playerCount,
        names: playerNames,
        options: opts as unknown as Record<string, unknown>,
      });
      return;
    }
    const config = {
      gameId: 'love-letter' as const,
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
    const initialState = loveLetterModule.createInitialState(config);
    useGameStore.getState().startLocalGame(loveLetterModule, initialState, 0);
  };

  const target = tokensToWinFor(playerCount);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button onClick={onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 22 }}>Love Letter — Setup</h1>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Players</h3>
        <p className={styles.subtitle}>
          2–4 players. First to {target} token{target === 1 ? '' : 's'} wins
          the suit.
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
        <h3 className={styles.h3}>How to play</h3>
        <ul style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
          <li>16-card deck: Princess(8), Countess(7), King(6), 2×Prince(5), 2×Handmaid(4), 2×Baron(3), 2×Priest(2), 5×Guard(1).</li>
          <li>One card is removed face-down each round. (2-player: 3 more cards are revealed face-up.)</li>
          <li>On your turn: draw 1, then play 1 of 2. Resolve its effect.</li>
          <li>If you hold the Countess together with the King or Prince, you <b>must</b> play the Countess.</li>
          <li>Win a round by being the last in, OR by holding the highest-ranked card when the deck runs out (tie → highest discard total).</li>
          <li>First to {target} token{target === 1 ? '' : 's'} wins the match.</li>
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
