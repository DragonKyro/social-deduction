import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { SeatIndex } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import type { LiarsDiceAction } from '../actions';
import { FACES, dieMatches, isLegalRaise, minCountFor } from '../rules';
import type { Bid, DieFace, LiarsDicePublicState, PublicPlayer } from '../state';
import { Candle, DiceCup, DiceDefs, Die } from './DiceArt';
import { useHotSeat } from './useHotSeat';
import type { HotSeat } from './useHotSeat';
import styles from './GameView.module.css';

type Dispatch = (a: LiarsDiceAction, opts?: { keepOpen?: boolean }) => void;

const REVEAL_PHASES = new Set(['revealing', 'roundOver', 'gameOver']);

export function LiarsDiceGameView() {
  const publicView = useGameStore((s) => s.publicView);
  if (!publicView) return null;
  return <Tavern view={publicView.view as LiarsDicePublicState} />;
}

function mustAct(view: LiarsDicePublicState): SeatIndex[] {
  if (view.phase === 'rollPending') return view.awaitingAck;
  if (view.phase === 'bidding') return [view.currentSeat];
  return [];
}

function Tavern({ view }: { view: LiarsDicePublicState }) {
  const localSeat = useGameStore((s) => s.localSeat);
  const aiSeats = useGameStore((s) => s.aiSeats);
  const storeDispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);
  const hs = useHotSeat({
    seats: view.seats.map((s) => s.index),
    mustAct: mustAct(view),
    publicPhase: REVEAL_PHASES.has(view.phase),
  });

  // While a hand-off is pending, nothing private is rendered at all.
  const shown: LiarsDicePublicState = hs.redact ? { ...view, yourDice: [] } : view;
  const dispatch: Dispatch = (a, opts) => {
    storeDispatch(a);
    if (!opts?.keepOpen) hs.afterAct();
  };
  const name = (i: SeatIndex | null) => (i === null ? '' : view.seats[i]?.name ?? `Seat ${i + 1}`);
  const opponents = view.players.filter((p) => p.index !== localSeat);
  const me = localSeat !== null ? view.players[localSeat] : undefined;

  return (
    <DiceDefs>
      <div className={styles.root}>
        <div className={styles.glowLeft} aria-hidden />
        <div className={styles.glowRight} aria-hidden />
        <header className={styles.header}>
          <Candle height={86} className={styles.candle} flameClassName={styles.flame} />
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>Liar&apos;s Dice</h2>
            <p className={styles.subtitle}>
              Round {view.roundNumber} · {view.totalDice} dice on the table
              {view.wildOnes ? ' · ones are wild' : ''}
              {view.spotOn ? ' · spot-on allowed' : ''}
            </p>
          </div>
          <button onClick={exitGame} className={styles.exitButton}>
            Leave table
          </button>
        </header>

        <p className={styles.status} aria-live="polite">
          {statusLine(view, localSeat, name)}
        </p>

        <section className={styles.opponents} aria-label="Other players">
          {opponents.map((p) => (
            <SeatCup key={p.index} p={p} view={shown} isAI={aiSeats.includes(p.index)} />
          ))}
        </section>

        <BidSlip view={view} name={name} />

        {me ? (
          <YourCup view={shown} me={me} hs={hs} dispatch={dispatch} name={name} />
        ) : (
          <section className={styles.yourArea}>
            <p className={styles.muted}>You are watching this table.</p>
            <PhaseNotes view={view} name={name} />
          </section>
        )}

        {hs.covered && <HandOffCover view={view} hs={hs} localSeat={localSeat} name={name} />}
      </div>
    </DiceDefs>
  );
}

