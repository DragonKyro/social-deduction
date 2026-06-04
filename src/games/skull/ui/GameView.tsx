import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { SkullAction } from '../actions';
import type {
  Disk,
  PublicPlayer,
  SkullPublicState,
} from '../state';
import styles from './GameView.module.css';

// Skull game view. Phase machine drives the action panel below the board.
// Board shows every seat with their stack (face-down for opponents), the
// stash count, wins, and any bidding state.

export function SkullGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);

  if (!publicView) return null;
  const view = publicView.view as SkullPublicState;
  const dispatchAction = (a: SkullAction) => dispatch(a);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Skull</h2>
          <p className={styles.subtitle}>
            Round {view.roundNumber} · first to {view.challengeTarget} challenge
            {view.challengeTarget === 1 ? '' : 's'}
          </p>
        </div>
        <button onClick={exitGame} className={styles.secondaryButton}>
          Exit
        </button>
      </header>

      <Board view={view} localSeat={localSeat} onPickSeat={setLocalSeat} />

      <PhasePanel view={view} localSeat={localSeat} dispatch={dispatchAction} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

function Board({
  view,
  localSeat,
  onPickSeat,
}: {
  view: SkullPublicState;
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
  view: SkullPublicState;
  isLocal: boolean;
  onPick: () => void;
}) {
  const isActive = p.index === view.currentSeat;
  const isChallenger = p.index === view.challenger;
  const classes = [
    styles.seatPanel,
    isActive ? styles.active : '',
    isLocal ? styles.localSeat : '',
    p.eliminated ? styles.eliminatedSeat : '',
    isChallenger ? styles.challenger : '',
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
            {isChallenger && !p.eliminated && (
              <span className={styles.statusActive}>challenger</span>
            )}
            {isActive && !p.eliminated && !isChallenger && (
              <span className={styles.statusActive}>turn</span>
            )}
            {view.passed[p.index] && (
              <span className={styles.statusMuted}>passed</span>
            )}
          </div>
        </div>
        <div className={styles.seatTokens}>
          <div className={styles.tokenCount}>
            {p.wins}/{view.challengeTarget}
          </div>
          <div className={styles.tokenLabel}>wins</div>
        </div>
      </div>

      <div className={styles.stackRow}>
        <span className={styles.stackLabel}>stack:</span>
        {isLocal ? <YourStackStrip view={view} /> : <OpponentStack p={p} />}
      </div>

      <div className={styles.stashRow}>
        <span className={styles.stashLabel}>disks:</span>
        <span>{p.disksTotal}</span>
      </div>

      {!isLocal && (
        <button onClick={onPick} className={styles.passButton}>
          look from this seat
        </button>
      )}
    </div>
  );
}

function YourStackStrip({ view }: { view: SkullPublicState }) {
  if (view.yourStack.length === 0) {
    return <span className={styles.empty}>—</span>;
  }
  return (
    <div className={styles.stackChips}>
      {view.yourStack.map((d, i) => (
        <DiskChip key={i} disk={d} />
      ))}
    </div>
  );
}

function OpponentStack({ p }: { p: PublicPlayer }) {
  if (p.stackSize === 0) return <span className={styles.empty}>—</span>;
  return (
    <div className={styles.stackChips}>
      {Array.from({ length: p.stackSize }, (_, i) => (
        <span key={i} className={styles.diskBack} />
      ))}
    </div>
  );
}

