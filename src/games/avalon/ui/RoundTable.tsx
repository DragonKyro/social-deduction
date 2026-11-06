import type { CSSProperties, ReactNode } from 'react';
import type { SeatIndex } from '@/engine/types';
import { FlipCard } from '@/ui/shared/FlipCard';
import { SoftShadow, useSvgIds } from '@/ui/shared/svg';
import type { AvalonPublicState } from '../state';
import { RoleArt } from './RoleArt';
import { Candle, CrownIcon, QuestCardBack, SeatShield, TeamToken, VoteTokenBack, VoteTokenFace } from './Tokens';
import styles from './GameView.module.css';

// ============================================================================
// The Round Table: a carved-oak disc with one inlaid segment per knight, a
// Tudor rose at the centre, candles, and every seat around the rim.
//
// Everything rendered here comes from the public view. The only private bits
// are the viewer's OWN knowledge markers, shown only when `showKnowledge`.
// ============================================================================

export type TableMode = 'idle' | 'pickTeam' | 'pickTarget';

export interface RoundTableProps {
  view: AvalonPublicState;
  localSeat: SeatIndex | null;
  mode: TableMode;
  /** Seats currently picked (team draft or assassination target). */
  picked: SeatIndex[];
  onPick?: (seat: SeatIndex) => void;
  /** Seats that can't be picked in the current mode. */
  disabled?: (seat: SeatIndex) => boolean;
  /** Render the viewer's own role-knowledge markers. */
  showKnowledge: boolean;
  aiSeats: SeatIndex[];
  /** Hold back the vote flip until the reveal panel says go. */
  votesRevealed: boolean;
  /** Seat the Assassin struck (game over). */
  struckSeat?: SeatIndex | null;
  /** Show every seat's revealed role (game over, after the final reveal). */
  revealRoles: boolean;
  centre?: ReactNode;
}

function seatAngle(i: number, n: number, anchor: number): number {
  return Math.PI / 2 + ((i - anchor) * 2 * Math.PI) / n;
}

function polar(angle: number, r: number): CSSProperties {
  return { left: `${50 + Math.cos(angle) * r}%`, top: `${50 + Math.sin(angle) * r}%` };
}

