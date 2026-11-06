import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useGameStore, useSeatSwitching } from '@/store/gameStore';
import { FlipCard } from '@/ui/shared/FlipCard';
import type { CoupGameAction } from '../actions';
import { CHARACTERS } from '../characters';
import { legalTargets, mustCoup, validBlockersFor } from '../rules';
import type {
  CoupCharacter,
  CoupPublicPendingAction,
  CoupPublicSeatState,
  CoupPublicState,
} from '../state';
import { CardBack, CategoryBadge, CharacterArt, CoinIcon, CoinStack } from './CharacterArt';
import { useTableFx } from './useTableFx';
import type { Banner, CoinPop, Flight, SeatFx, Toast } from './useTableFx';
import styles from './GameView.module.css';

// ============================================================================
// Coup — game view. A gilded court table: seat plaques around a velvet
// felt, treasury + court deck in the centre, your hand below, and a decree
// panel for whatever the current phase asks of you.
//
// Hidden info on this device:
//   - Only `view` (this seat's redacted view) is rendered. Opponents'
//     face-down cards are always card backs; the DOM never holds them.
//   - Seat switching goes through useSeatSwitching(): disabled online and
//     never onto an AI seat. In pass-and-play, every handoff shows a full
//     cover first, and your hand stays face-down unless it's your decision.
// ============================================================================

type Dispatch = (a: CoupGameAction) => void;

export function CoupGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);
  const aiSeats = useGameStore((s) => s.aiSeats);
  if (!publicView) return null;
  const view = publicView.view as CoupPublicState;
  return <CoupTable view={view} dispatch={(a) => dispatch(a)} exitGame={exitGame} aiSeats={aiSeats} />;
}

