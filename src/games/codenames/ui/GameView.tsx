import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameStore, useSeatSwitching } from '@/store/gameStore';
import { useSvgIds } from '@/ui/shared/svg';
import type { CodenamesAction } from '../actions';
import { clueProblem, maxGuesses, MAX_CLUE_LENGTH, MAX_CLUE_NUMBER, visibleWords } from '../rules';
import type {
  CodenamesClue,
  CodenamesPublicCard,
  CodenamesPublicSeatState,
  CodenamesPublicState,
  TeamColor,
} from '../state';
import { AgentSprite, KIND_LABEL, Portrait, portraitFor } from './art';
import styles from './GameView.module.css';

// ============================================================================
// Codenames game view — a Cold-War dossier on the desk.
//
// Hidden-info rules for this file:
//  - The key only exists in a spymaster's view (or the final reveal); the
//    UI renders whatever kinds the view carries and never anything else.
//  - Hot-seat (several humans, one device): the key is shown only after the
//    current spymaster explicitly opens their file for THIS clue, and the
//    device covers it again (without rendering it) as soon as the clue is
//    sent. Seat switching goes through `useSeatSwitching()` only.
//  - Online / single human: each device renders its own seat's view.
// ============================================================================

type IdFn = ReturnType<typeof useSvgIds>;
type Dispatch = (a: CodenamesAction) => void;

const TEAM_NAME: Record<TeamColor, string> = { red: 'Red', blue: 'Blue' };
const NUMBER_WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

function spymasterOf(view: CodenamesPublicState, team: TeamColor): CodenamesPublicSeatState | undefined {
  return view.seats.find((s) => s.team === team && s.role === 'spymaster');
}

export function CodenamesGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);
  const seatSwitch = useSeatSwitching();
  const id = useSvgIds();

  if (!publicView) return null;
  const view = publicView.view as CodenamesPublicState;
  const humanSeats = view.seats.filter((s) => !s.isAI && seatSwitch.canView(s.index)).map((s) => s.index);
  const hotSeat = seatSwitch.enabled && humanSeats.length > 1;
  const send: Dispatch = (a) => dispatch(a);

  return (
    <div className={styles.root} data-team={view.currentTeam}>
      <AgentSprite id={id} />
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.classified} aria-hidden>
            Classified
          </span>
          <h2 className={styles.title}>Codenames</h2>
          <span className={styles.subtitle}>Field operations · {view.clueHistory.length} transmissions</span>
        </div>
        <button type="button" className={styles.exitBtn} onClick={exitGame}>
          Exit
        </button>
      </header>

      <Scoreboards view={view} localSeat={hotSeat ? null : localSeat} />
      <LiveRegion view={view} />

      {hotSeat ? (
        <HotSeatTable
          view={view}
          localSeat={localSeat}
          humanSeats={humanSeats}
          setLocalSeat={seatSwitch.setLocalSeat}
          dispatch={send}
          id={id}
        />
      ) : (
        <Desk view={view} actingSeat={localSeat} dispatch={send} id={id} />
      )}
    </div>
  );
}

// ============================================================================
// Hot-seat gate
// ============================================================================

