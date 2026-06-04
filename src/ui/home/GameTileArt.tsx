import type { GameId } from '@/engine/types';

// Game-specific hero art for the home tiles. Each is a wide SVG with a
// gradient background + an emblem that signals the game's mood.

export function GameTileArt({ id }: { id: GameId }) {
  switch (id) {
    case 'onuw':
      return <OnuwTile />;
    case 'avalon':
      return <AvalonTile />;
    case 'secret-hitler':
      return <SecretHitlerTile />;
    case 'coup':
      return <CoupTile />;
    case 'codenames':
      return <CodenamesTile />;
    case 'cross-clues':
      return <CrossCluesTile />;
    case 'love-letter':
      return <LoveLetterTile />;
    case 'skull':
      return <SkullTile />;
    case 'liars-dice':
      return <LiarsDiceTile />;
    case 'liars-poker':
      return <LiarsPokerTile />;
    case 'cockroach-poker':
      return <CockroachPokerTile />;
  }
}

function TileBase({
  gradFrom,
  gradTo,
  children,
}: {
  gradFrom: string;
  gradTo: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      style={{ display: 'block', width: '100%', height: 180 }}
    >
      <defs>
        <linearGradient id={`grad-${gradFrom}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={gradFrom} />
          <stop offset="100%" stopColor={gradTo} />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#grad-${gradFrom})`} />
      {children}
    </svg>
  );
}

function OnuwTile() {
  return (
    <TileBase gradFrom="#1e1b4b" gradTo="#0f172a">
      {/* Moon */}
      <circle cx="240" cy="60" r="36" fill="#fef3c7" opacity="0.95" />
      <circle cx="252" cy="52" r="32" fill="#1e1b4b" />
      {/* Stars */}
      <circle cx="60" cy="30" r="1.5" fill="#fef3c7" />
      <circle cx="100" cy="50" r="1" fill="#fef3c7" />
      <circle cx="160" cy="20" r="1.5" fill="#fef3c7" />
      <circle cx="40" cy="80" r="1" fill="#fef3c7" />
      <circle cx="120" cy="22" r="1.2" fill="#fef3c7" />
      {/* Wolf silhouette */}
      <g transform="translate(40, 80)">
        <path
          d="M0 60 L20 30 L30 38 L45 38 L55 30 L75 60 L70 90 Q40 100 5 90 Z"
          fill="#0b0f17"
          stroke="#dc2626"
          strokeWidth="2"
        />
        <polygon points="38,68 42,80 46,68" fill="#dc2626" />
        <circle cx="28" cy="58" r="3" fill="#dc2626" />
        <circle cx="62" cy="58" r="3" fill="#dc2626" />
      </g>
      {/* Trees */}
      <polygon points="180,180 200,130 220,180" fill="#0b0f17" />
      <polygon points="210,180 230,120 250,180" fill="#0b0f17" />
      <polygon points="260,180 280,135 300,180" fill="#0b0f17" />
    </TileBase>
  );
}

function AvalonTile() {
  return (
    <TileBase gradFrom="#1e3a8a" gradTo="#0c1d4d">
      {/* Round table */}
      <ellipse cx="160" cy="135" rx="120" ry="18" fill="#0b0f17" opacity="0.5" />
      <ellipse cx="160" cy="125" rx="110" ry="32" fill="#1f2937" stroke="#cbd5e1" strokeWidth="2" />
      <ellipse cx="160" cy="123" rx="92" ry="22" fill="#374151" />
      {/* Crown emblem */}
      <g transform="translate(132, 32)">
        <path d="M2 30 L12 8 L22 30 L32 4 L42 30 L52 8 L62 30 L58 46 H6 Z" fill="#fbbf24" stroke="#854d0e" strokeWidth="1.5" />
        <rect x="6" y="46" width="52" height="6" fill="#854d0e" />
        <circle cx="32" cy="20" r="3" fill="#dc2626" />
        <circle cx="14" cy="26" r="2" fill="#3b82f6" />
        <circle cx="50" cy="26" r="2" fill="#3b82f6" />
      </g>
      {/* Sword crossed */}
      <g transform="translate(60, 70)" opacity="0.5">
        <line x1="0" y1="50" x2="50" y2="0" stroke="#cbd5e1" strokeWidth="3" />
        <line x1="0" y1="0" x2="50" y2="50" stroke="#cbd5e1" strokeWidth="3" />
      </g>
    </TileBase>
  );
}

