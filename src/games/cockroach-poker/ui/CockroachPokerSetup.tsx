import { launchGame } from '@/ui/shared/launch';
import { OnlineHostToggle } from '@/ui/shared/OnlineHostToggle';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { cockroachPokerModule } from '../module';
import type { CockroachPokerOptions } from '../module';
import { CREATURES } from '../state';
import { CREATURE_LABEL, CreatureCard, CreatureDefs } from './CreatureArt';
import styles from './CockroachPokerSetup.module.css';

interface Props {
  onBack: () => void;
}

const COUNT_OPTIONS = [3, 4, 5, 6];
const MAX = 6;

export function CockroachPokerSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>(Array.from({ length: MAX }, (_, i) => `Player ${i + 1}`));
  const [aiFlags, setAiFlags] = useState<boolean[]>(Array.from({ length: MAX }, (_, i) => i !== 0));
  const [online, setOnline] = useState(false);

  const flags = aiFlags.slice(0, playerCount);
  const humanCount = flags.filter((f) => !f).length;
  const canStart = !online || humanCount > 0;
  const perPlayer = Math.floor(64 / playerCount);
  const leftover = 64 - perPlayer * playerCount;

  const updateName = (i: number, value: string) => setNames((cur) => cur.map((n, j) => (j === i ? value : n)));
  const toggleAI = (i: number) => setAiFlags((cur) => cur.map((f, j) => (j === i ? !f : f)));

  const startGame = () => {
    const playerNames = Array.from({ length: playerCount }, (_, i) => (names[i] ?? '').trim() || `Player ${i + 1}`);
    const opts: CockroachPokerOptions = {
      players: playerNames.map((name, i) => ({ name, isAI: flags[i] ?? false })),
    };
    launchGame({
      module: cockroachPokerModule,
      options: opts,
      playerNames,
      aiSeats: flags.flatMap((f, i) => (f ? [i] : [])),
      online,
    });
  };

  return (
    <CreatureDefs>
      <div className={styles.root}>
        <header className={styles.header}>
          <button onClick={onBack} className={styles.back}>
            ← Back
          </button>
          <div className={styles.hero} aria-hidden>
            {CREATURES.map((c, i) => (
              <span key={c} className={styles.heroCard} style={{ '--k': i - 3.5 } as CSSProperties}>
                <CreatureCard creature={c} width={54} />
              </span>
            ))}
          </div>
          <h1 className={styles.title}>Cockroach Poker</h1>
          <p className={styles.tagline}>“This is a stink bug.” It is not a stink bug.</p>
        </header>

        <section className={styles.panel}>
          <h3 className={styles.h3}>Victims</h3>
          <div className={styles.countControls} role="radiogroup" aria-label="Number of players">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={n === playerCount}
                className={`${styles.countChip} ${n === playerCount ? styles.countActive : ''}`}
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
          <p className={styles.note}>
            {perPlayer} cards each{leftover > 0 ? ` (${leftover} set aside unseen)` : ''}.
            {humanCount > 1 && !online ? ' Pass-and-play: hands stay hidden between turns.' : ''}
          </p>
        </section>

        <section className={styles.panel}>
          <h3 className={styles.h3}>How to play</h3>
          <ul className={styles.howto}>
            <li>
              On your turn, slide a card face-down to anyone and name a creature — true or not:{' '}
              <i>“This is a {CREATURE_LABEL.toad.toLowerCase()}.”</i>
            </li>
            <li>
              The receiver calls <b>true</b> or <b>false</b>. Right: the passer takes the card face-up. Wrong: the receiver
              keeps it face-up.
            </li>
            <li>
              Or they <b>peek</b> and pass it on with a new claim to someone who hasn&apos;t seen it. The last person who
              hasn&apos;t seen it has to call.
            </li>
            <li>Whoever takes the card goes next. Four of one creature face-up — or no cards left on your turn — and you lose.</li>
          </ul>
        </section>

        <OnlineHostToggle online={online} onChange={setOnline} />

        <footer className={styles.footer}>
          {!canStart && <span className={styles.note}>Online games need at least one human seat.</span>}
          <button className={styles.startButton} onClick={startGame} disabled={!canStart}>
            {online ? 'Open the parlour →' : 'Release the bugs →'}
          </button>
        </footer>
      </div>
    </CreatureDefs>
  );
}
