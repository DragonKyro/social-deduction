import type { CSSProperties, ReactNode } from 'react';
import { useSvgIds } from '@/ui/shared/svg';
import type { ShExecutivePower, ShParty, ShPolicy, ShRoleId, ShVote } from '../state';

// ============================================================================
// Secret Hitler art kit — inline SVG, 1930s printed-document style.
//
// Emblems are deliberately original: a dove with an olive branch for the
// Liberals, a coiled serpent for the Fascists and a crowned serpent for
// Hitler. No real-world political or hate symbols are used anywhere.
//
// Every card is drawn in a 63 x 88 viewBox (poker proportions) and scales
// to whatever box it is placed in.
// ============================================================================

const DOSSIER: CSSProperties = { fontFamily: 'var(--font-dossier)' };
const REGAL: CSSProperties = { fontFamily: 'var(--font-regal)', fontWeight: 900 };

export const PALETTE = {
  cream: '#f1e6c8',
  creamDim: '#d9caa4',
  ink: '#22180f',
  libLight: '#7fa8cc',
  lib: '#3f6f98',
  libDeep: '#1d3a57',
  fasLight: '#d0574a',
  fas: '#9b2222',
  fasDeep: '#4a0c0c',
  black: '#140c0b',
  brass: '#c9a24a',
  manila: '#d6b676',
  manilaDeep: '#a9874a',
};

// ---------------------------------------------------------------------------
// Emblems (100 x 100 artboards)
// ---------------------------------------------------------------------------

/** Dove carrying an olive branch, flying left. */
export function DoveGlyph({ color, accent }: { color: string; accent: string }) {
  return (
    <g>
      {/* olive branch */}
      <path d="M14 47 C 10 56, 12 66, 21 74" fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
      {[
        [11.5, 54, -60],
        [16.5, 58, 40],
        [12.5, 63, -40],
        [18.5, 66, 50],
        [16, 71, -20],
      ].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx="2.2" ry="4.4" fill={accent} transform={`rotate(${r} ${x} ${y})`} />
      ))}
      <g fill={color}>
        {/* body + tail */}
        <path d="M22 46 C 26 38, 36 36, 45 40 C 55 45, 65 48, 77 46 L 93 39 L 86 51 L 95 56 L 81 58 C 70 67, 52 68, 40 62 C 32 58, 26 54, 22 46 Z" />
        {/* raised wing */}
        <path d="M41 45 C 44 30, 55 16, 75 9 C 70 19, 72 25, 66 32 C 73 29, 79 27, 85 25 C 77 39, 64 48, 50 51 Z" />
        {/* head + beak */}
        <circle cx="24" cy="44" r="7.2" />
        <path d="M17.5 42.6 L 9.5 45 L 17.5 47.4 Z" />
      </g>
      {/* wing feather lines */}
      <path d="M48 44 C 55 38, 62 33, 70 30 M52 47 C 60 43, 68 39, 76 35" fill="none" stroke={accent} strokeWidth="1.1" opacity="0.55" />
      <circle cx="23" cy="42.6" r="1.3" fill={accent} />
    </g>
  );
}

/** A coiled serpent, head raised to the right. */
export function SerpentGlyph({ color, accent, crowned = false }: { color: string; accent: string; crowned?: boolean }) {
  const body = 'M71 26 C 44 20, 26 34, 42 47 C 58 60, 72 66, 58 79 C 48 88, 30 86, 22 78';
  return (
    <g>
      <path d={body} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" />
      {/* scale bands */}
      <path d={body} fill="none" stroke={accent} strokeWidth="11" strokeLinecap="butt" strokeDasharray="1.4 5.2" opacity="0.32" />
      <path d={body} fill="none" stroke={accent} strokeWidth="1.2" opacity="0.5" transform="translate(0 -2)" />
      {/* head */}
      <path d="M64 19 C 70 13, 82 13, 90 20 C 84 26, 74 31, 65 31 C 61 28, 61 23, 64 19 Z" fill={color} />
      <circle cx="78" cy="20.5" r="1.9" fill={crowned ? '#ff4b3a' : accent} />
      {/* tongue */}
      <path d="M90 20 L 97 18 M90 20 L 97 23" stroke={accent} strokeWidth="1.3" strokeLinecap="round" />
      {crowned && (
        <path d="M66 12 L 68 3 L 73 9 L 77 1 L 81 9 L 86 3 L 87 12 Z" fill={PALETTE.brass} stroke={accent} strokeWidth="0.8" />
      )}
    </g>
  );
}

