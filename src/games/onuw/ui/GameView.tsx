import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { SeatIndex } from '@/engine/types';
import { useGameStore, useSeatSwitching } from '@/store/gameStore';
import { FlipCard } from '@/ui/shared/FlipCard';
import { useSvgIds } from '@/ui/shared/svg';
import type { OnuwAction } from '../actions';
import { ROLES, rolesSortedByWakeOrder, wakesAtNight } from '../roles';
import type {
  OnuwNightObservation,
  OnuwPublicSeatState,
  OnuwPublicState,
  OnuwRoleId,
  OnuwTeamId,
  OnuwYourNightStep,
} from '../state';
import { CardBack, RoleCard, RoleMedallion, TeamBadge, teamLabel } from './RoleArt';
import { Sky, type SkyMode } from './Sky';
import styles from './GameView.module.css';

// ============================================================================
// ONUW game screen.
//
// Hidden-info rules for this UI:
//  - Only render what the current view contains; the DOM is inspectable.
//  - Online (or one human vs AI) each device shows its own seat.
//  - Pass-and-play (several humans, one device): the shared screen always
//    renders the SPECTATOR view (localSeat = null). A player's private
//    screen opens only after they tap "I am …" on a curtain, and closing it
//    drops back to the spectator view before the device is handed on.
//  - At night, pass-and-play hands the device around the table in seat
//    order regardless of who is awake, so the hand-offs reveal nothing.
// ============================================================================

type Dispatch = (a: OnuwAction) => void;

export function OnuwGameView() {
  const publicView = useGameStore((s) => s.publicView);
  if (!publicView) return null;
  return <Game view={publicView.view as OnuwPublicState} />;
}

function Game({ view }: { view: OnuwPublicState }) {
  const dispatch = useGameStore((s) => s.dispatch) as Dispatch;
  const exitGame = useGameStore((s) => s.exitGame);
  const isHost = useGameStore((s) => s.isHost);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const switching = useSeatSwitching();

  const humanSeats = view.seats.map((s) => s.index).filter((i) => switching.canView(i));
  const passAndPlay = switching.enabled && humanSeats.length > 1;

  // Pass-and-play state: whose private screen is open, and where the night
  // hand-off has got to.
  const [holder, setHolder] = useState<SeatIndex | null>(null);
  const [curtainFor, setCurtainFor] = useState<SeatIndex | null>(null);
  const [nightCursor, setNightCursor] = useState(0);
  // When the day began (so the discussion timer survives remounts, e.g. a
  // pass-and-play player checking their notes).
  const [dayStartedAt, setDayStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (view.phase === 'day') setDayStartedAt((t) => t ?? Date.now());
    else setDayStartedAt(null);
  }, [view.phase]);

  // The shared screen in pass-and-play always shows the spectator view.
  useEffect(() => {
    if (passAndPlay && holder === null && view.yourSeat !== null) setLocalSeat(null);
  }, [passAndPlay, holder, view.yourSeat, setLocalSeat]);

  const open = (seat: SeatIndex) => {
    setCurtainFor(null);
    setLocalSeat(seat);
    setHolder(seat);
  };
  const close = () => {
    setHolder(null);
    setLocalSeat(null);
  };

  const skyMode: SkyMode = view.phase === 'setup' ? 'dusk' : view.phase === 'night' ? 'night' : 'dawn';
  const nameOf = (i: SeatIndex) => view.seats[i]?.name ?? `Seat ${i + 1}`;

  let body: ReactNode;
  if (passAndPlay) {
    if (holder !== null) {
      body =
        view.yourSeat !== holder ? (
          <div className={styles.panel}>Turning the card over…</div>
        ) : (
          <PrivateScreen
            view={view}
            dispatch={dispatch}
            onClose={close}
            onNightDone={() => {
              close();
              setNightCursor((c) => (c + 1) % humanSeats.length);
            }}
          />
        );
    } else if (curtainFor !== null) {
      body = (
        <Curtain
          title="A private moment"
          name={nameOf(curtainFor)}
          hint="Everyone else, look away while they check their card and notes."
          onReady={() => open(curtainFor)}
          onCancel={() => setCurtainFor(null)}
        />
      );
    } else {
      body = (
        <SharedScreen
          view={view}
          dispatch={dispatch}
          isHost={isHost}
          humanSeats={humanSeats}
          nightSeat={humanSeats[nightCursor % humanSeats.length] ?? null}
          dayStartedAt={dayStartedAt}
          onOpen={open}
          onPeek={setCurtainFor}
        />
      );
    }
  } else {
    body = <PersonalScreen view={view} dispatch={dispatch} isHost={isHost} dayStartedAt={dayStartedAt} />;
  }

  return (
    <div className={`${styles.root} ${styles[`phase_${view.phase}`] ?? ''}`}>
      <Sky mode={skyMode} />
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>One Night</h2>
          <p className={styles.subtitle}>
            {phaseLabel(view.phase)} · {view.seats.length} players · 3 center cards
          </p>
        </div>
        <button className={styles.ghost} onClick={exitGame}>
          Exit
        </button>
      </header>
      <main className={styles.main}>{body}</main>
    </div>
  );
}

function phaseLabel(p: OnuwPublicState['phase']): string {
  switch (p) {
    case 'setup':
      return 'The cards are dealt';
    case 'night':
      return 'Night falls';
    case 'day':
      return 'Daybreak';
    case 'voting':
      return 'The vote';
    case 'resolution':
    case 'gameOver':
      return 'The reckoning';
  }
}

// ============================================================================
// Screens
// ============================================================================

// Pass-and-play: the holder's private turn.
function PrivateScreen({
  view,
  dispatch,
  onClose,
  onNightDone,
}: {
  view: OnuwPublicState;
  dispatch: Dispatch;
  onClose: () => void;
  onNightDone: () => void;
}) {
  const me = view.yourSeat!;
  const mine = view.seats[me]!;
  switch (view.phase) {
    case 'setup':
      return (
        <RoleReveal
          view={view}
          onAck={() => {
            dispatch({ type: 'ackRoleReveal', bySeat: me });
            onClose();
          }}
        />
      );
    case 'night':
      return <NightScreen view={view} dispatch={dispatch} handoff onDone={onNightDone} />;
    case 'voting':
      if (!mine.hasVoted) {
        return (
          <Ballot
            view={view}
            onCast={(t) => {
              dispatch({ type: 'castVote', bySeat: me, targetSeat: t });
              onClose();
            }}
          />
        );
      }
      return <NotesScreen view={view} onDone={onClose} />;
    default:
      // Day peek — or a night turn that just ended at dawn: keep showing the
      // player's own result until they close it.
      return <NotesScreen view={view} onDone={onClose} />;
  }
}

