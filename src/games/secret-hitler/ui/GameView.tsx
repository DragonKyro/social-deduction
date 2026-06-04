import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { ShAction } from '../actions';
import type {
  ShExecutivePower,
  ShPolicy,
  ShPublicSeatState,
  ShPublicState,
  ShRoleId,
} from '../state';
import {
  ELECTION_TRACKER_MAX,
  FASCIST_TRACK_LENGTH,
  HITLER_CHANCELLOR_THRESHOLD,
  LIBERAL_TRACK_LENGTH,
} from '../tracks';
import styles from './GameView.module.css';

// ============================================================================
// Secret Hitler — game view
//
// Hot-seat capable. We rotate the local seat through the device for any
// action whose author isn't the local seat. The cover-screen pattern is the
// same one Avalon uses.
// ============================================================================

export function SecretHitlerGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);

  if (!publicView) return null;
  const view = publicView.view as ShPublicState;

  const dispatchAction = (a: ShAction) => dispatch(a);
  const rotateSeat = (seat: number) => setLocalSeat(seat);

  return (
    <div className={styles.root}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h2 className={styles.title}>Secret Hitler</h2>
          <p className={styles.subtitle}>
            President: <b>{seatName(view, view.presidentSeat)}</b>
            {view.chancellorCandidateSeat !== null && (
              <>
                {' '}· Chancellor candidate: <b>{seatName(view, view.chancellorCandidateSeat)}</b>
              </>
            )}
            {view.inSpecialElection && (
              <span style={{ marginLeft: 8, color: '#fbbf24' }}>· special election</span>
            )}
          </p>
        </div>
        <button onClick={exitGame}>Exit</button>
      </header>

      <BoardsRow view={view} />

      <PhasePanel
        view={view}
        localSeat={localSeat}
        dispatch={dispatchAction}
        rotateSeat={rotateSeat}
      />

      <SeatRoster view={view} localSeat={localSeat} />

      <RecentLog view={view} />
    </div>
  );
}

// ============================================================================
// Boards
// ============================================================================

function BoardsRow({ view }: { view: ShPublicState }) {
  return (
    <div>
      <div className={styles.boards}>
        <BoardCard
          kind="liberal"
          name="Liberal Articles"
          enacted={view.board.liberalEnacted}
          length={LIBERAL_TRACK_LENGTH}
          powers={Array(LIBERAL_TRACK_LENGTH).fill(null) as (ShExecutivePower | null)[]}
          winSlotIdx={LIBERAL_TRACK_LENGTH - 1}
          winLabel="LIB WIN"
        />
        <BoardCard
          kind="fascist"
          name="Fascist Articles"
          enacted={view.board.fascistEnacted}
          length={FASCIST_TRACK_LENGTH}
          powers={[...view.trackPowers, null]}
          winSlotIdx={FASCIST_TRACK_LENGTH - 1}
          winLabel="FASCIST WIN"
          thresholdMarker={HITLER_CHANCELLOR_THRESHOLD}
        />
      </div>
      <div className={styles.electionMeter}>
        <span className={styles.subtitle}>
          Election tracker {view.board.electionTracker} / {ELECTION_TRACKER_MAX}
        </span>
        <div className={styles.electionDots}>
          {Array.from({ length: ELECTION_TRACKER_MAX }, (_, i) => (
            <div
              key={i}
              className={`${styles.electionDot} ${i < view.board.electionTracker ? styles.filled : ''}`}
            />
          ))}
        </div>
        <span className={styles.subtitle}>
          · Deck {view.policyDeckSize} · Discard {view.policyDiscardSize}
          {view.board.vetoUnlocked && ' · veto unlocked'}
        </span>
      </div>
    </div>
  );
}

