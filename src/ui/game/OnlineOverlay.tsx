import { useEffect, useRef, useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import { ChatPanel } from '@/ui/shared/ChatPanel';
import styles from './OnlineOverlay.module.css';

// In-game chrome for online matches: connection / host-offline banners and a
// collapsible chat drawer with an unread badge. Renders nothing offline.

export function OnlineOverlay() {
  const role = useNetworkStore((s) => s.role);
  const roomCode = useNetworkStore((s) => s.roomCode);
  const linkUp = useNetworkStore((s) => s.linkUp);
  const hostUuid = useNetworkStore((s) => s.hostUuid);
  const onlinePeers = useNetworkStore((s) => s.onlinePeers);
  const chatCount = useNetworkStore((s) => s.chat.length);
  const [open, setOpen] = useState(false);
  const seen = useRef(chatCount);
  if (open) seen.current = chatCount;
  const unread = Math.max(0, chatCount - seen.current);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (role === 'solo' || !roomCode) return null;
  const hostOnline = !!hostUuid && (onlinePeers[hostUuid] ?? 0) > 0;

  return (
    <>
      <div className={styles.banners} aria-live="polite">
        {!linkUp && <div className={styles.banner}>Connection lost — reconnecting…</div>}
        {linkUp && role !== 'host' && !hostOnline && (
          <div className={styles.banner}>The host is offline — the game is paused until they return.</div>
        )}
        {role === 'spectator' && <div className={`${styles.banner} ${styles.calm}`}>You’re spectating.</div>}
      </div>
      <div className={`${styles.drawer} ${open ? styles.open : ''}`}>
        {open && (
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <span>
                Room <b>{roomCode}</b>
              </span>
              <button onClick={() => setOpen(false)} aria-label="Close chat">
                ✕
              </button>
            </div>
            <ChatPanel height={240} autoFocus />
          </div>
        )}
        <button className={styles.fab} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Chat">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path
              d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4.5 3.5V17H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
              fill="currentColor"
            />
          </svg>
          {unread > 0 && !open && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
        </button>
      </div>
    </>
  );
}
