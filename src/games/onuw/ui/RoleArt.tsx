import type { CSSProperties, ReactNode } from 'react';
import { Glow, SoftShadow, Vignette, useSvgIds } from '@/ui/shared/svg';
import { ROLES } from '../roles';
import type { OnuwRoleId, OnuwTeamId } from '../state';
import styles from './RoleArt.module.css';

// ============================================================================
// ONUW art: moonlit-village folklore in a woodcut / engraved-print style.
//
//   <RoleCard role size>     full printed role card (arched night window,
//                            illustrated figure, ribbon banner)
//   <CardBack size>          the one card back every face-down card shares
//   <RoleMedallion role>     round vignette of the figure (lists, chips)
//   <TeamBadge role|team>    tiny team glyph
//
// Every figure is drawn in a local 100×100 box: ink silhouettes with
// parchment "cuts" (engraved highlight lines), an accent colour for magic /
// eyes, and moonlight rim-lighting. Card stock texture comes from CSS
// (`var(--paper-fibre)`), not per-card SVG turbulence, to stay cheap.
// ============================================================================

const INK = '#1b130d';
const CUT = '#f3e6c8';
const PAPER_DIM = '#d8c497';
const FOLK: CSSProperties = { fontFamily: 'var(--font-folk)' };

type Scene = { skyTop: string; skyBottom: string; moon: string; moonGlow: string; accent: string };

const SCENES: Record<OnuwTeamId, Scene> = {
  village: { skyTop: '#0b1533', skyBottom: '#2a4377', moon: '#f6eccb', moonGlow: '#cfdcff', accent: '#9fb8ff' },
  werewolves: { skyTop: '#170506', skyBottom: '#5b1411', moon: '#e2543c', moonGlow: '#ff7a55', accent: '#ff4a2e' },
  tanner: { skyTop: '#1c1206', skyBottom: '#6a4415', moon: '#f0c66b', moonGlow: '#ffd27a', accent: '#f2b94b' },
};

// Per-role accent for eyes / magic (falls back to the team accent).
const ACCENT: Partial<Record<OnuwRoleId, string>> = {
  seer: '#b9a8ff',
  apprenticeSeer: '#ffd27a',
  auraSeer: '#9ff0d0',
  paranormalInvestigator: '#9fd8ff',
  witch: '#8cff9a',
  mysticWolf: '#d48cff',
  alphaWolf: '#ffcc4a',
  insomniac: '#cfe7ff',
  empath: '#ff8fb0',
  doppelganger: '#c7f0ff',
  revealer: '#ffd98a',
  curator: '#ffe08a',
  nostradamus: '#ffe9a8',
  prince: '#ffd86b',
  cursed: '#ff4a2e',
  beholder: '#b9a8ff',
};

export function roleTeam(role: OnuwRoleId): OnuwTeamId {
  return ROLES[role].team;
}

