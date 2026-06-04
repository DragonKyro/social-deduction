import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { LiarsPokerAction } from '../actions';
import {
  claimLabel,
  compareClaim,
  isStrictRaise,
  RANK_LABEL,
  SUIT_LABEL,
} from '../hands';
import type { HandClaim, HandKind } from '../hands';
import type {
  Card,
  CardRank,
  LiarsPokerPublicState,
  PublicPlayer,
  Suit,
} from '../state';
import styles from './GameView.module.css';

const ALL_SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const ALL_RANKS: CardRank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function LiarsPokerGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);

  if (!publicView) return null;
  const view = publicView.view as LiarsPokerPublicState;
  const dispatchAction = (a: LiarsPokerAction) => dispatch(a);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Liar's Poker</h2>
          <p className={styles.subtitle}>
            Round {view.roundNumber} · {view.cardsPerPlayer} card{view.cardsPerPlayer === 1 ? '' : 's'} per player
            {view.dummyHand ? ' · dummy life on' : ''}
          </p>
        </div>
        <button onClick={exitGame} className={styles.secondaryButton}>
          Exit
        </button>
      </header>

      <Board view={view} localSeat={localSeat} onPickSeat={setLocalSeat} />

      <ClaimStrip view={view} />

      <PhasePanel view={view} localSeat={localSeat} dispatch={dispatchAction} />
    </div>
  );
}

