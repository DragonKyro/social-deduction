import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { SeatIndex } from '@/engine/types';
import { FlipCard } from '@/ui/shared/FlipCard';
import { useGameStore } from '@/store/gameStore';
import type { LiarsPokerAction } from '../actions';
import {
  ALL_RANKS,
  ALL_SUITS,
  HAND_KINDS,
  KIND_LABEL,
  MIN_FLUSH_TOP,
  MIN_STRAIGHT_TOP,
  RANK_LABEL,
  SUIT_LABEL,
  allClaims,
  claimLabel,
  claimWitness,
  isStrictRaise,
  normalizeClaim,
} from '../hands';
import type { HandClaim, HandKind } from '../hands';
import type { Card, CardRank, LiarsPokerPublicState, PublicPlayer, Suit } from '../state';
import { CardBack, CardDefs, PlayingCard, isRed } from './PlayingCard';
import { useHotSeat } from './useHotSeat';
import type { HotSeat } from './useHotSeat';
import styles from './GameView.module.css';

type Dispatch = (a: LiarsPokerAction, opts?: { keepOpen?: boolean }) => void;
type NameFn = (i: SeatIndex | null) => string;

const REVEAL_PHASES = new Set(['revealing', 'roundOver', 'gameOver']);
const CLAIMS = allClaims();

export const KIND_CHIP: Record<HandKind, string> = {
  highCard: '#e8e2d2',
  pair: '#b3212e',
  twoPair: '#2b62a8',
  threeKind: '#2e7d4a',
  straight: '#26262e',
  flush: '#6f3a96',
  fullHouse: '#d9772a',
  fourKind: '#c9a227',
  straightFlush: '#0f8b8d',
};

const cardKey = (c: Card) => `${c.rank}${c.suit}`;

export function LiarsPokerGameView() {
  const publicView = useGameStore((s) => s.publicView);
  if (!publicView) return null;
  return <BackRoom view={publicView.view as LiarsPokerPublicState} />;
}

function mustAct(view: LiarsPokerPublicState): SeatIndex[] {
  if (view.phase === 'dealPending') return view.awaitingAck;
  if (view.phase === 'bidding') return [view.currentSeat];
  return [];
}

/** Strip everything private (for the hand-off cover / public recaps). */
function redacted(view: LiarsPokerPublicState): LiarsPokerPublicState {
  const pub = REVEAL_PHASES.has(view.phase);
  return {
    ...view,
    yourHand: [],
    players: view.players.map((p) => ({ ...p, visibleHand: pub ? p.visibleHand : [] })),
  };
}

