import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { SeatIndex } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import { FlipCard } from '@/ui/shared/FlipCard';
import type { LoveLetterAction } from '../actions';
import type { Card, LoveLetterPhase, LoveLetterPublicState, PublicPlayer, Rank } from '../state';
import { RANK_NAMES } from '../state';
import { cardEffectText, LoveCard, LoveCardBack, TokenGem } from './CardArt';
import { useHotSeat } from './hotseat';
import styles from './GameView.module.css';

// ============================================================================
// Love Letter — game view (velvet court table).
//
// Everything rendered comes from the redacted `view` for the local seat.
// Card faces are only ever drawn for cards the view actually contains:
// your hand, public discards / reveals, your Priest peek, and your own
// Baron / King secret. Everyone else's cards are rendered as sealed letters.
// ============================================================================

type Dispatch = (a: LoveLetterAction) => void;

const TARGETING: LoveLetterPhase[] = [
  'guardTargeting',
  'priestTargeting',
  'baronTargeting',
  'kingTargeting',
  'princeTargeting',
];

function nameOf(v: LoveLetterPublicState, seat: SeatIndex | null | undefined): string {
  if (seat === null || seat === undefined) return '—';
  return v.players.find((p) => p.index === seat)?.name ?? `Seat ${seat + 1}`;
}

/** The seat whose private decision the game is waiting on (null = everyone / nobody). */
function requiredSeat(v: LoveLetterPublicState): SeatIndex | null {
  if (v.phase === 'turn' || TARGETING.includes(v.phase)) return v.currentSeat;
  if (v.phase === 'priestReveal') return v.waitingOn[0] ?? null;
  return null;
}

function targetCandidates(v: LoveLetterPublicState): SeatIndex[] {
  const self = v.phase === 'princeTargeting';
  return v.players
    .filter((p) => !p.eliminated && (p.index === v.currentSeat ? self : !p.protected))
    .map((p) => p.index);
}

/** Stable React keys for a small multiset of cards: kept cards keep their key, new ones get fresh keys. */
function useCardKeys(cards: readonly Card[], scope: string): string[] {
  const ref = useRef<{ scope: string; items: Array<{ card: Card; key: string }>; n: number }>({
    scope,
    items: [],
    n: 0,
  });
  const st = ref.current;
  if (st.scope !== scope) {
    st.scope = scope;
    st.items = [];
  }
  const pool = st.items.slice();
  const next = cards.map((card) => {
    const i = pool.findIndex((p) => p.card === card);
    if (i >= 0) return pool.splice(i, 1)[0]!;
    return { card, key: `${scope}#${st.n++}` };
  });
  st.items = next;
  return next.map((x) => x.key);
}

/** false → true after `ms` (for flip-after-deal reveals). */
function useRevealAfter(ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return on;
}

// ============================================================================
// Root
// ============================================================================

