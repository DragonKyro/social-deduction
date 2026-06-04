import { useState } from 'react';
import { GAMES } from '@/engine/registry';
import type { GameId } from '@/engine/types';
import { AvalonSetup } from '@/games/avalon/ui/AvalonSetup';
import { OnuwSetup } from '@/games/onuw/ui/OnuwSetup';
import { CoupSetup } from '@/games/coup/ui/CoupSetup';
import { GameTileArt } from './GameTileArt';
import styles from './HomeMenu.module.css';

// Top-level home menu. Picks a game and routes into the appropriate
// per-game setup screen. Currently wired: Avalon, ONUW, and Coup.

type Stage =
  | { kind: 'menu' }
  | { kind: 'avalon-setup' }
  | { kind: 'onuw-setup' }
  | { kind: 'coup-setup' };

export function HomeMenu() {
  const [stage, setStage] = useState<Stage>({ kind: 'menu' });
  const games = Object.values(GAMES) as Array<{ id: GameId; displayName: string }>;

  if (stage.kind === 'avalon-setup') {
    return <AvalonSetup onBack={() => setStage({ kind: 'menu' })} />;
  }
  if (stage.kind === 'onuw-setup') {
    return <OnuwSetup onBack={() => setStage({ kind: 'menu' })} />;
  }
  if (stage.kind === 'coup-setup') {
    return <CoupSetup onBack={() => setStage({ kind: 'menu' })} />;
  }

  const pick = (id: GameId) => {
    if (id === 'avalon') setStage({ kind: 'avalon-setup' });
    else if (id === 'onuw') setStage({ kind: 'onuw-setup' });
    else if (id === 'coup') setStage({ kind: 'coup-setup' });
  };

  const wired: GameId[] = ['onuw', 'avalon', 'coup'];

  return (
    <main className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          <span className={styles.titleAccent}>Social</span> Deduction
        </h1>
        <p className={styles.tagline}>Lies, votes, and bad alibis. Pick your poison.</p>
      </div>
      <div className={styles.grid}>
        {games.map((g) => {
          const enabled = wired.includes(g.id);
          return (
            <button
              key={g.id}
              disabled={!enabled}
              onClick={() => pick(g.id)}
              className={`${styles.tile} ${enabled ? '' : styles.tileDisabled}`}
            >
              <GameTileArt id={g.id} />
              <div className={styles.tileInfo}>
                <span className={styles.tileName}>{g.displayName}</span>
                {!enabled && <span className={styles.tileBadge}>coming soon</span>}
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}
