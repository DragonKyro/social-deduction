import type { CSSProperties } from 'react';
import { CHARACTERS } from '../characters';
import type { CoupCharacter } from '../state';

// ============================================================================
// SVG character art for Coup. Card-style 100×108 shield with a category-
// colored gradient + a glyph per character. Style matches ONUW / Avalon
// role art so the look is consistent across games.
// ============================================================================

export interface CharacterArtProps {
  character: CoupCharacter;
  size?: number;
  style?: CSSProperties;
  faded?: boolean;
}

interface Palette {
  primary: string;
  secondary: string;
  emblem: string;
  rim: string;
}

const CLASSIC: Palette = {
  primary: '#1f2937',
  secondary: '#0f172a',
  emblem: '#fbbf24',
  rim: '#fde68a',
};
const FINANCE: Palette = {
  primary: '#14532d',
  secondary: '#166534',
  emblem: '#bbf7d0',
  rim: '#86efac',
};
const COMMS: Palette = {
  primary: '#1e3a8a',
  secondary: '#1e40af',
  emblem: '#bfdbfe',
  rim: '#93c5fd',
};
const FORCE: Palette = {
  primary: '#7f1d1d',
  secondary: '#991b1b',
  emblem: '#fecaca',
  rim: '#fca5a5',
};
const SPECIAL: Palette = {
  primary: '#581c87',
  secondary: '#6b21a8',
  emblem: '#f5d0fe',
  rim: '#e9d5ff',
};
const MOVEMENT: Palette = {
  primary: '#0f766e',
  secondary: '#0d9488',
  emblem: '#a7f3d0',
  rim: '#6ee7b7',
};
const ANARCHY: Palette = {
  primary: '#7c2d12',
  secondary: '#c2410c',
  emblem: '#fdba74',
  rim: '#fed7aa',
};

function paletteFor(c: CoupCharacter): Palette {
  const cat = CHARACTERS[c].category;
  switch (cat) {
    case 'classic':
      return CLASSIC;
    case 'finance':
      return FINANCE;
    case 'communications':
      return COMMS;
    case 'force':
      return FORCE;
    case 'specialInterest':
      return SPECIAL;
    case 'movement':
      return MOVEMENT;
    case 'anarchy':
      return ANARCHY;
  }
}