function BackRoom({ view }: { view: LiarsPokerPublicState }) {
  const localSeat = useGameStore((s) => s.localSeat);
  const aiSeats = useGameStore((s) => s.aiSeats);
  const storeDispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);
  const hs = useHotSeat({
    seats: view.seats.map((s) => s.index),
    mustAct: mustAct(view),
    publicPhase: REVEAL_PHASES.has(view.phase),
  });
  const shown = hs.redact ? redacted(view) : view;
  const dispatch: Dispatch = (a, opts) => {
    storeDispatch(a);
    if (!opts?.keepOpen) hs.afterAct();
  };
  const name: NameFn = (i) => (i === null ? '' : view.seats[i]?.name ?? `Seat ${i + 1}`);

  // Showdown: which cards make (or fail to make) the called hand.
  const r = REVEAL_PHASES.has(view.phase) ? view.lastReveal : null;
  const witness = new Set<string>();
  if (r && r.claimExists) {
    const pool = Object.values(r.allHands).flat();
    for (const c of claimWitness(r.claim, pool)) witness.add(cardKey(c));
  }

  const opponents = shown.players.filter((p) => p.index !== localSeat);
  const me = localSeat !== null ? shown.players[localSeat] : undefined;

  return (
    <CardDefs>
      <div className={styles.root}>
        <div className={styles.smoke} aria-hidden />
        <div className={`${styles.smoke} ${styles.smoke2}`} aria-hidden />
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Liar&apos;s Poker</h2>
            <p className={styles.subtitle}>
              Hand {view.roundNumber} · {view.totalCards} cards in play · {view.cardsPerPlayer} dealt each
              {view.dummyHand ? ' · dummy last life' : ''}
            </p>
          </div>
          <button onClick={exitGame} className={styles.exitButton}>
            Leave table
          </button>
        </header>

        <p className={styles.status} aria-live="polite">
          {statusLine(view, localSeat, name)}
        </p>

        <div className={styles.felt}>
          <div className={styles.lamp} aria-hidden />
          <section className={styles.opponents} aria-label="Other players">
            {opponents.map((p) => (
              <OpponentSeat key={p.index} p={p} view={shown} isAI={aiSeats.includes(p.index)} witness={witness} />
            ))}
          </section>
          <Pot view={view} name={name} />
        </div>

        {me ? (
          <YourHand view={shown} me={me} hs={hs} dispatch={dispatch} name={name} witness={witness} />
        ) : (
          <section className={styles.yourArea}>
            <p className={styles.muted}>You are watching this table.</p>
            {view.phase === 'revealing' && <Verdict view={view} name={name} />}
            {view.phase === 'gameOver' && <GameOver view={view} name={name} />}
          </section>
        )}

        {hs.covered && <HandOffCover view={view} hs={hs} localSeat={localSeat} name={name} />}
      </div>
    </CardDefs>
  );
}

function statusLine(view: LiarsPokerPublicState, localSeat: SeatIndex | null, name: NameFn): string {
  switch (view.phase) {
    case 'dealPending':
      return `Cards are out — ${view.awaitingAck.length} still checking their hand.`;
    case 'bidding':
      return view.currentSeat === localSeat
        ? 'Your action: name a stronger hand, or call the bluff.'
        : `${name(view.currentSeat)} is thinking…`;
    case 'revealing':
      return 'Showdown — every card on the felt.';
    case 'roundOver':
      return 'Hand over. Shuffle up.';
    case 'gameOver':
      return `${view.matchWinners.map(name).join(', ')} takes the room.`;
  }
}

// ---------------------------------------------------------------------------
// Cards on the felt
// ---------------------------------------------------------------------------

/**
 * One card position. `card` is only passed when the current view contains
 * it; otherwise a back is shown on both faces (the DOM is inspectable).
 */
function TableCard({
  card,
  width,
  dealIndex,
  round,
  highlighted,
}: {
  card: Card | null;
  width: number;
  dealIndex: number;
  round: number;
  highlighted?: boolean;
}) {
  const back = <CardBack width={width} />;
  return (
    <span
      key={`deal-${round}`}
      className={`${styles.dealt} ${highlighted ? styles.witness : ''}`}
      style={{ '--d': dealIndex } as CSSProperties}
    >
      <FlipCard
        width={width}
        height={(width * 88) / 63}
        radius={4}
        revealed={card !== null}
        back={back}
        front={card ? <PlayingCard card={card} width={width} highlighted={highlighted} /> : back}
      />
    </span>
  );
}

