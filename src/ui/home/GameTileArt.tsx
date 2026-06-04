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