function HotSeatTable({
  view,
  localSeat,
  humanSeats,
  setLocalSeat,
  dispatch,
  id,
}: {
  view: CodenamesPublicState;
  localSeat: number | null;
  humanSeats: number[];
  setLocalSeat: (seat: number | null) => void;
  dispatch: Dispatch;
  id: IdFn;
}) {
  // The clue (by turn) for which the current spymaster opened the key.
  const [claimed, setClaimed] = useState<string | null>(null);
  const turnKey = `${view.clueHistory.length}:${view.phase}:${view.currentTeam}`;

  if (view.phase === 'gameOver') {
    return <Desk view={view} actingSeat={null} dispatch={dispatch} id={id} />;
  }

  const spy = spymasterOf(view, view.currentTeam);
  const team = TEAM_NAME[view.currentTeam];

  // Private moment: a human spymaster writes the clue with the key open.
  if (view.phase === 'clue' && spy && humanSeats.includes(spy.index)) {
    if (localSeat === spy.index && claimed === turnKey && view.yourRole === 'spymaster') {
      return <Desk view={view} actingSeat={spy.index} dispatch={dispatch} id={id} />;
    }
    return (
      <Folder
        team={view.currentTeam}
        tab={`${team} spymaster`}
        stamp="Eyes only"
        title={`Pass the device to ${spy.name}`}
        lines={[
          `${spy.name} is the ${team} spymaster and is about to open the key card.`,
          'Operatives: look away until the clue is transmitted.',
        ]}
        action={`I am ${spy.name} — open the file`}
        onOpen={() => {
          setLocalSeat(spy.index);
          setClaimed(turnKey);
        }}
      />
    );
  }

  // Public moment. The key must not be on screen: close any spymaster view
  // before showing the board to the table.
  if (view.yourRole === 'spymaster') {
    const table = pickTableSeat(view, humanSeats);
    const clue = view.currentClue;
    return (
      <Folder
        team={view.currentTeam}
        tab="File closed"
        stamp="Sealed"
        title={clue ? 'Transmission sent' : `${team} spymaster is encoding`}
        lines={
          clue
            ? [
                `Clue: ${clue.word} · ${clue.number}.`,
                `Hand the device to the ${team} operatives. The key stays sealed while they guess.`,
              ]
            : ['The key card is sealed. Hand the device back to the table.']
        }
        action="Open the board for the table"
        onOpen={() => setLocalSeat(table)}
      />
    );
  }

  return <Desk view={view} actingSeat={pickActingOperative(view, localSeat, humanSeats)} dispatch={dispatch} id={id} />;
}

/** A non-spymaster seat to show the table: a current-team human operative if any. */
function pickTableSeat(view: CodenamesPublicState, humanSeats: number[]): number | null {
  const ops = view.seats.filter((s) => s.role === 'operative' && humanSeats.includes(s.index));
  return (ops.find((s) => s.team === view.currentTeam) ?? ops[0])?.index ?? null;
}

/** Which human operative the shared device guesses as. */
function pickActingOperative(view: CodenamesPublicState, localSeat: number | null, humanSeats: number[]): number | null {
  const isOp = (i: number | null) =>
    i !== null &&
    humanSeats.includes(i) &&
    view.seats[i]?.role === 'operative' &&
    view.seats[i]?.team === view.currentTeam;
  if (isOp(localSeat)) return localSeat;
  return view.seats.find((s) => isOp(s.index))?.index ?? localSeat;
}

function Folder({
  team,
  tab,
  stamp,
  title,
  lines,
  action,
  onOpen,
}: {
  team: TeamColor;
  tab: string;
  stamp: string;
  title: string;
  lines: string[];
  action: string;
  onOpen: () => void;
}) {
  return (
    <section className={styles.coverWrap} aria-labelledby="cn-folder-title">
      <div className={styles.folder} data-team={team}>
        <span className={styles.folderTab}>{tab}</span>
        <span className={styles.folderStamp} aria-hidden>
          {stamp}
        </span>
        <h2 id="cn-folder-title" className={styles.folderTitle}>
          {title}
        </h2>
        {lines.map((l) => (
          <p key={l} className={styles.folderLine}>
            {l}
          </p>
        ))}
        <button type="button" className={styles.openBtn} onClick={onOpen} autoFocus>
          {action}
        </button>
      </div>
    </section>
  );
}

// ============================================================================
// Scoreboards + turn stamp
// ============================================================================

function Scoreboards({ view, localSeat }: { view: CodenamesPublicState; localSeat: number | null }) {
  return (
    <div className={styles.scoreboards}>
      <TeamDossier team="red" view={view} localSeat={localSeat} />
      <TurnStamp view={view} />
      <TeamDossier team="blue" view={view} localSeat={localSeat} />
    </div>
  );
}