// Pass-and-play: the screen everyone at the table can see (spectator view).
function SharedScreen({
  view,
  dispatch,
  isHost,
  humanSeats,
  nightSeat,
  dayStartedAt,
  onOpen,
  onPeek,
}: {
  view: OnuwPublicState;
  dispatch: Dispatch;
  isHost: boolean;
  humanSeats: SeatIndex[];
  nightSeat: SeatIndex | null;
  dayStartedAt: number | null;
  onOpen: (seat: SeatIndex) => void;
  onPeek: (seat: SeatIndex) => void;
}) {
  const nameOf = (i: SeatIndex) => view.seats[i]!.name;
  switch (view.phase) {
    case 'setup': {
      const next = humanSeats.find((i) => !view.seats[i]!.hasAckedSetup);
      return (
        <div className={styles.stack}>
          <Table view={view} mode="deal" />
          {next !== undefined ? (
            <PassPanel
              title="Look at your card"
              name={nameOf(next)}
              hint="Everyone else, look away."
              onReady={() => onOpen(next)}
            />
          ) : (
            <div className={styles.panel}>Waiting for the others to look at their cards…</div>
          )}
        </div>
      );
    }
    case 'night':
      return nightSeat === null ? (
        <SleepingVillage />
      ) : (
        <Curtain
          title="Night"
          name={nameOf(nightSeat)}
          hint="The device goes round the table all night — everyone takes a turn, awake or not. Everyone else, eyes closed."
          onReady={() => onOpen(nightSeat)}
        />
      );
    case 'day':
      return (
        <DayScreen view={view} dispatch={dispatch} isHost={isHost} startedAt={dayStartedAt} peekSeats={humanSeats} onPeek={onPeek} />
      );
    case 'voting': {
      const next = humanSeats.find((i) => !view.seats[i]!.hasVoted);
      if (next !== undefined) {
        return (
          <Curtain
            title="Secret ballot"
            name={nameOf(next)}
            hint="Votes are revealed all at once. Everyone else, look away."
            onReady={() => onOpen(next)}
          />
        );
      }
      return <VotingStatus view={view} dispatch={dispatch} isHost={isHost} />;
    }
    case 'resolution':
    case 'gameOver':
      return <Resolution view={view} dispatch={dispatch} isHost={isHost} />;
  }
}

// Online, or a single human against AIs: this device shows its own seat.
function PersonalScreen({
  view,
  dispatch,
  isHost,
  dayStartedAt,
}: {
  view: OnuwPublicState;
  dispatch: Dispatch;
  isHost: boolean;
  dayStartedAt: number | null;
}) {
  const me = view.yourSeat;
  const mine = me !== null ? view.seats[me] ?? null : null;
  switch (view.phase) {
    case 'setup':
      if (mine && !mine.hasAckedSetup) {
        return <RoleReveal view={view} onAck={() => dispatch({ type: 'ackRoleReveal', bySeat: mine.index })} />;
      }
      return (
        <div className={styles.stack}>
          <Table view={view} mode="deal" />
          <div className={styles.panel}>
            {mine ? 'Your card is face-down again. ' : ''}Waiting for everyone to look at their cards (
            {view.seats.filter((s) => s.hasAckedSetup).length}/{view.seats.length})…
          </div>
        </div>
      );
    case 'night':
      return mine ? <NightScreen view={view} dispatch={dispatch} /> : <SleepingVillage />;
    case 'day':
      return <DayScreen view={view} dispatch={dispatch} isHost={isHost} startedAt={dayStartedAt} showNotes={!!mine} />;
    case 'voting':
      if (mine && !mine.hasVoted) {
        return <Ballot view={view} onCast={(t) => dispatch({ type: 'castVote', bySeat: mine.index, targetSeat: t })} />;
      }
      return <VotingStatus view={view} dispatch={dispatch} isHost={isHost} />;
    case 'resolution':
    case 'gameOver':
      return <Resolution view={view} dispatch={dispatch} isHost={isHost} />;
  }
}

// ============================================================================
// Curtain / hand-off
// ============================================================================

