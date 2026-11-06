import { useState, type CSSProperties } from 'react';
import { launchGame } from '@/ui/shared/launch';
import { OnlineHostToggle } from '@/ui/shared/OnlineHostToggle';
import { loveLetterModule } from '../module';
import type { LoveLetterOptions } from '../module';
import { tokensToWinFor } from '../setup';
import type { Rank } from '../state';
import { LoveCard, TokenGem } from './CardArt';
import styles from './LoveLetterSetup.module.css';

// Host setup for Love Letter: player count (2–4), names, which seats the AI
// plays, and solo vs online.

interface Props {
  onBack: () => void;
}

const COUNT_OPTIONS = [2, 3, 4];
const FAN: Rank[] = [1, 3, 6, 8];

export function LoveLetterSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(3);
  const [names, setNames] = useState<string[]>(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
  // Seat 1 human, the rest AI by default (a ready-to-play solo table).
  const [ai, setAi] = useState<boolean[]>([false, true, true, true]);
  const [online, setOnline] = useState(false);

  const updateName = (i: number, value: string) =>
    setNames((cur) => cur.map((n, j) => (j === i ? value : n)));
  const toggleAi = (i: number) => setAi((cur) => cur.map((v, j) => (j === i ? !v : v)));

  const startGame = () => {
    const playerNames = Array.from({ length: playerCount }, (_, i) =>
      (names[i] ?? '').trim() || `Player ${i + 1}`,
    );
    const aiSeats = playerNames.map((_, i) => i).filter((i) => ai[i]);
    const opts: LoveLetterOptions = {
      players: playerNames.map((name, i) => ({ name, isAI: aiSeats.includes(i) })),
    };
    launchGame({ module: loveLetterModule, options: opts, playerNames, aiSeats, online });
  };

  const target = tokensToWinFor(playerCount);
  const humans = Array.from({ length: playerCount }, (_, i) => i).filter((i) => !ai[i]).length;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button className={styles.back} onClick={onBack}>
          ← Back
        </button>
        <div className={styles.fan} aria-hidden>
          {FAN.map((r, i) => (
            <span
              key={r}
              className={styles.fanCard}
              style={{ transform: `rotate(${(i - 1.5) * 13}deg) translateY(${Math.abs(i - 1.5) * 5}px)` } as CSSProperties}
            >
              <LoveCard rank={r} showText={false} />
            </span>
          ))}
        </div>
        <div>
          <h1 className={styles.title}>Love Letter</h1>
          <p className={styles.tagline}>Win the Princess's heart — one letter at a time.</p>
        </div>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Suitors at court</h3>
        <p className={styles.subtitle}>
          2–4 players. First to {target} <TokenGem size={14} /> tokens of affection wins.
        </p>
        <div className={styles.countControls} role="radiogroup" aria-label="Number of players">
          {COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={n === playerCount}
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
              aria-label={`Seat ${i + 1} name`}
            />
            <button
              type="button"
              role="switch"
              aria-checked={!!ai[i]}
              aria-label={`Seat ${i + 1} played by AI`}
              className={`${styles.aiToggle} ${ai[i] ? styles.aiOn : ''}`}
              onClick={() => toggleAi(i)}
            >
              <span className={styles.aiKnob} />
              <span className={styles.aiLabel}>{ai[i] ? 'AI' : 'Human'}</span>
            </button>
          </div>
        ))}
        <p className={styles.hint}>
          {humans === 0
            ? 'Every seat is AI — you will watch the court play itself.'
            : humans === 1
              ? 'One human: you play against the AI.'
              : `${humans} humans: pass the device when a sealed letter appears (or host online).`}
        </p>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>How to play</h3>
        <ul className={styles.rules}>
          <li>16 cards: Princess (8), Countess (7), King (6), 2 Princes (5), 2 Handmaids (4), 2 Barons (3), 2 Priests (2), 5 Guards (1).</li>
          <li>One card is set aside face-down each round (with 2 players, three more are shown face-up).</li>
          <li>On your turn draw a card, then play one of your two and follow its text.</li>
          <li>Holding the Countess with the King or a Prince? You must play the Countess.</li>
          <li>Win the round as the last player in — or with the highest card when the deck runs out (tie: highest total played).</li>
        </ul>
      </section>

      <OnlineHostToggle online={online} onChange={setOnline} />

      <footer className={styles.footer}>
        <button className={styles.startButton} onClick={startGame}>
          {online ? 'Open the lobby →' : 'Seal and deliver →'}
        </button>
      </footer>
    </div>
  );
}