function EmblemDisc({ cx, cy, r, ring, fill, children }: { cx: number; cy: number; r: number; ring: string; fill: string; children: ReactNode }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={ring} strokeWidth="0.9" />
      <circle cx={cx} cy={cy} r={r - 1.6} fill="none" stroke={ring} strokeWidth="0.35" strokeDasharray="0.8 0.8" />
      {children}
    </g>
  );
}

/** Art-deco corner fans for card frames. */
function DecoCorners({ color, inset = 5 }: { color: string; inset?: number }) {
  const w = 63;
  const h = 88;
  const fan = (x: number, y: number, sx: number, sy: number, k: number) => (
    <g key={k} transform={`translate(${x} ${y}) scale(${sx} ${sy})`} fill="none" stroke={color} strokeWidth="0.45">
      <path d="M0 6 L 0 0 L 6 0" />
      <path d="M1.6 4.4 A 2.8 2.8 0 0 1 4.4 1.6" />
      <path d="M1.6 7.4 L 1.6 1.6 L 7.4 1.6" opacity="0.6" />
    </g>
  );
  return (
    <g>
      {fan(inset, inset, 1, 1, 0)}
      {fan(w - inset, inset, -1, 1, 1)}
      {fan(inset, h - inset, 1, -1, 2)}
      {fan(w - inset, h - inset, -1, -1, 3)}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Card frames
// ---------------------------------------------------------------------------

function CardSvg({ label, children, className, style }: { label: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 63 88" width="100%" height="100%" role="img" aria-label={label} className={className} style={{ display: 'block', ...style }} preserveAspectRatio="xMidYMid meet">
      <title>{label}</title>
      {children}
    </svg>
  );
}

function PaperBg({ id, from, to, stroke }: { id: (name: string) => string; from: string; to: string; stroke: string }) {
  return (
    <>
      <defs>
        <linearGradient id={id('bg')} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <radialGradient id={id('vig')} cx="50%" cy="45%" r="70%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.28" />
        </radialGradient>
      </defs>
      <rect width="63" height="88" rx="4" fill={`url(#${id('bg')})`} />
      <rect width="63" height="88" rx="4" fill={`url(#${id('vig')})`} />
      <rect x="2.6" y="2.6" width="57.8" height="82.8" rx="2.6" fill="none" stroke={stroke} strokeWidth="0.9" />
      <rect x="4.4" y="4.4" width="54.2" height="79.2" rx="1.6" fill="none" stroke={stroke} strokeWidth="0.3" />
    </>
  );
}

/** Face of a policy article. */
export function PolicyFace({ policy, compact = false }: { policy: ShPolicy; compact?: boolean }) {
  const id = useSvgIds();
  const lib = policy === 'liberal';
  const from = lib ? '#4d81ad' : '#a82626';
  const to = lib ? PALETTE.libDeep : PALETTE.fasDeep;
  const trim = lib ? PALETTE.cream : '#e9c9a0';
  return (
    <CardSvg label={lib ? 'Liberal policy' : 'Fascist policy'}>
      <PaperBg id={id} from={from} to={to} stroke={trim} />
      <DecoCorners color={trim} />
      {!lib && (
        <g opacity="0.22" stroke={PALETTE.black} strokeWidth="2.4">
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1={-20 + i * 12} y1="0" x2={i * 12 + 10} y2="88" />
          ))}
        </g>
      )}
      <text x="31.5" y={compact ? 17 : 15.5} textAnchor="middle" fontSize={compact ? 7.6 : 6} letterSpacing="0.8" fill={trim} style={DOSSIER}>
        {lib ? 'LIBERAL' : 'FASCIST'}
      </text>
      <EmblemDisc cx={31.5} cy={45} r={compact ? 19 : 16.5} ring={trim} fill={lib ? '#e9dfc4' : PALETTE.black}>
        <g transform={`translate(${31.5 - (compact ? 16 : 14)} ${45 - (compact ? 16 : 14)}) scale(${compact ? 0.32 : 0.28})`}>
          {lib ? (
            <DoveGlyph color={PALETTE.libDeep} accent="#5e7d3a" />
          ) : (
            <SerpentGlyph color={'#c0302a'} accent={PALETTE.cream} />
          )}
        </g>
      </EmblemDisc>
      {!compact && (
        <>
          <text x="31.5" y="71.5" textAnchor="middle" fontSize="5" letterSpacing="1.2" fill={trim} style={DOSSIER}>
            ARTICLE
          </text>
          <line x1="16" y1="75" x2="47" y2="75" stroke={trim} strokeWidth="0.3" />
          <text x="31.5" y="80" textAnchor="middle" fontSize="2.7" letterSpacing="0.5" fill={trim} opacity="0.8" style={DOSSIER}>
            BY ORDER OF THE ASSEMBLY
          </text>
        </>
      )}
    </CardSvg>
  );
}

