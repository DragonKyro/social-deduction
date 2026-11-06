import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useGameStore, useSeatSwitching } from '@/store/gameStore';
import { FlipCard } from '@/ui/shared/FlipCard';
import type { ShAction } from '../actions';
import { eligibleChancellors, SHARED_ACK_PHASES, termLimitedSeats } from '../rules';
import type {
  ShLogEntry,
  ShPhase,
  ShPolicy,
  ShPublicSeatState,
  ShPublicState,
  ShRoleId,
  ShVote,
} from '../state';
import {
  ELECTION_TRACKER_MAX,
  FASCIST_TRACK_LENGTH,
  HITLER_CHANCELLOR_THRESHOLD,
  LIBERAL_TRACK_LENGTH,
  VETO_THRESHOLD,
} from '../tracks';
import {
  BallotBack,
  BallotFace,
  DoveGlyph,
  PALETTE,
  PartyFace,
  PolicyBack,
  PolicyFace,
  Portrait,
  PowerIcon,
  RoleFace,
  SecretBack,
  SerpentGlyph,
  powerName,
  powerShort,
} from './art';
import styles from './GameView.module.css';

// ============================================================================
// Secret Hitler — game view ("the dossier").
//
// Hidden-info rules for this UI:
//   - It renders only `publicView` (already redacted for `localSeat`).
//   - Seat switching goes through `useSeatSwitching()`: disabled online,
//     never to AI seats. There is no click-a-seat-to-become-them control.
//   - In pass-and-play (2+ humans on this device) every private screen sits
//     behind a hand-over cover keyed to (phase, seat, log length), so it
//     re-locks as soon as anything changes. The roster / boards / minutes
//     only ever show public facts; your own role and investigation results
//     live in a dossier you have to open.
// ============================================================================

type Dispatch = (a: ShAction) => void;

interface Ctx {
  view: ShPublicState;
  me: number | null;
  dispatch: Dispatch;
  hotSeat: boolean;
  canView: (seat: number) => boolean;
  exitGame: () => void;
}

// Phases whose action screen shows something private to the actor.
const SECRET_PHASES: ReadonlySet<ShPhase> = new Set<ShPhase>([
  'setup',
  'electionVote',
  'legislativePresident',
  'legislativeChancellor',
  'vetoRequested',
  'execInvestigateReveal',
  'execPeek',
]);

function cls(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(' ');
}

function nameOf(v: ShPublicState, seat: number | null): string {
  if (seat === null) return '—';
  return v.seats[seat]?.name ?? `Seat ${seat + 1}`;
}

function policyLabel(p: ShPolicy): string {
  return p === 'liberal' ? 'Liberal' : 'Fascist';
}

function roleLabel(r: ShRoleId): string {
  return r === 'liberal' ? 'Liberal' : r === 'fascist' ? 'Fascist' : 'Hitler';
}

/** Seats the rules are waiting on right now (empty on shared screens). */
function actorSeats(v: ShPublicState): number[] {
  switch (v.phase) {
    case 'setup':
      return v.seats.filter((s) => !s.hasAckedSetup).map((s) => s.index);
    case 'electionVote':
      return v.seats.filter((s) => s.alive && !s.hasVoted).map((s) => s.index);
    case 'legislativeChancellor':
      return v.chancellorCandidateSeat === null ? [] : [v.chancellorCandidateSeat];
    case 'nomination':
    case 'legislativePresident':
    case 'vetoRequested':
    case 'execInvestigate':
    case 'execInvestigateReveal':
    case 'execSpecialElection':
    case 'execPeek':
    case 'execExecute':
      return [v.presidentSeat];
    default:
      return [];
  }
}

/** Becomes true `delayMs` after mount (drives flip / stamp sequencing). */
function useLater(delayMs: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return on;
}

/** Run `fn` once after `ms` (used to let an exit animation finish). */
function useDeferred(): (fn: () => void, ms: number) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (fn, ms) => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      fn();
    }, ms);
  };
}

// ============================================================================
// Root
// ============================================================================

export function SecretHitlerGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);
  const switching = useSeatSwitching();
  if (!publicView) return null;
  return (
    <Chamber
      view={publicView.view as ShPublicState}
      me={localSeat}
      dispatch={dispatch}
      exitGame={exitGame}
      switching={switching}
    />
  );
}

function Chamber({
  view,
  me,
  dispatch,
  exitGame,
  switching,
}: {
  view: ShPublicState;
  me: number | null;
  dispatch: Dispatch;
  exitGame: () => void;
  switching: ReturnType<typeof useSeatSwitching>;
}) {
  const humanSeats = view.seats.filter((s) => switching.canView(s.index));
  const hotSeat = switching.enabled && humanSeats.length > 1;

  const curtainKey = (seat: number | null) => `${view.phase}|${seat}|${view.log.length}`;
  const [unlockedKey, setUnlockedKey] = useState<string | null>(null);
  const unlocked = !hotSeat || unlockedKey === curtainKey(me);

  const dossierScope = hotSeat ? curtainKey(me) : `${me}`;
  const [dossierKey, setDossierKey] = useState<string | null>(null);
  const dossierOpen = dossierKey === dossierScope && me !== null;

  const toast = useEventToast(view);
  const actors = actorSeats(view);
  const ctx: Ctx = { view, me, dispatch, hotSeat, canView: switching.canView, exitGame };

  const takeSeat = (seat: number) => {
    if (seat !== me) switching.setLocalSeat(seat);
    setUnlockedKey(curtainKey(seat));
  };

  return (
    <div className={styles.root}>
      <div className={styles.lamp} aria-hidden="true" />
      <Header
        view={view}
        me={me}
        hotSeat={hotSeat}
        onDossier={() => setDossierKey(dossierScope)}
        onExit={exitGame}
      />
      <section className={styles.boards} aria-label="Policy boards">
        <LiberalBoard view={view} />
        <Piles view={view} />
        <FascistBoard view={view} />
      </section>
      <Assembly view={view} me={me} actors={actors} />
      <section className={styles.stage} aria-live="polite">
        <Stage ctx={ctx} actors={actors} unlocked={unlocked} takeSeat={takeSeat} />
      </section>
      <Minutes view={view} />
      {toast && <EventStamp key={toast.id} toast={toast} />}
      {dossierOpen && (
        <DossierModal view={view} hotSeat={hotSeat} onClose={() => setDossierKey(null)} />
      )}
    </div>
  );
}

// ============================================================================
// Header
// ============================================================================

function phaseTitle(v: ShPublicState): string {
  switch (v.phase) {
    case 'setup':
      return 'Opening the dossiers';
    case 'nomination':
      return `Nomination · President ${nameOf(v, v.presidentSeat)}${v.inSpecialElection ? ' (special election)' : ''}`;
    case 'electionVote':
      return `Election · ${nameOf(v, v.presidentSeat)} & ${nameOf(v, v.chancellorCandidateSeat)}`;
    case 'electionReveal':
      return 'Election results';
    case 'legislativePresident':
      return 'Legislative session · the President';
    case 'legislativeChancellor':
      return 'Legislative session · the Chancellor';
    case 'vetoRequested':
      return 'Legislative session · veto proposed';
    case 'policyReveal':
      return 'A policy is enacted';
    case 'topDeckReveal':
      return 'Chaos in the streets';
    case 'execInvestigate':
    case 'execInvestigateReveal':
      return 'Executive action · Investigate loyalty';
    case 'execSpecialElection':
      return 'Executive action · Special election';
    case 'execPeek':
      return 'Executive action · Policy peek';
    case 'execExecute':
      return 'Executive action · Execution';
    case 'gameOver':
      return 'Case closed';
  }
}

