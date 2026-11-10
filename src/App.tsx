import { useEffect } from 'react';
import { roomFromUrl } from '@/net';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { HomeMenu } from '@/ui/home/HomeMenu';
import { LobbyScreen } from '@/ui/lobby/LobbyScreen';
import { GameRouter } from '@/ui/game/GameRouter';
import { OnlineOverlay } from '@/ui/game/OnlineOverlay';

// `?room=CODE` (an invite link, or a reload while in a room) joins on load.
// Module-level so React StrictMode's double effect doesn't join twice.
let autoJoinTried = false;

export default function App() {
  const view = useGameStore((s) => s.publicView);
  const connection = useNetworkStore((s) => s.connection);

  useEffect(() => {
    if (autoJoinTried) return;
    autoJoinTried = true;
    const code = roomFromUrl();
    if (code && useNetworkStore.getState().connection === 'disconnected') {
      void useNetworkStore.getState().joinRoom(code);
    }
  }, []);

  if (view) {
    return (
      <div className="app-root">
        <GameRouter />
        <OnlineOverlay />
      </div>
    );
  }
  if (connection !== 'disconnected') {
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