/** Back of a policy tile (deck / face-down). */
export function PolicyBack() {
  const id = useSvgIds();
  return (
    <CardSvg label="Face-down policy">
      <PaperBg id={id} from="#7a5b36" to="#3b2814" stroke="#e2c994" />
      <g stroke="#e2c994" strokeWidth="0.35" opacity="0.45" fill="none">
        {Array.from({ length: 7 }, (_, i) => (
          <path key={i} d={`M31.5 ${10 + i * 1.2} L ${52 - i * 2} 44 L 31.5 ${78 - i * 1.2} L ${11 + i * 2} 44 Z`} />
        ))}
      </g>
      <rect x="10" y="38.5" width="43" height="11" fill="#2c1d0e" stroke="#e2c994" strokeWidth="0.5" />
      <text x="31.5" y="46.3" textAnchor="middle" fontSize="6" letterSpacing="1.6" fill="#e9d3a2" style={DOSSIER}>
        POLICY
      </text>
    </CardSvg>
  );
}

/** Ja! / Nein! ballot face. */
export function BallotFace({ vote }: { vote: ShVote }) {
  const id = useSvgIds();
  const ja = vote === 'ja';
  const paperFrom = ja ? '#f4ead0' : '#2b2522';
  const paperTo = ja ? '#d9c79c' : '#120d0c';
  const ink = ja ? PALETTE.ink : PALETTE.cream;
  return (
    <CardSvg label={ja ? 'Ja! ballot (approve)' : 'Nein! ballot (reject)'}>
      <PaperBg id={id} from={paperFrom} to={paperTo} stroke={ink} />
      <DecoCorners color={ink} />
      <text x="31.5" y="13.5" textAnchor="middle" fontSize="3.6" letterSpacing="1" fill={ink} opacity="0.75" style={DOSSIER}>
        BALLOT
      </text>
      {ja ? (
        <path d="M14 58 C 20 52, 26 52, 31.5 60 C 37 52, 43 52, 49 58" fill="none" stroke="#5e7d3a" strokeWidth="1.2" opacity="0.8" />
      ) : (
        <path d="M14 26 L 49 62 M49 26 L 14 62" stroke="#b3271f" strokeWidth="2.2" opacity="0.45" strokeLinecap="round" />
      )}
      <text x="31.5" y="50" textAnchor="middle" fontSize={ja ? 19 : 13.5} fill={ink} style={REGAL}>
        {ja ? 'JA!' : 'NEIN!'}
      </text>
      <text x="31.5" y="76" textAnchor="middle" fontSize="3.2" letterSpacing="0.8" fill={ink} opacity="0.75" style={DOSSIER}>
        {ja ? 'I APPROVE' : 'I REJECT'}
      </text>
    </CardSvg>
  );
}