function accentFor(role: OnuwRoleId): string {
  return ACCENT[role] ?? SCENES[roleTeam(role)].accent;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI'];

// Night-order numeral printed at the top of the card (by wake order among
// all roles that wake), or a small sun for roles with no night action.
const NIGHT_NUMERAL: Partial<Record<OnuwRoleId, string>> = (() => {
  const waking = (Object.keys(ROLES) as OnuwRoleId[])
    .filter((r) => ROLES[r].wakeOrder < 1000 && r !== 'dreamWolf')
    .sort((a, b) => ROLES[a].wakeOrder - ROLES[b].wakeOrder);
  const out: Partial<Record<OnuwRoleId, string>> = {};
  waking.forEach((r, i) => (out[r] = ROMAN[i] ?? String(i + 1)));
  return out;
})();

interface FigureProps {
  a: string; // accent colour
  glow: string; // url(#glow) filter
}

// ---------------------------------------------------------------------------
// Figure building blocks (local 100×100 coordinates)
// ---------------------------------------------------------------------------

function Shoulders({ fill = INK, wide = 0 }: { fill?: string; wide?: number }) {
  return (
    <g>
      <path d={`M${6 - wide} 100 C ${8 - wide} 80 ${24 - wide / 2} 70 50 69 C ${76 + wide / 2} 70 ${92 + wide} 80 ${94 + wide} 100 Z`} fill={fill} />
      <path d="M30 79 Q35 90 32 100 M70 79 Q65 90 68 100 M50 74 Q48 88 50 100" stroke={CUT} strokeWidth="0.8" fill="none" opacity="0.45" />
      <path d={`M${76 + wide / 2} 72 C ${86 + wide} 78 ${91 + wide} 88 ${92 + wide} 98`} stroke={CUT} strokeWidth="1.2" fill="none" opacity="0.6" />
    </g>
  );
}

function Head({ cx = 50, cy = 50, rx = 13, ry = 16 }: { cx?: number; cy?: number; rx?: number; ry?: number }) {
  return (
    <g>
      <rect x={cx - 5} y={cy + ry - 6} width="10" height="12" fill={INK} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={INK} />
      {/* moonlit rim on the right cheek */}
      <path d={`M${cx + rx * 0.55} ${cy - ry * 0.8} Q ${cx + rx * 1.05} ${cy} ${cx + rx * 0.5} ${cy + ry * 0.85}`} stroke={CUT} strokeWidth="1.1" fill="none" opacity="0.7" />
      <path d={`M${cx + 2} ${cy - 2} l 3 0 M${cx - 6} ${cy - 2} l 3 0`} stroke={CUT} strokeWidth="1" opacity="0.55" />
    </g>
  );
}

function Hood({ eyes, a, glow }: { eyes?: boolean } & FigureProps) {
  return (
    <g>
      <path d="M50 22 C 33 24 28 42 30 58 C 31 66 26 72 18 78 L 82 78 C 74 72 69 66 70 58 C 72 42 67 24 50 22 Z" fill={INK} />
      <ellipse cx="50" cy="52" rx="11" ry="14" fill="#000" />
      <path d="M62 28 C 70 36 71 48 69 60" stroke={CUT} strokeWidth="1.1" fill="none" opacity="0.6" />
      <path d="M38 30 C 33 38 33 48 34 56 M44 25 C 40 30 39 36 39 42" stroke={CUT} strokeWidth="0.7" fill="none" opacity="0.4" />
      {eyes && (
        <g filter={glow} fill={a}>
          <ellipse cx="45" cy="52" rx="2.2" ry="1.3" />
          <ellipse cx="55" cy="52" rx="2.2" ry="1.3" />
        </g>
      )}
    </g>
  );
}

function WolfHead({ a, glow, mood = 'snarl' }: FigureProps & { mood?: 'snarl' | 'calm' | 'sleep' }) {
  return (
    <g>
      {/* mane */}
      <path d="M8 100 L16 80 L8 76 L20 70 L12 62 L24 60 L20 50 L30 54 L50 60 L70 54 L80 50 L76 60 L88 62 L80 70 L92 76 L84 80 L92 100 Z" fill={INK} />
      {/* head */}
      <path d="M50 94 C 38 94 30 86 27 76 L 20 60 C 16 50 16 36 20 20 L 31 35 C 37 31 44 30 50 30 C 56 30 63 31 69 35 L 80 20 C 84 36 84 50 80 60 L 73 76 C 70 86 62 94 50 94 Z" fill={INK} />
      {/* inner ears */}
      <path d="M22 26 L29 37 L24 42 Z M78 26 L71 37 L76 42 Z" fill={a} opacity="0.35" />
      {/* fur cuts */}
      <path d="M50 36 L50 58 M44 38 L46 54 M56 38 L54 54 M27 58 L35 63 M26 65 L35 68 M73 58 L65 63 M74 65 L65 68 M30 74 L37 74 M70 74 L63 74" stroke={CUT} strokeWidth="0.8" opacity="0.55" />
      <path d="M78 26 C 82 40 81 52 76 62 L 70 76" stroke={CUT} strokeWidth="1.2" fill="none" opacity="0.65" />
      {/* muzzle */}
      <path d="M40 64 Q 50 60 60 64 L 58 76 Q 50 82 42 76 Z" fill="#2a1d14" />
      <ellipse cx="50" cy="67" rx="4.6" ry="3.2" fill="#000" />
      <ellipse cx="51.5" cy="66" rx="1.4" ry="0.8" fill={CUT} opacity="0.7" />
      {mood === 'snarl' && (
        <g>
          <path d="M41 77 Q 50 88 59 77 Q 50 81 41 77 Z" fill="#4a0d0b" />
          <path d="M43 77.5 l1.2 3.4 l1.2 -3 M55 77.5 l1.2 3 l1.2 -3.4 M48 79 l1 2.4 l1 -2.4" fill={CUT} />
        </g>
      )}
      {/* eyes */}
      {mood === 'sleep' ? (
        <path d="M34 50 Q 39 54 44 50 M56 50 Q 61 54 66 50" stroke={CUT} strokeWidth="1.4" fill="none" />
      ) : (
        <g filter={glow}>
          <path d="M33 50 Q 39 45 45 50 Q 39 53 33 50 Z M55 50 Q 61 45 67 50 Q 61 53 55 50 Z" fill={a} />
          <circle cx="39" cy="49.6" r="1" fill="#000" />
          <circle cx="61" cy="49.6" r="1" fill="#000" />
        </g>
      )}
    </g>
  );
}

function Moonlet({ x, y, r, fill = CUT }: { x: number; y: number; r: number; fill?: string }) {
  return <path d={`M${x} ${y - r} A ${r} ${r} 0 1 0 ${x} ${y + r} A ${r * 0.75} ${r} 0 1 1 ${x} ${y - r} Z`} fill={fill} />;
}

function Sparkle({ x, y, s = 3, fill }: { x: number; y: number; s?: number; fill: string }) {
  return <path d={`M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z`} fill={fill} />;
}

// ---------------------------------------------------------------------------
// Per-role figures
// ---------------------------------------------------------------------------

const FIGURES: Record<OnuwRoleId, (p: FigureProps) => ReactNode> = {
  werewolf: (p) => <WolfHead {...p} />,
  alphaWolf: (p) => (
    <g>
      <WolfHead {...p} />
      <path d="M33 22 L37 10 L43 18 L50 6 L57 18 L63 10 L67 22 Z" fill={p.a} stroke={INK} strokeWidth="1.2" />
      <circle cx="50" cy="16" r="1.8" fill="#8a1a10" />
      <path d="M62 40 L70 56" stroke={CUT} strokeWidth="1.4" opacity="0.8" />
    </g>
  ),
  mysticWolf: (p) => (
    <g>
      <WolfHead {...p} mood="calm" />
      <g filter={p.glow}>
        <path d="M44 40 Q 50 34 56 40 Q 50 44 44 40 Z" fill={p.a} />
        <circle cx="50" cy="39.5" r="1.4" fill="#000" />
      </g>
      <path d="M14 30 l3 -5 l3 5 M84 30 l-3 -5 l-3 5 M10 44 h5 M85 44 h5" stroke={p.a} strokeWidth="1" opacity="0.8" fill="none" />
    </g>
  ),
  dreamWolf: (p) => (
    <g>
      <WolfHead {...p} mood="sleep" />
      <g fill={CUT} opacity="0.85" style={FOLK}>
        <text x="74" y="22" fontSize="10">z</text>
        <text x="82" y="13" fontSize="7">z</text>
      </g>
      <Moonlet x={18} y={16} r={6} />
    </g>
  ),
  minion: (p) => (
    <g>
      <path d="M50 30 C 34 32 26 48 28 62 C 20 70 14 82 12 100 L 88 100 C 86 82 80 70 72 62 C 74 48 66 32 50 30 Z" fill={INK} />
      <path d="M36 36 C 30 28 30 20 34 14 C 36 22 40 28 44 32 Z M64 36 C 70 28 70 20 66 14 C 64 22 60 28 56 32 Z" fill={INK} />
      <path d="M66 15 C 70 22 69 30 63 36" stroke={CUT} strokeWidth="0.9" fill="none" opacity="0.6" />
      <ellipse cx="50" cy="56" rx="13" ry="12" fill="#000" />
      <g filter={p.glow} fill={p.a}>
        <circle cx="45" cy="54" r="2" />
        <circle cx="55" cy="54" r="2" />
      </g>
      <path d="M43 61 Q 50 66 57 61" stroke={CUT} strokeWidth="1" fill="none" />
      <path d="M44 61.5 l1 2 l1 -1.6 M54 61.5 l1 1.6 l1 -2" stroke={CUT} strokeWidth="0.7" fill="none" />
      <path d="M72 64 C 80 72 86 84 88 100 M60 74 Q 64 88 62 100 M40 74 Q 36 88 38 100" stroke={CUT} strokeWidth="0.8" fill="none" opacity="0.45" />
    </g>
  ),
  squire: (p) => (
    <g>
      <Shoulders />
      <path d="M50 22 C 36 22 32 34 33 50 L 33 64 L 67 64 L 67 50 C 68 34 64 22 50 22 Z" fill={INK} />
      <path d="M36 44 H 64 M50 26 V 62" stroke={CUT} strokeWidth="1.2" opacity="0.7" />
      <rect x="38" y="42" width="24" height="4" fill="#000" />
      <path d="M50 22 C 52 14 60 10 66 12" stroke={p.a} strokeWidth="2.5" fill="none" />
      <path d="M58 68 L 88 68 L 88 84 C 88 94 78 100 73 102 C 68 100 58 94 58 84 Z" fill="#2a1d14" stroke={CUT} strokeWidth="1.2" />
      <g fill={p.a}>
        <ellipse cx="73" cy="86" rx="4.5" ry="3.6" />
        <circle cx="67" cy="79" r="1.8" />
        <circle cx="71" cy="76" r="1.8" />
        <circle cx="75.5" cy="76" r="1.8" />
        <circle cx="79.5" cy="79" r="1.8" />
      </g>
    </g>
  ),
  ricochetRhino: (p) => (
    <g>
      <path d="M8 100 C 8 74 20 58 40 54 L 52 40 C 56 34 62 32 66 36 L 70 30 L 74 38 C 84 44 92 60 92 78 L 92 100 Z" fill={INK} />
      <path d="M58 42 L 70 14 L 72 40 Z" fill={INK} stroke={CUT} strokeWidth="0.9" />
      <path d="M44 46 L 52 30 L 54 44 Z" fill={INK} stroke={CUT} strokeWidth="0.7" />
      <circle cx="72" cy="56" r="2" fill={p.a} filter={p.glow} />
      <path d="M30 64 Q 40 70 36 82 M50 62 Q 58 70 54 86 M78 66 Q 84 76 82 90" stroke={CUT} strokeWidth="0.8" fill="none" opacity="0.5" />
      <path d="M14 24 L 30 34 L 22 38 M30 34 L 26 26" stroke={p.a} strokeWidth="1.6" fill="none" />
    </g>
  ),
  seer: (p) => (
    <g>
      <Hood eyes {...p} />
      <path d="M18 78 C 14 88 12 94 10 100 L 90 100 C 88 94 86 88 82 78 Z" fill={INK} />
      <circle cx="50" cy="80" r="15" fill={p.a} opacity="0.22" filter={p.glow} />
      <circle cx="50" cy="80" r="12" fill="#1a1440" stroke={p.a} strokeWidth="1.4" />
      <path d="M43 75 Q 47 71 52 72" stroke="#fff" strokeWidth="1.4" fill="none" opacity="0.8" />
      <Sparkle x={54} y={82} s={4} fill={p.a} />
      <path d="M38 93 L 62 93 L 58 99 L 42 99 Z" fill="#2a1d14" stroke={CUT} strokeWidth="0.8" />
      <path d="M28 82 Q 34 74 40 76 M72 82 Q 66 74 60 76" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
    </g>
  ),
  apprenticeSeer: (p) => (
    <g>
      <Shoulders />
      <Head cy={48} />
      <path d="M37 40 C 38 28 62 28 63 40 C 60 34 40 34 37 40 Z" fill="#2a1d14" />
      <circle cx="72" cy="80" r="9" fill={p.a} opacity="0.25" filter={p.glow} />
      <circle cx="72" cy="80" r="7" fill="#1a1440" stroke={p.a} strokeWidth="1.2" />
      <rect x="22" y="70" width="6" height="16" fill={CUT} />
      <path d="M25 70 C 21 64 25 60 25 56 C 27 61 29 64 25 70 Z" fill={p.a} filter={p.glow} />
      <path d="M18 86 H 32" stroke={CUT} strokeWidth="2" />
    </g>
  ),
  paranormalInvestigator: (p) => (
    <g>
      <Shoulders />
      <Head cy={50} />
      <path d="M30 40 C 32 26 68 26 70 40 L 76 42 L 24 42 Z" fill="#2a1d14" stroke={CUT} strokeWidth="0.6" />
      <path d="M40 32 L 60 32" stroke={CUT} strokeWidth="0.8" opacity="0.6" />
      <circle cx="66" cy="74" r="12" fill="none" stroke={CUT} strokeWidth="3" />
      <circle cx="66" cy="74" r="10" fill={p.a} opacity="0.25" />
      <path d="M60 68 Q 64 65 68 66" stroke="#fff" strokeWidth="1.2" fill="none" />
      <path d="M57 83 L 46 96" stroke={CUT} strokeWidth="5" strokeLinecap="round" />
    </g>
  ),
  beholder: (p) => (
    <g>
      <g stroke={p.a} strokeWidth="1.2" opacity="0.7">
        {Array.from({ length: 14 }, (_, i) => {
          const t = (i / 14) * Math.PI * 2;
          return <line key={i} x1={50 + Math.cos(t) * 30} y1={56 + Math.sin(t) * 24} x2={50 + Math.cos(t) * 44} y2={56 + Math.sin(t) * 36} />;
        })}
      </g>
      <path d="M12 56 Q 50 18 88 56 Q 50 94 12 56 Z" fill={CUT} stroke={INK} strokeWidth="3" />
      <circle cx="50" cy="56" r="16" fill={INK} />
      <circle cx="50" cy="56" r="11" fill={p.a} filter={p.glow} />
      <circle cx="50" cy="56" r="5.5" fill="#000" />
      <circle cx="45" cy="51" r="2.4" fill="#fff" />
      <path d="M12 56 Q 50 18 88 56" stroke={INK} strokeWidth="5" fill="none" />
      <path d="M22 44 l-4 -6 M32 36 l-2 -7 M44 32 l-1 -7 M56 32 l1 -7 M68 36 l2 -7 M78 44 l4 -6" stroke={INK} strokeWidth="2" />
    </g>
  ),
  auraSeer: (p) => (
    <g>
      <g fill="none" stroke={p.a} filter={p.glow}>
        <ellipse cx="50" cy="56" rx="38" ry="40" strokeWidth="1" opacity="0.35" />
        <ellipse cx="50" cy="56" rx="30" ry="33" strokeWidth="1.4" opacity="0.55" />
        <ellipse cx="50" cy="56" rx="22" ry="26" strokeWidth="1.8" opacity="0.8" />
      </g>
      <Hood eyes {...p} />
      <path d="M18 78 C 14 88 12 94 10 100 L 90 100 C 88 94 86 88 82 78 Z" fill={INK} />
      <path d="M40 90 Q 50 80 60 90" stroke={p.a} strokeWidth="1.4" fill="none" />
    </g>
  ),
  robber: (p) => (
    <g>
      <Shoulders />
      <Head cy={50} />
      <path d="M34 47 Q 50 40 66 47 L 66 55 Q 50 50 34 55 Z" fill="#000" stroke={CUT} strokeWidth="0.8" />
      <ellipse cx="44" cy="50" rx="3" ry="2" fill={CUT} />
      <ellipse cx="56" cy="50" rx="3" ry="2" fill={CUT} />
      <path d="M24 38 C 30 26 44 22 50 30 C 56 22 70 26 76 38 C 64 34 36 34 24 38 Z" fill="#2a1d14" stroke={CUT} strokeWidth="0.7" />
      <path d="M72 92 L 86 62" stroke={CUT} strokeWidth="2.5" />
      <path d="M68 90 L 78 96" stroke={p.a} strokeWidth="3" strokeLinecap="round" />
      <path d="M86 62 L 88 57 L 84 60 Z" fill={CUT} />
    </g>
  ),
  bodySnatcher: (p) => (
    <g>
      <path d="M8 100 L 8 92 C 20 86 40 86 56 92 L 56 100 Z" fill={INK} />
      <ellipse cx="22" cy="86" rx="8" ry="6" fill={INK} />
      <path d="M50 18 C 64 18 72 30 70 46 C 82 56 88 76 90 100 L 58 100 C 60 80 56 64 48 58 C 40 50 40 26 50 18 Z" fill={INK} opacity="0.9" />
      <g filter={p.glow} fill={p.a}>
        <ellipse cx="56" cy="36" rx="2.6" ry="1.4" />
        <ellipse cx="64" cy="36" rx="2.2" ry="1.3" />
      </g>
      <path d="M48 58 C 40 62 34 70 28 78 M28 78 l-4 2 M28 78 l-2 4 M28 78 l1 4" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M66 22 C 72 30 72 42 68 50" stroke={CUT} strokeWidth="1" fill="none" opacity="0.6" />
    </g>
  ),
  troublemaker: (p) => (
    <g>
      <Shoulders />
      <Head cy={52} />
      <path d="M34 46 C 30 30 18 24 12 26 C 22 30 28 38 36 44 Z M66 46 C 70 30 82 24 88 26 C 78 30 72 38 64 44 Z M40 40 C 42 24 50 14 54 10 C 54 22 58 32 60 40 Z" fill="#2a1d14" stroke={CUT} strokeWidth="0.7" />
      <circle cx="12" cy="26" r="3" fill={p.a} />
      <circle cx="88" cy="26" r="3" fill={p.a} />
      <circle cx="54" cy="10" r="3" fill={p.a} />
      <path d="M42 60 Q 50 67 58 60" stroke={CUT} strokeWidth="1.3" fill="none" />
      <path d="M36 76 L 44 84 L 50 76 L 56 84 L 64 76" stroke={CUT} strokeWidth="1.2" fill="none" />
    </g>
  ),
  windyWendy: (p) => (
    <g>
      <path d="M38 40 C 30 50 26 66 16 74 C 30 72 38 62 42 52 Z M60 38 C 72 36 84 44 92 40 C 86 50 72 50 62 46 Z" fill={INK} />
      <Shoulders />
      <Head cy={50} />
      <path d="M36 42 C 40 30 62 28 66 40 C 72 38 80 34 86 30 C 80 40 72 44 64 44 C 56 36 44 36 36 42 Z" fill={INK} />
      <g stroke={p.a} strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M8 22 C 20 18 30 22 34 28 C 36 34 30 36 28 32" />
        <path d="M60 18 C 72 12 86 16 92 22 C 94 28 88 30 86 26" />
        <path d="M70 60 C 80 58 90 62 94 66" />
      </g>
    </g>
  ),
  villageIdiot: (p) => (
    <g>
      <Shoulders />
      <Head cy={54} />
      <path d="M38 44 L 50 4 L 62 44 Z" fill="#2a1d14" stroke={CUT} strokeWidth="0.8" />
      <path d="M42 32 L 58 32 M45 22 L 55 22" stroke={CUT} strokeWidth="0.8" opacity="0.6" />
      <circle cx="45" cy="54" r="2.4" fill={CUT} />
      <circle cx="55" cy="54" r="2.4" fill={CUT} />
      <circle cx="46" cy="54" r="1" fill="#000" />
      <circle cx="54" cy="54" r="1" fill="#000" />
      <path d="M43 62 Q 50 70 57 62" stroke={CUT} strokeWidth="1.3" fill="none" />
      <path d="M8 80 L 20 74 L 20 86 Z M92 80 L 80 74 L 80 86 Z" fill={p.a} />
    </g>
  ),
  drunk: (p) => (
    <g>
      <Shoulders />
      <g transform="rotate(-14 50 50)">
        <Head cy={50} />
        <path d="M34 40 L 66 40 L 62 26 L 38 28 Z" fill="#2a1d14" stroke={CUT} strokeWidth="0.7" />
        <path d="M43 52 Q 45 50 47 52 M53 52 Q 55 50 57 52" stroke={CUT} strokeWidth="1" fill="none" />
      </g>
      <path d="M60 70 L 80 70 L 78 96 L 62 96 Z" fill="#2a1d14" stroke={CUT} strokeWidth="1.2" />
      <path d="M80 76 C 90 76 90 90 79 90" stroke={CUT} strokeWidth="2" fill="none" />
      <path d="M58 70 C 58 62 64 62 66 66 C 68 60 74 60 76 66 C 80 62 84 66 82 71 Z" fill={CUT} />
      <path d="M66 76 V 92 M72 76 V 92" stroke={CUT} strokeWidth="0.6" opacity="0.6" />
      <circle cx="30" cy="30" r="2" fill={p.a} opacity="0.8" />
      <circle cx="24" cy="22" r="1.4" fill={p.a} opacity="0.6" />
    </g>
  ),
  insomniac: (p) => (
    <g>
      <Shoulders />
      <Head cy={52} />
      <path d="M36 44 C 38 26 62 26 66 40 C 74 40 80 32 82 24 L 86 28 C 84 38 76 46 64 46 C 58 40 44 40 36 44 Z" fill="#2a1d14" stroke={CUT} strokeWidth="0.6" />
      <circle cx="86" cy="27" r="3" fill={CUT} />
      <g filter={p.glow}>
        <circle cx="44" cy="53" r="4" fill={CUT} />
        <circle cx="56" cy="53" r="4" fill={CUT} />
      </g>
      <circle cx="44" cy="53" r="1.6" fill="#000" />
      <circle cx="56" cy="53" r="1.6" fill="#000" />
      <path d="M40 59 Q 44 61 48 59 M52 59 Q 56 61 60 59" stroke={p.a} strokeWidth="0.8" fill="none" opacity="0.7" />
      <rect x="16" y="76" width="7" height="18" fill={CUT} />
      <path d="M19.5 76 C 15 70 19.5 66 19.5 62 C 22 67 24 70 19.5 76 Z" fill="#ffd27a" filter={p.glow} />
      <path d="M10 94 H 30" stroke={CUT} strokeWidth="2.4" />
    </g>
  ),
  hunter: (p) => (
    <g>
      <path d="M78 6 C 98 34 98 70 78 98" stroke={CUT} strokeWidth="2.6" fill="none" />
      <path d="M78 6 L 78 98" stroke={CUT} strokeWidth="0.6" />
      <Shoulders />
      <Head cy={50} />
      <path d="M30 40 C 34 26 66 24 72 38 L 30 42 Z" fill="#2a1d14" stroke={CUT} strokeWidth="0.6" />
      <path d="M66 32 C 76 20 86 16 92 14 C 84 22 78 30 70 36 Z" fill={p.a} />
      <path d="M20 86 L 84 60" stroke={CUT} strokeWidth="1.6" />
      <path d="M84 60 L 90 56 L 86 63 Z" fill={CUT} />
      <path d="M20 86 l -4 -4 M20 86 l -5 1" stroke={p.a} strokeWidth="1.6" />
    </g>
  ),
  mason: (p) => (
    <g>
      <g stroke={CUT} strokeWidth="0.9" opacity="0.5">
        <path d="M6 70 H 94 M6 84 H 94 M6 98 H 94 M20 70 V 84 M44 70 V 84 M68 70 V 84 M32 84 V 98 M56 84 V 98 M80 84 V 98" />
      </g>
      <path d="M50 12 L 22 70 M50 12 L 78 70" stroke={CUT} strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="12" r="5" fill={CUT} />
      <circle cx="50" cy="12" r="2" fill={INK} />
      <path d="M26 52 L 50 70 L 74 52" stroke={p.a} strokeWidth="4" fill="none" strokeLinejoin="round" />
      <text x="50" y="50" textAnchor="middle" fontSize="13" fill={CUT} style={FOLK}>G</text>
    </g>
  ),
  villager: (p) => (
    <g>
      <path d="M80 4 L 80 100" stroke={CUT} strokeWidth="2.4" />
      <path d="M72 4 L 72 18 Q 80 26 88 18 L 88 4 M80 4 V 20" stroke={CUT} strokeWidth="1.8" fill="none" />
      <Shoulders />
      <Head cy={52} />
      <path d="M22 42 C 30 38 34 30 50 30 C 66 30 70 38 78 42 C 70 44 30 44 22 42 Z" fill={PAPER_DIM} stroke={INK} strokeWidth="0.8" />
      <path d="M30 41 L 70 41" stroke={p.a} strokeWidth="1.4" opacity="0.8" />
      <path d="M36 32 l 2 8 M44 30 l 1 10 M56 30 l -1 10 M64 32 l -2 8" stroke={INK} strokeWidth="0.5" opacity="0.6" />
    </g>
  ),
  innocentBystander: (p) => (
    <g>
      <path d="M68 50 C 70 30 92 26 98 44 C 90 40 84 44 82 48 C 78 42 72 44 68 50 Z" fill={INK} stroke={CUT} strokeWidth="0.8" />
      <path d="M82 46 L 82 92 Q 82 98 76 96" stroke={CUT} strokeWidth="1.6" fill="none" />
      <Shoulders />
      <Head cy={52} />
      <path d="M36 40 C 36 26 64 26 64 40 Z M28 41 H 72" fill="#2a1d14" stroke={CUT} strokeWidth="1" />
      <path d="M44 60 H 56" stroke={CUT} strokeWidth="1" />
      <circle cx="20" cy="24" r="1.6" fill={p.a} />
    </g>
  ),
  witch: (p) => (
    <g>
      <Shoulders />
      <Head cy={50} />
      <path d="M22 40 C 36 36 64 36 78 40 C 64 44 36 44 22 40 Z" fill={INK} stroke={CUT} strokeWidth="0.7" />
      <path d="M34 39 C 40 26 44 14 62 4 C 56 14 60 26 66 39 Z" fill={INK} stroke={CUT} strokeWidth="0.7" />
      <path d="M36 36 H 64" stroke={p.a} strokeWidth="2" />
      <path d="M24 80 C 24 70 76 70 76 80 C 76 94 66 100 50 100 C 34 100 24 94 24 80 Z" fill={INK} stroke={CUT} strokeWidth="1" />
      <ellipse cx="50" cy="76" rx="24" ry="5" fill={p.a} opacity="0.8" filter={p.glow} />
      <circle cx="42" cy="68" r="3" fill={p.a} opacity="0.8" />
      <circle cx="56" cy="64" r="2" fill={p.a} opacity="0.7" />
      <circle cx="50" cy="58" r="1.4" fill={p.a} opacity="0.6" />
    </g>
  ),
  doppelganger: (p) => (
    <g>
      <ellipse cx="50" cy="48" rx="28" ry="36" fill="#2a1d14" stroke={CUT} strokeWidth="2" />
      <ellipse cx="50" cy="48" rx="23" ry="31" fill="#0a1020" />
      <path d="M50 18 C 38 18 32 30 33 46 C 34 62 42 72 50 74 Z" fill={CUT} />
      <path d="M50 18 C 62 18 68 30 67 46 C 66 62 58 72 50 74 Z" fill={INK} />
      <path d="M38 42 Q 42 39 46 42 M38 58 Q 44 54 48 58" stroke={INK} strokeWidth="1.4" fill="none" />
      <g filter={p.glow} fill={p.a}>
        <path d="M54 42 Q 58 39 62 42 Q 58 44 54 42 Z" />
      </g>
      <path d="M52 58 Q 56 62 62 58" stroke={p.a} strokeWidth="1.2" fill="none" />
      <path d="M44 84 L 56 84 L 54 100 L 46 100 Z" fill="#2a1d14" stroke={CUT} strokeWidth="1" />
    </g>
  ),
  revealer: (p) => (
    <g>
      <g stroke={p.a} strokeWidth="1" opacity="0.6">
        {Array.from({ length: 10 }, (_, i) => {
          const t = -Math.PI / 2 + ((i - 4.5) / 10) * Math.PI;
          return <line key={i} x1={36 + Math.cos(t) * 16} y1={44 + Math.sin(t) * 16} x2={36 + Math.cos(t) * 34} y2={44 + Math.sin(t) * 34} />;
        })}
      </g>
      <path d="M28 30 L 44 30 L 42 26 L 30 26 Z" fill={CUT} />
      <path d="M28 30 L 30 56 L 42 56 L 44 30 Z" fill={p.a} opacity="0.85" filter={p.glow} stroke={INK} strokeWidth="1.6" />
      <path d="M36 18 V 26" stroke={CUT} strokeWidth="1.6" />
      <path d="M26 58 L 46 58" stroke={INK} strokeWidth="3" />
      <path d="M36 58 C 40 70 54 76 60 80" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />
      <g transform="rotate(14 72 76)">
        <rect x="60" y="56" width="26" height="36" rx="2" fill={CUT} stroke={INK} strokeWidth="1.4" />
        <path d="M66 64 H 80 M66 70 H 80 M66 76 H 76" stroke={INK} strokeWidth="1" />
        <circle cx="73" cy="84" r="3" fill={p.a} />
      </g>
    </g>
  ),
  curator: (p) => (
    <g>
      <rect x="24" y="80" width="52" height="20" fill="#2a1d14" stroke={CUT} strokeWidth="1" />
      <rect x="20" y="76" width="60" height="5" fill={INK} stroke={CUT} strokeWidth="0.8" />
      <path d="M40 76 C 34 66 34 50 42 44 L 42 38 L 58 38 L 58 44 C 66 50 66 66 60 76 Z" fill={INK} stroke={CUT} strokeWidth="1" />
      <path d="M38 58 H 62 M37 64 H 63" stroke={p.a} strokeWidth="1.2" />
      <path d="M44 50 Q 50 46 56 50" stroke={CUT} strokeWidth="0.8" fill="none" opacity="0.7" />
      <ellipse cx="50" cy="38" rx="10" ry="2.6" fill={INK} stroke={CUT} strokeWidth="0.8" />
      <Sparkle x={74} y={30} s={5} fill={p.a} />
      <Sparkle x={24} y={40} s={3} fill={p.a} />
      <g transform="translate(70 50) rotate(30)">
        <circle cx="0" cy="0" r="4" fill="none" stroke={p.a} strokeWidth="1.6" />
        <path d="M4 0 H 16 M12 0 V 4 M15 0 V 3" stroke={p.a} strokeWidth="1.6" />
      </g>
    </g>
  ),
  tanner: (p) => (
    <g>
      <path d="M80 0 V 24" stroke={CUT} strokeWidth="1.4" />
      <path d="M80 24 C 72 24 72 38 80 38 C 88 38 88 24 80 24 Z" fill="none" stroke={CUT} strokeWidth="1.6" />
      <Shoulders />
      <Head cy={54} rx={12} ry={17} />
      <path d="M38 46 Q 50 38 62 46 L 60 40 Q 50 34 40 40 Z" fill="#2a1d14" />
      <path d="M43 56 Q 45 54 47 56 M53 56 Q 55 54 57 56 M44 66 Q 50 62 56 66" stroke={CUT} strokeWidth="1" fill="none" />
      <path d="M32 76 L 68 76 L 72 100 L 28 100 Z" fill="#3a2716" stroke={CUT} strokeWidth="0.9" />
      <path d="M36 82 H 64 M38 90 H 62" stroke={CUT} strokeWidth="0.6" opacity="0.6" />
      <circle cx="16" cy="20" r="1.5" fill={p.a} opacity="0.7" />
    </g>
  ),
  apprenticeTanner: (p) => (
    <g>
      <Shoulders />
      <Head cy={56} rx={11} ry={14} />
      <path d="M40 50 Q 50 42 60 50 L 58 44 Q 50 38 42 44 Z" fill="#2a1d14" />
      <path d="M45 58 Q 46 56 48 58 M52 58 Q 54 56 55 58 M46 66 Q 50 63 54 66" stroke={CUT} strokeWidth="1" fill="none" />
      <path d="M34 78 L 66 78 L 70 100 L 30 100 Z" fill="#3a2716" stroke={CUT} strokeWidth="0.9" />
      <path d="M22 70 L 14 92 M14 92 l 10 -2" stroke={p.a} strokeWidth="2" strokeLinecap="round" />
      <path d="M78 14 V 30" stroke={CUT} strokeWidth="1.2" />
      <circle cx="78" cy="35" r="5" fill="none" stroke={CUT} strokeWidth="1.3" />
    </g>
  ),
  prince: (p) => (
    <g>
      <path d="M8 100 C 10 78 26 68 50 68 C 74 68 90 78 92 100 Z" fill="#3a0e18" />
      <path d="M22 76 C 30 70 40 70 50 76 C 60 70 70 70 78 76" stroke={CUT} strokeWidth="2.4" fill="none" />
      <path d="M50 76 V 100" stroke={p.a} strokeWidth="1" opacity="0.7" />
      <Head cy={50} />
      <path d="M35 36 L 37 22 L 43 30 L 50 18 L 57 30 L 63 22 L 65 36 Z" fill={p.a} stroke={INK} strokeWidth="1" />
      <circle cx="50" cy="29" r="1.8" fill="#9b1c1c" />
      <circle cx="40" cy="31" r="1.2" fill="#3f7fd6" />
      <circle cx="60" cy="31" r="1.2" fill="#3f7fd6" />
      <Sparkle x={78} y={20} s={4} fill={p.a} />
    </g>
  ),
  cursed: (p) => (
    <g>
      <g opacity="0.55" transform="translate(8 -6) scale(0.86)">
        <WolfHead {...p} mood="calm" />
      </g>
      <Shoulders />
      <Head cy={56} />
      <path d="M40 48 Q 50 40 60 48" stroke={CUT} strokeWidth="1" fill="none" opacity="0.6" />
      <path d="M44 66 Q 50 62 56 66" stroke={CUT} strokeWidth="1" fill="none" />
      <path d="M38 80 L 62 96 M62 80 L 38 96" stroke={p.a} strokeWidth="2.4" opacity="0.85" />
    </g>
  ),
  thing: (p) => (
    <g>
      <path d="M0 100 C 10 70 18 50 30 40 C 40 32 52 34 56 42" stroke={INK} strokeWidth="16" strokeLinecap="round" fill="none" />
      <path d="M56 42 C 62 36 70 34 76 36 M56 44 C 64 42 74 44 80 48 M54 48 C 62 50 70 56 74 62 M52 50 C 56 56 58 64 58 70" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M6 92 C 14 70 22 54 32 46" stroke={CUT} strokeWidth="1" fill="none" opacity="0.6" />
      <g fill={p.a} opacity="0.9">
        <circle cx="22" cy="64" r="2" />
        <circle cx="16" cy="78" r="1.6" />
        <circle cx="34" cy="50" r="1.4" />
      </g>
      <path d="M82 54 q 4 -4 8 0 M84 60 q 4 -4 8 0" stroke={p.a} strokeWidth="1.2" fill="none" />
    </g>
  ),
  empath: (p) => (
    <g>
      <path d="M50 88 C 22 70 16 52 24 40 C 32 30 46 32 50 44 C 54 32 68 30 76 40 C 84 52 78 70 50 88 Z" fill={p.a} opacity="0.9" filter={p.glow} stroke={INK} strokeWidth="2" />
      <path d="M34 44 Q 38 38 44 40" stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.7" />
      <path d="M4 100 C 12 84 20 78 32 76 C 36 80 34 86 28 88 M96 100 C 88 84 80 78 68 76 C 64 80 66 86 72 88" stroke={INK} strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M6 96 C 14 84 22 80 30 79" stroke={CUT} strokeWidth="0.8" fill="none" opacity="0.6" />
    </g>
  ),
  nostradamus: (p) => (
    <g>
      <Shoulders />
      <Head cy={44} />
      <path d="M36 50 C 36 72 44 82 50 86 C 56 82 64 72 64 50 C 58 58 42 58 36 50 Z" fill={CUT} opacity="0.9" />
      <path d="M42 62 Q 50 70 58 62 M44 70 Q 50 78 56 70" stroke={INK} strokeWidth="0.7" fill="none" opacity="0.6" />
      <path d="M36 34 C 38 24 62 24 64 34 Z" fill="#2a1d14" stroke={CUT} strokeWidth="0.8" />
      <rect x="62" y="70" width="28" height="22" rx="3" fill={CUT} stroke={INK} strokeWidth="1.2" />
      <path d="M66 76 H 86 M66 81 H 86 M66 86 H 80" stroke={INK} strokeWidth="0.8" />
      <Sparkle x={16} y={20} s={4} fill={p.a} />
      <Sparkle x={84} y={14} s={3} fill={p.a} />
      <Sparkle x={24} y={36} s={2} fill={p.a} />
    </g>
  ),
  familyMan: (p) => (
    <g>
      <path d="M14 56 L 50 24 L 86 56 L 86 100 L 14 100 Z" fill="#2a1d14" stroke={CUT} strokeWidth="1.2" />
      <path d="M8 58 L 50 20 L 92 58" stroke={INK} strokeWidth="5" fill="none" strokeLinejoin="round" />
      <rect x="60" y="30" width="8" height="16" fill={INK} />
      <rect x="40" y="56" width="20" height="16" fill={p.a} opacity="0.85" filter={p.glow} />
      <path d="M50 56 V 72 M40 64 H 60" stroke={INK} strokeWidth="1.4" />
      <g fill={INK}>
        <circle cx="30" cy="80" r="4" />
        <path d="M24 100 C 24 88 36 88 36 100 Z" />
        <circle cx="70" cy="80" r="4" />
        <path d="M64 100 C 64 88 76 88 76 100 Z" />
        <circle cx="50" cy="86" r="3" />
        <path d="M45 100 C 45 92 55 92 55 100 Z" />
      </g>
    </g>
  ),
  defenderEr: (p) => (
    <g>
      <path d="M50 4 L 50 92" stroke={CUT} strokeWidth="3" />
      <path d="M38 22 H 62" stroke={CUT} strokeWidth="4" strokeLinecap="round" />
      <path d="M22 30 L 78 30 L 78 58 C 78 80 62 92 50 98 C 38 92 22 80 22 58 Z" fill={INK} stroke={CUT} strokeWidth="2" />
      <path d="M28 36 L 72 36 L 72 58 C 72 76 60 86 50 91 C 40 86 28 76 28 58 Z" fill="none" stroke={p.a} strokeWidth="1.2" />
      <path d="M50 40 V 84 M34 56 H 66" stroke={p.a} strokeWidth="3" />
    </g>
  ),
  theSponge: (p) => (
    <g>
      <path d="M22 36 C 18 26 32 20 40 26 C 46 18 60 18 64 26 C 74 20 86 28 80 40 C 88 48 84 64 76 66 C 80 80 66 88 58 82 C 50 90 34 88 32 78 C 20 80 14 64 22 58 C 12 50 14 40 22 36 Z" fill="#c9a24a" stroke={INK} strokeWidth="2" />
      <g fill={INK} opacity="0.75">
        <ellipse cx="34" cy="40" rx="4" ry="3" />
        <ellipse cx="52" cy="34" rx="3" ry="2.4" />
        <ellipse cx="66" cy="44" rx="4.4" ry="3.4" />
        <ellipse cx="44" cy="56" rx="5" ry="3.6" />
        <ellipse cx="64" cy="62" rx="3" ry="2.4" />
        <ellipse cx="30" cy="62" rx="3" ry="2.2" />
        <ellipse cx="48" cy="74" rx="3.4" ry="2.4" />
      </g>
      <path d="M50 92 C 46 98 54 98 50 92 Z M30 92 C 27 97 33 97 30 92 Z M70 90 C 67 95 73 95 70 90 Z" fill={p.a} />
    </g>
  ),
};

// Little village skyline at the bottom of every card window.
function Skyline({ team }: { team: OnuwTeamId }) {
  const lit = team === 'werewolves' ? '#ff9a5a' : '#ffd88a';
  return (
    <g>
      <path d="M0 100 L0 88 Q 14 82 28 86 Q 44 80 60 84 Q 78 79 100 86 L100 100 Z" fill={INK} />
      <path d="M8 88 L8 78 L13 72 L18 78 L18 88 Z M82 86 L82 74 L88 68 L94 74 L94 86 Z" fill={INK} />
      <path d="M24 86 L 30 66 L 36 86 Z M64 84 L 69 70 L 74 84 Z" fill={INK} />
      <rect x="11.5" y="80" width="3" height="3" fill={lit} opacity="0.9" />
      <rect x="86.5" y="76" width="3" height="3" fill={lit} opacity="0.8" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Public components
// ---------------------------------------------------------------------------

export interface RoleCardProps {
  role: OnuwRoleId;
  /** Width in px (height follows the 63:88 card ratio). */
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Optional overlay label (e.g. "as Seer" for a transformed card). */
  subtitle?: string;
}

/** A full printed role card (face). */
export function RoleCard({ role, size = 126, className, style, subtitle }: RoleCardProps) {
  const id = useSvgIds();
  const spec = ROLES[role];
  const team = roleTeam(role);
  const scene = SCENES[team];
  const a = accentFor(role);
  const numeral = NIGHT_NUMERAL[role];
  const name = spec.name;
  const nameSize = Math.min(11, 150 / Math.max(8, name.length));
  return (
    <div
      className={`${styles.card} ${styles[team]} ${className ?? ''}`}
      style={{ width: size, height: (size * 88) / 63, ...style }}
      role="img"
      aria-label={`${name} card`}
    >
      <svg viewBox="0 0 126 176" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={id('sky')} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={scene.skyTop} />
            <stop offset="100%" stopColor={scene.skyBottom} />
          </linearGradient>
          <radialGradient id={id('moon')} cx="40%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="55%" stopColor={scene.moon} />
            <stop offset="100%" stopColor={scene.moon} stopOpacity="0.85" />
          </radialGradient>
          <radialGradient id={id('halo')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={scene.moonGlow} stopOpacity="0.55" />
            <stop offset="100%" stopColor={scene.moonGlow} stopOpacity="0" />
          </radialGradient>
          <pattern id={id('hatch')} width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
            <line x1="0" y1="0" x2="0" y2="2.6" stroke={INK} strokeWidth="0.7" />
          </pattern>
          <Vignette id={id('vig')} inner={0.5} opacity={0.75} />
          <clipPath id={id('win')}>
            <path d="M17 134 L17 48 Q17 21 63 19 Q109 21 109 48 L109 134 Z" />
          </clipPath>
          <SoftShadow id={id('shadow')} dy={1.6} blur={1.8} opacity={0.6} />
          <Glow id={id('glow')} color={a} blur={1.6} strength={0.9} />
        </defs>

        {/* frame */}
        <rect x="3" y="3" width="120" height="170" rx="6" fill="none" stroke={INK} strokeWidth="1.6" />
        <rect x="6.5" y="6.5" width="113" height="163" rx="4" fill="none" stroke={INK} strokeWidth="0.6" />
        {[
          [9, 9],
          [117, 9],
          [9, 167],
          [117, 167],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`} fill={INK}>
            <path d="M0 -3.4 L3.4 0 L0 3.4 L-3.4 0 Z" />
            <circle r="0.9" fill={PAPER_DIM} />
          </g>
        ))}

        {/* night-order numeral */}
        <g transform="translate(63 12.5)">
          <path d="M-14 0 H -7 M7 0 H 14" stroke={INK} strokeWidth="0.6" />
          {numeral ? (
            <text y="2.6" textAnchor="middle" fontSize="7.2" fill={INK} style={FOLK}>
              {numeral}
            </text>
          ) : (
            <g fill="none" stroke={INK} strokeWidth="0.7">
              <circle r="2.4" />
              <path d="M0 -4.6 V -3.4 M0 3.4 V 4.6 M-4.6 0 H -3.4 M3.4 0 H 4.6" />
            </g>
          )}
        </g>

        {/* arched window */}
        <g clipPath={id.url('win')}>
          <rect x="10" y="14" width="106" height="124" fill={id.url('sky')} />
          <circle cx="82" cy="44" r="30" fill={id.url('halo')} />
          <circle cx="82" cy="44" r="13" fill={id.url('moon')} />
          {team === 'village' && <circle cx="87" cy="40" r="11.5" fill={scene.skyTop} opacity="0.92" />}
          <g fill="#fff">
            <circle cx="28" cy="34" r="0.7" />
            <circle cx="44" cy="27" r="0.5" />
            <circle cx="36" cy="48" r="0.45" />
            <circle cx="100" cy="66" r="0.5" />
            <circle cx="22" cy="58" r="0.5" />
            <circle cx="58" cy="30" r="0.4" />
          </g>
          <g transform="translate(13 34) scale(1)">
            <Skyline team={team} />
          </g>
          <g transform="translate(13 34)" filter={id.url('shadow')}>
            {FIGURES[role]({ a, glow: id.url('glow') })}
          </g>
          <rect x="10" y="14" width="106" height="124" fill={id.url('hatch')} opacity="0.13" />
          <rect x="10" y="14" width="106" height="124" fill={id.url('vig')} />
        </g>
        <path d="M17 134 L17 48 Q17 21 63 19 Q109 21 109 48 L109 134 Z" fill="none" stroke={INK} strokeWidth="1.8" />
        <path d="M20.5 131 L20.5 49 Q20.5 25 63 23 Q105.5 25 105.5 49 L105.5 131" fill="none" stroke={INK} strokeWidth="0.5" opacity="0.7" />

        {/* ribbon banner */}
        <path d="M8 139 L118 139 L113 149.5 L118 160 L8 160 L13 149.5 Z" fill={PAPER_DIM} stroke={INK} strokeWidth="1" />
        <path d="M13 142 L113 142 M13 157 L113 157" stroke={INK} strokeWidth="0.35" opacity="0.6" />
        <text
          x="63"
          y={149.5 + nameSize * 0.34}
          textAnchor="middle"
          fontSize={nameSize}
          fill={INK}
          style={FOLK}
        >
          {name}
        </text>
        <text x="63" y="167.5" textAnchor="middle" fontSize="5.2" letterSpacing="1.4" fill={INK} opacity="0.8" style={FOLK}>
          {subtitle ?? teamLabel(team).toUpperCase()}
        </text>
      </svg>
    </div>
  );
}

/** The single card back shared by every face-down card. */
export function CardBack({ size = 126, className, style, label }: { size?: number; className?: string; style?: CSSProperties; label?: string }) {
  const id = useSvgIds();
  return (
    <div
      className={`${styles.card} ${styles.back} ${className ?? ''}`}
      style={{ width: size, height: (size * 88) / 63, ...style }}
      role="img"
      aria-label={label ?? 'Face-down card'}
    >
      <svg viewBox="0 0 126 176" width="100%" height="100%" aria-hidden>
        <defs>
          <radialGradient id={id('bg')} cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="#24356b" />
            <stop offset="70%" stopColor="#0e1633" />
            <stop offset="100%" stopColor="#070b1c" />
          </radialGradient>
          <radialGradient id={id('moon')} cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#fffaf0" />
            <stop offset="100%" stopColor="#e9d9a8" />
          </radialGradient>
          <pattern id={id('lattice')} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 6 H 12 M6 0 V 12" stroke="#d4a64a" strokeWidth="0.35" opacity="0.35" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="126" height="176" rx="7" fill={id.url('bg')} />
        <rect x="0" y="0" width="126" height="176" rx="7" fill={id.url('lattice')} />
        <rect x="5" y="5" width="116" height="166" rx="5" fill="none" stroke="#d4a64a" strokeWidth="1.2" />
        <rect x="9" y="9" width="108" height="158" rx="3" fill="none" stroke="#d4a64a" strokeWidth="0.5" />
        {[
          [9, 9],
          [117, 9],
          [9, 167],
          [117, 167],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <Sparkle x={0} y={0} s={4} fill="#f3d27a" />
          </g>
        ))}
        <g transform="translate(63 84)">
          <g stroke="#d4a64a" strokeWidth="0.5" opacity="0.5">
            {Array.from({ length: 24 }, (_, i) => {
              const t = (i / 24) * Math.PI * 2;
              return <line key={i} x1={Math.cos(t) * 34} y1={Math.sin(t) * 34} x2={Math.cos(t) * 46} y2={Math.sin(t) * 46} />;
            })}
          </g>
          <circle r="31" fill="#0b1229" stroke="#d4a64a" strokeWidth="1.4" />
          <circle r="27.5" fill="none" stroke="#d4a64a" strokeWidth="0.4" />
          <circle cx="0" cy="-6" r="15" fill={id.url('moon')} />
          <circle cx="6" cy="-9" r="13" fill="#0b1229" />
          {/* howling wolf on a hill */}
          <path d="M-26 22 Q -10 10 6 14 Q 18 12 27 20 L 27 26 L -26 26 Z" fill="#05070f" />
          <path d="M-6 14 L -6 4 L -9 -2 L -6 -1 L -2 -8 L 0 -6 L 1 0 L 6 4 L 8 14 Z" fill="#05070f" />
          <g fill="#f3d27a">
            <circle cx="-18" cy="-14" r="0.8" />
            <circle cx="-12" cy="-22" r="0.6" />
            <circle cx="16" cy="6" r="0.6" />
            <circle cx="-20" cy="2" r="0.5" />
          </g>
        </g>
        <text x="63" y="30" textAnchor="middle" fontSize="8" letterSpacing="2.4" fill="#f3d27a" style={FOLK}>
          ONE NIGHT
        </text>
        <text x="63" y="150" textAnchor="middle" fontSize="6" letterSpacing="2" fill="#d4a64a" opacity="0.85" style={FOLK}>
          ULTIMATE WEREWOLF
        </text>
      </svg>
    </div>
  );
}

/** Round vignette of a role's figure (lists, cheatsheet, chips). */
export function RoleMedallion({ role, size = 44, className, style }: { role: OnuwRoleId; size?: number; className?: string; style?: CSSProperties }) {
  const id = useSvgIds();
  const team = roleTeam(role);
  const scene = SCENES[team];
  const a = accentFor(role);
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={style}
      role="img"
      aria-label={ROLES[role].name}
    >
      <defs>
        <linearGradient id={id('sky')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={scene.skyTop} />
          <stop offset="100%" stopColor={scene.skyBottom} />
        </linearGradient>
        <clipPath id={id('clip')}>
          <circle cx="50" cy="50" r="46" />
        </clipPath>
        <Glow id={id('glow')} color={a} blur={2} strength={0.9} />
      </defs>
      <circle cx="50" cy="50" r="49" fill={PAPER_DIM} />
      <g clipPath={id.url('clip')}>
        <rect width="100" height="100" fill={id.url('sky')} />
        <circle cx="78" cy="22" r="10" fill={scene.moon} opacity="0.9" />
        <g transform="translate(0 6)">{FIGURES[role]({ a, glow: id.url('glow') })}</g>
      </g>
      <circle cx="50" cy="50" r="46" fill="none" stroke={INK} strokeWidth="3" />
      <circle cx="50" cy="50" r="49" fill="none" stroke={teamRing(team)} strokeWidth="2" />
    </svg>
  );
}

/** Back-compat alias used by older call sites. */
export function RoleArt({ role, size = 96, style }: { role: OnuwRoleId; size?: number; style?: CSSProperties }) {
  return <RoleMedallion role={role} size={size} style={style} />;
}

function teamRing(team: OnuwTeamId): string {
  return team === 'werewolves' ? '#c43b3b' : team === 'tanner' ? '#c99a3a' : '#5d86d6';
}

export function teamLabel(team: OnuwTeamId): string {
  return team === 'village' ? 'Village' : team === 'werewolves' ? 'Werewolf team' : 'Tanner';
}

/** Tiny team glyph: a cottage (village), a paw (werewolves), a noose (tanner). */
export function TeamBadge({ role, team, size = 14 }: { role?: OnuwRoleId; team?: OnuwTeamId; size?: number }) {
  const t = team ?? (role ? roleTeam(role) : 'village');
  const c = teamRing(t);
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={teamLabel(t)} style={{ verticalAlign: '-2px' }}>
      <circle cx="8" cy="8" r="7.4" fill="#120d08" stroke={c} strokeWidth="1.2" />
      {t === 'village' && <path d="M4 12 V 7.6 L 8 4.2 L 12 7.6 V 12 Z M7 12 V 9.5 H 9 V 12" fill={c} />}
      {t === 'werewolves' && (
        <g fill={c}>
          <ellipse cx="8" cy="10.2" rx="2.4" ry="1.9" />
          <circle cx="4.9" cy="7.4" r="1" />
          <circle cx="7" cy="5.6" r="1" />
          <circle cx="9.3" cy="5.6" r="1" />
          <circle cx="11.2" cy="7.4" r="1" />
        </g>
      )}
      {t === 'tanner' && <path d="M8 2.8 V 6 M8 6 a 2.6 2.6 0 1 0 0.01 0" stroke={c} strokeWidth="1.3" fill="none" />}
    </svg>
  );
}
