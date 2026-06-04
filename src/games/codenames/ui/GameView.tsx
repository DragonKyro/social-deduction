import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { CodenamesAction } from '../actions';
import type {
  CodenamesPublicCard,
  CodenamesPublicState,
  TeamColor,
} from '../state';
import styles from './GameView.module.css';

// ============================================================================
// Codenames game view.
//
// Hot-seat aware: spymasters and operatives must not see each other's
// information. Between turns the device shows a cover screen ("pass to X")
// and only reveals the active player's appropriate view.
// ============================================================================

export function CodenamesGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);

  if (!publicView) return null;
  const view = publicView.view as CodenamesPublicState;

  const dispatchAction = (a: CodenamesAction) => dispatch(a);

  return (
    <div className={styles.root}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h2 className={styles.title}>Codenames</h2>
          <p className={styles.subtitle}>
            {view.phase === 'gameOver' ? 'Game over' : `${labelForTeam(view.currentTeam)}'s turn`}
          </p>
        </div>
        <button onClick={exitGame}>Exit</button>
      </header>

      <ScoreBanner view={view} />

      <PhasePanel
        view={view}
        localSeat={localSeat}
        dispatch={dispatchAction}
        rotateSeat={(seat) => setLocalSeat(seat)}
      />

      {view.clueHistory.length > 0 && <ClueLog view={view} />}
    </div>
  );
}

function labelForTeam(t: TeamColor) {
  return t === 'red' ? 'Red' : 'Blue';
}

// ============================================================================
// Score banner
// ============================================================================

function ScoreBanner({ view }: { view: CodenamesPublicState }) {
  return (
    <div className={styles.scoreBanner}>
      <div className={styles.scoreRed}>
        <span className={styles.scoreBigNum}>{view.remaining.red}</span>
        <span>red left</span>
      </div>
      <div className={`${styles.turnPill} ${styles[view.currentTeam]}`}>
        {view.phase === 'gameOver' ? 'Final' : `${labelForTeam(view.currentTeam)} ${view.phase}`}
      </div>
      <div className={styles.scoreBlue}>
        <span>blue left</span>
        <span className={styles.scoreBigNum}>{view.remaining.blue}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Phase panel — picks the right active layout
// ============================================================================

function PhasePanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: CodenamesPublicState;
  localSeat: number | null;
  dispatch: (a: CodenamesAction) => void;
  rotateSeat: (seat: number) => void;
}) {
  if (view.phase === 'gameOver') return <GameOverPanel view={view} />;

  return (
    <HotSeatGate view={view} localSeat={localSeat} rotateSeat={rotateSeat}>
      <ActivePanel view={view} localSeat={localSeat} dispatch={dispatch} />
    </HotSeatGate>
  );
}