function statusLine(
  view: LiarsDicePublicState,
  localSeat: SeatIndex | null,
  name: (i: SeatIndex | null) => string,
): string {
  switch (view.phase) {
    case 'rollPending':
      return `Cups are shaking — ${view.awaitingAck.length} still to look under their cup.`;
    case 'bidding':
      return view.currentSeat === localSeat ? 'Your turn: raise the bid or call a liar.' : `${name(view.currentSeat)} is weighing the bid…`;
    case 'revealing':
      return 'Cups up! Count the dice.';
    case 'roundOver':
      return 'Round over — ready for the next roll.';
    case 'gameOver':
      return `${view.matchWinners.map(name).join(', ')} wins the table.`;
  }
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

function DiceCountPips({ count, start }: { count: number; start: number }) {
  return (
    <span className={styles.countPips} aria-label={`${count} of ${start} dice`}>
      {Array.from({ length: Math.max(count, start) }, (_, i) => (
        <span key={i} className={i < count ? styles.pipOn : styles.pipOff} />
      ))}
    </span>
  );
}

function revealDiceFor(view: LiarsDicePublicState, seat: SeatIndex): DieFace[] | null {
  if (!REVEAL_PHASES.has(view.phase) || !view.lastReveal) return null;
  return view.lastReveal.allDice[seat] ?? null;
}

function RevealedDice({ view, seat, size }: { view: LiarsDicePublicState; seat: SeatIndex; size: number }) {
  const dice = revealDiceFor(view, seat);
  const r = view.lastReveal;
  if (!dice || !r) return null;
  const lost = r.loserSeat === seat;
  return (
    <div className={styles.revealRow} key={`r${view.roundNumber}`}>
      {dice.map((d, i) => {
        const match = dieMatches(d, r.bid.face, view.wildOnes);
        const isLostDie = lost && i === dice.length - 1;
        return (
          <span
            key={i}
            className={`${styles.dieSlot} ${styles.riseIn} ${match ? styles.match : styles.noMatch} ${
              isLostDie ? styles.rollAway : ''
            }`}
            style={{ '--i': i } as CSSProperties}
          >
            <Die face={d} size={size} title={`${d}${match ? ' (counts)' : ''}${isLostDie ? ' (lost)' : ''}`} />
          </span>
        );
      })}
    </div>
  );
}

function SeatCup({ p, view, isAI }: { p: PublicPlayer; view: LiarsDicePublicState; isAI: boolean }) {
  const active = view.phase === 'bidding' && p.index === view.currentSeat;
  const bidder = p.index === view.currentBidder && view.phase === 'bidding';
  const reveal = revealDiceFor(view, p.index);
  const shaking = view.phase === 'rollPending' && !p.rollAcked && !p.eliminated;
  const lastBid = [...view.roundBids].reverse().find((b) => b.seat === p.index);
  return (
    <article
      className={`${styles.seat} ${active ? styles.active : ''} ${p.eliminated ? styles.out : ''}`}
      aria-label={`${p.name}${isAI ? ' (AI)' : ''}, ${p.diceCount} dice${p.eliminated ? ', out' : ''}`}
    >
      <div className={styles.plaque}>
        <span className={styles.seatName}>{p.name}</span>
        {isAI && <span className={styles.aiTag}>AI</span>}
      </div>
      <div className={styles.cupZone}>
        {reveal && <RevealedDice view={view} seat={p.index} size={26} />}
        {!p.eliminated && (
          <DiceCup
            key={`${view.roundNumber}-${reveal ? 'up' : 'down'}`}
            size={64}
            className={`${styles.cup} ${shaking ? styles.shaking : ''} ${reveal ? styles.lifted : ''}`}
          />
        )}
        {p.eliminated && <span className={styles.plank}>walked the plank</span>}
        {bidder && lastBid && (
          <span className={styles.speech}>
            {lastBid.bid.count} × <Die face={lastBid.bid.face} size={16} />
          </span>
        )}
      </div>
      <DiceCountPips count={p.diceCount} start={view.startingDice} />
    </article>
  );
}

// ---------------------------------------------------------------------------
// The bid slip (current bid + this round's calls)
// ---------------------------------------------------------------------------

function BidSlip({ view, name }: { view: LiarsDicePublicState; name: (i: SeatIndex | null) => string }) {
  const bid = view.phase === 'bidding' ? view.currentBid : view.lastReveal?.bid ?? null;
  return (
    <section className={styles.slipRow} aria-label="Bidding">
      <div className={styles.slip}>
        <span className={styles.slipLabel}>{view.phase === 'bidding' ? 'Standing bid' : 'Last bid'}</span>
        {bid ? (
          <div className={styles.slipBid} key={`${bid.count}-${bid.face}`}>
            <span className={styles.slipCount}>{bid.count}</span>
            <span className={styles.slipTimes}>×</span>
            <Die face={bid.face} size={46} />
          </div>
        ) : (
          <div className={styles.slipEmpty}>no bid yet</div>
        )}
        {view.phase === 'bidding' && view.currentBidder !== null && (
          <span className={styles.slipBy}>by {name(view.currentBidder)}</span>
        )}
      </div>
      {view.roundBids.length > 0 && (
        <ol className={styles.chalk} aria-label="Bids this round">
          {view.roundBids.map((b, i) => (
            <li key={i} className={styles.chalkItem}>
              <span>{name(b.seat)}</span>
              <span className={styles.chalkBid}>
                {b.bid.count} × <Die face={b.bid.face} size={15} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The local seat
// ---------------------------------------------------------------------------

function YourCup({
  view,
  me,
  hs,
  dispatch,
  name,
}: {
  view: LiarsDicePublicState;
  me: PublicPlayer;
  hs: HotSeat;
  dispatch: Dispatch;
  name: (i: SeatIndex | null) => string;
}) {
  const reveal = revealDiceFor(view, me.index);
  return (
    <section className={`${styles.yourArea} ${view.currentSeat === me.index && view.phase === 'bidding' ? styles.yourTurn : ''}`}>
      <div className={styles.yourHeader}>
        <span className={styles.yourName}>{me.name}</span>
        <DiceCountPips count={me.diceCount} start={view.startingDice} />
      </div>
      <div className={styles.yourCupRow}>
        {me.eliminated ? (
          <p className={styles.muted}>You&apos;re out of dice — enjoy the show.</p>
        ) : reveal ? (
          <RevealedDice view={view} seat={me.index} size={48} />
        ) : view.yourDice.length > 0 ? (
          <div className={styles.yourDice} key={`roll-${view.roundNumber}`}>
            <DiceCup size={70} className={`${styles.cup} ${styles.cupAside}`} />
            {view.yourDice.map((d, i) => (
              <span key={i} className={`${styles.dieSlot} ${styles.tumble}`} style={{ '--i': i } as CSSProperties}>
                <Die face={d} size={52} />
              </span>
            ))}
          </div>
        ) : (
          <DiceCup size={80} className={`${styles.cup} ${view.phase === 'rollPending' ? styles.shaking : ''}`} />
        )}
      </div>
      <ActionPanel view={view} me={me} hs={hs} dispatch={dispatch} name={name} />
    </section>
  );
}

function PhaseNotes({ view, name }: { view: LiarsDicePublicState; name: (i: SeatIndex | null) => string }) {
  if (view.phase === 'revealing' && view.lastReveal) return <Verdict view={view} name={name} />;
  if (view.phase === 'gameOver') return <GameOver view={view} name={name} />;
  return null;
}

function ActionPanel({
  view,
  me,
  hs,
  dispatch,
  name,
}: {
  view: LiarsDicePublicState;
  me: PublicPlayer;
  hs: HotSeat;
  dispatch: Dispatch;
  name: (i: SeatIndex | null) => string;
}) {
  // Public recap phases: in hot-seat one tap acknowledges for every local seat.
  const ackSeats = hs.hotSeat ? view.awaitingAck.filter(hs.canView) : view.yourAckPending ? [me.index] : [];
  const ackAll = (type: 'ackReveal' | 'ackRoundOver') => {
    // Not keepOpen: the next private phase starts behind the hand-off cover.
    for (const s of ackSeats) dispatch({ type, bySeat: s });
  };

  switch (view.phase) {
    case 'gameOver':
      return <GameOver view={view} name={name} />;
    case 'rollPending':
      return (
        <div className={styles.panel}>
          {view.yourAckPending ? (
            <>
              <p className={styles.panelText}>Peek under your cup — then keep it to yourself.</p>
              <button className={styles.primary} onClick={() => dispatch({ type: 'ackRoll', bySeat: me.index })}>
                I&apos;ve seen my dice
              </button>
            </>
          ) : (
            <p className={styles.muted}>Waiting for {view.awaitingAck.map(name).join(', ') || 'the table'}…</p>
          )}
        </div>
      );
    case 'revealing':
      return (
        <div className={styles.panel}>
          <Verdict view={view} name={name} />
          <button className={styles.primary} disabled={ackSeats.length === 0} onClick={() => ackAll('ackReveal')}>
            {ackSeats.length > 0 ? 'Continue' : 'Waiting for the others…'}
          </button>
        </div>
      );
    case 'roundOver':
      return (
        <div className={styles.panel}>
          <p className={styles.panelText}>Scoop up the dice — next roll is led by {name(view.lastReveal?.loserSeat ?? null)}.</p>
          <button className={styles.primary} disabled={ackSeats.length === 0} onClick={() => ackAll('ackRoundOver')}>
            {ackSeats.length > 0 ? 'Shake the cups' : 'Waiting for the others…'}
          </button>
        </div>
      );
    case 'bidding':
      if (me.eliminated) return null;
      if (view.currentSeat !== me.index) {
        return (
          <div className={styles.panel}>
            <p className={styles.muted}>{name(view.currentSeat)} has the bid.</p>
          </div>
        );
      }
      return <BidPicker key={view.roundBids.length} view={view} seat={me.index} dispatch={dispatch} />;
  }
}

function BidPicker({ view, seat, dispatch }: { view: LiarsDicePublicState; seat: SeatIndex; dispatch: Dispatch }) {
  const prev = view.currentBid;
  const cap = view.totalDice;
  const legalFaces = FACES.filter((f) => minCountFor(prev, f, cap, view.wildOnes) !== null);
  const initialFace: DieFace =
    prev && legalFaces.includes(prev.face) ? prev.face : legalFaces.find((f) => f !== 1) ?? legalFaces[0] ?? 2;
  const [face, setFace] = useState<DieFace>(initialFace);
  const [count, setCount] = useState<number>(minCountFor(prev, initialFace, cap, view.wildOnes) ?? 1);

  const minForFace = minCountFor(prev, face, cap, view.wildOnes);
  const bid: Bid = { count, face };
  const valid = count <= cap && isLegalRaise(prev, bid, view.wildOnes);
  const pick = (f: DieFace) => {
    setFace(f);
    const min = minCountFor(prev, f, cap, view.wildOnes);
    if (min !== null) setCount((c) => Math.max(min, Math.min(c, cap)));
  };

  return (
    <div className={styles.panel}>
      {legalFaces.length > 0 && (
        <>
          <div className={styles.faceRow} role="group" aria-label="Choose a face">
            {FACES.map((f) => {
              const legal = legalFaces.includes(f);
              return (
                <button
                  key={f}
                  className={`${styles.faceButton} ${f === face ? styles.faceOn : ''}`}
                  aria-pressed={f === face}
                  aria-label={`Bid on ${f}s`}
                  disabled={!legal}
                  onClick={() => pick(f)}
                >
                  <Die face={f} size={38} />
                </button>
              );
            })}
          </div>
          <div className={styles.countRow}>
            <button
              className={styles.stepper}
              aria-label="Fewer dice"
              disabled={minForFace === null || count <= minForFace}
              onClick={() => setCount((c) => c - 1)}
            >
              −
            </button>
            <span className={styles.bigCount} aria-live="polite">
              {count}
            </span>
            <button className={styles.stepper} aria-label="More dice" disabled={count >= cap} onClick={() => setCount((c) => c + 1)}>
              +
            </button>
            <button
              className={styles.primary}
              disabled={!valid}
              onClick={() => dispatch({ type: 'placeBid', bySeat: seat, bid })}
            >
              Bid {count} × {face}s
            </button>
          </div>
          {view.wildOnes && (
            <p className={styles.hint}>
              {prev === null
                ? 'Ones are wild — you can’t open on ones.'
                : prev.face === 1
                  ? `Leaving ones needs at least ${prev.count * 2 + 1} dice.`
                  : `Switching to ones needs at least ${Math.ceil(prev.count / 2)}.`}
            </p>
          )}
        </>
      )}
      {prev && (
        <div className={styles.callRow}>
          <button className={styles.liar} onClick={() => dispatch({ type: 'call', bySeat: seat, kind: 'liar' })}>
            Liar!
          </button>
          {view.spotOn && (
            <button className={styles.spotOn} onClick={() => dispatch({ type: 'call', bySeat: seat, kind: 'spotOn' })}>
              Spot on
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Verdict({ view, name }: { view: LiarsDicePublicState; name: (i: SeatIndex | null) => string }) {
  const r = view.lastReveal;
  if (!r) return null;
  const stamp = r.kind === 'liar' ? (r.callerWon ? 'Liar!' : 'Honest!') : r.callerWon ? 'Spot on!' : 'Missed!';
  const out = view.players[r.loserSeat]?.eliminated;
  return (
    <div className={styles.verdict}>
      <span className={`${styles.stamp} ${r.callerWon ? styles.stampWin : styles.stampLose}`}>{stamp}</span>
      <p className={styles.panelText}>
        {name(r.bidder)} bid <b>{r.bid.count} × {r.bid.face}s</b>. The table holds <b>{r.actual}</b>
        {view.wildOnes && r.bid.face !== 1 ? ' (ones wild)' : ''}. {name(r.caller)} called{' '}
        {r.kind === 'liar' ? 'liar' : 'spot on'}.
      </p>
      <p className={styles.loss}>
        {name(r.loserSeat)} loses a die{out ? ' — and walks the plank.' : '.'}
      </p>
    </div>
  );
}

function GameOver({ view, name }: { view: LiarsDicePublicState; name: (i: SeatIndex | null) => string }) {
  return (
    <div className={`${styles.panel} ${styles.gameOver}`}>
      <span className={styles.banner}>Last cup standing</span>
      <p className={styles.winner}>{view.matchWinners.map(name).join(', ')}</p>
      <p className={styles.muted}>{view.history.length} rounds played.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hot-seat cover
// ---------------------------------------------------------------------------

function HandOffCover({
  view,
  hs,
  localSeat,
  name,
}: {
  view: LiarsDicePublicState;
  hs: HotSeat;
  localSeat: SeatIndex | null;
  name: (i: SeatIndex | null) => string;
}) {
  const target = hs.nextHuman ?? localSeat;
  const waitingOn = view.phase === 'bidding' ? view.currentSeat : null;
  return (
    <div className={styles.cover} role="dialog" aria-modal="true" aria-labelledby="ld-cover-title">
      <div className={styles.coverCard}>
        <DiceCup size={96} className={`${styles.cup} ${styles.shaking}`} />
        <h3 id="ld-cover-title" className={styles.coverTitle}>
          {hs.nextHuman !== null ? `Pass the device to ${name(hs.nextHuman)}` : `${name(waitingOn)} is deciding…`}
        </h3>
        <p className={styles.muted}>Cups stay down until the right pirate is holding the device.</p>
        {target !== null && (
          <button className={styles.primary} onClick={() => hs.revealTo(target)} autoFocus>
            I&apos;m {name(target)} — lift my cup
          </button>
        )}
        {hs.humanSeats.length > 1 && (
          <div className={styles.switchRow}>
            <span className={styles.muted}>Or hand it to:</span>
            {hs.humanSeats
              .filter((s) => s !== target)
              .map((s) => (
                <button key={s} className={styles.ghost} onClick={() => hs.revealTo(s)}>
                  {name(s)}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
