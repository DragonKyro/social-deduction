import { useEffect, useMemo, useRef, useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import styles from './ChatPanel.module.css';

// Room chat (lobby + in-game drawer). Messages live in the room on the
// server, so late joiners see recent history.

export function ChatPanel({ height = 180, autoFocus = false }: { height?: number; autoFocus?: boolean }) {
  const chat = useNetworkStore((s) => s.chat);
  const sendChat = useNetworkStore((s) => s.sendChat);
  const myUuid = useNetworkStore((s) => s.uuid);
  const hostUuid = useNetworkStore((s) => s.hostUuid);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => chat.slice(-80), [chat]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sendChat(text);
    setDraft('');
  };

  return (
    <div className={styles.root}>
      <div ref={listRef} className={styles.list} style={{ height }} aria-live="polite">
        {lines.length === 0 && <div className={styles.empty}>No messages yet. Say hi!</div>}
        {lines.map((m) => (
          <div key={m.id} className={`${styles.line} ${m.senderUuid === myUuid ? styles.mine : ''}`}>
            <span className={styles.who}>
              {m.senderName}
              {m.senderUuid === hostUuid && <span className={styles.hostTag}>host</span>}
            </span>
            <span className={styles.text}>{m.text}</span>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className={styles.form}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          maxLength={500}
          autoFocus={autoFocus}
          aria-label="Chat message"
        />
        <button type="submit" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