// HotSeatGate — figures out who should be looking at the device right now.
// During the clue phase that's the current team's spymaster; during the
// guessing phase it's anyone on the current team (they're discussing
// openly). If the local seat doesn't match, prompt to pass the device.
function HotSeatGate({
  view,
  localSeat,
  rotateSeat,
  children,
}: {
  view: CodenamesPublicState;
  localSeat: number | null;
  rotateSeat: (seat: number) => void;
  children: React.ReactNode;
}) {
  const [covered, setCovered] = useState(true);

  // Reset cover whenever the phase changes — track via a key on a hidden
  // span based on phase + clue index so this happens automatically.
  const turnKey = `${view.phase}:${view.clueHistory.length}:${view.currentTeam}`;
  const [lastKey, setLastKey] = useState(turnKey);
  if (lastKey !== turnKey) {
    setLastKey(turnKey);
    setCovered(true);
  }

  // Who should be looking?
  const currentTeam = view.currentTeam;
  const spymaster = view.seats.find((s) => s.team === currentTeam && s.role === 'spymaster');
  const operatives = view.seats.filter((s) => s.team === currentTeam && s.role === 'operative');

  let expected: { seats: number[]; description: string };
  if (view.phase === 'clue') {
    expected = {
      seats: spymaster ? [spymaster.index] : [],
      description: `${spymaster?.name ?? 'Spymaster'} (${labelForTeam(currentTeam)} spymaster) — give a clue`,
    };
  } else {
    // guessing: any operative on the current team can be holding the device.
    expected = {
      seats: operatives.map((s) => s.index),
      description: `${labelForTeam(currentTeam)} operatives — discuss and guess`,
    };
  }

  const localIsExpected = localSeat !== null && expected.seats.includes(localSeat);

  if (!localIsExpected || covered) {
    return (
      <div className={styles.coverScreen}>
        <div className={styles.coverInner}>
          <h2>Pass the device</h2>
          <p style={{ color: '#cbd5e1' }}>{expected.description}.</p>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            {view.phase === 'clue'
              ? 'Operatives should look away while the spymaster sees the key.'
              : 'The spymaster must stay silent — operatives only.'}
          </p>
          {expected.seats.length === 1 ? (
            <button
              className={styles.primary}
              onClick={() => {
                if (!localIsExpected) rotateSeat(expected.seats[0]!);
                setCovered(false);
              }}
            >
              I am {view.seats[expected.seats[0]!]?.name ?? 'them'} — show
            </button>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {expected.seats.map((sIdx) => (
                <button
                  key={sIdx}
                  className={styles.primary}
                  onClick={() => {
                    rotateSeat(sIdx);
                    setCovered(false);
                  }}
                >
                  I am {view.seats[sIdx]?.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function ActivePanel({
  view,
  localSeat,
  dispatch,
}: {
  view: CodenamesPublicState;
  localSeat: number | null;
  dispatch: (a: CodenamesAction) => void;
}) {
  if (view.phase === 'clue') {
    return <CluePanel view={view} localSeat={localSeat} dispatch={dispatch} />;
  }
  return <GuessingPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
}

// ============================================================================
// Clue phase — spymaster types a single word + a number
// ============================================================================

function CluePanel({
  view,
  localSeat,
  dispatch,
}: {
  view: CodenamesPublicState;
  localSeat: number | null;
  dispatch: (a: CodenamesAction) => void;
}) {
  const [word, setWord] = useState('');
  const [number, setNumber] = useState<string>('1');
  const parsedNumber = Number.parseInt(number, 10);
  const numberValid = Number.isInteger(parsedNumber) && parsedNumber >= 0 && parsedNumber <= 9;
  const trimmed = word.trim();
  const isSingleWord = trimmed.length > 0 && !/\s/.test(trimmed);
  const upper = trimmed.toUpperCase();
  const collidesWithBoard = view.cards.some((c) => c.word.toUpperCase() === upper);
  const canSubmit = isSingleWord && numberValid && !collidesWithBoard;

  return (
    <div className={`${styles.panel} ${styles.cluePanel}`}>
      <div>
        <p className={styles.subtitle} style={{ marginBottom: 8 }}>
          {labelForTeam(view.currentTeam)} spymaster — enter a one-word clue and how many
          board words it covers. Use <b>0</b> for an unlimited clue.
        </p>
        <div className={styles.clueInputRow}>
          <input
            className={styles.clueInput}
            placeholder="One-word clue"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            maxLength={20}
            autoFocus
          />
          <input
            className={styles.numberInput}
            type="number"
            min={0}
            max={9}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <button
            className={styles.primary}
            disabled={!canSubmit || localSeat === null}
            onClick={() => {
              if (localSeat === null) return;
              dispatch({
                type: 'giveClue',
                bySeat: localSeat,
                word: upper,
                number: parsedNumber,
              });
              setWord('');
              setNumber('1');
            }}
          >
            Give clue
          </button>
        </div>
        {collidesWithBoard && (
          <p style={{ color: '#f59e0b', fontSize: 12, marginTop: 6 }}>
            Clue must not match a word on the board.
          </p>
        )}
      </div>

      <BoardGrid view={view} canClick={false} />
    </div>
  );
}

// ============================================================================
// Guessing phase — operatives tap cards / end turn
// ============================================================================

function GuessingPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: CodenamesPublicState;
  localSeat: number | null;
  dispatch: (a: CodenamesAction) => void;
}) {
  if (!view.currentClue) return null;
  const clue = view.currentClue;
  const cap = clue.number === 0 ? Infinity : clue.number + 1;
  const guessesLeft = cap === Infinity ? '∞' : cap - view.guessesThisClue;
  const isBonusGuess = clue.number !== 0 && view.guessesThisClue === clue.number;
  const localOnTeam =
    localSeat !== null &&
    view.seats[localSeat]?.team === view.currentTeam &&
    view.seats[localSeat]?.role === 'operative';

  const onCardClick = (cardIndex: number) => {
    if (!localOnTeam) return;
    const card = view.cards[cardIndex];
    if (!card || card.revealed) return;
    dispatch({ type: 'guessCard', bySeat: localSeat!, cardIndex });
  };

  return (
    <div className={`${styles.panel} ${styles.cluePanel}`}>
      <div className={styles.guessStatusBar}>
        <span>Clue:</span>
        <span className={styles.clueChip}>
          {clue.word} · {clue.number === 0 ? '∞' : clue.number}
        </span>
        <span>
          Guesses: {view.guessesThisClue} / {cap === Infinity ? '∞' : cap}
        </span>
        {isBonusGuess && (
          <span style={{ color: '#fbbf24' }}>
            (this is your bonus guess — one extra above the clue number)
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <button
            className={styles.dangerBtn}
            disabled={!localOnTeam || view.guessesThisClue < 1}
            onClick={() => dispatch({ type: 'endGuessing', bySeat: localSeat! })}
            title={
              view.guessesThisClue < 1 ? 'You must make at least one guess first.' : 'End turn'
            }
          >
            End turn{view.guessesThisClue < 1 ? ' (min 1 guess)' : ''}
          </button>
        </span>
      </div>

      <BoardGrid view={view} canClick={localOnTeam} onCardClick={onCardClick} />
      <p className={styles.subtitle} style={{ marginTop: 4 }}>
        {localOnTeam
          ? `${guessesLeft === '∞' ? 'Unlimited' : guessesLeft} guess${guessesLeft === 1 ? '' : 'es'} remaining. Tap a word to guess it.`
          : 'Waiting for the active team to guess.'}
      </p>
    </div>
  );
}

// ============================================================================
// The 5×5 grid
// ============================================================================

function BoardGrid({
  view,
  canClick,
  onCardClick,
}: {
  view: CodenamesPublicState;
  canClick: boolean;
  onCardClick?: (cardIndex: number) => void;
}) {
  return (
    <div className={styles.grid}>
      {view.cards.map((c) => (
        <CardTile
          key={c.index}
          card={c}
          canClick={canClick && !c.revealed}
          onClick={() => onCardClick?.(c.index)}
        />
      ))}
    </div>
  );
}

function CardTile({
  card,
  canClick,
  onClick,
}: {
  card: CodenamesPublicCard;
  canClick: boolean;
  onClick?: () => void;
}) {
  const kindClass = card.kind
    ? {
        red: styles.kindRed,
        blue: styles.kindBlue,
        bystander: styles.kindBystander,
        assassin: styles.kindAssassin,
      }[card.kind]
    : '';
  const cls = [
    styles.card,
    card.revealed && styles.revealed,
    canClick && styles.cardClickable,
    kindClass,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} onClick={canClick ? onClick : undefined}>
      <span className={styles.cardWord}>{card.word}</span>
    </div>
  );
}

// ============================================================================
// Clue log + game over
// ============================================================================

function ClueLog({ view }: { view: CodenamesPublicState }) {
  // Newest first.
  const rows = view.clueHistory.slice().reverse();
  return (
    <div className={styles.panel}>
      <p className={styles.subtitle} style={{ marginBottom: 6 }}>
        Clue history
      </p>
      <div className={styles.clueLog}>
        {rows.map((c, i) => (
          <div key={i} className={`${styles.clueLogRow} ${styles[c.byTeam]}`}>
            <span style={{ fontWeight: 700 }}>
              {c.word} · {c.number === 0 ? '∞' : c.number}
            </span>
            <span style={{ color: '#94a3b8' }}>
              {labelForTeam(c.byTeam)} spymaster · {c.correctGuesses} correct
              {c.closedReason ? ` · ended (${prettyReason(c.closedReason)})` : ' · active'}
            </span>
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}

function prettyReason(r: NonNullable<CodenamesPublicState['clueHistory'][number]['closedReason']>) {
  switch (r) {
    case 'endedVoluntarily':
      return 'team stopped';
    case 'hitWrong':
      return 'missed';
    case 'hitAssassin':
      return 'assassin';
    case 'capReached':
      return 'cap';
  }
}

function GameOverPanel({ view }: { view: CodenamesPublicState }) {
  const winner = view.winnerTeam ?? 'red';
  const reason =
    view.loserTeam
      ? `${labelForTeam(view.loserTeam)} hit the assassin.`
      : `${labelForTeam(winner)} found all their agents.`;
  return (
    <div className={styles.panel}>
      <div className={`${styles.gameOverBanner} ${styles[winner]}`}>
        {labelForTeam(winner)} wins
      </div>
      <p style={{ textAlign: 'center', marginTop: 12, color: '#cbd5e1' }}>{reason}</p>
      <BoardGrid view={view} canClick={false} />
    </div>
  );
}

export { CodenamesGameView as default };