function TeamDossier({
  team,
  view,
  localSeat,
}: {
  team: TeamColor;
  view: CodenamesPublicState;
  localSeat: number | null;
}) {
  const total = team === view.startingTeam ? 9 : 8;
  const remaining = view.remaining[team];
  const active = view.phase !== 'gameOver' && view.currentTeam === team;
  const members = view.seats
    .filter((s) => s.team === team)
    .sort((a, b) => (a.role === b.role ? a.index - b.index : a.role === 'spymaster' ? -1 : 1));
  return (
    <section
      className={`${styles.dossier} ${active ? 'sd-your-turn' : ''} ${view.winnerTeam === team ? styles.winner : ''}`}
      data-team={team}
      aria-label={`${TEAM_NAME[team]} network: ${remaining} of ${total} agents still undercover${active ? ', on the move' : ''}`}
    >
      <header className={styles.dossierTab}>
        {TEAM_NAME[team]} network{team === view.startingTeam ? ' · first move' : ''}
      </header>
      <div className={styles.dossierBody}>
        <div className={styles.agentsLeft}>
          <span className={styles.bigNum}>{remaining}</span>
          <span className={styles.bigNumLabel}>
            agents
            <br />
            at large
          </span>
        </div>
        <div className={styles.agentTokens} aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={styles.agentToken} data-found={i >= remaining || undefined} />
          ))}
        </div>
      </div>
      <ul className={styles.roster}>
        {members.map((s) => (
          <li key={s.index} className={s.index === localSeat ? styles.rosterYou : undefined}>
            <span className={styles.rosterRole} title={s.role}>
              {s.role === 'spymaster' ? '★' : '•'}
            </span>
            <span className={styles.rosterName}>{s.name}</span>
            {s.role === 'spymaster' && <span className={styles.rosterTag}>spymaster</span>}
            {s.isAI && <span className={styles.aiTag}>AI</span>}
            {s.index === localSeat && <span className={styles.youTag}>you</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TurnStamp({ view }: { view: CodenamesPublicState }) {
  const key = `${view.phase}:${view.currentTeam}:${view.clueHistory.length}`;
  const text =
    view.phase === 'gameOver'
      ? 'Case closed'
      : `${TEAM_NAME[view.currentTeam]} · ${view.phase === 'clue' ? 'clue' : 'guessing'}`;
  return (
    <div className={styles.turnCol}>
      <span className={styles.turnLabel}>Current operation</span>
      <div key={key} className={styles.turnStamp} data-team={view.phase === 'gameOver' ? view.winnerTeam ?? 'none' : view.currentTeam}>
        {text}
      </div>
    </div>
  );
}

function LiveRegion({ view }: { view: CodenamesPublicState }) {
  const last = view.guessHistory[view.guessHistory.length - 1];
  const clue = view.currentClue;
  let msg = '';
  if (view.phase === 'gameOver') {
    msg = `${TEAM_NAME[view.winnerTeam ?? 'red']} network wins.`;
  } else if (clue) {
    msg = `${TEAM_NAME[clue.byTeam]} clue: ${clue.word}, ${clue.number}.`;
  } else if (last) {
    msg = `${last.word} was ${KIND_LABEL[last.kind]}. ${TEAM_NAME[view.currentTeam]} spymaster's turn.`;
  }
  return (
    <p className={styles.srOnly} aria-live="polite">
      {msg}
    </p>
  );
}

// ============================================================================
// The desk: clue slip / telegram, board, key card, case log
// ============================================================================

function Desk({
  view,
  actingSeat,
  dispatch,
  id,
}: {
  view: CodenamesPublicState;
  actingSeat: number | null;
  dispatch: Dispatch;
  id: IdFn;
}) {
  const acting = actingSeat !== null ? view.seats[actingSeat] : undefined;
  const onTeam = !!acting && acting.team === view.currentTeam && !acting.isAI;
  const myClue = view.phase === 'clue' && onTeam && acting!.role === 'spymaster' && view.yourRole === 'spymaster';
  const canGuess = view.phase === 'guessing' && onTeam && acting!.role === 'operative';
  const showKey = view.yourRole === 'spymaster' || view.phase === 'gameOver';
  const clueKey = `${view.clueHistory.length}:${view.currentTeam}`;

  return (
    <div className={styles.desk}>
      <section className={styles.boardColumn} aria-label="Board">
        {view.phase === 'gameOver' ? (
          <GameOverBanner view={view} />
        ) : view.phase === 'clue' ? (
          myClue ? (
            <ClueForm
              key={clueKey}
              view={view}
              onSubmit={(word, number) => dispatch({ type: 'giveClue', bySeat: actingSeat!, word, number })}
            />
          ) : (
            <AwaitingSlip view={view} />
          )
        ) : view.currentClue ? (
          <Telegram key={clueKey} clue={view.currentClue} view={view} />
        ) : null}

        <Board
          view={view}
          canGuess={canGuess}
          onGuess={(cardIndex) => dispatch({ type: 'guessCard', bySeat: actingSeat!, cardIndex })}
          id={id}
        />

        {view.phase === 'guessing' && view.currentClue && (
          <GuessBar
            view={view}
            clue={view.currentClue}
            canAct={canGuess}
            actingName={acting?.name ?? null}
            onEnd={() => dispatch({ type: 'endGuessing', bySeat: actingSeat! })}
          />
        )}
      </section>

      <aside className={styles.sideColumn}>
        {showKey && <KeyCard view={view} />}
        <CaseLog view={view} />
      </aside>
    </div>
  );
}

// ---- Clue form (active spymaster) ------------------------------------------

function ClueForm({ view, onSubmit }: { view: CodenamesPublicState; onSubmit: (word: string, n: number) => void }) {
  const [word, setWord] = useState('');
  const [num, setNum] = useState(1);
  const trimmed = word.trim();
  const problem = trimmed ? clueProblem(trimmed, visibleWords(view.cards)) : null;
  const canSubmit = trimmed.length > 0 && !problem;
  const ownLeft = view.remaining[view.currentTeam];

  return (
    <form
      className={`${styles.telegram} ${styles.telegramForm}`}
      data-team={view.currentTeam}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(trimmed.toUpperCase(), num);
      }}
    >
      <div className={styles.telegramHead}>
        <span>Outgoing telegram</span>
        <span>{TEAM_NAME[view.currentTeam]} network · {ownLeft} agents to contact</span>
      </div>
      <label className={styles.formRow}>
        <span className={styles.formLabel}>Clue</span>
        <input
          className={styles.clueInput}
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="ONE WORD"
          maxLength={MAX_CLUE_LENGTH}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!problem}
          aria-describedby={problem ? 'cn-clue-problem' : 'cn-clue-hint'}
        />
      </label>
      <div className={styles.formRow}>
        <span className={styles.formLabel} id="cn-num-label">
          Number
        </span>
        <div className={styles.keys} role="radiogroup" aria-labelledby="cn-num-label">
          {Array.from({ length: MAX_CLUE_NUMBER + 1 }, (_, n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === num}
              className={`${styles.typeKey} ${n === num ? styles.typeKeyOn : ''}`}
              onClick={() => setNum(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      {problem ? (
        <p id="cn-clue-problem" className={styles.formError} role="alert">
          {problem}.
        </p>
      ) : (
        <p id="cn-clue-hint" className={styles.formHint}>
          One word, not a form of any word still on the board. 0 = “none of ours” (unlimited guesses).
        </p>
      )}
      <div className={styles.formFoot}>
        <button type="submit" className={styles.transmit} disabled={!canSubmit}>
          Transmit
        </button>
      </div>
    </form>
  );
}

function AwaitingSlip({ view }: { view: CodenamesPublicState }) {
  const spy = spymasterOf(view, view.currentTeam);
  return (
    <div className={styles.slip} data-team={view.currentTeam}>
      <span className={styles.slipLabel}>Awaiting transmission</span>
      <span className={styles.slipText}>
        {spy?.name ?? 'The spymaster'} ({TEAM_NAME[view.currentTeam]} spymaster) is encoding a clue
        <span className={styles.cursor} aria-hidden>
          ▌
        </span>
      </span>
    </div>
  );
}

function Telegram({ clue, view }: { clue: CodenamesClue; view: CodenamesPublicState }) {
  const from = view.seats[clue.bySeat]?.name ?? 'Spymaster';
  const text = `${clue.word} STOP ${NUMBER_WORDS[clue.number] ?? clue.number} STOP`;
  return (
    <div className={styles.telegram} data-team={clue.byTeam} aria-label={`Clue: ${clue.word}, ${clue.number}`}>
      <div className={styles.telegramHead}>
        <span>Telegram · priority</span>
        <span>
          From {from} · {TEAM_NAME[clue.byTeam]} network
        </span>
      </div>
      <p className={styles.typed} aria-hidden>
        {[...text].map((ch, i) => (
          <span key={i} style={{ '--i': i } as CSSProperties}>
            {ch}
          </span>
        ))}
      </p>
      <span className={styles.telegramNumber} aria-hidden>
        {clue.number === 0 ? '0' : clue.number}
      </span>
    </div>
  );
}

// ---- Board -----------------------------------------------------------------

function Board({
  view,
  canGuess,
  onGuess,
  id,
}: {
  view: CodenamesPublicState;
  canGuess: boolean;
  onGuess: (cardIndex: number) => void;
  id: IdFn;
}) {
  // Cards already covered when this board mounted don't replay the slap.
  const seen = useRef<Set<number> | null>(null);
  if (seen.current === null) seen.current = new Set(view.cards.filter((c) => c.revealed).map((c) => c.index));
  useEffect(() => {
    for (const c of view.cards) if (c.revealed) seen.current!.add(c.index);
  });
  // Two-step guess: first tap marks the card, second tap (or Confirm) sends.
  const [pending, setPending] = useState<number | null>(null);
  const turnKey = `${view.clueHistory.length}:${view.guessesThisClue}`;
  const [pendingKey, setPendingKey] = useState(turnKey);
  if (pendingKey !== turnKey) {
    setPendingKey(turnKey);
    setPending(null);
  }

  return (
    <div
      className={styles.grid}
      data-key={view.yourRole === 'spymaster' ? 'on' : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setPending(null);
      }}
    >
      {view.cards.map((c) => (
        <WordCard
          key={c.index}
          card={c}
          canGuess={canGuess && !c.revealed}
          pending={pending === c.index}
          fresh={c.revealed && !seen.current!.has(c.index)}
          id={id}
          onClick={() => {
            if (pending === c.index) {
              setPending(null);
              onGuess(c.index);
            } else setPending(c.index);
          }}
        />
      ))}
    </div>
  );
}

function WordCard({
  card,
  canGuess,
  pending,
  fresh,
  id,
  onClick,
}: {
  card: CodenamesPublicCard;
  canGuess: boolean;
  pending: boolean;
  fresh: boolean;
  id: IdFn;
  onClick: () => void;
}) {
  const tilt = (((card.index * 37) % 7) - 3) * 0.35;
  const coverRot = ((card.index * 53) % 9) - 4;
  // A kind on a face-up card only exists in a spymaster view / final reveal.
  const tint = !card.revealed && card.kind ? card.kind : undefined;
  const cls = [
    styles.card,
    canGuess ? styles.cardClickable : '',
    pending ? styles.cardPending : '',
    fresh ? styles.thud : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = { '--tilt': `${tilt}deg`, '--rot': `${coverRot}deg` } as CSSProperties;
  const content = (
    <>
      <span className={styles.cardHole} aria-hidden />
      <span className={styles.cardNo} aria-hidden>
        No.{String(card.index + 1).padStart(2, '0')}
      </span>
      <span className={styles.cardWordFlip} aria-hidden>
        {card.word}
      </span>
      <span className={styles.cardWord}>{card.word}</span>
      {pending && (
        <span className={styles.pendingStamp} aria-hidden>
          Confirm?
        </span>
      )}
      {card.revealed && card.kind && (
        <span className={`${styles.cover} ${fresh ? styles.slap : ''}`} data-kind={card.kind} aria-hidden>
          <Portrait id={id} portrait={portraitFor(card.kind, card.index)} className={styles.portrait} />
          <span className={styles.coverLabel}>{card.word}</span>
        </span>
      )}
    </>
  );
  if (canGuess) {
    return (
      <button
        type="button"
        className={cls}
        style={style}
        data-tint={tint}
        onClick={onClick}
        aria-pressed={pending}
        aria-label={pending ? `Confirm guess: ${card.word}` : `Guess ${card.word}`}
      >
        {content}
      </button>
    );
  }
  const label = card.revealed
    ? `${card.word}: ${card.kind ? KIND_LABEL[card.kind] : 'revealed'}`
    : tint
      ? `${card.word} (key: ${KIND_LABEL[tint]})`
      : card.word;
  return (
    <div className={cls} style={style} data-tint={tint} data-revealed={card.revealed || undefined} role="img" aria-label={label}>
      {content}
    </div>
  );
}

function GuessBar({
  view,
  clue,
  canAct,
  actingName,
  onEnd,
}: {
  view: CodenamesPublicState;
  clue: CodenamesClue;
  canAct: boolean;
  actingName: string | null;
  onEnd: () => void;
}) {
  const cap = maxGuesses(clue.number);
  const used = view.guessesThisClue;
  const bonus = clue.number > 0 && used === clue.number;
  return (
    <div className={styles.guessBar}>
      <div className={styles.guessTokens} aria-label={`Guesses used: ${used}${Number.isFinite(cap) ? ` of ${cap}` : ''}`}>
        <span className={styles.guessLabel}>Contacts</span>
        {Number.isFinite(cap) ? (
          Array.from({ length: cap }, (_, i) => (
            <span
              key={i}
              className={styles.guessToken}
              data-used={i < used || undefined}
              data-bonus={i === cap - 1 || undefined}
              title={i === cap - 1 ? 'Bonus guess' : undefined}
            />
          ))
        ) : (
          <span className={styles.guessInfinite}>{used} · unlimited</span>
        )}
      </div>
      <p className={styles.guessHint}>
        {canAct
          ? bonus
            ? 'Bonus guess — only if an earlier clue still has agents out there.'
            : used === 0
              ? `Tap a card, then tap again to confirm${actingName ? ` (guessing as ${actingName})` : ''}.`
              : 'Keep going, or stand down.'
          : `${TEAM_NAME[view.currentTeam]} operatives are deliberating…`}
      </p>
      {canAct && (
        <button
          type="button"
          className={styles.standDown}
          disabled={used < 1}
          onClick={onEnd}
          title={used < 1 ? 'You must make at least one guess first.' : 'End your turn'}
        >
          Stand down
        </button>
      )}
    </div>
  );
}

// ---- Key card (spymasters only) ---------------------------------------------

function KeyCard({ view }: { view: CodenamesPublicState }) {
  const groups = (['red', 'blue', 'assassin'] as const).map(
    (k) => `${k === 'assassin' ? 'Assassin' : `${TEAM_NAME[k]} agents`}: ${view.cards.filter((c) => c.kind === k).map((c) => c.word).join(', ')}`,
  );
  return (
    <figure className={styles.lightbox}>
      <div
        className={styles.keyCard}
        data-start={view.startingTeam}
        role="img"
        aria-label={`Key card, ${TEAM_NAME[view.startingTeam]} starts. ${groups.join('. ')}.`}
      >
        <span className={styles.keyLight} data-side="top" aria-hidden />
        <span className={styles.keyLight} data-side="bottom" aria-hidden />
        <div className={styles.keyGrid} aria-hidden>
          {view.cards.map((c) => (
            <span key={c.index} className={styles.keySquare} data-kind={c.kind ?? 'unknown'} data-done={c.revealed || undefined} />
          ))}
        </div>
      </div>
      <figcaption className={styles.keyCaption}>
        Key card · {TEAM_NAME[view.startingTeam]} lights · {view.phase === 'gameOver' ? 'declassified' : 'spymasters only'}
      </figcaption>
    </figure>
  );
}

// ---- Case log ----------------------------------------------------------------

const REASON: Record<string, string> = {
  endedVoluntarily: 'stood down',
  hitWrong: 'missed',
  hitAssassin: 'assassin',
  capReached: 'all guesses used',
};

function CaseLog({ view }: { view: CodenamesPublicState }) {
  const rows = view.clueHistory.map((c, i) => ({ c, i })).reverse();
  return (
    <section className={styles.caseLog} aria-label="Case log">
      <h3 className={styles.caseTitle}>Case log</h3>
      {rows.length === 0 ? (
        <p className={styles.caseEmpty}>No transmissions yet.</p>
      ) : (
        <ol className={styles.caseList}>
          {rows.map(({ c, i }) => {
            const found = c.closed
              ? c.correctGuesses
              : view.guessHistory.filter((g) => g.clueIndex === i && g.kind === g.byTeam).length;
            const words = view.guessHistory.filter((g) => g.clueIndex === i);
            return (
              <li key={i} className={styles.caseRow} data-team={c.byTeam}>
                <span className={styles.caseNo}>#{String(i + 1).padStart(2, '0')}</span>
                <span className={styles.caseClue}>
                  {c.word} · {c.number}
                </span>
                <span className={styles.caseMeta}>
                  {found} found{c.closedReason ? ` · ${REASON[c.closedReason]}` : ' · active'}
                </span>
                {words.length > 0 && (
                  <span className={styles.caseWords}>
                    {words.map((g) => (
                      <span key={g.cardIndex} data-kind={g.kind}>
                        {g.word}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function GameOverBanner({ view }: { view: CodenamesPublicState }) {
  const winner = view.winnerTeam ?? 'red';
  const assassin = view.loserTeam !== null;
  return (
    <div className={styles.verdict} data-team={winner}>
      <span className={styles.verdictStamp}>{assassin ? 'Agent terminated' : 'Mission accomplished'}</span>
      <p className={styles.verdictText}>
        {TEAM_NAME[winner]} network wins —{' '}
        {assassin
          ? `the ${TEAM_NAME[view.loserTeam!]} operatives contacted the assassin.`
          : `every ${TEAM_NAME[winner]} agent has been contacted.`}
      </p>
    </div>
  );
}

export { CodenamesGameView as default };
