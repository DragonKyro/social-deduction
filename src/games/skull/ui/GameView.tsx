import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { SeatIndex } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import { FlipCard } from '@/ui/shared/FlipCard';
import type { SkullAction } from '../actions';
import type { Disk, PublicPlayer, SkullPhase, SkullPublicState } from '../state';
import { SkullDisk, tribeOf, WinMedal } from './DiskArt';
import { useHotSeat } from './hotseat';
import styles from './GameView.module.css';

// ============================================================================
// Skull — game view (a worn biker-bar table).
//
// Rendered purely from the redacted view: opponents' stacks are only ever
// drawn face-down (the view has just their size); faces appear for flipped
// disks (public `flips`), your own stack and hand, and — only for you — the
// disk you lost.
// ============================================================================

type Dispatch = (a: SkullAction) => void;

const SHAKE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-9px) rotate(-0.6deg)' },
  { transform: 'translateX(8px) rotate(0.6deg)' },
  { transform: 'translateX(-6px)' },
  { transform: 'translateX(4px)' },
  { transform: 'translateX(0)' },
];

function nameOf(v: SkullPublicState, seat: SeatIndex | null | undefined): string {
  if (seat === null || seat === undefined) return '—';
  return v.players.find((p) => p.index === seat)?.name ?? `Seat ${seat + 1}`;
}

function requiredSeat(v: SkullPublicState): SeatIndex | null {
  switch (v.phase) {
    case 'placeOpening':
    case 'placing':
    case 'bidding':
      return v.currentSeat;
    case 'revealing':
    case 'discarding':
    case 'chooseLeader':
      return v.challenger;
    default:
      return null;
  }
}

function tableTotal(v: SkullPublicState): number {
  return v.players.reduce((n, p) => n + p.stackSize, 0);
}

// Deterministic "hand-placed" jitter per disk so stacks look tossed, not stamped.
function jitter(seat: number, i: number, round: number) {
  const h = Math.imul(seat * 977 + i * 131 + round * 61 + 17, 2654435761) >>> 0;
  return { rot: (h % 23) - 11, dx: ((h >>> 9) % 7) - 3 };
}

function useRevealAfter(ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return on;
}

const ACTIVE_PHASES: SkullPhase[] = ['placeOpening', 'placing', 'bidding'];
const CHALLENGE_PHASES: SkullPhase[] = ['revealing', 'discarding', 'chooseLeader'];

// ============================================================================
// Root
// ============================================================================

