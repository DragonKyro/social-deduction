import { useMemo, useState, type CSSProperties } from 'react';
import { launchGame } from '@/ui/shared/launch';
import { OnlineHostToggle } from '@/ui/shared/OnlineHostToggle';
import { onuwModule } from '../module';
import type { OnuwOptions } from '../module';
import {
  BASE_ROLES,
  BONUS_ROLES,
  DAYBREAK_ROLES,
  RECOMMENDED_POOLS,
  ROLES,
  ROLE_MAX_COUNT,
  rolesSortedByWakeOrder,
} from '../roles';
import { validateRolePool } from '../setup';
import type { OnuwRoleId } from '../state';
import { RoleCard, RoleMedallion, TeamBadge } from './RoleArt';
import { Sky } from './Sky';
import styles from './OnuwSetup.module.css';

// Host-side setup screen for ONUW. The host picks the number of players
// (3-10), names them, marks AI seats, and builds a role pool of exactly
// playerCount + 3 cards with at least one werewolf-team role.

interface Props {
  onBack: () => void;
}

type PackTab = 'base' | 'daybreak' | 'bonus';

const PACK_ROLES: Record<PackTab, OnuwRoleId[]> = {
  base: BASE_ROLES,
  daybreak: DAYBREAK_ROLES,
  bonus: BONUS_ROLES,
};

const PACK_LABEL: Record<PackTab, string> = {
  base: 'Base game',
  daybreak: 'Daybreak',
  bonus: 'Bonus roles',
};

const DAY_LENGTHS = [180, 300, 480];