export function BallotBack() {
  const id = useSvgIds();
  return (
    <CardSvg label="Sealed ballot">
      <PaperBg id={id} from="#56604f" to="#262c24" stroke="#d8d2b8" />
      <path d="M6 22 L 31.5 44 L 57 22" fill="none" stroke="#d8d2b8" strokeWidth="0.6" opacity="0.7" />
      <circle cx="31.5" cy="44" r="7" fill="#8b1d17" />
      <circle cx="31.5" cy="44" r="5" fill="none" stroke="#e6b9a8" strokeWidth="0.5" opacity="0.7" />
      <text x="31.5" y="74" textAnchor="middle" fontSize="5" letterSpacing="1.4" fill="#e8e2c8" style={DOSSIER}>
        SEALED
      </text>
    </CardSvg>
  );
}

const ROLE_STYLE: Record<ShRoleId, { from: string; to: string; trim: string; disc: string; title: string; sub: string }> = {
  liberal: { from: '#4d81ad', to: PALETTE.libDeep, trim: PALETTE.cream, disc: '#e9dfc4', title: 'LIBERAL', sub: 'SECRET ROLE' },
  fascist: { from: '#a82626', to: PALETTE.fasDeep, trim: '#ecc9a0', disc: PALETTE.black, title: 'FASCIST', sub: 'SECRET ROLE' },
  hitler: { from: '#3a1110', to: '#070303', trim: '#e3b45a', disc: '#2a0707', title: 'HITLER', sub: 'SECRET ROLE' },
};

/** Secret role card. */
export function RoleFace({ role }: { role: ShRoleId }) {
  const id = useSvgIds();
  const st = ROLE_STYLE[role];
  return (
    <CardSvg label={`Secret role: ${st.title.toLowerCase()}`}>
      <PaperBg id={id} from={st.from} to={st.to} stroke={st.trim} />
      <DecoCorners color={st.trim} />
      <text x="31.5" y="11.5" textAnchor="middle" fontSize="3" letterSpacing="1.2" fill={st.trim} opacity="0.8" style={DOSSIER}>
        {st.sub}
      </text>
      <EmblemDisc cx={31.5} cy={40} r={20} ring={st.trim} fill={st.disc}>
        <g transform="translate(14.5 23) scale(0.34)">
          {role === 'liberal' ? (
            <DoveGlyph color={PALETTE.libDeep} accent="#5e7d3a" />
          ) : (
            <SerpentGlyph color={role === 'hitler' ? '#7d1410' : '#c0302a'} accent={st.trim} crowned={role === 'hitler'} />
          )}
        </g>
      </EmblemDisc>
      <rect x="8" y="66" width="47" height="12" fill="rgba(0,0,0,0.28)" stroke={st.trim} strokeWidth="0.5" />
      <text x="31.5" y="75" textAnchor="middle" fontSize={role === 'hitler' ? 7.4 : 6.6} letterSpacing="1.4" fill={st.trim} style={REGAL}>
        {st.title}
      </text>
    </CardSvg>
  );
}

