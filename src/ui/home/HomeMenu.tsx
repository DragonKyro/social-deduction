import { useState } from 'react';
import { GAMES } from '@/engine/registry';
import type { GameId } from '@/engine/types';
import { getDisplayName, setDisplayName } from '@/net';
import { useNetworkStore } from '@/store/networkStore';
import { AvalonSetup } from '@/games/avalon/ui/AvalonSetup';
import { OnuwSetup } from '@/games/onuw/ui/OnuwSetup';
import { CoupSetup } from '@/games/coup/ui/CoupSetup';
import { CodenamesSetup } from '@/games/codenames/ui/CodenamesSetup';
import { GameTileArt } from './GameTileArt';
import styles from './HomeMenu.module.css';

// Top-level home menu. Picks a game and routes into the appropriate
// per-game setup screen. Currently wired: Avalon, ONUW, and Coup.

type Stage =
  | { kind: 'menu' }
  | { kind: 'avalon-setup' }
  | { kind: 'onuw-setup' }
  | { kind: 'coup-setup' }
  | { kind: 'codenames-setup' }
  | { kind: 'join-online' };

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
  if (stage.kind === 'codenames-setup') {
    return <CodenamesSetup onBack={() => setStage({ kind: 'menu' })} />;
  }
  if (stage.kind === 'join-online') {
    return <JoinOnline onBack={() => setStage({ kind: 'menu' })} />;
  }

  const pick = (id: GameId) => {
    if (id === 'avalon') setStage({ kind: 'avalon-setup' });
    else if (id === 'onuw') setStage({ kind: 'onuw-setup' });
    else if (id === 'coup') setStage({ kind: 'coup-setup' });
    else if (id === 'codenames') setStage({ kind: 'codenames-setup' });
  };

  const wired: GameId[] = ['onuw', 'avalon', 'coup', 'codenames'];

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
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <button
          onClick={() => setStage({ kind: 'join-online' })}
          style={{ padding: '10px 18px', fontSize: 14 }}
        >
          Join an online room →
        </button>
      </div>
    </main>
  );
}

function JoinOnline({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(getDisplayName());
  const joinRoom = useNetworkStore((s) => s.joinRoom);

  const submit = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setDisplayName(name.trim() || 'Player');
    joinRoom(trimmed);
  };

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <button onClick={onBack}>← Back</button>
      <h1 style={{ marginTop: 16 }}>Join an online room</h1>
      <p style={{ color: '#94a3b8' }}>
        Enter the room code shared by your host. You'll see the game lobby once
        the host's signal reaches you (usually within a few seconds).
      </p>
      <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#cbd5e1' }}>Display name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          style={{ padding: 8 }}
        />
      </label>
      <label style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: '#cbd5e1' }}>Room code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={32}
          placeholder="must match the host's"
          style={{ padding: 8 }}
        />
      </label>
      <button
        onClick={submit}
        disabled={!code.trim()}
        style={{
          background: '#10b981',
          color: 'white',
          padding: '10px 18px',
          fontWeight: 700,
        }}
      >
        Join →
      </button>
    </main>
  );
}
