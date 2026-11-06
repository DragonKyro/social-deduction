import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useGameStore, useSeatSwitching } from '@/store/gameStore';
import { FlipCard } from '@/ui/shared/FlipCard';
import type { CrossCluesAction } from '../actions';
import { clueProblem, COL_LABELS, coordLabel, MAX_CLUE_LENGTH, ROW_LABELS } from '../rules';
import type { Coord, CrossCluesPublicCell, CrossCluesPublicState, RoundRecord } from '../state';
import styles from './GameView.module.css';

// ============================================================================
// Cross Clues game view — a shared graph-paper notebook with sticky notes.
//
// Hidden-info rules for this file:
//  - The held coordinate only exists in the clue-giver's own view
//    (`yourCoord`); the UI never renders it from anywhere else. The
//    coordinate card's face is only handed to <FlipCard> when the view
//    actually carries it (or after the round, when it's public).
//  - Hot-seat (several humans, one device): the card is shown only after
//    the clue-giver explicitly takes the device for THIS round, and it is
//    covered (not rendered) before the table sees the board again. Seat
//    switching goes through `useSeatSwitching()` only.
// ============================================================================

type Dispatch = (a: CrossCluesAction) => void;

const NOTE_COLORS = ['#ffe680', '#ffb3c4', '#a9ecc4', '#a8d8ff', '#ffcf8a'];

function sameCoord(a: Coord | null | undefined, b: Coord | null | undefined): boolean {
  return !!a && !!b && a.row === b.row && a.col === b.col;
}

function nameOf(view: CrossCluesPublicState, seat: number | null): string {
  return seat === null ? '?' : (view.seats[seat]?.name ?? '?');
}

