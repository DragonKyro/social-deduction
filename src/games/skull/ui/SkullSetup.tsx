import { useState, type CSSProperties } from 'react';
import { launchGame } from '@/ui/shared/launch';
import { OnlineHostToggle } from '@/ui/shared/OnlineHostToggle';
import { skullModule } from '../module';
import type { SkullOptions } from '../module';
import { SkullDisk, tribeOf } from './DiskArt';
import styles from './SkullSetup.module.css';

interface Props {
  onBack: () => void;
}

const COUNT_OPTIONS = [3, 4, 5, 6];
const TARGET_OPTIONS = [1, 2, 3] as const;

export function SkullSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>(['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6']);
  // Seat 1 human, the rest AI by default.
  const [ai, setAi] = useState<boolean[]>([false, true, true, true, true, true]);
  const [challengeTarget, setChallengeTarget] = useState<1 | 2 | 3>(2);
  const [online, setOnline] = useState(false);

  const updateName = (i: number, value: string) => setNames((cur) => cur.map((n, j) => (j === i ? value : n)));
  const toggleAi = (i: number) => setAi((cur) => cur.map((v, j) => (j === i ? !v : v)));

  const startGame = () => {
    const playerNames = Array.from({ length: playerCount }, (_, i) => (names[i] ?? '').trim() || `Player ${i + 1}`);
    const aiSeats = playerNames.map((_, i) => i).filter((i) => ai[i]);
    const opts: SkullOptions = {
      players: playerNames.map((name, i) => ({ name, isAI: aiSeats.includes(i) })),
      challengeTarget,
    };
    launchGame({ module: skullModule, options: opts, playerNames, aiSeats, online });
  };

  const humans = Array.from({ length: playerCount }, (_, i) => i).filter((i) => !ai[i]).length;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button className={styles.back} onClick={onBack}>
          ← Back
        </button>
        <div className={styles.hero} aria-hidden>
          <span className={styles.heroDisk} style={{ transform: 'rotate(-14deg)' }}>
            <SkullDisk face="rose" seat={0} size="100%" />
          </span>
          <span className={styles.heroDisk} style={{ transform: 'rotate(0deg)' }}>
            <SkullDisk face="skull" seat={3} size="100%" />
          </span>
          <span className={styles.heroDisk} style={{ transform: 'rotate(14deg)' }}>
            <SkullDisk face="back" seat={1} size="100%" />
          </span>
        </div>
        <div>
          <h1 className={styles.title}>Skull</h1>
          <p className={styles.tagline}>Roses, one skull, and a lot of nerve.</p>
        </div>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Who's at the table</h3>
        <p className={styles.subtitle}>3–6 players. Each brings 3 roses and 1 skull.</p>
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
            <span className={styles.seatDisk} style={{ '--tribe': tribeOf(i).tint } as CSSProperties}>
              <SkullDisk face="back" seat={i} size="100%" title={`${tribeOf(i).name} tribe`} />
            </span>
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
            ? 'All AI — pull up a stool and watch.'
            : humans === 1
              ? 'One human against the house.'
              : `${humans} humans: pass the device when prompted (or host online).`}
        </p>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Challenges to win</h3>
        <p className={styles.subtitle}>Official rules: 2.</p>
        <div className={styles.countControls} role="radiogroup" aria-label="Challenges to win">
          {TARGET_OPTIONS.map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={n === challengeTarget}
              className={n === challengeTarget ? styles.countActive : ''}
              onClick={() => setChallengeTarget(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>House rules (the official ones)</h3>
        <ul className={styles.rules}>
          <li>Everyone lays a disk face-down. Then, in turn, add another disk or open the bidding: “I can flip N roses.”</li>
          <li>Raise or pass, clockwise. The highest bidder must flip that many — all of their own stack first, then the top disks of anyone else's.</li>
          <li>All roses: you win the challenge. First to {challengeTarget} takes the bar.</li>
          <li>Hit someone's skull: they take one of your disks at random, unseen. Hit your own: you choose which one goes.</li>
          <li>Lose every disk and you're out. Last player standing wins too.</li>
        </ul>
      </section>

      <OnlineHostToggle online={online} onChange={setOnline} />

      <footer className={styles.footer}>
        <button className={styles.startButton} onClick={startGame}>
          {online ? 'Open the lobby →' : 'Deal me in →'}
        </button>
      </footer>
    </div>
  );
}