export function OnuwSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(5);
  const [names, setNames] = useState<string[]>(() => Array.from({ length: 10 }, (_, i) => `Player ${i + 1}`));
  const [ai, setAi] = useState<boolean[]>(() => Array.from({ length: 10 }, () => false));
  const [pack, setPack] = useState<PackTab>('base');
  const [pool, setPool] = useState<OnuwRoleId[]>(() => RECOMMENDED_POOLS[5]!.slice());
  const [dayDurationSec, setDayDurationSec] = useState(300);
  const [online, setOnline] = useState(false);

  const neededPool = playerCount + 3;
  const error = useMemo(() => validateRolePool(playerCount, pool), [playerCount, pool]);
  const aiSeats = Array.from({ length: playerCount }, (_, i) => i).filter((i) => ai[i]);

  const counts = useMemo(() => {
    const c: Partial<Record<OnuwRoleId, number>> = {};
    for (const r of pool) c[r] = (c[r] ?? 0) + 1;
    return c;
  }, [pool]);

  const setCount = (role: OnuwRoleId, delta: number) => {
    setPool((cur) => {
      if (delta > 0) {
        const have = cur.filter((r) => r === role).length;
        if (have >= (ROLE_MAX_COUNT[role] ?? 1) || cur.length >= neededPool) return cur;
        return [...cur, role];
      }
      const idx = cur.lastIndexOf(role);
      if (idx === -1) return cur;
      const next = cur.slice();
      next.splice(idx, 1);
      return next;
    });
  };

  const handlePlayerCountChange = (n: number) => {
    setPlayerCount(n);
    const rec = RECOMMENDED_POOLS[n];
    if (rec) setPool(rec.slice());
  };

  const startGame = () => {
    if (error) return;
    const playerNames = Array.from({ length: playerCount }, (_, i) => (names[i] ?? '').trim() || `Player ${i + 1}`);
    const opts: OnuwOptions = {
      players: playerNames.map((name, i) => ({ name, isAI: aiSeats.includes(i) })),
      rolePool: pool,
      artifactPool: [],
      dayDurationSec,
      allowNoLynch: true,
    };
    launchGame({ module: onuwModule, options: opts, playerNames, aiSeats, online });
  };

  const sortedPool = useMemo(() => rolesSortedByWakeOrder(pool), [pool]);

  return (
    <div className={styles.root}>
      <Sky mode="dusk" />
      <header className={styles.header}>
        <button className={styles.ghost} onClick={onBack}>
          ← Back
        </button>
        <div>
          <h1 className={styles.title}>One Night Ultimate Werewolf</h1>
          <p className={styles.tagline}>One night. One vote. Find a werewolf before the sun is up.</p>
        </div>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Who sits at the table</h3>
        <div className={styles.countControls} role="radiogroup" aria-label="Number of players">
          {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={n === playerCount}
              className={n === playerCount ? styles.countActive : styles.count}
              onClick={() => handlePlayerCountChange(n)}
            >
              {n}
            </button>
          ))}
          <span className={styles.hint}>
            {neededPool} cards: {playerCount} players + 3 in the center
          </span>
        </div>
        <div className={`${styles.nameGrid} sd-stagger`}>
          {Array.from({ length: playerCount }, (_, i) => (
            <div key={i} className={`${styles.nameRow} ${ai[i] ? styles.nameRowAi : ''}`} style={{ '--i': i } as CSSProperties}>
              <span className={styles.seatNumber}>{i + 1}</span>
              <input
                aria-label={`Seat ${i + 1} name`}
                value={names[i] ?? ''}
                placeholder={`Player ${i + 1}`}
                onChange={(e) =>
                  setNames((cur) => {
                    const next = cur.slice();
                    next[i] = e.target.value;
                    return next;
                  })
                }
                maxLength={20}
              />
              <button
                type="button"
                className={ai[i] ? styles.aiOn : styles.aiOff}
                aria-pressed={ai[i]}
                aria-label={`Seat ${i + 1} is ${ai[i] ? 'an AI player' : 'a human player'}`}
                title={ai[i] ? 'AI plays this seat' : 'A person plays this seat'}
                onClick={() =>
                  setAi((cur) => {
                    const next = cur.slice();
                    next[i] = !next[i];
                    return next;
                  })
                }
              >
                {ai[i] ? 'AI' : 'Human'}
              </button>
            </div>
          ))}
        </div>
        <p className={styles.hint}>
          {aiSeats.length === 0
            ? 'All seats are people. On one device, pass it around when asked.'
            : aiSeats.length === playerCount
              ? 'Every seat is an AI — you will watch the village decide.'
              : `${aiSeats.length} AI seat${aiSeats.length === 1 ? '' : 's'} — the AI only knows what its own card tells it.`}
        </p>
      </section>

      <section className={styles.panel}>
        <div className={styles.poolHeader}>
          <div>
            <h3 className={styles.h3}>The deck</h3>
            <p className={styles.hint}>
              Pick {neededPool} cards. Every role card that wakes is called at night even if it lies in the center.
            </p>
          </div>
          <div className={styles.poolMeter} aria-live="polite">
            <span className={pool.length === neededPool ? styles.meterFull : ''}>
              {pool.length} / {neededPool}
            </span>
            <button className={styles.ghost} onClick={() => setPool((RECOMMENDED_POOLS[playerCount] ?? []).slice())}>
              Recommended
            </button>
          </div>
        </div>
        <div className={styles.packTabs} role="tablist">
          {(['base', 'daybreak', 'bonus'] as PackTab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={pack === t}
              className={pack === t ? styles.packTabActive : styles.packTab}
              onClick={() => setPack(t)}
            >
              {PACK_LABEL[t]}
            </button>
          ))}
        </div>
        <div className={`${styles.roleGrid} sd-stagger`} key={pack}>
          {PACK_ROLES[pack].map((r, i) => (
            <RoleTile
              key={r}
              role={r}
              index={i}
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
          <div className={styles.fan}>
            {sortedPool.length === 0 && <span className={styles.hint}>No cards chosen yet.</span>}
            {sortedPool.map((r, i) => (
              <button
                key={`${r}-${i}`}
                className={styles.fanCard}
                style={{ '--i': i, '--n': sortedPool.length } as CSSProperties}
                onClick={() => setCount(r, -1)}
                title={`Remove ${ROLES[r].name}`}
                aria-label={`Remove ${ROLES[r].name}`}
              >
                <RoleMedallion role={r} size={46} />
                <span>{ROLES[r].name}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Daybreak</h3>
        <div className={styles.countControls} role="radiogroup" aria-label="Discussion length">
          {DAY_LENGTHS.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={dayDurationSec === s}
              className={dayDurationSec === s ? styles.countActive : styles.count}
              onClick={() => setDayDurationSec(s)}
            >
              {s / 60} min
            </button>
          ))}
          <span className={styles.hint}>Discussion timer (the host calls the vote).</span>
        </div>
      </section>

      <OnlineHostToggle online={online} onChange={setOnline} className={styles.onlineBlock} />

      <footer className={styles.footer}>
        <button className={styles.startButton} disabled={!!error} onClick={startGame} title={error ?? ''}>
          {online ? 'Open the lobby' : 'Deal the cards'}
        </button>
      </footer>
    </div>
  );
}

function RoleTile({
  role,
  index,
  count,
  cap,
  poolFull,
  onAdd,
  onRemove,
}: {
  role: OnuwRoleId;
  index: number;
  count: number;
  cap: number;
  poolFull: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const spec = ROLES[role];
  return (
    <div className={`${styles.roleTile} ${count > 0 ? styles.roleTileOn : ''}`} style={{ '--i': index } as CSSProperties}>
      <button
        type="button"
        className={styles.roleTileCard}
        onClick={count >= cap || poolFull ? onRemove : onAdd}
        disabled={count === 0 && poolFull}
        aria-label={count >= cap || poolFull ? `Remove one ${spec.name}` : `Add a ${spec.name}`}
      >
        <RoleCard role={role} size={92} />
        {count > 0 && <span className={styles.countBadge}>×{count}</span>}
      </button>
      <div className={styles.roleTileBody}>
        <div className={styles.roleTileName}>
          <TeamBadge role={role} /> {spec.name}
        </div>
        <div className={styles.roleTileDesc}>{spec.description}</div>
        <div className={styles.roleControls}>
          <button className={styles.smallBtn} onClick={onRemove} disabled={count === 0} aria-label={`Remove one ${spec.name}`}>
            −
          </button>
          <span className={styles.roleCount}>
            {count}/{cap}
          </span>
          <button
            className={styles.smallBtn}
            onClick={onAdd}
            disabled={count >= cap || poolFull}
            title={poolFull ? 'The deck is full' : 'Add this role'}
            aria-label={`Add a ${spec.name}`}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
