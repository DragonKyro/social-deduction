import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { SeatIndex } from '@/engine/types';
import { FlipCard } from '@/ui/shared/FlipCard';
import { useGameStore } from '@/store/gameStore';
import type { CockroachPokerAction } from '../actions';
import { CREATURES, LOSING_ROW_COUNT } from '../state';
import type { CockroachPokerPublicState, Creature, PublicPlayer } from '../state';
import { CREATURE_LABEL, CardBack, CreatureCard, CreatureDefs, CreatureIcon } from './CreatureArt';
import { useHotSeat } from './useHotSeat';
import type { HotSeat } from './useHotSeat';
import styles from './GameView.module.css';

type Dispatch = (a: CockroachPokerAction, opts?: { keepOpen?: boolean }) => void;
type NameFn = (i: SeatIndex | null) => string;

const PUBLIC_PHASES = new Set(['revealing', 'gameOver']);

export function CockroachPokerGameView() {
  const publicView = useGameStore((s) => s.publicView);
  if (!publicView) return null;
  return <Parlour view={publicView.view as CockroachPokerPublicState} />;
}

function mustAct(view: CockroachPokerPublicState): SeatIndex[] {
  if (view.phase === 'dealPending') return view.awaitingAck;
  if (view.phase === 'passing') return [view.currentSeat];
  if (view.phase === 'decide' && view.passHolder !== null) return [view.passHolder];
  return [];
}

function Parlour({ view }: { view: CockroachPokerPublicState }) {
  const localSeat = useGameStore((s) => s.localSeat);
  const aiSeats = useGameStore((s) => s.aiSeats);
  const storeDispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);
  const hs = useHotSeat({
    seats: view.seats.map((s) => s.index),
    mustAct: mustAct(view),
    publicPhase: PUBLIC_PHASES.has(view.phase),
  });
  // Hands stay private even during a reveal, so redaction covers both.
  const shown: CockroachPokerPublicState = hs.redact ? { ...view, yourHand: [], yourPeekedCard: null } : view;
  const dispatch: Dispatch = (a, opts) => {
    storeDispatch(a);
    if (!opts?.keepOpen) hs.afterAct();
  };
  const name: NameFn = (i) => (i === null ? '' : view.seats[i]?.name ?? `Seat ${i + 1}`);
  const opponents = view.players.filter((p) => p.index !== localSeat);
  const me = localSeat !== null ? view.players[localSeat] : undefined;

  return (
    <CreatureDefs>
      <div className={styles.root}>
        <Cobweb className={styles.webLeft} />
        <Cobweb className={styles.webRight} />
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Cockroach Poker</h2>
            <p className={styles.subtitle}>
              Turn {view.turnNumber + 1} · four of a kind face-up and you&apos;re out
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
            <OpponentSeat key={p.index} p={p} view={view} isAI={aiSeats.includes(p.index)} />
          ))}
        </section>

        <Transit view={shown} name={name} />

        {me ? (
          <YourArea view={shown} me={me} hs={hs} dispatch={dispatch} name={name} />
        ) : (
          <section className={styles.yourArea}>
            <p className={styles.muted}>You are watching this table.</p>
            {view.phase === 'revealing' && <Verdict view={view} name={name} />}
            {view.phase === 'gameOver' && <GameOver view={view} name={name} />}
          </section>
        )}

        {hs.covered && <HandOffCover view={view} hs={hs} localSeat={localSeat} name={name} />}
      </div>
    </CreatureDefs>
  );
}

function statusLine(view: CockroachPokerPublicState, localSeat: SeatIndex | null, name: NameFn): string {
  switch (view.phase) {
    case 'dealPending':
      return `The deck is dealt — ${view.awaitingAck.length} still sorting their hand.`;
    case 'passing':
      return view.currentSeat === localSeat ? 'Your turn: slide a card to someone and lie (or don’t).' : `${name(view.currentSeat)} is choosing a victim…`;
    case 'decide':
      return view.passHolder === localSeat
        ? view.passHolderPeeked
          ? 'You peeked — now pass it on to someone who hasn’t seen it.'
          : 'A card is in front of you. True, false — or peek and pass it on?'
        : `${name(view.passHolder)} is eyeing the card…`;
    case 'revealing':
      return 'Flip!';
    case 'gameOver':
      return `${name(view.loserSeat)} is overrun.`;
  }
}