// Each character gets a small glyph centered on the shield (50×56). The
// glyphs use fill={p.emblem} so they pick up the per-character palette.
function Glyph({ character, p }: { character: CoupCharacter; p: Palette }) {
  switch (character) {
    case 'duke':
    case 'banker':
      // Crown
      return (
        <g fill={p.emblem}>
          <path d="M25 18 L35 32 L50 14 L65 32 L75 18 L72 42 L28 42 Z" stroke={p.rim} strokeWidth={1.5} />
          <circle cx={25} cy={18} r={3} />
          <circle cx={50} cy={14} r={3.5} />
          <circle cx={75} cy={18} r={3} />
        </g>
      );
    case 'assassin':
    case 'assassinG54':
    case 'soldier':
      // Dagger
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1}>
          <path d="M50 8 L56 38 L50 50 L44 38 Z" />
          <rect x={42} y={38} width={16} height={5} />
          <path d="M50 43 L50 56" stroke={p.emblem} strokeWidth={3} />
        </g>
      );
    case 'captain':
    case 'thief':
      // Hook / anchor
      return (
        <g fill="none" stroke={p.emblem} strokeWidth={4} strokeLinecap="round">
          <circle cx={50} cy={16} r={6} stroke={p.emblem} fill={p.rim} />
          <path d="M50 22 L50 46" />
          <path d="M30 36 Q30 52 50 52 Q70 52 70 36" />
          <path d="M36 32 L64 32" />
        </g>
      );
    case 'ambassador':
    case 'inquisitor':
      // Scroll
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <rect x={26} y={14} width={48} height={36} rx={4} />
          <path d="M32 22 L68 22 M32 30 L68 30 M32 38 L60 38" stroke={p.primary} strokeWidth={1.5} fill="none" />
        </g>
      );
    case 'contessa':
      // Shield with cross
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={2}>
          <path d="M50 10 L72 18 L70 38 Q70 52 50 56 Q30 52 30 38 L28 18 Z" />
          <path d="M50 18 L50 48 M36 32 L64 32" stroke={p.primary} strokeWidth={3} fill="none" />
        </g>
      );
    case 'taxCollector':
      // Coin stack
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <ellipse cx={50} cy={44} rx={20} ry={5} />
          <ellipse cx={50} cy={36} rx={20} ry={5} />
          <ellipse cx={50} cy={28} rx={20} ry={5} />
          <ellipse cx={50} cy={20} rx={20} ry={5} />
        </g>
      );
    case 'mercenary':
      // Two crossed swords
      return (
        <g fill="none" stroke={p.emblem} strokeWidth={3} strokeLinecap="round">
          <path d="M28 12 L72 52" />
          <path d="M72 12 L28 52" />
          <circle cx={50} cy={32} r={4} fill={p.rim} />
        </g>
      );
    case 'spy':
      // Eye
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <ellipse cx={50} cy={32} rx={20} ry={12} />
          <circle cx={50} cy={32} r={6} fill={p.primary} />
          <circle cx={52} cy={30} r={2} fill={p.emblem} />
        </g>
      );
    case 'plantationOwner':
      // Wheat
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <path d="M50 12 L50 54" stroke={p.emblem} strokeWidth={3} />
          <ellipse cx={42} cy={20} rx={4} ry={8} transform="rotate(-20 42 20)" />
          <ellipse cx={58} cy={20} rx={4} ry={8} transform="rotate(20 58 20)" />
          <ellipse cx={42} cy={32} rx={4} ry={8} transform="rotate(-20 42 32)" />
          <ellipse cx={58} cy={32} rx={4} ry={8} transform="rotate(20 58 32)" />
          <ellipse cx={42} cy={44} rx={4} ry={8} transform="rotate(-20 42 44)" />
          <ellipse cx={58} cy={44} rx={4} ry={8} transform="rotate(20 58 44)" />
        </g>
      );
    case 'capitalist':
    case 'financier':
      // Top hat + dollar
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <rect x={32} y={12} width={36} height={22} />
          <rect x={26} y={32} width={48} height={4} />
          <text
            x={50}
            y={56}
            textAnchor="middle"
            fontSize={20}
            fontWeight={700}
            fontFamily="sans-serif"
            fill={p.emblem}
          >
            $
          </text>
        </g>
      );
    case 'speculator':
      // Chart line up
      return (
        <g fill="none" stroke={p.emblem} strokeWidth={3} strokeLinecap="round">
          <path d="M20 50 L36 36 L48 42 L72 18" />
          <path d="M72 18 L62 18 M72 18 L72 28" />
        </g>
      );
    case 'treasurer':
      // Two coins exchanging
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <circle cx={35} cy={32} r={14} />
          <circle cx={65} cy={32} r={14} />
          <path d="M28 50 L72 50" stroke={p.emblem} strokeWidth={2} />
          <text x={35} y={37} textAnchor="middle" fontSize={14} fill={p.primary}>$</text>
          <text x={65} y={37} textAnchor="middle" fontSize={14} fill={p.primary}>$</text>
        </g>
      );
    case 'newscaster':
    case 'reporter':
      // Microphone
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <rect x={42} y={14} width={16} height={22} rx={8} />
          <path d="M34 30 Q34 44 50 44 Q66 44 66 30" fill="none" stroke={p.emblem} strokeWidth={2} />
          <path d="M50 44 L50 54" stroke={p.emblem} strokeWidth={3} />
        </g>
      );
    case 'producer':
      // Clapper / video
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <rect x={22} y={28} width={56} height={28} />
          <path d="M22 16 L78 22 L78 28 L22 28 Z" />
          <path d="M30 16 L34 24 M44 16 L48 24 M58 16 L62 24" stroke={p.primary} strokeWidth={1.5} />
        </g>
      );
    case 'lobbyist':
      // Briefcase
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <rect x={22} y={24} width={56} height={32} rx={3} />
          <rect x={38} y={16} width={24} height={10} />
          <path d="M22 38 L78 38" stroke={p.primary} strokeWidth={1.5} />
        </g>
      );
    case 'guerrilla':
      // Bandana / star
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <path d="M50 12 L58 32 L78 32 L62 44 L68 64 L50 52 L32 64 L38 44 L22 32 L42 32 Z" />
        </g>
      );
    case 'judge':
      // Gavel
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <rect x={20} y={50} width={60} height={6} />
          <rect x={30} y={16} width={24} height={12} transform="rotate(-30 42 22)" />
          <rect x={36} y={22} width={28} height={6} transform="rotate(60 50 28)" />
        </g>
      );
    case 'mayor':
      // City building
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <rect x={28} y={28} width={44} height={28} />
          <path d="M22 28 L50 12 L78 28" />
          <rect x={36} y={36} width={6} height={6} fill={p.primary} />
          <rect x={48} y={36} width={6} height={6} fill={p.primary} />
          <rect x={58} y={36} width={6} height={6} fill={p.primary} />
        </g>
      );
    case 'priest':
      // Cross
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <rect x={44} y={12} width={12} height={48} />
          <rect x={28} y={28} width={44} height={12} />
        </g>
      );
    case 'lawyer':
      // Scales of justice
      return (
        <g fill="none" stroke={p.emblem} strokeWidth={2.5} strokeLinecap="round">
          <path d="M50 14 L50 54" />
          <path d="M30 24 L70 24" />
          <path d="M30 24 L24 38 L36 38 Z" fill={p.emblem} />
          <path d="M70 24 L64 38 L76 38 Z" fill={p.emblem} />
        </g>
      );
    case 'bishop':
      // Mitre
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <path d="M50 10 Q40 22 36 38 L36 56 L64 56 L64 38 Q60 22 50 10 Z" />
          <path d="M50 26 L50 50 M40 36 L60 36" stroke={p.primary} strokeWidth={2} fill="none" />
        </g>
      );
    case 'protestor':
      // Raised fist
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <rect x={36} y={24} width={28} height={26} rx={4} />
          <rect x={34} y={20} width={32} height={8} rx={3} />
          <rect x={42} y={50} width={16} height={10} />
        </g>
      );
    case 'peacekeeper':
      // Dove / shield
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <path d="M50 14 L66 24 L62 44 Q56 56 50 58 Q44 56 38 44 L34 24 Z" />
          <circle cx={50} cy={28} r={3} fill={p.primary} />
          <circle cx={50} cy={28} r={1.5} fill={p.emblem} />
        </g>
      );
    case 'foreignConsular':
      // Handshake
      return (
        <g fill="none" stroke={p.emblem} strokeWidth={3} strokeLinecap="round">
          <path d="M22 36 L36 30 L48 38 L60 30 L72 36" />
          <path d="M40 38 L40 50 M58 38 L58 50" />
          <path d="M36 50 L62 50" stroke={p.emblem} strokeWidth={3} />
        </g>
      );
    case 'diplomat':
      // Envelope
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <rect x={22} y={20} width={56} height={32} />
          <path d="M22 20 L50 40 L78 20" fill="none" stroke={p.primary} strokeWidth={2} />
        </g>
      );
    case 'anarchist':
      // Circled A
      return (
        <g fill="none" stroke={p.emblem} strokeWidth={3.5} strokeLinecap="round">
          <circle cx={50} cy={34} r={20} />
          <path d="M40 44 L50 22 L60 44 M44 38 L56 38" />
        </g>
      );
    case 'armsDealer':
      // Crossed rifles
      return (
        <g fill="none" stroke={p.emblem} strokeWidth={3} strokeLinecap="round">
          <path d="M22 14 L74 50" />
          <path d="M74 14 L22 50" />
          <circle cx={48} cy={32} r={3} fill={p.rim} />
        </g>
      );
    case 'paramilitary':
      // Helmet
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <path d="M22 38 Q22 16 50 16 Q78 16 78 38 L78 44 L22 44 Z" />
          <rect x={22} y={44} width={56} height={6} />
        </g>
      );
    case 'socialist':
      // Equality bars
      return (
        <g fill={p.emblem} stroke={p.rim} strokeWidth={1.5}>
          <rect x={26} y={24} width={48} height={8} />
          <rect x={26} y={36} width={48} height={8} />
          <rect x={26} y={48} width={48} height={8} />
        </g>
      );
    case 'worldBank':
      // Globe + coin
      return (
        <g fill="none" stroke={p.emblem} strokeWidth={2}>
          <circle cx={50} cy={32} r={18} fill={p.rim} stroke={p.emblem} />
          <ellipse cx={50} cy={32} rx={18} ry={8} />
          <path d="M32 32 L68 32 M50 14 L50 50" />
        </g>
      );
    default:
      // Generic question-mark glyph for unimplemented characters.
      return (
        <g fill={p.emblem}>
          <text
            x={50}
            y={42}
            textAnchor="middle"
            fontSize={36}
            fontWeight={700}
            fontFamily="sans-serif"
          >
            ?
          </text>
        </g>
      );
  }
}

