import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SeatIndex } from '@/engine/types';
import { FlipCard } from '@/ui/shared/FlipCard';
import { useGameStore, useSeatSwitching } from '@/store/gameStore';
import type { AvalonAction } from '../actions';
import { MAX_REJECTED_PROPOSALS } from '../quest-tracks';
import { ROLES } from '../roles';
import type { AvalonPublicState, AvalonRoleId } from '../state';
import { QuestBoard } from './QuestBoard';
import { RoleArt, RoleCardBack, RoleCardFace } from './RoleArt';
import { RoundTable, type TableMode } from './RoundTable';
import { DaggerIcon, QuestCardBack, QuestCardFace, SeatShield, VoteTokenFace } from './Tokens';
import { endReason, nextLocalActor, questRevealOrder, roman } from './turns';
import styles from './GameView.module.css';

// ============================================================================
// Avalon game view
//
// Works the same for every way of playing, driven only by the public view:
//   - online: you act only for your own seat (seat switching disabled);
//   - solo vs AI: one human seat, AI seats act on their own;
//   - hot-seat (several humans, one device): whenever the next seat that owes
//     an action isn't the one on screen, an opaque "pass the device" cover
//     goes up; secrets (role card, knowledge, your vote, Fail button) are only
//     shown after that player confirms, and are locked again after they act.
// Seat switching only ever goes through `useSeatSwitching()`.
// ============================================================================

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function AvalonGameView() {
  const publicView = useGameStore((s) => s.publicView);
  if (!publicView) return null;
  return <AvalonTable view={publicView.view as AvalonPublicState} />;
}