function SecretHitlerTile() {
  return (
    <TileBase gradFrom="#7f1d1d" gradTo="#1c1917">
      {/* Stylized envelope / policy stack */}
      <g transform="translate(60, 50)">
        <rect x="0" y="0" width="200" height="80" rx="4" fill="#f1f5f9" stroke="#0b0f17" strokeWidth="2" />
        <path d="M0 0 L100 50 L200 0" fill="none" stroke="#0b0f17" strokeWidth="2" />
        <rect x="180" y="-10" width="40" height="30" rx="2" fill="#dc2626" stroke="#0b0f17" strokeWidth="1.5" />
        <text x="200" y="10" textAnchor="middle" fontSize="14" fill="#fef3c7" fontWeight="700">
          ★
        </text>
      </g>
    </TileBase>
  );
}

function CodenamesTile() {
  // 5×5 grid of red / blue / tan / one black assassin tile.
  // Hand-picked layout so red and blue look balanced and the assassin pops.
  const palette = [
    'r', 'r', 't', 'b', 'r',
    't', 'b', 'r', 'b', 't',
    'r', 't', 'k', 't', 'b',
    'b', 'r', 'b', 'r', 't',
    't', 'b', 'r', 't', 'b',
  ];
  const colorMap: Record<string, string> = {
    r: '#dc2626',
    b: '#2563eb',
    t: '#e7d7a5',
    k: '#0a0a0a',
  };
  return (
    <TileBase gradFrom="#0f172a" gradTo="#1c1917">
      <g transform="translate(58, 18)">
        {palette.map((c, i) => {
          const x = (i % 5) * 42;
          const y = Math.floor(i / 5) * 30;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width="38"
              height="26"
              rx="3"
              fill={colorMap[c]}
              stroke={c === 'k' ? '#fbbf24' : 'rgba(0,0,0,0.3)'}
              strokeWidth={c === 'k' ? 1.5 : 1}
            />
          );
        })}
      </g>
    </TileBase>
  );
}

function CrossCluesTile() {
  // 5x5 grid with row/col header bars (echoing the coord-card concept) plus
  // one green and one red token to telegraph the hit/miss tokens you place
  // during play.
  return (
    <TileBase gradFrom="#0f766e" gradTo="#134e4a">
      <g transform="translate(64, 14)">
        {/* Column header bar */}
        <rect x="32" y="0" width="160" height="14" rx="3" fill="#0b1220" opacity="0.65" />
        {Array.from({ length: 5 }, (_, c) => (
          <text
            key={`ch-${c}`}
            x={32 + c * 32 + 16}
            y={11}
            textAnchor="middle"
            fontSize="9"
            fill="#5eead4"
            fontWeight="700"
          >
            {c + 1}
          </text>
        ))}
        {/* Row header bar */}
        <rect x="0" y="20" width="28" height="128" rx="3" fill="#0b1220" opacity="0.65" />
        {Array.from({ length: 5 }, (_, r) => (
          <text
            key={`rh-${r}`}
            x={14}
            y={20 + r * 26 + 17}
            textAnchor="middle"
            fontSize="11"
            fill="#5eead4"
            fontWeight="700"
          >
            {String.fromCharCode(65 + r)}
          </text>
        ))}
        {/* 5x5 grid of cells */}
        {Array.from({ length: 25 }, (_, i) => {
          const r = Math.floor(i / 5);
          const c = i % 5;
          const x = 32 + c * 32;
          const y = 20 + r * 26;
          // Sparse token placement so the tile reads as "mid-game".
          const isGreen = (r === 1 && c === 2) || (r === 3 && c === 4);
          const isRed = r === 2 && c === 1;
          const fill = isGreen ? '#22c55e' : isRed ? '#ef4444' : '#1e293b';
          const stroke = isGreen || isRed ? '#f1f5f9' : '#334155';
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width="28"
              height="22"
              rx="3"
              fill={fill}
              stroke={stroke}
              strokeWidth={isGreen || isRed ? 1.5 : 1}
            />
          );
        })}
      </g>
    </TileBase>
  );
}

