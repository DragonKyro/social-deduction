import { useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { OnuwAction } from '../actions';
import { ROLES, rolesSortedByWakeOrder } from '../roles';
import type { OnuwPublicSeatState, OnuwPublicState, OnuwRoleId } from '../state';
import { RoleArt, TeamBadge } from './RoleArt';
import styles from './GameView.module.css';

export function OnuwGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);

  if (!publicView) return null;
  const view = publicView.view as OnuwPublicState;

  const dispatchAction = (a: OnuwAction) => dispatch(a);
  const rotate = (seat: number) => setLocalSeat(seat);

  return (
    <div className={styles.root}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h2 className={styles.title}>One Night Ultimate Werewolf</h2>
          <p className={styles.subtitle}>
            {phaseLabel(view.phase)} · {view.seats.length} players, {view.centerCards.length} center cards
          </p>
        </div>
        <button onClick={exitGame}>Exit</button>
      </header>

      <PhaseRouter view={view} localSeat={localSeat} dispatch={dispatchAction} rotateSeat={rotate} />
    </div>
  );
}

function phaseLabel(p: OnuwPublicState['phase']): string {
  switch (p) {
    case 'setup':
      return 'Hand out roles';
    case 'night':
      return 'Night phase';
    case 'day':
      return 'Day — discussion';
    case 'voting':
      return 'Voting';
    case 'resolution':
    case 'gameOver':
      return 'Resolution';
  }
}

function PhaseRouter({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: OnuwPublicState;
  localSeat: number | null;
  dispatch: (a: OnuwAction) => void;
  rotateSeat: (s: number) => void;
}) {
  switch (view.phase) {
    case 'setup':
      return <SetupPhase view={view} dispatch={dispatch} rotateSeat={rotateSeat} />;
    case 'night':
      return <NightPhase view={view} localSeat={localSeat} dispatch={dispatch} rotateSeat={rotateSeat} />;
    case 'day':
      return <DayPhase view={view} dispatch={dispatch} />;
    case 'voting':
      return <VotingPhase view={view} localSeat={localSeat} dispatch={dispatch} rotateSeat={rotateSeat} />;
    case 'resolution':
    case 'gameOver':
      return <ResolutionPhase view={view} dispatch={dispatch} />;
  }
}

// ============================================================================
// Setup phase: each seat privately views their dealt role.
// ============================================================================

function SetupPhase({
  view,
  dispatch,
  rotateSeat,
}: {
  view: OnuwPublicState;
  dispatch: (a: OnuwAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const next = view.seats.find((s) => !s.hasAckedSetup);
  const [covered, setCovered] = useState(true);

  if (!next) {
    return (
      <div className={styles.panel}>
        <p>Everyone has seen their role. Starting night…</p>
      </div>
    );
  }
  const needsRotate = view.yourSeat !== next.index;

  if (needsRotate || covered) {
    return (
      <div className={styles.coverScreen}>
        <div className={styles.coverInner}>
          <h2>Pass the device</h2>
          <p>It&apos;s {next.name}&apos;s turn to see their role.</p>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>Everyone else, look away.</p>
          <button
            className={styles.primary}
            onClick={() => {
              if (needsRotate) rotateSeat(next.index);
              setCovered(false);
            }}
          >
            I am {next.name} — show me my role
          </button>
        </div>
      </div>
    );
  }

  const role = view.yourDealtRole;
  if (!role) return <div className={styles.panel}>Loading role…</div>;
  const spec = ROLES[role];
  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <RoleArt role={role} size={140} />
      <div>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>You are</p>
        <h2 className={styles.roleName}>{spec.name}</h2>
        <span className={`${styles.teamPill} ${styles[spec.team]}`}>{teamLabel(spec.team)}</span>
      </div>
      <p style={{ maxWidth: 520, lineHeight: 1.5, color: '#cbd5e1' }}>{spec.description}</p>
      <p style={{ color: '#94a3b8', fontSize: 12, maxWidth: 460 }}>
        Remember your role. After night begins, swaps may change it.
      </p>
      <button
        className={styles.primary}
        onClick={() => {
          dispatch({ type: 'ackRoleReveal', bySeat: next.index });
          setCovered(true);
        }}
      >
        I have memorised my role
      </button>
    </div>
  );
}

function teamLabel(t: 'village' | 'werewolves' | 'tanner'): string {
  if (t === 'village') return 'Village';
  if (t === 'werewolves') return 'Werewolves';
  return 'Tanner';
}

// ============================================================================
// Night phase: walk through the role wake order, hot-seat style.
// ============================================================================

function NightPhase({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: OnuwPublicState;
  localSeat: number | null;
  dispatch: (a: OnuwAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const step = view.activeNightStep;
  const [covered, setCovered] = useState(true);

  if (!step) {
    return (
      <div className={styles.panel}>
        <p>Advancing night…</p>
      </div>
    );
  }

  const remainingSeats = step.seats.filter((s) => !step.acked.includes(s));
  const nextSeat = remainingSeats[0];

  if (nextSeat === undefined) {
    return (
      <div className={styles.panel}>
        <p>Resolving step…</p>
      </div>
    );
  }

  const needsRotate = localSeat !== nextSeat;
  const seatInfo = view.seats[nextSeat]!;
  const roleSpec = ROLES[step.role];

  if (needsRotate || covered) {
    return (
      <div className={styles.coverScreen}>
        <div className={styles.coverInner}>
          <h2>Night step</h2>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>
            Step {view.nightStepIndex + 1} of {view.nightTotalSteps}
          </p>
          <div className={styles.nightStepBanner}>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>The {roleSpec.name} wakes</p>
            <h2 style={{ margin: '6px 0' }}>{seatInfo.name}</h2>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
              {step.seats.length > 1
                ? `${step.acked.length}/${step.seats.length} of this role have acted`
                : 'pass the device discreetly'}
            </p>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>Everyone else, look away.</p>
          <button
            className={styles.primary}
            onClick={() => {
              if (needsRotate) rotateSeat(nextSeat);
              setCovered(false);
            }}
          >
            I am {seatInfo.name} — show my night action
          </button>
        </div>
      </div>
    );
  }

  // Local seat IS the one acting. Render the role-specific action UI.
  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <RoleArt role={step.role} size={100} />
      <h2 style={{ margin: 0 }}>{roleSpec.name}</h2>
      <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 540 }}>{roleSpec.description}</p>

      <RoleActionPanel
        view={view}
        actingSeat={nextSeat}
        role={step.role}
        dispatch={(a) => {
          dispatch(a);
          setCovered(true);
        }}
      />
    </div>
  );
}

