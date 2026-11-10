import { useMemo, useState } from 'react';
import { launchGame } from '@/ui/shared/launch';
import { OnlineHostToggle } from '@/ui/shared/OnlineHostToggle';
import { avalonModule, trimToFit } from '../module';
import type { AvalonOptions } from '../module';
import { ROLES, BASE_OPTIONAL_SPECIAL_ROLES } from '../roles';
import { alignmentSplit, questTrack } from '../quest-tracks';
import { buildRolePool } from '../setup';
import type { AvalonRoleId } from '../state';
import { AlignmentBadge, RoleArt } from './RoleArt';
import { QuestMedallion, SeatShield } from './Tokens';
import styles from './AvalonSetup.module.css';

// Setup screen: player count, names, which seats the AI plays, which special
// characters are in, and a preview of the quest track. Merlin + the Assassin
// are always in. The optional modules (Lady of the Lake, Excalibur, Two
// Lancelots) are deliberately NOT offered — they're scaffolded only.

interface Props {
  onBack: () => void;
}

const COUNTS = [5, 6, 7, 8, 9, 10];
const AI_NAMES = ['Sir Kay', 'Sir Bedivere', 'Sir Gawain', 'Sir Tristan', 'Sir Gareth', 'Sir Bors', 'Sir Lamorak', 'Sir Galahad', 'Sir Ector', 'Sir Lionel'];
const defaultName = (i: number) => `Player ${i + 1}`;