export function SkullGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);
  const view = publicView?.view as SkullPublicState | undefined;
  const me = view?.yourSeat ?? null;
  const hot = useHotSeat(me, view ? requiredSeat(view) : null);
  const tableRef = useRef<HTMLDivElement>(null);

  const flipCount = view?.flips.length ?? 0;
  const lastFlip = view?.flips[flipCount - 1];
  const hitKey = view && lastFlip?.disk === 'skull' ? `${view.roundNumber}-${flipCount}` : null;
  useEffect(() => {
    if (!hitKey || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    tableRef.current?.animate?.(SHAKE, { duration: 560, easing: 'ease-in-out' });
  }, [hitKey]);

  if (!view) return null;
  const act: Dispatch = (a) => dispatch(a);
  const ackRound = () => {
    for (const s of hot.ackSeats(view.waitingOn)) dispatch({ type: 'ackRoundOver', bySeat: s });
  };

  const iChallenge = me !== null && view.phase === 'revealing' && view.challenger === me;
  const myStackLeft = view.yourStack.length;
  const canPickStack = (p: PublicPlayer) => iChallenge && myStackLeft === 0 && p.index !== me && p.stackSize > 0;
  const flipFrom = (seat: SeatIndex) => me !== null && act({ type: 'flipNext', bySeat: me, fromSeat: seat });

  const others = view.players.filter((p) => p.index !== me);
  const mine = me !== null ? view.players.find((p) => p.index === me) : undefined;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Skull</h2>
          <p className={styles.subtitle}>
            Round {view.roundNumber} · {view.challengeTarget} won challenge{view.challengeTarget === 1 ? '' : 's'} takes the
            bar
          </p>
        </div>
        <button onClick={exitGame} className={styles.ghostButton}>
          Leave the bar
        </button>
      </header>

      <div ref={tableRef} className={styles.table}>
        {hitKey && <div key={hitKey} className={styles.bloodFlash} aria-hidden />}
        <div className={styles.seats}>
          {others.map((p) => (
            <SeatMat key={p.index} p={p} view={view} flippable={canPickStack(p)} onFlip={() => flipFrom(p.index)} />
          ))}
        </div>
        <Board view={view} />
        {mine && <SeatMat p={mine} view={view} isMe flippable={false} onFlip={() => undefined} />}
      </div>

      {mine && <YourHand view={view} dispatch={act} />}

      <ActionBar
        view={view}
        dispatch={act}
        ackRound={ackRound}
        canAck={hot.ackSeats(view.waitingOn).length > 0}
        flipFrom={flipFrom}
        exitGame={exitGame}
      />

      {hot.showCover && hot.handoffTo !== null && (
        <div className={styles.cover} role="dialog" aria-modal="true" aria-labelledby="sk-cover-title">
          <div className={styles.coverCard}>
            <span className={styles.coverDisk}>
              <SkullDisk face="back" seat={hot.handoffTo} size="100%" />
            </span>
            <h3 id="sk-cover-title" className={styles.coverTitle}>
              Slide it over to {nameOf(view, hot.handoffTo)}
            </h3>
            <p className={styles.coverText}>Everyone else: eyes on your drink.</p>
            <button autoFocus className={styles.primaryButton} onClick={hot.accept}>
              I'm {nameOf(view, hot.handoffTo)} — show me
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Seat mats
// ============================================================================

function SeatMat({
  p,
  view,
  isMe = false,
  flippable,
  onFlip,
}: {
  p: PublicPlayer;
  view: SkullPublicState;
  isMe?: boolean;
  flippable: boolean;
  onFlip: () => void;
}) {
  const tribe = tribeOf(p.index);
  const flips = view.flips.map((f, i) => ({ ...f, i })).filter((f) => f.seat === p.index);
  const active = view.currentSeat === p.index && ACTIVE_PHASES.includes(view.phase) && !p.eliminated;
  const challenger = view.challenger === p.index && (CHALLENGE_PHASES.includes(view.phase) || view.phase === 'roundOver');
  let lastBid: number | 'pass' | null = null;
  for (const b of view.bidLog) if (b.seat === p.index) lastBid = b.bid;
  const lost = view.phase === 'roundOver' || view.phase === 'gameOver' ? view.lastRound : null;
  const lostHere = lost && !lost.success && lost.loserSeat === p.index;

  const cls = [
    styles.mat,
    isMe ? styles.matMe : '',
    active ? styles.matActive : '',
    challenger ? styles.matChallenger : '',
    p.wins > 0 ? styles.matFlipped : '',
    p.eliminated ? styles.matOut : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} style={{ '--tribe': tribe.tint, '--tribe-light': tribe.light } as CSSProperties}>
      <div className={styles.matHead}>
        <span className={styles.matName}>
          {p.name}
          {isMe && <span className={styles.youTag}> (you)</span>}
        </span>
        <span className={styles.medals} aria-label={`${p.wins} of ${view.challengeTarget} challenges won`}>
          {Array.from({ length: view.challengeTarget }, (_, i) => (
            <span key={`${i}-${i < p.wins}`} className={i < p.wins ? styles.medalNew : undefined}>
              <WinMedal won={i < p.wins} />
            </span>
          ))}
        </span>
      </div>

      <div className={styles.felt}>
        <Stack p={p} view={view} flippable={flippable} onFlip={onFlip} />
        <div className={styles.faceUp} aria-label={`Flipped: ${flips.map((f) => f.disk).join(', ') || 'none'}`}>
          {flips.map((f) => (
            <FlippedDisk key={`${view.roundNumber}-${f.i}`} seat={p.index} disk={f.disk} />
          ))}
        </div>
        {lostHere && <LostDisk seat={p.index} disk={view.yourSeat === p.index ? lost!.diskLost : null} />}
      </div>

      <div className={styles.matFoot}>
        <span className={styles.handDots} aria-label={`${p.handCount} disk${p.handCount === 1 ? '' : 's'} in hand, ${p.disksTotal} owned`}>
          {Array.from({ length: p.disksTotal }, (_, i) => (
            <span key={i} className={i < p.handCount ? styles.dotIn : styles.dotOut} />
          ))}
        </span>
        {challenger ? (
          <span className={`${styles.bubble} ${styles.bubbleHot}`}>challenger</span>
        ) : lastBid === 'pass' ? (
          <span className={`${styles.bubble} ${styles.bubbleMuted}`}>pass</span>
        ) : lastBid !== null ? (
          <span key={`bid-${lastBid}`} className={styles.bubble}>
            bid {lastBid}
          </span>
        ) : active ? (
          <span className={styles.bubble}>…</span>
        ) : null}
      </div>
      {p.eliminated && <span className={styles.outStamp}>Out</span>}
    </div>
  );
}

function Stack({
  p,
  view,
  flippable,
  onFlip,
}: {
  p: PublicPlayer;
  view: SkullPublicState;
  flippable: boolean;
  onFlip: () => void;
}) {
  const own = view.yourSeat === p.index ? view.yourStack : null;
  const n = p.stackSize;
  const pile = (
    <span className={styles.stack} style={{ '--n': n } as CSSProperties}>
      {n === 0 && <span className={styles.stackEmpty} />}
      {Array.from({ length: n }, (_, i) => {
        const j = jitter(p.index, i, view.roundNumber);
        return (
          <span
            key={`${view.roundNumber}-${i}`}
            className={styles.stackDisk}
            style={{ '--i': i, '--rot': `${j.rot}deg`, '--dx': `${j.dx}px` } as CSSProperties}
          >
            <SkullDisk face="back" seat={p.index} size="100%" />
          </span>
        );
      })}
    </span>
  );
  return (
    <div className={styles.stackCol}>
      {flippable ? (
        <button type="button" className={styles.stackButton} onClick={onFlip} aria-label={`Flip ${p.name}'s top disk`}>
          {pile}
          <span className={styles.flipHint}>flip</span>
        </button>
      ) : (
        pile
      )}
      {own && own.length > 0 && (
        <span className={styles.ownOrder} aria-label={`Your stack, top first: ${own.slice().reverse().join(', ')}`}>
          {own
            .slice()
            .reverse()
            .map((d, i) => (
              <span key={i} className={d === 'skull' ? styles.ownSkull : styles.ownRose} title={i === 0 ? `top: ${d}` : d}>
                {d === 'skull' ? '☠' : '✿'}
              </span>
            ))}
        </span>
      )}
    </div>
  );
}

function FlippedDisk({ seat, disk }: { seat: SeatIndex; disk: Disk }) {
  const shown = useRevealAfter(80);
  return (
    <span className={`${styles.flipped} ${disk === 'skull' ? styles.flippedSkull : styles.flippedRose}`}>
      <FlipCard
        revealed={shown}
        front={<SkullDisk face={disk} seat={seat} size="100%" />}
        back={<SkullDisk face="back" seat={seat} size="100%" />}
        width="var(--sk-disk)"
        height="var(--sk-disk)"
        radius={999}
      />
    </span>
  );
}

function LostDisk({ seat, disk }: { seat: SeatIndex; disk: Disk | null }) {
  return (
    <span className={styles.lost} title={disk ? `You lost a ${disk}` : 'A disk was lost face-down'}>
      <SkullDisk face={disk ?? 'back'} seat={seat} size="100%" />
    </span>
  );
}

// ============================================================================
// Centre board: bid, challenge progress, outcome
// ============================================================================

function Board({ view }: { view: SkullPublicState }) {
  const table = tableTotal(view);
  let body: ReactNode = null;
  switch (view.phase) {
    case 'placeOpening':
      body = (
        <>
          <span className={styles.boardLabel}>Opening round</span>
          <p className={styles.boardText}>Everyone lays one disk face-down. {nameOf(view, view.currentSeat)} is placing.</p>
        </>
      );
      break;
    case 'placing':
      body = (
        <>
          <span className={styles.boardLabel}>On the table</span>
          <span key={table} className={styles.bigNumber}>
            {table}
          </span>
          <p className={styles.boardText}>{nameOf(view, view.currentSeat)}: add a disk or open the bidding.</p>
        </>
      );
      break;
    case 'bidding':
      body = (
        <>
          <span className={styles.boardLabel}>Current bid</span>
          <span key={view.currentBid} className={`${styles.bigNumber} ${styles.bidPop}`}>
            {view.currentBid}
          </span>
          <p className={styles.boardText}>
            by {nameOf(view, view.currentBidder)} · {table} on the table · {nameOf(view, view.currentSeat)} to act
          </p>
        </>
      );
      break;
    case 'revealing': {
      const got = view.currentBid - view.flipsRemaining;
      body = (
        <>
          <span className={styles.boardLabel}>{nameOf(view, view.challenger)} must flip {view.currentBid}</span>
          <span className={styles.pips} aria-label={`${got} of ${view.currentBid} roses flipped`}>
            {Array.from({ length: view.currentBid }, (_, i) => (
              <span key={`${i}-${i < got}`} className={i < got ? styles.pipOn : styles.pipOff}>
                ✿
              </span>
            ))}
          </span>
          <p className={styles.boardText}>
            {view.ownStackCleared ? 'Own stack done — now the others.' : 'Their own stack comes first.'}
          </p>
        </>
      );
      break;
    }
    case 'discarding':
      body = (
        <>
          <span className={`${styles.boardLabel} ${styles.boardBad}`}>Own skull!</span>
          <p className={styles.boardText}>{nameOf(view, view.challenger)} chooses a disk to discard, face-down.</p>
        </>
      );
      break;
    case 'chooseLeader':
      body = (
        <>
          <span className={`${styles.boardLabel} ${styles.boardBad}`}>Knocked out</span>
          <p className={styles.boardText}>{nameOf(view, view.challenger)} picks who starts the next round.</p>
        </>
      );
      break;
    case 'roundOver':
    case 'gameOver':
      body = <Outcome view={view} />;
      break;
  }
  return (
    <div className={styles.board} aria-live="polite">
      {body}
    </div>
  );
}

function Outcome({ view }: { view: SkullPublicState }) {
  const r = view.lastRound;
  if (!r) return null;
  const me = view.yourSeat;
  const c = nameOf(view, r.challenger);
  const over = view.phase === 'gameOver';
  return (
    <div className={styles.outcome}>
      {r.success ? (
        <span className={styles.flourish} aria-hidden>
          <span className={styles.rays} />
          <SkullDisk face="rose" seat={r.challenger} size="100%" />
        </span>
      ) : (
        <span className={styles.skullHit} aria-hidden>
          <SkullDisk face="skull" seat={r.skullOwner ?? r.challenger} size="100%" />
        </span>
      )}
      <span className={`${styles.stamp} ${r.success ? styles.stampGold : styles.stampRed}`}>
        {r.success ? 'Challenge won!' : 'Skull!'}
      </span>
      <p className={styles.boardText}>
        {r.success
          ? `${c} flipped ${r.bid} rose${r.bid === 1 ? '' : 's'}.`
          : r.skullOwner === r.challenger
            ? `${c} hit their own skull${me === r.loserSeat && r.diskLost ? ` and discarded a ${r.diskLost}` : ' and discarded a disk face-down'}.`
            : `${c} hit ${nameOf(view, r.skullOwner)}'s skull and lost ${me === r.loserSeat && r.diskLost ? `a ${r.diskLost}` : 'a disk'} at random${me === r.loserSeat ? '' : ' (face-down)'}.`}
        {r.eliminatedSeat !== null && ` ${nameOf(view, r.eliminatedSeat)} is out of disks.`}
      </p>
      {over ? (
        <p className={styles.winner}>{view.matchWinners.map((s) => nameOf(view, s)).join(' & ')} takes the bar!</p>
      ) : (
        r.nextLeader !== null && <p className={styles.boardText}>{nameOf(view, r.nextLeader)} starts the next round.</p>
      )}
    </div>
  );
}

// ============================================================================
// Your hand
// ============================================================================

function YourHand({ view, dispatch }: { view: SkullPublicState; dispatch: Dispatch }) {
  const me = view.yourSeat;
  if (me === null) return null;
  const placing = (view.phase === 'placeOpening' || view.phase === 'placing') && view.currentSeat === me;
  const { roses, skulls } = view.yourRemaining;
  const place = (disk: Disk) => dispatch({ type: 'placeDisk', bySeat: me, disk });
  const group = (disk: Disk, count: number) => (
    <button
      type="button"
      className={`${styles.handGroup} ${placing && count > 0 ? styles.handGroupLive : ''}`}
      disabled={!placing || count === 0}
      onClick={() => place(disk)}
      aria-label={`${placing ? 'Place a ' : ''}${disk} (${count} in hand)`}
    >
      <span className={styles.handPile}>
        {count === 0 && <span className={styles.handNone}>none</span>}
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className={styles.handDisk} style={{ '--i': i } as CSSProperties}>
            <SkullDisk face={disk} seat={me} size="100%" />
          </span>
        ))}
      </span>
      <span className={styles.handLabel}>
        {count} {disk}
        {count === 1 ? '' : 's'}
      </span>
    </button>
  );
  return (
    <div className={styles.hand}>
      <span className={styles.handTitle}>Your hand</span>
      {group('rose', roses)}
      {group('skull', skulls)}
    </div>
  );
}

