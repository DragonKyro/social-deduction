import { launchGame } from '@/ui/shared/launch';
import { OnlineHostToggle } from '@/ui/shared/OnlineHostToggle';
import { useState, type CSSProperties } from 'react';
import { secretHitlerModule } from '../module';
import { alignmentCounts, fascistTrack } from '../tracks';
import type { ShOptions } from '../module';
import { DoveGlyph, PALETTE, Portrait, PowerIcon, RoleFace, SerpentGlyph, powerName } from './art';
import styles from './SecretHitlerSetup.module.css';

// Local-host setup screen for Secret Hitler, styled as the opening page of a
// case file. The host picks the table size (5-10), edits names + AI flags,
// and starts the game. Roles are dealt automatically.

interface Props {
  onBack: () => void;
}

export function SecretHitlerSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(5);
  const [names, setNames] = useState<string[]>([
    'Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5',
    'AI 6', 'AI 7', 'AI 8', 'AI 9', 'AI 10',
  ]);
  const [aiFlags, setAiFlags] = useState<boolean[]>(() => [
    false, false, false, false, false, true, true, true, true, true,
  ]);
  const [rebalanced6p, setRebalanced6p] = useState(false);
  const [online, setOnline] = useState(false);

  const counts = alignmentCounts(playerCount);
  const track = fascistTrack(playerCount);
  const aiCount = Array.from({ length: playerCount }, (_, i) => aiFlags[i] ?? false).filter(Boolean).length;

  const startGame = () => {
    const playerNames = Array.from({ length: playerCount }, (_, i) =>
      (names[i] ?? `Player ${i + 1}`).trim() || `Player ${i + 1}`,
    );
    const flags = Array.from({ length: playerCount }, (_, i) => aiFlags[i] ?? false);
    const opts: ShOptions = {
      players: playerNames.map((name, i) => ({ name, isAI: flags[i]! })),
      rebalanced6p: playerCount === 6 && rebalanced6p,
    };
    launchGame({
      module: secretHitlerModule,
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
          <span className={styles.kicker}>Case file · new session</span>
          <h1 className={styles.title}>Secret Hitler</h1>
        </div>
      </header>

      <section className={styles.sheet} aria-labelledby="sh-roster">
        <h2 id="sh-roster" className={styles.h2}>
          The assembly
        </h2>
        <div className={styles.countControls} role="radiogroup" aria-label="Number of players">
          {[5, 6, 7, 8, 9, 10].map((n) => (
            <button
              type="button"
              role="radio"
              aria-checked={n === playerCount}
              key={n}
              className={`${styles.countTab} ${n === playerCount ? styles.countActive : ''}`}
              onClick={() => setPlayerCount(n)}
            >
              {n}
            </button>
          ))}
          <span className={styles.countNote}>
            {counts.liberals} Liberals · {counts.fascists - 1} Fascist{counts.fascists - 1 === 1 ? '' : 's'} · 1 Hitler
            {aiCount > 0 && ` · ${aiCount} AI`}
          </span>
        </div>

        <div className={styles.roleStrip} aria-hidden="true">
          <span className={styles.roleCard}>
            <RoleFace role="liberal" />
          </span>
          <span className={styles.roleCard}>
            <RoleFace role="fascist" />
          </span>
          <span className={styles.roleCard}>
            <RoleFace role="hitler" />
          </span>
          <p className={styles.roleStripText}>
            {playerCount <= 6
              ? 'At this size the Fascist and Hitler know each other.'
              : 'At this size the Fascists know Hitler, but Hitler does not know them.'}
          </p>
        </div>

        <div className={styles.nameGrid}>
          {Array.from({ length: playerCount }, (_, i) => (
            <div key={i} className={styles.nameRow} style={{ '--i': i } as CSSProperties}>
              <span className={styles.seatPhoto}>
                <Portrait seat={i} />
              </span>
              <label className={styles.nameLabel}>
                <span className={styles.seatNumber}>No. {i + 1}</span>
                <input
                  className={styles.nameInput}
                  value={names[i] ?? `Player ${i + 1}`}
                  onChange={(e) =>
                    setNames((cur) => {
                      const next = cur.slice();
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  maxLength={20}
                  aria-label={`Name for seat ${i + 1}`}
                />
              </label>
              <label className={styles.aiToggle}>
                <input
                  type="checkbox"
                  checked={aiFlags[i] ?? false}
                  onChange={(e) =>
                    setAiFlags((cur) => {
                      const next = cur.slice();
                      next[i] = e.target.checked;
                      return next;
                    })
                  }
                />
                <span className={styles.aiSwitch} aria-hidden="true" />
                <span>AI</span>
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.sheet} aria-labelledby="sh-board">
        <h2 id="sh-board" className={styles.h2}>
          Fascist board for {playerCount} players
        </h2>
        <p className={styles.subtitle}>
          Each Fascist policy fills a slot; some slots hand the President an executive power.
        </p>
        <div className={styles.trackPreview}>
          {track.map((p, i) => (
            <div key={i} className={styles.trackTile} title={p ? powerName(p) : undefined}>
              <span className={styles.trackSlot}>{i + 1}</span>
              {p ? <PowerIcon power={p} size={20} /> : <span className={styles.trackBlank} />}
              <span className={styles.trackPower}>{p ? powerName(p) : '—'}</span>
              {i === 4 && <span className={styles.trackVeto}>+ veto</span>}
            </div>
          ))}
          <div className={`${styles.trackTile} ${styles.trackTileWin}`}>
            <span className={styles.trackSlot}>6</span>
            <PowerIcon power="win" size={20} />
            <span className={styles.trackPower}>Fascists win</span>
          </div>
        </div>
        <ul className={styles.rules}>
          <li>
            <svg viewBox="0 0 100 100" className={styles.ruleIcon} aria-hidden="true">
              <SerpentGlyph color={PALETTE.fas} accent={PALETTE.cream} crowned />
            </svg>
            Hitler elected Chancellor after 3 Fascist policies — Fascists win.
          </li>
          <li>
            <svg viewBox="0 0 100 100" className={styles.ruleIcon} aria-hidden="true">
              <DoveGlyph color={PALETTE.lib} accent="#5e7d3a" />
            </svg>
            Five Liberal policies, or Hitler executed — Liberals win.
          </li>
        </ul>
        {playerCount === 6 && (
          <label className={styles.variant}>
            <input
              type="checkbox"
              checked={rebalanced6p}
              onChange={(e) => setRebalanced6p(e.target.checked)}
            />
            <span>
              <b>Rebalanced 6-player game.</b> Start with one Fascist policy already on the board
              (taken from the deck) to offset the Liberals’ edge at this size.
            </span>
          </label>
        )}
      </section>

      <OnlineHostToggle online={online} onChange={setOnline} />

      <footer className={styles.footer}>
        <button type="button" className={styles.startButton} onClick={startGame}>
          {online ? 'Open the lobby →' : 'Convene the assembly →'}
        </button>
      </footer>
    </div>
  );
}
