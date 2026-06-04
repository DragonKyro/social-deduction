import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { LiarsDiceAction } from '../actions';
import type {
  Bid,
  DieFace,
  LiarsDicePublicState,
  PublicPlayer,
} from '../state';
import styles from './GameView.module.css';

export function LiarsDiceGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);

  if (!publicView) return null;
  const view = publicView.view as LiarsDicePublicState;
  const dispatchAction = (a: LiarsDiceAction) => dispatch(a);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Liar's Dice</h2>
          <p className={styles.subtitle}>
            Round {view.roundNumber} · {view.totalDice} dice in play
            {view.wildOnes ? ' · 1s wild' : ''}
            {view.spotOn ? ' · spot-on on' : ''}
          </p>
        </div>
        <button onClick={exitGame} className={styles.secondaryButton}>
          Exit
        </button>
      </header>

      <Board view={view} localSeat={localSeat} onPickSeat={setLocalSeat} />

      <BidStrip view={view} />

      <PhasePanel view={view} localSeat={localSeat} dispatch={dispatchAction} />
    </div>
  );
}

function Board({
  view,
  localSeat,
  onPickSeat,
}: {
  view: LiarsDicePublicState;
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
  view: LiarsDicePublicState;
  isLocal: boolean;
  onPick: () => void;
}) {
  const isActive = p.index === view.currentSeat;
  const isBidder = p.index === view.currentBidder;
  const classes = [
    styles.seatPanel,
    isActive ? styles.active : '',
    isLocal ? styles.localSeat : '',
    p.eliminated ? styles.eliminatedSeat : '',
    isBidder ? styles.bidder : '',
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
            {p.eliminated && <span className={styles.statusBad}>out</span>}
            {isActive && !p.eliminated && (
              <span className={styles.statusActive}>turn</span>
            )}
            {isBidder && !p.eliminated && !isActive && (
              <span className={styles.statusMuted}>high bidder</span>
            )}
          </div>
        </div>
        <div className={styles.seatTokens}>
          <div className={styles.tokenCount}>{p.diceCount}</div>
          <div className={styles.tokenLabel}>dice</div>
        </div>
      </div>

      <div className={styles.diceRow}>
        {isLocal ? (
          <YourDice view={view} />
        ) : (
          <RevealedOrBacks view={view} seatIndex={p.index} count={p.diceCount} />
        )}
      </div>

      {!isLocal && (
        <button onClick={onPick} className={styles.passButton}>
          look from this seat
        </button>
      )}
    </div>
  );
}

function YourDice({ view }: { view: LiarsDicePublicState }) {
  if (view.yourDice.length === 0) {
    return <span className={styles.empty}>—</span>;
  }
  return (
    <div className={styles.diceList}>
      {view.yourDice.map((d, i) => (
        <DieChip key={i} face={d} />
      ))}
    </div>
  );
}

function RevealedOrBacks({
  view,
  seatIndex,
  count,
}: {
  view: LiarsDicePublicState;
  seatIndex: number;
  count: number;
}) {
  if (count === 0) return <span className={styles.empty}>—</span>;
  // During reveal/roundOver, show the actual dice.
  if (view.phase === 'revealing' || view.phase === 'roundOver') {
    const dice = view.lastReveal?.allDice[seatIndex];
    if (dice) {
      return (
        <div className={styles.diceList}>
          {dice.map((d, i) => (
            <DieChip key={i} face={d} />
          ))}
        </div>
      );
    }
  }
  return (
    <div className={styles.diceList}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={styles.dieBack} />
      ))}
    </div>
  );
}

function DieChip({ face, highlighted }: { face: DieFace; highlighted?: boolean }) {
  return (
    <span
      className={`${styles.dieChip} ${highlighted ? styles.dieHighlighted : ''}`}
      title={String(face)}
    >
      {face}
    </span>
  );
}

function BidStrip({ view }: { view: LiarsDicePublicState }) {
  if (view.phase === 'rollPending') {
    const acked = view.players.filter((p) => !p.eliminated && p.rollAcked).length;
    const total = view.players.filter((p) => !p.eliminated).length;
    return (
      <div className={styles.bidStrip}>
        <span className={styles.bidLabel}>Waiting for rolls:</span>
        <span>{acked}/{total} ready</span>
      </div>
    );
  }
  if (!view.currentBid) {
    return (
      <div className={styles.bidStrip}>
        <span className={styles.bidLabel}>Current bid:</span>
        <span>—</span>
      </div>
    );
  }
  return (
    <div className={styles.bidStrip}>
      <span className={styles.bidLabel}>Current bid:</span>
      <b>{view.currentBid.count} × {view.currentBid.face}s</b>
      <span>by {view.currentBidder !== null && view.seats[view.currentBidder]?.name}</span>
    </div>
  );
}