export function AvalonSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(5);
  const [names, setNames] = useState<string[]>(() => Array.from({ length: 10 }, (_, i) => defaultName(i)));
  const [ai, setAi] = useState<boolean[]>(() => Array.from({ length: 10 }, () => false));
  // Default special-role list mirrors module.defaultConfig.
  const [specials, setSpecials] = useState<AvalonRoleId[]>(() => {
    const cfg = avalonModule.defaultConfig(5);
    return (cfg.gameOptions as unknown as AvalonOptions).specialRoles;
  });
  const [online, setOnline] = useState(false);

  const split = alignmentSplit(playerCount);
  const trimmedSpecials = useMemo(() => trimToFit(playerCount, specials), [playerCount, specials]);

  const toggleSpecial = (role: AvalonRoleId) => {
    setSpecials((cur) => {
      if (cur.includes(role)) return cur.filter((r) => r !== role);
      const next = [...cur, role];
      try {
        buildRolePool(playerCount, next);
        return next;
      } catch {
        // Over the alignment quota: drop the oldest special of that side.
        const same = next.filter((r) => ROLES[r].alignment === ROLES[role].alignment);
        return same.length > 1 ? next.filter((r) => r !== same[0]) : cur;
      }
    });
  };

  const toggleAI = (i: number) => {
    const on = !ai[i];
    setAi((cur) => {
      const next = cur.slice();
      next[i] = on;
      return next;
    });
    // Default names become knightly AI names (and back again).
    setNames((ns) => {
      const out = ns.slice();
      if (on && (out[i] ?? '').trim() === defaultName(i)) out[i] = AI_NAMES[i]!;
      if (!on && out[i] === AI_NAMES[i]) out[i] = defaultName(i);
      return out;
    });
  };

  const previewPool = useMemo(() => {
    try {
      return buildRolePool(playerCount, trimmedSpecials);
    } catch {
      return [];
    }
  }, [playerCount, trimmedSpecials]);
  const poolCounts = useMemo(() => {
    const m = new Map<AvalonRoleId, number>();
    for (const r of previewPool) m.set(r, (m.get(r) ?? 0) + 1);
    return [...m];
  }, [previewPool]);

  const seats = Array.from({ length: playerCount }, (_, i) => i);
  const aiSeats = seats.filter((i) => ai[i]);
  const humans = playerCount - aiSeats.length;

  const startGame = () => {
    const playerNames = seats.map((i) => (names[i] ?? '').trim() || defaultName(i));
    const opts: AvalonOptions = {
      players: playerNames.map((name, i) => ({ name, isAI: aiSeats.includes(i) })),
      specialRoles: trimmedSpecials,
      ladyOfTheLake: false,
      excalibur: false,
      twoLancelots: false,
    };
    launchGame({ module: avalonModule, options: opts, playerNames, aiSeats, online });
  };

  const track = questTrack(playerCount);

  return (
    <div className={styles.root}>
      <div className={styles.torch} aria-hidden />
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← Back
        </button>
        <div>
          <h1 className={styles.title}>Avalon</h1>
          <p className={styles.tagline}>Gather the Round Table. Somewhere among you, Mordred has servants.</p>
        </div>
      </header>

      <section className={styles.panel} aria-labelledby="av-knights">
        <div className={styles.panelHead}>
          <h2 id="av-knights">Knights of the table</h2>
          <span className={styles.split}>
            <AlignmentBadge alignment="good" size={14} /> {split.good} good
            <AlignmentBadge alignment="evil" size={14} /> {split.evil} evil
          </span>
        </div>
        <div className={styles.counts} role="radiogroup" aria-label="Number of players">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === playerCount}
              className={`${styles.count} ${n === playerCount ? styles.countOn : ''}`}
              onClick={() => setPlayerCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <ul className={styles.seatList}>
          {seats.map((i) => (
            <li key={i} className={`${styles.seatRow} ${ai[i] ? styles.seatAI : ''}`}>
              <SeatShield seat={i} name={names[i] || defaultName(i)} size={34} />
              <input
                aria-label={`Seat ${i + 1} name`}
                className={styles.nameInput}
                value={names[i] ?? ''}
                maxLength={20}
                onChange={(e) =>
                  setNames((cur) => {
                    const next = cur.slice();
                    next[i] = e.target.value;
                    return next;
                  })
                }
              />
              <div className={styles.who} role="group" aria-label={`Seat ${i + 1} is played by`}>
                <button type="button" aria-pressed={!ai[i]} className={!ai[i] ? styles.whoOn : ''} onClick={() => ai[i] && toggleAI(i)}>
                  Human
                </button>
                <button type="button" aria-pressed={!!ai[i]} className={ai[i] ? styles.whoOn : ''} onClick={() => !ai[i] && toggleAI(i)}>
                  AI
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className={styles.hint}>
          {humans === 0
            ? 'Every seat is AI. You will watch the game as a spectator.'
            : online
              ? `${humans} human seat${humans === 1 ? '' : 's'} for friends to claim; the host runs the AI seats.`
              : humans === 1
                ? 'You against the AI.'
                : `Pass-and-play for ${humans}: the screen is covered whenever the device changes hands.`}
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="av-roles">
        <div className={styles.panelHead}>
          <h2 id="av-roles">Characters</h2>
          <span className={styles.split}>Merlin and the Assassin are always in play</span>
        </div>
        <div className={styles.roleGrid}>
          <RoleToggle role="merlin" enabled locked />
          <RoleToggle role="assassin" enabled locked />
          {BASE_OPTIONAL_SPECIAL_ROLES.map((r) => (
            <RoleToggle key={r} role={r} enabled={trimmedSpecials.includes(r)} onToggle={() => toggleSpecial(r)} />
          ))}
        </div>
        <div className={styles.pool}>
          <span className={styles.kicker}>The deck ({previewPool.length} cards)</span>
          <ul>
            {poolCounts.map(([role, count]) => (
              <li key={role} className={ROLES[role].alignment === 'good' ? styles.poolGood : styles.poolEvil}>
                {ROLES[role].name}
                {count > 1 ? ` ×${count}` : ''}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="av-quests">
        <div className={styles.panelHead}>
          <h2 id="av-quests">The five quests</h2>
          <span className={styles.split}>Team size per quest at {playerCount} players</span>
        </div>
        <ol className={styles.quests}>
          {track.map((q, i) => (
            <li key={i} aria-label={`Quest ${i + 1}: team of ${q.teamSize}${q.failsRequired > 1 ? `, needs ${q.failsRequired} fails` : ''}`}>
              <QuestMedallion quest={i + 1} teamSize={q.teamSize} failsRequired={q.failsRequired} state="pending" />
            </li>
          ))}
        </ol>
        {playerCount >= 7 && <p className={styles.hint}>With 7 or more players, the fourth quest fails only on two Fail cards.</p>}
      </section>

      <OnlineHostToggle online={online} onChange={setOnline} />

      <footer className={styles.footer}>
        <button type="button" className={styles.start} onClick={startGame}>
          {online ? 'Open the lobby' : 'Seat the knights'} →
        </button>
      </footer>
    </div>
  );
}

function RoleToggle({
  role,
  enabled,
  locked,
  onToggle,
}: {
  role: AvalonRoleId;
  enabled: boolean;
  locked?: boolean;
  onToggle?: () => void;
}) {
  const spec = ROLES[role];
  return (
    <button
      type="button"
      className={`${styles.role} ${enabled ? styles.roleOn : ''} ${locked ? styles.roleLocked : ''} ${spec.alignment === 'good' ? styles.roleGood : styles.roleEvil}`}
      onClick={onToggle}
      aria-pressed={enabled}
      aria-disabled={locked || undefined}
      title={locked ? 'Required: always in play' : enabled ? 'In play — click to remove' : 'Click to add'}
    >
      <RoleArt role={role} size={58} />
      <span className={styles.roleText}>
        <strong>{spec.name}</strong>
        <small>
          {spec.alignment === 'good' ? 'Good' : 'Evil'}
          {locked ? ' · required' : ''}
        </small>
        <span className={styles.roleDesc}>{spec.description}</span>
      </span>
      <span className={styles.check} aria-hidden>
        {enabled ? '✦' : ''}
      </span>
    </button>
  );
}