function OpponentSeat({
  p,
  view,
  isAI,
  witness,
}: {
  p: PublicPlayer;
  view: LiarsPokerPublicState;
  isAI: boolean;
  witness: Set<string>;
}) {
  const active = view.phase === 'bidding' && p.index === view.currentSeat;
  const lastClaim = [...view.roundClaims].reverse().find((c) => c.seat === p.index);
  // At showdown show what they held, even if this call just knocked them out.
  const count = REVEAL_PHASES.has(view.phase) ? p.visibleHand.length : p.eliminated ? 0 : p.handSize;
  return (
    <article
      className={`${styles.seat} ${active ? styles.active : ''} ${p.eliminated ? styles.out : ''}`}
      aria-label={`${p.name}${isAI ? ' (AI)' : ''}${p.isDummy ? ', dummy hand' : ''}${p.eliminated ? ', out' : ''}`}
    >
      <div className={styles.nameplate}>
        <span className={styles.seatName}>{p.name}</span>
        {isAI && <span className={styles.aiTag}>AI</span>}
      </div>
      <div className={styles.fan}>
        {Array.from({ length: count }, (_, i) => {
          const card = p.visibleHand[i] ?? null;
          return (
            <span key={i} className={styles.fanCard} style={{ '--k': i - (count - 1) / 2 } as CSSProperties}>
              <TableCard
                card={card}
                width={40}
                dealIndex={p.index * 2 + i}
                round={view.roundNumber}
                highlighted={card !== null && witness.has(cardKey(card))}
              />
            </span>
          );
        })}
        {p.eliminated && count === 0 && <span className={styles.bust}>busted</span>}
      </div>
      <div className={styles.seatMeta}>
        {p.isDummy && !p.eliminated ? (
          <span className={styles.dummyTag} title="Can't see their own card — you can">
            dummy
          </span>
        ) : (
          !p.eliminated && <span className={styles.metaText}>{p.cardCount} cards</span>
        )}
        {lastClaim && view.phase === 'bidding' && (
          <span className={styles.lastClaim} style={{ '--chip': KIND_CHIP[lastClaim.claim.kind] } as CSSProperties}>
            {claimLabel(lastClaim.claim)}
          </span>
        )}
      </div>
    </article>
  );
}

