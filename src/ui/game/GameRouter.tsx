import { useGameStore } from '@/store/gameStore';
import { OnuwGameView } from '@/games/onuw/ui/GameView';
import { SecretHitlerGameView } from '@/games/secret-hitler/ui/GameView';
import { AvalonGameView } from '@/games/avalon/ui/GameView';
import { CoupGameView } from '@/games/coup/ui/GameView';
import { CodenamesGameView } from '@/games/codenames/ui/GameView';
import { CrossCluesGameView } from '@/games/cross-clues/ui/GameView';

// Per-game UIs live under `src/games/<id>/ui/`. The router picks the right
// one based on the current public view's gameId. This is the only place
// in the UI layer that switches on game id; everything below it is
// game-specific.

export function GameRouter() {
  const view = useGameStore((s) => s.publicView);
  if (!view) {
    return <main style={{ padding: 24 }}>No active game.</main>;
  }
  switch (view.gameId) {
    case 'onuw':
      return <OnuwGameView />;
    case 'secret-hitler':
      return <SecretHitlerGameView />;
    case 'avalon':
      return <AvalonGameView />;
    case 'coup':
      return <CoupGameView />;
    case 'codenames':
      return <CodenamesGameView />;
    case 'cross-clues':
      return <CrossCluesGameView />;
    default:
      return <main style={{ padding: 24 }}>Unknown game: {view.gameId}</main>;
  }
}