export function CrossCluesGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const aiSeats = useGameStore((s) => s.aiSeats);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);
  const seatSwitch = useSeatSwitching();
  const [claimed, setClaimed] = useState<string | null>(null);
  const [selected, setSelected] = useState<Coord | null>(null);
  const guessKey = publicView ? `${(publicView.view as CrossCluesPublicState).roundNumber}:${(publicView.view as CrossCluesPublicState).phase}` : '';
  const [selectedKey, setSelectedKey] = useState(guessKey);
  if (selectedKey !== guessKey) {
    setSelectedKey(guessKey);
    setSelected(null);
  }

  if (!publicView) return null;
  const view = publicView.view as CrossCluesPublicState;
  const send: Dispatch = (a) => dispatch(a);
  const humanSeats = view.seats.map((s) => s.index).filter((i) => !aiSeats.includes(i) && seatSwitch.canView(i));
  const hotSeat = seatSwitch.enabled && humanSeats.length > 1;
  const roundKey = `${view.roundNumber}`;

  // ---- Who is at the device, and is a secret on screen? ------------------
  const giver = view.currentClueGiver;
  const giverHuman = giver !== null && humanSeats.includes(giver);
  let cover: ReactNode = null;
  if (hotSeat && view.phase === 'clueGiving' && giverHuman) {
    const ready = localSeat === giver && claimed === roundKey && view.yourCoord !== null;
    if (!ready) {
      cover = (
        <PassNote
          title={`Pass the notebook to ${nameOf(view, giver)}`}
          body={`${nameOf(view, giver)} draws a secret coordinate card. Everyone else: no peeking!`}
          action={`I'm ${nameOf(view, giver)} — draw my card`}
          onGo={() => {
            seatSwitch.setLocalSeat(giver);
            setClaimed(roundKey);
          }}
        />
      );
    }
  } else if (hotSeat && view.yourCoord !== null) {
    // The holder's card is in this view but it isn't their private moment.
    const next = view.currentGuesser !== null && humanSeats.includes(view.currentGuesser) ? view.currentGuesser : null;
    cover = (
      <PassNote
        title="Hide your card"
        body={`Clue sent: “${view.currentClue ?? ''}”. Hand the notebook to ${next !== null ? nameOf(view, next) : 'the table'} to guess.`}
        action="Show the team the notebook"
        onGo={() => seatSwitch.setLocalSeat(next)}
      />
    );
  }

  // In hot-seat the shared device guesses as the designated guesser.
  const actingGuesser =
    view.phase === 'guessing' &&
    view.currentGuesser !== null &&
    (localSeat === view.currentGuesser || (hotSeat && humanSeats.includes(view.currentGuesser)))
      ? view.currentGuesser
      : null;
  // Seats this device acknowledges for (hot-seat: every human at once).
  const ackSeats = hotSeat ? humanSeats : localSeat !== null && !aiSeats.includes(localSeat) ? [localSeat] : [];

  const onCell = (c: Coord) => {
    if (actingGuesser === null) return;
    setSelected((cur) => (sameCoord(cur, c) ? null : c));
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <h2 className={styles.title}>Cross Clues</h2>
          <span className={styles.subtitle}>
            {view.phase === 'gameOver' ? 'All 25 cards played' : `Round ${Math.min(view.roundNumber, 25)} of 25`} ·{' '}
            {view.packs.length > 0 ? view.packs.join(' + ') : 'classic'}
          </span>
        </div>
        <button type="button" className={styles.exitBtn} onClick={exitGame}>
          Exit
        </button>
      </header>
      <LiveRegion view={view} />

      <div className={styles.table}>
        <section className={styles.notebook} aria-label="Grid">
          <span className={styles.spiral} aria-hidden />
          {cover ? (
            <div className={styles.coverArea}>{cover}</div>
          ) : (
            <Grid
              view={view}
              canPick={actingGuesser !== null}
              selected={selected}
              onCell={onCell}
            />
          )}
        </section>

        <aside className={styles.side}>
          <ScoreNote view={view} />
          {!cover && (
            <PhasePanel
              view={view}
              localSeat={localSeat}
              actingGuesser={actingGuesser}
              ackSeats={ackSeats}
              hotSeat={hotSeat}
              selected={selected}
              clearSelected={() => setSelected(null)}
              dispatch={send}
            />
          )}
          <Players view={view} localSeat={hotSeat ? null : localSeat} aiSeats={aiSeats} />
        </aside>
      </div>
    </div>
  );
}

function LiveRegion({ view }: { view: CrossCluesPublicState }) {
  let msg = '';
  if (view.phase === 'guessing' && view.currentClue) msg = `Clue: ${view.currentClue}.`;
  else if (view.phase === 'revealRound' && view.lastRound)
    msg = `${view.lastRound.correct ? 'Correct' : 'Missed'}: the card was ${coordLabel(view.lastRound.trueCoord)}.`;
  else if (view.phase === 'gameOver') msg = `Final score ${view.score} of 25.`;
  return (
    <p className={styles.srOnly} aria-live="polite">
      {msg}
    </p>
  );
}

function PassNote({ title, body, action, onGo }: { title: string; body: string; action: string; onGo: () => void }) {
  return (
    <div className={styles.passNote} role="dialog" aria-labelledby="cc-pass-title">
      <span className={styles.tape} aria-hidden />
      <h3 id="cc-pass-title" className={styles.passTitle}>
        {title}
      </h3>
      <p className={styles.passBody}>{body}</p>
      <button type="button" className={styles.markerBtn} onClick={onGo} autoFocus>
        {action}
      </button>
    </div>
  );
}

// ============================================================================
// Grid
// ============================================================================