function PhasePanel({
  view,
  localSeat,
  dispatch,
}: {
  view: LiarsDicePublicState;
  localSeat: number | null;
  dispatch: (a: LiarsDiceAction) => void;
}) {
  if (view.phase === 'gameOver') {
    const winners = view.matchWinners
      .map((i) => view.seats[i]?.name)
      .filter(Boolean)
      .join(', ');
    return (
      <div className={styles.panel}>
        <h3 className={styles.h3}>Match over</h3>
        <p>Winner: <b>{winners || '(none)'}</b></p>
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

  if (view.phase === 'rollPending') {
    const pending = view.yourAckPending;
    return (
      <div className={styles.panel}>
        <h3 className={styles.h3}>Your dice</h3>
        <YourDice view={view} />
        {pending ? (
          <button
            className={styles.primaryButton}
            style={{ marginTop: 10 }}
            onClick={() => dispatch({ type: 'ackRoll', bySeat: localSeat })}
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
          {r.kind === 'liar' ? 'Liar called' : 'Spot-on called'} —{' '}
          {r.callerWon ? 'caller wins' : 'caller loses'}
        </h3>
        <p style={{ margin: '4px 0', color: '#cbd5e1' }}>
          Bid: <b>{r.bid.count} × {r.bid.face}s</b>. Actual:{' '}
          <b>{r.actual} × {r.bid.face}s</b> {view.wildOnes && r.bid.face !== 1 ? '(1s wild)' : ''}
        </p>
        <p style={{ color: '#fca5a5' }}>
          {view.seats[r.loserSeat]?.name} loses a die.
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

  if (view.phase === 'roundOver') {
    return (
      <div className={styles.panel}>
        <h3 className={styles.h3}>Round over</h3>
        <p style={{ color: '#cbd5e1' }}>Reroll up next.</p>
        <button
          className={styles.primaryButton}
          disabled={!view.yourAckPending}
          onClick={() => dispatch({ type: 'ackRoundOver', bySeat: localSeat })}
        >
          {view.yourAckPending ? 'Reroll →' : 'Acknowledged'}
        </button>
      </div>
    );
  }

  if (view.phase === 'bidding') {
    if (localSeat !== view.currentSeat) {
      return (
        <div className={styles.panel}>
          <p style={{ color: '#94a3b8' }}>
            Waiting for {view.seats[view.currentSeat]?.name}…
          </p>
        </div>
      );
    }
    return <BidPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
  }

  return null;
}

function BidPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: LiarsDicePublicState;
  localSeat: number;
  dispatch: (a: LiarsDiceAction) => void;
}) {
  const prev = view.currentBid;
  const cap = view.totalDice;
  const defaultBid: Bid = prev
    ? prev.face < 6
      ? { count: prev.count, face: (prev.face + 1) as DieFace }
      : { count: Math.min(cap, prev.count + 1), face: 2 }
    : { count: 1, face: 2 };
  const [count, setCount] = useState(defaultBid.count);
  const [face, setFace] = useState<DieFace>(defaultBid.face);

  const valid = (() => {
    if (count < 1 || count > cap) return false;
    if (!prev) return true;
    if (count > prev.count) return true;
    if (count === prev.count && face > prev.face) return true;
    return false;
  })();

  return (
    <div className={styles.panel}>
      <h3 className={styles.h3}>Your bid</h3>
      <div className={styles.bidControls}>
        <label>
          <span className={styles.controlLabel}>Count</span>
          <input
            type="number"
            min={1}
            max={cap}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(cap, Number(e.target.value) || 1)))}
            className={styles.bidInput}
          />
        </label>
        <label>
          <span className={styles.controlLabel}>Face</span>
          <select
            value={face}
            onChange={(e) => setFace(Number(e.target.value) as DieFace)}
            className={styles.bidSelect}
          >
            {[1, 2, 3, 4, 5, 6].map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
        <button
          className={styles.primaryButton}
          disabled={!valid}
          onClick={() => dispatch({ type: 'placeBid', bySeat: localSeat, bid: { count, face } })}
        >
          Bid {count} × {face}s
        </button>
      </div>
      {prev && (
        <div className={styles.bidControls} style={{ marginTop: 8 }}>
          <button
            className={styles.actionButtonRed}
            onClick={() => dispatch({ type: 'call', bySeat: localSeat, kind: 'liar' })}
          >
            Call liar
          </button>
          {view.spotOn && (
            <button
              className={styles.actionButton}
              onClick={() => dispatch({ type: 'call', bySeat: localSeat, kind: 'spotOn' })}
            >
              Spot on
            </button>
          )}
        </div>
      )}
    </div>
  );
}