function CoupTable({
  view,
  dispatch,
  exitGame,
  aiSeats,
}: {
  view: CoupPublicState;
  dispatch: Dispatch;
  exitGame: () => void;
  aiSeats: number[];
}) {
  const switching = useSeatSwitching();
  const [handoff, setHandoff] = useState<number | null>(null);
  const [showHand, setShowHand] = useState(false);
  const anchors = useRef(new Map<string, HTMLElement | null>());
  const anchor = useCallback((key: string) => anchors.current.get(key) ?? null, []);
  const setAnchor = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      anchors.current.set(key, el);
    },
    [],
  );
  const fx = useTableFx(view, anchor);

  const me = view.yourSeat;
  const awaiting = view.awaitingSeats;
  const meAwaiting = me !== null && awaiting.includes(me);
  const humanSeats = view.seats.filter((s) => switching.canView(s.index)).map((s) => s.index);
  const passAndPlay = switching.enabled && humanSeats.length > 1;

  // Who should be holding the device right now (pass-and-play only)?
  let coverFor: number | null = null;
  if (passAndPlay && view.phase !== 'gameOver') {
    if (handoff !== null && handoff !== me && switching.canView(handoff)) {
      coverFor = handoff;
    } else if (!meAwaiting) {
      const n = view.seats.length;
      const start = me ?? -1;
      for (let k = 1; k <= n; k++) {
        const s = (start + k + n) % n;
        if (awaiting.includes(s) && switching.canView(s)) {
          coverFor = s;
          break;
        }
      }
    }
  }
  const concealHand = passAndPlay && !meAwaiting && !showHand;

  const confirmHandoff = (seat: number) => {
    switching.setLocalSeat(seat);
    setHandoff(null);
    setShowHand(false);
  };

  return (
    <div className={styles.root}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.logo}>Coup</span>
          <span className={styles.rulesetChip}>{rulesetLabel(view)}</span>
          {passAndPlay && <span className={styles.modeChip}>Pass &amp; play</span>}
        </div>
        <button className={styles.ghostBtn} onClick={exitGame}>
          Leave table
        </button>
      </header>

      <div className={styles.layout}>
        <main className={styles.main}>
          <section className={styles.table} aria-label="The court">
            <div className={styles.seatRing}>
              {view.seats.map((s) => (
                <SeatPlaque
                  key={s.index}
                  view={view}
                  seat={s}
                  isYou={s.index === me}
                  isAI={aiSeats.includes(s.index)}
                  fx={fx.seatFx[s.index]}
                  pop={fx.coinPops[s.index]}
                  slotGen={fx.slotGen}
                  anchorRef={setAnchor(`seat-${s.index}`)}
                />
              ))}
            </div>
            <CourtCentre view={view} setAnchor={setAnchor} deckPulse={fx.deckPulse} />
          </section>

          {me !== null && view.seats[me] && (
            <YourHand
              view={view}
              me={me}
              conceal={concealHand}
              canToggle={passAndPlay && !meAwaiting}
              onToggle={() => setShowHand((v) => !v)}
              slotGen={fx.slotGen}
            />
          )}

          <section className={styles.decree} aria-live="polite">
            <PhasePanel
              key={`${me}-${view.phase}-${view.currentSeat}`}
              view={view}
              me={me}
              dispatch={dispatch}
              aiSeats={aiSeats}
              exitGame={exitGame}
              onHandoff={passAndPlay ? (s) => setHandoff(s) : null}
              canView={switching.canView}
            />
          </section>

          <LogPanel view={view} />
        </main>

        <aside className={styles.aside}>
          <Cheatsheet view={view} />
        </aside>
      </div>

      <FxLayer banner={fx.banner} toasts={fx.toasts} />
      <FlightLayer flights={fx.flights} />
      {coverFor !== null && (
        <HandoffCover name={view.seats[coverFor]!.name} reason={coverReason(view, coverFor)} onConfirm={() => confirmHandoff(coverFor!)} />
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function rulesetLabel(view: CoupPublicState): string {
  if (view.ruleset === 'classic') return 'Classic';
  if (view.expansions.includes('anarchy')) return 'G54 + Anarchy';
  return 'G54';
}

function nm(view: CoupPublicState, i: number | null | undefined): string {
  return i === null || i === undefined ? '???' : view.seats[i]?.name ?? '???';
}

function charName(c: CoupCharacter | null | undefined): string {
  return c ? CHARACTERS[c].name : '???';
}

function actionLabel(p: CoupPublicPendingAction): string {
  if (p.kind === 'general') {
    if (p.generalId === 'income') return 'Income';
    if (p.generalId === 'foreignAid') return 'Foreign Aid';
    return 'Coup';
  }
  return p.claimedCharacter ? CHARACTERS[p.claimedCharacter].action?.label ?? CHARACTERS[p.claimedCharacter].name : 'an action';
}

const LOSE_REASON: Record<string, string> = {
  failedChallenge: 'lost a challenge',
  lostBluff: 'was caught bluffing',
  assassinate: 'was assassinated',
  coup: 'was couped',
  mercenary: 'was hit by a Mercenary',
  soldier: 'was struck by a Soldier',
  guerrilla: 'was ambushed by a Guerrilla',
  paramilitary: 'was hit by a riot',
  thiefPenalty: 'paid the Thief',
  chipIn: 'was toppled by a rally',
};

function coverReason(view: CoupPublicState, seat: number): string {
  const p = view.pending;
  switch (view.phase) {
    case 'turnStart':
      return 'It is your turn.';
    case 'awaitingChallenge':
      return `${nm(view, p?.by)} claims ${charName(p?.claimedCharacter)}. Challenge or allow it.`;
    case 'awaitingBlock':
      return p?.target === seat ? `${nm(view, p?.by)} moves against you. Block or accept.` : `You may block ${nm(view, p?.by)}.`;
    case 'awaitingBlockChallenge':
      return `${nm(view, p?.blocker?.by)} blocks as ${charName(p?.blocker?.character)}. Challenge or accept.`;
    case 'loseInfluence':
      return 'You must give up an influence.';
    case 'exchangePick':
      return 'Choose which cards to keep.';
    case 'spyPeek':
      return 'Your secret intelligence has arrived.';
    case 'targetSwapPick':
      return 'Choose a card to swap.';
    case 'sellInfluencePick':
      return 'Choose a card to sell.';
    case 'pileOnWindow':
      return 'Join the pile-on or pass.';
    case 'chipInWindow':
      return 'Join the rally or pass.';
    default:
      return 'Your move.';
  }
}

// ============================================================================
// Seats
// ============================================================================

// Motion on the plaque itself + a keyed overlay for the visual (so an effect
// never remounts the cards underneath).
const FX_MOTION: Partial<Record<SeatFx['kind'], string | undefined>> = {
  shake: styles.fxShake,
  clash: styles.fxClash,
  slash: styles.fxShake,
  coup: styles.fxShake,
  wound: styles.fxShake,
};
const FX_OVERLAY: Record<SeatFx['kind'], string | undefined> = {
  shake: styles.ovShake,
  clash: styles.ovClash,
  shield: styles.ovShield,
  slash: styles.ovSlash,
  coup: styles.ovCoup,
  wound: styles.ovWound,
  blessed: styles.ovBlessed,
};

function SeatPlaque({
  view,
  seat,
  isYou,
  isAI,
  fx,
  pop,
  slotGen,
  anchorRef,
}: {
  view: CoupPublicState;
  seat: CoupPublicSeatState;
  isYou: boolean;
  isAI: boolean;
  fx: SeatFx | undefined;
  pop: CoinPop | undefined;
  slotGen: Record<string, number>;
  anchorRef: (el: HTMLElement | null) => void;
}) {
  const active = view.currentSeat === seat.index && view.phase !== 'gameOver';
  const deciding = view.awaitingSeats.includes(seat.index) && view.phase !== 'turnStart';
  const winner = view.winnerSeat === seat.index;
  const cls = [
    styles.plaque,
    active && styles.plaqueActive,
    isYou && styles.plaqueYou,
    seat.eliminated && styles.plaqueDead,
    winner && styles.plaqueWinner,
    fx && FX_MOTION[fx.kind],
  ]
    .filter(Boolean)
    .join(' ');
  const t = seat.tokens;
  const faceDown = seat.influences.filter((i) => !i.revealed).length;
  return (
    <div
      className={cls}
      style={{ '--i': seat.index } as CSSProperties}
      aria-label={`${seat.name}${isYou ? ' (you)' : ''}: ${seat.coins} coins, ${faceDown} influence${faceDown === 1 ? '' : 's'}${seat.eliminated ? ', exiled' : ''}`}
    >
      <div className={styles.plaqueHead}>
        <span className={styles.seatName}>{seat.name}</span>
        {isAI && <span className={styles.tagAI}>AI</span>}
        {isYou && <span className={styles.tagYou}>You</span>}
      </div>
      <div className={styles.plaqueCards}>
        {seat.influences.map((inf, i) => (
          <div className={styles.dealSlot} key={`${i}-${slotGen[`${seat.index}-${i}`] ?? 0}`} style={{ '--d': `${(seat.index * 2 + i) * 90}ms` } as CSSProperties}>
            <FlipCard
              width={50}
              height={70}
              radius={5}
              revealed={inf.revealed}
              back={<CardBack size={50} />}
              front={inf.char ? <CharacterArt character={inf.char} size={50} /> : <CardBack size={50} />}
              className={inf.revealed ? styles.lostCard : undefined}
              title={inf.revealed && inf.char ? `${CHARACTERS[inf.char].name} (lost)` : 'Face-down influence'}
            />
          </div>
        ))}
      </div>
      <div className={styles.plaqueFoot}>
        <span className={styles.coinSlot} ref={anchorRef}>
          <CoinStack count={seat.coins} compact />
          {pop && (
            <span key={pop.key} className={`${styles.coinPop} ${pop.amount > 0 ? styles.coinUp : styles.coinDown}`} aria-hidden>
              {pop.amount > 0 ? `+${pop.amount}` : pop.amount}
            </span>
          )}
        </span>
        <span className={styles.tokens}>
          {t.peacekeeping && <Token label="Peacekeeping: can't be targeted" glyph="🕊" />}
          {t.treaty !== null && <Token label={`Treaty with ${nm(view, t.treaty)}`} glyph="🤝" />}
          {t.weapons > 0 && <Token label={`${t.weapons} weapon token(s)`} glyph={`⚔${t.weapons}`} />}
          {t.reviveBlessed && <Token label="Blessed: the next fatal loss is spared" glyph="✚" />}
        </span>
      </div>
      {fx && <span key={fx.key} className={`${styles.fxOverlay} ${FX_OVERLAY[fx.kind] ?? ''}`} aria-hidden />}
      {deciding && <span className={styles.decidingChip}>Deciding…</span>}
      {seat.eliminated && <span className={styles.exiledStamp}>Exiled</span>}
      {winner && <span className={styles.crownChip}>♛ Sovereign</span>}
    </div>
  );
}

function Token({ label, glyph }: { label: string; glyph: string }) {
  return (
    <span className={styles.token} title={label} aria-label={label} role="img">
      {glyph}
    </span>
  );
}

// ============================================================================
// Centre of the table: treasury, court deck, the action on the table.
// ============================================================================

function CourtCentre({
  view,
  setAnchor,
  deckPulse,
}: {
  view: CoupPublicState;
  setAnchor: (key: string) => (el: HTMLElement | null) => void;
  deckPulse: number;
}) {
  return (
    <div className={styles.court}>
      <div className={styles.treasury} ref={setAnchor('treasury')} aria-label="Treasury">
        <div className={styles.treasuryPile} aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span key={i} className={styles.pileCoin} style={{ '--i': i } as CSSProperties}>
              <CoinIcon size={26} />
            </span>
          ))}
        </div>
        <span className={styles.courtLabel}>Treasury</span>
      </div>

      <ActionBanner view={view} />

      <div className={styles.deck} ref={setAnchor('deck')} aria-label={`Court deck: ${view.deckSize} cards`}>
        <div className={styles.deckStack} key={deckPulse} aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={styles.deckCard} style={{ '--i': i } as CSSProperties}>
              <CardBack size={52} />
            </span>
          ))}
        </div>
        <span className={styles.courtLabel}>Court deck · {view.deckSize}</span>
      </div>
    </div>
  );
}