function Cobweb({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <g stroke="#cfc8dc" strokeWidth="0.8" fill="none" opacity="0.35">
        <path d="M0 0 L120 30 M0 0 L95 75 M0 0 L60 110 M0 0 L22 120" />
        <path d="M30 8 Q26 22 24 32 Q14 28 6 24 M58 15 Q48 40 44 60 Q24 52 12 44 M88 22 Q70 60 63 88 Q34 78 16 66 M110 28 Q90 80 80 112 Q44 102 20 92" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Rows & seats
// ---------------------------------------------------------------------------

function PenaltyRow({ row, full = false, size = 26 }: { row: Record<Creature, number>; full?: boolean; size?: number }) {
  const creatures = full ? CREATURES : CREATURES.filter((c) => row[c] > 0).sort((a, b) => row[b] - row[a]);
  if (creatures.length === 0) return <span className={styles.clean}>no bugs yet</span>;
  return (
    <div className={styles.row}>
      {creatures.map((c) => {
        const n = row[c];
        return (
          <div
            key={c}
            className={`${styles.stack} ${n === LOSING_ROW_COUNT - 1 ? styles.danger : ''} ${n >= LOSING_ROW_COUNT ? styles.dead : ''}`}
            title={`${n} × ${CREATURE_LABEL[c]}`}
            aria-label={`${n} ${CREATURE_LABEL[c]} face-up`}
            style={{ '--h': Math.max(n, 1) } as CSSProperties}
          >
            {n === 0 && (
              <span className={styles.emptySlot}>
                <CreatureIcon creature={c} size={size * 0.7} />
              </span>
            )}
            {Array.from({ length: n }, (_, i) => (
              <span key={i} className={styles.miniCard} style={{ '--i': i } as CSSProperties}>
                <CreatureCard creature={c} width={size} />
              </span>
            ))}
            {n > 0 && <span className={styles.countBadge}>{n}</span>}
          </div>
        );
      })}
    </div>
  );
}

function OpponentSeat({ p, view, isAI }: { p: PublicPlayer; view: CockroachPokerPublicState; isAI: boolean }) {
  const active =
    (view.phase === 'passing' && view.currentSeat === p.index) ||
    (view.phase === 'decide' && view.passHolder === p.index);
  const seen = view.phase === 'decide' && view.passSeenBy.includes(p.index);
  return (
    <article
      className={`${styles.seat} ${active ? styles.active : ''} ${p.lost ? styles.lost : ''}`}
      aria-label={`${p.name}${isAI ? ' (AI)' : ''}, ${p.handSize} cards in hand`}
    >
      <div className={styles.nameplate}>
        <span className={styles.seatName}>{p.name}</span>
        {isAI && <span className={styles.aiTag}>AI</span>}
        {seen && (
          <span className={styles.seenTag} title="Has seen the card in play" aria-label="has seen the card">
            <svg viewBox="0 0 24 14" width="18" height="11" aria-hidden>
              <path d="M1 7 Q12 -4 23 7 Q12 18 1 7 Z" fill="#f6ead0" stroke="#1d1310" strokeWidth="1.4" />
              <circle cx="12" cy="7" r="3.6" fill="#7a2a8c" />
              <circle cx="12" cy="7" r="1.6" fill="#120c0a" />
            </svg>
          </span>
        )}
      </div>
      <div className={styles.handStack} aria-hidden>
        {Array.from({ length: Math.min(p.handSize, 6) }, (_, i) => (
          <span key={i} className={styles.stackBack} style={{ '--i': i } as CSSProperties}>
            <CardBack width={30} />
          </span>
        ))}
        <span className={styles.handCount}>{p.handSize}</span>
      </div>
      <PenaltyRow row={p.row} />
    </article>
  );
}

// ---------------------------------------------------------------------------
// The card in play
// ---------------------------------------------------------------------------

function Transit({ view, name }: { view: CockroachPokerPublicState; name: NameFn }) {
  const reveal = view.phase === 'revealing' || view.phase === 'gameOver' ? view.lastReveal : null;
  if (view.phase !== 'decide' && !reveal) return <div className={styles.transitEmpty} aria-hidden />;

  const chain = reveal ? reveal.chain : view.passChain;
  const hop = chain[chain.length - 1]!;
  const claim = reveal ? reveal.claim : view.passClaim!;
  // Same key across decide → revealing so the card flips in place.
  const passKey = `${reveal ? view.turnNumber - 1 : view.turnNumber}-${chain.length}`;
  const face: Creature | null = reveal ? reveal.card : view.yourPeekedCard;
  const peeked = !reveal && face !== null;

  return (
    <section className={styles.transit} aria-label="Card in play">
      <div key={passKey} className={styles.slideIn}>
        <div className={`${styles.transitCard} ${peeked ? styles.peekLift : ''}`}>
          <FlipCard
            width={104}
            height={(104 * 98) / 70}
            radius={8}
            revealed={face !== null}
            back={<CardBack width={104} />}
            front={face ? <CreatureCard creature={face} width={104} /> : <CardBack width={104} />}
          />
          {reveal && (
            <span className={`${styles.stamp} ${reveal.card === reveal.claim ? styles.stampRight : styles.stampWrong}`}>
              {reveal.card === reveal.claim ? 'True' : 'Lie'}
            </span>
          )}
        </div>
      </div>
      <div className={styles.claimSide}>
        <div className={styles.bubble}>
          <span className={styles.bubbleWho}>{name(hop.from)}:</span>
          <span className={styles.bubbleClaim}>
            “It&apos;s a <CreatureIcon creature={claim} size={30} /> {CREATURE_LABEL[claim]}!”
          </span>
        </div>
        <ol className={styles.chain} aria-label="Pass chain">
          {chain.map((h, i) => (
            <li key={i} className={styles.hop}>
              {name(h.from)} <span className={styles.arrow}>→</span> {name(h.to)} <span className={styles.hopClaim}>“{CREATURE_LABEL[h.claim]}”</span>
            </li>
          ))}
        </ol>
        {peeked && view.passHolder !== view.yourSeat && (
          <p className={styles.secret}>You know: it&apos;s really a {CREATURE_LABEL[face!]}.</p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The local seat
// ---------------------------------------------------------------------------

function handGroups(hand: Creature[]): Array<[Creature, number]> {
  return CREATURES.map((c) => [c, hand.filter((x) => x === c).length] as [Creature, number]).filter(([, n]) => n > 0);
}

function YourArea({
  view,
  me,
  hs,
  dispatch,
  name,
}: {
  view: CockroachPokerPublicState;
  me: PublicPlayer;
  hs: HotSeat;
  dispatch: Dispatch;
  name: NameFn;
}) {
  const myTurn =
    (view.phase === 'passing' && view.currentSeat === me.index) ||
    (view.phase === 'decide' && view.passHolder === me.index);
  const passing = view.phase === 'passing' && view.currentSeat === me.index;
  return (
    <section className={`${styles.yourArea} ${myTurn ? styles.yourTurn : ''}`}>
      <div className={styles.yourHeader}>
        <span className={styles.yourName}>{me.name}</span>
        <span className={styles.muted}>{me.handSize} cards in hand</span>
      </div>
      <PenaltyRow row={me.row} full size={34} />
      {!passing && <HandFan view={view} />}
      <ActionPanel view={view} me={me} hs={hs} dispatch={dispatch} name={name} />
    </section>
  );
}

function HandFan({ view, selected, onPick }: { view: CockroachPokerPublicState; selected?: Creature; onPick?: (c: Creature) => void }) {
  const groups = handGroups(view.yourHand);
  if (groups.length === 0) {
    return view.yourSeat !== null && view.players[view.yourSeat]!.handSize > 0 ? (
      <div className={styles.hand}>
        {Array.from({ length: Math.min(view.players[view.yourSeat]!.handSize, 8) }, (_, i) => (
          <span key={i} className={styles.handCard} style={{ '--k': i } as CSSProperties}>
            <CardBack width={58} />
          </span>
        ))}
      </div>
    ) : (
      <p className={styles.muted}>Your hand is empty.</p>
    );
  }
  return (
    <div className={styles.hand} role={onPick ? 'radiogroup' : undefined} aria-label="Your hand">
      {groups.map(([c, n], i) => {
        const card = (
          <>
            <CreatureCard creature={c} width={64} />
            {n > 1 && <span className={styles.handBadge}>×{n}</span>}
          </>
        );
        return onPick ? (
          <button
            key={c}
            role="radio"
            aria-checked={selected === c}
            aria-label={`Pass a ${CREATURE_LABEL[c]} (${n} in hand)`}
            className={`${styles.handCard} ${styles.handPick} ${selected === c ? styles.handSelected : ''}`}
            style={{ '--k': i } as CSSProperties}
            onClick={() => onPick(c)}
          >
            {card}
          </button>
        ) : (
          <span key={c} className={styles.handCard} style={{ '--k': i } as CSSProperties}>
            {card}
          </span>
        );
      })}
    </div>
  );
}

function ActionPanel({
  view,
  me,
  hs,
  dispatch,
  name,
}: {
  view: CockroachPokerPublicState;
  me: PublicPlayer;
  hs: HotSeat;
  dispatch: Dispatch;
  name: NameFn;
}) {
  switch (view.phase) {
    case 'gameOver':
      return <GameOver view={view} name={name} />;
    case 'dealPending':
      return (
        <div className={styles.panel}>
          {view.yourAckPending ? (
            <button className={styles.primary} onClick={() => dispatch({ type: 'ackDeal', bySeat: me.index })}>
              I&apos;ve sorted my hand
            </button>
          ) : (
            <p className={styles.muted}>Waiting for {view.awaitingAck.map(name).join(', ') || 'the table'}…</p>
          )}
        </div>
      );
    case 'revealing': {
      const ackSeats = hs.hotSeat ? view.awaitingAck.filter(hs.canView) : view.yourAckPending ? [me.index] : [];
      return (
        <div className={styles.panel}>
          <Verdict view={view} name={name} />
          <button
            className={styles.primary}
            disabled={ackSeats.length === 0}
            onClick={() => {
              for (const s of ackSeats) dispatch({ type: 'ackReveal', bySeat: s });
            }}
          >
            {ackSeats.length > 0 ? 'Continue' : 'Waiting for the others…'}
          </button>
        </div>
      );
    }
    case 'passing':
      if (view.currentSeat !== me.index) {
        return <p className={styles.muted}>{name(view.currentSeat)} is picking a card to pass.</p>;
      }
      return <PassBuilder key={view.turnNumber} view={view} seat={me.index} dispatch={dispatch} name={name} />;
    case 'decide':
      if (view.passHolder !== me.index) {
        return <p className={styles.muted}>{name(view.passHolder)} has to deal with it.</p>;
      }
      return view.passHolderPeeked ? (
        <PassOnBuilder key={view.passChain.length} view={view} seat={me.index} dispatch={dispatch} name={name} />
      ) : (
        <DecidePanel view={view} seat={me.index} dispatch={dispatch} name={name} />
      );
  }
}

function ClaimPicker({ value, onPick }: { value: Creature; onPick: (c: Creature) => void }) {
  return (
    <div className={styles.claimPicker} role="radiogroup" aria-label="Claim it is a…">
      {CREATURES.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={value === c}
          className={`${styles.claimButton} ${value === c ? styles.claimOn : ''}`}
          onClick={() => onPick(c)}
        >
          <CreatureIcon creature={c} size={34} />
          <span>{CREATURE_LABEL[c]}</span>
        </button>
      ))}
    </div>
  );
}

function TargetPicker({
  view,
  targets,
  value,
  onPick,
  card,
  name,
}: {
  view: CockroachPokerPublicState;
  targets: SeatIndex[];
  value: SeatIndex | null;
  onPick: (s: SeatIndex) => void;
  card: Creature | null;
  name: NameFn;
}) {
  return (
    <div className={styles.targetPicker} role="radiogroup" aria-label="Slide it to…">
      {targets.map((t) => {
        const n = card ? view.players[t]!.row[card] : 0;
        return (
          <button
            key={t}
            role="radio"
            aria-checked={value === t}
            className={`${styles.targetButton} ${value === t ? styles.targetOn : ''}`}
            onClick={() => onPick(t)}
          >
            <span>{name(t)}</span>
            {card && n > 0 && (
              <span className={`${styles.targetRisk} ${n >= LOSING_ROW_COUNT - 1 ? styles.targetHot : ''}`}>
                {n} <CreatureIcon creature={card} size={16} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PassBuilder({
  view,
  seat,
  dispatch,
  name,
}: {
  view: CockroachPokerPublicState;
  seat: SeatIndex;
  dispatch: Dispatch;
  name: NameFn;
}) {
  const groups = handGroups(view.yourHand);
  const targets = view.players.filter((p) => p.index !== seat && !p.lost).map((p) => p.index);
  const [card, setCard] = useState<Creature | null>(groups[0]?.[0] ?? null);
  const [claim, setClaim] = useState<Creature>(groups[0]?.[0] ?? 'cockroach');
  const [target, setTarget] = useState<SeatIndex | null>(targets[0] ?? null);
  const handIndex = card ? view.yourHand.indexOf(card) : -1;
  const ready = handIndex >= 0 && target !== null;
  return (
    <div className={styles.panel}>
      <h4 className={styles.step}>1 · Pick a card to pass</h4>
      <HandFan view={view} selected={card ?? undefined} onPick={setCard} />
      <h4 className={styles.step}>2 · Say it&apos;s a…</h4>
      <ClaimPicker value={claim} onPick={setClaim} />
      <h4 className={styles.step}>3 · Slide it to…</h4>
      <TargetPicker view={view} targets={targets} value={target} onPick={setTarget} card={card} name={name} />
      <button
        className={styles.primary}
        disabled={!ready}
        onClick={() => ready && dispatch({ type: 'startPass', bySeat: seat, handIndex, claim, target: target! })}
      >
        {ready ? `Slide it to ${name(target)}${card === claim ? ' (honestly)' : ''} →` : 'Pick a card and a victim'}
      </button>
    </div>
  );
}

function DecidePanel({
  view,
  seat,
  dispatch,
  name,
}: {
  view: CockroachPokerPublicState;
  seat: SeatIndex;
  dispatch: Dispatch;
  name: NameFn;
}) {
  const claim = view.passClaim!;
  const label = CREATURE_LABEL[claim];
  const targets = view.players.filter((p) => !p.lost && p.index !== seat && !view.passSeenBy.includes(p.index));
  return (
    <div className={styles.panel}>
      <div className={styles.callRow}>
        <button className={styles.trueButton} onClick={() => dispatch({ type: 'decide', bySeat: seat, call: 'truth' })}>
          True — it IS a {label}
        </button>
        <button className={styles.falseButton} onClick={() => dispatch({ type: 'decide', bySeat: seat, call: 'lie' })}>
          False — it&apos;s NOT a {label}
        </button>
      </div>
      <button
        className={styles.peekButton}
        disabled={targets.length === 0}
        onClick={() => dispatch({ type: 'peek', bySeat: seat }, { keepOpen: true })}
      >
        Peek, then pass it on
      </button>
      {targets.length === 0 && <p className={styles.muted}>Everyone else has seen this card — you have to call it.</p>}
      <p className={styles.hint}>
        Guess right and {name(view.passChain[view.passChain.length - 1]?.from ?? null)} takes it face-up. Guess wrong and
        it&apos;s yours.
      </p>
    </div>
  );
}

function PassOnBuilder({
  view,
  seat,
  dispatch,
  name,
}: {
  view: CockroachPokerPublicState;
  seat: SeatIndex;
  dispatch: Dispatch;
  name: NameFn;
}) {
  const card = view.yourPeekedCard;
  const targets = view.players
    .filter((p) => !p.lost && p.index !== seat && !view.passSeenBy.includes(p.index))
    .map((p) => p.index);
  const [claim, setClaim] = useState<Creature>(view.passClaim ?? 'cockroach');
  const [target, setTarget] = useState<SeatIndex | null>(targets[0] ?? null);
  return (
    <div className={styles.panel}>
      {card && (
        <p className={styles.secret}>
          You peeked: it&apos;s really a <CreatureIcon creature={card} size={22} /> {CREATURE_LABEL[card]}. Now pass it on.
        </p>
      )}
      <h4 className={styles.step}>Say it&apos;s a…</h4>
      <ClaimPicker value={claim} onPick={setClaim} />
      <h4 className={styles.step}>Slide it to…</h4>
      <TargetPicker view={view} targets={targets} value={target} onPick={setTarget} card={card} name={name} />
      <button
        className={styles.primary}
        disabled={target === null}
        onClick={() => target !== null && dispatch({ type: 'passOn', bySeat: seat, claim, target })}
      >
        Slide it on →
      </button>
    </div>
  );
}

function Verdict({ view, name }: { view: CockroachPokerPublicState; name: NameFn }) {
  const r = view.lastReveal;
  if (!r) return null;
  const n = view.players[r.receiver]!.row[r.card];
  return (
    <div className={styles.verdict}>
      <p className={styles.panelText}>
        {name(r.claimant)} said “{CREATURE_LABEL[r.claim]}”. {name(r.decider)} called it{' '}
        <b>{r.call === 'truth' ? 'TRUE' : 'FALSE'}</b> — it was a <b>{CREATURE_LABEL[r.card]}</b>.{' '}
        {r.callerWon ? 'Right call!' : 'Wrong call!'}
      </p>
      <p className={styles.loss}>
        {name(r.receiver)} takes the {CREATURE_LABEL[r.card]} face-up
        {n >= LOSING_ROW_COUNT ? ` — that's ${n}. ${name(r.receiver)} loses!` : ` (${n} now).`}
      </p>
    </div>
  );
}

function GameOver({ view, name }: { view: CockroachPokerPublicState; name: NameFn }) {
  const loser = view.loserSeat;
  const row = loser !== null ? view.players[loser]!.row : null;
  const plague = row ? CREATURES.find((c) => row[c] >= LOSING_ROW_COUNT) : undefined;
  return (
    <div className={`${styles.panel} ${styles.gameOver}`}>
      <span className={styles.banner}>Infested!</span>
      {plague && <CreatureIcon creature={plague} size={72} className={styles.plague} />}
      <p className={styles.loserName}>{name(loser)}</p>
      <p className={styles.panelText}>
        {view.lossReason === 'emptyHand'
          ? 'had no cards left to pass — and loses.'
          : `collected ${LOSING_ROW_COUNT} ${plague ? CREATURE_LABEL[plague] : 'of a kind'}s — and loses.`}
      </p>
      <p className={styles.muted}>Survivors: {view.matchWinners.map(name).join(', ')}</p>
    </div>
  );
}

function HandOffCover({
  view,
  hs,
  localSeat,
  name,
}: {
  view: CockroachPokerPublicState;
  hs: HotSeat;
  localSeat: SeatIndex | null;
  name: NameFn;
}) {
  const target = hs.nextHuman ?? localSeat;
  const waiting = view.phase === 'passing' ? view.currentSeat : view.phase === 'decide' ? view.passHolder : null;
  return (
    <div className={styles.cover} role="dialog" aria-modal="true" aria-labelledby="cp-cover-title">
      <div className={styles.coverCard}>
        <CardBack width={86} className={styles.coverBack} />
        <h3 id="cp-cover-title" className={styles.coverTitle}>
          {hs.nextHuman !== null ? `Pass the device to ${name(hs.nextHuman)}` : `${name(waiting)} is scheming…`}
        </h3>
        <p className={styles.muted}>Hands stay hidden until the right player is holding the device.</p>
        {target !== null && (
          <button className={styles.primary} onClick={() => hs.revealTo(target)} autoFocus>
            I&apos;m {name(target)} — show my hand
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