export function LoveLetterGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);
  const view = publicView?.view as LoveLetterPublicState | undefined;
  const me = view?.yourSeat ?? null;
  const hot = useHotSeat(me, view ? requiredSeat(view) : null);
  const [guardTarget, setGuardTarget] = useState<SeatIndex | null>(null);
  const phase = view?.phase;
  useEffect(() => {
    if (phase !== 'guardTargeting') setGuardTarget(null);
  }, [phase]);

  if (!view) return null;
  const act: Dispatch = (a) => dispatch(a);
  const ackAll = (type: 'ackStart' | 'ackEffect' | 'ackRoundOver') => {
    for (const s of hot.ackSeats(view.waitingOn)) dispatch({ type, bySeat: s });
  };

  const myTurnTargeting = me !== null && view.currentSeat === me && TARGETING.includes(view.phase);
  const candidates = myTurnTargeting ? targetCandidates(view) : [];
  const onTarget = (seat: SeatIndex) => {
    if (me === null) return;
    if (view.phase === 'guardTargeting') setGuardTarget(seat);
    else act({ type: 'chooseTarget', bySeat: me, target: seat });
  };
  const others = view.players.filter((p) => p.index !== me);
  const mine = me !== null ? view.players.find((p) => p.index === me) : undefined;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Love Letter</h2>
          <p className={styles.subtitle}>
            Round {view.roundNumber} · first to {view.tokensToWin} tokens of affection
          </p>
        </div>
        <button onClick={exitGame} className={styles.ghostButton}>
          Leave the court
        </button>
      </header>

      <div className={styles.table}>
        <div className={styles.opponents}>
          {others.map((p) => (
            <SeatMat
              key={p.index}
              p={p}
              view={view}
              targetable={candidates.includes(p.index)}
              selected={view.phase === 'guardTargeting' && guardTarget === p.index}
              onTarget={() => onTarget(p.index)}
            />
          ))}
        </div>

        <div className={styles.center}>
          <DeckArea view={view} />
          <div className={styles.stage} aria-live="polite">
            <Stage view={view} />
          </div>
        </div>

        {mine && (
          <div className={styles.mySide}>
            <SeatMat
              p={mine}
              view={view}
              isMe
              targetable={candidates.includes(mine.index)}
              selected={false}
              onTarget={() => onTarget(mine.index)}
            />
            <YourHand view={view} dispatch={act} />
          </div>
        )}
      </div>

      <ActionBar
        view={view}
        dispatch={act}
        ackAll={ackAll}
        canAck={hot.ackSeats(view.waitingOn).length > 0}
        candidates={candidates}
        guardTarget={guardTarget}
        setGuardTarget={setGuardTarget}
        onTarget={onTarget}
        exitGame={exitGame}
      />

      <Chronicle view={view} />

      {hot.showCover && hot.handoffTo !== null && (
        <div className={styles.cover} role="dialog" aria-modal="true" aria-labelledby="ll-cover-title">
          <div className={styles.coverCard}>
            <div className={styles.coverLetter}>
              <LoveCardBack />
            </div>
            <h3 id="ll-cover-title" className={styles.coverTitle}>
              A letter for {nameOf(view, hot.handoffTo)}
            </h3>
            <p className={styles.coverText}>Pass the device. Everyone else, avert your eyes.</p>
            <button autoFocus className={styles.primaryButton} onClick={hot.accept}>
              I am {nameOf(view, hot.handoffTo)} — break the seal
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

function Gems({ have, of }: { have: number; of: number }) {
  return (
    <div className={styles.gems} aria-label={`${have} of ${of} tokens`}>
      {Array.from({ length: Math.max(of, have) }, (_, i) => (
        <span key={`${i}-${i < have}`} className={i < have ? styles.gemNew : styles.gemSlot}>
          <TokenGem filled={i < have} size={18} />
        </span>
      ))}
    </div>
  );
}

function MiniCard({ rank, className, style }: { rank: Rank; className?: string; style?: CSSProperties }) {
  return (
    <span className={`${styles.mini} ${className ?? ''}`} style={style} title={`${RANK_NAMES[rank]} (${rank})`}>
      <LoveCard rank={rank} showText={false} />
    </span>
  );
}

function SeatMat({
  p,
  view,
  isMe = false,
  targetable,
  selected,
  onTarget,
}: {
  p: PublicPlayer;
  view: LoveLetterPublicState;
  isMe?: boolean;
  targetable: boolean;
  selected: boolean;
  onTarget: () => void;
}) {
  const active = view.currentSeat === p.index && !p.eliminated && view.phase !== 'roundOver' && view.phase !== 'gameOver';
  const known = view.yourKnowledge.find((k) => k.seat === p.index);
  const cls = [
    styles.mat,
    isMe ? styles.matMe : '',
    active ? styles.matActive : '',
    p.eliminated ? styles.matOut : '',
    p.protected ? styles.matShielded : '',
    targetable ? styles.matTargetable : '',
    selected ? styles.matSelected : '',
  ]
    .filter(Boolean)
    .join(' ');
  const body = (
    <>
      <div className={styles.matHead}>
        <span className={styles.matName}>
          {p.name}
          {isMe && <span className={styles.youTag}> (you)</span>}
        </span>
        <Gems have={p.tokens} of={view.tokensToWin} />
      </div>
      <div className={styles.matRow}>
        {!isMe && (
          <div className={styles.backs} aria-label={`${p.handSize} card${p.handSize === 1 ? '' : 's'} in hand`}>
            {Array.from({ length: p.handSize }, (_, i) => (
              <span key={`${view.roundNumber}-${i}`} className={styles.back} style={{ '--i': i } as CSSProperties}>
                <LoveCardBack />
              </span>
            ))}
          </div>
        )}
        <div className={styles.discards} aria-label={`Played: ${p.discard.map((c) => RANK_NAMES[c]).join(', ') || 'nothing'}`}>
          {p.discard.map((c, i) => (
            <MiniCard key={`${view.roundNumber}-${i}`} rank={c} className={styles.discardIn} style={{ '--i': i } as CSSProperties} />
          ))}
          {p.discard.length === 0 && <span className={styles.none}>no cards played</span>}
        </div>
      </div>
      <div className={styles.badges}>
        {active && <span className={styles.badgeTurn}>{isMe ? 'your turn' : 'their turn'}</span>}
        {p.protected && !p.eliminated && <span className={styles.badgeShield}>⛨ protected</span>}
        {known && (
          <span className={styles.badgeKnown} title={`You learned this from the ${known.source}`}>
            you know: {RANK_NAMES[known.card]}
          </span>
        )}
      </div>
      {p.eliminated && <span className={styles.outStamp}>Out</span>}
    </>
  );
  if (targetable) {
    return (
      <button type="button" className={cls} onClick={onTarget} aria-pressed={selected} aria-label={`Target ${p.name}`}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

// ============================================================================
// Your hand
// ============================================================================

function DealtCard({ rank, delay }: { rank: Rank; delay: number }) {
  const shown = useRevealAfter(delay + 380);
  return (
    <FlipCard
      revealed={shown}
      front={<LoveCard rank={rank} />}
      back={<LoveCardBack />}
      width="var(--ll-hand-w)"
      height="calc(var(--ll-hand-w) * 1.397)"
      dealDelayMs={delay}
      radius={9}
    />
  );
}

function YourHand({ view, dispatch }: { view: LoveLetterPublicState; dispatch: Dispatch }) {
  const keys = useCardKeys(view.yourHand, `${view.roundNumber}:${view.yourSeat}`);
  const me = view.yourSeat;
  if (me === null) return null;
  const hand = view.yourHand;
  const canPlay = view.phase === 'turn' && view.isYourTurn && hand.length === 2;
  const forced = hand.includes(7) && (hand.includes(5) || hand.includes(6));
  if (hand.length === 0) {
    return <div className={styles.handEmpty}>{view.players.find((p) => p.index === me)?.eliminated ? 'Out of the round' : ''}</div>;
  }
  return (
    <div className={styles.hand}>
      {hand.map((c, i) => {
        const disabled = !canPlay || (forced && c !== 7);
        return (
          <button
            key={keys[i]}
            type="button"
            className={`${styles.handCard} ${canPlay && !disabled ? styles.handCardPlayable : ''}`}
            disabled={disabled}
            onClick={() => dispatch({ type: 'playCard', bySeat: me, card: c })}
            aria-label={`${canPlay ? 'Play ' : ''}${RANK_NAMES[c]} (${c}): ${cardEffectText(c)}`}
            title={canPlay ? (disabled ? 'You must play the Countess' : `Play the ${RANK_NAMES[c]}`) : RANK_NAMES[c]}
          >
            <DealtCard rank={c} delay={i * 140} />
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Deck + set-aside
// ============================================================================

function DeckArea({ view }: { view: LoveLetterPublicState }) {
  const layers = Math.min(4, Math.ceil(view.deckRemaining / 3));
  return (
    <div className={styles.deckArea}>
      <div className={styles.deck} aria-label={`${view.deckRemaining} cards left in the deck`}>
        {view.deckRemaining === 0 && <span className={styles.deckEmpty}>empty</span>}
        {Array.from({ length: layers }, (_, i) => (
          <span key={i} className={styles.deckLayer} style={{ '--i': i } as CSSProperties}>
            <LoveCardBack />
          </span>
        ))}
        <span className={styles.deckCount} key={view.deckRemaining}>
          {view.deckRemaining}
        </span>
      </div>
      <div className={styles.setAside}>
        <span className={styles.setAsideCard} aria-label="One card set aside face-down">
          <LoveCardBack />
        </span>
        <span className={styles.caption}>set aside</span>
      </div>
      {view.setAsideFaceUp.length > 0 && (
        <div className={styles.faceUp}>
          <div className={styles.faceUpCards}>
            {view.setAsideFaceUp.map((c, i) => (
              <MiniCard key={`${view.roundNumber}-${i}`} rank={c} />
            ))}
          </div>
          <span className={styles.caption}>removed face-up</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Stage — the animated centre of the table
// ============================================================================

function StageCard({ rank, className }: { rank: Rank | null; className?: string }) {
  return (
    <span className={`${styles.stageCard} ${className ?? ''}`}>
      {rank !== null ? <LoveCard rank={rank} /> : <LoveCardBack />}
    </span>
  );
}

function FlipReveal({ rank, delay, className }: { rank: Rank; delay: number; className?: string }) {
  const shown = useRevealAfter(delay);
  return (
    <span className={className}>
      <FlipCard
        revealed={shown}
        front={<LoveCard rank={rank} />}
        back={<LoveCardBack />}
        width="var(--ll-stage-w)"
        height="calc(var(--ll-stage-w) * 1.397)"
        radius={8}
      />
    </span>
  );
}

function Stamp({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'red' | 'green' }) {
  return <span className={`${styles.stamp} ${styles[`stamp_${tone}`]}`}>{children}</span>;
}

function Stage({ view }: { view: LoveLetterPublicState }) {
  // Every play adds a discard, every resolution changes phase: together they
  // give a key that changes once per beat (so animations replay) and not on
  // acks or seat switches.
  const played = view.players.reduce((n, p) => n + p.discard.length, 0);
  const key = `${view.roundNumber}-${played}-${view.deckRemaining}-${view.phase}`;
  return (
    <div key={key} className={styles.stageInner}>
      <StageBody view={view} />
    </div>
  );
}

function StageBody({ view }: { view: LoveLetterPublicState }) {
  const me = view.yourSeat;
  const actor = view.currentSeat;
  switch (view.phase) {
    case 'roundStart':
      return (
        <div className={styles.stageTitleCard}>
          <span className={styles.flourish}>❦</span>
          <h3 className={styles.stageTitle}>Round {view.roundNumber}</h3>
          <p className={styles.stageText}>
            Letters are dealt. {nameOf(view, actor)} writes first.
          </p>
        </div>
      );
    case 'turn':
      return (
        <div className={styles.stageTitleCard}>
          <span className={`${styles.quill}`}>✒</span>
          <p className={styles.stageText}>
            {actor === me ? 'Your turn — choose a card to play.' : `${nameOf(view, actor)} is choosing a card…`}
          </p>
        </div>
      );
    case 'guardTargeting':
    case 'priestTargeting':
    case 'baronTargeting':
    case 'kingTargeting':
    case 'princeTargeting': {
      const played = view.players.find((p) => p.index === actor)?.discard.at(-1) ?? null;
      return (
        <div className={styles.stageRow}>
          <StageCard rank={played} className={styles.playedIn} />
          <p className={styles.stageText}>
            {actor === me ? 'Choose a player' : `${nameOf(view, actor)} is choosing a target…`}
          </p>
        </div>
      );
    }
    case 'priestReveal':
      return <PriestStage view={view} />;
    case 'effectReveal':
      return <EffectStage view={view} />;
    case 'roundOver':
    case 'gameOver':
      return <RoundEndStage view={view} />;
  }
}

function PriestStage({ view }: { view: LoveLetterPublicState }) {
  const e = view.lastEffect;
  const peek = view.yourPriestPeek;
  if (!e) return null;
  return (
    <div className={styles.stageRow}>
      <StageCard rank={2} className={styles.playedIn} />
      <div className={styles.peekCol}>
        {peek ? (
          <>
            <FlipReveal rank={peek.card} delay={500} className={styles.peekCard} />
            <p className={styles.stageText}>
              {nameOf(view, peek.target)} holds the <b>{RANK_NAMES[peek.card]}</b>. Only you can see this.
            </p>
          </>
        ) : (
          <>
            <span className={styles.peeking}>
              <StageCard rank={null} />
            </span>
            <p className={styles.stageText}>
              {nameOf(view, e.actorSeat)} reads {nameOf(view, e.targetSeat)}'s letter in secret…
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function EffectStage({ view }: { view: LoveLetterPublicState }) {
  const e = view.lastEffect;
  if (!e) return null;
  const me = view.yourSeat;
  const a = nameOf(view, e.actorSeat);
  const t = nameOf(view, e.targetSeat);
  const secret = view.yourSecret;

  switch (e.kind) {
    case 'guardHit':
    case 'guardMiss': {
      const hit = e.kind === 'guardHit';
      return (
        <div className={styles.stageRow}>
          <StageCard rank={1} className={styles.playedIn} />
          <div className={styles.guessBubble}>
            <span className={styles.caption}>{a} names</span>
            <MiniCard rank={e.guessedRank ?? 2} className={styles.guessCard} />
            <span className={styles.caption}>for {t}</span>
          </div>
          {hit && e.revealedCards?.[0] ? (
            <span className={styles.hitCol}>
              <FlipReveal rank={e.revealedCards[0]} delay={650} className={styles.shakeLate} />
              <Stamp tone="red">Caught!</Stamp>
            </span>
          ) : (
            <span className={styles.hitCol}>
              <StageCard rank={null} />
              <Stamp>Wrong guess</Stamp>
            </span>
          )}
        </div>
      );
    }

    case 'baronCompare': {
      const mineSecret = secret?.kind === 'baron' ? secret : null;
      const loser = e.loserSeat ?? null;
      const loserCard = e.revealedCards?.[0] ?? null;
      const slot = (seat: SeatIndex, side: 'left' | 'right') => {
        const isLoser = loser === seat;
        const face: Rank | null = mineSecret
          ? seat === mineSecret.actorSeat
            ? mineSecret.actorCard
            : mineSecret.targetCard
          : isLoser
            ? loserCard
            : null;
        return (
          <div className={`${styles.duelSlot} ${side === 'left' ? styles.duelLeft : styles.duelRight}`}>
            <span className={isLoser ? styles.duelLoser : ''}>
              {face !== null ? <FlipReveal rank={face} delay={700} /> : <StageCard rank={null} />}
            </span>
            <span className={styles.caption}>
              {nameOf(view, seat)}
              {seat === me ? ' (you)' : ''}
            </span>
          </div>
        );
      };
      return (
        <div className={styles.duel}>
          {slot(e.actorSeat, 'left')}
          <div className={styles.duelMid}>
            <CrossedSwords />
            {loser === null ? <Stamp>Tie</Stamp> : <Stamp tone="red">{nameOf(view, loser)} is out</Stamp>}
          </div>
          {e.targetSeat !== null && slot(e.targetSeat, 'right')}
        </div>
      );
    }

    case 'kingSwap': {
      const mineSecret = secret?.kind === 'king' ? secret : null;
      const leftFace = mineSecret ? mineSecret.actorCard : null;
      const rightFace = mineSecret ? mineSecret.targetCard : null;
      let caption = `${a} and ${t} trade hands.`;
      if (mineSecret && me !== null) {
        const gave = me === mineSecret.actorSeat ? mineSecret.actorCard : mineSecret.targetCard;
        const got = me === mineSecret.actorSeat ? mineSecret.targetCard : mineSecret.actorCard;
        caption = `You gave the ${RANK_NAMES[gave]} and received the ${RANK_NAMES[got]}.`;
      }
      return (
        <div className={styles.swapWrap}>
          <div className={styles.swap}>
            <span className={styles.swapA}>
              <StageCard rank={leftFace} />
            </span>
            <span className={styles.swapCrown}>♛</span>
            <span className={styles.swapB}>
              <StageCard rank={rightFace} />
            </span>
          </div>
          <div className={styles.swapNames}>
            <span>{a}</span>
            <span>{t}</span>
          </div>
          <p className={styles.stageText}>{caption}</p>
        </div>
      );
    }

    case 'princeDiscard':
    case 'princessDiscard': {
      const card = e.revealedCards?.[0] ?? (e.kind === 'princessDiscard' ? 8 : null);
      return (
        <div className={styles.stageRow}>
          <StageCard rank={e.playedCard} className={styles.playedIn} />
          <span className={styles.hitCol}>
            {card !== null && <span className={styles.flutter}><StageCard rank={card} /></span>}
            {e.princeWasPrincess ? <Stamp tone="red">♥ broken — {t} is out</Stamp> : <Stamp>{t} redraws</Stamp>}
          </span>
        </div>
      );
    }

    case 'handmaidShield':
      return (
        <div className={styles.stageRow}>
          <span className={styles.shieldAura}>
            <StageCard rank={4} className={styles.playedIn} />
          </span>
          <p className={styles.stageText}>{a} is protected until their next turn.</p>
        </div>
      );

    case 'noTargets':
      return (
        <div className={styles.stageRow}>
          <StageCard rank={e.playedCard} className={styles.playedIn} />
          <Stamp>No effect</Stamp>
        </div>
      );

    case 'priestPeek':
      return null;
  }
}

function CrossedSwords() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden className={styles.swords}>
      <g stroke="#f3d27a" strokeWidth="2.4" strokeLinecap="round">
        <path d="M8 8 L36 36" />
        <path d="M40 8 L12 36" />
      </g>
      <g stroke="#8a6420" strokeWidth="3.4" strokeLinecap="round">
        <path d="M31 39 L39 31" />
        <path d="M9 31 L17 39" />
      </g>
      <circle cx="40" cy="40" r="2.6" fill="#b3122a" />
      <circle cx="8" cy="40" r="2.6" fill="#b3122a" />
    </svg>
  );
}

function RoundEndStage({ view }: { view: LoveLetterPublicState }) {
  const r = view.lastRound;
  if (!r) return null;
  const over = view.phase === 'gameOver';
  const winners = (over ? view.matchWinners : r.winnerSeats).map((s) => nameOf(view, s)).join(' & ') || 'Nobody';
  const shown = Object.entries(r.finalHands).filter(([, h]) => h.length > 0);
  return (
    <div className={styles.roundEnd}>
      <span className={styles.bigGem}>
        <TokenGem size={64} />
      </span>
      <h3 className={styles.stageTitle}>
        {over ? `${winners} wins the Princess's heart` : `${winners} ${r.winnerSeats.length > 1 ? 'share' : 'wins'} a token of affection`}
      </h3>
      <p className={styles.stageText}>
        {r.reason === 'lastStanding'
          ? 'The last suitor standing.'
          : 'The deck ran dry — the highest card wins (ties: highest total played).'}
      </p>
      {shown.length > 0 && (
        <div className={styles.showdown}>
          {shown.map(([seat, hand]) => (
            <div key={seat} className={styles.showdownSeat}>
              {hand.map((c, i) => (
                <MiniCard key={i} rank={c} className={styles.discardIn} />
              ))}
              <span className={styles.caption}>{nameOf(view, Number(seat))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Action bar
// ============================================================================

const GUESSES: Rank[] = [2, 3, 4, 5, 6, 7, 8];

function ActionBar({
  view,
  dispatch,
  ackAll,
  canAck,
  candidates,
  guardTarget,
  setGuardTarget,
  onTarget,
  exitGame,
}: {
  view: LoveLetterPublicState;
  dispatch: Dispatch;
  ackAll: (type: 'ackStart' | 'ackEffect' | 'ackRoundOver') => void;
  canAck: boolean;
  candidates: SeatIndex[];
  guardTarget: SeatIndex | null;
  setGuardTarget: (s: SeatIndex | null) => void;
  onTarget: (s: SeatIndex) => void;
  exitGame: () => void;
}) {
  const me = view.yourSeat;
  const myTurn = me !== null && view.currentSeat === me;
  const waiting =
    view.waitingOn.length > 0 ? `Waiting for ${view.waitingOn.map((s) => nameOf(view, s)).join(', ')}…` : '';

  let content: ReactNode = null;
  switch (view.phase) {
    case 'roundStart':
      content = (
        <>
          <p className={styles.barText}>Look at your card, then signal you're ready.</p>
          <button className={styles.primaryButton} disabled={!canAck} onClick={() => ackAll('ackStart')}>
            {canAck ? "I'm ready" : waiting || 'Ready'}
          </button>
        </>
      );
      break;
    case 'turn': {
      const forced = myTurn && view.yourHand.includes(7) && (view.yourHand.includes(5) || view.yourHand.includes(6));
      content = myTurn ? (
        <p className={styles.barText}>
          {forced
            ? `You hold the Countess with the ${view.yourHand.includes(6) ? 'King' : 'Prince'} — you must play the Countess.`
            : 'Tap one of your two cards to play it.'}
        </p>
      ) : (
        <p className={styles.barText}>Waiting for {nameOf(view, view.currentSeat)} to play…</p>
      );
      break;
    }
    case 'guardTargeting':
      content = myTurn ? (
        <div className={styles.barCol}>
          <TargetChips view={view} candidates={candidates} selected={guardTarget} onPick={(s) => setGuardTarget(s)} label="Accuse" />
          <div className={styles.guessRow} role="group" aria-label="Name a card">
            {GUESSES.map((r) => (
              <button
                key={r}
                type="button"
                className={styles.guessButton}
                disabled={guardTarget === null}
                onClick={() => {
                  if (me === null || guardTarget === null) return;
                  dispatch({ type: 'guardGuess', bySeat: me, target: guardTarget, guess: r });
                  setGuardTarget(null);
                }}
                aria-label={`Guess ${RANK_NAMES[r]}`}
                title={`Name the ${RANK_NAMES[r]}`}
              >
                <MiniCard rank={r} />
                <span>{RANK_NAMES[r]}</span>
              </button>
            ))}
          </div>
          <p className={styles.barHint}>{guardTarget === null ? 'First choose who to accuse.' : `Name the card you think ${nameOf(view, guardTarget)} holds.`}</p>
        </div>
      ) : (
        <p className={styles.barText}>{nameOf(view, view.currentSeat)} raises the Guard…</p>
      );
      break;
    case 'priestTargeting':
    case 'baronTargeting':
    case 'kingTargeting':
    case 'princeTargeting': {
      const label =
        view.phase === 'priestTargeting'
          ? 'Peek at'
          : view.phase === 'baronTargeting'
            ? 'Duel with'
            : view.phase === 'kingTargeting'
              ? 'Trade with'
              : 'Force a discard';
      content = myTurn ? (
        <TargetChips view={view} candidates={candidates} selected={null} onPick={onTarget} label={label} />
      ) : (
        <p className={styles.barText}>{nameOf(view, view.currentSeat)} is choosing a target…</p>
      );
      break;
    }
    case 'priestReveal':
      content =
        view.yourPriestPeek && me !== null ? (
          <button className={styles.primaryButton} onClick={() => dispatch({ type: 'ackPriest', bySeat: me })}>
            I've memorised it — seal the letter
          </button>
        ) : (
          <p className={styles.barText}>{waiting}</p>
        );
      break;
    case 'effectReveal':
      content = (
        <>
          <p className={styles.barText}>{view.lastEffect?.message}</p>
          <button className={styles.primaryButton} disabled={!canAck} onClick={() => ackAll('ackEffect')}>
            {canAck ? 'Continue' : waiting || 'Continue'}
          </button>
        </>
      );
      break;
    case 'roundOver':
      content = (
        <button className={styles.primaryButton} disabled={!canAck} onClick={() => ackAll('ackRoundOver')}>
          {canAck ? 'Deal the next round' : waiting || 'Next round'}
        </button>
      );
      break;
    case 'gameOver':
      content = (
        <button className={styles.primaryButton} onClick={exitGame}>
          Return to the menu
        </button>
      );
      break;
  }
  return <div className={styles.bar}>{content}</div>;
}

function TargetChips({
  view,
  candidates,
  selected,
  onPick,
  label,
}: {
  view: LoveLetterPublicState;
  candidates: SeatIndex[];
  selected: SeatIndex | null;
  onPick: (s: SeatIndex) => void;
  label: string;
}) {
  return (
    <div className={styles.chips} role="group" aria-label={label}>
      <span className={styles.barText}>{label}:</span>
      {candidates.map((s) => (
        <button
          key={s}
          type="button"
          className={`${styles.chip} ${selected === s ? styles.chipOn : ''}`}
          aria-pressed={selected === s}
          onClick={() => onPick(s)}
        >
          {nameOf(view, s)}
          {s === view.yourSeat ? ' (you)' : ''}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Chronicle (public play-by-play)
// ============================================================================

function Chronicle({ view }: { view: LoveLetterPublicState }) {
  const lines = view.log.filter((l) => l.round === view.roundNumber).slice(-6);
  if (lines.length === 0) return null;
  return (
    <ol className={styles.chronicle} aria-label="Recent plays">
      {lines.map((l, i) => (
        <li key={`${view.roundNumber}-${i}-${l.text}`}>{l.text}</li>
      ))}
    </ol>
  );
}