function Header({
  view,
  me,
  hotSeat,
  onDossier,
  onExit,
}: {
  view: ShPublicState;
  me: number | null;
  hotSeat: boolean;
  onDossier: () => void;
  onExit: () => void;
}) {
  const session = view.log.filter((e) => e.kind === 'electionResult').length + 1;
  return (
    <header className={styles.header}>
      <div>
        <span className={styles.kicker}>
          Classified · Session {session} · {view.seats.length} members
        </span>
        <h1 className={styles.title}>Secret Hitler</h1>
        <span className={styles.phaseLine}>{phaseTitle(view)}</span>
      </div>
      <div className={styles.headerActions}>
        {me !== null && view.yourRole && (
          <button type="button" className={styles.tabBtn} onClick={onDossier}>
            {hotSeat ? `Dossier: ${nameOf(view, me)}` : 'My dossier'}
          </button>
        )}
        <button type="button" className={styles.tabBtn} onClick={onExit}>
          Exit
        </button>
      </div>
    </header>
  );
}

// ============================================================================
// Boards, tracker, piles
// ============================================================================

function BoardHead({ party, title, count }: { party: 'liberal' | 'fascist'; title: string; count: string }) {
  return (
    <div className={styles.boardHead}>
      <svg viewBox="0 0 100 100" className={styles.boardEmblem} aria-hidden="true">
        <circle cx="50" cy="50" r="48" fill={party === 'liberal' ? '#e9dfc4' : PALETTE.black} stroke={PALETTE.cream} strokeWidth="3" />
        <g transform="translate(14 14) scale(0.72)">
          {party === 'liberal' ? (
            <DoveGlyph color={PALETTE.libDeep} accent="#5e7d3a" />
          ) : (
            <SerpentGlyph color="#c0302a" accent={PALETTE.cream} />
          )}
        </g>
      </svg>
      <span className={styles.boardTitle}>{title}</span>
      <span className={styles.boardCount}>{count}</span>
    </div>
  );
}

