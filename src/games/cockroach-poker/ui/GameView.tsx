import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { CockroachPokerAction } from '../actions';
import { CREATURES } from '../state';
import type {
  CockroachPokerPublicState,
  Creature,
  PublicPlayer,
} from '../state';
import styles from './GameView.module.css';

const CREATURE_ICONS: Record<Creature, string> = {
  rat: '🐀',
  fly: '🪰',
  spider: '🕷',
  cockroach: '🪳',
  toad: '🐸',
  bat: '🦇',
  scorpion: '🦂',
  stinkbug: '🐞',
};

const CREATURE_LABELS: Record<Creature, string> = {
  rat: 'Rat',
  fly: 'Fly',
  spider: 'Spider',
  cockroach: 'Cockroach',
  toad: 'Toad',
  bat: 'Bat',
  scorpion: 'Scorpion',
  stinkbug: 'Stink Bug',
};

export function CockroachPokerGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);

  if (!publicView) return null;
  const view = publicView.view as CockroachPokerPublicState;
  const dispatchAction = (a: CockroachPokerAction) => dispatch(a);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Cockroach Poker</h2>
          <p className={styles.subtitle}>
            {view.phase === 'gameOver'
              ? 'Match over'
              : view.phase === 'passing'
                ? `${view.seats[view.currentSeat]?.name}'s turn to pass`
                : view.phase === 'decide'
                  ? `${view.passHolder !== null && view.seats[view.passHolder]?.name} must decide`
                  : ''}
          </p>
        </div>
        <button onClick={exitGame} className={styles.secondaryButton}>
          Exit
        </button>
      </header>

      <Board view={view} localSeat={localSeat} onPickSeat={setLocalSeat} />

      <ChainPanel view={view} />

      <PhasePanel view={view} localSeat={localSeat} dispatch={dispatchAction} />
    </div>
  );
}

function Board({
  view,
  localSeat,
  onPickSeat,
}: {
  view: CockroachPokerPublicState;
  localSeat: number | null;
  onPickSeat: (seat: number) => void;
}) {
  return (
    <div className={styles.boardGrid}>
      {view.players.map((p) => (
        <SeatPanel
          key={p.index}
          p={p}
          view={view}
          isLocal={p.index === localSeat}
          onPick={() => onPickSeat(p.index)}
        />
      ))}
    </div>
  );
}

function SeatPanel({
  p,
  view,
  isLocal,
  onPick,
}: {
  p: PublicPlayer;
  view: CockroachPokerPublicState;
  isLocal: boolean;
  onPick: () => void;
}) {
  const isActive = p.index === view.currentSeat && view.phase === 'passing';
  const isHolder = p.index === view.passHolder;
  const classes = [
    styles.seatPanel,
    isActive ? styles.active : '',
    isLocal ? styles.localSeat : '',
    p.lost ? styles.lostSeat : '',
    isHolder ? styles.holder : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <div className={styles.seatHeader}>
        <div>
          <div className={styles.seatName}>
            {p.name} {isLocal && <span className={styles.youTag}>(you)</span>}
          </div>
          <div className={styles.seatStatusRow}>
            {p.lost && <span className={styles.statusBad}>OUT</span>}
            {isActive && !p.lost && (
              <span className={styles.statusActive}>turn</span>
            )}
            {isHolder && !p.lost && !isActive && (
              <span className={styles.statusMuted}>deciding</span>
            )}
          </div>
        </div>
        <div className={styles.seatTokens}>
          <div className={styles.tokenCount}>{p.handSize}</div>
          <div className={styles.tokenLabel}>cards</div>
        </div>
      </div>

      <div className={styles.rowGrid}>
        {CREATURES.map((c) => (
          <div
            key={c}
            className={`${styles.rowCell} ${p.row[c] >= 3 ? styles.rowDanger : ''}`}
            title={CREATURE_LABELS[c]}
          >
            <div className={styles.rowIcon}>{CREATURE_ICONS[c]}</div>
            <div className={styles.rowCount}>{p.row[c]}</div>
          </div>
        ))}
      </div>

      {!isLocal && (
        <button onClick={onPick} className={styles.passButton}>
          look from this seat
        </button>
      )}
    </div>
  );
}

function ChainPanel({ view }: { view: CockroachPokerPublicState }) {
  if (view.passChain.length === 0) return null;
  return (
    <div className={styles.chainStrip}>
      <span className={styles.chainLabel}>Pass chain:</span>
      {view.passChain.map((hop, i) => (
        <span key={i} className={styles.chainHop}>
          {view.seats[hop.from]?.name}
          {' → '}
          {view.seats[hop.to]?.name}
          {' claims '}
          <b>
            {CREATURE_ICONS[hop.claim]} {CREATURE_LABELS[hop.claim]}
          </b>
          {i < view.passChain.length - 1 && <span>, </span>}
        </span>
      ))}
    </div>
  );
}

