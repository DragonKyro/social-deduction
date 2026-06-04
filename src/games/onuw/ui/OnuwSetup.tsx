import { useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { onuwModule } from '../module';
import type { OnuwOptions } from '../module';
import {
  BASE_ROLES,
  BONUS_ROLES,
  DAYBREAK_ROLES,
  ROLES,
  ROLE_MAX_COUNT,
} from '../roles';
import { validateRolePool } from '../setup';
import type { OnuwRoleId } from '../state';
import { RoleArt, TeamBadge } from './RoleArt';
import styles from './OnuwSetup.module.css';

// Host-side setup screen for ONUW. The host picks the number of players
// (3-10), edits player names, and builds a role pool. The pool must be
// exactly playerCount + 3 cards and contain at least one werewolf role.

interface Props {
  onBack: () => void;
}

type PackTab = 'base' | 'daybreak' | 'bonus';

const PACK_ROLES: Record<PackTab, OnuwRoleId[]> = {
  base: BASE_ROLES,
  daybreak: DAYBREAK_ROLES,
  bonus: BONUS_ROLES,
};

const RECOMMENDED_POOLS: Record<number, OnuwRoleId[]> = {
  3: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager'],
  4: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager', 'villager'],
  5: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'minion', 'tanner', 'villager'],
  6: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'minion', 'tanner', 'drunk', 'villager'],
  7: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'minion', 'tanner', 'drunk', 'insomniac', 'villager'],
  8: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'minion', 'mason', 'mason', 'tanner', 'drunk', 'insomniac'],
  9: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'minion', 'mason', 'mason', 'tanner', 'drunk', 'insomniac', 'hunter'],
  10: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'minion', 'mason', 'mason', 'tanner', 'drunk', 'insomniac', 'hunter', 'villager'],
};

export function OnuwSetup({ onBack }: Props) {
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
  const [pack, setPack] = useState<PackTab>('base');
  const [pool, setPool] = useState<OnuwRoleId[]>(() => RECOMMENDED_POOLS[5]!.slice());

  const neededPool = playerCount + 3;
  const error = useMemo(() => validateRolePool(playerCount, pool), [playerCount, pool]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of pool) c[r] = (c[r] ?? 0) + 1;
    return c;
  }, [pool]);

  const setCount = (role: OnuwRoleId, delta: number) => {
    setPool((cur) => {
      const cap = ROLE_MAX_COUNT[role] ?? 1;
      const idx = cur.indexOf(role);
      if (delta > 0) {
        const have = cur.filter((r) => r === role).length;
        if (have >= cap) return cur;
        if (cur.length >= neededPool) return cur;
        return [...cur, role];
      }
      if (idx === -1) return cur;
      const next = cur.slice();
      next.splice(idx, 1);
      return next;
    });
  };

  const applyRecommended = () => {
    const rec = RECOMMENDED_POOLS[playerCount];
    if (rec) setPool(rec.slice());
  };

  const handlePlayerCountChange = (n: number) => {
    setPlayerCount(n);
    const rec = RECOMMENDED_POOLS[n];
    if (rec) setPool(rec.slice());
  };

  const startGame = () => {
    if (error) return;
    const opts: OnuwOptions = {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: (names[i] ?? `Player ${i + 1}`).trim() || `Player ${i + 1}`,
        isAI: false,
      })),
      rolePool: pool,
      artifactPool: [],
      dayDurationSec: 300,
      allowNoLynch: true,
    };
    const config = {
      gameId: 'onuw' as const,
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
    const initialState = onuwModule.createInitialState(config);
    useGameStore.getState().startLocalGame(onuwModule, initialState, 0);
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button onClick={onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 22 }}>One Night Ultimate Werewolf — Setup</h1>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Players</h3>
        <div className={styles.countControls}>
          {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              className={n === playerCount ? styles.countActive : ''}
              onClick={() => handlePlayerCountChange(n)}
            >
              {n}
            </button>
          ))}
          <span style={{ marginLeft: 12, color: '#94a3b8', fontSize: 13 }}>
            (needs {neededPool} role cards: {playerCount} players + 3 center)
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
        <h3 className={styles.h3}>Role pool</h3>
        <p className={styles.subtitle}>
          Pick {neededPool} role cards total ({playerCount} dealt to players, 3 sit in the
          center). At least one werewolf role is required.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <button onClick={applyRecommended} style={{ background: '#1f2937' }}>
            Use recommended pool
          </button>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>
            {pool.length} / {neededPool} cards selected
          </span>
        </div>
        <div className={styles.packTabs}>
          {(['base', 'daybreak', 'bonus'] as PackTab[]).map((t) => (
            <button
              key={t}
              className={`${styles.packTab} ${pack === t ? styles.packTabActive : ''}`}
              onClick={() => setPack(t)}
            >
              {t === 'base' ? 'Base game' : t === 'daybreak' ? 'Daybreak' : 'Bonus roles'}
            </button>
          ))}
        </div>
        <div className={styles.roleGrid}>
          {PACK_ROLES[pack].map((r) => (
            <RoleRow
              key={r}
              role={r}
              count={counts[r] ?? 0}
              cap={ROLE_MAX_COUNT[r] ?? 1}
              poolFull={pool.length >= neededPool}
              onAdd={() => setCount(r, 1)}
              onRemove={() => setCount(r, -1)}
            />
          ))}
        </div>
        <div className={styles.poolPreview}>
          {error && <div className={styles.poolError}>⚠ {error}</div>}
          <strong>Selected pool</strong>
          <div className={styles.poolList}>
            {pool.length === 0 && <span style={{ color: '#94a3b8' }}>Empty</span>}
            {Object.entries(counts).map(([role, n]) => {
              const team = ROLES[role as OnuwRoleId].team;
              const cls = `${styles.poolChip} ${
                team === 'werewolves' ? styles.evil : team === 'tanner' ? styles.tanner : ''
              }`;
              return (
                <span key={role} className={cls}>
                  <TeamBadge role={role as OnuwRoleId} /> {ROLES[role as OnuwRoleId].name}
                  {n > 1 ? ` × ${n}` : ''}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <button
          className={styles.startButton}
          disabled={!!error}
          onClick={startGame}
          title={error ?? ''}
        >
          Start game →
        </button>
      </footer>
    </div>
  );
}

function RoleRow({
  role,
  count,
  cap,
  poolFull,
  onAdd,
  onRemove,
}: {
  role: OnuwRoleId;
  count: number;
  cap: number;
  poolFull: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const spec = ROLES[role];
  const enabled = count > 0;
  const cls = `${styles.roleCard} ${enabled ? styles.roleCardOn : ''}`;
  return (
    <div className={cls}>
      <RoleArt role={role} size={48} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          <TeamBadge role={role} /> {spec.name}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, lineHeight: 1.35 }}>
          {spec.description}
        </div>
      </div>
      <div className={styles.roleControls}>
        <button className={styles.smallBtn} onClick={onRemove} disabled={count === 0}>
          −
        </button>
        <span className={styles.roleCardCount}>
          {count}/{cap}
        </span>
        <button
          className={styles.smallBtn}
          onClick={onAdd}
          disabled={count >= cap || poolFull}
          title={poolFull ? 'Pool is full' : 'Add this role'}
        >
          +
        </button>
      </div>
    </div>
  );
}