function TableDisc({ n, anchor }: { n: number; anchor: number }) {
  const id = useSvgIds();
  const wedges = Array.from({ length: n }, (_, i) => {
    const a0 = seatAngle(i, n, anchor) - Math.PI / n;
    const a1 = a0 + (2 * Math.PI) / n;
    const R = 88;
    const r = 36;
    const p = (a: number, rad: number) => `${100 + Math.cos(a) * rad} ${100 + Math.sin(a) * rad}`;
    return `M${p(a0, r)} L${p(a0, R)} A${R} ${R} 0 0 1 ${p(a1, R)} L${p(a1, r)} A${r} ${r} 0 0 0 ${p(a0, r)} Z`;
  });
  return (
    <svg viewBox="0 0 200 200" className={styles.disc} aria-hidden>
      <defs>
        <radialGradient id={id('wood')} cx="45%" cy="40%" r="62%">
          <stop offset="0%" stopColor="#8a5a2e" />
          <stop offset="55%" stopColor="#5e3818" />
          <stop offset="100%" stopColor="#2e180a" />
        </radialGradient>
        <radialGradient id={id('rim')} cx="50%" cy="50%" r="50%">
          <stop offset="88%" stopColor="#3a210e" />
          <stop offset="96%" stopColor="#6b4320" />
          <stop offset="100%" stopColor="#1e1006" />
        </radialGradient>
        <linearGradient id={id('gold')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff1b8" />
          <stop offset="45%" stopColor="#d4a64a" />
          <stop offset="100%" stopColor="#6e4a12" />
        </linearGradient>
        <filter id={id('grain')} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.22" numOctaves="3" seed="11" result="t" />
          <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.06  0 0 0 0 0.02  0 0 0 -1.6 1.15" result="lines" />
          <feComposite in="lines" in2="SourceGraphic" operator="in" result="g" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="g" />
          </feMerge>
        </filter>
        <SoftShadow id={id('sh')} dy={6} blur={6} opacity={0.75} />
      </defs>
      <g filter={id.url('sh')}>
        <circle cx="100" cy="100" r="98" fill={id.url('rim')} />
        <circle cx="100" cy="100" r="91" fill={id.url('wood')} filter={id.url('grain')} />
      </g>
      {/* carved notches on the rim */}
      <g stroke="#1e1006" strokeWidth="1" opacity="0.6">
        {Array.from({ length: 48 }, (_, i) => {
          const a = (i / 48) * Math.PI * 2;
          return <line key={i} x1={100 + Math.cos(a) * 93} y1={100 + Math.sin(a) * 93} x2={100 + Math.cos(a) * 97} y2={100 + Math.sin(a) * 97} />;
        })}
      </g>
      {/* one inlaid segment per seat, alternating oak tones */}
      {wedges.map((d, i) => (
        <path key={i} d={d} fill={i % 2 ? 'rgba(255,230,190,0.07)' : 'rgba(20,8,0,0.16)'} stroke="#2a1608" strokeWidth="0.6" />
      ))}
      <circle cx="100" cy="100" r="88" fill="none" stroke={id.url('gold')} strokeWidth="1.4" opacity="0.85" />
      <circle cx="100" cy="100" r="36" fill="none" stroke={id.url('gold')} strokeWidth="1.2" opacity="0.85" />
      {/* Tudor rose */}
      <g transform="translate(100 100)">
        <circle r="30" fill="#2a1608" opacity="0.55" />
        {Array.from({ length: 5 }, (_, i) => (
          <path key={`g${i}`} transform={`rotate(${i * 72 + 36})`} d="M0 -27 L3 -20 L0 -16 L-3 -20 Z" fill="#2f6b3e" />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <circle key={`r${i}`} transform={`rotate(${i * 72})`} cx="0" cy="-15" r="10" fill="#9b1c1c" stroke="#5e0d12" strokeWidth="0.8" />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <circle key={`w${i}`} transform={`rotate(${i * 72 + 36})`} cx="0" cy="-8" r="6.5" fill="#f4efe2" stroke="#cdb88c" strokeWidth="0.6" />
        ))}
        <circle r="5" fill={id.url('gold')} />
        {Array.from({ length: 8 }, (_, i) => (
          <circle key={`s${i}`} transform={`rotate(${i * 45})`} cx="0" cy="-3.2" r="0.8" fill="#6e4a12" />
        ))}
      </g>
    </svg>
  );
}

function KnowledgeChip({ label }: { label: string }) {
  const evil = label === 'Evil';
  return (
    <span className={`${styles.knowChip} ${evil ? styles.knowEvil : styles.knowMerlin}`} title={evil ? 'You know this knight serves Mordred' : 'Merlin — or Morgana'}>
      {evil ? '☠ Evil' : '✧ Merlin?'}
    </span>
  );
}

export function RoundTable({
  view,
  localSeat,
  mode,
  picked,
  onPick,
  disabled,
  showKnowledge,
  aiSeats,
  votesRevealed,
  struckSeat = null,
  revealRoles,
  centre,
}: RoundTableProps) {
  const n = view.seats.length;
  const anchor = localSeat ?? 0;
  const knowledge = new Map(showKnowledge && view.phase !== 'gameOver' ? view.yourRoleKnowledge.map((k) => [k.seat, k.label] as const) : []);
  const gameOver = view.phase === 'gameOver';
  // The crown means nothing once the quests are over.
  const showCrown = !gameOver && view.phase !== 'assassinPick';
  const showTeam =
    view.phase === 'teamVote' ||
    view.phase === 'teamVoteReveal' ||
    view.phase === 'questExecution' ||
    view.phase === 'questResolution';
  const showVotes = view.phase === 'teamVote' || view.phase === 'teamVoteReveal';
  const interactive = mode !== 'idle' && !!onPick;

  return (
    <div className={styles.tableWrap}>
      <div className={styles.tableGlow} aria-hidden />
      <TableDisc n={n} anchor={anchor} />
      <div className={styles.candles} aria-hidden>
        <span style={polar(-Math.PI / 2 + 0.5, 18)}>
          <Candle height={40} delay={0} />
        </span>
        <span style={polar(Math.PI / 2 + 2.3, 18)}>
          <Candle height={34} delay={0.7} />
        </span>
        <span style={polar(Math.PI / 2 - 2.0, 18)}>
          <Candle height={44} delay={1.3} />
        </span>
      </div>
      {centre && <div className={styles.tableCentre}>{centre}</div>}

      {view.seats.map((s) => {
        const a = seatAngle(s.index, n, anchor);
        const isPicked = picked.includes(s.index);
        const isDisabled = interactive && !!disabled?.(s.index);
        const onTeam = (showTeam && s.isOnProposedTeam) || (mode === 'pickTeam' && isPicked);
        const know = knowledge.get(s.index);
        const cls = [
          styles.seat,
          s.isCurrentLeader && showCrown ? styles.seatLeader : '',
          s.index === localSeat ? styles.seatYou : '',
          isPicked ? styles.seatPicked : '',
          interactive && !isDisabled ? styles.seatPickable : '',
          struckSeat === s.index ? styles.seatStruck : '',
        ]
          .filter(Boolean)
          .join(' ');
        const label = `${s.name}${s.index === localSeat ? ' (you)' : ''}${s.isCurrentLeader ? ', leader' : ''}${
          onTeam ? ', on the quest team' : ''
        }${aiSeats.includes(s.index) ? ', AI' : ''}`;
        const body = (
          <>
            {s.isCurrentLeader && showCrown && (
              <span className={styles.crown}>
                <CrownIcon size={30} />
              </span>
            )}
            <span className={styles.shield}>
              {revealRoles && s.revealedRole ? <RoleArt role={s.revealedRole} size={50} /> : <SeatShield seat={s.index} name={s.name} size={50} />}
            </span>
            <span className={styles.plate}>
              <span className={styles.plateName}>{s.name}</span>
              {s.index === localSeat && <span className={styles.youTag}>you</span>}
              {aiSeats.includes(s.index) && <span className={styles.aiTag}>AI</span>}
            </span>
            {know && <KnowledgeChip label={know} />}
            {view.phase === 'setup' && (
              <span className={`${styles.ackDot} ${s.hasAckedSetup ? styles.ackDone : ''}`} aria-hidden>
                {s.hasAckedSetup ? '✓' : '…'}
              </span>
            )}
          </>
        );
        return (
          <div key={s.index} className={styles.seatSlot} style={polar(a, 41)}>
            {interactive ? (
              <button
                type="button"
                className={cls}
                aria-pressed={isPicked}
                aria-label={label}
                disabled={isDisabled}
                onClick={() => onPick!(s.index)}
              >
                {body}
              </button>
            ) : (
              <div className={cls} aria-label={label} role="group">
                {body}
              </div>
            )}
          </div>
        );
      })}

      {/* Tokens laid on the table in front of each seat. */}
      {view.seats.map((s) => {
        const a = seatAngle(s.index, n, anchor);
        const onTeam = (showTeam && s.isOnProposedTeam) || (mode === 'pickTeam' && picked.includes(s.index));
        const vote = showVotes && s.hasVoted;
        const played = view.phase === 'questExecution' && s.hasPlayedQuestCard;
        if (!onTeam && !vote && !played) return null;
        return (
          <div key={`t${s.index}`} className={styles.tokenSlot} style={polar(a, 29)} aria-hidden>
            {onTeam && (
              <span className={styles.teamToken} style={{ animationDelay: `${(view.proposedTeam.indexOf(s.index) + 1) * 90}ms` }}>
                <TeamToken size={26} />
              </span>
            )}
            {vote && (
              <span className={styles.voteToken}>
                <FlipCard
                  width={34}
                  height={34}
                  radius={17}
                  revealed={view.phase === 'teamVoteReveal' && votesRevealed && s.voteApprove !== null}
                  back={<VoteTokenBack />}
                  front={s.voteApprove !== null ? <VoteTokenFace approve={s.voteApprove} /> : <VoteTokenBack />}
                />
              </span>
            )}
            {played && (
              <span className={styles.playedCard}>
                <QuestCardBack />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