function Grid({
  view,
  canPick,
  selected,
  onCell,
}: {
  view: CrossCluesPublicState;
  canPick: boolean;
  selected: Coord | null;
  onCell: (c: Coord) => void;
}) {
  const held = view.yourCoord;
  const last = view.phase === 'revealRound' ? view.lastRound : null;
  // Notes already on the page when this grid mounted don't replay the stick.
  const seen = useRef<Set<string> | null>(null);
  const key = (r: number, c: number) => `${r}:${c}`;
  if (seen.current === null) {
    seen.current = new Set();
    view.grid.forEach((row, r) => row.forEach((cell, c) => cell.resolved && seen.current!.add(key(r, c))));
  }
  useEffect(() => {
    view.grid.forEach((row, r) => row.forEach((cell, c) => cell.resolved && seen.current!.add(key(r, c))));
  });

  return (
    <div className={styles.grid}>
      <div className={styles.corner} aria-hidden>
        <svg viewBox="0 0 40 40" className={styles.cornerSvg}>
          <path d="M8 32 L32 8 M24 8 L32 8 L32 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
      {COL_LABELS.map((label, c) => (
        <Header
          key={`c${c}`}
          label={label}
          word={view.colWords[c] ?? ''}
          hot={held?.col === c}
          axis="col"
          index={c}
        />
      ))}
      {ROW_LABELS.map((label, r) => (
        <RowCells
          key={`r${r}`}
          r={r}
          label={label}
          view={view}
          held={held}
          last={last}
          canPick={canPick}
          selected={selected}
          onCell={onCell}
          isFresh={(c) => !seen.current!.has(key(r, c))}
        />
      ))}
    </div>
  );
}

function Header({ label, word, hot, axis, index }: { label: string; word: string; hot: boolean; axis: 'row' | 'col'; index: number }) {
  const tilt = (((index * 29 + (axis === 'row' ? 3 : 0)) % 5) - 2) * 0.8;
  return (
    <div className={`${styles.header_} ${axis === 'row' ? styles.rowHeader : styles.colHeader} ${hot ? styles.hot : ''}`}>
      <span className={styles.axisLabel}>{label}</span>
      <span className={styles.tapeWord} style={{ '--tilt': `${tilt}deg`, '--len': Math.max(4, word.length) } as CSSProperties}>
        <span className={styles.highlight}>{word}</span>
      </span>
    </div>
  );
}

function RowCells({
  r,
  label,
  view,
  held,
  last,
  canPick,
  selected,
  onCell,
  isFresh,
}: {
  r: number;
  label: string;
  view: CrossCluesPublicState;
  held: Coord | null;
  last: RoundRecord | null;
  canPick: boolean;
  selected: Coord | null;
  onCell: (c: Coord) => void;
  isFresh: (c: number) => boolean;
}) {
  return (
    <>
      <Header label={label} word={view.rowWords[r] ?? ''} hot={held?.row === r} axis="row" index={r} />
      {view.grid[r]!.map((cell, c) => {
        const coord = { row: r, col: c };
        return (
          <Cell
            key={c}
            coord={coord}
            cell={cell}
            rowWord={view.rowWords[r] ?? ''}
            colWord={view.colWords[c] ?? ''}
            isHeld={sameCoord(held, coord)}
            isLastTrue={sameCoord(last?.trueCoord, coord)}
            isLastWrongGuess={!!last && !last.correct && sameCoord(last.guessCoord, coord)}
            clickable={canPick && !cell.resolved}
            selected={sameCoord(selected, coord)}
            fresh={cell.resolved && isFresh(c)}
            onClick={() => onCell(coord)}
          />
        );
      })}
    </>
  );
}