// ============================================================================
// Role-specific action UI. Each role's interaction is a small embedded panel.
// ============================================================================

function RoleActionPanel({
  view,
  actingSeat,
  role,
  dispatch,
}: {
  view: OnuwPublicState;
  actingSeat: number;
  role: OnuwRoleId;
  dispatch: (a: OnuwAction) => void;
}) {
  const observation = view.yourObservations[view.yourObservations.length - 1] ?? null;

  // Observation-only roles (no action required, just ack).
  const passiveRoles: ReadonlySet<OnuwRoleId> = new Set([
    'mason',
    'minion',
    'insomniac',
    'beholder',
    'squire',
    'empath',
    'auraSeer',
  ]);
  if (passiveRoles.has(role)) {
    return (
      <ObservationAndAck
        observation={observation}
        onAck={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}
      />
    );
  }

  switch (role) {
    case 'doppelganger':
      return <PickSeat view={view} excludeSelf={actingSeat} onPick={(t) => dispatch({ type: 'doppelgangerCopy', bySeat: actingSeat, targetSeat: t })} label="Copy whose role?" observation={observation} ackWith={() => dispatch({ type: 'nightAck', bySeat: actingSeat })} />;
    case 'werewolf': {
      // The werewolf step covers seats with dealtRole === 'werewolf'.
      // Lone-wolf detection: wake observation has zero entries means there
      // are no OTHER awake wolves visible to this seat — eligible to peek
      // a center card.
      const entries = observation?.entries ?? [];
      const isLoneWolf = entries.length === 0;
      return (
        <WerewolfWakePanel
          view={view}
          actingSeat={actingSeat}
          observation={observation}
          isLoneWolf={isLoneWolf}
          dispatch={dispatch}
          role={role}
        />
      );
    }
    case 'mysticWolf':
      // Mystic wolf wakes with werewolves (auto observation) then picks one
      // other player to peek.
      return (
        <MysticWolfPanel view={view} actingSeat={actingSeat} dispatch={dispatch} />
      );
    case 'seer':
      return (
        <SeerPanel
          view={view}
          actingSeat={actingSeat}
          dispatch={dispatch}
          observation={observation}
        />
      );
    case 'apprenticeSeer':
      return (
        <PickCenterCard
          view={view}
          onPick={(i) => dispatch({ type: 'apprenticeSeerLook', bySeat: actingSeat, centerIndex: i })}
          observation={observation}
          ackWith={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}
          label="Peek one center card"
        />
      );
    case 'paranormalInvestigator':
      return (
        <ParanormalPanel
          view={view}
          actingSeat={actingSeat}
          dispatch={dispatch}
          observation={observation}
        />
      );
    case 'robber':
      return (
        <PickSeatWithSkip
          view={view}
          excludeSelf={actingSeat}
          observation={observation}
          ackWith={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}
          onPick={(t) => dispatch({ type: 'robberSwap', bySeat: actingSeat, targetSeat: t })}
          onSkip={() => dispatch({ type: 'robberSkip', bySeat: actingSeat })}
          pickLabel="Steal whose card?"
          skipLabel="Stay as I am"
        />
      );
    case 'witch':
      return (
        <WitchPanel view={view} actingSeat={actingSeat} dispatch={dispatch} observation={observation} />
      );
    case 'troublemaker':
      return (
        <TroublemakerPanel view={view} actingSeat={actingSeat} dispatch={dispatch} observation={observation} />
      );
    case 'villageIdiot':
      return (
        <PickShiftDirection
          observation={observation}
          ackWith={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}
          onLeft={() => dispatch({ type: 'villageIdiotShift', bySeat: actingSeat, direction: 'left' })}
          onRight={() => dispatch({ type: 'villageIdiotShift', bySeat: actingSeat, direction: 'right' })}
          onSkip={() => dispatch({ type: 'villageIdiotSkip', bySeat: actingSeat })}
        />
      );
    case 'drunk':
      return (
        <PickCenterCard
          view={view}
          onPick={(i) => dispatch({ type: 'drunkSwap', bySeat: actingSeat, centerIndex: i })}
          observation={observation}
          ackWith={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}
          label="Swap with which center slot?"
        />
      );
    case 'revealer':
      return (
        <PickSeatWithSkip
          view={view}
          excludeSelf={actingSeat}
          observation={observation}
          ackWith={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}
          onPick={(t) => dispatch({ type: 'revealerFlip', bySeat: actingSeat, targetSeat: t })}
          onSkip={() => dispatch({ type: 'revealerSkip', bySeat: actingSeat })}
          pickLabel="Flip whose card?"
          skipLabel="Skip"
        />
      );
    case 'curator':
      return (
        <PickSeat
          view={view}
          excludeSelf={actingSeat}
          onPick={(t) => dispatch({ type: 'curatorGive', bySeat: actingSeat, targetSeat: t })}
          observation={observation}
          ackWith={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}
          label="Give an artifact to whom?"
        />
      );
    case 'thing':
      return (
        <ThingPanel view={view} actingSeat={actingSeat} dispatch={dispatch} observation={observation} />
      );
    case 'bodySnatcher':
      return (
        <PickSeat
          view={view}
          excludeSelf={actingSeat}
          onPick={(t) => dispatch({ type: 'bodySnatcherSwap', bySeat: actingSeat, targetSeat: t })}
          observation={observation}
          ackWith={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}
          label="Snatch whose body?"
        />
      );
    case 'windyWendy':
      return (
        <WindyWendyPanel view={view} actingSeat={actingSeat} dispatch={dispatch} observation={observation} />
      );
    case 'defenderEr':
      return (
        <PickSeat
          view={view}
          excludeSelf={null}
          onPick={(t) => dispatch({ type: 'defenderProtect', bySeat: actingSeat, targetSeat: t })}
          observation={observation}
          ackWith={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}
          label="Protect whom?"
        />
      );
    case 'alphaWolf':
      // Alpha wolf's step shows the werewolves they saw and then asks
      // which player to convert. The wake observation is the first one
      // pushed; the conversion observation appears once they pick.
      return (
        <AlphaWolfPanel view={view} actingSeat={actingSeat} dispatch={dispatch} />
      );
    default:
      return (
        <ObservationAndAck
          observation={observation}
          onAck={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}
        />
      );
  }
}