function AvalonTable({ view }: { view: AvalonPublicState }) {
  const localSeat = useGameStore((s) => s.localSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);
  const isHost = useGameStore((s) => s.isHost);
  const aiSeats = useGameStore((s) => s.aiSeats);
  const { enabled: switching, canView, setLocalSeat } = useSeatSwitching();

  const mayAct = (s: SeatIndex) => s === localSeat || (switching && canView(s));
  const humanSeats = switching ? view.seats.map((s) => s.index).filter(canView) : [];
  const multiHuman = humanSeats.length > 1;

  // Hot-seat privacy: whose secrets are currently uncovered on this screen.
  const [unlockedFor, setUnlockedFor] = useState<SeatIndex | null>(null);
  const [coverTarget, setCoverTarget] = useState<SeatIndex | null>(null);
  const secretsOpen = !multiHuman || (unlockedFor !== null && unlockedFor === localSeat);
  // The side role card: face-up by default on a private screen; in hot-seat
  // it starts face-down for every newly uncovered player.
  const [cardUp, setCardUp] = useState(!multiHuman);
  useEffect(() => {
    setCardUp(!multiHuman);
  }, [multiHuman, unlockedFor, localSeat]);

  const actor = nextLocalActor(view, localSeat, mayAct);
  const autoCover = multiHuman && actor !== null && (actor !== localSeat || !secretsOpen);
  const cover = coverTarget ?? (autoCover ? actor : null);

  const uncover = (seat: SeatIndex) => {
    if (seat !== localSeat) setLocalSeat(seat);
    setUnlockedFor(seat);
    setCoverTarget(null);
  };

  const act = (a: AvalonAction) => {
    dispatch(a);
    // Lock secrets again once a hot-seat player has acted (the leader keeps
    // the screen through to their own vote).
    if (multiHuman && a.type !== 'proposeTeam') setUnlockedFor(null);
  };

  // --- staged reveals ------------------------------------------------------
  const [votesRevealed, setVotesRevealed] = useState(false);
  useEffect(() => {
    if (view.phase !== 'teamVoteReveal') {
      setVotesRevealed(false);
      return;
    }
    const t = setTimeout(() => setVotesRevealed(true), prefersReducedMotion() ? 0 : 450);
    return () => clearTimeout(t);
  }, [view.phase, view.proposalHistory.length]);

  const lastQuest = view.questHistory[view.questHistory.length - 1];
  const [questRevealDone, setQuestRevealDone] = useState<number | null>(null);
  const holdQuest =
    view.phase === 'questResolution' && lastQuest && lastQuest.questNumber !== questRevealDone ? lastQuest.questNumber : null;

  const [endRevealDone, setEndRevealDone] = useState(false);
  const revealRoles = view.phase === 'gameOver' && (view.assassinationTarget === null || endRevealDone);

  // --- table picking -------------------------------------------------------
  const [picks, setPicks] = useState<SeatIndex[]>([]);
  useEffect(() => {
    setPicks([]);
  }, [view.phase, view.currentLeaderSeat, view.currentQuestNumber, localSeat]);

  const spec = view.questTrack[view.currentQuestNumber - 1]!;
  const iAmLeaderNow = view.phase === 'teamProposal' && actor === localSeat && localSeat === view.currentLeaderSeat && secretsOpen;
  const iAmAssassinNow = view.phase === 'assassinPick' && secretsOpen && view.yourRole === 'assassin';
  const knownTeammates = new Set(view.yourRoleKnowledge.map((k) => k.seat));
  const mode: TableMode = iAmLeaderNow ? 'pickTeam' : iAmAssassinNow ? 'pickTarget' : 'idle';
  const onPick = (seat: SeatIndex) => {
    if (mode === 'pickTeam') {
      setPicks((cur) => (cur.includes(seat) ? cur.filter((x) => x !== seat) : cur.length < spec.teamSize ? [...cur, seat] : cur));
    } else if (mode === 'pickTarget') {
      setPicks((cur) => (cur[0] === seat ? [] : [seat]));
    }
  };
  const pickDisabled = (seat: SeatIndex) =>
    mode === 'pickTarget' ? seat === localSeat || knownTeammates.has(seat) : false;

  const leaderName = view.seats[view.currentLeaderSeat]?.name ?? '';
  const showKnowledge = secretsOpen && cardUp && localSeat !== null;

  return (
    <div className={styles.root}>
      <div className={`${styles.torch} ${styles.torchLeft}`} aria-hidden />
      <div className={`${styles.torch} ${styles.torchRight}`} aria-hidden />

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Avalon</h1>
          <p className={styles.subtitle}>
            {view.phase === 'gameOver' ? (
              'The tale is told'
            ) : view.phase === 'setup' ? (
              'The knights take their seats'
            ) : view.phase === 'assassinPick' ? (
              'The Assassin draws a blade'
            ) : (
              <>
                Quest {roman(view.currentQuestNumber)} · <b>{leaderName}</b> leads · proposal{' '}
                {Math.min(view.failedProposalsThisQuest + 1, MAX_REJECTED_PROPOSALS)} of {MAX_REJECTED_PROPOSALS}
              </>
            )}
          </p>
        </div>
        <div className={styles.headerActions}>
          {multiHuman && view.phase !== 'setup' && (
            <label className={styles.peekSelect}>
              <span>Check a role</span>
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v !== '') setCoverTarget(Number(v));
                }}
              >
                <option value="">Whose?</option>
                {humanSeats.map((s) => (
                  <option key={s} value={s}>
                    {view.seats[s]!.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {localSeat === null && <span className={styles.spectating}>Spectating</span>}
          <button type="button" className={styles.ghostButton} onClick={exitGame}>
            Leave the hall
          </button>
        </div>
      </header>

      <QuestBoard view={view} holdQuest={holdQuest} />

      <div className={styles.main}>
        <RoundTable
          view={view}
          localSeat={localSeat}
          mode={mode}
          picked={picks}
          onPick={onPick}
          disabled={pickDisabled}
          showKnowledge={showKnowledge}
          aiSeats={aiSeats}
          votesRevealed={votesRevealed}
          struckSeat={view.phase === 'gameOver' ? view.assassinationTarget : null}
          revealRoles={revealRoles}
          centre={<TableCentre view={view} />}
        />

        <aside className={styles.side}>
          {localSeat !== null && view.yourRole && view.phase !== 'setup' && view.phase !== 'gameOver' && (
            <YourRole
              view={view}
              open={secretsOpen}
              cardUp={cardUp}
              onToggle={() => (secretsOpen ? setCardUp((c) => !c) : setCoverTarget(localSeat))}
            />
          )}
          <section className={styles.panel} aria-live="polite">
            <PhasePanel
              view={view}
              localSeat={localSeat}
              actor={actor}
              secretsOpen={secretsOpen}
              multiHuman={multiHuman}
              humanSeats={humanSeats}
              isHost={isHost}
              aiSeats={aiSeats}
              picks={picks}
              setPicks={setPicks}
              act={act}
              requestCover={setCoverTarget}
              questRevealDone={questRevealDone}
              onQuestRevealDone={setQuestRevealDone}
              onEndRevealDone={() => setEndRevealDone(true)}
              exitGame={exitGame}
            />
          </section>
        </aside>
      </div>

      <Chronicle view={view} holdQuest={holdQuest} />

      {cover !== null && (
        <PassCover
          name={view.seats[cover]?.name ?? `Seat ${cover + 1}`}
          seat={cover}
          reason={coverTarget !== null ? 'check' : view.phase}
          onConfirm={() => uncover(cover)}
          onCancel={coverTarget !== null ? () => setCoverTarget(null) : undefined}
        />
      )}
    </div>
  );
}

// ============================================================================
// Pass-the-device cover (hot-seat only). Fully opaque; renders no secrets.
// ============================================================================

function PassCover({
  name,
  seat,
  reason,
  onConfirm,
  onCancel,
}: {
  name: string;
  seat: SeatIndex;
  reason: string;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  const why: Record<string, string> = {
    setup: 'to learn your role in secret',
    teamProposal: 'to choose the quest team',
    teamVote: 'to cast your vote in secret',
    questExecution: 'to play your quest card in secret',
    assassinPick: 'to see whether you hold the blade',
    check: 'to look at your role card',
  };
  return (
    <div className={styles.cover} role="dialog" aria-modal="true" aria-labelledby="avalon-cover-title">
      <div className={styles.coverInner}>
        <SeatShield seat={seat} name={name} size={84} />
        <h2 id="avalon-cover-title">Pass the device to {name}</h2>
        <p>Only {name} should look at the screen, {why[reason] ?? 'to continue'}.</p>
        <div className={styles.coverButtons}>
          <button type="button" className={styles.goldButton} onClick={onConfirm} autoFocus>
            I am {name}
          </button>
          {onCancel && (
            <button type="button" className={styles.ghostButton} onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Your role (side card)
// ============================================================================

function YourRole({
  view,
  open,
  cardUp,
  onToggle,
}: {
  view: AvalonPublicState;
  open: boolean;
  cardUp: boolean;
  onToggle: () => void;
}) {
  const role = view.yourRole!;
  const up = open && cardUp;
  return (
    <section className={styles.yourRole} aria-label="Your role">
      <FlipCard
        width={118}
        height={165}
        radius={10}
        revealed={up}
        lift
        onClick={onToggle}
        title={up ? 'Hide your role' : 'Reveal your role'}
        back={<RoleCardBack label={open ? 'Tap to peek' : 'Locked'} />}
        front={up ? <RoleCardFace role={role} compact /> : <RoleCardBack />}
      />
      <div className={styles.yourRoleText}>
        <span className={styles.kicker}>Your role</span>
        {up ? (
          <>
            <strong className={styles.roleTitle}>{ROLES[role].name}</strong>
            <KnowledgeList view={view} />
          </>
        ) : (
          <p className={styles.dim}>{open ? 'Hidden. Tap the card to peek.' : 'Covered. Tap to pass the device back to you.'}</p>
        )}
        <button type="button" className={styles.linkButton} onClick={onToggle}>
          {up ? 'Hide' : 'Peek'}
        </button>
      </div>
    </section>
  );
}

function KnowledgeList({ view }: { view: AvalonPublicState }) {
  const role = view.yourRole;
  if (!role) return null;
  const k = view.yourRoleKnowledge;
  const intro: Partial<Record<AvalonRoleId, string>> = {
    merlin: 'Your sight reveals these servants of Mordred:',
    percival: 'One is Merlin, one is Morgana. You cannot tell which:',
    assassin: 'Your fellow servants of Mordred:',
    morgana: 'Your fellow servants of Mordred:',
    mordred: 'Your fellow servants of Mordred:',
    minionOfMordred: 'Your fellow servants of Mordred:',
  };
  if (k.length === 0) {
    const none =
      role === 'oberon'
        ? 'You walk alone. You do not know the other evils, and they do not know you.'
        : 'You know nothing of the others. Trust carefully.';
    return <p className={styles.dim}>{none}</p>;
  }
  return (
    <div className={styles.knowledge}>
      <p className={styles.dim}>{intro[role] ?? 'You see:'}</p>
      <ul>
        {k.map((x) => (
          <li key={x.seat} className={x.label === 'Evil' ? styles.knowEvilRow : styles.knowMerlinRow}>
            <span>{view.seats[x.seat]?.name ?? `Seat ${x.seat + 1}`}</span>
            <em>{x.label}</em>
          </li>
        ))}
      </ul>
      {role === 'merlin' && view.rolesInPlay.includes('mordred') && (
        <p className={styles.dim}>Mordred is hidden from you.</p>
      )}
      {(role === 'merlin' || role === 'percival') && <p className={styles.dim}>If good wins, the Assassin will hunt Merlin. Be subtle.</p>}
    </div>
  );
}

// ============================================================================
// Table centre: face-down quest cards piling up during the quest.
// ============================================================================

function TableCentre({ view }: { view: AvalonPublicState }) {
  if (view.phase !== 'questExecution' || view.questCardsSubmitted === 0) return null;
  return (
    <div className={styles.pile} aria-label={`${view.questCardsSubmitted} quest cards played`}>
      {Array.from({ length: view.questCardsSubmitted }, (_, i) => (
        <span key={i} className={styles.pileCard} style={{ transform: `translate(${(i - 1) * 3}px, ${-i * 2}px) rotate(${(i % 2 ? 1 : -1) * (4 + i * 3)}deg)` }}>
          <QuestCardBack />
        </span>
      ))}
    </div>
  );
}

// ============================================================================
// Phase panel
// ============================================================================

interface PanelProps {
  view: AvalonPublicState;
  localSeat: SeatIndex | null;
  actor: SeatIndex | null;
  secretsOpen: boolean;
  multiHuman: boolean;
  humanSeats: SeatIndex[];
  isHost: boolean;
  aiSeats: SeatIndex[];
  picks: SeatIndex[];
  setPicks: (p: SeatIndex[]) => void;
  act: (a: AvalonAction) => void;
  requestCover: (seat: SeatIndex) => void;
  questRevealDone: number | null;
  onQuestRevealDone: (q: number) => void;
  onEndRevealDone: () => void;
  exitGame: () => void;
}

function PhasePanel(p: PanelProps) {
  const { view } = p;
  switch (view.phase) {
    case 'setup':
      return <SetupPanel {...p} />;
    case 'teamProposal':
      return <ProposalPanel {...p} />;
    case 'teamVote':
      return <VotePanel {...p} />;
    case 'teamVoteReveal':
      return <VoteRevealPanel {...p} />;
    case 'questExecution':
      return <QuestPlayPanel {...p} />;
    case 'questResolution':
      return <QuestRevealPanel key={view.questHistory.length} {...p} />;
    case 'assassinPick':
      return <AssassinPanel {...p} />;
    case 'gameOver':
      return <GameOverPanel key={view.assassinationTarget ?? 'none'} {...p} />;
    default:
      // Optional-module phases are never entered (scaffolded only).
      return null;
  }
}

const nameOf = (view: AvalonPublicState, s: SeatIndex) => view.seats[s]?.name ?? `Seat ${s + 1}`;

function Heading({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <header className={styles.panelHead}>
      {kicker && <span className={styles.kicker}>{kicker}</span>}
      <h2>{children}</h2>
    </header>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <p className={styles.waiting}>
      <span className={styles.waitDots} aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {children}
    </p>
  );
}

function TeamChips({ view, team }: { view: AvalonPublicState; team: SeatIndex[] }) {
  return (
    <ul className={`${styles.teamChips} sd-stagger`}>
      {team.map((s, i) => (
        <li key={s} style={{ ['--i' as string]: i }}>
          <SeatShield seat={s} name={nameOf(view, s)} size={22} />
          {nameOf(view, s)}
        </li>
      ))}
    </ul>
  );
}

// --- setup -----------------------------------------------------------------

function SetupPanel({ view, localSeat, actor, secretsOpen, act }: PanelProps) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => setFlipped(false), [localSeat]);
  const mine = actor !== null && actor === localSeat && secretsOpen && view.yourRole;
  const waitingOn = view.seats.filter((s) => !s.hasAckedSetup);
  if (mine) {
    const role = view.yourRole!;
    return (
      <div className={styles.reveal}>
        <Heading kicker="In secret">Your role</Heading>
        <FlipCard
          width={200}
          height={280}
          radius={12}
          revealed={flipped}
          lift={!flipped}
          onClick={() => setFlipped(true)}
          title="Reveal your role"
          back={<RoleCardBack label="Tap to reveal" />}
          front={flipped ? <RoleCardFace role={role} /> : <RoleCardBack />}
          className={styles.revealCard}
        />
        {!flipped ? (
          <button type="button" className={styles.goldButton} onClick={() => setFlipped(true)}>
            Turn over your card
          </button>
        ) : (
          <div className={`${styles.revealText} sd-rise-in`}>
            <p>{ROLES[role].description}</p>
            <KnowledgeList view={view} />
            <button type="button" className={styles.goldButton} onClick={() => act({ type: 'ackRoleReveal', bySeat: localSeat! })}>
              I have memorised my role
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <Heading kicker="Before the first quest">The knights learn their roles</Heading>
      <Waiting>
        {waitingOn.length === 0 ? 'All are ready.' : `Waiting for ${waitingOn.map((s) => s.name).join(', ')}.`}
      </Waiting>
      <RolesInPlay view={view} />
    </div>
  );
}

function RolesInPlay({ view }: { view: AvalonPublicState }) {
  const counts = new Map<AvalonRoleId, number>();
  for (const r of view.rolesInPlay) counts.set(r, (counts.get(r) ?? 0) + 1);
  return (
    <div className={styles.rolesInPlay}>
      <span className={styles.kicker}>Characters in this game</span>
      <ul>
        {[...counts].map(([r, c]) => (
          <li key={r} className={ROLES[r].alignment === 'good' ? styles.rolesGood : styles.rolesEvil}>
            <RoleArt role={r} size={30} />
            <span>
              {ROLES[r].name}
              {c > 1 ? ` ×${c}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- proposal --------------------------------------------------------------

function ProposalPanel({ view, localSeat, actor, secretsOpen, picks, setPicks, act }: PanelProps) {
  const spec = view.questTrack[view.currentQuestNumber - 1]!;
  const leader = view.currentLeaderSeat;
  // Same condition the table uses for its pick mode.
  const canPick = actor !== null && actor === localSeat && localSeat === leader && secretsOpen;
  return (
    <div>
      <Heading kicker={`Quest ${roman(view.currentQuestNumber)}`}>
        {canPick ? `Choose ${spec.teamSize} knights` : `${nameOf(view, leader)} is choosing a team`}
      </Heading>
      {spec.failsRequired > 1 && <p className={styles.note}>This quest fails only if {spec.failsRequired} Fail cards are played.</p>}
      {canPick ? (
        <>
          <p className={styles.dim}>Tap knights at the table to give them a quest token. You may include yourself.</p>
          {picks.length > 0 && <TeamChips view={view} team={[...picks].sort((a, b) => a - b)} />}
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.goldButton}
              disabled={picks.length !== spec.teamSize}
              onClick={() => act({ type: 'proposeTeam', bySeat: leader, team: [...picks].sort((a, b) => a - b) })}
            >
              Propose this team ({picks.length}/{spec.teamSize})
            </button>
            {picks.length > 0 && (
              <button type="button" className={styles.ghostButton} onClick={() => setPicks([])}>
                Clear
              </button>
            )}
          </div>
        </>
      ) : (
        <Waiting>
          {nameOf(view, leader)} will name {spec.teamSize} knights for the quest.
        </Waiting>
      )}
      {view.failedProposalsThisQuest === MAX_REJECTED_PROPOSALS - 1 && (
        <p className={styles.warn}>This is the fifth proposal. If it is rejected, evil wins.</p>
      )}
    </div>
  );
}

// --- vote ------------------------------------------------------------------

function VotePanel({ view, localSeat, actor, secretsOpen, act }: PanelProps) {
  const placed = view.seats.filter((s) => s.hasVoted).length;
  const n = view.seats.length;
  const myTurn = actor !== null && actor === localSeat && secretsOpen;
  return (
    <div>
      <Heading kicker={`Proposed by ${nameOf(view, view.currentLeaderSeat)}`}>Approve this team?</Heading>
      <TeamChips view={view} team={view.proposedTeam} />
      {myTurn ? (
        <>
          <p className={styles.dim}>Your vote stays hidden until every token is down.</p>
          <div className={styles.tokenChoice}>
            <button type="button" className={styles.tokenButton} onClick={() => act({ type: 'castTeamVote', bySeat: localSeat!, approve: true })} aria-label="Approve the team">
              <VoteTokenFace approve />
            </button>
            <button type="button" className={styles.tokenButton} onClick={() => act({ type: 'castTeamVote', bySeat: localSeat!, approve: false })} aria-label="Reject the team">
              <VoteTokenFace approve={false} />
            </button>
          </div>
        </>
      ) : (
        <>
          {secretsOpen && view.yourVote !== null && (
            <p className={styles.note}>Your token is down: <b>{view.yourVote ? 'Approve' : 'Reject'}</b>.</p>
          )}
          <Waiting>
            {placed} of {n} tokens placed.
          </Waiting>
        </>
      )}
      {view.failedProposalsThisQuest === MAX_REJECTED_PROPOSALS - 1 && (
        <p className={styles.warn}>Fifth proposal: a rejection hands victory to evil.</p>
      )}
    </div>
  );
}

function HostContinue({ isHost, onContinue, label = 'Continue' }: { isHost: boolean; onContinue: () => void; label?: string }) {
  return isHost ? (
    <button type="button" className={styles.goldButton} onClick={onContinue}>
      {label}
    </button>
  ) : (
    <Waiting>Waiting for the host to continue.</Waiting>
  );
}

function VoteRevealPanel({ view, isHost, act }: PanelProps) {
  const last = view.proposalHistory[view.proposalHistory.length - 1];
  const approves = view.seats.filter((s) => s.voteApprove === true);
  const rejects = view.seats.filter((s) => s.voteApprove === false);
  const approved = last?.approved ?? approves.length > rejects.length;
  const fatal = !approved && view.failedProposalsThisQuest >= MAX_REJECTED_PROPOSALS - 1;
  const next = view.seats[(view.currentLeaderSeat + 1) % view.seats.length]!;
  return (
    <div>
      <Heading kicker="The tokens are turned">The table has spoken</Heading>
      <div className={`${styles.stamp} ${approved ? styles.stampGood : styles.stampEvil}`}>
        {approved ? 'Approved' : 'Rejected'} {approves.length}–{rejects.length}
      </div>
      <div className={styles.voteLists}>
        <div>
          <span className={styles.kicker}>Approve</span>
          <p>{approves.map((s) => s.name).join(', ') || 'No one'}</p>
        </div>
        <div>
          <span className={styles.kicker}>Reject</span>
          <p>{rejects.map((s) => s.name).join(', ') || 'No one'}</p>
        </div>
      </div>
      <p className={fatal ? styles.warn : styles.dim}>
        {approved
          ? 'The team rides out on the quest.'
          : fatal
            ? 'Five teams rejected. The realm falls into discord, and evil wins.'
            : `The crown passes to ${next.name}. ${MAX_REJECTED_PROPOSALS - view.failedProposalsThisQuest - 1} rejection(s) remain before evil wins.`}
      </p>
      <HostContinue isHost={isHost} onContinue={() => act({ type: 'ackTeamVoteReveal' })} />
    </div>
  );
}

// --- quest -----------------------------------------------------------------

function QuestPlayPanel({ view, localSeat, actor, secretsOpen, act }: PanelProps) {
  const myTurn = actor !== null && actor === localSeat && secretsOpen;
  const canFail = view.yourAlignment === 'evil';
  const size = view.proposedTeam.length;
  return (
    <div>
      <Heading kicker={`Quest ${roman(view.currentQuestNumber)}`}>The quest is under way</Heading>
      <TeamChips view={view} team={view.proposedTeam} />
      {myTurn ? (
        <>
          <p className={styles.dim}>
            {canFail
              ? 'Play Success to stay hidden, or Fail to sabotage. No one will know which card was yours.'
              : 'Loyal servants of Arthur may only play Success.'}
          </p>
          <div className={styles.cardChoice}>
            <button type="button" className={styles.questCardButton} onClick={() => act({ type: 'playQuestCard', bySeat: localSeat!, success: true })} aria-label="Play Success">
              <QuestCardFace success />
            </button>
            <button
              type="button"
              className={styles.questCardButton}
              disabled={!canFail}
              onClick={() => act({ type: 'playQuestCard', bySeat: localSeat!, success: false })}
              aria-label={canFail ? 'Play Fail' : 'Fail (only evil may play it)'}
            >
              <QuestCardFace success={false} />
            </button>
          </div>
        </>
      ) : (
        <>
          {secretsOpen && localSeat !== null && view.proposedTeam.includes(localSeat) && view.yourQuestCard !== null && (
            <p className={styles.note}>Your card is in.</p>
          )}
          <Waiting>
            {view.questCardsSubmitted} of {size} cards played.
          </Waiting>
        </>
      )}
    </div>
  );
}

function QuestRevealPanel({ view, isHost, act, questRevealDone, onQuestRevealDone }: PanelProps) {
  const q = view.questHistory[view.questHistory.length - 1]!;
  const order = useMemo(() => questRevealOrder(q.questNumber, q.teamSize, q.failCount), [q.questNumber, q.teamSize, q.failCount]);
  const already = questRevealDone === q.questNumber || prefersReducedMotion();
  // stage: 0 = shuffling, 1 = spread, then flips 1..n, done at n+1
  const [flips, setFlips] = useState(already ? order.length : 0);
  const [shuffling, setShuffling] = useState(!already);
  useEffect(() => {
    if (already) {
      onQuestRevealDone(q.questNumber);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setShuffling(false), 1300));
    order.forEach((_, i) => timers.push(setTimeout(() => setFlips(i + 1), 1700 + i * 750)));
    timers.push(setTimeout(() => onQuestRevealDone(q.questNumber), 1700 + order.length * 750 + 200));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.questNumber]);
  const done = flips >= order.length && !shuffling;
  const skip = () => {
    setShuffling(false);
    setFlips(order.length);
    onQuestRevealDone(q.questNumber);
  };
  const failsShown = order.slice(0, flips).filter((c) => !c).length;
  return (
    <div>
      <Heading kicker={`Quest ${roman(q.questNumber)}`}>The cards are shuffled and turned</Heading>
      <div className={`${styles.revealRow} ${shuffling ? styles.shuffling : ''}`} aria-label={done ? `${q.failCount} fail card(s) among ${q.teamSize}` : 'Revealing quest cards'}>
        {order.map((success, i) => (
          <span key={i} className={styles.revealSlot} style={{ ['--i' as string]: i, ['--n' as string]: order.length }}>
            <FlipCard
              width={58}
              height={83}
              radius={6}
              revealed={i < flips}
              back={<QuestCardBack />}
              front={i < flips ? <QuestCardFace success={success} /> : <QuestCardBack />}
            />
          </span>
        ))}
      </div>
      {done ? (
        <>
          <div className={`${styles.stamp} ${q.result === 'success' ? styles.stampGood : styles.stampEvil}`}>
            Quest {q.result === 'success' ? 'succeeds' : 'fails'}
          </div>
          <p className={styles.dim}>
            {q.failCount === 0
              ? 'Every card read Success.'
              : `${q.failCount} Fail card${q.failCount === 1 ? '' : 's'} among the ${q.teamSize}.`}
            {q.failsRequired > 1 && q.result === 'success' && q.failCount > 0 ? ` This quest needed ${q.failsRequired} to fail.` : ''}
          </p>
          <HostContinue isHost={isHost} onContinue={() => act({ type: 'ackQuestResolution' })} />
        </>
      ) : (
        <div className={styles.buttonRow}>
          <span className={styles.dim}>{failsShown > 0 ? `${failsShown} Fail so far…` : ' '}</span>
          <button type="button" className={styles.linkButton} onClick={skip}>
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

// --- assassination ---------------------------------------------------------

function AssassinPanel({ view, localSeat, secretsOpen, multiHuman, humanSeats, picks, act, requestCover }: PanelProps) {
  const iAmAssassin = secretsOpen && view.yourRole === 'assassin';
  if (iAmAssassin) {
    const target = picks[0];
    return (
      <div className={styles.assassin}>
        <Heading kicker="Three quests have succeeded">Name Merlin</Heading>
        <p className={styles.dim}>Choose the knight you believe is Merlin. Strike true and evil wins; miss and Arthur's court prevails.</p>
        {target !== undefined && <TeamChips view={view} team={[target]} />}
        <button
          type="button"
          className={styles.bloodButton}
          disabled={target === undefined}
          onClick={() => target !== undefined && act({ type: 'assassinateMerlin', bySeat: localSeat!, target })}
        >
          {target === undefined ? 'Pick a target at the table' : `Strike ${nameOf(view, target)}`}
        </button>
      </div>
    );
  }
  return (
    <div className={styles.assassin}>
      <Heading kicker="Three quests have succeeded">The Assassin draws a blade</Heading>
      <p className={styles.dim}>Good has won the quests, but if the Assassin can name Merlin, evil still wins.</p>
      {secretsOpen && view.yourAlignment === 'evil' && (
        <p className={styles.note}>Help your Assassin: who has seemed to know too much?</p>
      )}
      {multiHuman ? (
        <>
          <p className={styles.dim}>Pass the device to whoever holds the Assassin card:</p>
          <div className={styles.buttonRow}>
            {humanSeats.map((s) => (
              <button key={s} type="button" className={styles.ghostButton} onClick={() => requestCover(s)}>
                {nameOf(view, s)}
              </button>
            ))}
          </div>
          {secretsOpen && view.yourRole !== null && <p className={styles.dim}>{nameOf(view, localSeat!)} does not hold the blade.</p>}
        </>
      ) : (
        <Waiting>The Assassin studies the table…</Waiting>
      )}
    </div>
  );
}

// --- game over -------------------------------------------------------------

function GameOverPanel({ view, onEndRevealDone, exitGame }: PanelProps) {
  const reason = endReason(view);
  const target = view.assassinationTarget;
  const targetRole = target !== null ? view.seats[target]?.revealedRole ?? null : null;
  const [stage, setStage] = useState(target === null || prefersReducedMotion() ? 3 : 0);
  useEffect(() => {
    if (stage >= 3) return;
    const t1 = setTimeout(() => setStage(1), 1400);
    const t2 = setTimeout(() => setStage(2), 2600);
    const t3 = setTimeout(() => setStage(3), 3600);
    return () => [t1, t2, t3].forEach(clearTimeout);
    // Runs once per mount (the panel is keyed by the assassination target).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (stage >= 3) onEndRevealDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const good = view.winnerTeam === 'good';
  const verdict: Record<string, string> = {
    assassinHit: 'The Assassin has slain Merlin. Evil triumphs.',
    assassinMiss: 'The Assassin struck the wrong knight. Arthur’s court prevails.',
    threeFails: 'Three quests have failed. Mordred’s shadow covers the land.',
    fiveRejections: 'Five teams were rejected. The fellowship crumbles, and evil wins.',
    threeSuccesses: 'Three quests have succeeded. Good prevails.',
  };
  return (
    <div className={styles.gameOver}>
      {target !== null && (
        <div className={styles.assassination}>
          <div className={`${styles.dagger} ${styles.daggerStrike}`} aria-hidden>
            <DaggerIcon />
          </div>
          <p className={styles.dim}>The Assassin names <b>{nameOf(view, target)}</b>…</p>
          <FlipCard
            width={130}
            height={182}
            radius={10}
            revealed={stage >= 1 && targetRole !== null}
            back={<RoleCardBack />}
            front={stage >= 1 && targetRole ? <RoleCardFace role={targetRole} compact /> : <RoleCardBack />}
            className={stage >= 2 ? (targetRole === 'merlin' ? styles.slain : styles.spared) : ''}
          />
        </div>
      )}
      {stage >= 2 && (
        <div className={`${styles.verdict} ${good ? styles.verdictGood : styles.verdictEvil}`}>
          <span className={styles.verdictTitle}>{good ? 'Good wins' : 'Evil wins'}</span>
          <span>{reason ? verdict[reason] : ''}</span>
        </div>
      )}
      {stage >= 3 && (
        <>
          <span className={styles.kicker}>The roles revealed</span>
          <ul className={`${styles.revealGrid} sd-stagger`}>
            {view.seats.map((s, i) =>
              s.revealedRole ? (
                <li key={s.index} style={{ ['--i' as string]: i }}>
                  <div className={styles.miniCard}>
                    <RoleCardFace role={s.revealedRole} compact />
                  </div>
                  <span>{s.name}</span>
                </li>
              ) : null,
            )}
          </ul>
          <button type="button" className={styles.goldButton} onClick={exitGame}>
            Leave the hall
          </button>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Chronicle: the public record of quests and votes.
// ============================================================================

function Chronicle({ view, holdQuest }: { view: AvalonPublicState; holdQuest: number | null }) {
  if (view.proposalHistory.length === 0) return null;
  const quests = view.questHistory.filter((q) => q.questNumber !== holdQuest);
  return (
    <details className={styles.chronicle}>
      <summary>Chronicle of the Round Table</summary>
      <ol className={styles.chronicleList}>
        {view.proposalHistory.map((p, i) => {
          const q = p.approved ? quests.find((x) => x.questNumber === p.questNumber) : undefined;
          return (
            <li key={i}>
              <span className={styles.chronQuest}>
                Q{roman(p.questNumber)}.{p.attempt}
              </span>
              <span>
                <b>{nameOf(view, p.leader)}</b> chose {p.team.map((s) => nameOf(view, s)).join(', ')}
              </span>
              <span className={styles.chronVotes} aria-label={`${p.votes.filter(Boolean).length} approve, ${p.votes.filter((v) => !v).length} reject`}>
                {p.votes.map((v, s) => (
                  <i key={s} className={v ? styles.dotApprove : styles.dotReject} title={`${nameOf(view, s)}: ${v ? 'approve' : 'reject'}`} />
                ))}
              </span>
              <span className={p.approved ? (q ? (q.result === 'success' ? styles.chronGood : styles.chronEvil) : styles.dim) : styles.dim}>
                {!p.approved ? 'rejected' : q ? (q.result === 'success' ? `success (${q.failCount} fail)` : `failed (${q.failCount} fail${q.failCount === 1 ? '' : 's'})`) : 'on the quest'}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

export { AvalonGameView as default };