function Cell({
  coord,
  cell,
  rowWord,
  colWord,
  isHeld,
  isLastTrue,
  isLastWrongGuess,
  clickable,
  selected,
  fresh,
  onClick,
}: {
  coord: Coord;
  cell: CrossCluesPublicCell;
  rowWord: string;
  colWord: string;
  isHeld: boolean;
  isLastTrue: boolean;
  isLastWrongGuess: boolean;
  clickable: boolean;
  selected: boolean;
  fresh: boolean;
  onClick: () => void;
}) {
  const label = coordLabel(coord);
  const idx = coord.row * 5 + coord.col;
  const noteColor = NOTE_COLORS[(cell.resolvedOnRound ?? idx) % NOTE_COLORS.length];
  const rot = ((idx * 41) % 9) - 4;
  const cls = [
    styles.cell,
    clickable ? styles.clickable : '',
    selected ? styles.selected : '',
    isHeld ? styles.heldCell : '',
    isLastTrue ? styles.lastTrue : '',
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      <span className={styles.cellLabel} aria-hidden>
        {label}
      </span>
      {cell.resolved && (
        <span
          className={`${styles.note} ${cell.token === 'red' ? styles.noteMiss : ''} ${fresh ? styles.stick : ''}`}
          style={{ '--note': noteColor, '--rot': `${rot}deg` } as CSSProperties}
          aria-hidden
        >
          <span className={styles.noteClue} style={{ '--len': Math.max(5, (cell.clueWord ?? '').length) } as CSSProperties}>
            {cell.clueWord ?? '—'}
          </span>
          <svg className={styles.mark} viewBox="0 0 40 40" aria-hidden>
            {cell.token === 'green' ? (
              <path className={styles.markPath} d="M8 21 L17 30 L33 10" />
            ) : (
              <path className={`${styles.markPath} ${styles.markX}`} d="M10 10 L30 30 M30 10 L10 30" />
            )}
          </svg>
        </span>
      )}
      {isLastWrongGuess && (
        <span className={styles.pencilRing} aria-hidden>
          ?
        </span>
      )}
      {selected && <span className={styles.selectRing} aria-hidden />}
    </>
  );
  const aria = cell.resolved
    ? `${label}: ${cell.token === 'green' ? 'placed' : 'missed'}, clue ${cell.clueWord ?? ''}`
    : `${label}: ${rowWord} and ${colWord}${isHeld ? ' (your card)' : ''}`;
  if (clickable) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-pressed={selected} aria-label={aria}>
        {content}
      </button>
    );
  }
  return (
    <div className={cls} role="img" aria-label={aria}>
      {content}
    </div>
  );
}

// ============================================================================
// Side panel
// ============================================================================