function PhasePanel({
  view,
  localSeat,
  dispatch,
}: {
  view: CockroachPokerPublicState;
  localSeat: number | null;
  dispatch: (a: CockroachPokerAction) => void;
}) {
  if (view.phase === 'gameOver') {
    const loserName =
      view.loserSeat !== null && view.seats[view.loserSeat]?.name;
    return (
      <div className={styles.panel}>
        <h3 className={styles.h3}>Match over</h3>
        <p>
          <b>{loserName}</b> lost. Survivors:{' '}
          {view.matchWinners.map((i) => view.seats[i]?.name).join(', ')}
        </p>
      </div>
    );
  }

  if (localSeat === null) {
    return (
      <div className={styles.panel}>
        <p style={{ color: '#94a3b8' }}>Pick a seat above to play from.</p>
      </div>
    );
  }

  if (view.phase === 'dealPending') {
    return (
      <div className={styles.panel}>
        <h3 className={styles.h3}>Your hand</h3>
        <YourHand view={view} />
        {view.yourAckPending ? (
          <button
            className={styles.primaryButton}
            style={{ marginTop: 10 }}
            onClick={() => dispatch({ type: 'ackDeal', bySeat: localSeat })}
          >
            Ready →
          </button>
        ) : (
          <p style={{ color: '#94a3b8' }}>Waiting on others…</p>
        )}
      </div>
    );
  }

  if (view.phase === 'revealing') {
    const r = view.lastReveal!;
    return (
      <div className={styles.panel}>
        <h3 className={styles.h3}>
          Reveal: <span>{CREATURE_ICONS[r.card]} {CREATURE_LABELS[r.card]}</span>
        </h3>
        <p style={{ color: '#cbd5e1' }}>
          {view.seats[r.decider]?.name} called <b>{r.call}</b> on the claim of{' '}
          <b>{CREATURE_LABELS[r.pass.claim]}</b>.{' '}
          {r.callerWon ? 'They were right.' : 'They were wrong.'}{' '}
          <span style={{ color: '#fca5a5' }}>
            {view.seats[r.receiver]?.name} takes the {CREATURE_LABELS[r.card]} face-up.
          </span>
        </p>
        <button
          className={styles.primaryButton}
          disabled={!view.yourAckPending}
          onClick={() => dispatch({ type: 'ackReveal', bySeat: localSeat })}
        >
          {view.yourAckPending ? 'Continue →' : 'Acknowledged'}
        </button>
      </div>
    );
  }

  if (view.phase === 'passing') {
    if (localSeat !== view.currentSeat) {
      return (
        <div className={styles.panel}>
          <h3 className={styles.h3}>Your hand</h3>
          <YourHand view={view} />
          <p style={{ color: '#94a3b8', marginTop: 8 }}>
            Waiting for {view.seats[view.currentSeat]?.name}'s pass.
          </p>
        </div>
      );
    }
    return <PassPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
  }

  if (view.phase === 'decide') {
    if (localSeat !== view.passHolder) {
      const peek = view.yourPeekedCard;
      return (
        <div className={styles.panel}>
          <h3 className={styles.h3}>Your hand</h3>
          <YourHand view={view} />
          {peek && (
            <p style={{ color: '#a78bfa', marginTop: 8 }}>
              The card in transit is a <b>{CREATURE_ICONS[peek]} {CREATURE_LABELS[peek]}</b>.
            </p>
          )}
          <p style={{ color: '#94a3b8', marginTop: 8 }}>
            Waiting for{' '}
            {view.passHolder !== null && view.seats[view.passHolder]?.name} to decide.
          </p>
        </div>
      );
    }
    return <DecidePanel view={view} localSeat={localSeat} dispatch={dispatch} />;
  }

  return null;
}

function YourHand({ view }: { view: CockroachPokerPublicState }) {
  if (view.yourHand.length === 0) {
    return <span className={styles.empty}>—</span>;
  }
  return (
    <div className={styles.handList}>
      {view.yourHand.map((c, i) => (
        <span key={i} className={styles.handChip}>
          {CREATURE_ICONS[c]} {CREATURE_LABELS[c]}
        </span>
      ))}
    </div>
  );
}

function PassPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: CockroachPokerPublicState;
  localSeat: number;
  dispatch: (a: CockroachPokerAction) => void;
}) {
  const [handIndex, setHandIndex] = useState(0);
  const [claim, setClaim] = useState<Creature>('rat');
  const [target, setTarget] = useState<number>(
    view.players.find((p) => p.index !== localSeat && !p.lost)?.index ?? 0,
  );

  const validHandIndex = view.yourHand.length > 0 && handIndex < view.yourHand.length;
  const validTarget = view.players[target]?.lost === false && target !== localSeat;
  const valid = validHandIndex && validTarget;

  return (
    <div className={styles.panel}>
      <h3 className={styles.h3}>Pass a card</h3>
      <YourHand view={view} />
      <div className={styles.passControls}>
        <label>
          <span className={styles.controlLabel}>Card</span>
          <select
            value={handIndex}
            onChange={(e) => setHandIndex(Number(e.target.value))}
            className={styles.passSelect}
          >
            {view.yourHand.map((c, i) => (
              <option key={i} value={i}>
                {CREATURE_ICONS[c]} {CREATURE_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={styles.controlLabel}>Claim it's a</span>
          <select
            value={claim}
            onChange={(e) => setClaim(e.target.value as Creature)}
            className={styles.passSelect}
          >
            {CREATURES.map((c) => (
              <option key={c} value={c}>
                {CREATURE_ICONS[c]} {CREATURE_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={styles.controlLabel}>Send to</span>
          <select
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className={styles.passSelect}
          >
            {view.players
              .filter((p) => p.index !== localSeat && !p.lost)
              .map((p) => (
                <option key={p.index} value={p.index}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <button
          className={styles.primaryButton}
          disabled={!valid}
          onClick={() => {
            dispatch({
              type: 'startPass',
              bySeat: localSeat,
              handIndex,
              claim,
              target,
            });
          }}
        >
          Pass →
        </button>
      </div>
    </div>
  );
}

function DecidePanel({
  view,
  localSeat,
  dispatch,
}: {
  view: CockroachPokerPublicState;
  localSeat: number;
  dispatch: (a: CockroachPokerAction) => void;
}) {
  const peek = view.yourPeekedCard;
  const [peeking, setPeeking] = useState(false);
  const [newClaim, setNewClaim] = useState<Creature>('rat');
  const passOptions = view.players.filter(
    (p) => !p.lost && p.index !== localSeat && !view.passSeenBy.includes(p.index),
  );
  const [target, setTarget] = useState<number>(passOptions[0]?.index ?? 0);

  const lastHop = view.passChain[view.passChain.length - 1];
  const sender = lastHop ? view.seats[lastHop.from]?.name : 'someone';

  return (
    <div className={styles.panel}>
      <h3 className={styles.h3}>
        Decide — {sender} says this is a {view.passClaim &&
          <b>{CREATURE_ICONS[view.passClaim]} {CREATURE_LABELS[view.passClaim]}</b>}
      </h3>
      {!peeking && peek === null && (
        <>
          <div className={styles.passControls}>
            <button
              className={styles.actionButton}
              onClick={() =>
                dispatch({ type: 'decide', bySeat: localSeat, call: 'truth' })
              }
            >
              I believe you (truth)
            </button>
            <button
              className={styles.actionButtonRed}
              onClick={() =>
                dispatch({ type: 'decide', bySeat: localSeat, call: 'lie' })
              }
            >
              You're lying!
            </button>
            {passOptions.length > 0 && (
              <button
                className={styles.secondaryButton}
                onClick={() => setPeeking(true)}
              >
                Peek & pass on…
              </button>
            )}
          </div>
          <p className={styles.helperText}>
            Or — peek to learn the card and pass to someone who hasn't seen it.
          </p>
        </>
      )}
      {(peeking || peek !== null) && (
        <>
          {peek && (
            <p style={{ color: '#a78bfa', margin: '8px 0' }}>
              You peeked — the card is a{' '}
              <b>{CREATURE_ICONS[peek]} {CREATURE_LABELS[peek]}</b>.
            </p>
          )}
          <div className={styles.passControls}>
            <button
              className={styles.actionButton}
              onClick={() =>
                dispatch({ type: 'decide', bySeat: localSeat, call: 'truth' })
              }
            >
              Accept (claim is correct)
            </button>
            <button
              className={styles.actionButtonRed}
              onClick={() =>
                dispatch({ type: 'decide', bySeat: localSeat, call: 'lie' })
              }
            >
              Reject (claim is wrong)
            </button>
          </div>
          {passOptions.length > 0 && (
            <>
              <div className={styles.divider} />
              <h4 className={styles.h4}>Or pass it on</h4>
              <div className={styles.passControls}>
                <label>
                  <span className={styles.controlLabel}>Claim it's a</span>
                  <select
                    value={newClaim}
                    onChange={(e) => setNewClaim(e.target.value as Creature)}
                    className={styles.passSelect}
                  >
                    {CREATURES.map((c) => (
                      <option key={c} value={c}>
                        {CREATURE_ICONS[c]} {CREATURE_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={styles.controlLabel}>Send to</span>
                  <select
                    value={target}
                    onChange={(e) => setTarget(Number(e.target.value))}
                    className={styles.passSelect}
                  >
                    {passOptions.map((p) => (
                      <option key={p.index} value={p.index}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className={styles.primaryButton}
                  onClick={() =>
                    dispatch({
                      type: 'peekAndPass',
                      bySeat: localSeat,
                      claim: newClaim,
                      target,
                    })
                  }
                >
                  Pass →
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
