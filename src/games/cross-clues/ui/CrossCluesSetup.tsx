import { launchGame } from '@/ui/shared/launch';
import { OnlineHostToggle } from '@/ui/shared/OnlineHostToggle';
import { useMemo, useState, type CSSProperties } from 'react';
import { crossCluesModule } from '../module';
import type { CrossCluesOptions } from '../module';
import { WORD_PACK_LIST, buildPoolFromPacks, DEFAULT_WORD_PACK_ID, type WordPackId } from '@/words';
import styles from './CrossCluesSetup.module.css';

// Local-host setup for Cross Clues: player count (2–6), per-seat names and
// AI flags, and one or more word packs (shared with Codenames).

interface Props {
  onBack: () => void;
}

const COUNT_OPTIONS = [2, 3, 4, 5, 6];
// Cross Clues deals 10 words per match.
const MIN_POOL = 10;
const DEFAULT_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6'];

export function CrossCluesSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [aiFlags, setAiFlags] = useState<boolean[]>([false, false, false, false, false, false]);
  const [selectedPacks, setSelectedPacks] = useState<WordPackId[]>([DEFAULT_WORD_PACK_ID]);
  const [online, setOnline] = useState(false);

  const pool = useMemo(() => buildPoolFromPacks(selectedPacks), [selectedPacks]);
  const poolTooSmall = pool.length < MIN_POOL;
  const hasAdultsOnly = selectedPacks.some((id) => WORD_PACK_LIST.find((p) => p.id === id)?.adultsOnly);
  const flags = Array.from({ length: playerCount }, (_, i) => aiFlags[i] ?? false);
  const aiCount = flags.filter(Boolean).length;

  const setName = (i: number, value: string) => setNames((cur) => cur.map((n, j) => (j === i ? value : n)));
  const toggleAI = (i: number) => setAiFlags((cur) => cur.map((f, j) => (j === i ? !f : f)));
  const togglePack = (id: WordPackId) =>
    setSelectedPacks((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const startGame = () => {
    const playerNames = Array.from(
      { length: playerCount },
      (_, i) => (names[i] ?? `Player ${i + 1}`).trim() || `Player ${i + 1}`,
    );
    const opts: CrossCluesOptions = {
      players: playerNames.map((name, i) => ({ name, isAI: flags[i]! })),
      packs: selectedPacks.length > 0 ? selectedPacks : [DEFAULT_WORD_PACK_ID],
    };
    launchGame({
      module: crossCluesModule,
      options: opts,
      playerNames,
      aiSeats: flags.flatMap((f, i) => (f ? [i] : [])),
      online,
    });
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          ← Back
        </button>
        <div>
          <h1 className={styles.title}>Cross Clues</h1>
          <p className={styles.tagline}>A cooperative word game · one notebook, one team</p>
        </div>
      </header>

      <section className={styles.page} aria-labelledby="cc-players">
        <span className={styles.tape} aria-hidden />
        <h3 id="cc-players" className={styles.h3}>
          Who&apos;s playing?
        </h3>
        <p className={styles.subtitle}>
          2–6 players (best with 3–6). Each round one player privately draws a coordinate and gives a one-word clue;
          the next player enters the team&apos;s guess. Mark seats as AI to fill the table.
        </p>
        <div className={styles.countControls} role="radiogroup" aria-label="Number of players">
          {COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === playerCount}
              className={`${styles.countBtn} ${n === playerCount ? styles.countActive : ''}`}
              onClick={() => setPlayerCount(n)}
            >
              {n}
            </button>
          ))}
          {aiCount > 0 && <span className={styles.aiSummary}>{aiCount} AI</span>}
        </div>
        <div className={styles.nameGrid}>
          {Array.from({ length: playerCount }, (_, i) => (
            <div className={styles.nameRow} key={i} style={{ rotate: `${((i * 37) % 5) - 2}deg` }}>
              <span className={styles.seatNumber}>{i + 1}</span>
              <input
                className={styles.nameInput}
                value={names[i] ?? ''}
                onChange={(e) => setName(i, e.target.value)}
                maxLength={20}
                aria-label={`Seat ${i + 1} name`}
              />
              <button
                type="button"
                className={`${styles.aiToggle} ${flags[i] ? styles.aiOn : ''}`}
                onClick={() => toggleAI(i)}
                aria-pressed={flags[i]}
                aria-label={`Seat ${i + 1}: ${flags[i] ? 'AI' : 'human'}. Toggle AI`}
              >
                AI
              </button>
            </div>
          ))}
        </div>
        {aiCount === playerCount && (
          <p className={styles.note}>Every seat is an AI — you&apos;ll watch the game as a spectator.</p>
        )}
        {online && aiCount > 0 && (
          <p className={styles.note}>AI seats run on your device as host; they pause if you leave.</p>
        )}
      </section>

      <section className={styles.page} aria-labelledby="cc-packs">
        <span className={styles.tape} aria-hidden />
        <h3 id="cc-packs" className={styles.h3}>
          Word packs
        </h3>
        <p className={styles.subtitle}>Same pack list as Codenames — pick any mix. Words are deduped across packs.</p>
        <div className={styles.packGrid}>
          {WORD_PACK_LIST.map((pack, i) => {
            const on = selectedPacks.includes(pack.id);
            return (
              <button
                key={pack.id}
                type="button"
                className={`${styles.packCard} ${on ? styles.active : ''}`}
                style={{ '--note': ['#ffe680', '#ffb3c4', '#a9ecc4', '#a8d8ff', '#ffcf8a'][i % 5] } as CSSProperties}
                onClick={() => togglePack(pack.id)}
                aria-pressed={on}
              >
                <span className={styles.packName}>
                  <span aria-hidden>{pack.emoji}</span> {pack.name}
                  {pack.adultsOnly && <span className={styles.packAdult}>18+</span>}
                </span>
                <span className={styles.packDescription}>{pack.blurb}</span>
                <span className={styles.packCount}>
                  {pack.words.length} words{on ? ' · ✓ in' : ''}
                </span>
              </button>
            );
          })}
        </div>
        <div className={styles.poolLine}>
          Pool: <b>{pool.length}</b> unique words
        </div>
        {poolTooSmall && (
          <div className={styles.warning} role="alert">
            Need at least {MIN_POOL} words — pick at least one pack.
          </div>
        )}
        {hasAdultsOnly && !poolTooSmall && (
          <p className={styles.note}>Includes a Spicy (18+) pack — make sure your table is on board.</p>
        )}
      </section>

      <section className={styles.page} aria-labelledby="cc-how">
        <span className={styles.tape} aria-hidden />
        <h3 id="cc-how" className={styles.h3}>
          How to play
        </h3>
        <ul className={styles.rules}>
          <li>Ten words label a 5×5 grid: rows A–E and columns 1–5. Every square is a pair of words.</li>
          <li>
            The clue-giver secretly draws a coordinate card (e.g. C3) and writes a <b>one-word clue</b> linking its row
            and column words — no grid words allowed.
          </li>
          <li>
            Everyone discusses; the designated guesser enters <b>one</b> guess. Right: the note sticks. Wrong: the card is
            discarded and its square is crossed out.
          </li>
          <li>Play all 25 cards. 16+ is great, 21+ legendary, 25 perfect.</li>
        </ul>
      </section>

      <OnlineHostToggle online={online} onChange={setOnline} />

      <footer className={styles.footer}>
        <button type="button" className={styles.startButton} disabled={poolTooSmall} onClick={startGame}>
          {online ? 'Open lobby →' : 'Start game →'}
        </button>
      </footer>
    </div>
  );
}