function ScoreNote({ view }: { view: CrossCluesPublicState }) {
  const results = new Map<number, 'green' | 'red'>();
  view.grid.forEach((row) =>
    row.forEach((cell) => {
      if (cell.resolvedOnRound !== null && cell.token) results.set(cell.resolvedOnRound, cell.token);
    }),
  );
  return (
    <section className={styles.scoreNote} aria-label={`Score ${view.score} of 25`}>
      <div className={styles.scoreTop}>
        <span className={styles.scoreLabel}>Team score</span>
        <span key={view.score} className={styles.scoreNum}>
          {view.score}
          <small>/25</small>
        </span>
      </div>
      <div className={styles.tally} aria-hidden>
        {Array.from({ length: 25 }, (_, i) => (
          <span key={i} className={styles.tallyBox} data-r={results.get(i + 1)} />
        ))}
      </div>
      <div className={styles.deck} aria-label={`${view.remainingCount} coordinate cards left in the deck`}>
        <span className={styles.deckStack} aria-hidden>
          {Array.from({ length: Math.min(4, Math.ceil(view.remainingCount / 6)) }, (_, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </span>
        <span>{view.remainingCount} cards in the deck</span>
      </div>
    </section>
  );
}

function PhasePanel({
  view,
  localSeat,
  actingGuesser,
  ackSeats,
  hotSeat,
  selected,
  clearSelected,
  dispatch,
}: {
  view: CrossCluesPublicState;
  localSeat: number | null;
  actingGuesser: number | null;
  ackSeats: number[];
  hotSeat: boolean;
  selected: Coord | null;
  clearSelected: () => void;
  dispatch: Dispatch;
}) {
  const ack = (type: 'ackSetup' | 'ackReveal', done: (seat: number) => boolean) => {
    for (const seat of ackSeats) if (!done(seat)) dispatch({ type, bySeat: seat });
  };
  switch (view.phase) {
    case 'setup': {
      const pending = ackSeats.filter((s) => !view.seats[s]?.hasAckedSetup);
      return (
        <Sticky color="#ffe680" title="Study the grid">
          <p className={styles.noteText}>
            Read the five row words and five column words. Each square is where a row meets a column.
          </p>
          {ackSeats.length > 0 && (
            <button
              type="button"
              className={styles.markerBtn}
              disabled={pending.length === 0}
              onClick={() => ack('ackSetup', (s) => !!view.seats[s]?.hasAckedSetup)}
            >
              {pending.length === 0 ? 'Waiting for the others…' : hotSeat ? "We're ready" : "I'm ready"}
            </button>
          )}
          <AckCount view={view} kind="setup" />
        </Sticky>
      );
    }
    case 'clueGiving':
      if (view.yourCoord && localSeat !== null && localSeat === view.currentClueGiver) {
        return (
          <HoldingCard view={view} coord={view.yourCoord}>
            <ClueForm
              key={view.roundNumber}
              view={view}
              onSubmit={(clue) => dispatch({ type: 'submitClue', bySeat: localSeat, clue })}
            />
          </HoldingCard>
        );
      }
      return (
        <Sticky color="#a8d8ff" title="Thinking…">
          <p className={styles.noteText}>
            <b>{nameOf(view, view.currentClueGiver)}</b> drew a coordinate card and is writing a one-word clue
            <span className={styles.pencilDots} aria-hidden />
          </p>
          <p className={styles.noteSmall}>
            Then <b>{nameOf(view, view.currentGuesser)}</b> enters the team&apos;s guess.
          </p>
        </Sticky>
      );
    case 'guessing':
      return (
        <>
          <ClueBubble view={view} />
          {view.yourCoord && <HoldingCard view={view} coord={view.yourCoord} small />}
          {actingGuesser !== null ? (
            <Sticky color="#a9ecc4" title={`${nameOf(view, actingGuesser)}, enter the guess`}>
              <p className={styles.noteText}>
                Talk it over, tap the square you agree on, then confirm.
              </p>
              <button
                type="button"
                className={styles.markerBtn}
                disabled={!selected}
                onClick={() => {
                  if (!selected) return;
                  dispatch({ type: 'submitGuess', bySeat: actingGuesser, coord: selected });
                  clearSelected();
                }}
              >
                {selected
                  ? `Guess ${coordLabel(selected)} · ${view.rowWords[selected.row]} × ${view.colWords[selected.col]}`
                  : 'Pick a square'}
              </button>
            </Sticky>
          ) : (
            <Sticky color="#ffcf8a" title="Discuss!">
              <p className={styles.noteText}>
                {view.yourCoord
                  ? 'Your team is deliberating. Stay quiet — no hints!'
                  : `Share your thoughts; ${nameOf(view, view.currentGuesser)} submits the team's guess.`}
              </p>
            </Sticky>
          )}
        </>
      );
    case 'revealRound': {
      const r = view.lastRound;
      if (!r) return null;
      const pending = ackSeats.filter((s) => !view.seats[s]?.hasAckedReveal);
      return (
        <Sticky color={r.correct ? '#a9ecc4' : '#ffb3c4'} title={r.correct ? 'Got it!' : 'So close…'}>
          <RevealCard view={view} round={r} />
          <p className={styles.noteText}>
            <b>{nameOf(view, r.clueGiverSeat)}</b> held <b>{coordLabel(r.trueCoord)}</b> ({view.rowWords[r.trueCoord.row]} ×{' '}
            {view.colWords[r.trueCoord.col]}) and wrote “{r.clueWord}”.
            {!r.correct && (
              <>
                {' '}
                The team guessed <b>{coordLabel(r.guessCoord)}</b>; the card is discarded.
              </>
            )}
          </p>
          {ackSeats.length > 0 && (
            <button
              type="button"
              className={styles.markerBtn}
              disabled={pending.length === 0}
              onClick={() => ack('ackReveal', (s) => !!view.seats[s]?.hasAckedReveal)}
              autoFocus
            >
              {pending.length === 0 ? 'Waiting for the others…' : view.remainingCount === 0 ? 'See the final score →' : 'Next round →'}
            </button>
          )}
          <AckCount view={view} kind="reveal" />
        </Sticky>
      );
    }
    case 'gameOver':
      return <FinalScore view={view} />;
  }
}

function Sticky({ color, title, children }: { color: string; title: string; children: ReactNode }) {
  return (
    <section className={styles.sticky} style={{ '--note': color } as CSSProperties} aria-label={title}>
      <span className={styles.tape} aria-hidden />
      <h3 className={styles.stickyTitle}>{title}</h3>
      {children}
    </section>
  );
}

function AckCount({ view, kind }: { view: CrossCluesPublicState; kind: 'setup' | 'reveal' }) {
  const done = view.seats.filter((s) => (kind === 'setup' ? s.hasAckedSetup : s.hasAckedReveal)).length;
  return (
    <p className={styles.noteSmall}>
      Ready: {done} / {view.seats.length}
    </p>
  );
}

/** The coordinate card, dealt face-down and flipped up for its holder. */
function HoldingCard({
  view,
  coord,
  small = false,
  children,
}: {
  view: CrossCluesPublicState;
  coord: Coord;
  small?: boolean;
  children?: ReactNode;
}) {
  const [up, setUp] = useState(small);
  useEffect(() => {
    if (up) return;
    const t = setTimeout(() => setUp(true), 520);
    return () => clearTimeout(t);
  }, [up]);
  return (
    <section className={`${styles.holding} ${small ? styles.holdingSmall : ''}`} aria-label={`Your card: ${coordLabel(coord)}`}>
      <FlipCard
        revealed={up}
        dealDelayMs={small ? null : 0}
        width={small ? 96 : 132}
        height={small ? 96 : 132}
        radius={4}
        back={<CardBack />}
        front={<CoordFace view={view} coord={coord} />}
      />
      <div className={styles.holdingBody}>
        <span className={styles.holdingLabel}>Your secret card</span>
        <span className={styles.holdingWords}>
          {view.rowWords[coord.row]} <span aria-hidden>×</span> {view.colWords[coord.col]}
        </span>
        {children}
      </div>
    </section>
  );
}

function CardBack() {
  return (
    <span className={styles.cardBack}>
      <span>?</span>
    </span>
  );
}

function CoordFace({ view, coord }: { view: CrossCluesPublicState; coord: Coord }) {
  return (
    <span className={styles.cardFace}>
      <span className={styles.cardCoord}>{coordLabel(coord)}</span>
      <span className={styles.cardWords}>
        {view.rowWords[coord.row]}
        <br />
        {view.colWords[coord.col]}
      </span>
    </span>
  );
}

/** After the guess the card is public: turn it over for everyone. */
function RevealCard({ view, round }: { view: CrossCluesPublicState; round: RoundRecord }) {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setUp(true), 280);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={styles.revealCard}>
      <FlipCard
        revealed={up}
        width={96}
        height={96}
        radius={4}
        back={<CardBack />}
        front={<CoordFace view={view} coord={round.trueCoord} />}
      />
    </div>
  );
}

function ClueForm({ view, onSubmit }: { view: CrossCluesPublicState; onSubmit: (clue: string) => void }) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const problem = trimmed ? clueProblem(trimmed, [...view.rowWords, ...view.colWords]) : null;
  const canSubmit = trimmed.length > 0 && !problem;
  return (
    <form
      className={styles.clueForm}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(trimmed);
      }}
    >
      <label className={styles.clueLabel} htmlFor="cc-clue">
        Your one-word clue
      </label>
      <input
        id="cc-clue"
        className={styles.clueInput}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. lighthouse"
        maxLength={MAX_CLUE_LENGTH}
        autoFocus
        autoComplete="off"
        aria-invalid={!!problem}
        aria-describedby="cc-clue-help"
      />
      <p id="cc-clue-help" className={problem ? styles.clueError : styles.noteSmall} role={problem ? 'alert' : undefined}>
        {problem ?? 'One word linking both words. Not a grid word.'}
      </p>
      <button type="submit" className={styles.markerBtn} disabled={!canSubmit}>
        Stick it on the board →
      </button>
    </form>
  );
}