// ============================================================================
// Action bar
// ============================================================================

function BidStepper({ min, max, label, onSubmit }: { min: number; max: number; label: string; onSubmit: (n: number) => void }) {
  const [n, setN] = useState(min);
  const v = Math.min(max, Math.max(min, n));
  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <button type="button" className={styles.stepButton} disabled={v <= min} onClick={() => setN(v - 1)} aria-label="Lower the bid">
        −
      </button>
      <span key={v} className={styles.stepValue} aria-live="polite">
        {v}
      </span>
      <button type="button" className={styles.stepButton} disabled={v >= max} onClick={() => setN(v + 1)} aria-label="Raise the bid">
        +
      </button>
      <button type="button" className={styles.primaryButton} onClick={() => onSubmit(v)}>
        {label} {v}
      </button>
    </div>
  );
}

function ActionBar({
  view,
  dispatch,
  ackRound,
  canAck,
  flipFrom,
  exitGame,
}: {
  view: SkullPublicState;
  dispatch: Dispatch;
  ackRound: () => void;
  canAck: boolean;
  flipFrom: (s: SeatIndex) => void;
  exitGame: () => void;
}) {
  const me = view.yourSeat;
  const table = tableTotal(view);
  const myTurn = me !== null && view.currentSeat === me;
  const iChallenge = me !== null && view.challenger === me;
  let content: ReactNode;

  switch (view.phase) {
    case 'placeOpening':
      content = myTurn ? (
        <p className={styles.barText}>Lay your opening disk face-down — tap a rose or your skull.</p>
      ) : (
        <p className={styles.barText}>{nameOf(view, view.currentSeat)} is laying a disk…</p>
      );
      break;
    case 'placing': {
      if (!myTurn) {
        content = <p className={styles.barText}>{nameOf(view, view.currentSeat)} is deciding…</p>;
        break;
      }
      const empty = view.yourRemaining.roses + view.yourRemaining.skulls === 0;
      content = (
        <>
          <p className={styles.barText}>{empty ? "You've played every disk — you must bid." : 'Add a disk from your hand, or open the bidding:'}</p>
          <BidStepper
            key={`open-${table}`}
            min={1}
            max={table}
            label="Bid"
            onSubmit={(bid) => me !== null && dispatch({ type: 'openBid', bySeat: me, bid })}
          />
        </>
      );
      break;
    }
    case 'bidding': {
      if (!myTurn || me === null || view.passed[me]) {
        content = <p className={styles.barText}>{nameOf(view, view.currentSeat)} must raise or pass…</p>;
        break;
      }
      content = (
        <>
          <BidStepper
            key={`raise-${view.currentBid}`}
            min={view.currentBid + 1}
            max={table}
            label="Raise to"
            onSubmit={(bid) => dispatch({ type: 'raiseBid', bySeat: me, bid })}
          />
          <button type="button" className={styles.ghostButton} onClick={() => dispatch({ type: 'passBid', bySeat: me })}>
            Pass
          </button>
        </>
      );
      break;
    }
    case 'revealing': {
      if (!iChallenge || me === null) {
        content = <p className={styles.barText}>{nameOf(view, view.challenger)} is flipping…</p>;
        break;
      }
      if (view.yourStack.length > 0) {
        content = (
          <button type="button" className={styles.primaryButton} onClick={() => dispatch({ type: 'flipNext', bySeat: me })}>
            Flip your top disk ({view.yourStack.length} left in your stack)
          </button>
        );
        break;
      }
      const opts = view.players.filter((p) => p.index !== me && p.stackSize > 0);
      content = (
        <div className={styles.chips} role="group" aria-label="Flip from">
          <span className={styles.barText}>{view.flipsRemaining} more — flip from:</span>
          {opts.map((p) => (
            <button key={p.index} type="button" className={styles.chip} onClick={() => flipFrom(p.index)}>
              {p.name} ({p.stackSize})
            </button>
          ))}
        </div>
      );
      break;
    }
    case 'discarding': {
      if (!iChallenge || me === null) {
        content = <p className={styles.barText}>{nameOf(view, view.challenger)} is choosing a disk to discard…</p>;
        break;
      }
      const { roses, skulls } = view.yourRemaining;
      content = (
        <>
          <p className={styles.barText}>Your own skull. Discard one disk — nobody else will see which:</p>
          <button type="button" className={styles.chip} disabled={roses === 0} onClick={() => dispatch({ type: 'discardDisk', bySeat: me, disk: 'rose' })}>
            ✿ a rose ({roses})
          </button>
          <button type="button" className={styles.chip} disabled={skulls === 0} onClick={() => dispatch({ type: 'discardDisk', bySeat: me, disk: 'skull' })}>
            ☠ my skull ({skulls})
          </button>
        </>
      );
      break;
    }
    case 'chooseLeader': {
      if (!iChallenge || me === null) {
        content = <p className={styles.barText}>{nameOf(view, view.challenger)} is choosing who starts…</p>;
        break;
      }
      content = (
        <div className={styles.chips} role="group" aria-label="Who starts the next round">
          <span className={styles.barText}>You're out. Who starts next round?</span>
          {view.players
            .filter((p) => !p.eliminated)
            .map((p) => (
              <button key={p.index} type="button" className={styles.chip} onClick={() => dispatch({ type: 'chooseLeader', bySeat: me, seat: p.index })}>
                {p.name}
              </button>
            ))}
        </div>
      );
      break;
    }
    case 'roundOver':
      content = (
        <button type="button" className={styles.primaryButton} disabled={!canAck} onClick={ackRound}>
          {canAck ? 'Next round' : `Waiting for ${view.waitingOn.map((s) => nameOf(view, s)).join(', ')}…`}
        </button>
      );
      break;
    case 'gameOver':
      content = (
        <button type="button" className={styles.primaryButton} onClick={exitGame}>
          Back to the menu
        </button>
      );
      break;
  }
  return <div className={styles.bar}>{content}</div>;
}
