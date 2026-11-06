import { Emboss, Glow, SoftShadow, useSvgIds } from '@/ui/shared/svg';
import { roman } from './turns';
import art from './Art.module.css';

// ============================================================================
// Avalon table pieces: vote tokens, quest cards, quest medallions, the
// leader's crown, team tokens, seat heraldry and candles. Pure SVG.
// ============================================================================

function GoldStops() {
  return (
    <>
      <stop offset="0%" stopColor="#fff1b8" />
      <stop offset="45%" stopColor="#d4a64a" />
      <stop offset="100%" stopColor="#6e4a12" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Vote tokens (approve / reject) — round, embossed
// ---------------------------------------------------------------------------

export function VoteTokenFace({ approve }: { approve: boolean }) {
  const id = useSvgIds();
  return (
    <svg viewBox="0 0 64 64" className={art.fill} role="img" aria-label={approve ? 'Approve' : 'Reject'}>
      <defs>
        <radialGradient id={id('face')} cx="40%" cy="35%" r="70%">
          {approve ? (
            <>
              <stop offset="0%" stopColor="#fffaf0" />
              <stop offset="100%" stopColor="#d9cba6" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#4a4d55" />
              <stop offset="100%" stopColor="#121317" />
            </>
          )}
        </radialGradient>
        <linearGradient id={id('rim')} x1="0" y1="0" x2="1" y2="1">
          {approve ? <GoldStops /> : (
            <>
              <stop offset="0%" stopColor="#e86a5c" />
              <stop offset="100%" stopColor="#5e0d12" />
            </>
          )}
        </linearGradient>
        <Emboss id={id('emb')} depth={1.2} />
      </defs>
      <circle cx="32" cy="32" r="30" fill={id.url('rim')} filter={id.url('emb')} />
      <circle cx="32" cy="32" r="24.5" fill={id.url('face')} />
      {approve ? (
        <g>
          {/* laurel + raised sword */}
          <g fill="none" stroke="#3f7a3a" strokeWidth="1.6" strokeLinecap="round">
            <path d="M18 40 C16 32 18 24 24 18 M46 40 C48 32 46 24 40 18" />
          </g>
          <g fill="#4f8f45">
            {[[17, 34, -20], [18, 27, -40], [21, 21, -60], [47, 34, 20], [46, 27, 40], [43, 21, 60]].map(([x, y, r], i) => (
              <ellipse key={i} cx={x} cy={y} rx="1.8" ry="3.6" transform={`rotate(${r} ${x} ${y})`} />
            ))}
          </g>
          <path d="M32 12 L34.5 38 L29.5 38 Z" fill="#c8d0dc" stroke="#6e7887" strokeWidth="0.5" />
          <rect x="25" y="38" width="14" height="3" rx="1.4" fill="#b8892f" />
          <rect x="30.6" y="41" width="2.8" height="6" fill="#5a3a1c" />
          <text x="32" y="55" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="6.4" fontWeight="700" fill="#5a4216" letterSpacing="0.6">
            APPROVE
          </text>
        </g>
      ) : (
        <g>
          <g stroke="#c9ced8" strokeWidth="3" strokeLinecap="round">
            <path d="M20 18 L44 42 M44 18 L20 42" />
          </g>
          <g fill="#8a1a1a">
            <rect x="17" y="40" width="9" height="3" rx="1.2" transform="rotate(-45 21.5 41.5)" />
            <rect x="38" y="40" width="9" height="3" rx="1.2" transform="rotate(45 42.5 41.5)" />
          </g>
          <text x="32" y="55" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="6.6" fontWeight="700" fill="#e86a5c" letterSpacing="0.8">
            REJECT
          </text>
        </g>
      )}
    </svg>
  );
}

/** Identical back for every vote token: nobody can tell them apart. */
export function VoteTokenBack() {
  const id = useSvgIds();
  return (
    <svg viewBox="0 0 64 64" className={art.fill} role="img" aria-label="Face-down vote">
      <defs>
        <radialGradient id={id('b')} cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#b98a4a" />
          <stop offset="100%" stopColor="#4a2e12" />
        </radialGradient>
        <Emboss id={id('emb')} depth={1.2} />
      </defs>
      <circle cx="32" cy="32" r="30" fill={id.url('b')} filter={id.url('emb')} />
      <circle cx="32" cy="32" r="22" fill="none" stroke="#e7c27a" strokeWidth="1.2" opacity="0.8" />
      <path d="M24 26 L27 20 L30 25 L32 18 L34 25 L37 20 L40 26 Z" fill="#f3d27a" />
      <path d="M32 28 V46" stroke="#f3d27a" strokeWidth="2.4" />
      <path d="M27 32 H37" stroke="#f3d27a" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Quest cards (success / fail)
// ---------------------------------------------------------------------------

export function QuestCardFace({ success }: { success: boolean }) {
  const id = useSvgIds();
  return (
    <svg viewBox="0 0 70 100" className={art.fill} role="img" aria-label={success ? 'Success' : 'Fail'}>
      <defs>
        <linearGradient id={id('bg')} x1="0" y1="0" x2="0" y2="1">
          {success ? (
            <>
              <stop offset="0%" stopColor="#2f62c4" />
              <stop offset="100%" stopColor="#0e2257" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#a3141c" />
              <stop offset="100%" stopColor="#2a0306" />
            </>
          )}
        </linearGradient>
        <linearGradient id={id('g')} x1="0" y1="0" x2="1" y2="1">
          <GoldStops />
        </linearGradient>
        <Glow id={id('glow')} color={success ? '#ffe08a' : '#ff5a3c'} blur={3} strength={0.85} />
      </defs>
      <rect x="1" y="1" width="68" height="98" rx="6" fill={id.url('bg')} stroke={id.url('g')} strokeWidth="2" />
      <rect x="5" y="5" width="60" height="90" rx="4" fill="none" stroke={id.url('g')} strokeWidth="0.7" opacity="0.8" />
      {success ? (
        <g filter={id.url('glow')}>
          <path d="M20 30 C20 50 50 50 50 30 Z" fill={id.url('g')} />
          <ellipse cx="35" cy="30" rx="15" ry="3" fill="#fff3c4" />
          <rect x="32.5" y="47" width="5" height="12" fill={id.url('g')} />
          <ellipse cx="35" cy="61" rx="11" ry="3.4" fill={id.url('g')} />
          <circle cx="35" cy="38" r="2" fill="#2f62c4" />
        </g>
      ) : (
        <g filter={id.url('glow')}>
          {/* broken sword */}
          <path d="M33 22 L37 22 L36.4 42 L33.6 42 Z" fill="#c9ced8" />
          <path d="M33.6 42 L36.4 42 L38 46 L34 44 L32 47 Z" fill="#c9ced8" />
          <path d="M35 50 L37 51.5 L36 62 L34 62 Z" fill="#c9ced8" transform="rotate(14 35 56)" />
          <rect x="26" y="18" width="18" height="3.6" rx="1.4" fill={id.url('g')} />
          <rect x="33.4" y="10" width="3.2" height="8" fill="#3a2410" />
          <circle cx="35" cy="9" r="2.6" fill={id.url('g')} />
          <path d="M28 68 C30 64 33 66 35 64 C37 66 40 64 42 68" stroke="#ff8a6a" strokeWidth="1" fill="none" />
        </g>
      )}
      <text x="35" y="84" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="9.5" fontWeight="700" fill="#f3d27a" letterSpacing="1.2">
        {success ? 'SUCCESS' : 'FAIL'}
      </text>
    </svg>
  );
}

export function QuestCardBack() {
  const id = useSvgIds();
  return (
    <svg viewBox="0 0 70 100" className={art.fill} role="img" aria-label="Face-down quest card">
      <defs>
        <linearGradient id={id('g')} x1="0" y1="0" x2="1" y2="1">
          <GoldStops />
        </linearGradient>
        <pattern id={id('p')} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#2b2016" />
          <rect width="4" height="8" fill="#33261a" />
        </pattern>
      </defs>
      <rect x="1" y="1" width="68" height="98" rx="6" fill={id.url('p')} stroke={id.url('g')} strokeWidth="2" />
      <rect x="6" y="6" width="58" height="88" rx="4" fill="none" stroke="#8a6420" strokeWidth="0.8" />
      <circle cx="35" cy="50" r="16" fill="#1a130c" stroke={id.url('g')} strokeWidth="1.4" />
      <path d="M35 38 V62 M29 44 H41" stroke={id.url('g')} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Quest medallion (board)
// ---------------------------------------------------------------------------

export type MedallionState = 'pending' | 'current' | 'success' | 'fail';

export function QuestMedallion({
  quest,
  teamSize,
  failsRequired,
  state,
  failCount,
}: {
  quest: number;
  teamSize: number;
  failsRequired: number;
  state: MedallionState;
  failCount?: number;
}) {
  const id = useSvgIds();
  const enamel =
    state === 'success' ? ['#4f86e8', '#122a6b'] : state === 'fail' ? ['#d0343c', '#4a0509'] : ['#3a3026', '#16110c'];
  return (
    <svg viewBox="0 0 100 100" className={art.fill} aria-hidden>
      <defs>
        <linearGradient id={id('rim')} x1="0" y1="0" x2="1" y2="1">
          <GoldStops />
        </linearGradient>
        <radialGradient id={id('en')} cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor={enamel[0]} />
          <stop offset="100%" stopColor={enamel[1]} />
        </radialGradient>
        <Emboss id={id('emb')} depth={1.8} />
        <SoftShadow id={id('sh')} dy={3} blur={3} opacity={0.6} />
      </defs>
      <g filter={id.url('sh')}>
        <circle cx="50" cy="50" r="46" fill={id.url('rim')} filter={id.url('emb')} />
        {/* notched outer ring */}
        <g fill="#6e4a12" opacity="0.55">
          {Array.from({ length: 24 }, (_, i) => (
            <rect key={i} x="49" y="5" width="2" height="5" transform={`rotate(${i * 15} 50 50)`} />
          ))}
        </g>
        <circle cx="50" cy="50" r="36" fill={id.url('en')} className={state === 'success' || state === 'fail' ? art.enamelFill : undefined} />
        <circle cx="50" cy="50" r="36" fill="none" stroke="#2a1f14" strokeWidth="1.2" opacity="0.6" />
      </g>
      {state === 'success' && (
        <g fill={id.url('rim')} className={art.emblemIn}>
          <path d="M36 36 C36 54 64 54 64 36 Z" />
          <ellipse cx="50" cy="36" rx="14" ry="3" fill="#fff3c4" />
          <rect x="47.5" y="51" width="5" height="9" />
          <ellipse cx="50" cy="62" rx="10" ry="3" />
        </g>
      )}
      {state === 'fail' && (
        <g className={art.emblemIn}>
          <path d="M48 26 L52 26 L51.5 46 L48.5 46 Z" fill="#e6e9ef" />
          <path d="M49 52 L51.5 53 L51 70 L49 70 Z" fill="#e6e9ef" transform="rotate(16 50 60)" />
          <rect x="41" y="24" width="18" height="3.6" rx="1.4" fill={id.url('rim')} />
          {failCount !== undefined && (
            <text x="50" y="84" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="9" fontWeight="700" fill="#ffd0c4">
              {failCount} {failCount === 1 ? 'FAIL' : 'FAILS'}
            </text>
          )}
        </g>
      )}
      {(state === 'pending' || state === 'current') && (
        <>
          <text x="50" y="40" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="12" fill="#d4a64a" letterSpacing="1">
            {roman(quest)}
          </text>
          <text x="50" y="68" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="28" fontWeight="900" fill="#f3d27a">
            {teamSize}
          </text>
        </>
      )}
      {failsRequired > 1 && (state === 'pending' || state === 'current') && (
        <text x="50" y="80" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="7" fontWeight="700" fill="#ff9a8a" letterSpacing="0.6">
          2 FAILS
        </text>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

export function CrownIcon({ size = 28 }: { size?: number }) {
  const id = useSvgIds();
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 40 32" role="img" aria-label="Leader">
      <defs>
        <linearGradient id={id('g')} x1="0" y1="0" x2="1" y2="1">
          <GoldStops />
        </linearGradient>
        <Glow id={id('glow')} color="#f3d27a" blur={2} strength={0.8} />
      </defs>
      <g filter={id.url('glow')}>
        <path d="M4 26 L2 8 L12 16 L20 3 L28 16 L38 8 L36 26 Z" fill={id.url('g')} stroke="#6e4a12" strokeWidth="1" />
        <rect x="4" y="25" width="32" height="5" rx="1.5" fill={id.url('g')} stroke="#6e4a12" strokeWidth="1" />
        <circle cx="20" cy="18" r="2.4" fill="#b3131c" />
        <circle cx="11" cy="21" r="1.6" fill="#2453b0" />
        <circle cx="29" cy="21" r="1.6" fill="#2453b0" />
      </g>
    </svg>
  );
}

/** The team token placed in front of a chosen knight. */
export function TeamToken({ size = 30 }: { size?: number }) {
  const id = useSvgIds();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="On the quest team">
      <defs>
        <radialGradient id={id('b')} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#3e6ad0" />
          <stop offset="100%" stopColor="#0f2357" />
        </radialGradient>
        <linearGradient id={id('g')} x1="0" y1="0" x2="1" y2="1">
          <GoldStops />
        </linearGradient>
        <Emboss id={id('emb')} depth={1} />
      </defs>
      <circle cx="20" cy="20" r="18" fill={id.url('g')} filter={id.url('emb')} />
      <circle cx="20" cy="20" r="14" fill={id.url('b')} />
      <path d="M20 7 L22 26 L18 26 Z" fill="#e6e9ef" />
      <rect x="13" y="25" width="14" height="3" rx="1.2" fill={id.url('g')} />
      <rect x="18.8" y="28" width="2.4" height="5" fill="#3a2410" />
    </svg>
  );
}

// Ten tinctures × ten divisions — chosen by seat index, never by role.
const TINCTURES: Array<[string, string]> = [
  ['#1f4aa8', '#f3d27a'],
  ['#9b1c1c', '#f4efe2'],
  ['#2f6b3e', '#f3d27a'],
  ['#5b2386', '#e6e9ef'],
  ['#b8892f', '#1a1a1e'],
  ['#1a1a1e', '#e6e9ef'],
  ['#2a7a8a', '#f4efe2'],
  ['#8a3a1c', '#f3d27a'],
  ['#3a4664', '#d4a64a'],
  ['#6e0f3a', '#f3d27a'],
];

function Division({ kind, color }: { kind: number; color: string }) {
  switch (kind % 10) {
    case 0:
      return <path d="M30 0 H60 V70 H30 Z" fill={color} />; // per pale
    case 1:
      return <path d="M0 0 H60 V22 H0 Z" fill={color} />; // chief
    case 2:
      return <path d="M0 0 L60 70 V44 L22 0 Z" fill={color} />; // bend
    case 3:
      return <path d="M0 58 L30 26 L60 58 V44 L30 12 L0 44 Z" fill={color} />; // chevron
    case 4:
      return <path d="M0 0 H30 V35 H0 Z M30 35 H60 V70 H30 Z" fill={color} />; // quarterly
    case 5:
      return <path d="M24 0 H36 V70 H24 Z M0 26 H60 V38 H0 Z" fill={color} />; // cross
    case 6:
      return <path d="M0 0 L8 0 L60 62 L60 70 L52 70 L0 8 Z M60 0 L60 8 L8 70 L0 70 L0 62 L52 0 Z" fill={color} />; // saltire
    case 7:
      return <path d="M0 32 H60 V70 H0 Z" fill={color} />; // per fess
    case 8:
      return <path d="M0 0 H12 V70 H0 Z M24 0 H36 V70 H24 Z M48 0 H60 V70 H48 Z" fill={color} />; // paly
    default:
      return <circle cx="30" cy="34" r="12" fill={color} />; // roundel
  }
}

/** A seat's heraldic shield with the player's initial. */
export function SeatShield({ seat, name, size = 56 }: { seat: number; name: string; size?: number }) {
  const id = useSvgIds();
  const [field, metal] = TINCTURES[seat % TINCTURES.length]!;
  const shape = 'M2 2 H58 V30 C58 50 42 62 30 68 C18 62 2 50 2 30 Z';
  // Skip honorifics so "Sir Kay" and "Sir Bors" don't all read "S".
  const words = name.trim().split(/\s+/).filter(Boolean);
  const main = words.length > 1 && /^(sir|lady|dame|lord|king|queen)$/i.test(words[0]!) ? words[1]! : words[0] ?? '?';
  const initial = (main[0] ?? '?').toUpperCase();
  return (
    <svg width={size} height={size * 1.16} viewBox="0 0 60 70" aria-hidden>
      <defs>
        <clipPath id={id('c')}>
          <path d={shape} />
        </clipPath>
        <linearGradient id={id('shade')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={id('rim')} x1="0" y1="0" x2="1" y2="1">
          <GoldStops />
        </linearGradient>
        <Emboss id={id('emb')} depth={1.1} />
      </defs>
      <g clipPath={id.url('c')}>
        <rect width="60" height="70" fill={field} />
        <Division kind={seat} color={metal} />
        <rect width="60" height="70" fill={id.url('shade')} />
      </g>
      <path d={shape} fill="none" stroke={id.url('rim')} strokeWidth="3.4" filter={id.url('emb')} />
      <circle cx="30" cy="33" r="12.5" fill="#0d0a07" opacity="0.72" />
      <text x="30" y="39" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="16" fontWeight="900" fill="#f3d27a">
        {initial}
      </text>
    </svg>
  );
}

/** A beeswax candle with a flickering flame. */
export function Candle({ height = 46, delay = 0 }: { height?: number; delay?: number }) {
  const id = useSvgIds();
  return (
    <svg width={height * 0.5} height={height} viewBox="0 0 20 40" aria-hidden className={art.candle}>
      <defs>
        <linearGradient id={id('wax')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c9b48a" />
          <stop offset="45%" stopColor="#fbf2dc" />
          <stop offset="100%" stopColor="#a8916a" />
        </linearGradient>
        <radialGradient id={id('fl')} cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#ffd36a" />
          <stop offset="100%" stopColor="#ff7a1e" stopOpacity="0.9" />
        </radialGradient>
        <radialGradient id={id('halo')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffcf73" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffcf73" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="10" cy="10" r="10" fill={id.url('halo')} className={art.flicker} style={{ animationDelay: `${delay}s` }} />
      <rect x="6" y="16" width="8" height="22" rx="1.5" fill={id.url('wax')} />
      <path d="M6 18 C8 20 9 17 10 20 C11 23 12 18 14 19" stroke="#efe2c4" strokeWidth="1" fill="none" />
      <path d="M10 15.5 V17.5" stroke="#2a1f14" strokeWidth="0.8" />
      <g className={art.flame} style={{ animationDelay: `${delay}s` }}>
        <path d="M10 4 C13 8 13.5 11 12 13.5 C11 15.5 9 15.5 8 13.5 C6.5 11 7 8 10 4 Z" fill={id.url('fl')} />
      </g>
      <ellipse cx="10" cy="38.5" rx="7" ry="1.6" fill="#000" opacity="0.4" />
    </svg>
  );
}

/** The Assassin's blade (game-over strike). */
export function DaggerIcon({ size = 72 }: { size?: number }) {
  const id = useSvgIds();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id={id('blade')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6c7684" />
          <stop offset="50%" stopColor="#f4f6fa" />
          <stop offset="100%" stopColor="#8d97a6" />
        </linearGradient>
        <linearGradient id={id('g')} x1="0" y1="0" x2="1" y2="1">
          <GoldStops />
        </linearGradient>
        <Glow id={id('glow')} color="#ff3b30" blur={3} strength={0.7} />
      </defs>
      <g transform="rotate(45 32 32)" filter={id.url('glow')}>
        <path d="M32 2 L36 40 L32 44 L28 40 Z" fill={id.url('blade')} />
        <path d="M32 2 L32 42" stroke="#fff" strokeWidth="0.6" opacity="0.7" />
        <path d="M32 2 C33.6 8 34.4 12 32 15 C29.6 12 30.4 8 32 2 Z" fill="#a3121a" />
        <rect x="21" y="40" width="22" height="4" rx="2" fill={id.url('g')} />
        <rect x="30" y="44" width="4" height="12" fill="#2b1a10" />
        <circle cx="32" cy="58" r="3.4" fill={id.url('g')} />
      </g>
    </svg>
  );
}