/** Party membership card (what an investigation reveals). */
export function PartyFace({ party }: { party: ShParty }) {
  const id = useSvgIds();
  const lib = party === 'liberal';
  const ink = lib ? PALETTE.libDeep : PALETTE.fas;
  return (
    <CardSvg label={lib ? 'Liberal party membership' : 'Fascist party membership'}>
      <PaperBg id={id} from="#efe0bb" to="#cdb07a" stroke={ink} />
      <text x="31.5" y="12" textAnchor="middle" fontSize="3.4" letterSpacing="0.9" fill={PALETTE.ink} style={DOSSIER}>
        PARTY MEMBERSHIP
      </text>
      <line x1="10" y1="15" x2="53" y2="15" stroke={PALETTE.ink} strokeWidth="0.3" />
      <EmblemDisc cx={31.5} cy={39} r={15} ring={ink} fill={lib ? '#dfe6ea' : PALETTE.black}>
        <g transform="translate(18.5 26) scale(0.26)">
          {lib ? <DoveGlyph color={PALETTE.libDeep} accent="#5e7d3a" /> : <SerpentGlyph color="#c0302a" accent={PALETTE.cream} />}
        </g>
      </EmblemDisc>
      <g transform="rotate(-9 31.5 66)">
        <rect x="9" y="58" width="45" height="15" rx="1.5" fill="none" stroke={ink} strokeWidth="1.3" />
        <text x="31.5" y="69" textAnchor="middle" fontSize="7.4" letterSpacing="1" fill={ink} style={REGAL}>
          {lib ? 'LIBERAL' : 'FASCIST'}
        </text>
      </g>
    </CardSvg>
  );
}

/** Back of a role / membership card — a manila confidential sleeve. */
export function SecretBack({ caption = 'CONFIDENTIAL' }: { caption?: string }) {
  const id = useSvgIds();
  return (
    <CardSvg label="Face-down confidential card">
      <PaperBg id={id} from={PALETTE.manila} to={PALETTE.manilaDeep} stroke="#5a4320" />
      <circle cx="31.5" cy="30" r="4.5" fill="none" stroke="#5a4320" strokeWidth="0.8" />
      <path d="M31.5 34.5 C 26 42, 38 46, 30 54" fill="none" stroke="#5a4320" strokeWidth="0.6" />
      <g transform="rotate(-14 31.5 60)">
        <rect x="8" y="54" width="47" height="11" fill="none" stroke="#9b1c1c" strokeWidth="1" />
        <text x="31.5" y="62" textAnchor="middle" fontSize={caption.length > 10 ? 4.6 : 5.6} letterSpacing="0.8" fill="#9b1c1c" style={DOSSIER}>
          {caption}
        </text>
      </g>
    </CardSvg>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

export function PowerIcon({ power, size = 22, color = 'currentColor' }: { power: ShExecutivePower | 'veto' | 'win' | 'hitler'; size?: number; color?: string }) {
  let body: ReactNode;
  switch (power) {
    case 'peekTop3':
      body = (
        <>
          <path d="M2 12 C 6 5, 18 5, 22 12 C 18 19, 6 19, 2 12 Z" fill="none" stroke={color} strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3.6" fill={color} />
        </>
      );
      break;
    case 'investigate':
      body = (
        <>
          <circle cx="10" cy="10" r="6" fill="none" stroke={color} strokeWidth="2" />
          <path d="M14.5 14.5 L 21 21" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
        </>
      );
      break;
    case 'specialElection':
      body = (
        <>
          <path d="M5 8 L 19 8 L 17 21 L 7 21 Z" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M3 6 L 21 6" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M12 11 L 13.2 14 L 16 14.2 L 13.8 16 L 14.6 19 L 12 17.3 L 9.4 19 L 10.2 16 L 8 14.2 L 10.8 14 Z" fill={color} />
        </>
      );
      break;
    case 'execute':
      body = (
        <>
          <path d="M9 21 L 9 10 C 9 5, 12 2, 12 2 C 12 2, 15 5, 15 10 L 15 21 Z" fill={color} />
          <path d="M8 16 L 16 16" stroke="rgba(0,0,0,0.45)" strokeWidth="1" />
        </>
      );
      break;
    case 'veto':
      body = (
        <>
          <circle cx="12" cy="12" r="8.5" fill="none" stroke={color} strokeWidth="2" />
          <path d="M6 6 L 18 18" stroke={color} strokeWidth="2" />
        </>
      );
      break;
    case 'hitler':
      body = <path d="M4 18 L 6 7 L 10 12 L 12 5 L 14 12 L 18 7 L 20 18 Z" fill={color} />;
      break;
    case 'win':
      body = <path d="M12 2 L 14.6 8.6 L 21.6 9 L 16.2 13.4 L 18 20.4 L 12 16.5 L 6 20.4 L 7.8 13.4 L 2.4 9 L 9.4 8.6 Z" fill={color} />;
      break;
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display: 'block' }}>
      {body}
    </svg>
  );
}

