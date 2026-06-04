import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { liarsPokerModule } from '../module';
import type { LiarsPokerOptions } from '../module';
import styles from './LiarsPokerSetup.module.css';

interface Props {
  onBack: () => void;
}

const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8];
const CARD_COUNT_OPTIONS = [1, 2, 3, 4, 5];

export function LiarsPokerSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>(
    Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`),
  );
  const [cardsPerPlayer, setCardsPerPlayer] = useState(3);
  const [dummyHand, setDummyHand] = useState(true);
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
    const opts: LiarsPokerOptions = {
      players: playerNames.map((name) => ({ name, isAI: false })),
      cardsPerPlayer,
      dummyHand,
    };
    if (online) {
      const code = roomCode.trim();
      if (!code) return;
      useNetworkStore.getState().hostRoom(code, 'liars-poker', {
        seatCount: playerCount,
        names: playerNames,
        options: opts as unknown as Record<string, unknown>,
      });
      return;
    }
    const config = {
      gameId: 'liars-poker' as const,
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
    const initialState = liarsPokerModule.createInitialState(config);
    useGameStore.getState().startLocalGame(liarsPokerModule, initialState, 0);
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button onClick={onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 22 }}>Liar's Poker — Setup</h1>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Players</h3>
        <p className={styles.subtitle}>
          2–8 players. Standard 52-card deck.
        </p>
        <div className={styles.countControls}>
          {PLAYER_COUNT_OPTIONS.map((n) => (
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
        <h3 className={styles.h3}>Cards per player</h3>
        <p className={styles.subtitle}>
          Default 3. Larger hands mean stronger declared hands are reachable.
        </p>
        <div className={styles.countControls}>
          {CARD_COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              className={n === cardsPerPlayer ? styles.countActive : ''}
              onClick={() => setCardsPerPlayer(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>House rules</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={dummyHand}
            onChange={(e) => setDummyHand(e.target.checked)}
          />
          <span>
            <b>Dummy-hand last life</b> — when you lose your last card, you get one final round dealt a single card you can't see (but everyone else can).
          </span>
        </label>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>How to play</h3>
        <ul style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
          <li>Declare a poker hand (e.g. "pair of 7s", "flush 10-high spades"). The claim is checked against EVERYONE'S combined cards.</li>
          <li>Next seat must declare a strictly stronger hand OR call "liar".</li>
          <li>Standard hand ranking, but <b>flushes invert</b>: lower top card is stronger (a 6-high flush beats an A-high flush — it's harder to find).</li>
          <li>Flushes need the exact top card present + 4 lower same-suit cards.</li>
          <li>Liar wrong (claim exists) → caller loses a card. Liar right → bidder loses.</li>
          <li>Lose all cards → you're out (or dummy round, if enabled).</li>
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