export function CharacterArt({ character, size = 100, style, faded }: CharacterArtProps) {
  const p = paletteFor(character);
  const id = `coupGrad-${character}`;
  const ratio = 108 / 100;
  return (
    <svg
      viewBox="0 0 100 108"
      width={size}
      height={size * ratio}
      style={{ opacity: faded ? 0.45 : 1, ...style }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.secondary} />
          <stop offset="1" stopColor={p.primary} />
        </linearGradient>
      </defs>
      <rect x={2} y={2} width={96} height={104} rx={10} fill={`url(#${id})`} stroke={p.rim} strokeWidth={2} />
      <Glyph character={character} p={p} />
      <text
        x={50}
        y={92}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill={p.emblem}
        letterSpacing="0.04em"
      >
        {CHARACTERS[character].name.toUpperCase().slice(0, 14)}
      </text>
    </svg>
  );
}

export function CategoryBadge({ character }: { character: CoupCharacter }) {
  const cat = CHARACTERS[character].category;
  const colorMap: Record<string, string> = {
    classic: '#fbbf24',
    finance: '#86efac',
    communications: '#93c5fd',
    force: '#fca5a5',
    specialInterest: '#d8b4fe',
    movement: '#5eead4',
    anarchy: '#fdba74',
  };
  const labelMap: Record<string, string> = {
    classic: 'Classic',
    finance: 'Finance',
    communications: 'Comms',
    force: 'Force',
    specialInterest: 'Special',
    movement: 'Movement',
    anarchy: 'Anarchy',
  };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        background: '#0b0f17',
        border: `1px solid ${colorMap[cat]}`,
        color: colorMap[cat],
        borderRadius: 4,
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {labelMap[cat]}
    </span>
  );
}