function Curtain({
  title,
  name,
  hint,
  onReady,
  onCancel,
}: {
  title: string;
  name: string;
  hint: string;
  onReady: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className={styles.curtain} role="dialog" aria-modal="true" aria-label={`${title}: pass to ${name}`}>
      <div className={styles.lidTop} />
      <div className={styles.lidBottom} />
      <div className={styles.curtainInner}>
        <MoonGlyph />
        <p className={styles.eyebrow}>{title}</p>
        <h2 className={styles.curtainName}>Pass the device to {name}</h2>
        <p className={styles.dim}>{hint}</p>
        <button className={styles.primary} onClick={onReady} autoFocus>
          I am {name}
        </button>
        {onCancel && (
          <button className={styles.ghost} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function PassPanel({ title, name, hint, onReady }: { title: string; name: string; hint: string; onReady: () => void }) {
  return (
    <div className={`${styles.panel} ${styles.passPanel} sd-rise-in`}>
      <p className={styles.eyebrow}>{title}</p>
      <h3 className={styles.folkHeading}>Pass the device to {name}</h3>
      <p className={styles.dim}>{hint}</p>
      <button className={styles.primary} onClick={onReady}>
        I am {name} — show my card
      </button>
    </div>
  );
}

function MoonGlyph() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className={styles.moonGlyph}>
      <circle cx="32" cy="32" r="22" fill="#f3e8c4" />
      <circle cx="41" cy="26" r="19" fill="#0b1229" />
      <circle cx="14" cy="12" r="1.2" fill="#f3e8c4" />
      <circle cx="52" cy="50" r="1" fill="#f3e8c4" />
    </svg>
  );
}

function SleepingVillage() {
  return (
    <div className={`${styles.panel} ${styles.sleeping}`}>
      <div className={styles.zzz} aria-hidden>
        <span>z</span>
        <span>z</span>
        <span>z</span>
      </div>
      <h3 className={styles.folkHeading}>The village sleeps</h3>
      <p className={styles.dim}>Somewhere in the dark, something stirs. Daybreak will come soon.</p>
    </div>
  );
}

// ============================================================================
// Role reveal (setup)
// ============================================================================

function RoleReveal({ view, onAck }: { view: OnuwPublicState; onAck: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const role = view.yourDealtRole;
  const me = view.yourSeat!;
  const spec = role ? ROLES[role] : null;
  return (
    <div className={`${styles.panel} ${styles.reveal}`}>
      <p className={styles.eyebrow}>{view.seats[me]!.name}, this card is yours</p>
      <FlipCard
        width={200}
        height={279}
        radius={8}
        dealDelayMs={0}
        revealed={flipped && !!role}
        back={<CardBack size={200} />}
        front={role ? <RoleCard role={role} size={200} /> : <CardBack size={200} />}
        className={styles.bigCard}
      />
      {!flipped || !spec ? (
        <button className={styles.primary} onClick={() => setFlipped(true)}>
          Turn over your card
        </button>
      ) : (
        <div className={`${styles.revealText} sd-rise-in`}>
          <h2 className={styles.roleName}>The {spec.name}</h2>
          <p>
            <TeamBadge role={role!} /> <span className={styles.dim}>{teamLabel(spec.team)}</span>
          </p>
          <p className={styles.description}>{spec.description}</p>
          <p className={styles.dim}>Remember it — during the night your card may be swapped without you knowing.</p>
          <button className={styles.primary} onClick={onAck}>
            I&apos;ll remember — turn it face-down
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Night
// ============================================================================

function NightScreen({
  view,
  dispatch,
  handoff = false,
  onDone,
}: {
  view: OnuwPublicState;
  dispatch: Dispatch;
  handoff?: boolean;
  onDone?: () => void;
}) {
  const me = view.yourSeat!;
  const step = view.phase === 'night' ? view.yourNightStep : null;
  const obs = view.yourObservations;
  // Notes the player has already seen on this screen; anything newer is
  // shown as "what you learned".
  const [seen, setSeen] = useState(() => obs.length);
  const [acted, setActed] = useState(false);
  const act = (a: OnuwAction) => {
    setActed(true);
    dispatch(a);
  };

  if (step) {
    return (
      <div className={`${styles.panel} ${styles.wake} sd-your-turn`} style={{ '--sd-glow': '#9fb8ff' } as CSSProperties}>
        <WakeHeader view={view} step={step} />
        <NightControls view={view} step={step} me={me} act={act} />
        {obs.length > 0 && <NotesList title="What you know" observations={obs} highlightFrom={Math.min(seen, obs.length - 1)} />}
      </div>
    );
  }

  const fresh = obs.slice(seen);
  const finish = () => {
    setSeen(obs.length);
    setActed(false);
    onDone?.();
  };

  if (acted || fresh.length > 0) {
    return (
      <div className={`${styles.panel} ${styles.learned}`}>
        <p className={styles.eyebrow}>{fresh.length > 0 ? 'What you learned' : 'It is done'}</p>
        {fresh.map((o, i) => (
          <ObservationReveal key={seen + i} observation={o} delay={i * 260} />
        ))}
        <button className={styles.primary} onClick={finish}>
          {handoff ? 'Close my eyes — pass the device on' : 'Close my eyes'}
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.panel} ${styles.sleeping}`}>
      <div className={styles.zzz} aria-hidden>
        <span>z</span>
        <span>z</span>
        <span>z</span>
      </div>
      <h3 className={styles.folkHeading}>{handoff ? 'Nothing stirs for you right now' : 'You are asleep'}</h3>
      <p className={styles.dim}>
        {handoff
          ? 'Keep your eyes closed. The device will come round again.'
          : "You'll be woken when it is your turn."}
      </p>
      <YourCardLine view={view} />
      {obs.length > 0 && <NotesList title="What you know" observations={obs} />}
      {handoff && (
        <button className={styles.primary} onClick={finish}>
          Pass the device on
        </button>
      )}
    </div>
  );
}

function WakeHeader({ view, step }: { view: OnuwPublicState; step: OnuwYourNightStep }) {
  const spec = ROLES[step.role];
  return (
    <div className={styles.wakeHeader}>
      <FlipCard
        width={112}
        height={156}
        revealed
        dealDelayMs={0}
        back={<CardBack size={112} />}
        front={<RoleCard role={step.role} size={112} subtitle={step.asDoppelganger ? 'DOPPELGANGER' : undefined} />}
      />
      <div>
        <p className={styles.eyebrow}>Open your eyes</p>
        <h2 className={styles.roleName}>
          {step.asDoppelganger ? `Doppelganger — the ${spec.name}` : `The ${spec.name}`}
        </h2>
        <p className={styles.description}>{spec.description}</p>
        {view.yourDealtRole && view.yourDealtRole !== step.role && !step.asDoppelganger && (
          <p className={styles.dim}>You were dealt the {ROLES[view.yourDealtRole].name}.</p>
        )}
      </div>
    </div>
  );
}

function NightControls({
  view,
  step,
  me,
  act,
}: {
  view: OnuwPublicState;
  step: OnuwYourNightStep;
  me: SeatIndex;
  act: Dispatch;
}) {
  const others = view.seats.filter((s) => s.index !== me);
  const knownWolves = new Set<SeatIndex>();
  for (const o of view.yourObservations) {
    for (const e of o.entries) if (e.shownAs === 'werewolf' && e.position?.kind === 'seat') knownWolves.add(e.position.index);
  }
  const last = view.yourObservations.at(-1) ?? null;
  const pass = (label: string) =>
    step.canPass ? (
      <button className={styles.muted} onClick={() => act({ type: 'nightAck', bySeat: me })}>
        {label}
      </button>
    ) : null;

  switch (step.role) {
    case 'doppelganger':
      return <SeatChoice label="Look at whose card — and become it?" seats={others} onPick={(t) => act({ type: 'doppelgangerCopy', bySeat: me, targetSeat: t })} />;

    case 'werewolf':
      return (
        <div className={styles.controls}>
          {last && <Callout text={last.text} />}
          {step.loneWolf ? (
            <>
              <CenterChoice label="You may look at one center card" onPick={(c) => act({ type: 'loneWolfPeekCenter', bySeat: me, centerIndex: c })} />
              <div className={styles.actions}>
                <button className={styles.muted} onClick={() => act({ type: 'loneWolfSkip', bySeat: me })}>
                  Don&apos;t look
                </button>
              </div>
            </>
          ) : (
            <div className={styles.actions}>{pass('We have seen each other — close my eyes')}</div>
          )}
        </div>
      );

    case 'alphaWolf': {
      const targets = others.filter((s) => !knownWolves.has(s.index));
      return (
        <div className={styles.controls}>
          <SeatChoice label="Give the center werewolf card to a non-werewolf" seats={targets} onPick={(t) => act({ type: 'alphaWolfConvert', bySeat: me, targetSeat: t })} />
          <div className={styles.actions}>{pass('There is no one to convert')}</div>
        </div>
      );
    }
    case 'mysticWolf':
      return (
        <div className={styles.controls}>
          <SeatChoice label="You may look at another player's card" seats={others} onPick={(t) => act({ type: 'mysticWolfLook', bySeat: me, targetSeat: t })} />
          <div className={styles.actions}>{pass("Don't look")}</div>
        </div>
      );

    case 'seer':
      return <SeerControls me={me} others={others} act={act} />;
    case 'apprenticeSeer':
      return (
        <div className={styles.controls}>
          <CenterChoice label="You may look at one center card" onPick={(c) => act({ type: 'apprenticeSeerLook', bySeat: me, centerIndex: c })} />
          <div className={styles.actions}>{pass("Don't look")}</div>
        </div>
      );
    case 'paranormalInvestigator': {
      const left = others.filter((s) => !step.looked.includes(s.index));
      return (
        <div className={styles.controls}>
          {step.looked.length > 0 && last && <Callout text={last.text} />}
          <SeatChoice
            label={step.looked.length === 0 ? 'You may look at up to two players, one at a time' : 'Look at one more player?'}
            seats={left}
            onPick={(t) => act({ type: 'paranormalLook', bySeat: me, targetSeat: t })}
          />
          <div className={styles.actions}>
            <button className={styles.muted} onClick={() => act({ type: 'paranormalStop', bySeat: me })}>
              {step.looked.length === 0 ? "Don't investigate" : 'Stop here'}
            </button>
          </div>
        </div>
      );
    }
    case 'robber':
      return (
        <div className={styles.controls}>
          <SeatChoice label="Swap your card with whose — and look at it?" seats={others} onPick={(t) => act({ type: 'robberSwap', bySeat: me, targetSeat: t })} />
          <div className={styles.actions}>
            <button className={styles.muted} onClick={() => act({ type: 'robberSkip', bySeat: me })}>
              Rob no one
            </button>
          </div>
        </div>
      );
    case 'witch':
      if (step.centerPeeked === null) {
        return (
          <div className={styles.controls}>
            <CenterChoice label="You may look at one center card" onPick={(c) => act({ type: 'witchLook', bySeat: me, centerIndex: c })} />
            <div className={styles.actions}>
              <button className={styles.muted} onClick={() => act({ type: 'witchSkip', bySeat: me })}>
                Leave the cauldron be
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className={styles.controls}>
          {last && <ObservationReveal observation={last} />}
          <SeatChoice
            label={`Now give Center ${step.centerPeeked + 1} to a player (you may choose yourself)`}
            seats={view.seats}
            me={me}
            onPick={(t) => act({ type: 'witchSwap', bySeat: me, centerIndex: step.centerPeeked!, targetSeat: t })}
          />
        </div>
      );
    case 'troublemaker':
      return <PairChoice label="Swap the cards of two other players" seats={others} confirm="Swap them" onConfirm={(a, b) => act({ type: 'troublemakerSwap', bySeat: me, a, b })} extra={pass('Make no trouble')} />;
    case 'villageIdiot':
      return (
        <div className={styles.controls}>
          <p className={styles.prompt}>Move everyone else&apos;s card one seat…</p>
          <div className={styles.actions}>
            <button className={styles.primary} onClick={() => act({ type: 'villageIdiotShift', bySeat: me, direction: 'left' })}>
              ← To the left
            </button>
            <button className={styles.primary} onClick={() => act({ type: 'villageIdiotShift', bySeat: me, direction: 'right' })}>
              To the right →
            </button>
            <button className={styles.muted} onClick={() => act({ type: 'villageIdiotSkip', bySeat: me })}>
              Leave them
            </button>
          </div>
        </div>
      );
    case 'drunk':
      return <CenterChoice label="Swap your card with a center card (you won't see it)" onPick={(c) => act({ type: 'drunkSwap', bySeat: me, centerIndex: c })} />;
    case 'revealer':
      return (
        <div className={styles.controls}>
          <SeatChoice label="You may flip another player's card face-up" seats={others} onPick={(t) => act({ type: 'revealerFlip', bySeat: me, targetSeat: t })} />
          <div className={styles.actions}>
            <button className={styles.muted} onClick={() => act({ type: 'revealerSkip', bySeat: me })}>
              Reveal nothing
            </button>
          </div>
        </div>
      );
    case 'curator':
      return (
        <div className={styles.controls}>
          <SeatChoice label="Place an artifact on whose card?" seats={others} onPick={(t) => act({ type: 'curatorGive', bySeat: me, targetSeat: t })} />
          <div className={styles.actions}>{pass('Keep the relics locked away')}</div>
        </div>
      );
    case 'thing': {
      const n = view.seats.length;
      const leftSeat = view.seats[(me - 1 + n) % n]!;
      const rightSeat = view.seats[(me + 1) % n]!;
      return (
        <div className={styles.controls}>
          <p className={styles.prompt}>Tap one of your neighbours on the shoulder</p>
          <div className={styles.actions}>
            <button className={styles.primary} onClick={() => act({ type: 'thingTap', bySeat: me, targetSeat: leftSeat.index })}>
              ← Tap {leftSeat.name}
            </button>
            <button className={styles.primary} onClick={() => act({ type: 'thingTap', bySeat: me, targetSeat: rightSeat.index })}>
              Tap {rightSeat.name} →
            </button>
          </div>
        </div>
      );
    }
    case 'bodySnatcher':
      return (
        <div className={styles.controls}>
          <SeatChoice label="Take whose body (swap and look)?" seats={others} onPick={(t) => act({ type: 'bodySnatcherSwap', bySeat: me, targetSeat: t })} />
          <div className={styles.actions}>{pass('Stay in your own skin')}</div>
        </div>
      );
    case 'windyWendy':
      return <WindyControls view={view} me={me} others={others} act={act} pass={pass('Let the air be still')} />;
    case 'defenderEr':
      return (
        <div className={styles.controls}>
          <SeatChoice label="Watch over whom?" seats={view.seats} me={me} onPick={(t) => act({ type: 'defenderProtect', bySeat: me, targetSeat: t })} />
          <div className={styles.actions}>{pass('Watch over no one')}</div>
        </div>
      );
    default:
      // Observation-only wake-ups (Minion, Mason, Insomniac, Squire, …).
      return (
        <div className={styles.controls}>
          {last && <ObservationReveal observation={last} />}
          <div className={styles.actions}>{pass('I have seen — close my eyes')}</div>
        </div>
      );
  }
}

function SeerControls({ me, others, act }: { me: SeatIndex; others: OnuwPublicSeatState[]; act: Dispatch }) {
  const [mode, setMode] = useState<'seat' | 'center'>('seat');
  const [picks, setPicks] = useState<number[]>([]);
  return (
    <div className={styles.controls}>
      <div className={styles.tabs} role="tablist">
        <button role="tab" aria-selected={mode === 'seat'} className={mode === 'seat' ? styles.tabOn : styles.tab} onClick={() => setMode('seat')}>
          One player&apos;s card
        </button>
        <button role="tab" aria-selected={mode === 'center'} className={mode === 'center' ? styles.tabOn : styles.tab} onClick={() => setMode('center')}>
          Two center cards
        </button>
      </div>
      {mode === 'seat' ? (
        <SeatChoice label="Look at whose card?" seats={others} onPick={(t) => act({ type: 'seerLookSeat', bySeat: me, targetSeat: t })} />
      ) : (
        <>
          <CenterChoice
            label="Pick two center cards"
            selected={picks}
            onPick={(c) => setPicks((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : cur.length < 2 ? [...cur, c] : [cur[1]!, c]))}
          />
          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={picks.length !== 2}
              onClick={() => act({ type: 'seerLookCenter', bySeat: me, centerIndices: [picks[0]!, picks[1]!] })}
            >
              Look ({picks.length}/2)
            </button>
          </div>
        </>
      )}
      <div className={styles.actions}>
        <button className={styles.muted} onClick={() => act({ type: 'nightAck', bySeat: me })}>
          Look at nothing
        </button>
      </div>
    </div>
  );
}

function WindyControls({ view, me, others, act, pass }: { view: OnuwPublicState; me: SeatIndex; others: OnuwPublicSeatState[]; act: Dispatch; pass: ReactNode }) {
  const [source, setSource] = useState<SeatIndex | null>(null);
  if (source === null) {
    return (
      <div className={styles.controls}>
        <SeatChoice label="Blow whose card along?" seats={others} onPick={setSource} />
        <div className={styles.actions}>{pass}</div>
      </div>
    );
  }
  return (
    <div className={styles.controls}>
      <p className={styles.prompt}>Blow {view.seats[source]!.name}&apos;s card…</p>
      <div className={styles.actions}>
        <button className={styles.primary} onClick={() => act({ type: 'windyWendyShift', bySeat: me, sourceSeat: source, direction: 'left' })}>
          ← Left
        </button>
        <button className={styles.primary} onClick={() => act({ type: 'windyWendyShift', bySeat: me, sourceSeat: source, direction: 'right' })}>
          Right →
        </button>
        <button className={styles.muted} onClick={() => setSource(null)}>
          Back
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Pickers
// ============================================================================

function SeatChoice({
  label,
  seats,
  me,
  onPick,
  selected = [],
}: {
  label: string;
  seats: OnuwPublicSeatState[];
  me?: SeatIndex;
  onPick: (seat: SeatIndex) => void;
  selected?: SeatIndex[];
}) {
  return (
    <div className={styles.choice}>
      <p className={styles.prompt}>{label}</p>
      <div className={`${styles.seatGrid} sd-stagger`}>
        {seats.map((s, i) => (
          <button
            key={s.index}
            className={`${styles.seatButton} ${selected.includes(s.index) ? styles.selected : ''}`}
            style={{ '--i': i } as CSSProperties}
            onClick={() => onPick(s.index)}
            aria-pressed={selected.includes(s.index)}
          >
            <Avatar name={s.name} />
            <span className={styles.seatButtonName}>
              {s.name}
              {s.index === me && <small> (you)</small>}
            </span>
          </button>
        ))}
        {seats.length === 0 && <p className={styles.dim}>No one to choose.</p>}
      </div>
    </div>
  );
}

function PairChoice({
  label,
  seats,
  confirm,
  onConfirm,
  extra,
}: {
  label: string;
  seats: OnuwPublicSeatState[];
  confirm: string;
  onConfirm: (a: SeatIndex, b: SeatIndex) => void;
  extra?: ReactNode;
}) {
  const [picks, setPicks] = useState<SeatIndex[]>([]);
  return (
    <div className={styles.controls}>
      <SeatChoice
        label={label}
        seats={seats}
        selected={picks}
        onPick={(s) => setPicks((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : cur.length < 2 ? [...cur, s] : [cur[1]!, s]))}
      />
      <div className={styles.actions}>
        <button className={styles.primary} disabled={picks.length !== 2} onClick={() => onConfirm(picks[0]!, picks[1]!)}>
          {confirm} ({picks.length}/2)
        </button>
        {extra}
      </div>
    </div>
  );
}

function CenterChoice({ label, onPick, selected = [] }: { label: string; onPick: (c: number) => void; selected?: number[] }) {
  return (
    <div className={styles.choice}>
      <p className={styles.prompt}>{label}</p>
      <div className={styles.centerRow}>
        {[0, 1, 2].map((c) => (
          <button
            key={c}
            className={`${styles.cardButton} ${selected.includes(c) ? styles.selected : ''}`}
            onClick={() => onPick(c)}
            aria-pressed={selected.includes(c)}
            aria-label={`Center card ${c + 1}`}
          >
            <CardBack size={76} label={`Center card ${c + 1}`} />
            <span className={styles.cardCaption}>Center {c + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.48 }} aria-hidden>
      {name.trim().slice(0, 1).toUpperCase() || '?'}
    </span>
  );
}

// ============================================================================
// Observations / notes
// ============================================================================

function Callout({ text }: { text: string }) {
  return <div className={`${styles.callout} sd-rise-in`}>{text}</div>;
}

// A night result: the sentence plus any card it revealed, flipped over.
function ObservationReveal({ observation, delay = 0 }: { observation: OnuwNightObservation; delay?: number }) {
  const cards = observation.entries.filter((e) => e.role);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 260 + delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div className={`${styles.observation} sd-rise-in`} style={{ animationDelay: `${delay}ms` }}>
      {cards.length > 0 && (
        <div className={styles.observationCards}>
          {cards.map((e, i) => (
            <figure key={i} className={styles.obsCard}>
              <FlipCard
                width={92}
                height={128}
                revealed={shown}
                back={<CardBack size={92} />}
                front={<RoleCard role={e.role!} size={92} />}
              />
              <figcaption>{e.label}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <p className={styles.observationText}>{observation.text}</p>
    </div>
  );
}

function NotesList({
  title,
  observations,
  highlightFrom,
}: {
  title: string;
  observations: OnuwNightObservation[];
  highlightFrom?: number;
}) {
  return (
    <div className={styles.notes}>
      <p className={styles.eyebrow}>{title}</p>
      <ol className={styles.notesList}>
        {observations.map((o, i) => (
          <li key={i} className={highlightFrom !== undefined && i >= highlightFrom ? styles.noteNew : undefined}>
            {o.entries
              .filter((e) => e.role)
              .map((e, k) => (
                <RoleMedallion key={k} role={e.role!} size={26} className={styles.noteIcon} />
              ))}
            <span>{o.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function YourCardLine({ view }: { view: OnuwPublicState }) {
  if (!view.yourDealtRole) return null;
  return (
    <div className={styles.cardLine}>
      <RoleMedallion role={view.yourDealtRole} size={40} />
      <span>
        You were dealt the <strong>{ROLES[view.yourDealtRole].name}</strong>.
        <br />
        <span className={styles.dim}>Your card may have changed in the night.</span>
      </span>
    </div>
  );
}

function NotesScreen({ view, onDone }: { view: OnuwPublicState; onDone: () => void }) {
  return (
    <div className={`${styles.panel} ${styles.learned}`}>
      <p className={styles.eyebrow}>{view.seats[view.yourSeat!]!.name} — only for your eyes</p>
      <YourCardLine view={view} />
      {view.yourObservations.length > 0 ? (
        <NotesList title="What you know" observations={view.yourObservations} />
      ) : (
        <p className={styles.dim}>You learned nothing in the night.</p>
      )}
      <button className={styles.primary} onClick={onDone}>
        Done — hide my notes
      </button>
    </div>
  );
}

// ============================================================================
// Table (seats around the village square + center cards)
// ============================================================================

type TableMode = 'deal' | 'day' | 'reveal';

function seatPositions(n: number, bottom: number): { x: number; y: number }[] {
  // Ellipse in a 160×100 box; `bottom` sits at the front of the table.
  return Array.from({ length: n }, (_, i) => {
    const k = (i - bottom + n) % n;
    const t = Math.PI / 2 + (k / n) * Math.PI * 2;
    return { x: 80 + Math.cos(t) * 64, y: 50 + Math.sin(t) * 36 };
  });
}

function Table({
  view,
  mode,
  revealSeats = 0,
  revealCenter = 0,
  showVotes = false,
  showDeaths = false,
}: {
  view: OnuwPublicState;
  mode: TableMode;
  revealSeats?: number;
  revealCenter?: number;
  showVotes?: boolean;
  showDeaths?: boolean;
}) {
  const n = view.seats.length;
  const pos = seatPositions(n, view.yourSeat ?? 0);
  const cardW = n > 7 ? 56 : 64;
  const cardH = Math.round((cardW * 88) / 63);
  const order = useMemo(() => {
    // Flip order for the reveal: round the table starting at the front.
    const start = view.yourSeat ?? 0;
    return Array.from({ length: n }, (_, k) => (start + k) % n);
  }, [n, view.yourSeat]);
  return (
    <div className={styles.table}>
      <div className={styles.tableTop} aria-hidden />
      {showVotes && <VoteArrows view={view} pos={pos} />}
      <div className={styles.tableCenter}>
        {view.centerCards.map((c, i) => {
          const face = c.revealedCard ?? null;
          return (
            <FlipCard
              key={c.index}
              width={cardW}
              height={cardH}
              dealDelayMs={mode === 'deal' ? (n + i) * 110 : null}
              revealed={!!face && i < revealCenter}
              back={<CardBack size={cardW} label={`Center card ${i + 1}`} />}
              front={face ? <RoleCard role={face} size={cardW} /> : <CardBack size={cardW} />}
            />
          );
        })}
      </div>
      {view.seats.map((s) => {
        const p = pos[s.index]!;
        const face = mode === 'reveal' ? s.revealedCard : s.flippedCard;
        const isRevealed = !!face && (mode !== 'reveal' || order.indexOf(s.index) < revealSeats);
        const dead = showDeaths && s.killed;
        const role = s.revealedRole;
        return (
          <div
            key={s.index}
            className={`${styles.seat} ${s.index === view.yourSeat ? styles.seatYou : ''} ${dead ? styles.seatDead : ''}`}
            style={{ left: `${(p.x / 160) * 100}%`, top: `${p.y}%` }}
          >
            <div className={styles.seatCard}>
              <FlipCard
                width={cardW}
                height={cardH}
                dealDelayMs={mode === 'deal' ? s.index * 110 : null}
                revealed={isRevealed}
                back={<CardBack size={cardW} label={`${s.name}'s card`} />}
                front={
                  face ? (
                    <RoleCard
                      role={face}
                      size={cardW}
                      subtitle={mode === 'reveal' && role && role !== face ? `AS ${ROLES[role].name.toUpperCase()}` : undefined}
                    />
                  ) : (
                    <CardBack size={cardW} />
                  )
                }
              />
              {dead && <span className={styles.slain}>Slain</span>}
              {showVotes && s.votesReceived > 0 && <span className={styles.tally}>{s.votesReceived}</span>}
            </div>
            <div className={styles.namePlate}>
              <span className={styles.namePlateName}>{s.name}</span>
              <span className={styles.namePlateStatus}>
                {view.phase === 'setup' && (s.hasAckedSetup ? '✓ ready' : '…')}
                {view.phase === 'voting' && (s.hasVoted ? '✓ voted' : '…')}
                {mode !== 'reveal' && s.flippedCard && 'face-up'}
                {mode === 'reveal' && s.won && <span className={styles.wonMark}>★ won</span>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VoteArrows({ view, pos }: { view: OnuwPublicState; pos: { x: number; y: number }[] }) {
  const id = useSvgIds();
  const arrows = view.seats
    .filter((s) => s.voteTarget !== null)
    .map((s, k) => {
      const a = pos[s.index]!;
      const b = pos[s.voteTarget!]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const sx = a.x + ux * 9;
      const sy = a.y + uy * 9;
      const ex = b.x - ux * 10;
      const ey = b.y - uy * 10;
      // Bow the arrow so reciprocal votes don't overlap.
      const cx = (sx + ex) / 2 - uy * 8;
      const cy = (sy + ey) / 2 + ux * 8;
      return { key: s.index, d: `M${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`, k };
    });
  return (
    <svg className={styles.arrows} viewBox="0 0 160 100" aria-hidden>
      <defs>
        <marker id={id('head')} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="#e8743b" />
        </marker>
      </defs>
      {arrows.map((a) => (
        <path
          key={a.key}
          d={a.d}
          pathLength={1}
          className={styles.arrow}
          style={{ animationDelay: `${a.k * 220}ms` }}
          markerEnd={id.url('head')}
        />
      ))}
    </svg>
  );
}

// ============================================================================
// Day
// ============================================================================

function DayScreen({
  view,
  dispatch,
  isHost,
  startedAt,
  showNotes = false,
  peekSeats,
  onPeek,
}: {
  view: OnuwPublicState;
  dispatch: Dispatch;
  isHost: boolean;
  startedAt: number | null;
  showNotes?: boolean;
  peekSeats?: SeatIndex[];
  onPeek?: (seat: SeatIndex) => void;
}) {
  const flipped = view.seats.filter((s) => s.flippedCard);
  return (
    <div className={styles.dayGrid}>
      <section className={styles.stack}>
        <Table view={view} mode="day" />
        {flipped.length > 0 && (
          <p className={`${styles.callout} sd-rise-in`}>
            The Revealer left {flipped.map((s) => `${s.name}'s card (the ${ROLES[s.flippedCard!].name})`).join(', ')} face-up.
          </p>
        )}
      </section>
      <aside className={styles.aside}>
        <div className={styles.panel}>
          <h3 className={styles.folkHeading}>Discuss — who is the werewolf?</h3>
          <DayTimer seconds={view.dayDurationSec} startedAt={startedAt} />
          {isHost ? (
            <button className={styles.primary} onClick={() => dispatch({ type: 'startVote' })}>
              Call the vote
            </button>
          ) : (
            <p className={styles.dim}>The host will call the vote.</p>
          )}
        </div>
        {showNotes && (
          <div className={styles.panel}>
            <YourCardLine view={view} />
            {view.yourObservations.length > 0 ? (
              <NotesList title="Your night" observations={view.yourObservations} />
            ) : (
              <p className={styles.dim}>You learned nothing in the night.</p>
            )}
          </div>
        )}
        {peekSeats && onPeek && (
          <div className={styles.panel}>
            <p className={styles.eyebrow}>Forgot what you saw?</p>
            <div className={styles.peekRow}>
              {peekSeats.map((i) => (
                <button key={i} className={styles.muted} onClick={() => onPeek(i)}>
                  {view.seats[i]!.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <Cheatsheet rolePool={view.rolePool} />
      </aside>
    </div>
  );
}

function DayTimer({ seconds, startedAt }: { seconds: number; startedAt: number | null }) {
  const remaining = () =>
    Math.max(0, Math.ceil(seconds - (startedAt === null ? 0 : (Date.now() - startedAt) / 1000)));
  const [left, setLeft] = useState(remaining);
  useEffect(() => {
    setLeft(remaining());
    const t = setInterval(() => setLeft(remaining()), 1000);
    return () => clearInterval(t);
  }, [seconds, startedAt]);
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  const pct = seconds > 0 ? left / seconds : 0;
  return (
    <div className={styles.timer} aria-live="off">
      <div className={styles.timerBar} style={{ transform: `scaleX(${pct})` }} />
      <span className={styles.timerText}>{left > 0 ? `${mm}:${ss}` : "Time's up — vote!"}</span>
    </div>
  );
}

function Cheatsheet({ rolePool }: { rolePool: OnuwRoleId[] }) {
  const counts = useMemo(() => {
    const c: Partial<Record<OnuwRoleId, number>> = {};
    for (const r of rolePool) c[r] = (c[r] ?? 0) + 1;
    return c;
  }, [rolePool]);
  const unique = useMemo(() => rolesSortedByWakeOrder([...new Set(rolePool)]), [rolePool]);
  let step = 0;
  return (
    <details className={styles.cheatsheet} open>
      <summary className={styles.eyebrow}>Cards in play · night order</summary>
      <ol className={styles.cheatList}>
        {unique.map((r) => {
          const wakes = wakesAtNight(r);
          if (wakes) step++;
          return (
            <li key={r} className={styles.cheatRow}>
              <span className={styles.cheatStep}>{wakes ? step : '—'}</span>
              <RoleMedallion role={r} size={34} />
              <span>
                <span className={styles.cheatName}>
                  <TeamBadge role={r} /> {ROLES[r].name}
                  {counts[r]! > 1 && <small> ×{counts[r]}</small>}
                </span>
                <span className={styles.cheatDesc}>{ROLES[r].description}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

// ============================================================================
// Voting
// ============================================================================

function Ballot({ view, onCast }: { view: OnuwPublicState; onCast: (target: SeatIndex) => void }) {
  const [pick, setPick] = useState<SeatIndex | null>(null);
  const me = view.yourSeat!;
  const others = view.seats.filter((s) => s.index !== me);
  return (
    <div className={`${styles.panel} ${styles.ballot}`}>
      <p className={styles.eyebrow}>{view.seats[me]!.name}&apos;s secret ballot</p>
      <h2 className={styles.folkHeading}>Point at the werewolf</h2>
      <SeatChoice label="Who should die?" seats={others} selected={pick === null ? [] : [pick]} onPick={setPick} />
      <div className={styles.actions}>
        <button className={styles.primary} disabled={pick === null} onClick={() => pick !== null && onCast(pick)}>
          {pick === null ? 'Choose a player' : `Vote for ${view.seats[pick]!.name}`}
        </button>
      </div>
      {view.yourObservations.length > 0 && (
        <details className={styles.ballotNotes}>
          <summary>Your notes</summary>
          <NotesList title="What you know" observations={view.yourObservations} />
        </details>
      )}
    </div>
  );
}

function VotingStatus({ view, dispatch, isHost }: { view: OnuwPublicState; dispatch: Dispatch; isHost: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const missing = view.seats.filter((s) => !s.hasVoted);
  return (
    <div className={styles.stack}>
      <Table view={view} mode="day" />
      <div className={styles.panel}>
        <h3 className={styles.folkHeading}>
          {view.yourSeat !== null && view.seats[view.yourSeat]?.hasVoted ? 'Your vote is cast.' : 'The village is voting.'}
        </h3>
        <p className={styles.dim}>
          Waiting for {missing.map((s) => s.name).join(', ') || 'the count'}… All votes are revealed together.
        </p>
        {isHost && missing.length > 0 && (
          <div className={styles.actions}>
            {confirming ? (
              <>
                <button className={styles.danger} onClick={() => dispatch({ type: 'resolveVotes' })}>
                  Count now — {missing.length} abstain
                </button>
                <button className={styles.muted} onClick={() => setConfirming(false)}>
                  Keep waiting
                </button>
              </>
            ) : (
              <button className={styles.muted} onClick={() => setConfirming(true)}>
                Count the votes now…
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Resolution: arrows → deaths → every card flips → verdict
// ============================================================================

function Resolution({ view, dispatch, isHost }: { view: OnuwPublicState; dispatch: Dispatch; isHost: boolean }) {
  const n = view.seats.length;
  const arrowsAt = 1;
  const deathsAt = arrowsAt + Math.ceil((n * 220) / 420) + 2;
  const seatsAt = deathsAt + 2;
  const centerAt = seatsAt + n;
  const verdictAt = centerAt + 4;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick >= verdictAt) return;
    const t = setTimeout(() => setTick((x) => x + 1), 420);
    return () => clearTimeout(t);
  }, [tick, verdictAt]);
  const done = tick >= verdictAt;
  const teams = view.winningTeams;
  return (
    <div className={styles.stack}>
      {done && <Verdict teams={teams} winners={view.winners.map((i) => view.seats[i]!.name)} />}
      <Table
        view={view}
        mode="reveal"
        showVotes={tick >= arrowsAt}
        showDeaths={tick >= deathsAt}
        revealSeats={Math.max(0, tick - seatsAt + 1)}
        revealCenter={Math.max(0, tick - centerAt + 1)}
      />
      {!done && (
        <div className={styles.actions}>
          <button className={styles.muted} onClick={() => setTick(verdictAt)}>
            Skip to the verdict
          </button>
        </div>
      )}
      {done && (
        <div className={`${styles.resultsGrid} sd-rise-in`}>
          <div className={styles.panel}>
            <p className={styles.eyebrow}>How the village voted</p>
            <ul className={styles.voteList}>
              {view.seats.map((s) => (
                <li key={s.index}>
                  <span>{s.name}</span>
                  <span className={styles.dim}>→</span>
                  <span>{s.voteTarget !== null ? view.seats[s.voteTarget]!.name : 'abstained'}</span>
                  {s.killed && <span className={styles.deathMark}>☠ slain</span>}
                </li>
              ))}
            </ul>
            {view.killedSeats.length === 0 && <p className={styles.dim}>No one received more than one vote — no one dies.</p>}
          </div>
          <div className={styles.panel}>
            <p className={styles.eyebrow}>Cards at dawn</p>
            <ul className={styles.finalList}>
              {view.seats.map((s) => (
                <li key={s.index}>
                  {s.revealedRole && <RoleMedallion role={s.revealedRole} size={30} />}
                  <span>
                    <strong>{s.name}</strong> —{' '}
                    {s.revealedCard && s.revealedRole && s.revealedCard !== s.revealedRole
                      ? `${ROLES[s.revealedCard].name} (as ${ROLES[s.revealedRole].name})`
                      : s.revealedRole
                        ? ROLES[s.revealedRole].name
                        : '?'}
                    {s.won && <span className={styles.wonMark}> ★</span>}
                  </span>
                </li>
              ))}
              {view.alphaCenter.length > 0 && (
                <li>
                  <span className={styles.dim}>Alpha&apos;s center slot: {view.alphaCenter.map((r) => ROLES[r].name).join(', ')}</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
      {done && (
        <div className={styles.actions}>
          {view.phase === 'resolution' && isHost && (
            <button className={styles.primary} onClick={() => dispatch({ type: 'ackGameOver' })}>
              End the game
            </button>
          )}
          {view.phase === 'resolution' && !isHost && <p className={styles.dim}>Waiting for the host to end the game…</p>}
        </div>
      )}
    </div>
  );
}

function Verdict({ teams, winners }: { teams: OnuwTeamId[]; winners: string[] }) {
  const names: Record<OnuwTeamId, string> = { village: 'the Village', werewolves: 'the Werewolves', tanner: 'the Tanner' };
  const solo: Record<OnuwTeamId, string> = {
    village: 'The Village prevails',
    werewolves: 'The Werewolves feast',
    tanner: 'The Tanner gets his wish',
  };
  const headline =
    teams.length === 0
      ? 'Nobody wins'
      : teams.length === 1
        ? solo[teams[0]!]
        : `${teams.map((t) => names[t]).join(' & ').replace(/^t/, 'T')} win`;
  const tone = teams[0] ?? 'none';
  return (
    <div className={`${styles.verdict} ${styles[`verdict_${tone}`] ?? ''}`} role="status">
      <div className={styles.verdictBanner}>
        {teams.map((t) => (
          <TeamBadge key={t} team={t} size={26} />
        ))}
        <h2 className={styles.verdictTitle}>{headline}</h2>
      </div>
      {winners.length > 0 && <p className={styles.verdictSub}>Winners: {winners.join(', ')}</p>}
    </div>
  );
}