function LoveLetterTile() {
  // Sealed wax-stamped envelope on rose gradient — pure visual cue: a love
  // letter, sealed, with a small heart wax seal. Plus a tiny stack of cards
  // off to the side to hint at the deck-driven gameplay.
  return (
    <TileBase gradFrom="#831843" gradTo="#1c1917">
      {/* Envelope body */}
      <g transform="translate(48, 50)">
        <rect
          x="0"
          y="0"
          width="180"
          height="100"
          rx="6"
          fill="#fce7f3"
          stroke="#831843"
          strokeWidth="2"
        />
        {/* Flap */}
        <path d="M0 0 L90 56 L180 0" fill="#fbcfe8" stroke="#831843" strokeWidth="2" />
        {/* Wax seal */}
        <circle cx="90" cy="58" r="14" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.5" />
        <path
          d="M84 56 Q84 51 90 53 Q96 51 96 56 Q96 62 90 66 Q84 62 84 56 Z"
          fill="#fef3c7"
        />
      </g>
      {/* Mini card stack */}
      <g transform="translate(244, 110) rotate(-12)">
        <rect width="44" height="60" rx="4" fill="#be185d" stroke="#fbbf24" strokeWidth="1.5" />
        <rect x="-4" y="-4" width="44" height="60" rx="4" fill="#831843" stroke="#fbbf24" strokeWidth="1.5" />
        <rect x="-8" y="-8" width="44" height="60" rx="4" fill="#4c1d95" stroke="#fbbf24" strokeWidth="1.5" />
      </g>
      {/* Small hearts */}
      <g fill="#fbbf24" opacity="0.7">
        <path d="M20 30 a4 4 0 0 1 8 0 a4 4 0 0 1 8 0 c0 4 -8 10 -8 10 c0 0 -8 -6 -8 -10 z" />
      </g>
    </TileBase>
  );
}

function CoupTile() {
  return (
    <TileBase gradFrom="#854d0e" gradTo="#1c1917">
      {/* Coin stacks */}
      <g transform="translate(40, 70)">
        <ellipse cx="0" cy="0" rx="30" ry="10" fill="#fbbf24" stroke="#854d0e" strokeWidth="1.5" />
        <rect x="-30" y="-22" width="60" height="22" fill="#fbbf24" />
        <ellipse cx="0" cy="-22" rx="30" ry="10" fill="#fde047" stroke="#854d0e" strokeWidth="1.5" />
        <rect x="-30" y="-44" width="60" height="22" fill="#fbbf24" />
        <ellipse cx="0" cy="-44" rx="30" ry="10" fill="#fde047" stroke="#854d0e" strokeWidth="1.5" />
      </g>
      {/* Mask */}
      <g transform="translate(180, 50)">
        <path
          d="M0 30 Q60 0 120 30 Q120 60 60 80 Q0 60 0 30 Z"
          fill="#7f1d1d"
          stroke="#fde047"
          strokeWidth="2.5"
        />
        <ellipse cx="40" cy="34" rx="10" ry="6" fill="#0b0f17" />
        <ellipse cx="80" cy="34" rx="10" ry="6" fill="#0b0f17" />
      </g>
    </TileBase>
  );
}

function SkullTile() {
  // Stylized skull motif over crimson-on-black, with a rose offset to one
  // side to telegraph the dual disk-types.
  return (
    <TileBase gradFrom="#7f1d1d" gradTo="#0b0f17">
      <g transform="translate(120, 36)">
        {/* Skull head */}
        <path
          d="M40 0 Q80 0 80 40 L80 70 L60 70 L60 90 L20 90 L20 70 L0 70 L0 40 Q0 0 40 0 Z"
          fill="#f1f5f9"
          stroke="#0b0f17"
          strokeWidth="2"
        />
        {/* Eyes */}
        <ellipse cx="20" cy="40" rx="9" ry="11" fill="#0b0f17" />
        <ellipse cx="60" cy="40" rx="9" ry="11" fill="#0b0f17" />
        {/* Nose */}
        <path d="M40 50 L34 64 L40 70 L46 64 Z" fill="#0b0f17" />
        {/* Teeth */}
        <line x1="20" y1="78" x2="60" y2="78" stroke="#0b0f17" strokeWidth="2" />
        <line x1="32" y1="78" x2="32" y2="90" stroke="#0b0f17" strokeWidth="2" />
        <line x1="48" y1="78" x2="48" y2="90" stroke="#0b0f17" strokeWidth="2" />
      </g>
      {/* Rose */}
      <g transform="translate(48, 110)">
        <circle cx="20" cy="20" r="20" fill="#fce7f3" stroke="#831843" strokeWidth="2" />
        <circle cx="20" cy="20" r="12" fill="#f472b6" />
        <circle cx="20" cy="20" r="6" fill="#831843" />
      </g>
    </TileBase>
  );
}

