import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { LoveLetterAction } from '../actions';
import type {
  Card,
  LoveLetterPublicState,
  PublicPlayer,
  Rank,
} from '../state';
import { RANK_NAMES } from '../state';
import styles from './GameView.module.css';

// Love Letter game view. The whole UI is a phase machine: each phase has
// its own action panel below the board. The board itself shows every seat,
// their public discard, hand size, token count, and protected/eliminated
// status.

export function LoveLetterGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);

  if (!publicView) return null;
  const view = publicView.view as LoveLetterPublicState;
  const dispatchAction = (a: LoveLetterAction) => dispatch(a);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Love Letter</h2>
          <p className={styles.subtitle}>
            Round {view.roundNumber} · first to {view.tokensToWin} token
            {view.tokensToWin === 1 ? '' : 's'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exitGame} className={styles.secondaryButton}>
            Exit
          </button>
        </div>
      </header>

      <Board view={view} localSeat={localSeat} onPickSeat={(s) => setLocalSeat(s)} />

      <PhasePanel view={view} localSeat={localSeat} dispatch={dispatchAction} />

      <FaceUpRow view={view} />
    </div>
  );
}

// ============================================================================
// Board — one panel per seat
// ============================================================================

function Board({
  view,
  localSeat,
  onPickSeat,
}: {
  view: LoveLetterPublicState;
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
  view: LoveLetterPublicState;
  isLocal: boolean;
  onPick: () => void;
}) {
  const isActive = p.index === view.currentSeat;
  const classes = [
    styles.seatPanel,
    isActive ? styles.active : '',
    isLocal ? styles.localSeat : '',
    p.eliminated ? styles.eliminatedSeat : '',
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
            {p.protected && !p.eliminated && (
              <span className={styles.statusGood}>shielded</span>
            )}
            {isActive && !p.eliminated && (
              <span className={styles.statusActive}>turn</span>
            )}
          </div>
        </div>
        <div className={styles.seatTokens}>
          <div className={styles.tokenCount}>{p.tokens}</div>
          <div className={styles.tokenLabel}>tokens</div>
        </div>
      </div>

      <div className={styles.handRow}>
        <span className={styles.handLabel}>hand:</span>
        {isLocal ? (
          <YourHandStrip view={view} />
        ) : (
          <span className={styles.handHidden}>
            {Array.from({ length: p.handSize }, (_, i) => (
              <span key={i} className={styles.cardBack} />
            ))}
            {p.handSize === 0 && (
              <span className={styles.handEmpty}>empty</span>
            )}
          </span>
        )}
      </div>

      <div className={styles.discardRow}>
        <span className={styles.discardLabel}>played:</span>
        {p.discard.length === 0 && <span className={styles.discardEmpty}>—</span>}
        <div className={styles.discardList}>
          {p.discard.map((c, i) => (
            <CardPip key={i} card={c} />
          ))}
        </div>
      </div>

      {!isLocal && (
        <button onClick={onPick} className={styles.passButton}>
          look from this seat
        </button>
      )}
    </div>
  );
}

function YourHandStrip({ view }: { view: LoveLetterPublicState }) {
  if (view.yourHand.length === 0) {
    return <span className={styles.handEmpty}>empty</span>;
  }
  return (
    <div className={styles.yourHand}>
      {view.yourHand.map((c, i) => (
        <CardPip key={i} card={c} large />
      ))}
    </div>
  );
}

function CardPip({ card, large }: { card: Card; large?: boolean }) {
  return (
    <span
      className={`${styles.cardPip} ${large ? styles.cardPipLarge : ''} ${rankColorClass(card)}`}
      title={`${RANK_NAMES[card]} (${card})`}
    >
      <span className={styles.cardPipRank}>{card}</span>
      <span className={styles.cardPipName}>{RANK_NAMES[card]}</span>
    </span>
  );
}

function rankColorClass(card: Card): string {
  // Pink palette graded by rank — Princess is hot pink, Guard is muted.
  if (card >= 8) return styles.cardP8;
  if (card === 7) return styles.cardP7;
  if (card === 6) return styles.cardP6;
  if (card === 5) return styles.cardP5;
  if (card === 4) return styles.cardP4;
  if (card === 3) return styles.cardP3;
  if (card === 2) return styles.cardP2;
  return styles.cardP1;
}

// ============================================================================
// Face-up row (2-player set-aside + deck count)
// ============================================================================

