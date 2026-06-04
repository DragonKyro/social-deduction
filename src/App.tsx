import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { HomeMenu } from '@/ui/home/HomeMenu';
import { LobbyScreen } from '@/ui/lobby/LobbyScreen';
import { GameRouter } from '@/ui/game/GameRouter';

export default function App() {
  const view = useGameStore((s) => s.publicView);
  const connection = useNetworkStore((s) => s.connection);

  if (view) {
    return (
      <div className="app-root">
        <GameRouter />
      </div>
    );
  }
  if (connection === 'lobby' || connection === 'connecting') {
    return (
      <div className="app-root">
        <LobbyScreen />
      </div>
    );
  }
  return (
    <div className="app-root">
      <HomeMenu />
    </div>
  );
}
