import { lazy, Suspense, useState, type ComponentType, type LazyExoticComponent } from 'react';
import { GAMES } from '@/engine/registry';
import type { GameId } from '@/engine/types';
import { getDisplayName, normalizeRoomCode, setDisplayName } from '@/net';
import { useNetworkStore } from '@/store/networkStore';
import { GameTileArt } from './GameTileArt';
import styles from './HomeMenu.module.css';

// Top-level home menu: pick a game (→ its setup screen) or join a friend's
// room by code.

// Each setup screen (and its art) is its own chunk, loaded on pick.
type SetupProps = { onBack: () => void };
const SETUPS: Record<GameId, LazyExoticComponent<ComponentType<SetupProps>>> = {
  onuw: lazy(() => import('@/games/onuw/ui/OnuwSetup').then((m) => ({ default: m.OnuwSetup }))),
  'secret-hitler': lazy(() =>
    import('@/games/secret-hitler/ui/SecretHitlerSetup').then((m) => ({ default: m.SecretHitlerSetup })),
  ),
  avalon: lazy(() => import('@/games/avalon/ui/AvalonSetup').then((m) => ({ default: m.AvalonSetup }))),
  coup: lazy(() => import('@/games/coup/ui/CoupSetup').then((m) => ({ default: m.CoupSetup }))),
  codenames: lazy(() => import('@/games/codenames/ui/CodenamesSetup').then((m) => ({ default: m.CodenamesSetup }))),
  'cross-clues': lazy(() =>
    import('@/games/cross-clues/ui/CrossCluesSetup').then((m) => ({ default: m.CrossCluesSetup })),
  ),
  'love-letter': lazy(() =>
    import('@/games/love-letter/ui/LoveLetterSetup').then((m) => ({ default: m.LoveLetterSetup })),
  ),
  skull: lazy(() => import('@/games/skull/ui/SkullSetup').then((m) => ({ default: m.SkullSetup }))),
  'liars-dice': lazy(() => import('@/games/liars-dice/ui/LiarsDiceSetup').then((m) => ({ default: m.LiarsDiceSetup }))),
  'liars-poker': lazy(() =>
    import('@/games/liars-poker/ui/LiarsPokerSetup').then((m) => ({ default: m.LiarsPokerSetup })),
  ),
  'cockroach-poker': lazy(() =>
    import('@/games/cockroach-poker/ui/CockroachPokerSetup').then((m) => ({ default: m.CockroachPokerSetup })),
  ),
};

const BLURBS: Record<GameId, string> = {
  onuw: 'One night. Roles swap in the dark. Find a werewolf by dawn.',
  'secret-hitler': 'Pass policies, read the room, stop the secret dictator.',
  avalon: 'Loyal knights, hidden traitors, and a wizard who mustn’t be found.',
  coup: 'Bluff your way to power. Claim any role — if no one calls you on it.',
  codenames: 'Two spymasters, one-word clues, and an assassin in the grid.',
  'cross-clues': 'Co-op word grid. One clue, two words, no talking.',
  'love-letter': 'Sixteen cards, one princess, and a court full of schemers.',
  skull: 'Roses and skulls, face down. How many can you flip?',
  'liars-dice': 'Every cup hides five dice. Raise the bid or call the liar.',
  'liars-poker': 'Name a poker hand hidden across everyone’s cards.',
  'cockroach-poker': '“This is a stink bug.” Is it? Pass it on, or call it.',
};

const ORDER: GameId[] = [
  'onuw',
  'secret-hitler',
  'avalon',
  'coup',
  'codenames',
  'cross-clues',
  'love-letter',
  'skull',
  'liars-dice',
  'liars-poker',
  'cockroach-poker',
];

export function HomeMenu() {
  const [picked, setPicked] = useState<GameId | null>(null);

  if (picked) {
    const Setup = SETUPS[picked];
    return (
      <Suspense fallback={<main className={styles.root} aria-busy="true" />}>
        <Setup onBack={() => setPicked(null)} />
      </Suspense>
    );
  }

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div className={styles.crest} aria-hidden>
          <svg viewBox="0 0 64 64" width="56" height="56">
            <defs>
              <linearGradient id="home-crest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f6dc8e" />
                <stop offset="1" stopColor="#9c7224" />
              </linearGradient>
            </defs>
            <path d="M32 4 L58 16 V34 C58 48 46 57 32 61 C18 57 6 48 6 34 V16 Z" fill="#141a27" stroke="url(#home-crest)" strokeWidth="3" />
            <path d="M18 36 C22 26 42 26 46 36 C42 44 22 44 18 36 Z" fill="none" stroke="url(#home-crest)" strokeWidth="2.5" />
            <circle cx="32" cy="36" r="5" fill="url(#home-crest)" />
            <path d="M24 20 L32 26 L40 20" fill="none" stroke="url(#home-crest)" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className={styles.title}>
          <span className={styles.titleAccent}>Social</span> Deduction
        </h1>
        <p className={styles.tagline}>Lies, votes, and bad alibis. Pick your poison.</p>
        <JoinBox />
      </header>

      <div className={`${styles.grid} sd-stagger`}>
        {ORDER.map((id, i) => {
          const g = GAMES[id];
          const players = g.minPlayers === g.maxPlayers ? `${g.minPlayers}` : `${g.minPlayers}–${g.maxPlayers}`;
          return (
            <button
              key={id}
              onClick={() => setPicked(id)}
              className={styles.tile}
              style={{ '--i': i } as React.CSSProperties}
            >
              <div className={styles.tileArt}>
                <GameTileArt id={id} />
              </div>
              <div className={styles.tileInfo}>
                <div className={styles.tileTop}>
                  <span className={styles.tileName}>{g.displayName}</span>
                  <span className={styles.tilePlayers} title="Players">
                    {players}
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                      <circle cx="8" cy="5" r="3" fill="currentColor" />
                      <path d="M2 15c0-3.5 2.7-6 6-6s6 2.5 6 6z" fill="currentColor" />
                    </svg>
                  </span>
                </div>
                <span className={styles.tileBlurb}>{BLURBS[id]}</span>
              </div>
            </button>
          );
        })}
      </div>
      <footer className={styles.footer}>
        Play on one device (pass-and-play or against AI), or host online — each player only ever
        receives their own secrets.
      </footer>
    </main>
  );
}

function JoinBox() {
  const [code, setCode] = useState('');
  const [name, setName] = useState(getDisplayName());
  const joinRoom = useNetworkStore((s) => s.joinRoom);
  const error = useNetworkStore((s) => s.error);
  const clearError = useNetworkStore((s) => s.clearError);
  const valid = normalizeRoomCode(code) !== null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setDisplayName(name.trim() || 'Player');
    useNetworkStore.setState({ displayName: name.trim() || 'Player' });
    void joinRoom(code);
  };

  return (
    <form className={styles.join} onSubmit={submit}>
      <span className={styles.joinLabel}>Have a room code?</span>
      <input
        className={styles.joinName}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
        placeholder="Your name"
        aria-label="Your name"
      />
      <input
        className={styles.joinCode}
        value={code}
        onChange={(e) => {
          setCode(e.target.value.toUpperCase());
          if (error) clearError();
        }}
        maxLength={8}
        placeholder="CODE"
        aria-label="Room code"
        autoCapitalize="characters"
        spellCheck={false}
      />
      <button type="submit" className={styles.joinButton} disabled={!valid}>
        Join →
      </button>
      {error && (
        <div className={styles.joinError} role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
