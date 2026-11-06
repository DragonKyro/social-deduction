import { memo } from 'react';
import type { CSSProperties } from 'react';
import { useSvgIds } from '@/ui/shared/svg';
import { CHARACTERS } from '../characters';
import type { CoupCategory } from '../characters';
import type { CoupCharacter } from '../state';
import { Portrait } from './portraits';
import type { PortraitPalette, SvgIds } from './portraits';

// ============================================================================
// Coup card art — "gilded dystopian court".
//
// Every character is a framed portrait card (63:88): black lacquer body,
// double gold-leaf frame, arched portrait window, ribbon nameplate in Cinzel,
// and a category gem. The Classic five have painted busts; the rest carry a
// heraldic medallion (see portraits.tsx). `CardBack` is the shared ornate
// back used for every face-down influence and the court deck.
// ============================================================================

export const CARD_RATIO = 168 / 120;

interface CategoryTheme {
  label: string;
  short: string;
  gem: string;
  palette: PortraitPalette;
}

export const CATEGORY_THEME: Record<CoupCategory, CategoryTheme> = {
  classic: { label: 'Classic', short: 'Classic', gem: '#f3d27a', palette: { bg0: '#6b4a1e', bg1: '#1d1206', ink: '#2a1708' } },
  finance: { label: 'Finance', short: 'Finance', gem: '#4fd18b', palette: { bg0: '#2c8a5c', bg1: '#06261a', ink: '#082a1b' } },
  communications: { label: 'Communications', short: 'Comms', gem: '#6aa8ff', palette: { bg0: '#2f5fa8', bg1: '#081a36', ink: '#0a1d3d' } },
  force: { label: 'Force', short: 'Force', gem: '#ff6b6b', palette: { bg0: '#9c2230', bg1: '#2a050b', ink: '#33060d' } },
  specialInterest: { label: 'Special Interest', short: 'Special', gem: '#c58bff', palette: { bg0: '#6f3aa6', bg1: '#1d0833', ink: '#220a3b' } },
  movement: { label: 'Movement', short: 'Movement', gem: '#4fe0cf', palette: { bg0: '#1d8a80', bg1: '#04261f', ink: '#062b26' } },
  anarchy: { label: 'Anarchy', short: 'Anarchy', gem: '#ff9a4a', palette: { bg0: '#b4501c', bg1: '#2a0c03', ink: '#2f0e04' } },
};

