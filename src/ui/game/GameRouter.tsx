import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { GameId } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';

// Per-game UIs live under `src/games/<id>/ui/`. The router picks the right
// one based on the current public view's gameId. This is the only place in
// the UI layer that switches on game id; everything below it is
// game-specific. Each game's view (and its art) is its own chunk, loaded
// when that game starts.

const VIEWS: Record<GameId, LazyExoticComponent<ComponentType>> = {
  onuw: lazy(() => import('@/games/onuw/ui/GameView').then((m) => ({ default: m.OnuwGameView }))),
  'secret-hitler': lazy(() =>
    import('@/games/secret-hitler/ui/GameView').then((m) => ({ default: m.SecretHitlerGameView })),
  ),
  avalon: lazy(() => import('@/games/avalon/ui/GameView').then((m) => ({ default: m.AvalonGameView }))),
  coup: lazy(() => import('@/games/coup/ui/GameView').then((m) => ({ default: m.CoupGameView }))),
  codenames: lazy(() => import('@/games/codenames/ui/GameView').then((m) => ({ default: m.CodenamesGameView }))),
  'cross-clues': lazy(() =>
    import('@/games/cross-clues/ui/GameView').then((m) => ({ default: m.CrossCluesGameView })),
  ),
  'love-letter': lazy(() =>
    import('@/games/love-letter/ui/GameView').then((m) => ({ default: m.LoveLetterGameView })),
  ),
  skull: lazy(() => import('@/games/skull/ui/GameView').then((m) => ({ default: m.SkullGameView }))),
  'liars-dice': lazy(() => import('@/games/liars-dice/ui/GameView').then((m) => ({ default: m.LiarsDiceGameView }))),
  'liars-poker': lazy(() =>
    import('@/games/liars-poker/ui/GameView').then((m) => ({ default: m.LiarsPokerGameView })),
  ),
  'cockroach-poker': lazy(() =>
    import('@/games/cockroach-poker/ui/GameView').then((m) => ({ default: m.CockroachPokerGameView })),
  ),
};

function Loading() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', color: 'var(--text-dim)' }}>
      <div className="sd-fade-in">Setting the table…</div>
    </main>
  );
}

export function GameRouter() {
  const gameId = useGameStore((s) => s.publicView?.gameId ?? null);
  if (!gameId) {
    return <main style={{ padding: 24 }}>No active game.</main>;
  }
  const View = VIEWS[gameId];
  if (!View) {
    return <main style={{ padding: 24 }}>Unknown game: {gameId}</main>;
  }
  return (
    <Suspense fallback={<Loading />}>
      <View />
    </Suspense>
  );
}