function Board({
  view,
  localSeat,
  onPickSeat,
}: {
  view: LiarsPokerPublicState;
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
  view: LiarsPokerPublicState;
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
    p.isDummy ? styles.dummy : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <div className={styles.seatHeader}>
        <div>
          <div className={styles.seatName}>
            {p.name} {isLocal && <span className={styles.youTag}>(you)</span>}
            {p.isDummy && <span className={styles.dummyTag}>dummy</span>}
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
          <div className={styles.tokenCount}>
            {p.isDummy ? 1 : p.cardCount}
          </div>
          <div className={styles.tokenLabel}>cards</div>
        </div>
      </div>

      <div className={styles.handRow}>
        {isLocal ? (
          <YourHand view={view} isDummy={p.isDummy} />
        ) : (
          <OpponentHand p={p} />
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

function YourHand({ view, isDummy }: { view: LiarsPokerPublicState; isDummy: boolean }) {
  if (isDummy) {
    return <span className={styles.empty}>(your dummy card — can't see)</span>;
  }
  if (view.yourHand.length === 0) {
    return <span className={styles.empty}>—</span>;
  }
  return (
    <div className={styles.cardList}>
      {view.yourHand.map((c, i) => (
        <CardChip key={i} card={c} />
      ))}
    </div>
  );
}

function OpponentHand({
  p,
}: {
  p: PublicPlayer;
}) {
  // visibleHand is populated for dummies (always) and for everyone post-reveal.
  if (p.visibleHand && p.visibleHand.length > 0) {
    return (
      <div className={styles.cardList}>
        {p.visibleHand.map((c, i) => (
          <CardChip key={i} card={c} />
        ))}
      </div>
    );
  }
  const count = p.isDummy ? 1 : p.cardCount;
  if (count === 0) return <span className={styles.empty}>—</span>;
  return (
    <div className={styles.cardList}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={styles.cardBack} />
      ))}
    </div>
  );
}

function CardChip({ card }: { card: Card }) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  return (
    <span
      className={`${styles.cardChip} ${red ? styles.cardRed : styles.cardBlack}`}
      title={`${RANK_LABEL[card.rank]}${SUIT_LABEL[card.suit]}`}
    >
      <span className={styles.cardRank}>{RANK_LABEL[card.rank]}</span>
      <span className={styles.cardSuit}>{SUIT_LABEL[card.suit]}</span>
    </span>
  );
}

function ClaimStrip({ view }: { view: LiarsPokerPublicState }) {
  if (!view.currentClaim) {
    return (
      <div className={styles.claimStrip}>
        <span className={styles.claimLabel}>Current claim:</span>
        <span>— (no claim yet this round)</span>
      </div>
    );
  }
  return (
    <div className={styles.claimStrip}>
      <span className={styles.claimLabel}>Current claim:</span>
      <b>{claimLabel(view.currentClaim)}</b>
      <span>
        by {view.currentBidder !== null && view.seats[view.currentBidder]?.name}
      </span>
    </div>
  );
}

function PhasePanel({
  view,
  localSeat,
  dispatch,
}: {
  view: LiarsPokerPublicState;
  localSeat: number | null;
  dispatch: (a: LiarsPokerAction) => void;
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

  if (view.phase === 'dealPending') {
    return (
      <div className={styles.panel}>
        <h3 className={styles.h3}>Look at your cards</h3>
        <YourHand view={view} isDummy={view.players[localSeat]!.isDummy} />
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
          Reveal — {r.callerWon ? 'caller wins' : 'bluff succeeded'}
        </h3>
        <p style={{ color: '#cbd5e1' }}>
          {view.seats[r.bidder]?.name} claimed <b>{claimLabel(r.claim)}</b>.{' '}
          {view.seats[r.caller]?.name} called liar.{' '}
          The claim {r.claimExists ? 'EXISTS' : 'DOES NOT EXIST'} in the combined pool.
        </p>
        <p style={{ color: '#fca5a5' }}>
          {view.seats[r.loserSeat]?.name} loses a card.
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
        <p style={{ color: '#cbd5e1' }}>Redeal next.</p>
        <button
          className={styles.primaryButton}
          disabled={!view.yourAckPending}
          onClick={() => dispatch({ type: 'ackRoundOver', bySeat: localSeat })}
        >
          {view.yourAckPending ? 'Redeal →' : 'Acknowledged'}
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
  view: LiarsPokerPublicState;
  localSeat: number;
  dispatch: (a: LiarsPokerAction) => void;
}) {
  const [kind, setKind] = useState<HandKind>('pair');
  const [primaryRank, setPrimaryRank] = useState<CardRank>(7);
  const [secondaryRank, setSecondaryRank] = useState<CardRank>(3);
  const [suit, setSuit] = useState<Suit>('spades');

  const claim = buildClaim(kind, primaryRank, secondaryRank, suit);
  const isValid = (() => {
    if (!claim) return false;
    return isStrictRaise(view.currentClaim, claim);
  })();

  return (
    <div className={styles.panel}>
      <h3 className={styles.h3}>Declare a hand</h3>
      <div className={styles.bidControls}>
        <label>
          <span className={styles.controlLabel}>Hand</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as HandKind)}
            className={styles.bidSelect}
          >
            <option value="highCard">High card</option>
            <option value="pair">Pair</option>
            <option value="twoPair">Two pair</option>
            <option value="threeKind">Three of a kind</option>
            <option value="straight">Straight</option>
            <option value="flush">Flush (lower top = stronger!)</option>
            <option value="fullHouse">Full house</option>
            <option value="fourKind">Four of a kind</option>
            <option value="straightFlush">Straight flush</option>
          </select>
        </label>

        {kindNeedsPrimaryRank(kind) && (
          <label>
            <span className={styles.controlLabel}>{primaryRankLabel(kind)}</span>
            <select
              value={primaryRank}
              onChange={(e) => setPrimaryRank(Number(e.target.value) as CardRank)}
              className={styles.bidSelect}
            >
              {primaryRankOptions(kind).map((r) => (
                <option key={r} value={r}>
                  {RANK_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
        )}

        {kindNeedsSecondaryRank(kind) && (
          <label>
            <span className={styles.controlLabel}>{secondaryRankLabel(kind)}</span>
            <select
              value={secondaryRank}
              onChange={(e) => setSecondaryRank(Number(e.target.value) as CardRank)}
              className={styles.bidSelect}
            >
              {ALL_RANKS.filter((r) => r !== primaryRank).map((r) => (
                <option key={r} value={r}>
                  {RANK_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
        )}

        {kindNeedsSuit(kind) && (
          <label>
            <span className={styles.controlLabel}>Suit</span>
            <select
              value={suit}
              onChange={(e) => setSuit(e.target.value as Suit)}
              className={styles.bidSelect}
            >
              {ALL_SUITS.map((s) => (
                <option key={s} value={s}>
                  {SUIT_LABEL[s]} {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <p className={styles.preview}>
        Preview: <b>{claim ? claimLabel(claim) : '—'}</b>
        {view.currentClaim && claim && !isValid && (
          <span style={{ color: '#fca5a5', marginLeft: 8 }}>
            — not a strict raise over the current claim
          </span>
        )}
      </p>

      <div className={styles.bidControls}>
        <button
          className={styles.primaryButton}
          disabled={!isValid}
          onClick={() => {
            if (!claim) return;
            dispatch({ type: 'placeClaim', bySeat: localSeat, claim });
          }}
        >
          Declare
        </button>
        {view.currentClaim && (
          <button
            className={styles.actionButtonRed}
            onClick={() => dispatch({ type: 'callLiar', bySeat: localSeat })}
          >
            Call liar
          </button>
        )}
      </div>
    </div>
  );
}

function buildClaim(
  kind: HandKind,
  primary: CardRank,
  secondary: CardRank,
  suit: Suit,
): HandClaim | null {
  switch (kind) {
    case 'highCard':
      return { kind, rank: primary };
    case 'pair':
      return { kind, rank: primary };
    case 'twoPair': {
      if (primary === secondary) return null;
      return {
        kind,
        highRank: (Math.max(primary, secondary) as CardRank),
        lowRank: (Math.min(primary, secondary) as CardRank),
      };
    }
    case 'threeKind':
      return { kind, rank: primary };
    case 'fourKind':
      return { kind, rank: primary };
    case 'straight':
      if (primary < 6) return null;
      return { kind, topRank: primary };
    case 'flush':
      if (primary < 6) return null;
      return { kind, topRank: primary, suit };
    case 'fullHouse':
      if (primary === secondary) return null;
      return { kind, threeRank: primary, twoRank: secondary };
    case 'straightFlush':
      if (primary < 6) return null;
      return { kind, topRank: primary, suit };
  }
}

function kindNeedsPrimaryRank(_k: HandKind): boolean {
  return true; // all kinds use at least one rank slot
}

function kindNeedsSecondaryRank(k: HandKind): boolean {
  return k === 'twoPair' || k === 'fullHouse';
}

function kindNeedsSuit(k: HandKind): boolean {
  return k === 'flush' || k === 'straightFlush';
}

function primaryRankLabel(k: HandKind): string {
  if (k === 'twoPair') return 'High pair';
  if (k === 'fullHouse') return 'Three of';
  if (k === 'straight' || k === 'flush' || k === 'straightFlush') return 'Top card';
  return 'Rank';
}

function secondaryRankLabel(k: HandKind): string {
  if (k === 'twoPair') return 'Low pair';
  if (k === 'fullHouse') return 'Pair of';
  return '';
}

function primaryRankOptions(k: HandKind): CardRank[] {
  if (k === 'straight' || k === 'flush' || k === 'straightFlush') {
    return ALL_RANKS.filter((r) => r >= 6);
  }
  return ALL_RANKS;
}

// Keep the build helper used.
void compareClaim;
