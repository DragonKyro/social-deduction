import { GAMES } from '@/engine/registry';
import type { GameId } from '@/engine/types';

// Stub home menu — game picker + solo/online toggle land in Phase 0b.

export function HomeMenu(): JSX.Element {
  const games = Object.values(GAMES) as Array<{ id: GameId; displayName: string }>;
  return (
    <main style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 640, margin: '0 auto' }}>
      <h1>Social Deduction</h1>
      <p>Pick a game to start. (Stub — wiring lands in phase 0b.)</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {games.map((g) => (
          <button key={g.id} disabled>
            {g.displayName}
          </button>
        ))}
      </div>
    </main>
  );
}
