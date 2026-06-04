import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { CrossCluesAction } from '../actions';
import type {
  Coord,
  CrossCluesPlayerRole,
  CrossCluesPublicCell,
  CrossCluesPublicState,
} from '../state';
import styles from './GameView.module.css';

const ROW_LABELS = ['A', 'B', 'C', 'D', 'E'];
const COL_LABELS = ['1', '2', '3', '4', '5'];

export function CrossCluesGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);

  if (!publicView) return null;
  const view = publicView.view as CrossCluesPublicState;
  const dispatchAction = (a: CrossCluesAction) => dispatch(a);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Cross Clues</h2>
          <p className={styles.subtitle}>
            Round {Math.min(view.roundNumber, 25)} of 25 · packs:{' '}
            {view.packs.length > 0 ? view.packs.join(', ') : 'classic'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <RoleBadge role={view.yourRole} phase={view.phase} />
          <button onClick={exitGame} className={styles.secondaryButton}>
            Exit
          </button>
        </div>
      </header>

      <div className={styles.scoreBar}>
        <div>
          <div className={styles.scoreLabel}>Score</div>
          <div className={styles.scoreNum}>
            {view.score}
            <span style={{ color: '#475569', fontSize: 18, fontWeight: 500 }}>
              {' '}
              / 25
            </span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div className={styles.scoreLabel}>Cards left</div>
          <div className={styles.scoreNum}>{view.remainingCount}</div>
        </div>
      </div>

      <Grid view={view} localSeat={localSeat} dispatch={dispatchAction} />

      <PhasePanel view={view} localSeat={localSeat} dispatch={dispatchAction} />

      <SeatStrip
        view={view}
        localSeat={localSeat}
        onPickSeat={(s) => setLocalSeat(s)}
      />
    </div>
  );
}

// ============================================================================
// Role badge
// ============================================================================

function RoleBadge({
  role,
  phase,
}: {
  role: CrossCluesPlayerRole;
  phase: CrossCluesPublicState['phase'];
}) {
  if (phase === 'setup' || phase === 'gameOver') return null;
  const text = role === 'clueGiver' ? 'Clue giver' : role === 'guesser' ? 'Guesser' : 'Watching';
  return <span className={`${styles.roleBadge} ${styles[role]}`}>{text}</span>;
}

// ============================================================================
// Grid — 80px row-header column + 5 grid columns
// ============================================================================

