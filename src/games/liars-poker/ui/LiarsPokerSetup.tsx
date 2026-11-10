import { launchGame } from '@/ui/shared/launch';
import { OnlineHostToggle } from '@/ui/shared/OnlineHostToggle';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { liarsPokerModule } from '../module';
import type { LiarsPokerOptions } from '../module';
import type { Card } from '../state';
import { CardDefs, PlayingCard } from './PlayingCard';
import styles from './LiarsPokerSetup.module.css';

interface Props {
  onBack: () => void;
}

const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8];
const CARD_COUNT_OPTIONS = [1, 2, 3, 4, 5];
const MAX = 8;

const HERO: Card[] = [
  { rank: 14, suit: 'spades' },
  { rank: 13, suit: 'hearts' },
  { rank: 12, suit: 'diamonds' },
  { rank: 11, suit: 'clubs' },
  { rank: 10, suit: 'hearts' },
];

export function LiarsPokerSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>(Array.from({ length: MAX }, (_, i) => `Player ${i + 1}`));
  const [aiFlags, setAiFlags] = useState<boolean[]>(Array.from({ length: MAX }, (_, i) => i !== 0));
  const [cardsPerPlayer, setCardsPerPlayer] = useState(3);
  const [dummyHand, setDummyHand] = useState(true);
  const [online, setOnline] = useState(false);

  const flags = aiFlags.slice(0, playerCount);
  const humanCount = flags.filter((f) => !f).length;
  const canStart = !online || humanCount > 0;

  const updateName = (i: number, value: string) => setNames((cur) => cur.map((n, j) => (j === i ? value : n)));
  const toggleAI = (i: number) => setAiFlags((cur) => cur.map((f, j) => (j === i ? !f : f)));

  const startGame = () => {
    const playerNames = Array.from({ length: playerCount }, (_, i) => (names[i] ?? '').trim() || `Player ${i + 1}`);
    const opts: LiarsPokerOptions = {
      players: playerNames.map((name, i) => ({ name, isAI: flags[i] ?? false })),
      cardsPerPlayer,
      dummyHand,
    };
    launchGame({
      module: liarsPokerModule,
      options: opts,
      playerNames,
      aiSeats: flags.flatMap((f, i) => (f ? [i] : [])),
      online,
    });
  };

  return (
    <CardDefs>
      <div className={styles.root}>
        <div className={styles.smoke} aria-hidden />
        <header className={styles.header}>
          <button onClick={onBack} className={styles.back}>
            ← Back
          </button>
          <div className={styles.hero} aria-hidden>
            {HERO.map((c, i) => (
              <span key={i} className={styles.heroCard} style={{ '--k': i - 2 } as CSSProperties}>
                <PlayingCard card={c} width={58} />
              </span>
            ))}
          </div>
          <h1 className={styles.title}>Liar&apos;s Poker</h1>
          <p className={styles.tagline}>Everyone holds a piece of the hand. Nobody holds the truth.</p>
        </header>

        <section className={styles.panel}>
          <h3 className={styles.h3}>At the table</h3>
          <div className={styles.countControls} role="radiogroup" aria-label="Number of players">
            {PLAYER_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={n === playerCount}
                className={`${styles.chip} ${n === playerCount ? styles.chipOn : ''}`}
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
                role="switch"
                aria-checked={flags[i] ?? false}
                aria-label={`Seat ${i + 1} is AI`}
                className={`${styles.aiSwitch} ${flags[i] ? styles.aiOn : ''}`}
                onClick={() => toggleAI(i)}
              >
                <span className={styles.aiKnob} />
                <span className={styles.aiLabel}>{flags[i] ? 'AI' : 'Human'}</span>
              </button>
            </div>
          ))}
          {humanCount > 1 && !online && <p className={styles.note}>Pass-and-play: hands stay face-down between turns.</p>}
        </section>

        <section className={styles.panel}>
          <h3 className={styles.h3}>Cards per player</h3>
          <div className={styles.countControls} role="radiogroup" aria-label="Cards per player">
            {CARD_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={n === cardsPerPlayer}
                className={`${styles.chip} ${n === cardsPerPlayer ? styles.chipOn : ''}`}
                onClick={() => setCardsPerPlayer(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className={styles.note}>
            {playerCount * cardsPerPlayer} cards in the combined pool at the start. Each lost call costs a card.
          </p>
          <label className={styles.rule}>
            <input type="checkbox" checked={dummyHand} onChange={(e) => setDummyHand(e.target.checked)} />
            <span>
              <b>Dummy last life</b> — lose your final card and you play on with one card held to your forehead:
              everyone can see it except you. Lose again and you&apos;re out.
            </span>
          </label>
        </section>

        <section className={styles.panel}>
          <h3 className={styles.h3}>House rules</h3>
          <ul className={styles.howto}>
            <li>Claims are poker hands that exist somewhere across <i>everyone&apos;s</i> cards combined.</li>
            <li>Each claim must beat the last (high card → pair → two pair → trips → straight → flush → full house → quads → straight flush). A-2-3-4-5 counts as a 5-high straight.</li>
            <li>
              <b>Flushes run backwards:</b> a flush names its top card and needs four lower cards of the suit, so a
              lower top card is the stronger (rarer) flush.
            </li>
            <li>Call the bluff and every card turns over. Wrong claim: the claimant loses a card. Right claim: the caller does.</li>
          </ul>
        </section>

        <OnlineHostToggle online={online} onChange={setOnline} />

        <footer className={styles.footer}>
          {!canStart && <span className={styles.note}>Online games need at least one human seat.</span>}
          <button className={styles.startButton} onClick={startGame} disabled={!canStart}>
            {online ? 'Open the back room →' : 'Deal me in →'}
          </button>
        </footer>
      </div>
    </CardDefs>
  );
}
