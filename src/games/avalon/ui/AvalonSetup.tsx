import { useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { avalonModule } from '../module';
import { ROLES, BASE_OPTIONAL_SPECIAL_ROLES } from '../roles';
import { alignmentSplit, questTrack } from '../quest-tracks';
import { buildRolePool } from '../setup';
import type { AvalonRoleId } from '../state';
import type { AvalonOptions } from '../module';
import { RoleArt } from './RoleArt';
import styles from './AvalonSetup.module.css';

// Local-host setup screen for Avalon. The host picks the number of players,
// edits each player name, and toggles which special roles are in play. The
// required roles (Merlin + Assassin) are locked on. The screen previews the
// resulting role pool and quest track before the game starts.

interface Props {
  onBack: () => void;
}

export function AvalonSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(5);
  const [names, setNames] = useState<string[]>([
    'Player 1',
    'Player 2',
    'Player 3',
    'Player 4',
    'Player 5',
    'Player 6',
    'Player 7',
    'Player 8',
    'Player 9',
    'Player 10',
  ]);
  // Default special-role list mirrors module.defaultConfig.
  const [specials, setSpecials] = useState<AvalonRoleId[]>(() => {
    const cfg = avalonModule.defaultConfig(5);
    return (cfg.gameOptions as unknown as AvalonOptions).specialRoles;
  });

  const split = alignmentSplit(playerCount);

  // Auto-trim invalid specials when player count changes.
  const trimmedSpecials = useMemo(() => {
    try {
      buildRolePool(playerCount, specials);
      return specials;
    } catch {
      let cur = specials.slice();
      while (cur.length > 0) {
        cur = cur.slice(0, -1);
        try {
          buildRolePool(playerCount, cur);
          return cur;
        } catch {
          // keep trimming
        }
      }
      return [];
    }
  }, [playerCount, specials]);

  const toggleSpecial = (role: AvalonRoleId) => {
    setSpecials((cur) => {
      if (cur.includes(role)) return cur.filter((r) => r !== role);
      const next = [...cur, role];
      try {
        buildRolePool(playerCount, next);
        return next;
      } catch {
        // If adding it overflows the alignment quota, drop the oldest of
        // the same alignment to make room.
        const sameAlignment = next.filter((r) => ROLES[r].alignment === ROLES[role].alignment);
        if (sameAlignment.length > 1) {
          const dropTarget = sameAlignment[0];
          return next.filter((r) => r !== dropTarget);
        }
        return cur;
      }
    });
  };

  const previewPool = useMemo(() => {
    try {
      return buildRolePool(playerCount, trimmedSpecials);
    } catch {
      return [];
    }
  }, [playerCount, trimmedSpecials]);

  const goodInPool = previewPool.filter((r) => ROLES[r].alignment === 'good').length;
  const evilInPool = previewPool.filter((r) => ROLES[r].alignment === 'evil').length;

  const startGame = () => {
    const opts: AvalonOptions = {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: (names[i] ?? `Player ${i + 1}`).trim() || `Player ${i + 1}`,
        isAI: false,
      })),
      specialRoles: trimmedSpecials,
      ladyOfTheLake: false,
      excalibur: false,
      twoLancelots: false,
    };
    const config = {
      gameId: 'avalon' as const,
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
    const initialState = avalonModule.createInitialState(config);
    // Start at seat 0; the hot-seat role reveal will rotate the device.
    useGameStore.getState().startLocalGame(avalonModule, initialState, 0);
  };

  const track = questTrack(playerCount);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button onClick={onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 22 }}>Avalon — Setup</h1>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Players</h3>
        <div className={styles.countControls}>
          {[5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              className={n === playerCount ? styles.countActive : ''}
              onClick={() => setPlayerCount(n)}
            >
              {n}
            </button>
          ))}
          <span style={{ marginLeft: 12, color: '#94a3b8', fontSize: 13 }}>
            {split.good} good · {split.evil} evil
          </span>
        </div>
        <div className={styles.nameGrid}>
          {Array.from({ length: playerCount }, (_, i) => (
            <label key={i} className={styles.nameRow}>
              <span className={styles.seatNumber}>{i + 1}</span>
              <input
                value={names[i] ?? `Player ${i + 1}`}
                onChange={(e) =>
                  setNames((cur) => {
                    const next = cur.slice();
                    next[i] = e.target.value;
                    return next;
                  })
                }
                maxLength={20}
              />
            </label>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Roles</h3>
        <p className={styles.subtitle}>
          Merlin and the Assassin are required. Toggle the optional specials. We&apos;ll
          fill the remaining seats with generic Loyal Servants and Minions of Mordred.
        </p>
        <div className={styles.roleGrid}>
          {/* Required roles first */}
          <RoleCard role="merlin" enabled locked />
          <RoleCard role="assassin" enabled locked />
          {/* Optional specials */}
          {BASE_OPTIONAL_SPECIAL_ROLES.map((r) => (
            <RoleCard
              key={r}
              role={r}
              enabled={trimmedSpecials.includes(r)}
              onToggle={() => toggleSpecial(r)}
            />
          ))}
        </div>
        <div className={styles.poolPreview}>
          <strong>Resulting role pool ({previewPool.length}):</strong>{' '}
          <span style={{ color: '#60a5fa' }}>{goodInPool} good</span> ·{' '}
          <span style={{ color: '#f87171' }}>{evilInPool} evil</span>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {Object.entries(
              previewPool.reduce(
                (acc, r) => {
                  acc[r] = (acc[r] ?? 0) + 1;
                  return acc;
                },
                {} as Record<string, number>,
              ),
            ).map(([role, count]) => (
              <li key={role}>
                {ROLES[role as AvalonRoleId].name}
                {count > 1 ? ` × ${count}` : ''}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Quest track</h3>
        <p className={styles.subtitle}>
          Team sizes per quest at {playerCount} players. The marked quest needs two fail
          cards to fail (7+ player tables only).
        </p>
        <div className={styles.questPreview}>
          {track.map((spec, i) => (
            <div key={i} className={styles.questPreviewTile}>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>Q{i + 1}</span>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{spec.teamSize}</span>
              {spec.failsRequired > 1 && (
                <span style={{ fontSize: 10, color: '#fbbf24' }}>×{spec.failsRequired}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <button className={styles.startButton} onClick={startGame}>
          Start game →
        </button>
      </footer>
    </div>
  );
}

function RoleCard({
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
  const cls = [
    styles.roleCard,
    enabled && styles.roleCardOn,
    locked && styles.roleCardLocked,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      onClick={onToggle}
      disabled={locked}
      title={locked ? 'Required role — always in play' : 'Toggle this role'}
    >
      <RoleArt role={role} size={56} />
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontWeight: 700 }}>{spec.name}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          {spec.alignment === 'good' ? 'Good' : 'Evil'}
          {locked && ' · required'}
        </div>
      </div>
      <div style={{ fontSize: 18 }}>{enabled ? '✓' : ''}</div>
    </button>
  );
}
