import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { AvalonAction } from '../actions';
import type { AvalonPublicState, AvalonPublicSeatState } from '../state';
import { ROLES } from '../roles';
import { MAX_REJECTED_PROPOSALS } from '../quest-tracks';
import { RoleArt, AlignmentBadge } from './RoleArt';
import styles from './GameView.module.css';

export function AvalonGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);

  if (!publicView) return null;
  const view = publicView.view as AvalonPublicState;

  const dispatchAction = (a: AvalonAction) => dispatch(a);
  const rotateSeat = (seat: number) => setLocalSeat(seat);

  return (
    <div className={styles.root}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h2 className={styles.title}>Avalon</h2>
          <p className={styles.subtitle}>
            Quest {view.currentQuestNumber} of 5 ·{' '}
            <SeatLabel view={view} seat={view.currentLeaderSeat} /> is leader
          </p>
        </div>
        <button onClick={exitGame}>Exit</button>
      </header>

      <QuestTrack view={view} />
      <RejectMeter count={view.failedProposalsThisQuest} />

      <PhasePanel
        view={view}
        localSeat={localSeat}
        dispatch={dispatchAction}
        rotateSeat={rotateSeat}
      />

      <SeatRoster view={view} localSeat={localSeat} />

      {view.questHistory.length > 0 && <QuestHistory view={view} />}
    </div>
  );
}

// ============================================================================
// Phase panel — switches on phase and renders the right active controls.
// ============================================================================

function PhasePanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: AvalonPublicState;
  localSeat: number | null;
  dispatch: (a: AvalonAction) => void;
  rotateSeat: (seat: number) => void;
}) {
  switch (view.phase) {
    case 'setup':
      return <RoleRevealScreen view={view} dispatch={dispatch} rotateSeat={rotateSeat} />;
    case 'teamProposal':
      return (
        <TeamProposalPanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'teamVote':
      return (
        <TeamVotePanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'teamVoteReveal':
      return <TeamVoteRevealPanel view={view} dispatch={dispatch} />;
    case 'questExecution':
      return (
        <QuestExecutionPanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'questResolution':
      return <QuestResolutionPanel view={view} dispatch={dispatch} />;
    case 'assassinPick':
      return (
        <AssassinPickPanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'gameOver':
      return <GameOverPanel view={view} />;
    default:
      return null;
  }
}

// ============================================================================
// Phase: setup — role reveal in hot-seat (cover-up screen between seats)
// ============================================================================

function RoleRevealScreen({
  view,
  dispatch,
  rotateSeat,
}: {
  view: AvalonPublicState;
  dispatch: (a: AvalonAction) => void;
  rotateSeat: (seat: number) => void;
}) {
  // Walk seats in order; show "Pass to <name>" between reveals.
  const nextUnacked = view.seats.find((s) => !s.hasAckedSetup);
  const [covered, setCovered] = useState(true);

  if (!nextUnacked) {
    // All acked — shouldn't normally see this since phase transitions, but guard.
    return (
      <div className={styles.panel}>
        <p>Everyone has seen their role. Starting…</p>
      </div>
    );
  }

  const seatIdx = nextUnacked.index;
  // If the local viewer isn't the seat being shown, switch viewers first.
  const needsRotate = view.yourSeat !== seatIdx;

  if (needsRotate || covered) {
    return (
      <div className={styles.coverScreen}>
        <div className={styles.coverInner}>
          <h2>Pass the device</h2>
          <p>It&apos;s {nextUnacked.name}&apos;s turn to look at their role.</p>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            Everyone else should look away.
          </p>
          <button
            className={styles.primary}
            onClick={() => {
              if (needsRotate) rotateSeat(seatIdx);
              setCovered(false);
            }}
          >
            I am {nextUnacked.name} — show my role
          </button>
        </div>
      </div>
    );
  }

  // Local seat now matches the seat being shown; render the role card.
  const role = view.yourRole;
  if (!role || view.yourAlignment === null) {
    return <div className={styles.panel}>Loading role…</div>;
  }
  const spec = ROLES[role];
  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <RoleArt role={role} size={140} />
      <div>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>You are</p>
        <h2 className={styles.roleName}>{spec.name}</h2>
        <span className={`${styles.roleAlignment} ${styles[view.yourAlignment]}`}>
          {view.yourAlignment === 'good' ? 'Loyal Servant of Arthur' : 'Minion of Mordred'}
        </span>
      </div>
      <p style={{ maxWidth: 460, lineHeight: 1.5, color: '#cbd5e1' }}>{spec.description}</p>

      {view.yourRoleKnowledge.length > 0 && (
        <div style={{ width: '100%', maxWidth: 360 }}>
          <p style={{ margin: '8px 0', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            You see:
          </p>
          <div className={styles.knownList}>
            {view.yourRoleKnowledge.map((k) => (
              <div key={k.seat} className={styles.knownItem}>
                <span>{view.seats[k.seat]?.name ?? `Seat ${k.seat}`}</span>
                <span style={{ color: '#fbbf24', fontSize: 12 }}>{k.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        className={styles.primary}
        onClick={() => {
          dispatch({ type: 'ackRoleReveal', bySeat: seatIdx });
          setCovered(true);
        }}
      >
        I have memorised my role
      </button>
    </div>
  );
}

// ============================================================================
// Phase: teamProposal — leader picks team
// ============================================================================

function TeamProposalPanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: AvalonPublicState;
  localSeat: number | null;
  dispatch: (a: AvalonAction) => void;
  rotateSeat: (seat: number) => void;
}) {
  const isLeader = localSeat === view.currentLeaderSeat;
  const [picks, setPicks] = useState<number[]>([]);
  const spec = view.questTrack[view.currentQuestNumber - 1]!;

  // If local viewer isn't the leader, show the pass-device screen.
  if (!isLeader) {
    const leaderName = view.seats[view.currentLeaderSeat]?.name ?? '';
    return (
      <div className={styles.panel}>
        <p style={{ margin: 0 }}>
          Waiting for <b>{leaderName}</b> to propose a team of {spec.teamSize}.
        </p>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => rotateSeat(view.currentLeaderSeat)}>
            Pass device to {leaderName}
          </button>
        </div>
      </div>
    );
  }

  const toggle = (seat: number) => {
    setPicks((cur) =>
      cur.includes(seat)
        ? cur.filter((x) => x !== seat)
        : cur.length < spec.teamSize
          ? [...cur, seat]
          : cur,
    );
  };

  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>
        Pick a team of {spec.teamSize}
        {spec.failsRequired > 1 && (
          <span style={{ marginLeft: 8, color: '#fbbf24', fontSize: 12 }}>
            (needs {spec.failsRequired} fails to fail)
          </span>
        )}
      </h3>
      <p className={styles.subtitle}>Tap players to add/remove them from the quest team.</p>
      <div className={styles.seatGrid} style={{ marginTop: 12 }}>
        {view.seats.map((s) => (
          <SeatCard
            key={s.index}
            seat={s}
            isLocal={s.index === localSeat}
            selectable
            selected={picks.includes(s.index)}
            onClick={() => toggle(s.index)}
          />
        ))}
      </div>
      <div className={styles.actions} style={{ marginTop: 16 }}>
        <button
          className={styles.primary}
          disabled={picks.length !== spec.teamSize}
          onClick={() => dispatch({ type: 'proposeTeam', bySeat: view.currentLeaderSeat, team: picks })}
        >
          Propose team ({picks.length}/{spec.teamSize})
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Phase: teamVote — everyone votes
// ============================================================================

function TeamVotePanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: AvalonPublicState;
  localSeat: number | null;
  dispatch: (a: AvalonAction) => void;
  rotateSeat: (seat: number) => void;
}) {
  // Hot-seat: walk seats in order, asking each to privately vote behind a cover.
  // We use the private view's `votedSeats` indicator (votes are hidden mid-vote,
  // but we know how many votes have been cast from the visible state... actually
  // it's hidden during teamVote — fall back to using the public state behavior
  // and ordering by seat index).
  //
  // Simpler: track who has voted via local UI state. Since the engine hides
  // mid-vote `voteApprove`, we need a UI-side flag. We track it via the
  // engine's view: a seat that has voted will have voteApprove=null during
  // teamVote (it's hidden) — so we can't differentiate by view alone.
  // Use a local "who's been through" counter keyed on the tick.

  const [doneSeats, setDoneSeats] = useState<Set<number>>(new Set());
  const [covered, setCovered] = useState(true);

  const nextSeat = view.seats.find((s) => !doneSeats.has(s.index));
  if (!nextSeat) {
    // Should have transitioned to teamVoteReveal already; show a thinking dot.
    return (
      <div className={styles.panel}>
        <p>Tallying votes…</p>
      </div>
    );
  }

  const seatIdx = nextSeat.index;
  const isLocal = localSeat === seatIdx;

  if (!isLocal || covered) {
    return (
      <div className={styles.coverScreen}>
        <div className={styles.coverInner}>
          <h2>Vote on the team</h2>
          <ProposedTeamSummary view={view} />
          <p>It&apos;s {nextSeat.name}&apos;s turn to vote.</p>
          <button
            className={styles.primary}
            onClick={() => {
              if (!isLocal) rotateSeat(seatIdx);
              setCovered(false);
            }}
          >
            I am {nextSeat.name} — show my vote
          </button>
        </div>
      </div>
    );
  }

  const submit = (approve: boolean) => {
    dispatch({ type: 'castTeamVote', bySeat: seatIdx, approve });
    setDoneSeats((cur) => new Set(cur).add(seatIdx));
    setCovered(true);
  };

  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>Your vote, {nextSeat.name}</p>
      <ProposedTeamSummary view={view} />
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button className={styles.success} onClick={() => submit(true)}>
          Approve
        </button>
        <button className={styles.danger} onClick={() => submit(false)}>
          Reject
        </button>
      </div>
    </div>
  );
}

function ProposedTeamSummary({ view }: { view: AvalonPublicState }) {
  return (
    <div>
      <p style={{ margin: '0 0 6px', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        Proposed team (Quest {view.currentQuestNumber})
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {view.proposedTeam.map((s) => (
          <span
            key={s}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              background: '#1f2937',
              border: '1px solid #fbbf24',
              fontSize: 13,
            }}
          >
            {view.seats[s]?.name ?? `Seat ${s}`}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Phase: teamVoteReveal — show results
// ============================================================================

function TeamVoteRevealPanel({
  view,
  dispatch,
}: {
  view: AvalonPublicState;
  dispatch: (a: AvalonAction) => void;
}) {
  const approveCount = view.seats.filter((s) => s.voteApprove === true).length;
  const rejectCount = view.seats.filter((s) => s.voteApprove === false).length;
  const approved = approveCount > rejectCount;

  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>
        Team {approved ? 'APPROVED' : 'REJECTED'} ({approveCount}–{rejectCount})
      </h3>
      <p className={styles.subtitle}>
        {approved
          ? 'The team will now go on the quest.'
          : `Leader passes. ${MAX_REJECTED_PROPOSALS - view.failedProposalsThisQuest - 1} rejection(s) remain before evil wins.`}
      </p>
      <div className={styles.seatGrid} style={{ marginTop: 12 }}>
        {view.seats.map((s) => (
          <SeatCard key={s.index} seat={s} isLocal={false} />
        ))}
      </div>
      <div className={styles.actions} style={{ marginTop: 16 }}>
        <button className={styles.primary} onClick={() => dispatch({ type: 'ackTeamVoteReveal' })}>
          Continue
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Phase: questExecution — team members play success/fail privately
// ============================================================================

function QuestExecutionPanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: AvalonPublicState;
  localSeat: number | null;
  dispatch: (a: AvalonAction) => void;
  rotateSeat: (seat: number) => void;
}) {
  // Walk the proposed team in order; each member submits a card behind a cover.
  const [doneSeats, setDoneSeats] = useState<Set<number>>(new Set());
  const [covered, setCovered] = useState(true);

  const nextSeat = view.proposedTeam.find((s) => !doneSeats.has(s));
  if (nextSeat === undefined) {
    return (
      <div className={styles.panel}>
        <p>Resolving quest…</p>
      </div>
    );
  }

  const isLocal = localSeat === nextSeat;
  const seatName = view.seats[nextSeat]?.name ?? `Seat ${nextSeat}`;

  if (!isLocal || covered) {
    return (
      <div className={styles.coverScreen}>
        <div className={styles.coverInner}>
          <h2>Play your quest card</h2>
          <ProposedTeamSummary view={view} />
          <p>{seatName} is on the team — pass them the device.</p>
          <button
            className={styles.primary}
            onClick={() => {
              if (!isLocal) rotateSeat(nextSeat);
              setCovered(false);
            }}
          >
            I am {seatName} — show my card choice
          </button>
        </div>
      </div>
    );
  }

  const alignment = view.yourAlignment;
  const canFail = alignment === 'evil';

  const submit = (success: boolean) => {
    dispatch({ type: 'playQuestCard', bySeat: nextSeat, success });
    setDoneSeats((cur) => new Set(cur).add(nextSeat));
    setCovered(true);
  };

  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>{seatName}, choose your card</p>
      <p className={styles.subtitle}>
        {canFail
          ? 'As an evil player, you may play Success or Fail.'
          : 'Good players must play Success.'}
      </p>
      <div className={styles.actions}>
        <button className={styles.success} onClick={() => submit(true)}>
          Success
        </button>
        <button className={styles.danger} disabled={!canFail} onClick={() => submit(false)}>
          Fail
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Phase: questResolution — reveal pass/fail
// ============================================================================

function QuestResolutionPanel({
  view,
  dispatch,
}: {
  view: AvalonPublicState;
  dispatch: (a: AvalonAction) => void;
}) {
  const lastQuest = view.questHistory[view.questHistory.length - 1];
  if (!lastQuest) return null;
  const passed = lastQuest.result === 'success';
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0, color: passed ? '#60a5fa' : '#f87171' }}>
        Quest {lastQuest.questNumber} {passed ? 'SUCCEEDED' : 'FAILED'}
      </h3>
      <p className={styles.subtitle}>
        Fail cards played: <b>{lastQuest.failCount}</b>
        {lastQuest.failsRequired > 1 && ` (needed ${lastQuest.failsRequired} to fail)`}
      </p>
      <div className={styles.actions} style={{ marginTop: 16 }}>
        <button className={styles.primary} onClick={() => dispatch({ type: 'ackQuestResolution' })}>
          Continue
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Phase: assassinPick — assassin picks Merlin
// ============================================================================

function AssassinPickPanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: AvalonPublicState;
  localSeat: number | null;
  dispatch: (a: AvalonAction) => void;
  rotateSeat: (seat: number) => void;
}) {
  // We don't know who the assassin IS publicly. We hand control to the
  // evil player who has yourRole === 'assassin'. In hot-seat mode the
  // store rotates seats; if the local seat isn't the assassin, prompt to
  // pass the device. Since the assassin's identity must stay secret to
  // good players, we use a "Are you the Assassin?" gate: the only way to
  // tell is to be that seat.
  const isAssassin = view.yourRole === 'assassin';
  const [pick, setPick] = useState<number | null>(null);

  if (!isAssassin) {
    return (
      <div className={styles.panel}>
        <h3 style={{ marginTop: 0 }}>Good won the quest race</h3>
        <p className={styles.subtitle}>
          The Assassin now gets one chance to identify Merlin. Pass the device discreetly
          to whichever evil player is the Assassin.
        </p>
        <div className={styles.actions}>
          {view.seats.map((s) => (
            <button key={s.index} onClick={() => rotateSeat(s.index)} disabled={localSeat === s.index}>
              I am {s.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const goodSeats = view.seats; // Assassin can shoot anyone; only good targets actually matter.
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>Assassin: pick the seat you believe is Merlin</h3>
      <p className={styles.subtitle}>Hit Merlin → evil wins. Miss → good wins.</p>
      <div className={styles.seatGrid} style={{ marginTop: 12 }}>
        {goodSeats.map((s) => (
          <SeatCard
            key={s.index}
            seat={s}
            isLocal={s.index === localSeat}
            selectable
            selected={pick === s.index}
            onClick={() => setPick(s.index)}
          />
        ))}
      </div>
      <div className={styles.actions} style={{ marginTop: 16 }}>
        <button
          className={styles.danger}
          disabled={pick === null}
          onClick={() =>
            pick !== null &&
            dispatch({
              type: 'assassinateMerlin',
              bySeat: view.yourSeat ?? 0,
              target: pick,
            })
          }
        >
          Assassinate
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Phase: gameOver
// ============================================================================

function GameOverPanel({ view }: { view: AvalonPublicState }) {
  const winner = view.winnerTeam ?? 'good';
  return (
    <div className={styles.panel}>
      <div className={`${styles.gameOverBanner} ${styles[winner]}`}>
        {winner === 'good' ? '⚜ Good Wins' : '☠ Evil Wins'}
      </div>
      {view.assassinationTarget !== null && (
        <p style={{ textAlign: 'center', marginTop: 12 }}>
          Assassin targeted <b>{view.seats[view.assassinationTarget]?.name}</b>
          {view.seats[view.assassinationTarget]?.revealedRole === 'merlin'
            ? ' — and they were Merlin.'
            : ' — but they were not Merlin.'}
        </p>
      )}
      <div className={styles.seatGrid} style={{ marginTop: 16 }}>
        {view.seats.map((s) => (
          <RevealedSeatCard key={s.index} seat={s} />
        ))}
      </div>
    </div>
  );
}

function RevealedSeatCard({ seat }: { seat: AvalonPublicSeatState }) {
  if (!seat.revealedRole) return null;
  const role = seat.revealedRole;
  return (
    <div className={styles.seat}>
      <RoleArt role={role} size={40} />
      <div>
        <div className={styles.seatName}>{seat.name}</div>
        <div className={styles.seatMeta}>
          <AlignmentBadge alignment={seat.revealedAlignment ?? 'good'} /> {ROLES[role].name}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Shared bits
// ============================================================================

function QuestTrack({ view }: { view: AvalonPublicState }) {
  return (
    <div className={styles.questTrack}>
      {view.questTrack.map((q, i) => {
        const questNum = i + 1;
        const past = view.questHistory.find((h) => h.questNumber === questNum);
        const isCurrent = questNum === view.currentQuestNumber && view.phase !== 'gameOver';
        const cls = [
          styles.questTile,
          past?.result === 'success' && styles.success,
          past?.result === 'fail' && styles.fail,
          isCurrent && styles.current,
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={i} className={cls}>
            <span className={styles.questNumber}>Quest {questNum}</span>
            <span className={styles.teamSize}>{q.teamSize}</span>
            {q.failsRequired > 1 && (
              <span className={styles.failsRequired}>×{q.failsRequired} fails</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RejectMeter({ count }: { count: number }) {
  return (
    <div>
      <div className={styles.subtitle}>
        Rejected proposals this round: {count} / {MAX_REJECTED_PROPOSALS} (5 = evil wins)
      </div>
      <div className={styles.rejectMeter}>
        {Array.from({ length: MAX_REJECTED_PROPOSALS }, (_, i) => (
          <div key={i} className={`${styles.rejectDot} ${i < count ? styles.filled : ''}`} />
        ))}
      </div>
    </div>
  );
}

function SeatRoster({ view, localSeat }: { view: AvalonPublicState; localSeat: number | null }) {
  return (
    <div>
      <p className={styles.subtitle} style={{ marginBottom: 6 }}>
        Players
      </p>
      <div className={styles.seatGrid}>
        {view.seats.map((s) => (
          <SeatCard key={s.index} seat={s} isLocal={s.index === localSeat} />
        ))}
      </div>
    </div>
  );
}

function SeatCard({
  seat,
  isLocal,
  selectable,
  selected,
  onClick,
}: {
  seat: AvalonPublicSeatState;
  isLocal: boolean;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const cls = [
    styles.seat,
    selectable && styles.selectable,
    selected && styles.selected,
    seat.isCurrentLeader && styles.leader,
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
        <div className={styles.seatMeta}>
          {seat.isCurrentLeader && '👑 leader '}
          {seat.isOnProposedTeam && '⚔ on team '}
          {seat.voteApprove !== null && (
            <span
              className={`${styles.seatVote} ${seat.voteApprove ? styles.approve : styles.reject}`}
            >
              {seat.voteApprove ? 'Approve' : 'Reject'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SeatLabel({ view, seat }: { view: AvalonPublicState; seat: number }) {
  return <b>{view.seats[seat]?.name ?? `Seat ${seat}`}</b>;
}

function QuestHistory({ view }: { view: AvalonPublicState }) {
  return (
    <div>
      <p className={styles.subtitle} style={{ marginBottom: 6 }}>
        Quest history
      </p>
      <div className={styles.questHistory}>
        {view.questHistory.map((q) => (
          <div key={q.questNumber} className={styles.questHistoryRow}>
            <span>Quest {q.questNumber}</span>
            <span>
              Team:{' '}
              {q.team
                .map((s) => view.seats[s]?.name ?? `Seat ${s}`)
                .join(', ')}
            </span>
            <span
              style={{
                color: q.result === 'success' ? '#60a5fa' : '#f87171',
                fontWeight: 700,
              }}
            >
              {q.result === 'success' ? 'Success' : `Fail (${q.failCount})`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { AvalonGameView as default };