function Grid({
  view,
  localSeat,
  dispatch,
}: {
  view: CrossCluesPublicState;
  localSeat: number | null;
  dispatch: (a: CrossCluesAction) => void;
}) {
  const heldCoord = view.yourCoord; // populated only for the active clue-giver
  const guesserCanPick = view.phase === 'guessing' && localSeat === view.currentGuesser;

  const onCellClick = (coord: Coord) => {
    if (!guesserCanPick) return;
    const cell = view.grid[coord.row]![coord.col]!;
    if (cell.resolved) return;
    const ok = window.confirm(
      `Submit guess: row ${ROW_LABELS[coord.row]} (${view.rowWords[coord.row]}), col ${COL_LABELS[coord.col]} (${view.colWords[coord.col]})?`,
    );
    if (!ok) return;
    dispatch({ type: 'submitGuess', bySeat: view.currentGuesser!, coord });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.gridWrap}>
        <div className={styles.cornerCell} />
        {COL_LABELS.map((label, c) => {
          const isActive = heldCoord !== null && heldCoord.col === c;
          return (
            <div
              key={`col-${c}`}
              className={`${styles.headerCell} ${isActive ? styles.activeCol : ''}`}
            >
              <span className={styles.headerLabel}>{label}</span>
              <span className={styles.headerWord}>{view.colWords[c]}</span>
            </div>
          );
        })}
        {ROW_LABELS.map((label, r) => (
          <Row
            key={`row-${r}`}
            r={r}
            label={label}
            view={view}
            heldCoord={heldCoord}
            guesserCanPick={guesserCanPick}
            onCellClick={onCellClick}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  r,
  label,
  view,
  heldCoord,
  guesserCanPick,
  onCellClick,
}: {
  r: number;
  label: string;
  view: CrossCluesPublicState;
  heldCoord: Coord | null;
  guesserCanPick: boolean;
  onCellClick: (c: Coord) => void;
}) {
  const isActiveRow = heldCoord !== null && heldCoord.row === r;
  return (
    <>
      <div className={`${styles.headerCell} ${isActiveRow ? styles.activeRow : ''}`}>
        <span className={styles.headerLabel}>{label}</span>
        <span className={styles.headerWord}>{view.rowWords[r]}</span>
      </div>
      {view.grid[r]!.map((cell, c) => (
        <Cell
          key={`${r}-${c}`}
          cell={cell}
          isHeld={heldCoord !== null && heldCoord.row === r && heldCoord.col === c}
          clickable={guesserCanPick && !cell.resolved}
          onClick={() => onCellClick({ row: r, col: c })}
        />
      ))}
    </>
  );
}

function Cell({
  cell,
  isHeld,
  clickable,
  onClick,
}: {
  cell: CrossCluesPublicCell;
  isHeld: boolean;
  clickable: boolean;
  onClick: () => void;
}) {
  const className = [
    styles.cell,
    cell.token === 'green' ? styles.green : '',
    cell.token === 'red' ? styles.red : '',
    isHeld ? styles.heldCoord : '',
    clickable ? styles.clickable : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} onClick={clickable ? onClick : undefined}>
      {cell.resolved ? (
        <span className={styles.cellClue}>{cell.clueWord ?? '—'}</span>
      ) : (
        <span className={styles.cellEmptyHint}>·</span>
      )}
    </div>
  );
}

// ============================================================================
// Phase panel — switches on phase and renders the active controls
// ============================================================================

function PhasePanel({
  view,
  localSeat,
  dispatch,
}: {
  view: CrossCluesPublicState;
  localSeat: number | null;
  dispatch: (a: CrossCluesAction) => void;
}) {
  switch (view.phase) {
    case 'setup':
      return <SetupPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
    case 'clueGiving':
      return <ClueGivingPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
    case 'guessing':
      return <GuessingPanel view={view} localSeat={localSeat} />;
    case 'revealRound':
      return <RevealPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
    case 'gameOver':
      return <GameOverPanel view={view} />;
  }
}

function SetupPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: CrossCluesPublicState;
  localSeat: number | null;
  dispatch: (a: CrossCluesAction) => void;
}) {
  const acked = localSeat !== null && view.seats[localSeat]?.hasAckedSetup;
  return (
    <div className={`${styles.panel} ${styles.actionPanel}`}>
      <h3 style={{ margin: 0 }}>Memorize the grid</h3>
      <p style={{ color: '#94a3b8', margin: 0 }}>
        Take a moment to read the row and column words. Once everyone is ready, play begins.
      </p>
      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          disabled={localSeat === null || !!acked}
          onClick={() =>
            dispatch({ type: 'ackSetup', bySeat: localSeat! })
          }
        >
          {acked ? 'Waiting for others…' : "I'm ready"}
        </button>
        <span style={{ color: '#94a3b8', fontSize: 13 }}>
          Acked: {view.seats.filter((s) => s.hasAckedSetup).length} / {view.seats.length}
        </span>
      </div>
    </div>
  );
}

function ClueGivingPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: CrossCluesPublicState;
  localSeat: number | null;
  dispatch: (a: CrossCluesAction) => void;
}) {
  const isClueGiver = localSeat === view.currentClueGiver;
  const giverName =
    view.currentClueGiver !== null ? view.seats[view.currentClueGiver]?.name : '?';

  if (!isClueGiver) {
    return (
      <div className={`${styles.panel} ${styles.actionPanel}`}>
        <p style={{ margin: 0, color: '#cbd5e1' }}>
          Waiting for <b>{giverName}</b> to write a clue…
        </p>
      </div>
    );
  }

  const coord = view.yourCoord!;
  return (
    <div className={`${styles.panel} ${styles.actionPanel}`}>
      <div className={styles.coordCard}>
        <div>
          <div className={styles.scoreLabel}>Your coord</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span className={styles.coordWord}>
              {ROW_LABELS[coord.row]} · {view.rowWords[coord.row]}
            </span>
            <span className={styles.coordPlus}>×</span>
            <span className={styles.coordWord}>
              {COL_LABELS[coord.col]} · {view.colWords[coord.col]}
            </span>
          </div>
        </div>
      </div>
      <ClueInput
        onSubmit={(clue) =>
          dispatch({ type: 'submitClue', bySeat: localSeat!, clue })
        }
      />
      <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
        Write a single word that connects both terms. The cell is highlighted on the grid so you can keep it in mind.
      </p>
    </div>
  );
}