function LiberalBoard({ view }: { view: ShPublicState }) {
  const n = view.board.liberalEnacted;
  return (
    <div className={cls(styles.board, styles.libBoard)}>
      <BoardHead party="liberal" title="Liberal articles" count={`${n} / ${LIBERAL_TRACK_LENGTH}`} />
      <div className={styles.track} style={{ '--slots': LIBERAL_TRACK_LENGTH } as CSSProperties}>
        {Array.from({ length: LIBERAL_TRACK_LENGTH }, (_, i) => {
          const win = i === LIBERAL_TRACK_LENGTH - 1;
          return (
            <div key={i} className={cls(styles.slot, win && styles.slotWin)}>
              <span className={styles.slotEmpty}>
                {win ? (
                  <>
                    <PowerIcon power="win" size={18} />
                    <small>Liberals win</small>
                  </>
                ) : (
                  <small className={styles.slotNo}>{i + 1}</small>
                )}
              </span>
              {i < n && (
                <div className={styles.tile} style={{ '--i': i } as CSSProperties}>
                  <PolicyFace policy="liberal" compact />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ElectionTracker value={view.board.electionTracker} />
    </div>
  );
}

function FascistBoard({ view }: { view: ShPublicState }) {
  const n = view.board.fascistEnacted;
  return (
    <div className={cls(styles.board, styles.fasBoard)}>
      <BoardHead party="fascist" title="Fascist articles" count={`${n} / ${FASCIST_TRACK_LENGTH}`} />
      <div className={styles.track} style={{ '--slots': FASCIST_TRACK_LENGTH } as CSSProperties}>
        {Array.from({ length: FASCIST_TRACK_LENGTH }, (_, i) => {
          const win = i === FASCIST_TRACK_LENGTH - 1;
          const power = win ? null : (view.trackPowers[i] ?? null);
          return (
            <div
              key={i}
              className={cls(styles.slot, win && styles.slotWin)}
              title={power ? powerName(power) : undefined}
            >
              <span className={styles.slotEmpty}>
                {win ? (
                  <>
                    <PowerIcon power="win" size={18} />
                    <small>Fascists win</small>
                  </>
                ) : power ? (
                  <>
                    <PowerIcon power={power} size={18} />
                    <small>{powerShort(power)}</small>
                  </>
                ) : (
                  <small className={styles.slotNo}>{i + 1}</small>
                )}
                {i === VETO_THRESHOLD - 1 && <em className={styles.vetoNote}>+ veto</em>}
              </span>
              {i < n && (
                <div className={styles.tile} style={{ '--i': i } as CSSProperties}>
                  <PolicyFace policy="fascist" compact />
                </div>
              )}
            </div>
          );
        })}
        <div
          className={cls(styles.hitlerZone, n >= HITLER_CHANCELLOR_THRESHOLD && styles.hitlerZoneLive)}
          style={{
            gridColumn: `${HITLER_CHANCELLOR_THRESHOLD + 1} / span ${FASCIST_TRACK_LENGTH - HITLER_CHANCELLOR_THRESHOLD}`,
          }}
        >
          <PowerIcon power="hitler" size={12} />
          Hitler elected chancellor wins
        </div>
      </div>
    </div>
  );
}

function ElectionTracker({ value }: { value: number }) {
  return (
    <div
      className={cls(styles.tracker, value >= ELECTION_TRACKER_MAX - 1 && styles.trackerHot)}
      role="img"
      aria-label={`Election tracker: ${value} of ${ELECTION_TRACKER_MAX} failed governments`}
    >
      <span className={styles.trackerLabel}>Election tracker</span>
      <div className={styles.trackerRail}>
        {Array.from({ length: ELECTION_TRACKER_MAX + 1 }, (_, i) => (
          <span key={i} className={cls(styles.trackerStop, i === ELECTION_TRACKER_MAX && styles.trackerChaos)}>
            {i === ELECTION_TRACKER_MAX ? '!' : ''}
          </span>
        ))}
        <span className={styles.trackerMarker} style={{ '--pos': value } as CSSProperties} />
      </div>
      <span className={styles.trackerLabel}>Chaos</span>
    </div>
  );
}

function Piles({ view }: { view: ShPublicState }) {
  return (
    <div className={styles.piles}>
      <Pile label="Draw" count={view.policyDeckSize} />
      <Pile label="Discard" count={view.policyDiscardSize} />
    </div>
  );
}

function Pile({ label, count }: { label: string; count: number }) {
  const layers = Math.min(count, 5);
  return (
    <div className={styles.pile} role="img" aria-label={`${label} pile: ${count} policies`}>
      <div className={styles.pileStack}>
        {count === 0 && <div className={styles.pileEmpty} />}
        {Array.from({ length: layers }, (_, k) =>
          k === layers - 1 ? (
            <div key={k} className={styles.pileTop} style={{ '--k': k } as CSSProperties}>
              <PolicyBack />
            </div>
          ) : (
            <div key={k} className={styles.pileLayer} style={{ '--k': k } as CSSProperties} />
          ),
        )}
      </div>
      <span className={styles.pileLabel}>
        {label} <b>{count}</b>
      </span>
    </div>
  );
}

// ============================================================================
// The assembly (seat plaques) — public information only
// ============================================================================

function Assembly({ view, me, actors }: { view: ShPublicState; me: number | null; actors: number[] }) {
  const limited = view.phase === 'nomination' ? termLimitedSeats(view) : new Set<number>();
  const showActive = !SHARED_ACK_PHASES.has(view.phase) && view.phase !== 'gameOver';
  return (
    <section className={styles.assembly} aria-label="The assembly">
      {view.seats.map((s) => (
        <SeatPlaque
          key={s.index}
          view={view}
          seat={s}
          isMe={s.index === me}
          active={showActive && actors.includes(s.index)}
          termLimited={limited.has(s.index)}
        />
      ))}
    </section>
  );
}

function SeatPlaque({
  view,
  seat,
  isMe,
  active,
  termLimited,
}: {
  view: ShPublicState;
  seat: ShPublicSeatState;
  isMe: boolean;
  active: boolean;
  termLimited: boolean;
}) {
  const over = view.phase === 'gameOver';
  const isPres = !over && seat.index === view.presidentSeat && view.phase !== 'setup';
  const isChan = !over && seat.index === view.chancellorCandidateSeat;
  const chanLabel =
    view.phase === 'electionVote' || view.phase === 'electionReveal' ? 'Nominee' : 'Chancellor';
  const showBallot = seat.hasVoted || seat.voteCast !== null;
  const status = [
    isPres ? 'president' : null,
    isChan ? chanLabel.toLowerCase() : null,
    !seat.alive ? 'executed' : null,
    seat.voteCast ? `voted ${seat.voteCast}` : seat.hasVoted ? 'ballot cast' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <div
      className={cls(styles.plaque, active && styles.active, !seat.alive && styles.deadPlaque, isMe && styles.mine)}
      style={{ '--i': seat.index } as CSSProperties}
      aria-label={`${seat.name}${isMe ? ' (you)' : ''}${status ? ` — ${status}` : ''}`}
    >
      <span className={styles.plaqueNo}>No. {seat.index + 1}</span>
      <div className={styles.portrait}>
        <Portrait seat={seat.index} dead={!seat.alive} />
      </div>
      <div className={styles.plaqueName}>
        {seat.name}
        {isMe && <em>(you)</em>}
      </div>
      <div className={styles.plaqueTags}>
        {seat.isAI && <span className={styles.tag}>AI</span>}
        {seat.investigated && (
          <span className={styles.tagIcon} title="Investigated">
            <PowerIcon power="investigate" size={11} />
          </span>
        )}
        {termLimited && <span className={cls(styles.tag, styles.tagFaint)}>term-limited</span>}
        {seat.revealedRole && (
          <span className={cls(styles.tag, seat.revealedRole === 'liberal' ? styles.tagLib : styles.tagFas)}>
            {roleLabel(seat.revealedRole)}
          </span>
        )}
      </div>
      {isPres && <span className={cls(styles.placard, styles.placardPres)}>President</span>}
      {isChan && <span className={cls(styles.placard, styles.placardChan)}>{chanLabel}</span>}
      {showBallot && (
        <div className={styles.plaqueBallot}>
          <FlipCard
            front={seat.voteCast ? <BallotFace vote={seat.voteCast} /> : <BallotBack />}
            back={<BallotBack />}
            revealed={seat.voteCast !== null}
            width={34}
            height={48}
            radius={3}
            dealDelayMs={0}
          />
        </div>
      )}
      {!seat.alive && (
        <span className={styles.deadStampWrap} aria-hidden="true">
          <span className={styles.deadStamp}>Executed</span>
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Stage router
// ============================================================================

function Stage({
  ctx,
  actors,
  unlocked,
  takeSeat,
}: {
  ctx: Ctx;
  actors: number[];
  unlocked: boolean;
  takeSeat: (seat: number) => void;
}) {
  const { view, me, hotSeat, canView } = ctx;
  if (view.phase === 'gameOver') return <GameOverPanel ctx={ctx} />;
  if (SHARED_ACK_PHASES.has(view.phase)) {
    return <SharedReveal key={`${view.phase}|${view.log.length}`} ctx={ctx} />;
  }

  const myTurn = me !== null && actors.includes(me);
  const secret = SECRET_PHASES.has(view.phase);
  const panelKey = `${view.phase}|${me}|${view.log.length}`;

  if (hotSeat) {
    if (myTurn && (!secret || unlocked)) return <ActionPanel key={panelKey} ctx={ctx} />;
    const next = myTurn ? me : actors.find((s) => canView(s));
    if (next !== undefined && next !== null) {
      return (
        <HandoverCover
          key={`cover|${panelKey}|${next}`}
          view={view}
          seat={next}
          secret={secret}
          onOpen={() => takeSeat(next)}
        />
      );
    }
    return <WaitingPanel view={view} actors={actors} />;
  }
  if (myTurn) return <ActionPanel key={panelKey} ctx={ctx} />;
  return <WaitingPanel view={view} actors={actors} />;
}

function ActionPanel({ ctx }: { ctx: Ctx }) {
  switch (ctx.view.phase) {
    case 'setup':
      return <RoleRevealPanel ctx={ctx} />;
    case 'nomination':
      return <TargetPanel ctx={ctx} kind="nominate" />;
    case 'electionVote':
      return <BallotPanel ctx={ctx} />;
    case 'legislativePresident':
      return <PresidentPanel ctx={ctx} />;
    case 'legislativeChancellor':
      return <ChancellorPanel ctx={ctx} />;
    case 'vetoRequested':
      return <VetoPanel ctx={ctx} />;
    case 'execInvestigate':
      return <TargetPanel ctx={ctx} kind="investigate" />;
    case 'execInvestigateReveal':
      return <InvestigationPanel ctx={ctx} />;
    case 'execSpecialElection':
      return <TargetPanel ctx={ctx} kind="special" />;
    case 'execPeek':
      return <PeekPanel ctx={ctx} />;
    case 'execExecute':
      return <TargetPanel ctx={ctx} kind="execute" />;
    default:
      return null;
  }
}

// ============================================================================
// Shared bits
// ============================================================================

function Memo({
  kicker,
  title,
  children,
  tone,
}: {
  kicker: string;
  title: ReactNode;
  children: ReactNode;
  tone?: 'lib' | 'fas';
}) {
  return (
    <article className={cls(styles.memo, tone === 'lib' && styles.memoLib, tone === 'fas' && styles.memoFas)}>
      <header className={styles.memoHead}>
        <span className={styles.memoKicker}>{kicker}</span>
        <h2 className={styles.memoTitle}>{title}</h2>
      </header>
      {children}
    </article>
  );
}

function Stamp({ children, tone }: { children: ReactNode; tone: 'good' | 'bad' | 'ink' }) {
  return (
    <span
      className={cls(
        styles.stamp,
        tone === 'good' && styles.stampGood,
        tone === 'bad' && styles.stampBad,
        tone === 'ink' && styles.stampInk,
      )}
    >
      {children}
    </span>
  );
}

function GovernmentLine({ view }: { view: ShPublicState }) {
  const chan = view.chancellorCandidateSeat;
  return (
    <div className={styles.gov}>
      <span className={styles.govCard}>
        <span className={styles.govPortrait}>
          <Portrait seat={view.presidentSeat} />
        </span>
        <span>
          <small>President</small>
          <b>{nameOf(view, view.presidentSeat)}</b>
        </span>
      </span>
      {chan !== null && (
        <span className={styles.govCard}>
          <span className={styles.govPortrait}>
            <Portrait seat={chan} />
          </span>
          <span>
            <small>Chancellor</small>
            <b>{nameOf(view, chan)}</b>
          </span>
        </span>
      )}
    </div>
  );
}

const COVER_REASON: Record<ShPhase, string> = {
  setup: 'Time to read your secret dossier.',
  nomination: 'As President, nominate a Chancellor.',
  electionVote: 'Cast your sealed ballot on the proposed government.',
  electionReveal: '',
  legislativePresident: 'As President, review three policies in private.',
  legislativeChancellor: 'As Chancellor, choose the policy to enact.',
  vetoRequested: 'The Chancellor proposes a veto. Agree or refuse.',
  policyReveal: '',
  topDeckReveal: '',
  execInvestigate: 'Choose whose party loyalty to investigate.',
  execInvestigateReveal: 'Read the investigation file — for your eyes only.',
  execSpecialElection: 'Name the next presidential candidate.',
  execPeek: 'Examine the top three policies in secret.',
  execExecute: 'You must order an execution.',
  gameOver: '',
};

function HandoverCover({
  view,
  seat,
  secret,
  onOpen,
}: {
  view: ShPublicState;
  seat: number;
  secret: boolean;
  onOpen: () => void;
}) {
  const name = nameOf(view, seat);
  return (
    <div className={styles.cover} data-tab={secret ? 'Eyes only' : 'Hand over'}>
      <span className={styles.coverStamp}>{secret ? 'Top secret' : 'Your move'}</span>
      <h2 className={styles.coverTitle}>
        Pass the device to <b>{name}</b>
      </h2>
      <p className={styles.coverText}>
        {COVER_REASON[view.phase]}
        {secret && ' Everyone else, look away.'}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.stampBtn} onClick={onOpen}>
          I am {name} — open the file
        </button>
      </div>
    </div>
  );
}

function WaitingPanel({ view, actors }: { view: ShPublicState; actors: number[] }) {
  const pres = nameOf(view, view.presidentSeat);
  const chan = nameOf(view, view.chancellorCandidateSeat);
  const ai = actors.length > 0 && actors.every((s) => view.seats[s]?.isAI);
  let text: string;
  switch (view.phase) {
    case 'setup': {
      const ready = view.seats.filter((s) => s.hasAckedSetup).length;
      text = `The members are reading their dossiers (${ready} of ${view.seats.length} ready)`;
      break;
    }
    case 'nomination':
      text = `President ${pres} is choosing a Chancellor`;
      break;
    case 'electionVote': {
      const alive = view.seats.filter((s) => s.alive);
      const cast = alive.filter((s) => s.hasVoted).length;
      text = `Ballots are being sealed — ${cast} of ${alive.length} cast`;
      break;
    }
    case 'legislativePresident':
      text = `President ${pres} is reviewing three policies in private`;
      break;
    case 'legislativeChancellor':
      text = view.vetoRefused
        ? `The President refused the veto. Chancellor ${chan} must enact a policy`
        : `Chancellor ${chan} is choosing which policy to enact`;
      break;
    case 'vetoRequested':
      text = `Chancellor ${chan} proposes to veto this agenda. President ${pres} must agree or refuse`;
      break;
    case 'execInvestigate':
      text = `President ${pres} is choosing whose loyalty to investigate`;
      break;
    case 'execInvestigateReveal':
      text = `President ${pres} is reading the investigation file`;
      break;
    case 'execSpecialElection':
      text = `President ${pres} is naming the next presidential candidate`;
      break;
    case 'execPeek':
      text = `President ${pres} is secretly examining the top three policies`;
      break;
    case 'execExecute':
      text = `President ${pres} must execute a member of the assembly`;
      break;
    default:
      text = 'Waiting';
  }
  return (
    <div className={styles.waiting}>
      {view.phase === 'electionVote' && <GovernmentLine view={view} />}
      <p className={styles.waitingText}>
        {text}
        <span className={styles.dots} aria-hidden="true" />
      </p>
      {ai && <p className={styles.waitingSub}>The AI is deliberating.</p>}
    </div>
  );
}

// ============================================================================
// Setup — the role dossier
// ============================================================================

function roleBrief(role: ShRoleId, players: number): string {
  switch (role) {
    case 'liberal':
      return 'Enact five Liberal policies, or find Hitler and have him executed. You know nothing about anyone else — trust must be earned.';
    case 'fascist':
      return 'Enact six Fascist policies, or get Hitler elected Chancellor once three Fascist policies are on the board. You know your fellow Fascists and Hitler. Protect them.';
    case 'hitler':
      return players <= 6
        ? 'You lead the Fascists and you know your Fascist. Look Liberal. Once three Fascist policies are enacted, being elected Chancellor wins the game.'
        : 'You lead the Fascists, but you do not know who they are — they know you. Look Liberal. Once three Fascist policies are enacted, being elected Chancellor wins the game.';
  }
}

function RoleFolder({ view, open }: { view: ShPublicState; open: boolean }) {
  const role = view.yourRole;
  const party = view.yourParty;
  const cardOpen = useLater(900);
  if (!role || !party) return null;
  return (
    <div className={cls(styles.folder, open && styles.folderOpen)}>
      <div className={styles.folderInside}>
        <FlipCard
          front={<RoleFace role={role} />}
          back={<SecretBack caption="SECRET ROLE" />}
          revealed={open && cardOpen}
          width={150}
          height={210}
          radius={6}
        />
        <div className={styles.folderNotes}>
          <p className={styles.noteLine}>
            Subject: <b>{nameOf(view, view.yourSeat)}</b>
          </p>
          <p className={styles.noteLine}>
            Secret role: <b className={role === 'liberal' ? styles.inkLib : styles.inkFas}>{roleLabel(role)}</b>
            {' · '}Party: <b className={party === 'liberal' ? styles.inkLib : styles.inkFas}>{policyLabel(party)}</b>
          </p>
          <p className={styles.noteBrief}>{roleBrief(role, view.seats.length)}</p>
          {view.yourPartyKnowledge.length > 0 && (
            <div className={styles.knownSlip}>
              <span className={styles.knownTitle}>Known associates</span>
              <ul>
                {view.yourPartyKnowledge.map((k) => (
                  <li key={k.seat}>
                    {nameOf(view, k.seat)} — <b className={styles.inkFas}>{roleLabel(k.role)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {view.yourInvestigations.length > 0 && (
            <div className={styles.knownSlip}>
              <span className={styles.knownTitle}>Your investigations</span>
              <ul>
                {view.yourInvestigations.map((inv) => (
                  <li key={inv.target}>
                    {nameOf(view, inv.target)} —{' '}
                    <b className={inv.party === 'liberal' ? styles.inkLib : styles.inkFas}>{policyLabel(inv.party)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className={styles.folderCover} aria-hidden="true">
        <span className={styles.folderLabel}>Dossier · {nameOf(view, view.yourSeat)}</span>
        <span className={styles.coverStamp}>Top secret</span>
      </div>
    </div>
  );
}

function RoleRevealPanel({ ctx }: { ctx: Ctx }) {
  const { view, me, dispatch } = ctx;
  const open = useLater(300);
  if (me === null) return null;
  return (
    <Memo kicker="Eyes only" title="Your secret dossier">
      <RoleFolder view={view} open={open} />
      <div className={styles.actions}>
        <button type="button" className={styles.stampBtn} onClick={() => dispatch({ type: 'ackRoleReveal', bySeat: me })}>
          I have memorised my role
        </button>
      </div>
    </Memo>
  );
}

function DossierModal({ view, hotSeat, onClose }: { view: ShPublicState; hotSeat: boolean; onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(!hotSeat);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.scrim} role="dialog" aria-modal="true" aria-label="Your dossier" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {confirmed ? (
          <Memo kicker="Eyes only" title="Your dossier">
            <RoleFolder view={view} open />
            <div className={styles.actions}>
              <button type="button" className={styles.stampBtn} onClick={onClose} autoFocus>
                Close the dossier
              </button>
            </div>
          </Memo>
        ) : (
          <div className={styles.cover} data-tab="Eyes only">
            <span className={styles.coverStamp}>Top secret</span>
            <h2 className={styles.coverTitle}>
              Only <b>{nameOf(view, view.yourSeat)}</b> may read this
            </h2>
            <p className={styles.coverText}>Make sure nobody else can see the screen.</p>
            <div className={styles.actions}>
              <button type="button" className={styles.stampBtn} onClick={() => setConfirmed(true)} autoFocus>
                I am {nameOf(view, view.yourSeat)} — open
              </button>
              <button type="button" className={cls(styles.stampBtn, styles.ghostBtn)} onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Target pickers: nominate / investigate / special election / execute
// ============================================================================

type TargetKind = 'nominate' | 'investigate' | 'special' | 'execute';

const TARGET_COPY: Record<TargetKind, { title: string; text: string; verb: string }> = {
  nominate: {
    title: 'Nominate a Chancellor',
    text: 'Choose a running mate. The assembly will vote on your government.',
    verb: 'Nominate',
  },
  investigate: {
    title: 'Investigate loyalty',
    text: 'You will secretly see this member’s party membership (Hitler reads as Fascist). The table only learns whom you investigated.',
    verb: 'Investigate',
  },
  special: {
    title: 'Call a special election',
    text: 'Name any other member as the next presidential candidate. Afterwards the presidency returns to the player on your left.',
    verb: 'Name president:',
  },
  execute: {
    title: 'Order an execution',
    text: 'The executed member is out of the game. Their role stays secret — unless they were Hitler, in which case the Liberals win.',
    verb: 'Execute',
  },
};

function TargetPanel({ ctx, kind }: { ctx: Ctx; kind: TargetKind }) {
  const { view, me, dispatch } = ctx;
  const [pick, setPick] = useState<number | null>(null);
  if (me === null) return null;

  const eligibleNom = new Set(eligibleChancellors(view));
  const limited = termLimitedSeats(view);
  const why = (s: ShPublicSeatState): string | null => {
    if (s.index === me) return 'You';
    if (!s.alive) return 'Executed';
    if (kind === 'nominate' && !eligibleNom.has(s.index)) return limited.has(s.index) ? 'Term-limited' : 'Ineligible';
    if (kind === 'investigate' && s.investigated) return 'Already investigated';
    return null;
  };

  const c = TARGET_COPY[kind];
  const kicker =
    kind === 'nominate' ? (view.inSpecialElection ? 'Special election · nomination' : 'Nomination') : 'Executive action';
  const text =
    kind === 'nominate' && view.board.fascistEnacted >= HITLER_CHANCELLOR_THRESHOLD
      ? 'Three or more Fascist policies are enacted: if your nominee is Hitler and the assembly elects them, the Fascists win.'
      : c.text;

  const confirm = () => {
    if (pick === null) return;
    if (kind === 'nominate') dispatch({ type: 'nominateChancellor', bySeat: me, chancellor: pick });
    else if (kind === 'investigate') dispatch({ type: 'execInvestigate', bySeat: me, target: pick });
    else if (kind === 'special') dispatch({ type: 'execSpecialElection', bySeat: me, nextPresident: pick });
    else dispatch({ type: 'execExecute', bySeat: me, target: pick });
  };

  return (
    <Memo kicker={kicker} title={c.title} tone={kind === 'execute' ? 'fas' : undefined}>
      <p className={styles.memoText}>{text}</p>
      <div className={styles.targets} role="group" aria-label={c.title}>
        {view.seats.map((s) => {
          const reason = why(s);
          return (
            <button
              type="button"
              key={s.index}
              className={styles.target}
              disabled={reason !== null}
              aria-pressed={pick === s.index}
              onClick={() => setPick(s.index)}
            >
              <span className={styles.targetPortrait}>
                <Portrait seat={s.index} dead={!s.alive} />
              </span>
              <span className={styles.targetText}>
                <span className={styles.targetName}>{s.name}</span>
                <span className={styles.targetWhy}>{reason ?? (s.isAI ? 'AI' : ' ')}</span>
              </span>
              {pick === s.index && (
                <span className={cls(styles.targetMark, kind === 'execute' && styles.targetMarkKill)} aria-hidden="true">
                  {kind === 'execute' ? '✕' : '✓'}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={cls(styles.stampBtn, kind === 'execute' && styles.danger)}
          disabled={pick === null}
          onClick={confirm}
        >
          {c.verb} {pick !== null ? nameOf(view, pick) : '…'}
        </button>
      </div>
    </Memo>
  );
}

// ============================================================================
// Election
// ============================================================================

function BallotPanel({ ctx }: { ctx: Ctx }) {
  const { view, me, dispatch } = ctx;
  const [pick, setPick] = useState<ShVote | null>(null);
  const [casting, setCasting] = useState(false);
  const later = useDeferred();
  if (me === null) return null;
  const danger = view.board.fascistEnacted >= HITLER_CHANCELLOR_THRESHOLD;
  const cast = () => {
    if (!pick || casting) return;
    setCasting(true);
    later(() => dispatch({ type: 'castVote', bySeat: me, vote: pick }), 460);
  };
  return (
    <Memo kicker="Sealed ballot" title="Do you approve this government?">
      <GovernmentLine view={view} />
      {danger && (
        <p className={cls(styles.memoText, styles.warn)}>
          Three Fascist policies are enacted. If {nameOf(view, view.chancellorCandidateSeat)} is Hitler,
          electing them hands the Fascists victory.
        </p>
      )}
      {view.board.electionTracker === ELECTION_TRACKER_MAX - 1 && (
        <p className={cls(styles.memoText, styles.warn)}>
          Two governments have failed. If this one fails too, the country falls into chaos.
        </p>
      )}
      <div className={styles.ballotChoice} role="radiogroup" aria-label="Your vote">
        {(['ja', 'nein'] as const).map((v) => (
          <button
            type="button"
            role="radio"
            key={v}
            aria-checked={pick === v}
            aria-label={v === 'ja' ? 'Ja! — approve' : 'Nein! — reject'}
            className={cls(
              styles.ballotBtn,
              pick === v && styles.ballotPicked,
              casting && pick === v && styles.casting,
              casting && pick !== v && styles.fadeOut,
            )}
            onClick={() => !casting && setPick(v)}
          >
            <BallotFace vote={v} />
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.stampBtn} disabled={!pick || casting} onClick={cast}>
          Seal &amp; cast ballot
        </button>
      </div>
    </Memo>
  );
}

// ============================================================================
// Legislative session
// ============================================================================

function HandCard({
  policy,
  index,
  marked,
  markLabel,
  leaving,
  onClick,
  disabled,
}: {
  policy: ShPolicy;
  index: number;
  marked: boolean;
  markLabel: string;
  leaving: 'discard' | 'pass' | 'board' | null;
  onClick: () => void;
  disabled: boolean;
}) {
  const flipped = useLater(520 + index * 170);
  return (
    <button
      type="button"
      className={cls(
        styles.handCard,
        marked && styles.handMarked,
        leaving === 'discard' && styles.toDiscard,
        leaving === 'pass' && styles.toPass,
        leaving === 'board' && styles.toBoard,
      )}
      aria-pressed={marked}
      aria-label={`${policyLabel(policy)} policy${marked ? ` — ${markLabel.toLowerCase()}` : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <FlipCard
        front={<PolicyFace policy={policy} />}
        back={<PolicyBack />}
        revealed={flipped}
        width={108}
        height={151}
        radius={5}
        dealDelayMs={index * 150}
      />
      {marked && <span className={styles.cardStamp}>{markLabel}</span>}
    </button>
  );
}

function PresidentPanel({ ctx }: { ctx: Ctx }) {
  const { view, me, dispatch } = ctx;
  const hand = view.yourLegislativeHand;
  const [discard, setDiscard] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const later = useDeferred();
  if (me === null || !hand) return null;
  const go = () => {
    if (discard === null || leaving) return;
    setLeaving(true);
    later(() => dispatch({ type: 'presidentDiscard', bySeat: me, discardIndex: discard as 0 | 1 | 2 }), 560);
  };
  return (
    <Memo kicker="Legislative session · for the President only" title="Discard one policy">
      <p className={styles.memoText}>
        You drew three policies. Discard one in secret and pass the other two to Chancellor{' '}
        <b>{nameOf(view, view.chancellorCandidateSeat)}</b>. You may say whatever you like about them
        afterwards.
      </p>
      <div className={styles.handRow}>
        {hand.map((p, i) => (
          <HandCard
            key={i}
            policy={p}
            index={i}
            marked={discard === i}
            markLabel="Discard"
            leaving={leaving ? (discard === i ? 'discard' : 'pass') : null}
            onClick={() => setDiscard(i)}
            disabled={leaving}
          />
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.stampBtn} disabled={discard === null || leaving} onClick={go}>
          Discard &amp; pass two to the Chancellor
        </button>
      </div>
    </Memo>
  );
}

function ChancellorPanel({ ctx }: { ctx: Ctx }) {
  const { view, me, dispatch } = ctx;
  const hand = view.yourLegislativeHand;
  const [enact, setEnact] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const later = useDeferred();
  if (me === null || !hand) return null;
  const canVeto = view.board.vetoUnlocked && !view.vetoRefused;
  const go = () => {
    if (enact === null || leaving) return;
    setLeaving(true);
    later(() => dispatch({ type: 'chancellorEnact', bySeat: me, enactIndex: enact as 0 | 1 }), 600);
  };
  return (
    <Memo kicker="Legislative session · for the Chancellor only" title="Enact one policy">
      <p className={styles.memoText}>
        President <b>{nameOf(view, view.presidentSeat)}</b> passed you two policies. Enact one; the
        other is discarded unseen.
      </p>
      {view.vetoRefused && (
        <p className={cls(styles.memoText, styles.warn)}>The President refused your veto. You must enact a policy.</p>
      )}
      <div className={styles.handRow}>
        {hand.map((p, i) => (
          <HandCard
            key={i}
            policy={p}
            index={i}
            marked={enact === i}
            markLabel="Enact"
            leaving={leaving ? (enact === i ? 'board' : 'discard') : null}
            onClick={() => setEnact(i)}
            disabled={leaving}
          />
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.stampBtn} disabled={enact === null || leaving} onClick={go}>
          Enact the selected policy
        </button>
        {canVeto && (
          <button
            type="button"
            className={cls(styles.stampBtn, styles.danger)}
            disabled={leaving}
            onClick={() => dispatch({ type: 'chancellorRequestVeto', bySeat: me })}
          >
            Propose a veto
          </button>
        )}
      </div>
      {canVeto && (
        <p className={styles.memoFoot}>
          Veto power: with the President’s consent both policies are discarded and the election tracker
          advances.
        </p>
      )}
    </Memo>
  );
}

function VetoPanel({ ctx }: { ctx: Ctx }) {
  const { view, me, dispatch } = ctx;
  if (me === null) return null;
  const passed = view.yourPassedPolicies;
  const chaos = view.board.electionTracker + 1 >= ELECTION_TRACKER_MAX;
  return (
    <Memo
      kicker="Veto proposed · for the President only"
      title={`Chancellor ${nameOf(view, view.chancellorCandidateSeat)} wishes to veto this agenda`}
    >
      {passed && (
        <div className={styles.miniRow}>
          <span className={styles.miniLabel}>You passed:</span>
          {passed.map((p, i) => (
            <span key={i} className={styles.miniCard}>
              <PolicyFace policy={p} compact />
            </span>
          ))}
        </div>
      )}
      <p className={styles.memoText}>
        If you agree, both policies are discarded and the election tracker advances
        {chaos ? ' — to chaos: the top policy will be enacted automatically.' : '.'} If you refuse, the
        Chancellor must enact one of them.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={cls(styles.stampBtn, styles.danger)}
          onClick={() => dispatch({ type: 'presidentRespondVeto', bySeat: me, accept: true })}
        >
          Ja — veto both
        </button>
        <button
          type="button"
          className={styles.stampBtn}
          onClick={() => dispatch({ type: 'presidentRespondVeto', bySeat: me, accept: false })}
        >
          Nein — enact one
        </button>
      </div>
    </Memo>
  );
}

// ============================================================================
// Executive results (private)
// ============================================================================

function InvestigationPanel({ ctx }: { ctx: Ctx }) {
  const { view, me, dispatch } = ctx;
  const result = view.yourPendingInvestigationResult;
  const open = useLater(250);
  const flip = useLater(1100);
  if (me === null || !result) return null;
  return (
    <Memo kicker="Investigation · for the President only" title={`File: ${nameOf(view, result.target)}`}>
      <div className={cls(styles.folder, styles.folderSmall, open && styles.folderOpen)}>
        <div className={styles.folderInside}>
          <FlipCard
            front={<PartyFace party={result.party} />}
            back={<SecretBack caption="MEMBERSHIP" />}
            revealed={flip}
            width={130}
            height={182}
            radius={6}
          />
          <div className={styles.folderNotes}>
            <p className={styles.noteLine}>
              Party membership of <b>{nameOf(view, result.target)}</b>:
            </p>
            <div className={styles.stampRow}>
              {flip && <Stamp tone={result.party === 'liberal' ? 'good' : 'bad'}>{policyLabel(result.party)}</Stamp>}
            </div>
            <p className={styles.noteBrief}>Hitler’s card reads Fascist. You may share this result honestly — or lie.</p>
          </div>
        </div>
        <div className={styles.folderCover} aria-hidden="true">
          <span className={styles.folderLabel}>Investigation · {nameOf(view, result.target)}</span>
          <span className={styles.coverStamp}>Confidential</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.stampBtn} onClick={() => dispatch({ type: 'ackInvestigateReveal', bySeat: me })}>
          Close the file
        </button>
      </div>
    </Memo>
  );
}

const ORDINAL = ['Top', '2nd', '3rd'];

function PeekCard({ policy, index }: { policy: ShPolicy; index: number }) {
  const flipped = useLater(450 + index * 260);
  return (
    <figure className={styles.peekCard}>
      <FlipCard
        front={<PolicyFace policy={policy} />}
        back={<PolicyBack />}
        revealed={flipped}
        width={100}
        height={140}
        radius={5}
        dealDelayMs={index * 120}
      />
      <figcaption>{ORDINAL[index] ?? `${index + 1}th`}</figcaption>
    </figure>
  );
}

function PeekPanel({ ctx }: { ctx: Ctx }) {
  const { view, me, dispatch } = ctx;
  const peek = view.yourPeek;
  if (me === null || !peek) return null;
  return (
    <Memo kicker="Policy peek · for the President only" title="The next three policies">
      <p className={styles.memoText}>These will be drawn next, in this order. They go back on top unchanged.</p>
      <div className={styles.handRow}>
        {peek.map((p, i) => (
          <PeekCard key={i} policy={p} index={i} />
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.stampBtn} onClick={() => dispatch({ type: 'ackPeek', bySeat: me })}>
          Memorised — return them
        </button>
      </div>
    </Memo>
  );
}

// ============================================================================
// Shared reveals: election result, enacted policy, chaos
// ============================================================================

function ContinueButton({ ctx, action }: { ctx: Ctx; action: (seat: number) => ShAction }) {
  const { me, dispatch } = ctx;
  if (me === null) return <p className={styles.memoFoot}>Waiting for a member to continue…</p>;
  return (
    <div className={styles.actions}>
      <button type="button" className={styles.stampBtn} onClick={() => dispatch(action(me))}>
        Continue
      </button>
    </div>
  );
}

function RevealBallot({ seat }: { seat: ShPublicSeatState }) {
  const flipped = useLater(380);
  return (
    <figure className={styles.spreadBallot}>
      <FlipCard
        front={seat.voteCast ? <BallotFace vote={seat.voteCast} /> : <BallotBack />}
        back={<BallotBack />}
        revealed={flipped && seat.voteCast !== null}
        width={58}
        height={81}
        radius={4}
      />
      <figcaption>{seat.name}</figcaption>
    </figure>
  );
}

function SharedReveal({ ctx }: { ctx: Ctx }) {
  const { view } = ctx;
  const stamped = useLater(1150);
  const flipped = useLater(350);

  if (view.phase === 'electionReveal') {
    const voters = view.seats.filter((s) => s.alive);
    const ja = voters.filter((s) => s.voteCast === 'ja').length;
    const nein = voters.filter((s) => s.voteCast === 'nein').length;
    const approved = ja > nein;
    const nextTracker = view.board.electionTracker + 1;
    return (
      <Memo kicker="The votes are in" title="Election results">
        <GovernmentLine view={view} />
        <div className={styles.ballotSpread}>
          {voters.map((s) => (
            <RevealBallot key={s.index} seat={s} />
          ))}
        </div>
        <p className={styles.tally}>
          Ja! <b>{ja}</b> · Nein! <b>{nein}</b>
        </p>
        <div className={styles.stampRow}>
          {stamped && <Stamp tone={approved ? 'good' : 'bad'}>{approved ? 'Elected' : 'Rejected'}</Stamp>}
        </div>
        <p className={cls(styles.memoText, styles.center)}>
          {approved
            ? `The government is formed. President ${nameOf(view, view.presidentSeat)} draws three policies.`
            : nextTracker >= ELECTION_TRACKER_MAX
              ? 'A third failed government in a row — the country is thrown into chaos!'
              : `The election tracker advances to ${nextTracker} of ${ELECTION_TRACKER_MAX}. The presidency moves on.`}
        </p>
        <ContinueButton ctx={ctx} action={(seat) => ({ type: 'ackElectionReveal', bySeat: seat })} />
      </Memo>
    );
  }

  const policy = view.lastEnactedPolicy ?? 'liberal';
  const chaos = view.phase === 'topDeckReveal';
  const lastGov = [...view.log].reverse().find((e) => e.kind === 'policyEnacted');
  return (
    <Memo
      kicker={chaos ? 'Chaos · the frustrated populace acts' : 'Official gazette'}
      title={`${policyLabel(policy)} policy enacted`}
      tone={policy === 'liberal' ? 'lib' : 'fas'}
    >
      <div className={styles.enactRow}>
        <div className={styles.enactCard}>
          <FlipCard
            front={<PolicyFace policy={policy} />}
            back={<PolicyBack />}
            revealed={flipped}
            width={128}
            height={179}
            radius={6}
            dealDelayMs={0}
          />
          {stamped && (
            <span className={styles.enactStamp}>
              <Stamp tone={policy === 'liberal' ? 'good' : 'bad'}>Enacted</Stamp>
            </span>
          )}
        </div>
        <div className={styles.enactNotes}>
          {chaos ? (
            <p className={styles.memoText}>
              Three governments failed, so the top policy was enacted automatically. No executive power
              triggers, and all term limits are forgotten.
            </p>
          ) : (
            lastGov?.kind === 'policyEnacted' && (
              <p className={styles.memoText}>
                Signed by President <b>{nameOf(view, lastGov.president)}</b> and Chancellor{' '}
                <b>{nameOf(view, lastGov.chancellor)}</b>.
              </p>
            )
          )}
          {view.pendingExec && (
            <p className={cls(styles.memoText, styles.powerNote)}>
              <PowerIcon power={view.pendingExec} size={18} />
              <span>
                Executive action authorised: <b>{powerName(view.pendingExec)}</b> — President{' '}
                {nameOf(view, view.presidentSeat)} acts next.
              </span>
            </p>
          )}
          {policy === 'fascist' && view.board.fascistEnacted === VETO_THRESHOLD && (
            <p className={cls(styles.memoText, styles.warn)}>Veto power is now unlocked.</p>
          )}
          {policy === 'fascist' && view.board.fascistEnacted === HITLER_CHANCELLOR_THRESHOLD && (
            <p className={cls(styles.memoText, styles.warn)}>
              From now on, electing Hitler as Chancellor wins the game for the Fascists.
            </p>
          )}
        </div>
      </div>
      <ContinueButton
        ctx={ctx}
        action={(seat) =>
          chaos ? { type: 'ackTopDeckReveal', bySeat: seat } : { type: 'ackPolicyReveal', bySeat: seat }
        }
      />
    </Memo>
  );
}

// ============================================================================
// Game over
// ============================================================================

function winReasonText(view: ShPublicState): string {
  switch (view.winReason) {
    case 'liberalTrack':
      return 'Five Liberal policies were enacted. The republic endures.';
    case 'fascistTrack':
      return 'Six Fascist policies were enacted. The Fascists have seized the state.';
    case 'hitlerElected':
      return `Hitler (${nameOf(view, view.chancellorCandidateSeat)}) was elected Chancellor after three Fascist policies.`;
    case 'hitlerExecuted':
      return 'The President executed Hitler. The conspiracy collapses.';
    default:
      return '';
  }
}

function winReasonShort(view: ShPublicState): string {
  switch (view.winReason) {
    case 'liberalTrack':
      return 'Five liberal articles';
    case 'fascistTrack':
      return 'Six fascist articles';
    case 'hitlerElected':
      return 'Hitler elected';
    case 'hitlerExecuted':
      return 'Hitler executed';
    default:
      return 'Case closed';
  }
}

function RevealRole({ seat, index }: { seat: ShPublicSeatState; index: number }) {
  const flipped = useLater(700 + index * 170);
  return (
    <figure className={styles.revealFig}>
      <FlipCard
        front={seat.revealedRole ? <RoleFace role={seat.revealedRole} /> : <SecretBack />}
        back={<SecretBack caption="SECRET ROLE" />}
        revealed={flipped && seat.revealedRole !== null}
        width={88}
        height={123}
        radius={5}
      />
      <figcaption>
        {seat.name}
        {!seat.alive && <small> · executed</small>}
      </figcaption>
    </figure>
  );
}

function GameOverPanel({ ctx }: { ctx: Ctx }) {
  const { view, exitGame } = ctx;
  const winner = view.winnerTeam ?? 'liberal';
  const stamped = useLater(450);
  return (
    <Memo
      kicker="Case closed"
      title={winner === 'liberal' ? 'The Liberals prevail' : 'The Fascists prevail'}
      tone={winner === 'liberal' ? 'lib' : 'fas'}
    >
      <div className={cls(styles.finaleBanner, winner === 'liberal' ? styles.libWin : styles.fasWin)}>
        <svg viewBox="0 0 100 100" className={styles.finaleEmblem} aria-hidden="true">
          {winner === 'liberal' ? (
            <DoveGlyph color={PALETTE.cream} accent="#a9c27a" />
          ) : (
            <SerpentGlyph color={PALETTE.cream} accent={PALETTE.fas} />
          )}
        </svg>
        <span>{winner === 'liberal' ? 'Liberals win' : 'Fascists win'}</span>
      </div>
      <div className={styles.stampRow}>{stamped && <Stamp tone="ink">{winReasonShort(view)}</Stamp>}</div>
      <p className={cls(styles.memoText, styles.center)}>{winReasonText(view)}</p>
      <div className={styles.revealGrid}>
        {view.seats.map((s, i) => (
          <RevealRole key={s.index} seat={s} index={i} />
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.stampBtn} onClick={exitGame}>
          Close the case
        </button>
      </div>
    </Memo>
  );
}

// ============================================================================
// Minutes (public log) and event stamps
// ============================================================================

function formatLog(view: ShPublicState, e: ShLogEntry): string {
  const n = (s: number) => nameOf(view, s);
  switch (e.kind) {
    case 'roleReveal':
      return 'Dossiers distributed.';
    case 'electionResult': {
      const ja = e.votes.flatMap((v, i) => (v === 'ja' ? [n(i)] : []));
      const nein = e.votes.flatMap((v, i) => (v === 'nein' ? [n(i)] : []));
      return `Election ${e.approved ? 'passed' : 'failed'} — President ${n(e.president)}, Chancellor ${n(e.chancellor)} (Ja ${e.jaCount} · Nein ${e.neinCount}). Ja: ${ja.join(', ') || '—'}. Nein: ${nein.join(', ') || '—'}.`;
    }
    case 'policyEnacted':
      return `${policyLabel(e.policy)} policy enacted by President ${n(e.president)} and Chancellor ${n(e.chancellor)}.`;
    case 'topDeckEnacted':
      return `Chaos: the top policy — ${policyLabel(e.policy)} — was enacted.`;
    case 'vetoDenied':
      return `President ${n(e.president)} refused Chancellor ${n(e.chancellor)}’s veto.`;
    case 'vetoUsed':
      return `Veto: President ${n(e.president)} and Chancellor ${n(e.chancellor)} discarded the agenda.`;
    case 'execution':
      return `President ${n(e.by)} executed ${n(e.target)}.`;
    case 'investigation':
      return `President ${n(e.by)} investigated ${n(e.target)}’s loyalty.`;
    case 'specialElection':
      return `President ${n(e.by)} called a special election: ${n(e.nextPresident)} is the next candidate.`;
    case 'peek':
      return `President ${n(e.by)} examined the top three policies.`;
    case 'gameOver':
      return `${e.winner === 'liberal' ? 'Liberals' : 'Fascists'} win.`;
  }
}

function Minutes({ view }: { view: ShPublicState }) {
  const entries = view.log
    .map((e, i) => ({ e, i }))
    .filter((x) => x.e.kind !== 'roleReveal')
    .slice(-14)
    .reverse();
  return (
    <section className={styles.minutes} aria-label="Minutes of the assembly">
      <h2 className={styles.minutesTitle}>Minutes of the assembly</h2>
      {entries.length === 0 ? (
        <p className={styles.minutesEmpty}>No business has been recorded yet.</p>
      ) : (
        <ol className={styles.minutesList}>
          {entries.map(({ e, i }) => (
            <li key={i} className={styles.minute}>
              <span className={styles.minuteNo}>{String(i + 1).padStart(3, '0')}</span>
              {formatLog(view, e)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface Toast {
  id: number;
  text: string;
  caption: string;
  tone: 'good' | 'bad' | 'ink';
}

function toastFor(view: ShPublicState, e: ShLogEntry): Omit<Toast, 'id'> | null {
  const n = (s: number) => nameOf(view, s);
  switch (e.kind) {
    case 'vetoUsed':
      return { text: 'Veto', caption: `${n(e.president)} & ${n(e.chancellor)} discard the agenda`, tone: 'bad' };
    case 'vetoDenied':
      return { text: 'Veto refused', caption: `${n(e.chancellor)} must enact`, tone: 'ink' };
    case 'execution':
      return { text: 'Executed', caption: `${n(e.target)}, by order of ${n(e.by)}`, tone: 'bad' };
    case 'topDeckEnacted':
      return { text: 'Chaos', caption: 'Three failed governments', tone: 'bad' };
    case 'specialElection':
      return { text: 'Special election', caption: `${n(e.nextPresident)} is the next candidate`, tone: 'ink' };
    case 'investigation':
      return { text: 'Investigated', caption: `${n(e.by)} examines ${n(e.target)}`, tone: 'ink' };
    default:
      return null;
  }
}

function useEventToast(view: ShPublicState): Toast | null {
  const seen = useRef(view.log.length);
  const [toast, setToast] = useState<Toast | null>(null);
  const logLength = view.log.length;
  useEffect(() => {
    const prev = seen.current;
    seen.current = logLength;
    if (logLength <= prev) return;
    const fresh = view.log.slice(prev);
    for (let k = fresh.length - 1; k >= 0; k--) {
      const t = toastFor(view, fresh[k]!);
      if (t) {
        setToast({ ...t, id: logLength });
        return;
      }
    }
    // Only a new log entry triggers a stamp; `view` is read for names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logLength]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  return toast;
}

function EventStamp({ toast }: { toast: Toast }) {
  return (
    <div className={styles.toast} role="status">
      <Stamp tone={toast.tone}>{toast.text}</Stamp>
      <span className={styles.toastCaption}>{toast.caption}</span>
    </div>
  );
}

export { SecretHitlerGameView as default };