// ============================================================================
// Small action panels
// ============================================================================

function ObservationBox({ observation }: { observation: OnuwPublicState['yourObservations'][number] | null }) {
  if (!observation) return null;
  return (
    <div className={styles.observation}>
      <p className={styles.observationText}>{observation.text}</p>
    </div>
  );
}

function ObservationAndAck({
  observation,
  onAck,
}: {
  observation: OnuwPublicState['yourObservations'][number] | null;
  onAck: () => void;
}) {
  return (
    <>
      <ObservationBox observation={observation} />
      <div className={styles.actions}>
        <button className={styles.primary} onClick={onAck}>
          OK, I&apos;ve seen it
        </button>
      </div>
    </>
  );
}

function PickSeat({
  view,
  excludeSelf,
  onPick,
  label,
  observation,
  ackWith,
}: {
  view: OnuwPublicState;
  excludeSelf: number | null;
  onPick: (seat: number) => void;
  label: string;
  observation: OnuwPublicState['yourObservations'][number] | null;
  ackWith: () => void;
}) {
  const acted = observation !== null;
  return (
    <div style={{ display: 'grid', gap: 12, width: '100%' }}>
      <p className={styles.subtitle} style={{ textAlign: 'center' }}>
        {label}
      </p>
      <div className={styles.seatGrid}>
        {view.seats.map((s) => {
          if (s.index === excludeSelf) return null;
          return (
            <SeatPick
              key={s.index}
              seat={s}
              isLocal={s.index === view.yourSeat}
              onClick={acted ? undefined : () => onPick(s.index)}
            />
          );
        })}
      </div>
      <ObservationBox observation={observation} />
      {acted && (
        <div className={styles.actions}>
          <button className={styles.primary} onClick={ackWith}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function PickSeatWithSkip({
  view,
  excludeSelf,
  observation,
  ackWith,
  onPick,
  onSkip,
  pickLabel,
  skipLabel,
}: {
  view: OnuwPublicState;
  excludeSelf: number | null;
  observation: OnuwPublicState['yourObservations'][number] | null;
  ackWith: () => void;
  onPick: (seat: number) => void;
  onSkip: () => void;
  pickLabel: string;
  skipLabel: string;
}) {
  const acted = observation !== null;
  return (
    <div style={{ display: 'grid', gap: 12, width: '100%' }}>
      <p className={styles.subtitle} style={{ textAlign: 'center' }}>
        {pickLabel}
      </p>
      <div className={styles.seatGrid}>
        {view.seats.map((s) => {
          if (s.index === excludeSelf) return null;
          return (
            <SeatPick
              key={s.index}
              seat={s}
              isLocal={s.index === view.yourSeat}
              onClick={acted ? undefined : () => onPick(s.index)}
            />
          );
        })}
      </div>
      <ObservationBox observation={observation} />
      <div className={styles.actions}>
        {!acted && (
          <button className={styles.muted} onClick={onSkip}>
            {skipLabel}
          </button>
        )}
        {acted && (
          <button className={styles.primary} onClick={ackWith}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}

function PickCenterCard({
  view,
  onPick,
  observation,
  ackWith,
  label,
}: {
  view: OnuwPublicState;
  onPick: (centerIndex: number) => void;
  observation: OnuwPublicState['yourObservations'][number] | null;
  ackWith: () => void;
  label: string;
}) {
  const acted = observation !== null;
  return (
    <div style={{ display: 'grid', gap: 12, width: '100%' }}>
      <p className={styles.subtitle} style={{ textAlign: 'center' }}>
        {label}
      </p>
      <div className={styles.centerCardRow} style={{ justifyContent: 'center' }}>
        {view.centerCards.map((c) => (
          <button
            key={c.index}
            className={`${styles.centerCard} ${styles.selectable}`}
            disabled={acted}
            onClick={() => onPick(c.index)}
          >
            <span className={styles.centerCardLabel}>Center {c.index + 1}</span>
            <div className={styles.centerBack}>?</div>
          </button>
        ))}
      </div>
      <ObservationBox observation={observation} />
      {acted && (
        <div className={styles.actions}>
          <button className={styles.primary} onClick={ackWith}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function PickShiftDirection({
  observation,
  ackWith,
  onLeft,
  onRight,
  onSkip,
}: {
  observation: OnuwPublicState['yourObservations'][number] | null;
  ackWith: () => void;
  onLeft: () => void;
  onRight: () => void;
  onSkip: () => void;
}) {
  const acted = observation !== null;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className={styles.subtitle} style={{ textAlign: 'center' }}>
        Shift every other player&apos;s card one slot…
      </p>
      <div className={styles.actions}>
        {!acted && (
          <>
            <button className={styles.primary} onClick={onLeft}>
              ← Left
            </button>
            <button className={styles.primary} onClick={onRight}>
              Right →
            </button>
            <button className={styles.muted} onClick={onSkip}>
              Skip
            </button>
          </>
        )}
        {acted && (
          <button className={styles.primary} onClick={ackWith}>
            Done
          </button>
        )}
      </div>
      <ObservationBox observation={observation} />
    </div>
  );
}

function SeerPanel({
  view,
  actingSeat,
  dispatch,
  observation,
}: {
  view: OnuwPublicState;
  actingSeat: number;
  dispatch: (a: OnuwAction) => void;
  observation: OnuwPublicState['yourObservations'][number] | null;
}) {
  const [mode, setMode] = useState<'choose' | 'seat' | 'center'>('choose');
  const [centerPicks, setCenterPicks] = useState<number[]>([]);
  const acted = observation !== null;
  if (acted) {
    return (
      <>
        <ObservationBox observation={observation} />
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}>
            Done
          </button>
        </div>
      </>
    );
  }
  if (mode === 'choose') {
    return (
      <div className={styles.actions}>
        <button className={styles.primary} onClick={() => setMode('seat')}>
          Look at one player&apos;s card
        </button>
        <button className={styles.primary} onClick={() => setMode('center')}>
          Look at two center cards
        </button>
      </div>
    );
  }
  if (mode === 'seat') {
    return (
      <PickSeat
        view={view}
        excludeSelf={actingSeat}
        onPick={(t) => dispatch({ type: 'seerLookSeat', bySeat: actingSeat, targetSeat: t })}
        label="Look at whose card?"
        observation={observation}
        ackWith={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}
      />
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className={styles.subtitle} style={{ textAlign: 'center' }}>
        Pick two center cards (any order)
      </p>
      <div className={styles.centerCardRow} style={{ justifyContent: 'center' }}>
        {view.centerCards.map((c) => {
          const selected = centerPicks.includes(c.index);
          return (
            <button
              key={c.index}
              className={`${styles.centerCard} ${styles.selectable} ${selected ? styles.selected : ''}`}
              onClick={() =>
                setCenterPicks((cur) =>
                  cur.includes(c.index)
                    ? cur.filter((x) => x !== c.index)
                    : cur.length < 2
                      ? [...cur, c.index]
                      : cur,
                )
              }
            >
              <span className={styles.centerCardLabel}>Center {c.index + 1}</span>
              <div className={styles.centerBack}>?</div>
            </button>
          );
        })}
      </div>
      <div className={styles.actions}>
        <button
          className={styles.primary}
          disabled={centerPicks.length !== 2}
          onClick={() =>
            dispatch({
              type: 'seerLookCenter',
              bySeat: actingSeat,
              centerIndices: [centerPicks[0]!, centerPicks[1]!],
            })
          }
        >
          Look ({centerPicks.length}/2)
        </button>
      </div>
    </div>
  );
}

function ParanormalPanel({
  view,
  actingSeat,
  dispatch,
  observation,
}: {
  view: OnuwPublicState;
  actingSeat: number;
  dispatch: (a: OnuwAction) => void;
  observation: OnuwPublicState['yourObservations'][number] | null;
}) {
  // PI may look at 0, 1 or 2 players. Each lookup is a separate action; the
  // host advances when the seat acks or after 2 looks. We render the latest
  // observation and offer "look another" / "stop" until they ack.
  const obsCount = view.yourObservations.length;
  const stopped = obsCount === 0;
  // Use the most recent observation.
  return (
    <div style={{ display: 'grid', gap: 12, width: '100%' }}>
      <p className={styles.subtitle} style={{ textAlign: 'center' }}>
        Investigate up to 2 players, one at a time. Stop early if you join a team.
      </p>
      <div className={styles.seatGrid}>
        {view.seats.map((s) => (
          <SeatPick
            key={s.index}
            seat={s}
            isLocal={s.index === view.yourSeat}
            onClick={
              s.index === actingSeat
                ? undefined
                : () => dispatch({ type: 'paranormalLook', bySeat: actingSeat, targetSeat: s.index })
            }
          />
        ))}
      </div>
      <ObservationBox observation={observation} />
      <div className={styles.actions}>
        <button
          className={styles.muted}
          onClick={() => dispatch({ type: 'paranormalStop', bySeat: actingSeat })}
        >
          {stopped ? 'Skip entirely' : 'Stop investigating'}
        </button>
      </div>
    </div>
  );
}

function WitchPanel({
  view,
  actingSeat,
  dispatch,
  observation,
}: {
  view: OnuwPublicState;
  actingSeat: number;
  dispatch: (a: OnuwAction) => void;
  observation: OnuwPublicState['yourObservations'][number] | null;
}) {
  const [centerIndex, setCenterIndex] = useState<number | null>(null);
  const acted = observation !== null;
  if (acted) {
    return (
      <>
        <ObservationBox observation={observation} />
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}>
            Done
          </button>
        </div>
      </>
    );
  }
  if (centerIndex === null) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <p className={styles.subtitle} style={{ textAlign: 'center' }}>
          Witch: peek a center card.
        </p>
        <div className={styles.centerCardRow} style={{ justifyContent: 'center' }}>
          {view.centerCards.map((c) => (
            <button
              key={c.index}
              className={`${styles.centerCard} ${styles.selectable}`}
              onClick={() => setCenterIndex(c.index)}
            >
              <span className={styles.centerCardLabel}>Center {c.index + 1}</span>
              <div className={styles.centerBack}>?</div>
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.muted} onClick={() => dispatch({ type: 'witchSkip', bySeat: actingSeat })}>
            Skip entirely
          </button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className={styles.subtitle} style={{ textAlign: 'center' }}>
        Place Center {centerIndex + 1} face-down on which player? (May choose self.)
      </p>
      <div className={styles.seatGrid}>
        {view.seats.map((s) => (
          <SeatPick
            key={s.index}
            seat={s}
            isLocal={s.index === view.yourSeat}
            onClick={() => dispatch({ type: 'witchSwap', bySeat: actingSeat, centerIndex, targetSeat: s.index })}
          />
        ))}
      </div>
    </div>
  );
}

function TroublemakerPanel({
  view,
  actingSeat,
  dispatch,
  observation,
}: {
  view: OnuwPublicState;
  actingSeat: number;
  dispatch: (a: OnuwAction) => void;
  observation: OnuwPublicState['yourObservations'][number] | null;
}) {
  const [picks, setPicks] = useState<number[]>([]);
  const acted = observation !== null;
  if (acted) {
    return (
      <>
        <ObservationBox observation={observation} />
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}>
            Done
          </button>
        </div>
      </>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12, width: '100%' }}>
      <p className={styles.subtitle} style={{ textAlign: 'center' }}>
        Pick two OTHER players to swap.
      </p>
      <div className={styles.seatGrid}>
        {view.seats.map((s) => {
          if (s.index === actingSeat) return null;
          const selected = picks.includes(s.index);
          return (
            <SeatPick
              key={s.index}
              seat={s}
              isLocal={s.index === view.yourSeat}
              selected={selected}
              onClick={() =>
                setPicks((cur) =>
                  cur.includes(s.index)
                    ? cur.filter((x) => x !== s.index)
                    : cur.length < 2
                      ? [...cur, s.index]
                      : cur,
                )
              }
            />
          );
        })}
      </div>
      <div className={styles.actions}>
        <button
          className={styles.primary}
          disabled={picks.length !== 2}
          onClick={() =>
            dispatch({ type: 'troublemakerSwap', bySeat: actingSeat, a: picks[0]!, b: picks[1]! })
          }
        >
          Swap ({picks.length}/2)
        </button>
      </div>
    </div>
  );
}

function ThingPanel({
  view,
  actingSeat,
  dispatch,
  observation,
}: {
  view: OnuwPublicState;
  actingSeat: number;
  dispatch: (a: OnuwAction) => void;
  observation: OnuwPublicState['yourObservations'][number] | null;
}) {
  const acted = observation !== null;
  const n = view.seats.length;
  const left = (actingSeat - 1 + n) % n;
  const right = (actingSeat + 1) % n;
  if (acted) {
    return (
      <>
        <ObservationBox observation={observation} />
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}>
            Done
          </button>
        </div>
      </>
    );
  }
  return (
    <div className={styles.actions}>
      <button
        className={styles.primary}
        onClick={() => dispatch({ type: 'thingTap', bySeat: actingSeat, targetSeat: left })}
      >
        Tap {view.seats[left]!.name} (left)
      </button>
      <button
        className={styles.primary}
        onClick={() => dispatch({ type: 'thingTap', bySeat: actingSeat, targetSeat: right })}
      >
        Tap {view.seats[right]!.name} (right)
      </button>
    </div>
  );
}

function WindyWendyPanel({
  view,
  actingSeat,
  dispatch,
  observation,
}: {
  view: OnuwPublicState;
  actingSeat: number;
  dispatch: (a: OnuwAction) => void;
  observation: OnuwPublicState['yourObservations'][number] | null;
}) {
  const [source, setSource] = useState<number | null>(null);
  const acted = observation !== null;
  if (acted) {
    return (
      <>
        <ObservationBox observation={observation} />
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}>
            Done
          </button>
        </div>
      </>
    );
  }
  if (source === null) {
    return (
      <div style={{ display: 'grid', gap: 12, width: '100%' }}>
        <p className={styles.subtitle} style={{ textAlign: 'center' }}>
          Pick a source card.
        </p>
        <div className={styles.seatGrid}>
          {view.seats.map((s) => {
            if (s.index === actingSeat) return null;
            return (
              <SeatPick
                key={s.index}
                seat={s}
                isLocal={s.index === view.yourSeat}
                onClick={() => setSource(s.index)}
              />
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className={styles.subtitle} style={{ textAlign: 'center' }}>
        Shift {view.seats[source]!.name}&apos;s card …
      </p>
      <div className={styles.actions}>
        <button
          className={styles.primary}
          onClick={() => dispatch({ type: 'windyWendyShift', bySeat: actingSeat, sourceSeat: source, direction: 'left' })}
        >
          ← Left
        </button>
        <button
          className={styles.primary}
          onClick={() => dispatch({ type: 'windyWendyShift', bySeat: actingSeat, sourceSeat: source, direction: 'right' })}
        >
          Right →
        </button>
      </div>
    </div>
  );
}

function AlphaWolfPanel({
  view,
  actingSeat,
  dispatch,
}: {
  view: OnuwPublicState;
  actingSeat: number;
  dispatch: (a: OnuwAction) => void;
}) {
  const wakeObs = view.yourObservations[0] ?? null;
  const convertObs = view.yourObservations[1] ?? null;
  const converted = convertObs !== null;
  if (converted) {
    return (
      <>
        {wakeObs && <ObservationBox observation={wakeObs} />}
        <ObservationBox observation={convertObs} />
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}>
            Done
          </button>
        </div>
      </>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12, width: '100%' }}>
      {wakeObs && <ObservationBox observation={wakeObs} />}
      <p className={styles.subtitle} style={{ textAlign: 'center' }}>
        Alpha Wolf: pick a non-werewolf to convert into a werewolf.
      </p>
      <div className={styles.seatGrid}>
        {view.seats.map((s) => {
          if (s.index === actingSeat) return null;
          return (
            <SeatPick
              key={s.index}
              seat={s}
              isLocal={s.index === view.yourSeat}
              onClick={() => dispatch({ type: 'alphaWolfConvert', bySeat: actingSeat, targetSeat: s.index })}
            />
          );
        })}
      </div>
    </div>
  );
}

function MysticWolfPanel({
  view,
  actingSeat,
  dispatch,
}: {
  view: OnuwPublicState;
  actingSeat: number;
  dispatch: (a: OnuwAction) => void;
}) {
  // The auto-observation (werewolf wake) is already in observations[0].
  // After the look-at-one-player action, observations[1] will hold the peek.
  const wakeObs = view.yourObservations[0] ?? null;
  const peekObs = view.yourObservations[1] ?? null;
  const peeked = peekObs !== null;
  if (peeked) {
    return (
      <>
        {wakeObs && <ObservationBox observation={wakeObs} />}
        <ObservationBox observation={peekObs} />
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}>
            Done
          </button>
        </div>
      </>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12, width: '100%' }}>
      {wakeObs && <ObservationBox observation={wakeObs} />}
      <p className={styles.subtitle} style={{ textAlign: 'center' }}>
        Mystic Wolf: look at one other player&apos;s card.
      </p>
      <div className={styles.seatGrid}>
        {view.seats.map((s) => {
          if (s.index === actingSeat) return null;
          return (
            <SeatPick
              key={s.index}
              seat={s}
              isLocal={s.index === view.yourSeat}
              onClick={() => dispatch({ type: 'mysticWolfLook', bySeat: actingSeat, targetSeat: s.index })}
            />
          );
        })}
      </div>
    </div>
  );
}

function WerewolfWakePanel({
  view,
  actingSeat,
  observation,
  isLoneWolf,
  dispatch,
  role,
}: {
  view: OnuwPublicState;
  actingSeat: number;
  observation: OnuwPublicState['yourObservations'][number] | null;
  isLoneWolf: boolean;
  dispatch: (a: OnuwAction) => void;
  role: OnuwRoleId;
}) {
  // First show the wake observation (already auto-populated by host).
  // For mystic wolf and alpha wolf, the wake observation is the same;
  // the role-specific extra action runs as its own night step.
  // For plain 'werewolf' if isLoneWolf, offer center peek before ack.
  const [peekChoice, setPeekChoice] = useState<number | null>(null);
  const hasPeeked = view.yourObservations.length > 1;
  if (isLoneWolf && !hasPeeked && peekChoice === null) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <ObservationBox observation={observation} />
        <p className={styles.subtitle} style={{ textAlign: 'center' }}>
          You are the only werewolf awake. Optionally peek one center card.
        </p>
        <div className={styles.centerCardRow} style={{ justifyContent: 'center' }}>
          {view.centerCards.map((c) => (
            <button
              key={c.index}
              className={`${styles.centerCard} ${styles.selectable}`}
              onClick={() => {
                dispatch({ type: 'loneWolfPeekCenter', bySeat: actingSeat, centerIndex: c.index });
                setPeekChoice(c.index);
              }}
            >
              <span className={styles.centerCardLabel}>Center {c.index + 1}</span>
              <div className={styles.centerBack}>?</div>
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          <button
            className={styles.muted}
            onClick={() => dispatch({ type: 'loneWolfSkip', bySeat: actingSeat })}
          >
            Skip peek
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      {view.yourObservations.map((o, i) => (
        <ObservationBox key={i} observation={o} />
      ))}
      <div className={styles.actions}>
        <button className={styles.primary} onClick={() => dispatch({ type: 'nightAck', bySeat: actingSeat })}>
          Done (as {ROLES[role].name})
        </button>
      </div>
    </>
  );
}

function SeatPick({
  seat,
  isLocal,
  selected,
  onClick,
}: {
  seat: OnuwPublicSeatState;
  isLocal: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const cls = [
    styles.seat,
    onClick && styles.selectable,
    selected && styles.selected,
    seat.killed && styles.killed,
    isLocal && styles.you,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} onClick={onClick}>
      <div className={styles.seatAvatar}>{seat.name.slice(0, 1).toUpperCase()}</div>
      <div>
        <div className={styles.seatName}>
          {seat.name}
          {isLocal && (
            <span style={{ color: '#60a5fa', fontSize: 11, marginLeft: 6 }}>(you)</span>
          )}
        </div>
        <div className={styles.seatMeta}>Seat {seat.index + 1}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Day phase — discussion timer + cheatsheet of roles in play
// ============================================================================

function DayPhase({
  view,
  dispatch,
}: {
  view: OnuwPublicState;
  dispatch: (a: OnuwAction) => void;
}) {
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>Discussion</h3>
      <p className={styles.subtitle}>
        Talk it out, then vote. Center cards stay face-down (in their original slot order)
        until everyone has voted.
      </p>

      <div className={styles.centerCardRow} style={{ marginTop: 12 }}>
        {view.centerCards.map((c) => (
          <div key={c.index} className={styles.centerCard}>
            <span className={styles.centerCardLabel}>Center {c.index + 1}</span>
            <div className={styles.centerBack}>?</div>
          </div>
        ))}
      </div>

      <h4 style={{ marginTop: 18, marginBottom: 4 }}>Roles &amp; night order in play</h4>
      <p className={styles.subtitle}>
        These are the cards dealt this game. Order is the official night wake-order.
      </p>
      <Cheatsheet view={view} />

      <div className={styles.actions} style={{ marginTop: 18, justifyContent: 'flex-end' }}>
        <button className={styles.primary} onClick={() => dispatch({ type: 'startVote' })}>
          Start vote →
        </button>
      </div>
    </div>
  );
}

function Cheatsheet({ view }: { view: OnuwPublicState }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of view.rolePool) c[r] = (c[r] ?? 0) + 1;
    return c;
  }, [view.rolePool]);
  const uniqueRoles = useMemo(() => {
    const set = new Set<OnuwRoleId>();
    for (const r of view.rolePool) set.add(r);
    return rolesSortedByWakeOrder([...set]);
  }, [view.rolePool]);
  let nightCounter = 0;
  return (
    <div className={styles.cheatsheet}>
      {uniqueRoles.map((r) => {
        const spec = ROLES[r];
        const hasNight = spec.wakeOrder < 1000;
        if (hasNight) nightCounter++;
        return (
          <div key={r} className={styles.cheatRow}>
            <div className={styles.cheatStep}>{hasNight ? nightCounter : '—'}</div>
            <RoleArt role={r} size={36} />
            <div>
              <div className={styles.cheatName}>
                <TeamBadge role={r} /> {spec.name}
              </div>
              <div className={styles.cheatDesc}>{spec.description}</div>
            </div>
            <div className={styles.cheatCount}>×{counts[r]}</div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Voting phase
// ============================================================================

function VotingPhase({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: OnuwPublicState;
  localSeat: number | null;
  dispatch: (a: OnuwAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const next = view.seats.find((s) => !s.hasVoted);
  const [pick, setPick] = useState<number | null>(null);
  const [covered, setCovered] = useState(true);

  if (!next) {
    return (
      <div className={styles.panel}>
        <p>All votes are in. Resolving…</p>
      </div>
    );
  }
  const needsRotate = localSeat !== next.index;
  if (needsRotate || covered) {
    return (
      <div className={styles.coverScreen}>
        <div className={styles.coverInner}>
          <h2>Private vote</h2>
          <p>It&apos;s {next.name}&apos;s turn to vote.</p>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>Everyone else, look away.</p>
          <button
            className={styles.primary}
            onClick={() => {
              if (needsRotate) rotateSeat(next.index);
              setCovered(false);
              setPick(null);
            }}
          >
            I am {next.name} — show vote screen
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>{next.name}, who do you suspect is a werewolf?</h3>
      <p className={styles.subtitle}>
        Tap a player to mark them, then confirm. Your vote stays private until tallied.
      </p>
      <h4 style={{ marginTop: 18, marginBottom: 4 }}>Cheatsheet — roles &amp; night order</h4>
      <Cheatsheet view={view} />
      <div className={styles.seatGrid} style={{ marginTop: 16 }}>
        {view.seats.map((s) => (
          <SeatPick
            key={s.index}
            seat={s}
            isLocal={s.index === next.index}
            selected={pick === s.index}
            onClick={() => setPick(s.index)}
          />
        ))}
      </div>
      <div className={styles.actions} style={{ marginTop: 16 }}>
        <button
          className={styles.primary}
          disabled={pick === null}
          onClick={() => {
            if (pick === null) return;
            dispatch({ type: 'castVote', bySeat: next.index, targetSeat: pick });
            setCovered(true);
            setPick(null);
          }}
        >
          Confirm vote
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Resolution / game over
// ============================================================================

function ResolutionPhase({
  view,
  dispatch,
}: {
  view: OnuwPublicState;
  dispatch: (a: OnuwAction) => void;
}) {
  const winner = view.winnerTeam ?? 'village';
  const winnerLabel =
    winner === 'village' ? '⚜ Village Wins' : winner === 'werewolves' ? '🐺 Werewolves Win' : '🃏 Tanner Wins';
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className={`${styles.gameOverBanner} ${styles[winner]}`}>{winnerLabel}</div>

      <div className={styles.panel}>
        <h3 style={{ marginTop: 0 }}>Vote tally</h3>
        <div className={styles.voteTable}>
          {view.seats.map((s) => (
            <div key={s.index} className={styles.voteRow}>
              <span>
                {s.name}
                {s.killed && <span style={{ color: '#f87171', marginLeft: 8 }}>☠ killed</span>}
              </span>
              <span>{view.voteTally[s.index] ?? 0} votes</span>
            </div>
          ))}
        </div>
        <p className={styles.subtitle} style={{ marginTop: 10 }}>
          Who voted whom:
        </p>
        <div className={styles.voteTable}>
          {view.seats.map((s) => (
            <div key={s.index} className={styles.voteRow}>
              <span>{s.name}</span>
              <span>
                → {s.voteTarget !== null ? view.seats[s.voteTarget]?.name ?? '—' : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.panel}>
        <h3 style={{ marginTop: 0 }}>Final roles</h3>
        <div className={styles.seatGrid}>
          {view.seats.map((s) => (
            <RevealedSeat key={s.index} seat={s} />
          ))}
        </div>
        <h4 style={{ marginTop: 18, marginBottom: 6 }}>Center cards (original slot order)</h4>
        <div className={styles.centerCardRow}>
          {view.centerCards.map((c) => (
            <div key={c.index} className={styles.centerCard}>
              <span className={styles.centerCardLabel}>Center {c.index + 1}</span>
              {c.revealedRole ? (
                <>
                  <RoleArt role={c.revealedRole} size={60} />
                  <span style={{ fontSize: 12 }}>{ROLES[c.revealedRole].name}</span>
                </>
              ) : (
                <div className={styles.centerBack}>?</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {view.phase !== 'gameOver' && (
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => dispatch({ type: 'ackGameOver' })}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

function RevealedSeat({ seat }: { seat: OnuwPublicSeatState }) {
  if (!seat.revealedRole) return null;
  const spec = ROLES[seat.revealedRole];
  return (
    <div className={`${styles.seat} ${seat.killed ? styles.killed : ''}`}>
      <RoleArt role={seat.revealedRole} size={42} />
      <div>
        <div className={styles.seatName}>{seat.name}</div>
        <div className={styles.seatMeta}>
          <TeamBadge role={seat.revealedRole} /> {spec.name}
          {seat.killed && <span style={{ color: '#f87171', marginLeft: 6 }}>☠</span>}
        </div>
      </div>
    </div>
  );
}
