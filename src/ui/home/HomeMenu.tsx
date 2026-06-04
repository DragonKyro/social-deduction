import { useState } from 'react';
import { GAMES } from '@/engine/registry';
import type { GameId } from '@/engine/types';
import { AvalonSetup } from '@/games/avalon/ui/AvalonSetup';

// Top-level home menu. Picks a game and routes into the appropriate
// per-game setup screen. Right now only Avalon is wired (Phase 4 base);
// other games still show a "stub" disabled button.

type Stage = { kind: 'menu' } | { kind: 'avalon-setup' };

export function HomeMenu() {
  const [stage, setStage] = useState<Stage>({ kind: 'menu' });
  const games = Object.values(GAMES) as Array<{ id: GameId; displayName: string }>;

  if (stage.kind === 'avalon-setup') {
    return <AvalonSetup onBack={() => setStage({ kind: 'menu' })} />;
  }

  const pick = (id: GameId) => {
    if (id === 'avalon') setStage({ kind: 'avalon-setup' });
  };

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>Social Deduction</h1>
      <p style={{ color: '#94a3b8', marginTop: 0 }}>Pick a game to play locally (hot-seat).</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {games.map((g) => {
          const wired = g.id === 'avalon';
          return (
            <button
              key={g.id}
              disabled={!wired}
              onClick={() => pick(g.id)}
              style={{ padding: '12px 16px', fontSize: 15, textAlign: 'left' }}
            >
              {g.displayName}
              {!wired && (
                <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>(coming soon)</span>
              )}
            </button>
          );
        })}
      </div>
    </main>
  );
}