export function powerName(p: ShExecutivePower): string {
  switch (p) {
    case 'investigate':
      return 'Investigate Loyalty';
    case 'specialElection':
      return 'Call Special Election';
    case 'peekTop3':
      return 'Policy Peek';
    case 'execute':
      return 'Execution';
  }
}

export function powerShort(p: ShExecutivePower): string {
  switch (p) {
    case 'investigate':
      return 'Investigate';
    case 'specialElection':
      return 'Special election';
    case 'peekTop3':
      return 'Peek';
    case 'execute':
      return 'Execution';
  }
}

// ---------------------------------------------------------------------------
// Portrait silhouettes (sepia "file photo")
// ---------------------------------------------------------------------------

const HATS = ['fedora', 'cloche', 'bowler', 'bare', 'tophat', 'beret', 'fedora2', 'bob'] as const;

export function Portrait({ seat, dead = false }: { seat: number; dead?: boolean }) {
  const id = useSvgIds();
  const hat = HATS[seat % HATS.length]!;
  const tone = ['#3a2a1c', '#2c241d', '#35281f', '#2a2018'][seat % 4]!;
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <radialGradient id={id('bg')} cx="50%" cy="38%" r="70%">
          <stop offset="0" stopColor={dead ? '#8d8a84' : '#d8be8c'} />
          <stop offset="1" stopColor={dead ? '#4a4844' : '#8a6a3c'} />
        </radialGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#${id('bg')})`} />
      <g fill={dead ? '#2b2a28' : tone}>
        <path d="M8 64 C 9 50, 20 43, 32 43 C 44 43, 55 50, 56 64 Z" />
        <rect x="28" y="36" width="8" height="9" />
        <ellipse cx="32" cy="29" rx="9" ry="11" />
        {hat === 'fedora' && (
          <>
            <ellipse cx="32" cy="21" rx="17" ry="3.4" />
            <path d="M22 21 C 22 11, 26 8, 32 9.5 C 38 8, 42 11, 42 21 Z" />
          </>
        )}
        {hat === 'fedora2' && (
          <>
            <ellipse cx="32" cy="20.5" rx="15" ry="3" transform="rotate(-6 32 20.5)" />
            <path d="M23 21 C 23 12, 27 9, 32 10.5 C 37 9, 41 12, 41 20 Z" />
          </>
        )}
        {hat === 'bowler' && (
          <>
            <ellipse cx="32" cy="21.5" rx="13.5" ry="3" />
            <path d="M23 21.5 C 23 10.5, 41 10.5, 41 21.5 Z" />
          </>
        )}
        {hat === 'tophat' && (
          <>
            <ellipse cx="32" cy="21" rx="14" ry="3" />
            <rect x="25" y="5" width="14" height="16" rx="1" />
          </>
        )}
        {hat === 'cloche' && <path d="M20.5 28 C 19 13, 45 13, 43.5 28 C 39 23, 25 23, 20.5 28 Z" />}
        {hat === 'beret' && (
          <>
            <ellipse cx="30" cy="19.5" rx="12.5" ry="5" />
            <rect x="29" y="12.5" width="2" height="3" />
          </>
        )}
        {hat === 'bob' && <path d="M21 33 C 18 14, 46 14, 43 33 C 42 26, 40 22, 32 21 C 24 22, 22 26, 21 33 Z" />}
        {hat === 'bare' && <path d="M23 26 C 22 17, 42 16, 41 26 C 38 21, 26 21, 23 26 Z" />}
      </g>
      {hat === 'fedora' || hat === 'fedora2' ? <rect x="22.5" y="17.6" width="19" height="2.2" fill={dead ? '#55524d' : '#7a2a1c'} opacity="0.85" /> : null}
    </svg>
  );
}
