import type { CSSProperties } from 'react';
import type { AvalonRoleId } from '../state';

// Stylized SVG role art for Avalon. All rendered into a square shield with
// per-role colors + a unique central emblem. Good roles use blue/silver,
// evil uses red/black. Special roles get distinct emblems so the role-
// reveal screen reads at a glance.

export interface RoleArtProps {
  role: AvalonRoleId;
  size?: number;
  style?: CSSProperties;
}

type Palette = { primary: string; secondary: string; emblem: string; rim: string };

const GOOD: Palette = {
  primary: '#1e3a8a', // deep blue
  secondary: '#3b82f6', // bright blue
  emblem: '#fef3c7', // ivory
  rim: '#cbd5e1',
};

const EVIL: Palette = {
  primary: '#7f1d1d', // dark red
  secondary: '#dc2626',
  emblem: '#fca5a5',
  rim: '#52525b',
};

const PERCIVAL_PALETTE: Palette = {
  primary: '#1d3b66',
  secondary: '#60a5fa',
  emblem: '#fde68a',
  rim: '#cbd5e1',
};

const MORGANA_PALETTE: Palette = {
  primary: '#581c87',
  secondary: '#a855f7',
  emblem: '#f5d0fe',
  rim: '#52525b',
};

const MORDRED_PALETTE: Palette = {
  primary: '#3f0d12',
  secondary: '#9f1239',
  emblem: '#fda4af',
  rim: '#0f172a',
};

const OBERON_PALETTE: Palette = {
  primary: '#1c1917',
  secondary: '#78716c',
  emblem: '#fbbf24',
  rim: '#000',
};

function paletteFor(role: AvalonRoleId): Palette {
  switch (role) {
    case 'merlin':
      return GOOD;
    case 'percival':
      return PERCIVAL_PALETTE;
    case 'loyalServant':
    case 'lancelotGood':
      return GOOD;
    case 'morgana':
      return MORGANA_PALETTE;
    case 'mordred':
      return MORDRED_PALETTE;
    case 'oberon':
      return OBERON_PALETTE;
    case 'assassin':
    case 'minionOfMordred':
    case 'lancelotEvil':
      return EVIL;
  }
}

// Shield outline shared by every role.
function Shield({ p }: { p: Palette }) {
  return (
    <>
      <defs>
        <linearGradient id={`bg-${p.primary}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={p.secondary} />
          <stop offset="100%" stopColor={p.primary} />
        </linearGradient>
      </defs>
      <path
        d="M50 6 L92 18 V52 C92 76 72 92 50 102 C28 92 8 76 8 52 V18 Z"
        fill={`url(#bg-${p.primary})`}
        stroke={p.rim}
        strokeWidth="2"
      />
    </>
  );
}

// Per-role central emblem.
function Emblem({ role, p }: { role: AvalonRoleId; p: Palette }) {
  switch (role) {
    case 'merlin':
      // Wizard hat + stars
      return (
        <g fill={p.emblem}>
          <path d="M50 22 L62 62 H38 Z" />
          <circle cx="50" cy="36" r="2.5" fill={p.primary} />
          <path d="M36 64 H64 L66 70 H34 Z" />
          <g fill={p.emblem}>
            <circle cx="28" cy="40" r="1.5" />
            <circle cx="74" cy="48" r="1.5" />
            <circle cx="30" cy="62" r="1" />
            <circle cx="72" cy="70" r="1.2" />
          </g>
        </g>
      );
    case 'percival':
      // Eye of insight — Percival sees Merlin & Morgana
      return (
        <g fill={p.emblem}>
          <path
            d="M30 50 Q50 30 70 50 Q50 70 30 50 Z"
            stroke={p.primary}
            strokeWidth="1.5"
          />
          <circle cx="50" cy="50" r="7" fill={p.primary} />
          <circle cx="50" cy="50" r="3" fill={p.emblem} />
        </g>
      );
    case 'loyalServant':
      // Cross + laurel
      return (
        <g fill={p.emblem} stroke={p.primary} strokeWidth="0.8">
          <rect x="46" y="28" width="8" height="42" />
          <rect x="34" y="42" width="32" height="8" />
          <path d="M26 60 Q34 70 50 72 Q66 70 74 60" fill="none" stroke={p.emblem} strokeWidth="2" />
        </g>
      );
    case 'assassin':
      // Crossed daggers
      return (
        <g stroke={p.emblem} strokeWidth="4" fill="none">
          <line x1="30" y1="28" x2="70" y2="72" strokeLinecap="round" />
          <line x1="70" y1="28" x2="30" y2="72" strokeLinecap="round" />
          <circle cx="50" cy="50" r="5" fill={p.emblem} />
        </g>
      );
    case 'morgana':
      // Inverted hat / cursed merlin
      return (
        <g fill={p.emblem}>
          <path d="M50 22 L62 62 H38 Z" />
          <circle cx="50" cy="36" r="2.5" fill={p.primary} />
          <path d="M36 64 H64 L66 70 H34 Z" />
          {/* slash across the hat — visually different from Merlin */}
          <path d="M30 28 L72 70" stroke={p.primary} strokeWidth="3" fill="none" />
        </g>
      );
    case 'mordred':
      // Crown of thorns
      return (
        <g fill={p.emblem}>
          <path d="M26 48 L34 30 L42 48 L50 28 L58 48 L66 30 L74 48 L70 62 H30 Z" />
          <rect x="30" y="62" width="40" height="6" />
        </g>
      );
    case 'oberon':
      // Lone wolf head silhouette
      return (
        <g fill={p.emblem}>
          <path d="M30 38 L42 30 L46 36 L54 36 L58 30 L70 38 L66 58 Q50 70 34 58 Z" />
          <circle cx="42" cy="48" r="2" fill={p.primary} />
          <circle cx="58" cy="48" r="2" fill={p.primary} />
        </g>
      );
    case 'minionOfMordred':
      // Skull / generic evil
      return (
        <g fill={p.emblem}>
          <path d="M32 32 Q50 22 68 32 V58 Q50 70 32 58 Z" />
          <circle cx="42" cy="46" r="3" fill={p.primary} />
          <circle cx="58" cy="46" r="3" fill={p.primary} />
          <rect x="46" y="58" width="3" height="6" fill={p.primary} />
          <rect x="51" y="58" width="3" height="6" fill={p.primary} />
        </g>
      );
    case 'lancelotGood':
    case 'lancelotEvil':
      // Sword
      return (
        <g fill={p.emblem} stroke={p.primary} strokeWidth="0.8">
          <rect x="48" y="22" width="4" height="46" />
          <rect x="40" y="32" width="20" height="4" />
          <circle cx="50" cy="72" r="4" />
        </g>
      );
  }
}

export function RoleArt({ role, size = 96, style }: RoleArtProps) {
  const p = paletteFor(role);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 108"
      style={style}
      role="img"
      aria-label={role}
    >
      <Shield p={p} />
      <Emblem role={role} p={p} />
    </svg>
  );
}

// Tiny alignment badge — used in the bottom corner of the role reveal card.
export function AlignmentBadge({ alignment, size = 16 }: { alignment: 'good' | 'evil'; size?: number }) {
  const color = alignment === 'good' ? '#3b82f6' : '#dc2626';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={alignment}>
      <circle cx="8" cy="8" r="7" fill={color} stroke="#0b0f17" strokeWidth="1.5" />
    </svg>
  );
}