function BoardCard({
  kind,
  name,
  enacted,
  length,
  powers,
  winSlotIdx,
  winLabel,
  thresholdMarker,
}: {
  kind: 'liberal' | 'fascist';
  name: string;
  enacted: number;
  length: number;
  powers: (ShExecutivePower | null)[];
  winSlotIdx: number;
  winLabel: string;
  thresholdMarker?: number;
}) {
  return (
    <div className={`${styles.boardCard} ${styles[kind]}`}>
      <div className={styles.boardHeader}>
        <span className={styles.boardName}>{name}</span>
        <span className={styles.subtitle}>
          {enacted} / {length}
        </span>
      </div>
      <div className={styles.boardTrack}>
        {Array.from({ length }, (_, i) => {
          const lit = i < enacted;
          const power = powers[i] ?? null;
          const isWin = i === winSlotIdx;
          const isThreshold = thresholdMarker !== undefined && i === thresholdMarker - 1;
          return (
            <div
              key={i}
              className={[
                styles.boardSlot,
                lit && styles.lit,
                lit && styles[kind],
                isWin && styles.win,
              ]
                .filter(Boolean)
                .join(' ')}
              title={
                isThreshold
                  ? 'Hitler-elected loss enabled at 3+ fascist policies'
                  : undefined
              }
            >
              {isWin && (
                <span className={styles.boardSlotPower} style={{ color: '#fbbf24' }}>
                  {winLabel}
                </span>
              )}
              {!isWin && power && (
                <span className={styles.boardSlotPower}>{shortPowerName(power)}</span>
              )}
              {!isWin && !power && isThreshold && (
                <span className={styles.boardSlotPower}>HITLER WIN</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function shortPowerName(p: ShExecutivePower): string {
  switch (p) {
    case 'investigate':
      return 'INVEST.';
    case 'specialElection':
      return 'SPEC. EL.';
    case 'peekTop3':
      return 'PEEK';
    case 'execute':
      return 'KILL';
  }
}

// ============================================================================
// Phase router
// ============================================================================

function PhasePanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: ShPublicState;
  localSeat: number | null;
  dispatch: (a: ShAction) => void;
  rotateSeat: (s: number) => void;
}) {
  switch (view.phase) {
    case 'setup':
      return <RoleRevealScreen view={view} dispatch={dispatch} rotateSeat={rotateSeat} />;
    case 'nomination':
      return (
        <NominationPanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'electionVote':
      return (
        <ElectionVotePanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'electionReveal':
      return <ElectionRevealPanel view={view} dispatch={dispatch} />;
    case 'legislativePresident':
      return (
        <LegislativePresidentPanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'legislativeChancellor':
      return (
        <LegislativeChancellorPanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'vetoRequested':
      return (
        <VetoRequestedPanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'policyReveal':
      return <PolicyRevealPanel view={view} dispatch={dispatch} />;
    case 'topDeckReveal':
      return <TopDeckRevealPanel view={view} dispatch={dispatch} />;
    case 'execInvestigate':
      return (
        <ExecInvestigatePanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'execInvestigateReveal':
      return (
        <ExecInvestigateRevealPanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'execSpecialElection':
      return (
        <ExecSpecialElectionPanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'execPeek':
      return (
        <ExecPeekPanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'execExecute':
      return (
        <ExecExecutePanel
          view={view}
          localSeat={localSeat}
          dispatch={dispatch}
          rotateSeat={rotateSeat}
        />
      );
    case 'gameOver':
      return <GameOverPanel view={view} />;
  }
}

// ============================================================================
// Setup — role reveal
// ============================================================================

function RoleRevealScreen({
  view,
  dispatch,
  rotateSeat,
}: {
  view: ShPublicState;
  dispatch: (a: ShAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const nextUnacked = view.seats.find((s) => !s.hasAckedSetup);
  const [covered, setCovered] = useState(true);
  if (!nextUnacked) {
    return (
      <div className={styles.panel}>
        <p>Everyone has seen their role. Starting…</p>
      </div>
    );
  }
  const seatIdx = nextUnacked.index;
  const needsRotate = view.yourSeat !== seatIdx;

  if (needsRotate || covered) {
    return (
      <div className={styles.coverScreen}>
        <div className={styles.coverInner}>
          <h2>Pass the device</h2>
          <p>
            It&apos;s <b>{nextUnacked.name}</b>&apos;s turn to look at their role.
          </p>
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

  const role = view.yourRole;
  const party = view.yourParty;
  if (!role || !party) {
    return <div className={styles.panel}>Loading role…</div>;
  }
  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>You are</p>
      <h2 className={styles.roleName}>{roleName(role)}</h2>
      <span className={`${styles.roleParty} ${styles[party]}`}>{partyLabel(party)}</span>
      <p style={{ maxWidth: 460, lineHeight: 1.5, color: '#cbd5e1' }}>
        {roleDescription(role)}
      </p>
      {view.yourPartyKnowledge.length > 0 && (
        <div style={{ width: '100%', maxWidth: 360 }}>
          <p
            style={{
              margin: '8px 0',
              color: '#94a3b8',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            You see:
          </p>
          <div className={styles.knownList}>
            {view.yourPartyKnowledge.map((k) => (
              <div key={k.seat} className={styles.knownItem}>
                <span>{seatName(view, k.seat)}</span>
                <span style={{ color: '#f87171', fontSize: 12 }}>
                  {k.role === 'hitler' ? 'Hitler' : 'Fascist'}
                </span>
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

function roleName(role: ShRoleId): string {
  switch (role) {
    case 'liberal':
      return 'Liberal';
    case 'fascist':
      return 'Fascist';
    case 'hitler':
      return 'Hitler';
  }
}

function partyLabel(party: 'liberal' | 'fascist'): string {
  return party === 'liberal' ? 'Liberal Party' : 'Fascist Party';
}

function roleDescription(role: ShRoleId): string {
  switch (role) {
    case 'liberal':
      return 'Enact 5 liberal policies, or have the president execute Hitler. You know nothing at the start.';
    case 'fascist':
      return 'Enact 6 fascist policies, or get Hitler elected chancellor after 3 fascist policies. You know Hitler and the other fascists.';
    case 'hitler':
      return 'You are part of the fascist team. Cosy up to liberals — they need to think you are one. At 3+ fascist policies, getting elected chancellor wins the game for fascists.';
  }
}

// ============================================================================
// Nomination
// ============================================================================

function NominationPanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: ShPublicState;
  localSeat: number | null;
  dispatch: (a: ShAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const isPresident = localSeat === view.presidentSeat;
  const [pick, setPick] = useState<number | null>(null);

  // Term-limited seats can't be chancellor candidates.
  const aliveCount = view.seats.filter((s) => s.alive).length;
  const limited = new Set<number>();
  if (view.lastElectedChancellor !== null) limited.add(view.lastElectedChancellor);
  if (aliveCount > 5 && view.lastElectedPresident !== null)
    limited.add(view.lastElectedPresident);

  if (!isPresident) {
    const presidentName = seatName(view, view.presidentSeat);
    return (
      <div className={styles.panel}>
        <p style={{ margin: 0 }}>
          Waiting for <b>{presidentName}</b> to nominate a chancellor.
        </p>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => rotateSeat(view.presidentSeat)}>
            Pass device to {presidentName}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>Nominate a chancellor</h3>
      <p className={styles.subtitle}>
        Pick any alive player who isn&apos;t you or the last elected chancellor
        {aliveCount > 5 ? ' or last elected president' : ''}.
      </p>
      <div className={styles.seatGrid} style={{ marginTop: 12 }}>
        {view.seats.map((s) => {
          const ineligible =
            !s.alive || s.index === view.presidentSeat || limited.has(s.index);
          return (
            <SeatCard
              key={s.index}
              view={view}
              seat={s}
              isLocal={s.index === localSeat}
              selectable={!ineligible}
              selected={pick === s.index}
              onClick={() => !ineligible && setPick(s.index)}
            />
          );
        })}
      </div>
      <div className={styles.actions} style={{ marginTop: 16 }}>
        <button
          className={styles.primary}
          disabled={pick === null}
          onClick={() =>
            pick !== null &&
            dispatch({
              type: 'nominateChancellor',
              bySeat: view.presidentSeat,
              chancellor: pick,
            })
          }
        >
          Nominate {pick !== null ? seatName(view, pick) : '…'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Election vote — hot-seat ja/nein
// ============================================================================

function ElectionVotePanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: ShPublicState;
  localSeat: number | null;
  dispatch: (a: ShAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const [doneSeats, setDoneSeats] = useState<Set<number>>(new Set());
  const [covered, setCovered] = useState(true);
  const alive = view.seats.filter((s) => s.alive);
  const nextSeat = alive.find((s) => !doneSeats.has(s.index));
  if (!nextSeat) {
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
          <h2>Vote on the government</h2>
          <GovernmentSummary view={view} />
          <p>
            It&apos;s <b>{nextSeat.name}</b>&apos;s turn to vote.
          </p>
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

  const submit = (vote: 'ja' | 'nein') => {
    dispatch({ type: 'castVote', bySeat: seatIdx, vote });
    setDoneSeats((cur) => new Set(cur).add(seatIdx));
    setCovered(true);
  };

  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
        Your vote, <b>{nextSeat.name}</b>
      </p>
      <GovernmentSummary view={view} />
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button className={styles.success} onClick={() => submit('ja')}>
          Ja!
        </button>
        <button className={styles.danger} onClick={() => submit('nein')}>
          Nein!
        </button>
      </div>
    </div>
  );
}

function GovernmentSummary({ view }: { view: ShPublicState }) {
  return (
    <div>
      <p
        style={{
          margin: '0 0 6px',
          color: '#94a3b8',
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        Proposed government
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <span style={{ padding: '4px 10px', background: '#1f2937', border: '1px solid #fbbf24', borderRadius: 999, fontSize: 13 }}>
          President: <b>{seatName(view, view.presidentSeat)}</b>
        </span>
        {view.chancellorCandidateSeat !== null && (
          <span style={{ padding: '4px 10px', background: '#1f2937', border: '1px solid #38bdf8', borderRadius: 999, fontSize: 13 }}>
            Chancellor: <b>{seatName(view, view.chancellorCandidateSeat)}</b>
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Election reveal
// ============================================================================

function ElectionRevealPanel({
  view,
  dispatch,
}: {
  view: ShPublicState;
  dispatch: (a: ShAction) => void;
}) {
  const ja = view.seats.filter((s) => s.alive && s.voteCast === 'ja').length;
  const nein = view.seats.filter((s) => s.alive && s.voteCast === 'nein').length;
  const approved = ja > nein;
  const firstAlive = view.seats.find((s) => s.alive)?.index ?? 0;
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>
        Government {approved ? 'APPROVED' : 'REJECTED'} (Ja {ja} – Nein {nein})
      </h3>
      <p className={styles.subtitle}>
        {approved
          ? 'The president will draw 3 policies.'
          : `Tracker advances. ${ELECTION_TRACKER_MAX - view.board.electionTracker - 1} more rejections force a top-deck enact.`}
      </p>
      <div className={styles.seatGrid} style={{ marginTop: 12 }}>
        {view.seats.map((s) => (
          <SeatCard key={s.index} view={view} seat={s} isLocal={false} />
        ))}
      </div>
      <div className={styles.actions} style={{ marginTop: 16 }}>
        <button
          className={styles.primary}
          onClick={() => dispatch({ type: 'ackElectionReveal', bySeat: firstAlive })}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Legislative — president
// ============================================================================

function LegislativePresidentPanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: ShPublicState;
  localSeat: number | null;
  dispatch: (a: ShAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const isPresident = localSeat === view.presidentSeat;
  const [covered, setCovered] = useState(true);
  const [pick, setPick] = useState<number | null>(null);
  const hand = view.yourLegislativeHand;

  if (!isPresident || covered || !hand) {
    return (
      <div className={styles.coverScreen}>
        <div className={styles.coverInner}>
          <h2>Pass the device</h2>
          <p>
            <b>{seatName(view, view.presidentSeat)}</b> draws 3 policies. Pass them the
            device — chancellor and everyone else should look away.
          </p>
          <button
            className={styles.primary}
            onClick={() => {
              if (!isPresident) rotateSeat(view.presidentSeat);
              setCovered(false);
            }}
          >
            I am {seatName(view, view.presidentSeat)} — show me the cards
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <h3 style={{ marginTop: 0 }}>Discard one — pass the other two to the chancellor</h3>
      <div className={styles.cardRow}>
        {hand.map((p, i) => (
          <PolicyCardButton
            key={i}
            policy={p}
            selected={pick === i}
            onClick={() => setPick(i)}
          />
        ))}
      </div>
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button
          className={styles.danger}
          disabled={pick === null}
          onClick={() => {
            if (pick === null) return;
            dispatch({
              type: 'presidentDiscard',
              bySeat: view.presidentSeat,
              discardIndex: pick as 0 | 1 | 2,
            });
            setCovered(true);
            setPick(null);
          }}
        >
          Discard selected
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Legislative — chancellor
// ============================================================================

function LegislativeChancellorPanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: ShPublicState;
  localSeat: number | null;
  dispatch: (a: ShAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const chancellor = view.chancellorCandidateSeat;
  const isChancellor = chancellor !== null && localSeat === chancellor;
  const [covered, setCovered] = useState(true);
  const [pick, setPick] = useState<number | null>(null);
  const hand = view.yourLegislativeHand;

  if (!chancellor || !isChancellor || covered || !hand) {
    return (
      <div className={styles.coverScreen}>
        <div className={styles.coverInner}>
          <h2>Pass to the chancellor</h2>
          <p>
            <b>{chancellor !== null ? seatName(view, chancellor) : '(none)'}</b> will enact
            one of two policies. Everyone else should look away.
          </p>
          <button
            className={styles.primary}
            onClick={() => {
              if (!isChancellor && chancellor !== null) rotateSeat(chancellor);
              setCovered(false);
            }}
          >
            I am {chancellor !== null ? seatName(view, chancellor) : '(seat)'} — show me the cards
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <h3 style={{ marginTop: 0 }}>Enact one policy</h3>
      <div className={styles.cardRow}>
        {hand.map((p, i) => (
          <PolicyCardButton
            key={i}
            policy={p}
            selected={pick === i}
            onClick={() => setPick(i)}
          />
        ))}
      </div>
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button
          className={styles.primary}
          disabled={pick === null}
          onClick={() => {
            if (pick === null) return;
            dispatch({
              type: 'chancellorEnact',
              bySeat: chancellor,
              enactIndex: pick as 0 | 1,
            });
            setCovered(true);
            setPick(null);
          }}
        >
          Enact selected
        </button>
        {view.board.vetoUnlocked && (
          <button
            className={styles.danger}
            onClick={() => {
              dispatch({ type: 'chancellorRequestVeto', bySeat: chancellor });
              setCovered(true);
              setPick(null);
            }}
          >
            Request veto
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Veto request — president responds
// ============================================================================

function VetoRequestedPanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: ShPublicState;
  localSeat: number | null;
  dispatch: (a: ShAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const isPresident = localSeat === view.presidentSeat;
  if (!isPresident) {
    return (
      <div className={styles.panel}>
        <p style={{ margin: 0 }}>
          <b>{seatName(view, view.chancellorCandidateSeat ?? view.presidentSeat)}</b> has requested a veto. Waiting for the president{' '}
          <b>{seatName(view, view.presidentSeat)}</b>.
        </p>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => rotateSeat(view.presidentSeat)}>
            Pass device to {seatName(view, view.presidentSeat)}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>Veto requested</h3>
      <p className={styles.subtitle}>
        The chancellor wants to veto both remaining policies. If you accept, both go to
        discard and the election tracker advances.
      </p>
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button
          className={styles.success}
          onClick={() =>
            dispatch({
              type: 'presidentRespondVeto',
              bySeat: view.presidentSeat,
              accept: true,
            })
          }
        >
          Accept veto
        </button>
        <button
          className={styles.danger}
          onClick={() =>
            dispatch({
              type: 'presidentRespondVeto',
              bySeat: view.presidentSeat,
              accept: false,
            })
          }
        >
          Reject — chancellor must enact
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Policy reveal
// ============================================================================

function PolicyRevealPanel({
  view,
  dispatch,
}: {
  view: ShPublicState;
  dispatch: (a: ShAction) => void;
}) {
  const policy = view.lastEnactedPolicy ?? 'liberal';
  const firstAlive = view.seats.find((s) => s.alive)?.index ?? 0;
  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <h3 style={{ marginTop: 0 }}>Policy enacted</h3>
      <div className={styles.cardRow}>
        <div className={`${styles.policyCard} ${styles.passive} ${policy === 'liberal' ? styles.policyLiberal : styles.policyFascist}`}>
          <span className={styles.policyCardLabel}>{policy === 'liberal' ? 'Liberal' : 'Fascist'}</span>
        </div>
      </div>
      {view.pendingExec && (
        <p className={styles.subtitle} style={{ marginTop: 8 }}>
          Next: <b>{powerLongName(view.pendingExec)}</b> — president acts.
        </p>
      )}
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button
          className={styles.primary}
          onClick={() => dispatch({ type: 'ackPolicyReveal', bySeat: firstAlive })}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function TopDeckRevealPanel({
  view,
  dispatch,
}: {
  view: ShPublicState;
  dispatch: (a: ShAction) => void;
}) {
  const policy = view.lastEnactedPolicy ?? 'liberal';
  const firstAlive = view.seats.find((s) => s.alive)?.index ?? 0;
  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <h3 style={{ marginTop: 0 }}>Top-deck force enact</h3>
      <p className={styles.subtitle}>
        The election tracker maxed out. The top card of the deck has been enacted — no
        powers trigger, and term limits reset for next round.
      </p>
      <div className={styles.cardRow}>
        <div className={`${styles.policyCard} ${styles.passive} ${policy === 'liberal' ? styles.policyLiberal : styles.policyFascist}`}>
          <span className={styles.policyCardLabel}>{policy === 'liberal' ? 'Liberal' : 'Fascist'}</span>
        </div>
      </div>
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button
          className={styles.primary}
          onClick={() => dispatch({ type: 'ackTopDeckReveal', bySeat: firstAlive })}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function powerLongName(p: ShExecutivePower): string {
  switch (p) {
    case 'investigate':
      return 'Investigate Loyalty';
    case 'specialElection':
      return 'Call Special Election';
    case 'peekTop3':
      return 'Policy Peek';
    case 'execute':
      return 'Execution';
  }
}

// ============================================================================
// Executive — investigate
// ============================================================================

function ExecInvestigatePanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: ShPublicState;
  localSeat: number | null;
  dispatch: (a: ShAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const isPresident = localSeat === view.presidentSeat;
  const [pick, setPick] = useState<number | null>(null);
  if (!isPresident) {
    return (
      <PassToPresidentScreen
        view={view}
        rotateSeat={rotateSeat}
        msg="will privately investigate one player's loyalty."
      />
    );
  }
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>Investigate a player</h3>
      <p className={styles.subtitle}>
        Pick a seat that hasn&apos;t been investigated yet (other than yourself). You will
        secretly see their party membership. Hitler reads as Fascist.
      </p>
      <div className={styles.seatGrid} style={{ marginTop: 12 }}>
        {view.seats.map((s) => {
          const ineligible =
            !s.alive || s.index === view.presidentSeat || isInvestigated(view, s.index);
          return (
            <SeatCard
              key={s.index}
              view={view}
              seat={s}
              isLocal={s.index === localSeat}
              selectable={!ineligible}
              selected={pick === s.index}
              onClick={() => !ineligible && setPick(s.index)}
            />
          );
        })}
      </div>
      <div className={styles.actions} style={{ marginTop: 16 }}>
        <button
          className={styles.primary}
          disabled={pick === null}
          onClick={() =>
            pick !== null &&
            dispatch({
              type: 'execInvestigate',
              bySeat: view.presidentSeat,
              target: pick,
            })
          }
        >
          Investigate {pick !== null ? seatName(view, pick) : '…'}
        </button>
      </div>
    </div>
  );
}

// Best-effort: a seat is "investigated" if any seat (any investigator) has
// flagged them. We don't have full investigation visibility here; the host
// rejects re-investigations server-side. For UI clarity we check our own
// list and rely on the host rule.
function isInvestigated(view: ShPublicState, seat: number): boolean {
  return view.yourInvestigations.some((inv) => inv.target === seat);
}

function ExecInvestigateRevealPanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: ShPublicState;
  localSeat: number | null;
  dispatch: (a: ShAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const isPresident = localSeat === view.presidentSeat;
  const [covered, setCovered] = useState(true);
  const result = view.yourPendingInvestigationResult;
  if (!isPresident || covered || !result) {
    return (
      <div className={styles.coverScreen}>
        <div className={styles.coverInner}>
          <h2>Investigation result — president only</h2>
          <p>
            Pass the device to <b>{seatName(view, view.presidentSeat)}</b>. Everyone else
            should look away.
          </p>
          <button
            className={styles.primary}
            onClick={() => {
              if (!isPresident) rotateSeat(view.presidentSeat);
              setCovered(false);
            }}
          >
            I am {seatName(view, view.presidentSeat)} — show me the result
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <h3 style={{ marginTop: 0 }}>
        {seatName(view, result.target)} is a{' '}
        <span className={`${styles.roleParty} ${styles[result.party]}`}>
          {partyLabel(result.party)}
        </span>
      </h3>
      <p className={styles.subtitle}>
        (You can claim whatever you want at the table. They show you the truth — the
        table only knows you used the power on this seat.)
      </p>
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button
          className={styles.primary}
          onClick={() => {
            dispatch({ type: 'ackInvestigateReveal', bySeat: view.presidentSeat });
            setCovered(true);
          }}
        >
          I&apos;ve seen it — continue
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Executive — special election
// ============================================================================

function ExecSpecialElectionPanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: ShPublicState;
  localSeat: number | null;
  dispatch: (a: ShAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const isPresident = localSeat === view.presidentSeat;
  const [pick, setPick] = useState<number | null>(null);
  if (!isPresident) {
    return (
      <PassToPresidentScreen
        view={view}
        rotateSeat={rotateSeat}
        msg="will pick the next president for one round."
      />
    );
  }
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>Call a special election</h3>
      <p className={styles.subtitle}>
        Pick any alive player (other than yourself) to become president for the next
        round. Regular rotation resumes the round after.
      </p>
      <div className={styles.seatGrid} style={{ marginTop: 12 }}>
        {view.seats.map((s) => {
          const ineligible = !s.alive || s.index === view.presidentSeat;
          return (
            <SeatCard
              key={s.index}
              view={view}
              seat={s}
              isLocal={s.index === localSeat}
              selectable={!ineligible}
              selected={pick === s.index}
              onClick={() => !ineligible && setPick(s.index)}
            />
          );
        })}
      </div>
      <div className={styles.actions} style={{ marginTop: 16 }}>
        <button
          className={styles.primary}
          disabled={pick === null}
          onClick={() =>
            pick !== null &&
            dispatch({
              type: 'execSpecialElection',
              bySeat: view.presidentSeat,
              nextPresident: pick,
            })
          }
        >
          Pass presidency to {pick !== null ? seatName(view, pick) : '…'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Executive — peek top 3
// ============================================================================

function ExecPeekPanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: ShPublicState;
  localSeat: number | null;
  dispatch: (a: ShAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const isPresident = localSeat === view.presidentSeat;
  const [covered, setCovered] = useState(true);
  const peek = view.yourPeek;
  if (!isPresident || covered || !peek) {
    return (
      <PassToPresidentScreen
        view={view}
        rotateSeat={rotateSeat}
        msg="will privately peek at the next 3 policies."
        onUncover={() => setCovered(false)}
      />
    );
  }
  return (
    <div className={`${styles.panel} ${styles.roleReveal}`}>
      <h3 style={{ marginTop: 0 }}>The next 3 policies (top first)</h3>
      <div className={styles.cardRow}>
        {peek.map((p, i) => (
          <div
            key={i}
            className={`${styles.policyCard} ${styles.passive} ${
              p === 'liberal' ? styles.policyLiberal : styles.policyFascist
            }`}
          >
            <span className={styles.policyCardLabel}>
              {i + 1}. {p === 'liberal' ? 'Liberal' : 'Fascist'}
            </span>
          </div>
        ))}
      </div>
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button
          className={styles.primary}
          onClick={() => {
            dispatch({ type: 'ackPeek', bySeat: view.presidentSeat });
            setCovered(true);
          }}
        >
          I&apos;ve memorised them — continue
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Executive — execute
// ============================================================================

function ExecExecutePanel({
  view,
  localSeat,
  dispatch,
  rotateSeat,
}: {
  view: ShPublicState;
  localSeat: number | null;
  dispatch: (a: ShAction) => void;
  rotateSeat: (s: number) => void;
}) {
  const isPresident = localSeat === view.presidentSeat;
  const [pick, setPick] = useState<number | null>(null);
  if (!isPresident) {
    return (
      <PassToPresidentScreen
        view={view}
        rotateSeat={rotateSeat}
        msg="must execute a player. (Hitler dead = liberal win.)"
      />
    );
  }
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>Execute a player</h3>
      <p className={styles.subtitle}>
        Pick any alive player. They are dead and skip all future turns. If they were
        Hitler, liberals win immediately.
      </p>
      <div className={styles.seatGrid} style={{ marginTop: 12 }}>
        {view.seats.map((s) => {
          const ineligible = !s.alive || s.index === view.presidentSeat;
          return (
            <SeatCard
              key={s.index}
              view={view}
              seat={s}
              isLocal={s.index === localSeat}
              selectable={!ineligible}
              selected={pick === s.index}
              onClick={() => !ineligible && setPick(s.index)}
            />
          );
        })}
      </div>
      <div className={styles.actions} style={{ marginTop: 16 }}>
        <button
          className={styles.danger}
          disabled={pick === null}
          onClick={() =>
            pick !== null &&
            dispatch({
              type: 'execExecute',
              bySeat: view.presidentSeat,
              target: pick,
            })
          }
        >
          Execute {pick !== null ? seatName(view, pick) : '…'}
        </button>
      </div>
    </div>
  );
}

function PassToPresidentScreen({
  view,
  rotateSeat,
  msg,
  onUncover,
}: {
  view: ShPublicState;
  rotateSeat: (s: number) => void;
  msg: string;
  onUncover?: () => void;
}) {
  return (
    <div className={styles.coverScreen}>
      <div className={styles.coverInner}>
        <h2>Pass the device to the president</h2>
        <p>
          <b>{seatName(view, view.presidentSeat)}</b> {msg}
        </p>
        <button
          className={styles.primary}
          onClick={() => {
            rotateSeat(view.presidentSeat);
            onUncover?.();
          }}
        >
          I am {seatName(view, view.presidentSeat)} — continue
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Game over
// ============================================================================

function GameOverPanel({ view }: { view: ShPublicState }) {
  const winner = view.winnerTeam ?? 'liberal';
  return (
    <div className={styles.panel}>
      <div className={`${styles.gameOverBanner} ${styles[winner]}`}>
        {winner === 'liberal' ? '⚜ Liberals Win' : '☠ Fascists Win'}
      </div>
      <p style={{ textAlign: 'center', marginTop: 12 }}>{winReasonText(view)}</p>
      <div className={styles.seatGrid} style={{ marginTop: 16 }}>
        {view.seats.map((s) => (
          <SeatCard key={s.index} view={view} seat={s} isLocal={false} />
        ))}
      </div>
    </div>
  );
}

function winReasonText(view: ShPublicState): string {
  switch (view.winReason) {
    case 'liberalTrack':
      return 'Five liberal policies enacted — democracy prevails.';
    case 'fascistTrack':
      return 'Six fascist policies enacted — the fascists seize control.';
    case 'hitlerElected':
      return 'Hitler was elected chancellor after 3 fascist policies — instant fascist win.';
    case 'hitlerExecuted':
      return 'The president executed Hitler — liberals win.';
    default:
      return '';
  }
}

// ============================================================================
// Shared bits
// ============================================================================

function SeatRoster({ view, localSeat }: { view: ShPublicState; localSeat: number | null }) {
  return (
    <div>
      <p className={styles.subtitle} style={{ marginBottom: 6 }}>
        Players
      </p>
      <div className={styles.seatGrid}>
        {view.seats.map((s) => (
          <SeatCard key={s.index} view={view} seat={s} isLocal={s.index === localSeat} />
        ))}
      </div>
    </div>
  );
}

function SeatCard({
  view,
  seat,
  isLocal,
  selectable,
  selected,
  onClick,
}: {
  view: ShPublicState;
  seat: ShPublicSeatState;
  isLocal: boolean;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const isPres = seat.index === view.presidentSeat;
  const isChan = seat.index === view.chancellorCandidateSeat;
  const investigated = view.yourInvestigations.find((i) => i.target === seat.index);
  const cls = [
    styles.seat,
    selectable && styles.selectable,
    selected && styles.selected,
    isPres && styles.president,
    isChan && styles.chancellor,
    isLocal && styles.you,
    !seat.alive && styles.dead,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} onClick={onClick}>
      <div className={styles.seatAvatar}>{seat.name.slice(0, 1).toUpperCase()}</div>
      <div>
        <div className={styles.seatName}>
          {seat.name}
          {isLocal && <span style={{ color: '#60a5fa', fontSize: 11, marginLeft: 6 }}>(you)</span>}
        </div>
        <div className={styles.seatMeta}>
          {isPres && <span className={`${styles.seatTag} ${styles.president}`}>Pres</span>}
          {isChan && <span className={`${styles.seatTag} ${styles.chancellor}`}>Chan</span>}
          {!seat.alive && <span className={`${styles.seatTag} ${styles.dead}`}>Dead</span>}
          {investigated && (
            <span
              className={`${styles.seatTag} ${
                investigated.party === 'liberal'
                  ? styles.investigatedLib
                  : styles.investigatedFasc
              }`}
              title="You investigated this seat"
            >
              {investigated.party === 'liberal' ? 'Lib (you)' : 'Fasc (you)'}
            </span>
          )}
          {seat.voteCast !== null && (
            <span
              className={`${styles.seatTag} ${styles.vote} ${
                seat.voteCast === 'ja' ? styles.ja : styles.nein
              }`}
            >
              {seat.voteCast === 'ja' ? 'Ja' : 'Nein'}
            </span>
          )}
          {seat.revealedRole && (
            <span
              className={`${styles.seatTag} ${
                seat.revealedRole === 'liberal'
                  ? styles.investigatedLib
                  : styles.investigatedFasc
              }`}
            >
              {roleName(seat.revealedRole)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PolicyCardButton({
  policy,
  selected,
  onClick,
}: {
  policy: ShPolicy;
  selected: boolean;
  onClick: () => void;
}) {
  const cls = [
    styles.policyCard,
    selected && styles.selected,
    policy === 'liberal' ? styles.policyLiberal : styles.policyFascist,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} onClick={onClick}>
      <span className={styles.policyCardLabel}>
        {policy === 'liberal' ? 'Liberal' : 'Fascist'}
      </span>
    </div>
  );
}

function RecentLog({ view }: { view: ShPublicState }) {
  if (view.log.length === 0) return null;
  const last = view.log.slice(-8).reverse();
  return (
    <div>
      <p className={styles.subtitle} style={{ marginBottom: 6 }}>
        Recent events
      </p>
      <div className={styles.log}>
        {last.map((entry, i) => (
          <div key={i} className={styles.logRow}>
            {formatLog(view, entry)}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatLog(view: ShPublicState, entry: ShPublicState['log'][number]): string {
  switch (entry.kind) {
    case 'roleReveal':
      return 'Roles dealt.';
    case 'electionResult':
      return `Election ${entry.approved ? 'APPROVED' : 'REJECTED'} — Pres ${seatName(view, entry.president)} / Chan ${seatName(view, entry.chancellor)} (Ja ${entry.jaCount} – Nein ${entry.neinCount}).`;
    case 'policyEnacted':
      return `Policy enacted: ${entry.policy === 'liberal' ? 'Liberal' : 'Fascist'} (Pres ${seatName(view, entry.president)} / Chan ${seatName(view, entry.chancellor)}).`;
    case 'topDeckEnacted':
      return `Top-deck enacted: ${entry.policy === 'liberal' ? 'Liberal' : 'Fascist'}.`;
    case 'vetoUsed':
      return `Veto used by Chancellor ${seatName(view, entry.chancellor)} (accepted by Pres ${seatName(view, entry.president)}).`;
    case 'execution':
      return `Pres ${seatName(view, entry.by)} executed ${seatName(view, entry.target)}.`;
    case 'investigation':
      return `Pres ${seatName(view, entry.by)} investigated ${seatName(view, entry.target)}.`;
    case 'specialElection':
      return `Pres ${seatName(view, entry.by)} called special election → ${seatName(view, entry.nextPresident)}.`;
    case 'peek':
      return `Pres ${seatName(view, entry.by)} peeked at the next 3 policies.`;
    case 'gameOver':
      return `Game over: ${entry.winner === 'liberal' ? 'Liberals' : 'Fascists'} win.`;
  }
}

function seatName(view: ShPublicState, seat: number): string {
  return view.seats[seat]?.name ?? `Seat ${seat}`;
}

export { SecretHitlerGameView as default };
