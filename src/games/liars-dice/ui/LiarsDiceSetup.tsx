import { launchGame } from '@/ui/shared/launch';
import { OnlineHostToggle } from '@/ui/shared/OnlineHostToggle';
import { useState } from 'react';
import { liarsDiceModule } from '../module';
import type { LiarsDiceOptions } from '../module';
import { Candle, DiceCup, DiceDefs, Die } from './DiceArt';
import styles from './LiarsDiceSetup.module.css';

interface Props {
  onBack: () => void;
}

const COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8];
const MAX = 8;

export function LiarsDiceSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>(Array.from({ length: MAX }, (_, i) => `Player ${i + 1}`));
  // Seat 1 is you; the rest default to AI deckhands.
  const [aiFlags, setAiFlags] = useState<boolean[]>(Array.from({ length: MAX }, (_, i) => i !== 0));
  const [wildOnes, setWildOnes] = useState(true);
  const [spotOn, setSpotOn] = useState(true);
  const [online, setOnline] = useState(false);

  const flags = aiFlags.slice(0, playerCount);
  const humanCount = flags.filter((f) => !f).length;
  const canStart = !online || humanCount > 0;

  const updateName = (i: number, value: string) =>
    setNames((cur) => cur.map((n, j) => (j === i ? value : n)));
  const toggleAI = (i: number) => setAiFlags((cur) => cur.map((f, j) => (j === i ? !f : f)));

  const startGame = () => {
    const playerNames = Array.from({ length: playerCount }, (_, i) => (names[i] ?? '').trim() || `Player ${i + 1}`);
    const opts: LiarsDiceOptions = {
      players: playerNames.map((name, i) => ({ name, isAI: flags[i] ?? false })),
      wildOnes,
      spotOn,
      startingDice: 5,
    };
    launchGame({
      module: liarsDiceModule,
      options: opts,
      playerNames,
      aiSeats: flags.flatMap((f, i) => (f ? [i] : [])),
      online,
    });
  };

  return (
    <DiceDefs>
      <div className={styles.root}>
        <header className={styles.header}>
          <button onClick={onBack} className={styles.back}>
            ← Back
          </button>
          <div className={styles.hero}>
            <Candle height={92} flameClassName={styles.flame} />
            <DiceCup size={70} className={styles.heroCup} />
            <div className={styles.heroDice} aria-hidden>
              <Die face={6} size={34} className={styles.heroDie} />
              <Die face={1} size={34} className={styles.heroDie} />
              <Die face={4} size={34} className={styles.heroDie} />
            </div>
          </div>
          <h1 className={styles.title}>Liar&apos;s Dice</h1>
          <p className={styles.tagline}>Five dice, one cup, and a table full of liars.</p>
        </header>

        <section className={styles.panel}>
          <h3 className={styles.h3}>Crew</h3>
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
          {humanCount > 1 && !online && (
            <p className={styles.note}>Pass-and-play: cups stay covered between turns.</p>
          )}
        </section>

        <section className={styles.panel}>
          <h3 className={styles.h3}>House rules</h3>
          <label className={styles.rule}>
            <input type="checkbox" checked={wildOnes} onChange={(e) => setWildOnes(e.target.checked)} />
            <span>
              <b>Ones are wild</b> — ones count toward every other face. Nobody may open on ones; switching to ones
              halves the count (rounded up), leaving them needs double plus one.
            </span>
          </label>
          <label className={styles.rule}>
            <input type="checkbox" checked={spotOn} onChange={(e) => setSpotOn(e.target.checked)} />
            <span>
              <b>Spot on</b> — instead of “liar”, claim the bid is exactly right. Right: the bidder loses a die.
              Wrong: you do.
            </span>
          </label>
        </section>

        <section className={styles.panel}>
          <h3 className={styles.h3}>How to play</h3>
          <ul className={styles.howto}>
            <li>Everyone shakes five dice under a cup and peeks at their own.</li>
            <li>
              Bid on the whole table: “six 4s” means at least six dice showing 4. Each bid must raise the count, or keep
              it and raise the face.
            </li>
            <li>Doubt it? Call “liar!” — cups come up. Wrong bid: the bidder loses a die. Right bid: the caller does.</li>
            <li>The loser starts the next round. Lose your last die and you walk the plank.</li>
          </ul>
        </section>

        <OnlineHostToggle online={online} onChange={setOnline} />

        <footer className={styles.footer}>
          {!canStart && <span className={styles.note}>Online games need at least one human seat.</span>}
          <button className={styles.startButton} onClick={startGame} disabled={!canStart}>
            {online ? 'Open the tavern →' : 'Shake the cups →'}
          </button>
        </footer>
      </div>
    </DiceDefs>
  );
}