function FaceUpRow({ view }: { view: LoveLetterPublicState }) {
  return (
    <div className={styles.faceUpRow}>
      <div>
        <div className={styles.faceUpLabel}>Deck</div>
        <div className={styles.faceUpValue}>{view.deckRemaining} left</div>
      </div>
      {view.setAsideFaceUp.length > 0 && (
        <div>
          <div className={styles.faceUpLabel}>Set aside (face up)</div>
          <div className={styles.faceUpRowCards}>
            {view.setAsideFaceUp.map((c, i) => (
              <CardPip key={i} card={c} />
            ))}
          </div>
        </div>
      )}
      <div>
        <div className={styles.faceUpLabel}>Set aside (face down)</div>
        <div className={styles.faceUpValue}>1 card · hidden</div>
      </div>
    </div>
  );
}

// ============================================================================
// Phase panel — switches on phase and renders the active controls
// ============================================================================

function PhasePanel({
  view,
  localSeat,
  dispatch,
}: {
  view: LoveLetterPublicState;
  localSeat: number | null;
  dispatch: (a: LoveLetterAction) => void;
}) {
  switch (view.phase) {
    case 'roundStart':
      return <RoundStartPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
    case 'turn':
      return <TurnPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
    case 'guardTargeting':
      return <GuardPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
    case 'priestTargeting':
    case 'baronTargeting':
    case 'kingTargeting':
    case 'princeTargeting':
      return <TargetingPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
    case 'effectReveal':
      return <EffectRevealPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
    case 'priestReveal':
      return <PriestRevealPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
    case 'roundOver':
      return <RoundOverPanel view={view} localSeat={localSeat} dispatch={dispatch} />;
    case 'gameOver':
      return <GameOverPanel view={view} />;
  }
}

function RoundStartPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: LoveLetterPublicState;
  localSeat: number | null;
  dispatch: (a: LoveLetterAction) => void;
}) {
  const ackedCount = view.players.filter((p) => !view.yourAckPending || p.index !== localSeat).length;
  const isPending = view.yourAckPending;
  return (
    <div className={`${styles.panel} ${styles.actionPanel}`}>
      <h3 style={{ margin: 0 }}>Round {view.roundNumber} — review your card</h3>
      <p style={{ color: '#94a3b8', margin: 0 }}>
        You start the round with one card. Memorize it, then continue.
      </p>
      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          disabled={localSeat === null || !isPending}
          onClick={() =>
            dispatch({ type: 'ackStart', bySeat: localSeat! })
          }
        >
          {isPending ? "I'm ready" : 'Waiting for others…'}
        </button>
        <span style={{ color: '#94a3b8', fontSize: 13 }}>
          Tip: pass the device to each seat so they can look at their card before continuing.
          ({ackedCount}/{view.players.length})
        </span>
      </div>
    </div>
  );
}

function TurnPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: LoveLetterPublicState;
  localSeat: number | null;
  dispatch: (a: LoveLetterAction) => void;
}) {
  const isMyTurn = localSeat === view.currentSeat;
  const actorName = view.players[view.currentSeat]?.name ?? '?';
  if (!isMyTurn) {
    return (
      <div className={`${styles.panel} ${styles.actionPanel}`}>
        <p style={{ margin: 0, color: '#cbd5e1' }}>
          Waiting for <b>{actorName}</b> to play a card…
        </p>
      </div>
    );
  }
  const hand = view.yourHand;
  if (hand.length < 2) {
    return (
      <div className={`${styles.panel} ${styles.actionPanel}`}>
        <p style={{ margin: 0, color: '#cbd5e1' }}>Drawing a card…</p>
      </div>
    );
  }
  // Countess force.
  const hasCountess = hand.includes(7);
  const hasKingOrPrince = hand.includes(5) || hand.includes(6);
  const forceCountess = hasCountess && hasKingOrPrince;
  return (
    <div className={`${styles.panel} ${styles.actionPanel}`}>
      <h3 style={{ margin: 0 }}>Your turn — choose a card to play</h3>
      {forceCountess && (
        <p style={{ margin: 0, color: '#fbbf24', fontSize: 13 }}>
          You hold the Countess with a {hand.includes(6) ? 'King' : 'Prince'} — you
          must play the Countess.
        </p>
      )}
      <div className={styles.actionRow}>
        {hand.map((c, i) => {
          const disabled = forceCountess && c !== 7;
          return (
            <button
              key={i}
              className={`${styles.cardChoice} ${rankColorClass(c)} ${disabled ? styles.cardChoiceDisabled : ''}`}
              disabled={disabled}
              onClick={() =>
                dispatch({ type: 'playCard', bySeat: localSeat!, card: c })
              }
            >
              <div className={styles.cardChoiceRank}>{c}</div>
              <div className={styles.cardChoiceName}>{RANK_NAMES[c]}</div>
              <div className={styles.cardChoiceDesc}>{cardDescription(c)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function cardDescription(c: Card): string {
  switch (c) {
    case 1:
      return 'Guess a non-Guard rank on a target. Hit → they\'re out.';
    case 2:
      return 'Peek at a target\'s hand (only you see it).';
    case 3:
      return 'Compare hands with a target. Lower is out.';
    case 4:
      return 'You\'re shielded until your next turn.';
    case 5:
      return 'Target (incl. self) discards & redraws. Princess → out.';
    case 6:
      return 'Swap hands with a target.';
    case 7:
      return 'Must play with King/Prince. Otherwise harmless.';
    case 8:
      return 'If you discard this, you are out.';
  }
}

function GuardPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: LoveLetterPublicState;
  localSeat: number | null;
  dispatch: (a: LoveLetterAction) => void;
}) {
  const isMyTurn = localSeat === view.currentSeat;
  const [target, setTarget] = useState<number | null>(null);
  const [guess, setGuess] = useState<Rank | null>(null);
  if (!isMyTurn) {
    const actorName = view.players[view.currentSeat]?.name ?? '?';
    return (
      <div className={`${styles.panel} ${styles.actionPanel}`}>
        <p style={{ margin: 0, color: '#cbd5e1' }}>
          <b>{actorName}</b> is choosing a Guard guess…
        </p>
      </div>
    );
  }
  const candidates = view.players.filter(
    (p) => !p.eliminated && p.index !== view.currentSeat && !p.protected,
  );
  const ranks: Rank[] = [2, 3, 4, 5, 6, 7, 8];
  return (
    <div className={`${styles.panel} ${styles.actionPanel}`}>
      <h3 style={{ margin: 0 }}>Guard — pick a target and guess a rank</h3>
      <div>
        <div className={styles.subPanelLabel}>Target</div>
        <div className={styles.actionRow}>
          {candidates.length === 0 && (
            <span style={{ color: '#94a3b8' }}>No valid targets.</span>
          )}
          {candidates.map((p) => (
            <button
              key={p.index}
              className={`${styles.chip} ${target === p.index ? styles.chipActive : ''}`}
              onClick={() => setTarget(p.index)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className={styles.subPanelLabel}>Guess</div>
        <div className={styles.actionRow}>
          {ranks.map((r) => (
            <button
              key={r}
              className={`${styles.chip} ${guess === r ? styles.chipActive : ''} ${rankColorClass(r)}`}
              onClick={() => setGuess(r)}
            >
              {r} · {RANK_NAMES[r]}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          disabled={target === null || guess === null}
          onClick={() =>
            dispatch({
              type: 'guardGuess',
              bySeat: localSeat!,
              target: target!,
              guess: guess!,
            })
          }
        >
          Submit guess →
        </button>
      </div>
    </div>
  );
}

function TargetingPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: LoveLetterPublicState;
  localSeat: number | null;
  dispatch: (a: LoveLetterAction) => void;
}) {
  const isMyTurn = localSeat === view.currentSeat;
  if (!isMyTurn) {
    const actorName = view.players[view.currentSeat]?.name ?? '?';
    return (
      <div className={`${styles.panel} ${styles.actionPanel}`}>
        <p style={{ margin: 0, color: '#cbd5e1' }}>
          <b>{actorName}</b> is choosing a target…
        </p>
      </div>
    );
  }
  const allowSelf = view.phase === 'princeTargeting';
  const candidates = view.players.filter(
    (p) =>
      !p.eliminated &&
      (allowSelf || p.index !== view.currentSeat) &&
      !p.protected,
  );
  const heading =
    view.phase === 'priestTargeting'
      ? 'Priest — pick whose hand to peek at'
      : view.phase === 'baronTargeting'
        ? 'Baron — pick whose hand to compare with'
        : view.phase === 'kingTargeting'
          ? 'King — pick whose hand to swap with'
          : 'Prince — pick who must discard (you may target yourself)';
  return (
    <div className={`${styles.panel} ${styles.actionPanel}`}>
      <h3 style={{ margin: 0 }}>{heading}</h3>
      <div className={styles.actionRow}>
        {candidates.length === 0 && (
          <span style={{ color: '#94a3b8' }}>No valid targets.</span>
        )}
        {candidates.map((p) => (
          <button
            key={p.index}
            className={`${styles.chip} ${styles.chipPrimary}`}
            onClick={() =>
              dispatch({ type: 'chooseTarget', bySeat: localSeat!, target: p.index })
            }
          >
            {p.name}
            {p.index === view.currentSeat && ' (you)'}
          </button>
        ))}
      </div>
    </div>
  );
}

function EffectRevealPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: LoveLetterPublicState;
  localSeat: number | null;
  dispatch: (a: LoveLetterAction) => void;
}) {
  const e = view.lastEffect;
  if (!e) return null;
  const ackedCount = view.players.length - (view.yourAckPending ? 1 : 0); // rough — UI only
  return (
    <div className={`${styles.panel} ${styles.actionPanel} ${styles.effectPanel}`}>
      <h3 style={{ margin: 0 }}>Reveal</h3>
      <p style={{ margin: 0, color: '#fdf2f8', fontSize: 14 }}>{e.message}</p>
      {e.revealedCards && (
        <div className={styles.actionRow}>
          {e.revealedCards.map((c, i) => (
            <CardPip key={i} card={c} large />
          ))}
        </div>
      )}
      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          disabled={localSeat === null || !view.yourAckPending}
          onClick={() =>
            dispatch({ type: 'ackEffect', bySeat: localSeat! })
          }
        >
          {view.yourAckPending ? 'Continue' : 'Waiting for others…'}
        </button>
        <span style={{ color: '#94a3b8', fontSize: 13 }}>
          Everyone must continue before the next turn. ({ackedCount}/
          {view.players.length})
        </span>
      </div>
    </div>
  );
}

function PriestRevealPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: LoveLetterPublicState;
  localSeat: number | null;
  dispatch: (a: LoveLetterAction) => void;
}) {
  const e = view.lastEffect;
  if (!e) return null;
  const peek = view.yourPriestPeek;
  const isActor = peek !== null;
  const actorName = view.players[e.actorSeat]?.name ?? '?';
  return (
    <div className={`${styles.panel} ${styles.actionPanel} ${styles.effectPanel}`}>
      <h3 style={{ margin: 0 }}>Priest peek</h3>
      <p style={{ margin: 0, color: '#fdf2f8' }}>{e.message}</p>
      {isActor && peek && (
        <div className={styles.peekBox}>
          <span style={{ color: '#cbd5e1', fontSize: 13 }}>
            {view.players[peek.target]?.name} is holding:
          </span>
          <CardPip card={peek.card} large />
        </div>
      )}
      <div className={styles.actionRow}>
        {isActor ? (
          <button
            className={styles.primaryButton}
            onClick={() =>
              dispatch({ type: 'ackPriest', bySeat: localSeat! })
            }
          >
            I&apos;ve seen it — continue
          </button>
        ) : (
          <span style={{ color: '#94a3b8', fontSize: 13 }}>
            Waiting for {actorName} to ack their peek…
          </span>
        )}
      </div>
    </div>
  );
}

function RoundOverPanel({
  view,
  localSeat,
  dispatch,
}: {
  view: LoveLetterPublicState;
  localSeat: number | null;
  dispatch: (a: LoveLetterAction) => void;
}) {
  const r = view.lastRound;
  if (!r) return null;
  const winnerNames = r.winnerSeats.map((i) => view.players[i]?.name ?? '?').join(', ');
  return (
    <div className={`${styles.panel} ${styles.actionPanel}`}>
      <h3 style={{ margin: 0 }}>
        Round {r.roundNumber} over —{' '}
        {r.winnerSeats.length === 1 ? winnerNames + ' wins a token' : winnerNames + ' split a token'}
      </h3>
      <p style={{ color: '#94a3b8', margin: 0, fontSize: 13 }}>
        {r.reason === 'lastStanding'
          ? 'Only one player remained in.'
          : 'Deck ran out — highest hand wins (ties broken by discard total).'}
      </p>
      <div className={styles.finalHandsList}>
        {Object.entries(r.finalHands).map(([seat, hand]) => {
          const idx = Number(seat);
          if (hand.length === 0) return null;
          return (
            <div key={seat} className={styles.finalHandRow}>
              <span className={styles.finalHandName}>
                {view.players[idx]?.name ?? '?'}
              </span>
              {hand.map((c, i) => (
                <CardPip key={i} card={c} />
              ))}
            </div>
          );
        })}
      </div>
      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          disabled={localSeat === null || !view.yourAckPending}
          onClick={() =>
            dispatch({ type: 'ackRoundOver', bySeat: localSeat! })
          }
        >
          {view.yourAckPending ? 'Next round →' : 'Waiting for others…'}
        </button>
      </div>
    </div>
  );
}

function GameOverPanel({ view }: { view: LoveLetterPublicState }) {
  const winners = view.matchWinners.map((i) => view.players[i]?.name ?? '?').join(', ');
  return (
    <div className={styles.gameOverPanel}>
      <div className={styles.gameOverLabel}>Match over</div>
      <div className={styles.gameOverWinner}>
        {winners || 'Nobody'} won the suit
      </div>
      <div className={styles.gameOverSub}>
        First to {view.tokensToWin} token{view.tokensToWin === 1 ? '' : 's'}.
      </div>
      <div className={styles.gameOverTokens}>
        {view.players.map((p) => (
          <span key={p.index} className={styles.gameOverTokenChip}>
            {p.name}: {p.tokens}
          </span>
        ))}
      </div>
    </div>
  );
}