function ClueBubble({ view }: { view: CrossCluesPublicState }) {
  return (
    <section key={`${view.roundNumber}`} className={styles.bubble} aria-label={`Clue: ${view.currentClue ?? ''}`}>
      <span className={styles.bubbleFrom}>{nameOf(view, view.currentClueGiver)}&apos;s clue</span>
      <span className={styles.bubbleWord}>{view.currentClue}</span>
    </section>
  );
}

const RATING: Record<string, { title: string; line: string }> = {
  perfect: { title: 'Perfect!', line: 'All 25 squares. Telepathy confirmed.' },
  legendary: { title: 'Legendary', line: 'A mind-meld of a game.' },
  great: { title: 'Great game', line: 'Solid teamwork — the clues landed.' },
  rookie: { title: 'Keep practising', line: 'Every table finds its rhythm. Go again?' },
};

function FinalScore({ view }: { view: CrossCluesPublicState }) {
  const rating = view.scoreRating ?? 'rookie';
  const target = view.score;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target === 0) {
      setShown(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 1400;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setShown(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  const info = RATING[rating]!;
  return (
    <section className={styles.final} data-rating={rating} aria-label={`Final score ${target} of 25: ${info.title}`}>
      {rating !== 'rookie' && <Confetti />}
      <span className={styles.finalLabel}>Final score</span>
      <span className={styles.finalNum} aria-hidden>
        {shown}
        <small>/25</small>
      </span>
      <span className={styles.finalBadge}>{info.title}</span>
      <p className={styles.noteText}>{info.line}</p>
      <p className={styles.noteSmall}>Tiers: 16+ great · 21+ legendary · 25 perfect.</p>
    </section>
  );
}

function Confetti() {
  return (
    <span className={styles.confetti} aria-hidden>
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          style={
            {
              '--x': `${(i * 37) % 100}%`,
              '--d': `${(i % 9) * 110}ms`,
              '--c': NOTE_COLORS[i % NOTE_COLORS.length],
              '--r': `${(i * 67) % 360}deg`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

function Players({ view, localSeat, aiSeats }: { view: CrossCluesPublicState; localSeat: number | null; aiSeats: number[] }) {
  return (
    <section className={styles.players} aria-label="Players">
      {view.seats.map((s) => {
        const role =
          view.phase === 'setup' || view.phase === 'gameOver'
            ? null
            : s.index === view.currentClueGiver
              ? 'clue'
              : s.index === view.currentGuesser
                ? 'guess'
                : null;
        const acked =
          (view.phase === 'setup' && s.hasAckedSetup) || (view.phase === 'revealRound' && s.hasAckedReveal);
        return (
          <span key={s.index} className={styles.tag} data-role={role ?? undefined} data-you={s.index === localSeat || undefined}>
            <span className={styles.tagName}>{s.name}</span>
            {aiSeats.includes(s.index) && <span className={styles.tagAi}>AI</span>}
            {role === 'clue' && <span className={styles.tagRole}>✎ clue</span>}
            {role === 'guess' && <span className={styles.tagRole}>? guess</span>}
            {acked && (
              <span className={styles.tagAck} aria-label="ready">
                ✓
              </span>
            )}
            {s.index === localSeat && <span className={styles.tagYou}>you</span>}
          </span>
        );
      })}
    </section>
  );
}

export { CrossCluesGameView as default };