function ActionBanner({ view }: { view: CoupPublicState }) {
  const p = view.pending;
  if (view.phase === 'gameOver') {
    return (
      <div className={styles.actionBanner}>
        <div className={styles.bannerTitle}>The court has fallen</div>
        <div className={styles.bannerSub}>{nm(view, view.winnerSeat)} rules alone.</div>
      </div>
    );
  }
  if (!p) {
    return (
      <div className={styles.actionBanner}>
        <div className={styles.bannerKicker}>Now acting</div>
        <div className={styles.bannerTitle}>{nm(view, view.currentSeat)}</div>
        <div className={styles.bannerSub}>Choose an action, or a claim.</div>
      </div>
    );
  }
  const stage =
    view.phase === 'awaitingChallenge'
      ? 'Will anyone challenge?'
      : view.phase === 'awaitingBlock'
        ? 'Will it be blocked?'
        : view.phase === 'awaitingBlockChallenge'
          ? 'Challenge the block?'
          : view.phase === 'loseInfluence'
            ? `${nm(view, p.loseInfluencePending?.seat)} must give up an influence`
            : view.phase === 'exchangePick'
              ? `${nm(view, p.by)} is choosing cards`
              : view.phase === 'spyPeek'
                ? `${nm(view, p.by)} studies a secret`
                : view.phase === 'targetSwapPick'
                  ? `${nm(view, p.swapTarget)} picks a card to swap`
                  : view.phase === 'pileOnWindow'
                    ? 'Others may pile on'
                    : view.phase === 'chipInWindow'
                      ? 'Others may join the rally'
                      : view.phase === 'sellInfluencePick'
                        ? `${nm(view, p.by)} chooses a card to sell`
                        : '';
  return (
    <div className={`${styles.actionBanner} ${styles.bannerLive}`}>
      <div className={styles.bannerClaim}>
        {p.claimedCharacter ? (
          <CharacterArt character={p.claimedCharacter} size={58} className={styles.bannerCard} />
        ) : (
          <GeneralSeal id={p.generalId} />
        )}
        {p.blocker && (
          <>
            <span className={styles.vs} aria-hidden>
              ✕
            </span>
            <span className={styles.blockerCard}>
              <CharacterArt character={p.blocker.character} size={58} className={styles.bannerCard} />
            </span>
          </>
        )}
      </div>
      <div className={styles.bannerText}>
        <div className={styles.bannerKicker}>
          {nm(view, p.by)}
          {p.claimedCharacter ? ` claims ${charName(p.claimedCharacter)}` : ''}
        </div>
        <div className={styles.bannerTitle}>
          {actionLabel(p)}
          {p.target !== null && <span className={styles.bannerTarget}> → {nm(view, p.target)}</span>}
        </div>
        {p.blocker && (
          <div className={styles.bannerSub}>
            Blocked by {nm(view, p.blocker.by)} as {charName(p.blocker.character)}
          </div>
        )}
        <div className={styles.bannerStage}>{stage}</div>
      </div>
    </div>
  );
}

function GeneralSeal({ id }: { id: CoupPublicPendingAction['generalId'] }) {
  const label = id === 'income' ? 'Income' : id === 'foreignAid' ? 'Aid' : 'Coup';
  return (
    <span className={`${styles.generalSeal} ${id === 'coup' ? styles.generalSealCoup : ''}`} aria-hidden>
      {id === 'coup' ? '♛' : <CoinIcon size={30} />}
      <span>{label}</span>
    </span>
  );
}

// ============================================================================
// Your hand
// ============================================================================