function DiskChip({ disk }: { disk: Disk }) {
  return (
    <span
      className={`${styles.diskChip} ${disk === 'skull' ? styles.diskSkull : styles.diskRose}`}
      title={disk}
    >
      {disk === 'skull' ? '☠' : '✿'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Phase panel
// ---------------------------------------------------------------------------

function PhasePanel({
  view,
  localSeat,
  dispatch,
}: {
  view: SkullPublicState;
  localSeat: number | null;
  dispatch: (a: SkullAction) => void;
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

  if (view.phase === 'roundOver') {
    const last = view.lastRound;
    if (!last) return null;
    const yourAck = localSeat !== null ? view.yourAckPending : false;
    return (
      <div className={styles.panel}>
        <h3 className={styles.h3}>
          {last.success ? 'Challenge succeeded!' : 'Challenge failed!'}
        </h3>
        <p style={{ margin: '0 0 8px', color: '#cbd5e1' }}>
          <b>{view.seats[last.challenger]?.name}</b> bid {last.bid}.
        </p>
        <div className={styles.flipList}>
          {last.flips.map((f, i) => (
            <div key={i} className={styles.flipItem}>
              <span>{view.seats[f.seat]?.name}</span>
              <DiskChip disk={f.disk} />
            </div>
          ))}
        </div>
        {!last.success && last.loserSeat !== null && (
          <p style={{ marginTop: 8, color: '#fca5a5' }}>
            {view.seats[last.loserSeat]?.name} loses a {last.diskLost}.
          </p>
        )}
        {last.success && (
          <p style={{ marginTop: 8, color: '#86efac' }}>
            {view.seats[last.challenger]?.name} gains a challenge counter.
          </p>
        )}
        {localSeat !== null && (
          <button
            className={styles.primaryButton}
            disabled={!yourAck}
            onClick={() =>
              dispatch({ type: 'ackRoundOver', bySeat: localSeat })
            }
          >
            {yourAck ? 'Continue →' : 'Acknowledged'}
          </button>
        )}
      </div>
    );
  }

  // For interactive phases, only show actions when localSeat is the
  // currentSeat / challenger.
  if (localSeat === null) {
    return (
      <div className={styles.panel}>
        <p style={{ color: '#94a3b8' }}>Pick a seat above to play from.</p>
      </div>
    );
  }

  if (view.phase === 'placeOpening' || view.phase === 'placing') {
    if (localSeat !== view.currentSeat) {
      return (
        <div className={styles.panel}>
          <p style={{ color: '#94a3b8' }}>
            Waiting for {view.seats[view.currentSeat]?.name} to{' '}
            {view.phase === 'placeOpening' ? 'place an opening disk' : 'place a disk or open a bid'}.
          </p>
        </div>
      );
    }
    const totalOnTable = view.players.reduce((s, p) => s + p.stackSize, 0);
    return (
      <div className={styles.panel}>
        <h3 className={styles.h3}>
          {view.phase === 'placeOpening' ? 'Place opening disk' : 'Place a disk or open the bid'}
        </h3>
        <div className={styles.actionRow}>
          <button
            className={styles.actionButton}
            disabled={view.yourRemaining.roses === 0}
            onClick={() => dispatch({ type: 'placeDisk', bySeat: localSeat, disk: 'rose' })}
          >
            Place rose ✿
          </button>
          <button
            className={styles.actionButtonRed}
            disabled={view.yourRemaining.skulls === 0}
            onClick={() => dispatch({ type: 'placeDisk', bySeat: localSeat, disk: 'skull' })}
          >
            Place skull ☠
          </button>
          {view.phase === 'placing' && totalOnTable > 0 && (
            <OpenBidPicker
              max={totalOnTable}
              onBid={(bid) => dispatch({ type: 'openBid', bySeat: localSeat, bid })}
            />
          )}
        </div>
        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>
          Stash: {view.yourRemaining.roses} rose{view.yourRemaining.roses === 1 ? '' : 's'} · {view.yourRemaining.skulls} skull
          {view.yourRemaining.skulls === 1 ? '' : 's'}
        </p>
      </div>
    );
  }

  if (view.phase === 'bidding') {
    const totalOnTable = view.players.reduce((s, p) => s + p.stackSize, 0);
    if (localSeat !== view.currentSeat || view.passed[localSeat]) {
      return (
        <div className={styles.panel}>
          <p style={{ color: '#94a3b8' }}>
            Current bid: <b>{view.currentBid}</b> by {view.currentBidder !== null && view.seats[view.currentBidder]?.name}.
          </p>
        </div>
      );
    }
    return (
      <div className={styles.panel}>
        <h3 className={styles.h3}>Your bid (current: {view.currentBid})</h3>
        <div className={styles.actionRow}>
          <RaisePicker
            min={view.currentBid + 1}
            max={totalOnTable}
            onRaise={(bid) => dispatch({ type: 'raiseBid', bySeat: localSeat, bid })}
          />
          <button
            className={styles.secondaryButton}
            onClick={() => dispatch({ type: 'passBid', bySeat: localSeat })}
          >
            Pass
          </button>
        </div>
      </div>
    );
  }

  if (view.phase === 'revealing') {
    if (localSeat !== view.challenger) {
      return (
        <div className={styles.panel}>
          <h3 className={styles.h3}>Challenge in progress</h3>
          <p style={{ color: '#94a3b8' }}>
            {view.challenger !== null && view.seats[view.challenger]?.name} must flip{' '}
            {view.flipsRemaining} more rose{view.flipsRemaining === 1 ? '' : 's'}.
          </p>
          <FlipHistory view={view} />
        </div>
      );
    }
    // It's our flip.
    const ourStackSize = view.yourStack.length;
    const needsFromSeat =
      view.ownStackCleared || ourStackSize === 0;
    return (
      <div className={styles.panel}>
        <h3 className={styles.h3}>Your challenge — {view.flipsRemaining} more</h3>
        <FlipHistory view={view} />
        {!needsFromSeat ? (
          <button
            className={styles.primaryButton}
            onClick={() => dispatch({ type: 'flipNext', bySeat: localSeat })}
          >
            Flip own top ({ourStackSize} left)
          </button>
        ) : (
          <div className={styles.actionRow}>
            {view.players
              .filter((p) => p.index !== localSeat && p.stackSize > 0)
              .map((p) => (
                <button
                  key={p.index}
                  className={styles.actionButton}
                  onClick={() =>
                    dispatch({
                      type: 'flipNext',
                      bySeat: localSeat,
                      fromSeat: p.index,
                    })
                  }
                >
                  Flip {p.name}'s ({p.stackSize})
                </button>
              ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function FlipHistory({ view }: { view: SkullPublicState }) {
  if (view.flips.length === 0) return null;
  return (
    <div className={styles.flipList}>
      {view.flips.map((f, i) => (
        <div key={i} className={styles.flipItem}>
          <span>{view.seats[f.seat]?.name}</span>
          <DiskChip disk={f.disk} />
        </div>
      ))}
    </div>
  );
}

function OpenBidPicker({ max, onBid }: { max: number; onBid: (bid: number) => void }) {
  const [bid, setBid] = useState(1);
  return (
    <div className={styles.bidPicker}>
      <input
        type="number"
        min={1}
        max={max}
        value={bid}
        onChange={(e) => setBid(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
        className={styles.bidInput}
      />
      <button className={styles.actionButton} onClick={() => onBid(bid)}>
        Open bid →
      </button>
    </div>
  );
}

function RaisePicker({
  min,
  max,
  onRaise,
}: {
  min: number;
  max: number;
  onRaise: (bid: number) => void;
}) {
  const [bid, setBid] = useState(min);
  return (
    <div className={styles.bidPicker}>
      <input
        type="number"
        min={min}
        max={max}
        value={bid}
        onChange={(e) => setBid(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className={styles.bidInput}
      />
      <button
        className={styles.primaryButton}
        disabled={bid < min || bid > max}
        onClick={() => onRaise(bid)}
      >
        Raise to {bid}
      </button>
    </div>
  );
}