function Pot({ view, name }: { view: LiarsPokerPublicState; name: NameFn }) {
  // One chip per claim this hand (the log resets on the next deal).
  const claims = view.roundClaims;
  const claim = view.phase === 'bidding' ? view.currentClaim : view.lastReveal?.claim ?? null;
  const bidder = view.phase === 'bidding' ? view.currentBidder : view.lastReveal?.bidder ?? null;
  return (
    <section className={styles.pot} aria-label="Current claim">
      <div className={styles.chipStack} aria-hidden>
        {claims.map((c, i) => (
          <span
            key={i}
            className={styles.chip}
            style={{ '--chip': KIND_CHIP[c.claim.kind], '--i': i } as CSSProperties}
          />
        ))}
      </div>
      <div className={styles.claimPlate}>
        <span className={styles.claimLabel}>{view.phase === 'bidding' ? 'On the table' : 'Called hand'}</span>
        <span className={styles.claimText} key={claim ? claimLabel(claim) : 'none'}>
          {claim ? claimLabel(claim) : 'No claim yet'}
        </span>
        {claim && bidder !== null && <span className={styles.claimBy}>by {name(bidder)}</span>}
      </div>
      {view.phase === 'bidding' && view.roundClaims.length > 1 && (
        <ol className={styles.claimLog} aria-label="Claims this hand">
          {view.roundClaims.slice(0, -1).map((c, i) => (
            <li key={i}>
              {name(c.seat)}: {claimLabel(c.claim)}
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

function YourHand({
  view,
  me,
  hs,
  dispatch,
  name,
  witness,
}: {
  view: LiarsPokerPublicState;
  me: PublicPlayer;
  hs: HotSeat;
  dispatch: Dispatch;
  name: NameFn;
  witness: Set<string>;
}) {
  const reveal = REVEAL_PHASES.has(view.phase);
  const cards: Array<Card | null> = reveal
    ? me.visibleHand
    : me.isDummy
      ? Array.from({ length: me.handSize }, () => null)
      : view.yourHand.length > 0
        ? view.yourHand
        : Array.from({ length: me.eliminated ? 0 : me.handSize }, () => null);
  return (
    <section className={`${styles.yourArea} ${view.phase === 'bidding' && view.currentSeat === me.index ? styles.yourTurn : ''}`}>
      <div className={styles.yourHeader}>
        <span className={styles.yourName}>{me.name}</span>
        {me.isDummy && !me.eliminated && (
          <span className={styles.dummyTag}>dummy — everyone but you can see your card</span>
        )}
      </div>
      <div className={styles.yourCards}>
        {me.eliminated && <p className={styles.muted}>You&apos;re out of cards. Pull up a chair and watch.</p>}
        {cards.map((c, i) => (
          <span key={i} className={styles.yourCard} style={{ '--k': i - (cards.length - 1) / 2 } as CSSProperties}>
            <TableCard
              card={c}
              width={74}
              dealIndex={i}
              round={view.roundNumber}
              highlighted={c !== null && witness.has(cardKey(c))}
            />
            {me.isDummy && !reveal && <span className={styles.forehead}>?</span>}
          </span>
        ))}
      </div>
      <ActionPanel view={view} me={me} hs={hs} dispatch={dispatch} name={name} />
    </section>
  );
}

function ActionPanel({
  view,
  me,
  hs,
  dispatch,
  name,
}: {
  view: LiarsPokerPublicState;
  me: PublicPlayer;
  hs: HotSeat;
  dispatch: Dispatch;
  name: NameFn;
}) {
  const ackSeats = hs.hotSeat ? view.awaitingAck.filter(hs.canView) : view.yourAckPending ? [me.index] : [];
  const ackAll = (type: 'ackReveal' | 'ackRoundOver') => {
    for (const s of ackSeats) dispatch({ type, bySeat: s });
  };
  switch (view.phase) {
    case 'gameOver':
      return <GameOver view={view} name={name} />;
    case 'dealPending':
      return (
        <div className={styles.panel}>
          {view.yourAckPending ? (
            <>
              <p className={styles.panelText}>
                {me.isDummy ? 'Your card is face-out to the table. Trust nobody.' : 'Memorise your hand.'}
              </p>
              <button className={styles.primary} onClick={() => dispatch({ type: 'ackDeal', bySeat: me.index })}>
                Ready
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
          <p className={styles.panelText}>Next hand is led by {name(view.lastReveal?.loserSeat ?? null)}.</p>
          <button className={styles.primary} disabled={ackSeats.length === 0} onClick={() => ackAll('ackRoundOver')}>
            {ackSeats.length > 0 ? 'Deal again' : 'Waiting for the others…'}
          </button>
        </div>
      );
    case 'bidding':
      if (me.eliminated) return null;
      if (view.currentSeat !== me.index) {
        return (
          <div className={styles.panel}>
            <p className={styles.muted}>{name(view.currentSeat)} has the action.</p>
          </div>
        );
      }
      return <ClaimBuilder key={view.roundClaims.length} view={view} seat={me.index} dispatch={dispatch} />;
  }
}

// ---------------------------------------------------------------------------
// Claim builder
// ---------------------------------------------------------------------------

interface Picks {
  kind: HandKind;
  primary: CardRank;
  secondary: CardRank;
  suit: Suit;
}

function picksFor(c: HandClaim): Picks {
  const base: Picks = { kind: c.kind, primary: 2, secondary: 2, suit: 'spades' };
  switch (c.kind) {
    case 'highCard':
    case 'pair':
    case 'threeKind':
    case 'fourKind':
      return { ...base, primary: c.rank };
    case 'twoPair':
      return { ...base, primary: c.highRank, secondary: c.lowRank };
    case 'fullHouse':
      return { ...base, primary: c.threeRank, secondary: c.twoRank };
    case 'straight':
      return { ...base, primary: c.topRank };
    case 'flush':
    case 'straightFlush':
      return { ...base, primary: c.topRank, suit: c.suit };
  }
}

function buildClaim(p: Picks): HandClaim | null {
  switch (p.kind) {
    case 'twoPair':
      return normalizeClaim({
        kind: 'twoPair',
        highRank: Math.max(p.primary, p.secondary),
        lowRank: Math.min(p.primary, p.secondary),
      });
    case 'fullHouse':
      return normalizeClaim({ kind: 'fullHouse', threeRank: p.primary, twoRank: p.secondary });
    case 'straight':
      return normalizeClaim({ kind: 'straight', topRank: p.primary });
    case 'flush':
    case 'straightFlush':
      return normalizeClaim({ kind: p.kind, topRank: p.primary, suit: p.suit });
    default:
      return normalizeClaim({ kind: p.kind, rank: p.primary });
  }
}

function rankOptions(kind: HandKind): readonly CardRank[] {
  if (kind === 'straight' || kind === 'straightFlush') return ALL_RANKS.filter((r) => r >= MIN_STRAIGHT_TOP);
  if (kind === 'flush') return ALL_RANKS.filter((r) => r >= MIN_FLUSH_TOP);
  return ALL_RANKS;
}

function primaryLabel(kind: HandKind): string {
  if (kind === 'twoPair') return 'High pair';
  if (kind === 'fullHouse') return 'Three of';
  if (kind === 'straight' || kind === 'flush' || kind === 'straightFlush') return 'Top card';
  return 'Rank';
}

function ClaimBuilder({ view, seat, dispatch }: { view: LiarsPokerPublicState; seat: SeatIndex; dispatch: Dispatch }) {
  const prev = view.currentClaim;
  const firstRaise = CLAIMS.find((c) => isStrictRaise(prev, c)) ?? null;
  const [picks, setPicks] = useState<Picks>(firstRaise ? picksFor(firstRaise) : picksFor(CLAIMS[0]!));
  const claim = buildClaim(picks);
  const valid = claim !== null && isStrictRaise(prev, claim);
  const kindHasRaise = (k: HandKind) => CLAIMS.some((c) => c.kind === k && isStrictRaise(prev, c));

  const chooseKind = (k: HandKind) => {
    const weakest = CLAIMS.find((c) => c.kind === k && isStrictRaise(prev, c));
    setPicks(weakest ? picksFor(weakest) : { ...picks, kind: k });
  };
  const needsSecond = picks.kind === 'twoPair' || picks.kind === 'fullHouse';
  const needsSuit = picks.kind === 'flush' || picks.kind === 'straightFlush';

  return (
    <div className={styles.panel}>
      {firstRaise && (
        <>
          <div className={styles.kindRow} role="group" aria-label="Hand type">
            {HAND_KINDS.map((k) => (
              <button
                key={k}
                className={`${styles.kindChip} ${picks.kind === k ? styles.kindOn : ''}`}
                style={{ '--chip': KIND_CHIP[k] } as CSSProperties}
                aria-pressed={picks.kind === k}
                disabled={!kindHasRaise(k)}
                onClick={() => chooseKind(k)}
              >
                <span className={styles.miniChip} aria-hidden />
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <RankRow
            label={primaryLabel(picks.kind)}
            options={rankOptions(picks.kind)}
            value={picks.primary}
            onPick={(r) => setPicks({ ...picks, primary: r })}
            wheel={picks.kind === 'straight' || picks.kind === 'straightFlush'}
          />
          {needsSecond && (
            <RankRow
              label={picks.kind === 'twoPair' ? 'Low pair' : 'Pair of'}
              options={ALL_RANKS.filter((r) => r !== picks.primary)}
              value={picks.secondary}
              onPick={(r) => setPicks({ ...picks, secondary: r })}
            />
          )}
          {needsSuit && (
            <div className={styles.pickRow} role="group" aria-label="Suit">
              <span className={styles.pickLabel}>Suit</span>
              {ALL_SUITS.map((s) => (
                <button
                  key={s}
                  className={`${styles.suitButton} ${isRed(s) ? styles.red : ''} ${picks.suit === s ? styles.pickOn : ''}`}
                  aria-pressed={picks.suit === s}
                  aria-label={s}
                  onClick={() => setPicks({ ...picks, suit: s })}
                >
                  {SUIT_LABEL[s]}
                </button>
              ))}
            </div>
          )}
          {picks.kind === 'flush' && (
            <p className={styles.hint}>House rule: a LOWER top card makes a stronger flush (it needs the exact top card plus four lower of the suit).</p>
          )}
          <div className={styles.declareRow}>
            <span className={styles.preview} style={{ '--chip': KIND_CHIP[picks.kind] } as CSSProperties}>
              {claim ? claimLabel(claim) : 'Not a real hand'}
            </span>
            <button
              className={styles.primary}
              disabled={!valid}
              onClick={() => claim && dispatch({ type: 'placeClaim', bySeat: seat, claim })}
            >
              Declare
            </button>
          </div>
          {claim && !valid && <p className={styles.warn}>Must beat {prev ? claimLabel(prev) : 'nothing'}.</p>}
        </>
      )}
      {prev && (
        <button className={styles.callButton} onClick={() => dispatch({ type: 'callLiar', bySeat: seat })}>
          Call the bluff
        </button>
      )}
    </div>
  );
}

function RankRow({
  label,
  options,
  value,
  onPick,
  wheel = false,
}: {
  label: string;
  options: readonly CardRank[];
  value: CardRank;
  onPick: (r: CardRank) => void;
  wheel?: boolean;
}) {
  return (
    <div className={styles.pickRow} role="group" aria-label={label}>
      <span className={styles.pickLabel}>{label}</span>
      {options.map((r) => (
        <button
          key={r}
          className={`${styles.rankButton} ${value === r ? styles.pickOn : ''}`}
          aria-pressed={value === r}
          title={wheel && r === 5 ? 'A-2-3-4-5' : undefined}
          onClick={() => onPick(r)}
        >
          {RANK_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

function Verdict({ view, name }: { view: LiarsPokerPublicState; name: NameFn }) {
  const r = view.lastReveal;
  if (!r) return null;
  const out = view.players[r.loserSeat]?.eliminated;
  const dummy = view.players[r.loserSeat]?.isDummy;
  return (
    <div className={styles.verdict}>
      <span className={`${styles.stamp} ${r.claimExists ? styles.stampTrue : styles.stampFalse}`}>
        {r.claimExists ? 'It’s there' : 'Bluff!'}
      </span>
      <p className={styles.panelText}>
        {name(r.bidder)} claimed <b>{claimLabel(r.claim)}</b>; {name(r.caller)} called. The hand{' '}
        {r.claimExists ? 'is in the combined pool' : 'is nowhere on the felt'}.
      </p>
      <p className={styles.loss}>
        {name(r.loserSeat)} {out ? 'is out of the game.' : dummy ? 'is down to a dummy card.' : 'loses a card.'}
      </p>
    </div>
  );
}

function GameOver({ view, name }: { view: LiarsPokerPublicState; name: NameFn }) {
  return (
    <div className={`${styles.panel} ${styles.gameOver}`}>
      <span className={styles.banner}>Last hand standing</span>
      <p className={styles.winner}>{view.matchWinners.map(name).join(', ')}</p>
      <p className={styles.muted}>{view.history.length} hands played.</p>
    </div>
  );
}

function HandOffCover({
  view,
  hs,
  localSeat,
  name,
}: {
  view: LiarsPokerPublicState;
  hs: HotSeat;
  localSeat: SeatIndex | null;
  name: NameFn;
}) {
  const target = hs.nextHuman ?? localSeat;
  return (
    <div className={styles.cover} role="dialog" aria-modal="true" aria-labelledby="lp-cover-title">
      <div className={styles.coverCard}>
        <div className={styles.coverCards} aria-hidden>
          <CardBack width={64} />
          <CardBack width={64} />
        </div>
        <h3 id="lp-cover-title" className={styles.coverTitle}>
          {hs.nextHuman !== null
            ? `Pass the device to ${name(hs.nextHuman)}`
            : `${name(view.phase === 'bidding' ? view.currentSeat : null)} is thinking…`}
        </h3>
        <p className={styles.muted}>Cards stay face-down until the right player is holding the device.</p>
        {target !== null && (
          <button className={styles.primary} onClick={() => hs.revealTo(target)} autoFocus>
            I&apos;m {name(target)} — show my cards
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