function SharedDefs({ id }: { id: SvgIds }) {
  return (
    <>
      <linearGradient id={id('gold')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7a5418" />
        <stop offset="0.28" stopColor="#f3d27a" />
        <stop offset="0.5" stopColor="#b8862f" />
        <stop offset="0.72" stopColor="#fff1b8" />
        <stop offset="1" stopColor="#8a6420" />
      </linearGradient>
      <linearGradient id={id('silver')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8e96a3" />
        <stop offset="0.5" stopColor="#f2f5f8" />
        <stop offset="1" stopColor="#6b7280" />
      </linearGradient>
      <radialGradient id={id('skin')} cx="38%" cy="32%" r="78%">
        <stop offset="0" stopColor="#f6d6b8" />
        <stop offset="0.55" stopColor="#d9a17a" />
        <stop offset="1" stopColor="#99613f" />
      </radialGradient>
      <radialGradient id={id('vig')} cx="50%" cy="42%" r="70%">
        <stop offset="0.6" stopColor="#000" stopOpacity={0} />
        <stop offset="1" stopColor="#000" stopOpacity={0.55} />
      </radialGradient>
    </>
  );
}

const ARCH = 'M18 120 V44 Q18 15 60 13 Q102 15 102 44 V120 Z';

function Corner({ x, y, sx, sy, gold }: { x: number; y: number; sx: number; sy: number; gold: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${sx} ${sy})`}
      d="M0 12 Q0 0 12 0 M3 12 Q3 3 12 3 M0 6 q4 1 5 -2"
      stroke={gold}
      strokeWidth={1}
      fill="none"
    />
  );
}

export interface CharacterArtProps {
  character: CoupCharacter;
  /** Width in px; height follows the 63:88 card ratio. */
  size?: number;
  style?: CSSProperties;
  className?: string;
  faded?: boolean;
  /** Decorative (inside a labelled control) vs. an image with its own label. */
  decorative?: boolean;
}

export const CharacterArt = memo(function CharacterArt({
  character,
  size = 100,
  style,
  className,
  faded,
  decorative,
}: CharacterArtProps) {
  const id = useSvgIds();
  const spec = CHARACTERS[character];
  const theme = CATEGORY_THEME[spec.category];
  const name = spec.name.toUpperCase();
  const long = name.length > 11;
  return (
    <svg
      viewBox="0 0 120 168"
      width={size}
      height={size * CARD_RATIO}
      className={className}
      style={{ display: 'block', opacity: faded ? 0.45 : 1, ...style }}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : spec.name}
    >
      <defs>
        <SharedDefs id={id} />
        <clipPath id={id('arch')}>
          <path d={ARCH} />
        </clipPath>
        <linearGradient id={id('panel')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c1410" />
          <stop offset="1" stopColor="#0b0806" />
        </linearGradient>
      </defs>
      {/* lacquer body + gold frame */}
      <rect x={1} y={1} width={118} height={166} rx={9} fill="#0b0705" />
      <rect x={3.5} y={3.5} width={113} height={161} rx={7} fill={id.url('panel')} stroke={id.url('gold')} strokeWidth={3} />
      <rect x={8} y={8} width={104} height={152} rx={4} fill="none" stroke={id.url('gold')} strokeWidth={0.7} opacity={0.7} />
      {/* portrait */}
      <g clipPath={id.url('arch')}>
        <Portrait character={character} id={id} palette={theme.palette} />
        <rect x={0} y={0} width={120} height={130} fill={id.url('vig')} />
      </g>
      <path d={ARCH} fill="none" stroke={id.url('gold')} strokeWidth={2.4} />
      <path d={ARCH} fill="none" stroke="#3a2406" strokeWidth={0.6} transform="translate(0 1.2)" opacity={0.6} />
      {/* corner filigree */}
      <Corner x={11} y={11} sx={1} sy={1} gold={id.url('gold')} />
      <Corner x={109} y={11} sx={-1} sy={1} gold={id.url('gold')} />
      <Corner x={11} y={157} sx={1} sy={-1} gold={id.url('gold')} />
      <Corner x={109} y={157} sx={-1} sy={-1} gold={id.url('gold')} />
      {/* category gem */}
      <path d="M60 4.5 L64.5 9 L60 13.5 L55.5 9 Z" fill={theme.gem} stroke={id.url('gold')} strokeWidth={1} />
      {/* nameplate ribbon */}
      <path d="M10 126 H110 L104.5 136.5 L110 147 H10 L15.5 136.5 Z" fill={id.url('gold')} stroke="#4a300a" strokeWidth={0.7} />
      <path d="M14 129 H106 L102 136.5 L106 144 H14 L18 136.5 Z" fill="none" stroke="#4a300a" strokeWidth={0.5} opacity={0.6} />
      <text
        x={60}
        y={140.2}
        textAnchor="middle"
        style={{ fontFamily: "var(--font-regal)" }}
        fontWeight={700}
        fontSize={long ? 8.4 : 10.5}
        letterSpacing={long ? 0.2 : 0.8}
        fill="#2a1708"
        {...(name.length > 15 ? { textLength: 84, lengthAdjust: 'spacingAndGlyphs' as const } : {})}
      >
        {name}
      </text>
      {/* footer pips */}
      <text x={60} y={157} textAnchor="middle" style={{ fontFamily: "var(--font-regal)" }} fontSize={6} letterSpacing={1.2} fill="#c9a24a" opacity={0.85}>
        {theme.short.toUpperCase()}
      </text>
    </svg>
  );
});

/** Ornate card back shared by every face-down influence and the court deck. */
export const CardBack = memo(function CardBack({ size = 100, style, className }: { size?: number; style?: CSSProperties; className?: string }) {
  const id = useSvgIds();
  return (
    <svg
      viewBox="0 0 120 168"
      width={size}
      height={size * CARD_RATIO}
      className={className}
      style={{ display: 'block', ...style }}
      aria-hidden
    >
      <defs>
        <SharedDefs id={id} />
        <radialGradient id={id('back')} cx="50%" cy="45%" r="75%">
          <stop offset="0" stopColor="#6e1424" />
          <stop offset="0.6" stopColor="#3a0912" />
          <stop offset="1" stopColor="#1a0408" />
        </radialGradient>
        <pattern id={id('lattice')} width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={10} height={10} fill="none" stroke="#f3d27a" strokeOpacity={0.16} strokeWidth={0.8} />
          <circle cx={0} cy={0} r={1} fill="#f3d27a" fillOpacity={0.25} />
        </pattern>
      </defs>
      <rect x={1} y={1} width={118} height={166} rx={9} fill="#0b0705" />
      <rect x={3.5} y={3.5} width={113} height={161} rx={7} fill={id.url('back')} stroke={id.url('gold')} strokeWidth={3} />
      <rect x={10} y={10} width={100} height={148} rx={4} fill={id.url('lattice')} stroke={id.url('gold')} strokeWidth={0.9} />
      <rect x={14} y={14} width={92} height={140} rx={3} fill="none" stroke={id.url('gold')} strokeWidth={0.5} opacity={0.6} />
      <Corner x={17} y={17} sx={1} sy={1} gold={id.url('gold')} />
      <Corner x={103} y={17} sx={-1} sy={1} gold={id.url('gold')} />
      <Corner x={17} y={151} sx={1} sy={-1} gold={id.url('gold')} />
      <Corner x={103} y={151} sx={-1} sy={-1} gold={id.url('gold')} />
      {/* central seal: crown over crossed daggers */}
      <circle cx={60} cy={82} r={30} fill="#1a0408" stroke={id.url('gold')} strokeWidth={2.2} />
      <circle cx={60} cy={82} r={25.5} fill="none" stroke={id.url('gold')} strokeWidth={0.6} strokeDasharray="1.6 1.6" />
      {[38, -38].map((r) => (
        <g key={r} transform={`rotate(${r} 60 84)`}>
          <path d="M57.2 58 L60 50 L62.8 58 L62 98 L58 98 Z" fill={id.url('silver')} stroke="#2a2a30" strokeWidth={0.4} />
          <path d="M60 54 L60 96" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={0.5} />
          <rect x={52.5} y={97.5} width={15} height={3} rx={1.2} fill={id.url('gold')} stroke="#4a300a" strokeWidth={0.4} />
          <rect x={58.4} y={100.5} width={3.2} height={7} fill="#2a1208" />
          <circle cx={60} cy={109} r={2} fill={id.url('gold')} />
        </g>
      ))}
      <path d="M45 80 L45 66 L51.5 72.5 L55 62.5 L60 70 L65 62.5 L68.5 72.5 L75 66 L75 80 Z" fill={id.url('gold')} stroke="#4a300a" strokeWidth={0.8} />
      <rect x={44} y={78} width={32} height={5} rx={1.2} fill={id.url('gold')} stroke="#4a300a" strokeWidth={0.8} />
      <circle cx={60} cy={80.5} r={1.6} fill="#c0142f" />
      <text x={60} y={128} textAnchor="middle" style={{ fontFamily: "var(--font-regal)" }} fontWeight={900} fontSize={13} letterSpacing={4} fill={id.url('gold')}>
        COUP
      </text>
      <path d="M38 133 H82" stroke={id.url('gold')} strokeWidth={0.7} />
      <rect x={1} y={1} width={118} height={166} rx={9} fill={id.url('vig')} opacity={0.5} />
    </svg>
  );
});

/** A single embossed gold coin. */
export const CoinIcon = memo(function CoinIcon({ size = 18, style }: { size?: number; style?: CSSProperties }) {
  const id = useSvgIds();
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block', ...style }} aria-hidden>
      <defs>
        <radialGradient id={id('c')} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.45" stopColor="#e2b350" />
          <stop offset="1" stopColor="#8a5f17" />
        </radialGradient>
      </defs>
      <circle cx={12} cy={12.8} r={10.4} fill="#5a3b0c" />
      <circle cx={12} cy={12} r={10.4} fill={id.url('c')} stroke="#7a5418" strokeWidth={0.8} />
      <circle cx={12} cy={12} r={7.6} fill="none" stroke="#7a5418" strokeWidth={0.7} strokeDasharray="1 1" />
      <path d="M7.6 13.6 L7.6 9 L9.8 11 L12 7.6 L14.2 11 L16.4 9 L16.4 13.6 Z" fill="#9a6b1c" />
      <rect x={7.4} y={13.4} width={9.2} height={2} rx={0.6} fill="#9a6b1c" />
    </svg>
  );
});

/** A stack of embossed coins (side view) with the count beside it. */
export const CoinStack = memo(function CoinStack({ count, compact }: { count: number; compact?: boolean }) {
  const id = useSvgIds();
  const shown = Math.max(1, Math.min(count, compact ? 6 : 9));
  const h = 12 + shown * 3.4;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 5 }} role="img" aria-label={`${count} coin${count === 1 ? '' : 's'}`}>
      <svg viewBox={`0 0 26 ${h}`} width={22} height={(22 / 26) * h} style={{ display: 'block', opacity: count === 0 ? 0.3 : 1 }} aria-hidden>
        <defs>
          <linearGradient id={id('edge')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7a5418" />
            <stop offset="0.35" stopColor="#f3d27a" />
            <stop offset="0.7" stopColor="#b8862f" />
            <stop offset="1" stopColor="#6b4612" />
          </linearGradient>
          <radialGradient id={id('face')} cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#fff3c4" />
            <stop offset="1" stopColor="#c99637" />
          </radialGradient>
        </defs>
        {Array.from({ length: shown }, (_, i) => {
          const y = h - 6 - i * 3.4;
          const dx = ((i * 7) % 3) - 1;
          return (
            <g key={i} transform={`translate(${dx} 0)`}>
              <path d={`M2 ${y} v2.6 a11 4.2 0 0 0 22 0 v-2.6`} fill={id.url('edge')} stroke="#5a3b0c" strokeWidth={0.5} />
              <ellipse cx={13} cy={y} rx={11} ry={4.2} fill={id.url('face')} stroke="#7a5418" strokeWidth={0.6} />
            </g>
          );
        })}
        <ellipse cx={13} cy={h - 6 - (shown - 1) * 3.4} rx={6.5} ry={2.2} fill="none" stroke="#9a6b1c" strokeWidth={0.6} />
      </svg>
      <span
        style={{
          fontFamily: 'var(--font-regal)',
          fontWeight: 700,
          fontSize: compact ? 15 : 18,
          color: 'var(--gold-bright)',
          textShadow: '0 1px 0 #000, 0 0 8px rgba(212,166,74,0.35)',
          lineHeight: 1,
        }}
        aria-hidden
      >
        {count}
      </span>
    </span>
  );
});

export function CategoryBadge({ character }: { character: CoupCharacter }) {
  const theme = CATEGORY_THEME[CHARACTERS[character].category];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        background: 'rgba(0,0,0,0.35)',
        border: `1px solid ${theme.gem}66`,
        color: theme.gem,
        borderRadius: 999,
        fontSize: 9.5,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontFamily: 'var(--font-ui)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, background: theme.gem, transform: 'rotate(45deg)', display: 'inline-block' }} />
      {theme.short}
    </span>
  );
}