function ClueInput({ onSubmit }: { onSubmit: (clue: string) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && !/\s/.test(trimmed) && trimmed.length <= 32;

  const submit = () => {
    if (!canSubmit) return;
    try {
      onSubmit(trimmed);
      setText('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <div className={styles.actionRow}>
        <input
          className={styles.clueInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="one word (no spaces)"
          maxLength={32}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button
          className={styles.primaryButton}
          onClick={submit}
          disabled={!canSubmit}
        >
          Submit clue →
        </button>
      </div>
      {error && <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>}
    </>
  );
}

function GuessingPanel({
  view,
  localSeat,
}: {
  view: CrossCluesPublicState;
  localSeat: number | null;
}) {
  const isGuesser = localSeat === view.currentGuesser;
  const guesserName =
    view.currentGuesser !== null ? view.seats[view.currentGuesser]?.name : '?';
  const giverName =
    view.currentClueGiver !== null ? view.seats[view.currentClueGiver]?.name : '?';
  return (
    <div className={`${styles.panel} ${styles.actionPanel}`}>
      <div className={styles.clueBanner}>
        <div>
          <div className={styles.clueBannerLabel}>{giverName}&apos;s clue</div>
          <div className={styles.clueBannerWord}>{view.currentClue}</div>
        </div>
      </div>
      <p style={{ margin: 0, color: '#cbd5e1', fontSize: 14 }}>
        {isGuesser
          ? 'Pick a cell on the grid. Right-click is disabled — confirm in the dialog.'
          : `Discuss with the team. ${guesserName} will tap a cell to submit the team's guess.`}
      </p>
    </div>
  );
}

function RevealPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: CrossCluesPublicState;
  localSeat: number | null;
  dispatch: (a: CrossCluesAction) => void;
}) {
  const r = view.lastRound;
  if (!r) return null;
  const giverName = view.seats[r.clueGiverSeat]?.name ?? '?';
  const acked = localSeat !== null && view.seats[localSeat]?.hasAckedReveal;
  const acksTotal = view.seats.filter((s) => s.hasAckedReveal).length;
  return (
    <div className={`${styles.panel} ${styles.actionPanel}`}>
      <h3 style={{ margin: 0 }}>
        {r.correct ? '✓ Correct!' : '✗ Missed.'}
      </h3>
      <p style={{ margin: 0, color: '#cbd5e1' }}>
        <b>{giverName}</b> held{' '}
        <b>
          {ROW_LABELS[r.trueCoord.row]} · {view.rowWords[r.trueCoord.row]}{' '}
        </b>
        and{' '}
        <b>
          {COL_LABELS[r.trueCoord.col]} · {view.colWords[r.trueCoord.col]}
        </b>
        . Clue: <b>{r.clueWord}</b>.
      </p>
      {!r.correct && (
        <p style={{ margin: 0, color: '#fca5a5', fontSize: 13 }}>
          Team guessed {ROW_LABELS[r.guessCoord.row]}
          {COL_LABELS[r.guessCoord.col]} ({view.rowWords[r.guessCoord.row]} /{' '}
          {view.colWords[r.guessCoord.col]}). The correct cell got a red token.
        </p>
      )}
      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          disabled={localSeat === null || !!acked}
          onClick={() =>
            dispatch({ type: 'ackReveal', bySeat: localSeat! })
          }
        >
          {acked ? 'Waiting for others…' : 'Continue'}
        </button>
        <span style={{ color: '#94a3b8', fontSize: 13 }}>
          Acked: {acksTotal} / {view.seats.length}
        </span>
      </div>
    </div>
  );
}

function GameOverPanel({ view }: { view: CrossCluesPublicState }) {
  const rating = view.scoreRating ?? 'rookie';
  const headline =
    rating === 'perfect'
      ? 'Perfect game!'
      : rating === 'legendary'
        ? 'Legendary'
        : rating === 'great'
          ? 'Great'
          : 'Keep practicing';
  return (
    <div className={styles.gameOverPanel}>
      <div className={styles.scoreLabel}>Final score</div>
      <div className={styles.gameOverScore}>{view.score} / 25</div>
      <div className={`${styles.gameOverRating} ${styles[rating]}`}>{headline}</div>
    </div>
  );
}

// ============================================================================
// Seat strip — shows everyone; in hot-seat mode lets the host swap whose
// device-eyes are looking.
// ============================================================================

function SeatStrip({
  view,
  localSeat,
  onPickSeat,
}: {
  view: CrossCluesPublicState;
  localSeat: number | null;
  onPickSeat: (seat: number) => void;
}) {
  return (
    <div className={`${styles.panel} ${styles.seatStrip}`}>
      {view.seats.map((s) => {
        const isActive = s.index === view.currentClueGiver || s.index === view.currentGuesser;
        const isLocal = s.index === localSeat;
        return (
          <div
            key={s.index}
            className={`${styles.seatChip} ${isActive ? styles.active : ''} ${
              isLocal ? styles.localActive : ''
            }`}
          >
            <span>{s.name}</span>
            {s.index === view.currentClueGiver && (
              <span style={{ color: '#c4b5fd', fontSize: 11 }}>Clue</span>
            )}
            {s.index === view.currentGuesser && (
              <span style={{ color: '#fef3c7', fontSize: 11 }}>Guess</span>
            )}
            {view.phase === 'setup' && s.hasAckedSetup && (
              <span className={styles.ackPill}>✓</span>
            )}
            {view.phase === 'revealRound' && s.hasAckedReveal && (
              <span className={styles.ackPill}>✓</span>
            )}
            {!isLocal && (
              <button onClick={() => onPickSeat(s.index)} title="Look from this seat">
                pass
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