function YourHand({
  view,
  me,
  conceal,
  canToggle,
  onToggle,
  slotGen,
}: {
  view: CoupPublicState;
  me: number;
  conceal: boolean;
  canToggle: boolean;
  onToggle: () => void;
  slotGen: Record<string, number>;
}) {
  const seat = view.seats[me]!;
  const recentPeeks = view.yourPeeks.slice(-3).reverse();
  return (
    <section className={styles.hand} aria-label="Your influence">
      <div className={styles.handHead}>
        <h3 className={styles.sectionTitle}>Your influence</h3>
        {canToggle && (
          <button className={styles.ghostBtn} onClick={onToggle} aria-pressed={!conceal}>
            {conceal ? 'Show my cards' : 'Hide my cards'}
          </button>
        )}
      </div>
      <div className={styles.handRow}>
        {view.yourInfluences.map((inf, i) => (
          <div key={`${i}-${slotGen[`${me}-${i}`] ?? 0}`} className={styles.handSlot} style={{ '--d': `${i * 120}ms` } as CSSProperties}>
            <FlipCard
              width={104}
              height={146}
              radius={8}
              lift={!inf.revealed && !conceal}
              revealed={inf.revealed || !conceal}
              back={<CardBack size={104} />}
              front={<CharacterArt character={inf.char} size={104} />}
              className={inf.revealed ? styles.lostCard : undefined}
              title={conceal && !inf.revealed ? 'Hidden' : CHARACTERS[inf.char].name}
            />
            <span className={styles.handCaption}>
              {inf.revealed ? 'Lost' : conceal ? 'Hidden' : CHARACTERS[inf.char].name}
            </span>
          </div>
        ))}
        <div className={styles.handPurse}>
          <CoinStack count={seat.coins} />
          <span className={styles.courtLabel}>Your purse</span>
          {!conceal && recentPeeks.length > 0 && (
            <div className={styles.intel}>
              <div className={styles.intelTitle}>Private intelligence</div>
              {recentPeeks.map((pk, i) => (
                <div key={i} className={styles.intelLine}>
                  {nm(view, pk.target)}, card {pk.cardIndex + 1}: <strong>{charName(pk.card)}</strong>
                </div>
              ))}
              <div className={styles.intelNote}>Cards may have changed since.</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Phase panels
// ============================================================================

interface PanelProps {
  view: CoupPublicState;
  me: number | null;
  dispatch: Dispatch;
  aiSeats: number[];
  exitGame: () => void;
  onHandoff: ((seat: number) => void) | null;
  canView: (seat: number) => boolean;
}

function PhasePanel(props: PanelProps) {
  const { view, me } = props;
  if (view.phase === 'gameOver') return <GameOverPanel {...props} />;
  const mine = me !== null && view.awaitingSeats.includes(me);
  if (!mine) return <WaitingPanel {...props} />;
  switch (view.phase) {
    case 'turnStart':
      return <TurnPanel view={view} me={me} dispatch={props.dispatch} />;
    case 'awaitingChallenge':
      return <ChallengePanel view={view} me={me} dispatch={props.dispatch} onBlock={false} />;
    case 'awaitingBlockChallenge':
      return <ChallengePanel view={view} me={me} dispatch={props.dispatch} onBlock />;
    case 'awaitingBlock':
      return <BlockPanel view={view} me={me} dispatch={props.dispatch} />;
    case 'loseInfluence':
      return (
        <PickCardPanel
          view={view}
          me={me}
          title="Surrender an influence"
          sub={`You ${LOSE_REASON[view.pending?.loseInfluencePending?.reason ?? ''] ?? 'must lose an influence'}. Choose the card to turn face-up. It is gone for good.`}
          verb="Surrender"
          tone="danger"
          onPick={(i) => props.dispatch({ type: 'pickInfluenceToLose', bySeat: me, cardIndex: i })}
        />
      );
    case 'exchangePick':
      return <ExchangePanel view={view} me={me} dispatch={props.dispatch} />;
    case 'spyPeek':
      return <PeekPanel view={view} me={me} dispatch={props.dispatch} />;
    case 'targetSwapPick':
      return (
        <PickCardPanel
          view={view}
          me={me}
          title="Forced swap"
          sub={`${nm(view, view.pending?.by)} (as ${charName(view.pending?.claimedCharacter)}) forces you to swap one card with a fresh draw from the court deck. You won't know what you get until it lands.`}
          verb="Swap"
          tone="gold"
          onPick={(i) => props.dispatch({ type: 'targetSwapPick', bySeat: me, cardIndex: i })}
        />
      );
    case 'sellInfluencePick':
      return (
        <PickCardPanel
          view={view}
          me={me}
          title="Sell an influence"
          sub="Turn one card face-up for 4 coins and a weapon token."
          verb="Sell"
          tone="gold"
          onPick={(i) => props.dispatch({ type: 'sellInfluence', bySeat: me, cardIndex: i })}
        />
      );
    case 'pileOnWindow':
      return <PileOnPanel view={view} me={me} dispatch={props.dispatch} />;
    case 'chipInWindow':
      return <ChipInPanel view={view} me={me} dispatch={props.dispatch} />;
    default:
      return null;
  }
}

function Panel({ title, kicker, children, tone }: { title: ReactNode; kicker?: ReactNode; children?: ReactNode; tone?: 'danger' | 'gold' }) {
  return (
    <div className={`${styles.panel} ${tone === 'danger' ? styles.panelDanger : tone === 'gold' ? styles.panelGold : ''}`}>
      {kicker && <div className={styles.panelKicker}>{kicker}</div>}
      <h3 className={styles.panelTitle}>{title}</h3>
      {children}
    </div>
  );
}

function WaitingPanel({ view, me, aiSeats, onHandoff, canView }: PanelProps) {
  const names = view.awaitingSeats.map((s) => `${nm(view, s)}${aiSeats.includes(s) ? ' (AI)' : ''}`);
  const passed = view.pending?.passes ?? [];
  const handoffTargets = onHandoff ? view.awaitingSeats.filter((s) => s !== me && canView(s)) : [];
  return (
    <Panel kicker={me === null ? 'Spectating' : 'Stand by'} title={names.length ? `Waiting on ${names.join(', ')}` : 'Resolving…'}>
      {(view.phase === 'awaitingChallenge' || view.phase === 'awaitingBlock' || view.phase === 'awaitingBlockChallenge') && passed.length > 0 && (
        <p className={styles.panelSub}>Allowed so far: {passed.map((s) => nm(view, s)).join(', ')}</p>
      )}
      {handoffTargets.length > 0 && (
        <div className={styles.btnRow}>
          {handoffTargets.map((s) => (
            <button key={s} className={styles.ghostBtn} onClick={() => onHandoff!(s)}>
              Hand the device to {nm(view, s)}
            </button>
          ))}
        </div>
      )}
      <div className={styles.waitDots} aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </Panel>
  );
}

function GameOverPanel({ view, me, exitGame }: PanelProps) {
  const won = me !== null && me === view.winnerSeat;
  return (
    <div className={styles.gameOver}>
      <div className={styles.gameOverCrown} aria-hidden>
        ♛
      </div>
      <div className={styles.gameOverTitle}>{won ? 'You rule the court' : `${nm(view, view.winnerSeat)} rules the court`}</div>
      <div className={styles.gameOverSub}>Every rival has been exiled. Long live the sovereign.</div>
      <button className={styles.primaryBtn} onClick={exitGame}>
        Leave the table
      </button>
    </div>
  );
}

// --- Turn: choose an action ---------------------------------------------------

type Draft =
  | { kind: 'coup' }
  | { kind: 'claim'; character: CoupCharacter };

function TurnPanel({ view, me, dispatch }: { view: CoupPublicState; me: number; dispatch: Dispatch }) {
  const seat = view.seats[me]!;
  const hand = view.yourInfluences.filter((i) => !i.revealed).map((i) => i.char);
  const targets = legalTargets(view, me);
  const forced = mustCoup(view, me);
  const [draft, setDraft] = useState<Draft | null>(forced ? { kind: 'coup' } : null);

  if (draft?.kind === 'coup' || forced) {
    return (
      <Panel kicker={forced ? 'Ten coins: the court demands it' : 'General action'} title="Launch a Coup" tone="danger">
        <p className={styles.panelSub}>
          Pay 7 coins; your target loses an influence.
          {view.ruleset === 'g54' && !forced ? ' In G54 the target may block with Judge, Lawyer, Guerrilla or Paramilitary.' : ''}
          {forced && view.ruleset === 'g54' ? ' A forced Coup cannot be blocked.' : ''}
        </p>
        <TargetPicker view={view} me={me} options={targets} onPick={(t) => dispatch({ type: 'declareGeneral', bySeat: me, generalId: 'coup', target: t })} verb="Coup" />
        {!forced && (
          <div className={styles.btnRow}>
            <button className={styles.ghostBtn} onClick={() => setDraft(null)}>
              Back
            </button>
          </div>
        )}
      </Panel>
    );
  }

  if (draft?.kind === 'claim') {
    return <ClaimConfigurator view={view} me={me} character={draft.character} dispatch={dispatch} onCancel={() => setDraft(null)} />;
  }

  const faBlockers = validBlockersFor(view.activeCharacters, view.ruleset, { kind: 'general', generalId: 'foreignAid', characterActionId: null });
  const claimable = view.activeCharacters.filter((c) => CHARACTERS[c].action !== null);
  return (
    <Panel kicker="Your turn" title={`${seat.name}, make your move`}>
      <div className={styles.generalRow}>
        <button className={styles.decreeBtn} onClick={() => dispatch({ type: 'declareGeneral', bySeat: me, generalId: 'income' })}>
          <span className={styles.decreeIcon} aria-hidden>
            <CoinIcon size={26} />
          </span>
          <span className={styles.decreeLabel}>Income</span>
          <span className={styles.decreeSub}>+1 coin · can't be stopped</span>
        </button>
        <button className={styles.decreeBtn} onClick={() => dispatch({ type: 'declareGeneral', bySeat: me, generalId: 'foreignAid' })}>
          <span className={styles.decreeIcon} aria-hidden>
            <CoinIcon size={22} />
            <CoinIcon size={22} />
          </span>
          <span className={styles.decreeLabel}>Foreign Aid</span>
          <span className={styles.decreeSub}>
            +2 coins{faBlockers.length ? ` · ${faBlockers.map((c) => CHARACTERS[c].name).join(' / ')} can block` : ''}
          </span>
        </button>
        <button
          className={`${styles.decreeBtn} ${styles.decreeDanger}`}
          disabled={seat.coins < 7 || targets.length === 0}
          onClick={() => setDraft({ kind: 'coup' })}
        >
          <span className={styles.decreeIcon} aria-hidden>
            ♛
          </span>
          <span className={styles.decreeLabel}>Coup</span>
          <span className={styles.decreeSub}>{seat.coins < 7 ? `needs 7 coins (${seat.coins})` : 'pay 7 · target loses an influence'}</span>
        </button>
      </div>
      <h4 className={styles.subhead}>Claim a character</h4>
      <div className={styles.claimGrid}>
        {claimable.map((c) => {
          const a = CHARACTERS[c].action!;
          const needsTarget = a.target === 'other';
          const disabled = seat.coins < a.cost || (needsTarget && targets.length === 0);
          const honest = hand.includes(c);
          return (
            <button
              key={c}
              className={styles.claimTile}
              disabled={disabled}
              onClick={() => setDraft({ kind: 'claim', character: c })}
              aria-label={`Claim ${CHARACTERS[c].name}: ${a.label}${honest ? ' (you hold it)' : ' (bluff)'}`}
            >
              <CharacterArt character={c} size={54} decorative />
              <span className={styles.claimText}>
                <span className={styles.claimName}>{CHARACTERS[c].name}</span>
                <span className={styles.claimSub}>{a.label}</span>
                <span className={honest ? styles.honestTag : styles.bluffTag}>{honest ? 'In your hand' : 'Bluff'}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function TargetPicker({
  view,
  me,
  options,
  onPick,
  verb,
  selected,
}: {
  view: CoupPublicState;
  me: number;
  options: number[];
  onPick: (seat: number) => void;
  verb: string;
  selected?: number | null;
}) {
  const others = view.seats.filter((s) => s.index !== me && !s.eliminated);
  return (
    <div className={styles.targetGrid} role="group" aria-label="Choose a target">
      {others.map((s) => {
        const ok = options.includes(s.index);
        return (
          <button
            key={s.index}
            className={`${styles.targetBtn} ${selected === s.index ? styles.targetSelected : ''}`}
            disabled={!ok}
            aria-pressed={selected === undefined ? undefined : selected === s.index}
            onClick={() => onPick(s.index)}
            title={ok ? `${verb} ${s.name}` : `${s.name} is protected`}
          >
            <span className={styles.targetName}>{s.name}</span>
            <span className={styles.targetMeta}>
              <CoinIcon size={13} /> {s.coins} · {s.influences.filter((i) => !i.revealed).length} card
              {s.influences.filter((i) => !i.revealed).length === 1 ? '' : 's'}
              {!ok && ' · protected'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ClaimConfigurator({
  view,
  me,
  character,
  dispatch,
  onCancel,
}: {
  view: CoupPublicState;
  me: number;
  character: CoupCharacter;
  dispatch: Dispatch;
  onCancel: () => void;
}) {
  const spec = CHARACTERS[character];
  const a = spec.action!;
  const [target, setTarget] = useState<number | null>(null);
  const [partner, setPartner] = useState<number | null>(null);
  const [branch, setBranch] = useState<'exchange' | 'peek'>('exchange');
  const [peekIdx, setPeekIdx] = useState<0 | 1 | null>(null);
  const [pair, setPair] = useState<number[]>([]);

  const isInq = a.id === 'inquisitorExchange';
  const needsTarget = a.target === 'other' || (isInq && branch === 'peek');
  const needsPeek = a.id === 'spyPeek' || (isInq && branch === 'peek');
  const targets = legalTargets(view, me);
  const tSeat = target !== null ? view.seats[target] : null;
  const faceDownSlots = tSeat ? tSeat.influences.map((inf, i) => (!inf.revealed ? i : -1)).filter((i) => i >= 0) : [];
  const effPeek = needsPeek ? (peekIdx !== null && faceDownSlots.includes(peekIdx) ? peekIdx : ((faceDownSlots[0] ?? null) as 0 | 1 | null)) : null;
  const partners = view.seats.filter((s) => !s.eliminated && s.index !== me && s.index !== target && s.coins >= 1).map((s) => s.index);
  const pairOptions = view.seats.filter((s) => !s.eliminated && s.index !== me).map((s) => s.index);

  const ready =
    (!needsTarget || target !== null) &&
    (a.id !== 'mercenaryHire' || partner !== null) &&
    (a.target !== 'pair' || pair.length === 2) &&
    (!needsPeek || effPeek !== null);

  const declare = () => {
    dispatch({
      type: 'declareCharacter',
      bySeat: me,
      claimedCharacter: character,
      characterActionId: a.id,
      target: needsTarget ? target ?? undefined : undefined,
      mercenaryPartner: a.id === 'mercenaryHire' ? partner ?? undefined : undefined,
      inquisitorBranch: isInq ? branch : undefined,
      inquisitorPeekCardIndex: needsPeek ? effPeek ?? undefined : undefined,
      treatyPair: a.target === 'pair' && pair.length === 2 ? [pair[0]!, pair[1]!] : undefined,
    });
  };

  return (
    <Panel kicker={view.yourInfluences.some((i) => !i.revealed && i.char === character) ? 'An honest claim' : 'A bold bluff'} title={`Claim the ${spec.name}`}>
      <div className={styles.claimHero}>
        <CharacterArt character={character} size={92} />
        <div>
          <p className={styles.panelSub}>{spec.description}</p>
          {a.cost > 0 && (
            <p className={styles.costLine}>
              <CoinIcon size={14} /> Costs {a.cost}, paid now. Refunded only if your claim is successfully challenged.
            </p>
          )}
        </div>
      </div>

      {isInq && (
        <div className={styles.segmented} role="radiogroup" aria-label="Inquisitor action">
          {(['exchange', 'peek'] as const).map((b) => (
            <button key={b} role="radio" aria-checked={branch === b} className={branch === b ? styles.segOn : ''} onClick={() => setBranch(b)}>
              {b === 'exchange' ? 'Exchange 1 with the deck' : "Examine a rival's card"}
            </button>
          ))}
        </div>
      )}

      {needsTarget && (
        <>
          <h4 className={styles.subhead}>Target</h4>
          <TargetPicker view={view} me={me} options={targets} onPick={setTarget} verb="Target" selected={target} />
        </>
      )}

      {needsPeek && tSeat && (
        <>
          <h4 className={styles.subhead}>Which card?</h4>
          <div className={styles.segmented} role="radiogroup" aria-label="Card to examine">
            {tSeat.influences.map((inf, i) => (
              <button
                key={i}
                role="radio"
                aria-checked={effPeek === i}
                disabled={inf.revealed}
                className={effPeek === i ? styles.segOn : ''}
                onClick={() => setPeekIdx(i as 0 | 1)}
              >
                Card {i + 1}
                {inf.revealed ? ' (face-up)' : ''}
              </button>
            ))}
          </div>
        </>
      )}

      {a.id === 'mercenaryHire' && (
        <>
          <h4 className={styles.subhead}>Partner (pays 1 coin with you)</h4>
          <TargetPicker view={view} me={me} options={partners} onPick={setPartner} verb="Hire with" selected={partner} />
        </>
      )}

      {a.target === 'pair' && (
        <>
          <h4 className={styles.subhead}>Bind two rivals by Treaty</h4>
          <div className={styles.targetGrid} role="group" aria-label="Treaty pair">
            {pairOptions.map((s) => (
              <button
                key={s}
                className={`${styles.targetBtn} ${pair.includes(s) ? styles.targetSelected : ''}`}
                aria-pressed={pair.includes(s)}
                onClick={() => setPair((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : cur.length < 2 ? [...cur, s] : [cur[1]!, s]))}
              >
                <span className={styles.targetName}>{nm(view, s)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className={styles.btnRow}>
        <button className={styles.ghostBtn} onClick={onCancel}>
          Back
        </button>
        <button className={styles.primaryBtn} disabled={!ready} onClick={declare}>
          Declare {spec.name}
        </button>
      </div>
      {needsTarget && targets.length === 0 && <p className={styles.panelSub}>No rival can be targeted right now.</p>}
    </Panel>
  );
}

// --- Challenge / block ------------------------------------------------------

function ChallengePanel({ view, me, dispatch, onBlock }: { view: CoupPublicState; me: number; dispatch: Dispatch; onBlock: boolean }) {
  const p = view.pending!;
  const claimer = onBlock ? p.blocker!.by : p.by;
  const char = onBlock ? p.blocker!.character : p.claimedCharacter!;
  const hand = view.yourInfluences.filter((i) => !i.revealed).map((i) => i.char);
  const lives = hand.length;
  return (
    <Panel kicker={onBlock ? 'A block is claimed' : 'A claim is made'} title={`${nm(view, claimer)} claims the ${CHARACTERS[char].name}`}>
      <div className={styles.claimHero}>
        <CharacterArt character={char} size={92} className={styles.accused} />
        <div>
          <p className={styles.panelSub}>
            {onBlock
              ? `Blocking ${nm(view, p.by)}'s ${actionLabel(p)}.`
              : `${actionLabel(p)}${p.target !== null ? ` against ${p.target === me ? 'you' : nm(view, p.target)}` : ''}.`}
          </p>
          <p className={styles.panelSub}>
            Challenge if you think it's a bluff. If they really hold the {CHARACTERS[char].name}, <strong>you</strong> lose an influence
            {lives <= 1 ? ' (your last)' : ''}; if not, they do.
          </p>
          {hand.includes(char) && <p className={styles.hint}>You hold a {CHARACTERS[char].name} yourself.</p>}
        </div>
      </div>
      <div className={styles.btnRow}>
        <button className={styles.challengeBtn} onClick={() => dispatch({ type: 'challenge', bySeat: me })}>
          <span aria-hidden>⚔</span> Challenge
        </button>
        <button className={styles.ghostBtn} onClick={() => dispatch({ type: 'pass', bySeat: me })}>
          Allow it
        </button>
      </div>
    </Panel>
  );
}

function BlockPanel({ view, me, dispatch }: { view: CoupPublicState; me: number; dispatch: Dispatch }) {
  const p = view.pending!;
  const hand = view.yourInfluences.filter((i) => !i.revealed).map((i) => i.char);
  const onMe = p.target === me;
  return (
    <Panel kicker={onMe ? 'You are targeted' : 'A chance to intervene'} title={`${nm(view, p.by)}: ${actionLabel(p)}${onMe ? ' on you' : ''}`} tone={onMe ? 'danger' : undefined}>
      <p className={styles.panelSub}>Claim a blocker to stop it (others may challenge your block), or let it resolve.</p>
      <div className={styles.claimGrid}>
        {p.validBlockers.map((c) => (
          <button key={c} className={styles.claimTile} onClick={() => dispatch({ type: 'declareBlock', bySeat: me, character: c })} aria-label={`Block as ${CHARACTERS[c].name}${hand.includes(c) ? ' (you hold it)' : ' (bluff)'}`}>
            <CharacterArt character={c} size={54} decorative />
            <span className={styles.claimText}>
              <span className={styles.claimName}>
                <span aria-hidden>🛡</span> Block as {CHARACTERS[c].name}
              </span>
              <span className={hand.includes(c) ? styles.honestTag : styles.bluffTag}>{hand.includes(c) ? 'In your hand' : 'Bluff'}</span>
            </span>
          </button>
        ))}
      </div>
      <div className={styles.btnRow}>
        <button className={styles.ghostBtn} onClick={() => dispatch({ type: 'pass', bySeat: me })}>
          {onMe ? 'Accept it' : "Don't block"}
        </button>
      </div>
    </Panel>
  );
}

// --- Card picks (lose / swap / sell) ------------------------------------------

function PickCardPanel({
  view,
  title,
  sub,
  verb,
  tone,
  onPick,
}: {
  view: CoupPublicState;
  me: number;
  title: string;
  sub: string;
  verb: string;
  tone: 'danger' | 'gold';
  onPick: (i: 0 | 1) => void;
}) {
  return (
    <Panel title={title} tone={tone}>
      <p className={styles.panelSub}>{sub}</p>
      <div className={styles.pickRow}>
        {view.yourInfluences.map((inf, i) =>
          inf.revealed ? (
            <div key={i} className={`${styles.pickCard} ${styles.pickGone}`}>
              <CharacterArt character={inf.char} size={96} faded />
              <span className={styles.handCaption}>Already lost</span>
            </div>
          ) : (
            <button key={i} className={`${styles.pickCard} ${tone === 'danger' ? styles.pickDanger : ''}`} onClick={() => onPick(i as 0 | 1)}>
              <CharacterArt character={inf.char} size={96} decorative />
              <span className={styles.handCaption}>
                {verb} {CHARACTERS[inf.char].name}
              </span>
            </button>
          ),
        )}
      </div>
    </Panel>
  );
}

function ExchangePanel({ view, me, dispatch }: { view: CoupPublicState; me: number; dispatch: Dispatch }) {
  const offer = view.yourExchangeOffer;
  const [picks, setPicks] = useState<number[]>([]);
  if (!offer) return <Panel title="Exchanging…" />;
  const n = offer.cards.length;
  const toggle = (i: number) =>
    setPicks((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : cur.length < offer.keepCount ? [...cur, i] : [...cur.slice(1), i]));
  return (
    <Panel kicker="Exchange with the court" title={`Keep ${offer.keepCount} of ${n}`}>
      <p className={styles.panelSub}>The rest are shuffled back into the court deck. Nobody else sees these cards.</p>
      <div className={styles.fan} role="group" aria-label="Exchange cards">
        {offer.cards.map((c, i) => {
          const on = picks.includes(i);
          const angle = (i - (n - 1) / 2) * 9;
          return (
            <button
              key={i}
              className={`${styles.fanCard} ${on ? styles.fanOn : ''}`}
              style={{ '--a': `${angle}deg`, '--d': `${i * 110}ms` } as CSSProperties}
              aria-pressed={on}
              aria-label={`${CHARACTERS[c].name}${on ? ', kept' : ''}`}
              onClick={() => toggle(i)}
            >
              <CharacterArt character={c} size={92} decorative />
              <span className={styles.fanTag}>{on ? 'Keep' : i >= offer.keepCount ? 'Drawn' : 'Yours'}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.btnRow}>
        <button className={styles.primaryBtn} disabled={picks.length !== offer.keepCount} onClick={() => dispatch({ type: 'exchangeReturn', bySeat: me, keepIndices: picks })}>
          Keep {picks.length}/{offer.keepCount}
        </button>
      </div>
    </Panel>
  );
}

function PeekPanel({ view, me, dispatch }: { view: CoupPublicState; me: number; dispatch: Dispatch }) {
  const latest = view.yourPeeks[view.yourPeeks.length - 1];
  const [shown, setShown] = useState(false);
  if (!latest) {
    return (
      <Panel title="Nothing to see">
        <div className={styles.btnRow}>
          <button className={styles.primaryBtn} onClick={() => dispatch({ type: 'ackPeek', bySeat: me })}>
            End turn
          </button>
        </div>
      </Panel>
    );
  }
  return (
    <Panel kicker="For your eyes only" title={`${nm(view, latest.target)}'s card ${latest.cardIndex + 1}`} tone="gold">
      <div className={styles.peekRow}>
        <FlipCard
          width={110}
          height={154}
          radius={8}
          revealed={shown}
          back={<CardBack size={110} />}
          front={<CharacterArt character={latest.card} size={110} />}
          onClick={() => setShown(true)}
          title="Reveal"
        />
        <div>
          {shown ? (
            <>
              <p className={styles.panelTitle}>{CHARACTERS[latest.card].name}</p>
              <p className={styles.panelSub}>{CHARACTERS[latest.card].description}</p>
            </>
          ) : (
            <button className={styles.ghostBtn} onClick={() => setShown(true)}>
              Turn the card
            </button>
          )}
        </div>
      </div>
      <div className={styles.btnRow}>
        <button className={styles.primaryBtn} onClick={() => dispatch({ type: 'ackPeek', bySeat: me })}>
          Done, end my turn
        </button>
      </div>
    </Panel>
  );
}

function PileOnPanel({ view, me, dispatch }: { view: CoupPublicState; me: number; dispatch: Dispatch }) {
  const p = view.pending!;
  const pot = p.pileOnPot!;
  return (
    <Panel kicker="Pile-on" title={`${nm(view, p.by)} opens the ${charName(p.claimedCharacter)} coffers`}>
      <p className={styles.panelSub}>
        Join to take +{pot.coinsEach} yourself. Joined: {pot.contributors.map((s) => nm(view, s)).join(', ')}.
      </p>
      <div className={styles.btnRow}>
        <button className={styles.primaryBtn} onClick={() => dispatch({ type: 'joinPileOn', bySeat: me })}>
          Join (+{pot.coinsEach})
        </button>
        <button className={styles.ghostBtn} onClick={() => dispatch({ type: 'pass', bySeat: me })}>
          Pass
        </button>
      </div>
    </Panel>
  );
}

function ChipInPanel({ view, me, dispatch }: { view: CoupPublicState; me: number; dispatch: Dispatch }) {
  const p = view.pending!;
  const pot = p.chipInPot!;
  const pct = Math.min(100, (pot.contributors.length / pot.threshold) * 100);
  return (
    <Panel kicker="A rally forms" title={`Topple ${nm(view, p.target)}?`} tone="danger">
      <p className={styles.panelSub}>Chip in 1 coin. At {pot.threshold} contributors, {nm(view, p.target)} loses an influence.</p>
      <div className={styles.meter} role="progressbar" aria-valuemin={0} aria-valuemax={pot.threshold} aria-valuenow={pot.contributors.length}>
        <div className={styles.meterFill} style={{ width: `${pct}%` }} />
      </div>
      <p className={styles.panelSub}>
        {pot.contributors.length}/{pot.threshold}: {pot.contributors.map((s) => nm(view, s)).join(', ') || 'nobody yet'}
      </p>
      <div className={styles.btnRow}>
        <button className={styles.challengeBtn} disabled={view.seats[me]!.coins < 1} onClick={() => dispatch({ type: 'chipIn', bySeat: me })}>
          Chip in 1 coin
        </button>
        <button className={styles.ghostBtn} onClick={() => dispatch({ type: 'pass', bySeat: me })}>
          Stay out
        </button>
      </div>
    </Panel>
  );
}

// ============================================================================
// Overlays
// ============================================================================

function HandoffCover({ name, reason, onConfirm }: { name: string; reason: string; onConfirm: () => void }) {
  return (
    <div className={styles.cover} role="dialog" aria-modal="true" aria-labelledby="coup-cover-title">
      <div className={styles.curtainL} aria-hidden />
      <div className={styles.curtainR} aria-hidden />
      <div className={styles.coverInner}>
        <div className={styles.coverSeal} aria-hidden>
          <CardBack size={84} />
        </div>
        <h2 id="coup-cover-title" className={styles.coverTitle}>
          Pass the device to {name}
        </h2>
        <p className={styles.coverSub}>{reason}</p>
        <p className={styles.coverHint}>Everyone else, look away.</p>
        <button className={styles.primaryBtn} autoFocus onClick={onConfirm}>
          I am {name}
        </button>
      </div>
    </div>
  );
}

function FxLayer({ banner, toasts }: { banner: Banner | null; toasts: Toast[] }) {
  return (
    <>
      {banner && (
        <div key={banner.key} className={`${styles.fxBanner} ${styles[`tone_${banner.tone}`] ?? ''}`} aria-hidden>
          <div className={styles.fxBannerInner}>
            {(banner.tone === 'proven' || banner.tone === 'bluff') && (
              <span className={styles.clash}>
                <span className={styles.bladeL}>🗡</span>
                <span className={styles.bladeR}>🗡</span>
              </span>
            )}
            {banner.character && <CharacterArt character={banner.character} size={70} className={styles.fxCard} decorative />}
            <div>
              <div className={styles.fxTitle}>{banner.title}</div>
              <div className={styles.fxSub}>{banner.sub}</div>
            </div>
          </div>
        </div>
      )}
      <div className={styles.toasts} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.key} className={`${styles.toast} ${styles[`toast_${t.tone}`] ?? ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

function FlightLayer({ flights }: { flights: Flight[] }) {
  if (flights.length === 0) return null;
  return (
    <div className={styles.flightLayer} aria-hidden>
      {flights.map((f) => (
        <span
          key={f.key}
          className={f.kind === 'coin' ? styles.flyCoin : styles.flyCard}
          style={
            {
              left: f.x0,
              top: f.y0,
              '--dx': `${f.x1 - f.x0}px`,
              '--dy': `${f.y1 - f.y0}px`,
              animationDelay: `${f.delay}ms`,
            } as CSSProperties
          }
        >
          {f.kind === 'coin' ? <CoinIcon size={22} /> : <CardBack size={34} />}
        </span>
      ))}
    </div>
  );
}

// ============================================================================
// Log + cheatsheet
// ============================================================================

function LogPanel({ view }: { view: CoupPublicState }) {
  const lines = useMemo(() => view.log.slice().reverse(), [view.log]);
  return (
    <section className={styles.logPanel} aria-label="Court chronicle">
      <h3 className={styles.sectionTitle}>Court chronicle</h3>
      <ol className={styles.log}>
        {lines.map((line, i) => (
          <li key={`${view.log.length - i}`} className={`${styles.logLine} ${i === 0 ? styles.logNew : ''}`}>
            {line}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Cheatsheet({ view }: { view: CoupPublicState }) {
  const hasTokens = view.activeCharacters.some((c) => ['peacekeeper', 'foreignConsular', 'armsDealer', 'priest', 'lawyer', 'bishop'].includes(c));
  return (
    <details className={styles.cheatsheet} open>
      <summary className={styles.sectionTitle}>The court's roles</summary>
      <div className={styles.cheatList}>
        <CheatRow title="Income" desc="+1 coin. Can't be challenged or blocked." icon={<CoinIcon size={24} />} />
        <CheatRow
          title="Foreign Aid"
          desc={`+2 coins. Not a claim, but ${
            validBlockersFor(view.activeCharacters, view.ruleset, { kind: 'general', generalId: 'foreignAid', characterActionId: null })
              .map((c) => CHARACTERS[c].name)
              .join(' / ') || 'nobody'
          } can block it.`}
          icon={<CoinIcon size={24} />}
        />
        <CheatRow
          title="Coup"
          desc={`Pay 7: target loses an influence. At 10+ coins you must Coup.${
            view.ruleset === 'g54' ? ' In G54 the target may block a voluntary Coup; a forced one is unblockable.' : ' Unstoppable.'
          }`}
          icon={<span className={styles.cheatGlyph}>♛</span>}
        />
        <CheatRow
          title="Challenges"
          desc="Any rival may challenge a claim. Proven: the card is shuffled back, a new one drawn, and the challenger loses an influence. Bluff: the claimer loses one and the action fails (its cost is refunded). A blocked action keeps its cost spent."
          icon={<span className={styles.cheatGlyph}>⚔</span>}
        />
        {hasTokens && (
          <CheatRow
            title="Tokens"
            desc="🕊 Peacekeeping: untargetable until your next action. 🤝 Treaty: the pair can't target each other (void once they're the last two). ⚔ Weapons: +1 steal each. ✚ Blessing: spares your last card once per game."
            icon={<span className={styles.cheatGlyph}>✚</span>}
          />
        )}
        {view.activeCharacters.map((c) => (
          <div key={c} className={styles.cheatRow}>
            <CharacterArt character={c} size={46} decorative />
            <div>
              <div className={styles.cheatName}>
                <span>{CHARACTERS[c].name}</span>
                <CategoryBadge character={c} />
              </div>
              <div className={styles.cheatDesc}>{CHARACTERS[c].description}</div>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function CheatRow({ title, desc, icon }: { title: string; desc: string; icon: ReactNode }) {
  return (
    <div className={styles.cheatRow}>
      <span className={styles.cheatIcon} aria-hidden>
        {icon}
      </span>
      <div>
        <div className={styles.cheatName}>{title}</div>
        <div className={styles.cheatDesc}>{desc}</div>
      </div>
    </div>
  );
}