function LiarsDiceTile() {
  // A cluster of three dice tilted, partially behind a tipping leather cup.
  return (
    <TileBase gradFrom="#1e40af" gradTo="#0b0f17">
      {/* Cup */}
      <g transform="translate(40, 70)">
        <path d="M0 0 L70 0 L60 80 L10 80 Z" fill="#7c2d12" stroke="#fde047" strokeWidth="2" />
        <ellipse cx="35" cy="0" rx="35" ry="8" fill="#92400e" stroke="#fde047" strokeWidth="2" />
      </g>
      {/* Dice */}
      <g transform="translate(160, 50) rotate(-12)">
        <rect x="0" y="0" width="42" height="42" rx="6" fill="#f8fafc" stroke="#0b0f17" strokeWidth="2" />
        <circle cx="12" cy="12" r="3" fill="#dc2626" />
        <circle cx="30" cy="30" r="3" fill="#0b0f17" />
        <circle cx="12" cy="30" r="3" fill="#0b0f17" />
        <circle cx="30" cy="12" r="3" fill="#0b0f17" />
      </g>
      <g transform="translate(210, 100) rotate(15)">
        <rect x="0" y="0" width="42" height="42" rx="6" fill="#f8fafc" stroke="#0b0f17" strokeWidth="2" />
        <circle cx="21" cy="21" r="3" fill="#0b0f17" />
        <circle cx="10" cy="10" r="3" fill="#0b0f17" />
        <circle cx="32" cy="10" r="3" fill="#0b0f17" />
        <circle cx="10" cy="32" r="3" fill="#0b0f17" />
        <circle cx="32" cy="32" r="3" fill="#0b0f17" />
      </g>
      <g transform="translate(255, 50) rotate(-5)">
        <rect x="0" y="0" width="42" height="42" rx="6" fill="#f8fafc" stroke="#0b0f17" strokeWidth="2" />
        <circle cx="21" cy="21" r="3" fill="#0b0f17" />
      </g>
    </TileBase>
  );
}

function LiarsPokerTile() {
  // Fan of poker cards with a clear flush motif.
  return (
    <TileBase gradFrom="#14532d" gradTo="#0b0f17">
      <g transform="translate(60, 30)">
        {/* Card 1: A♠ */}
        <g transform="translate(0, 30) rotate(-25)">
          <rect width="50" height="70" rx="5" fill="#f8fafc" stroke="#0b0f17" strokeWidth="1.5" />
          <text x="8" y="20" fontSize="14" fontWeight="700" fill="#0b0f17">A</text>
          <text x="8" y="36" fontSize="14" fill="#0b0f17">♠</text>
        </g>
        {/* Card 2: K♠ */}
        <g transform="translate(40, 18) rotate(-12)">
          <rect width="50" height="70" rx="5" fill="#f8fafc" stroke="#0b0f17" strokeWidth="1.5" />
          <text x="8" y="20" fontSize="14" fontWeight="700" fill="#0b0f17">K</text>
          <text x="8" y="36" fontSize="14" fill="#0b0f17">♠</text>
        </g>
        {/* Card 3: Q♥ */}
        <g transform="translate(85, 12)">
          <rect width="50" height="70" rx="5" fill="#f8fafc" stroke="#0b0f17" strokeWidth="1.5" />
          <text x="8" y="20" fontSize="14" fontWeight="700" fill="#b91c1c">Q</text>
          <text x="8" y="36" fontSize="14" fill="#b91c1c">♥</text>
        </g>
        {/* Card 4: J♠ */}
        <g transform="translate(130, 18) rotate(12)">
          <rect width="50" height="70" rx="5" fill="#f8fafc" stroke="#0b0f17" strokeWidth="1.5" />
          <text x="8" y="20" fontSize="14" fontWeight="700" fill="#0b0f17">J</text>
          <text x="8" y="36" fontSize="14" fill="#0b0f17">♠</text>
        </g>
        {/* Card 5: 10♠ */}
        <g transform="translate(170, 30) rotate(25)">
          <rect width="50" height="70" rx="5" fill="#f8fafc" stroke="#0b0f17" strokeWidth="1.5" />
          <text x="6" y="20" fontSize="13" fontWeight="700" fill="#0b0f17">10</text>
          <text x="8" y="36" fontSize="14" fill="#0b0f17">♠</text>
        </g>
      </g>
    </TileBase>
  );
}

function CockroachPokerTile() {
  // Three creature icons (cockroach, spider, rat) flanking a face-down card.
  return (
    <TileBase gradFrom="#4d7c0f" gradTo="#1c1917">
      {/* Card back center */}
      <g transform="translate(130, 50)">
        <rect width="60" height="80" rx="6" fill="#1e3a8a" stroke="#fbbf24" strokeWidth="2" />
        <rect x="6" y="6" width="48" height="68" rx="3" fill="none" stroke="#fbbf24" strokeWidth="1" />
        <text x="30" y="48" fontSize="28" textAnchor="middle">🪳</text>
      </g>
      {/* Creature icons */}
      <text x="36" y="80" fontSize="32" textAnchor="middle">🕷</text>
      <text x="36" y="135" fontSize="32" textAnchor="middle">🐀</text>
      <text x="270" y="80" fontSize="32" textAnchor="middle">🐸</text>
      <text x="270" y="135" fontSize="32" textAnchor="middle">🦂</text>
    </TileBase>
  );
}
