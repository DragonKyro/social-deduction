import type { ReactNode } from 'react';
import type { GameId } from '@/engine/types';
import { Glow, SoftShadow, Vignette, useSvgIds } from '@/ui/shared/svg';
import styles from './GameTileArt.module.css';

// Hero art for the home tiles (also reused as the lobby banner). Each is a
// layered 320×180 scene: a lit backdrop, a focal object with soft shadows,
// a vignette, and one or two cheap ambient animations (opacity / transform
// only, so eleven of them on screen stay smooth).

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

type Ids = ReturnType<typeof useSvgIds>;

function Scene({
  ids,
  bg,
  defs,
  children,
  vignette = 0.75,
}: {
  ids: Ids;
  bg: [string, string, string?];
  defs?: ReactNode;
  children: ReactNode;
  vignette?: number;
}) {
  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      className={styles.svg}
      role="img"
      aria-hidden
    >
      <defs>
        <linearGradient id={ids('bg')} x1="0" x2="0.3" y1="0" y2="1">
          <stop offset="0%" stopColor={bg[0]} />
          {bg[2] && <stop offset="55%" stopColor={bg[2]} />}
          <stop offset="100%" stopColor={bg[1]} />
        </linearGradient>
        <Vignette id={ids('vig')} opacity={vignette} inner={0.45} />
        <SoftShadow id={ids('shadow')} dy={3} blur={3} opacity={0.6} />
        {defs}
      </defs>
      <rect width="320" height="180" fill={ids.url('bg')} />
      {children}
      <rect width="320" height="180" fill={ids.url('vig')} pointerEvents="none" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// One Night Ultimate Werewolf — moonlit forest, howling wolf, lit cottage.
// ---------------------------------------------------------------------------

function OnuwTile() {
  const id = useSvgIds();
  const stars = [
    [24, 18, 1.2], [58, 34, 0.8], [92, 14, 1.4], [128, 40, 0.9], [150, 16, 1.1],
    [176, 30, 0.7], [40, 60, 0.8], [110, 62, 0.6], [292, 22, 1], [304, 70, 0.7], [16, 92, 0.6],
  ] as const;
  return (
    <Scene
      ids={id}
      bg={['#070b24', '#0c1430', '#141c4a']}
      defs={
        <>
          <radialGradient id={id('moonGlow')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff6d5" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#c9d4ff" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#c9d4ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id('moon')} cx="40%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#fffbea" />
            <stop offset="70%" stopColor="#efe4c0" />
            <stop offset="100%" stopColor="#c8b98e" />
          </radialGradient>
          <linearGradient id={id('fog')} x1="0" x2="1">
            <stop offset="0" stopColor="#9fb0e6" stopOpacity="0" />
            <stop offset="0.5" stopColor="#9fb0e6" stopOpacity="0.22" />
            <stop offset="1" stopColor="#9fb0e6" stopOpacity="0" />
          </linearGradient>
          <Glow id={id('window')} color="#ffb347" blur={3} />
        </>
      }
    >
      {stars.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#f4f1ff" className={styles.twinkle} style={{ animationDelay: `${(i * 0.37) % 3}s` }} />
      ))}
      <circle cx="232" cy="62" r="70" fill={id.url('moonGlow')} />
      <circle cx="232" cy="62" r="34" fill={id.url('moon')} />
      <g fill="#b9aa7d" opacity="0.45">
        <circle cx="222" cy="52" r="6" />
        <circle cx="244" cy="70" r="4.5" />
        <circle cx="236" cy="48" r="2.5" />
        <circle cx="219" cy="72" r="3" />
      </g>
      {/* Far ridge */}
      <path d="M0 128 Q40 104 80 118 T160 110 T240 116 T320 104 V180 H0 Z" fill="#141b3e" />
      {/* Mid pines */}
      <g fill="#0d1230">
        {[10, 34, 58, 270, 292, 314].map((x, i) => (
          <path key={i} d={`M${x} 150 l12 -46 l12 46 Z M${x + 3} 132 l9 -30 l9 30 Z`} />
        ))}
      </g>
      {/* Rock + a sitting wolf howling at the moon */}
      <path d="M176 152 Q190 124 214 122 Q246 120 266 152 Z" fill="#0a0e24" />
      <g fill="#05071a">
        <path d="M244 146 C250 140 254 126 248 112 C244 104 236 100 232 96 L230 86 L226 74 L222 84 L218 80 L214 86 C208 82 200 78 192 72 C196 80 200 86 206 92 C204 96 206 100 210 102 C214 110 214 122 212 134 L210 146 L216 146 L218 136 C222 140 228 142 232 142 L234 146 Z" />
        <path d="M244 146 C254 148 262 144 266 136 C262 142 254 144 246 142 Z" />
      </g>
      <path d="M192 72 l-2 -3" stroke="#05071a" strokeWidth="2" strokeLinecap="round" />
      {/* Cottage with a lit window */}
      <g transform="translate(70 118)">
        <path d="M0 32 V12 L20 -4 L40 12 V32 Z" fill="#0b0f2a" />
        <path d="M-4 13 L20 -7 L44 13" fill="none" stroke="#1a2150" strokeWidth="3" />
        <rect x="26" y="-2" width="5" height="10" fill="#0b0f2a" />
        <rect x="9" y="15" width="9" height="8" fill="#ffc46b" filter={id.url('window')} className={styles.flicker} />
        <path d="M13.5 15 V23 M9 19 H18" stroke="#3b2a12" strokeWidth="1" />
      </g>
      {/* Near treeline */}
      <path
        d="M0 180 V150 l8-22 8 22 6-30 8 30 8-18 8 18 V180 Z M250 180 V146 l10-28 10 28 6-20 8 20 8-34 10 34 8-16 10 16 V180 Z"
        fill="#05071a"
      />
      <rect x="-40" y="140" width="400" height="26" fill={id.url('fog')} className={styles.drift} />
      <rect x="0" y="166" width="320" height="14" fill="#05071a" />
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Avalon — castle at dusk, the sword in the stone.
// ---------------------------------------------------------------------------

function AvalonTile() {
  const id = useSvgIds();
  return (
    <Scene
      ids={id}
      bg={['#1b2a5c', '#0a0f22', '#5a4a7a']}
      defs={
        <>
          <linearGradient id={id('blade')} x1="0" x2="1">
            <stop offset="0" stopColor="#9aa7bd" />
            <stop offset="0.5" stopColor="#f4f7ff" />
            <stop offset="1" stopColor="#7d889c" />
          </linearGradient>
          <linearGradient id={id('gold')} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffe9a3" />
            <stop offset="1" stopColor="#a67a22" />
          </linearGradient>
          <radialGradient id={id('halo')} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#d9e6ff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#d9e6ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id('stone')} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#6b6f80" />
            <stop offset="1" stopColor="#2b2e3a" />
          </linearGradient>
        </>
      }
    >
      {/* Sunset band */}
      <rect y="70" width="320" height="40" fill="#e58f5a" opacity="0.18" />
      {/* Castle on the hill */}
      <path d="M0 132 Q80 96 170 108 T320 100 V180 H0 Z" fill="#1a1f3a" />
      <g fill="#10142a">
        <rect x="214" y="58" width="14" height="48" />
        <rect x="236" y="70" width="40" height="36" />
        <rect x="282" y="52" width="14" height="54" />
        <path d="M211 58 l10-16 10 16 Z M279 52 l10-18 10 18 Z" />
        <path d="M236 70 h6 v-6 h6 v6 h6 v-6 h6 v6 h6 v-6 h6 v6 h4 v4 h-40 Z" />
      </g>
      <path d="M221 42 v-12 l10 4 -10 4" fill="#c43b3b" className={styles.wave} />
      <path d="M289 34 v-12 l10 4 -10 4" fill="#3f7fd6" className={styles.wave} />
      <g fill="#ffcf73" className={styles.flicker}>
        <rect x="219" y="76" width="3" height="5" />
        <rect x="252" y="84" width="3" height="5" />
        <rect x="287" y="68" width="3" height="5" />
      </g>
      {/* Halo + sword in the stone */}
      <circle cx="110" cy="88" r="56" fill={id.url('halo')} className={styles.pulse} />
      <g filter={id.url('shadow')}>
        <rect x="104" y="40" width="12" height="82" rx="2" fill={id.url('blade')} />
        <path d="M104 40 L110 30 L116 40 Z" fill="#e8eef9" />
        <rect x="88" y="118" width="44" height="7" rx="3" fill={id.url('gold')} />
        <rect x="106" y="125" width="8" height="18" fill="#5a3a1a" />
        <circle cx="110" cy="146" r="5" fill={id.url('gold')} />
      </g>
      <path d="M58 180 Q62 136 110 134 Q160 136 168 180 Z" fill={id.url('stone')} />
      <path d="M78 150 q20 -6 40 -2 M90 164 q24 -4 52 0" stroke="#2a2c37" strokeWidth="2" fill="none" opacity="0.6" />
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Secret Hitler — art-deco dossier: sunburst, folder, policy cards, ballots.
// ---------------------------------------------------------------------------

function SecretHitlerTile() {
  const id = useSvgIds();
  const rays = Array.from({ length: 14 }, (_, i) => i);
  return (
    <Scene
      ids={id}
      bg={['#3b0d0d', '#120707', '#5c1414']}
      defs={
        <>
          <linearGradient id={id('manila')} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#e9cf8f" />
            <stop offset="1" stopColor="#b8954f" />
          </linearGradient>
          <linearGradient id={id('lib')} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#5f9fd3" />
            <stop offset="1" stopColor="#2e5f8f" />
          </linearGradient>
          <linearGradient id={id('fas')} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#d4513f" />
            <stop offset="1" stopColor="#7e1f17" />
          </linearGradient>
        </>
      }
    >
      <g transform="translate(160 200)" opacity="0.16">
        {rays.map((i) => (
          <path key={i} d="M0 0 L-14 -230 L14 -230 Z" fill="#f1c48d" transform={`rotate(${-78 + i * 12})`} />
        ))}
      </g>
      {/* Folder */}
      <g filter={id.url('shadow')} transform="rotate(-4 160 110)">
        <path d="M56 56 h70 l10 10 h128 v96 H56 Z" fill={id.url('manila')} />
        <rect x="56" y="66" width="208" height="96" fill={id.url('manila')} />
        <text x="76" y="150" style={{ fontFamily: 'var(--font-dossier)' }} fontSize="11" fill="#5a3f17" opacity="0.8">
          FILE No. 33 — EYES ONLY
        </text>
      </g>
      {/* Policies */}
      <g filter={id.url('shadow')}>
        <g transform="rotate(-12 120 90)">
          <rect x="88" y="34" width="62" height="88" rx="4" fill={id.url('lib')} stroke="#eaf3ff" strokeWidth="2" />
          <path d="M108 74 q12 -14 28 -8 q-8 4 -10 10 q8 2 12 -2 q-6 14 -24 10 q-6 -2 -6 -10 Z" fill="#eaf3ff" />
          <text x="119" y="112" textAnchor="middle" style={{ fontFamily: 'var(--font-dossier)' }} fontSize="9" fill="#eaf3ff">
            LIBERAL
          </text>
        </g>
        <g transform="rotate(9 200 90)">
          <rect x="172" y="30" width="62" height="88" rx="4" fill={id.url('fas')} stroke="#2a0b08" strokeWidth="2" />
          <circle cx="203" cy="66" r="13" fill="#2a0b08" />
          <circle cx="198" cy="64" r="3.2" fill={id.url('fas')} />
          <circle cx="208" cy="64" r="3.2" fill={id.url('fas')} />
          <path d="M197 74 h12 v6 h-12 Z" fill="#2a0b08" />
          <text x="203" y="106" textAnchor="middle" style={{ fontFamily: 'var(--font-dossier)' }} fontSize="9" fill="#2a0b08">
            FASCIST
          </text>
        </g>
      </g>
      {/* Stamp */}
      <g transform="translate(248 134) rotate(-14)" className={styles.stamp}>
        <rect x="-34" y="-14" width="68" height="28" rx="4" fill="none" stroke="#d63a2a" strokeWidth="3" />
        <text x="0" y="7" textAnchor="middle" style={{ fontFamily: 'var(--font-dossier)' }} fontSize="18" fill="#d63a2a">
          JA!
        </text>
      </g>
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Coup — gilded court: crest-backed influence cards and stacked coins.
// ---------------------------------------------------------------------------

function CoupTile() {
  const id = useSvgIds();
  const coins = [0, 1, 2, 3, 4, 5];
  return (
    <Scene
      ids={id}
      bg={['#2b0f2e', '#0c0610', '#43143f']}
      defs={
        <>
          <linearGradient id={id('gold')} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff0b8" />
            <stop offset="0.5" stopColor="#d9a93e" />
            <stop offset="1" stopColor="#7a5414" />
          </linearGradient>
          <linearGradient id={id('coinEdge')} x1="0" x2="1">
            <stop offset="0" stopColor="#8a5f17" />
            <stop offset="0.5" stopColor="#f3cf6c" />
            <stop offset="1" stopColor="#7a5414" />
          </linearGradient>
          <linearGradient id={id('back')} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#2c1a4a" />
            <stop offset="1" stopColor="#120a20" />
          </linearGradient>
          <pattern id={id('damask')} width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M8 1 L15 8 L8 15 L1 8 Z" fill="none" stroke="#d9a93e" strokeOpacity="0.25" strokeWidth="0.8" />
          </pattern>
        </>
      }
    >
      <rect width="320" height="180" fill={id.url('damask')} opacity="0.6" />
      {/* Two cards */}
      {[
        { x: 70, r: -10 },
        { x: 120, r: 7 },
      ].map((c, i) => (
        <g key={i} transform={`rotate(${c.r} ${c.x + 34} 100)`} filter={id.url('shadow')}>
          <rect x={c.x} y="40" width="68" height="100" rx="6" fill={id.url('back')} stroke={id.url('gold')} strokeWidth="3" />
          <rect x={c.x + 7} y="47" width="54" height="86" rx="3" fill="none" stroke={id.url('gold')} strokeWidth="1" opacity="0.7" />
          <g transform={`translate(${c.x + 34} 90)`} fill={id.url('gold')}>
            <path d="M-16 6 L-12 -10 L-5 -1 L0 -14 L5 -1 L12 -10 L16 6 Z" />
            <rect x="-16" y="7" width="32" height="5" rx="1" />
          </g>
        </g>
      ))}
      {/* Coin stack + loose coins */}
      <g transform="translate(232 128)" filter={id.url('shadow')}>
        {coins.map((i) => (
          <g key={i} transform={`translate(0 ${-i * 8})`}>
            <ellipse cx="0" cy="6" rx="26" ry="9" fill={id.url('coinEdge')} />
            <ellipse cx="0" cy="0" rx="26" ry="9" fill={id.url('gold')} />
            <ellipse cx="0" cy="0" rx="18" ry="6" fill="none" stroke="#8a5f17" strokeWidth="1" opacity="0.6" />
          </g>
        ))}
        <ellipse cx="44" cy="22" rx="18" ry="6.5" fill={id.url('gold')} />
        <ellipse cx="-38" cy="26" rx="18" ry="6.5" fill={id.url('gold')} />
      </g>
      <rect x="196" y="56" width="10" height="64" fill="#fff" opacity="0.08" className={styles.sheen} />
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Codenames — spy's desk: index cards, agent cover, magnifier.
// ---------------------------------------------------------------------------

function CodenamesTile() {
  const id = useSvgIds();
  const words = [
    { w: 'MOON', x: 34, y: 34, r: -6 },
    { w: 'SPY', x: 128, y: 24, r: 4 },
    { w: 'TORCH', x: 222, y: 34, r: -3 },
    { w: 'GLASS', x: 46, y: 104, r: 5 },
    { w: 'CROWN', x: 214, y: 108, r: 6 },
  ];
  return (
    <Scene
      ids={id}
      bg={['#3b2a1c', '#150e08', '#4a3523']}
      defs={
        <>
          <pattern id={id('wood')} width="320" height="12" patternUnits="userSpaceOnUse">
            <path d="M0 6 Q80 2 160 7 T320 5" stroke="#000" strokeOpacity="0.18" fill="none" />
          </pattern>
          <linearGradient id={id('card')} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f3e7c9" />
            <stop offset="1" stopColor="#d9c79e" />
          </linearGradient>
          <linearGradient id={id('red')} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#d24a3c" />
            <stop offset="1" stopColor="#8a2219" />
          </linearGradient>
          <radialGradient id={id('lens')} cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#e9f3ff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#9fc3e8" stopOpacity="0.12" />
          </radialGradient>
        </>
      }
    >
      <rect width="320" height="180" fill={id.url('wood')} />
      {words.map((c) => (
        <g key={c.w} transform={`rotate(${c.r} ${c.x + 32} ${c.y + 20})`} filter={id.url('shadow')}>
          <rect x={c.x} y={c.y} width="66" height="40" rx="3" fill={id.url('card')} />
          <rect x={c.x + 4} y={c.y + 22} width="58" height="13" fill="#efe3c3" stroke="#bda57a" strokeWidth="0.6" />
          <text x={c.x + 33} y={c.y + 32} textAnchor="middle" fontSize="9" fill="#2a1f14" style={{ fontFamily: 'var(--font-dossier)' }}>
            {c.w}
          </text>
        </g>
      ))}
      {/* Red agent cover card */}
      <g transform="rotate(-4 160 112)" filter={id.url('shadow')}>
        <rect x="126" y="84" width="68" height="44" rx="3" fill={id.url('red')} />
        <circle cx="160" cy="100" r="7" fill="#2a0b08" />
        <path d="M146 96 h28 l-4 -6 h-20 Z" fill="#2a0b08" />
        <path d="M146 126 q14 -20 28 0 Z" fill="#2a0b08" />
      </g>
      {/* Magnifier */}
      <g transform="translate(262 148) rotate(-35)" filter={id.url('shadow')}>
        <rect x="-4" y="16" width="8" height="34" rx="3" fill="#2a1a10" />
        <circle cx="0" cy="0" r="20" fill={id.url('lens')} stroke="#c9a14a" strokeWidth="4" />
      </g>
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Cross Clues — graph-paper notebook, header words, sticky notes.
// ---------------------------------------------------------------------------

function CrossCluesTile() {
  const id = useSvgIds();
  const cols = ['A', 'B', 'C', 'D'];
  return (
    <Scene
      ids={id}
      bg={['#1f4a4a', '#0d2424', '#2a6060']}
      vignette={0.6}
      defs={
        <>
          <pattern id={id('grid')} width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0 H0 V10" fill="none" stroke="#7fb7d8" strokeOpacity="0.45" strokeWidth="0.6" />
          </pattern>
        </>
      }
    >
      <g transform="rotate(-3 160 92)" filter={id.url('shadow')}>
        <rect x="40" y="16" width="240" height="152" rx="6" fill="#f7f4ea" />
        <rect x="40" y="16" width="240" height="152" rx="6" fill={id.url('grid')} />
        <line x1="62" y1="16" x2="62" y2="168" stroke="#e98a8a" strokeWidth="1.2" />
        {cols.map((c, i) => (
          <text key={c} x={104 + i * 44} y="40" textAnchor="middle" fontSize="16" fill="#27527a" style={{ fontFamily: 'var(--font-folk)' }}>
            {c}
          </text>
        ))}
        {[1, 2, 3].map((n, i) => (
          <text key={n} x="76" y={74 + i * 36} textAnchor="middle" fontSize="16" fill="#27527a" style={{ fontFamily: 'var(--font-folk)' }}>
            {n}
          </text>
        ))}
        {/* placed notes */}
        <rect x="86" y="54" width="36" height="30" fill="#ffe27a" transform="rotate(-4 104 69)" />
        <rect x="174" y="90" width="36" height="30" fill="#9be7b0" transform="rotate(5 192 105)" />
        <path d="M92 70 l6 6 12 -14" stroke="#2f7a3f" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
      {/* Floating coordinate card */}
      <g className={styles.float} filter={id.url('shadow')}>
        <rect x="226" y="98" width="52" height="52" rx="4" fill="#ff9f6b" transform="rotate(10 252 124)" />
        <text x="252" y="131" textAnchor="middle" fontSize="20" fill="#5a2410" transform="rotate(10 252 124)" style={{ fontFamily: 'var(--font-folk)' }}>
          C2
        </text>
      </g>
      {/* Pencil */}
      <g transform="translate(34 150) rotate(-22)">
        <rect x="0" y="-4" width="88" height="8" fill="#f2b632" />
        <path d="M88 -4 L100 0 L88 4 Z" fill="#e8c9a0" />
        <path d="M96 -1.4 L100 0 L96 1.4 Z" fill="#333" />
        <rect x="-8" y="-4" width="8" height="8" fill="#e98a8a" />
      </g>
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Love Letter — sealed letter, wax heart, rose, candlelight.
// ---------------------------------------------------------------------------

function LoveLetterTile() {
  const id = useSvgIds();
  return (
    <Scene
      ids={id}
      bg={['#4a0d1e', '#16040a', '#6b1430']}
      defs={
        <>
          <linearGradient id={id('paper')} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fbf3e2" />
            <stop offset="1" stopColor="#e3d2b0" />
          </linearGradient>
          <radialGradient id={id('wax')} cx="38%" cy="35%" r="70%">
            <stop offset="0" stopColor="#f0605a" />
            <stop offset="1" stopColor="#7d0f15" />
          </radialGradient>
          <radialGradient id={id('candle')} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffd38a" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffd38a" stopOpacity="0" />
          </radialGradient>
        </>
      }
    >
      <circle cx="268" cy="54" r="70" fill={id.url('candle')} className={styles.flicker} />
      <g transform="translate(262 60)">
        <rect x="-7" y="10" width="14" height="70" rx="2" fill="#f4ead2" />
        <path d="M0 -8 C6 0 5 8 0 10 C-5 8 -6 0 0 -8 Z" fill="#ffcf6b" className={styles.flicker} />
      </g>
      {/* Envelope */}
      <g transform="rotate(-6 140 100)" filter={id.url('shadow')}>
        <rect x="52" y="50" width="176" height="104" rx="4" fill={id.url('paper')} />
        <path d="M52 50 L140 112 L228 50" fill="none" stroke="#c9b48a" strokeWidth="1.5" />
        <path d="M52 154 L118 100 M228 154 L162 100" stroke="#d8c59c" strokeWidth="1" />
        <circle cx="140" cy="110" r="17" fill={id.url('wax')} />
        <path d="M140 120 c-9 -6 -12 -11 -9 -15 c2 -3 7 -3 9 1 c2 -4 7 -4 9 -1 c3 4 0 9 -9 15 Z" fill="#5c0a10" opacity="0.7" />
      </g>
      {/* Rose */}
      <g transform="translate(70 150) rotate(-28)">
        <path d="M0 0 C30 -2 60 2 90 0" stroke="#2f5a2a" strokeWidth="3" fill="none" />
        <path d="M40 0 q8 -12 20 -8 q-8 4 -20 8 Z" fill="#3e7a36" />
        <circle cx="0" cy="0" r="11" fill="#b3122a" />
        <path d="M-6 -3 q6 -8 12 0 q-6 5 -12 0 Z M-8 3 q8 6 16 0" fill="none" stroke="#6e0817" strokeWidth="1.4" />
      </g>
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Skull — bar table with rose / skull / face-down coasters.
// ---------------------------------------------------------------------------

function SkullTile() {
  const id = useSvgIds();
  return (
    <Scene
      ids={id}
      bg={['#2a1a0f', '#0c0704', '#3d2716']}
      defs={
        <>
          <pattern id={id('wood')} width="320" height="16" patternUnits="userSpaceOnUse">
            <path d="M0 8 Q90 3 170 9 T320 6" stroke="#000" strokeOpacity="0.25" fill="none" />
          </pattern>
          <radialGradient id={id('disk')} cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#5a3a24" />
            <stop offset="1" stopColor="#24150b" />
          </radialGradient>
          <radialGradient id={id('lamp')} cx="50%" cy="30%" r="60%">
            <stop offset="0" stopColor="#ffbf6b" stopOpacity="0.32" />
            <stop offset="1" stopColor="#ffbf6b" stopOpacity="0" />
          </radialGradient>
        </>
      }
    >
      <rect width="320" height="180" fill={id.url('wood')} />
      <rect width="320" height="180" fill={id.url('lamp')} className={styles.flicker} />
      {[
        { x: 82, y: 98, face: 'rose' as const },
        { x: 160, y: 84, face: 'skull' as const },
        { x: 238, y: 100, face: 'back' as const },
      ].map((d) => (
        <g key={d.x} transform={`translate(${d.x} ${d.y})`} filter={id.url('shadow')}>
          <ellipse cx="0" cy="8" rx="40" ry="14" fill="#120a05" opacity="0.6" />
          <circle r="36" fill={id.url('disk')} stroke="#c49a5a" strokeWidth="3" />
          <circle r="29" fill="none" stroke="#c49a5a" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
          {d.face === 'rose' && (
            <g>
              <circle r="11" fill="#b3122a" />
              <path d="M-6 -3 q6 -8 12 0 q-6 5 -12 0 Z M-8 3 q8 7 16 0" fill="none" stroke="#5c0a10" strokeWidth="1.6" />
              <path d="M-2 11 q-10 6 -16 2 M2 11 q10 6 16 2" stroke="#3e7a36" strokeWidth="3" fill="none" />
            </g>
          )}
          {d.face === 'skull' && (
            <g fill="#efe6d2">
              <path d="M0 -17 c11 0 17 7 17 15 c0 6 -3 9 -6 11 v6 h-22 v-6 c-3 -2 -6 -5 -6 -11 c0 -8 6 -15 17 -15 Z" />
              <circle cx="-6" cy="-1" r="4.5" fill="#24150b" />
              <circle cx="6" cy="-1" r="4.5" fill="#24150b" />
              <path d="M-2 6 l2 -4 2 4 Z" fill="#24150b" />
              <path d="M-7 15 v-4 M-2 15 v-4 M3 15 v-4 M8 15 v-4" stroke="#24150b" strokeWidth="1.2" />
            </g>
          )}
          {d.face === 'back' && (
            <g stroke="#c49a5a" fill="none" strokeWidth="1.6" opacity="0.85">
              <path d="M-14 0 L0 -14 L14 0 L0 14 Z" />
              <path d="M-7 0 L0 -7 L7 0 L0 7 Z" />
            </g>
          )}
        </g>
      ))}
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Liar's Dice — tipped leather cup, ivory dice, tavern candle.
// ---------------------------------------------------------------------------

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function Die({ x, y, r, face, fill }: { x: number; y: number; r: number; face: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x="-13" y="-13" width="26" height="26" rx="5" fill={fill} stroke="#b8a582" strokeWidth="1" />
      {PIPS[face]!.map(([px, py], i) => (
        <circle key={i} cx={px * 7} cy={py * 7} r="2.4" fill={face === 1 ? '#a3151f' : '#2a1d12'} />
      ))}
    </g>
  );
}

function LiarsDiceTile() {
  const id = useSvgIds();
  return (
    <Scene
      ids={id}
      bg={['#3a2412', '#120a05', '#4f321a']}
      defs={
        <>
          <pattern id={id('wood')} width="320" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 7 Q80 3 160 8 T320 6" stroke="#000" strokeOpacity="0.22" fill="none" />
          </pattern>
          <linearGradient id={id('ivory')} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#fffaf0" />
            <stop offset="1" stopColor="#d9ccb0" />
          </linearGradient>
          <linearGradient id={id('leather')} x1="0" x2="1">
            <stop offset="0" stopColor="#3a1f0f" />
            <stop offset="0.45" stopColor="#7a4523" />
            <stop offset="1" stopColor="#2c170b" />
          </linearGradient>
          <radialGradient id={id('candle')} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.45" />
            <stop offset="1" stopColor="#ffcf7a" stopOpacity="0" />
          </radialGradient>
        </>
      }
    >
      <rect width="320" height="180" fill={id.url('wood')} />
      <circle cx="40" cy="40" r="80" fill={id.url('candle')} className={styles.flicker} />
      {/* Tipped cup */}
      <g transform="translate(96 96) rotate(-70)" filter={id.url('shadow')}>
        <path d="M-30 -40 L30 -40 L22 40 L-22 40 Z" fill={id.url('leather')} />
        <ellipse cx="0" cy="-40" rx="30" ry="9" fill="#1e0f06" />
        <path d="M-26 -10 H26 M-24 14 H24" stroke="#c9a14a" strokeWidth="2" opacity="0.6" />
      </g>
      <g filter={id.url('shadow')}>
        <Die x={170} y={110} r={-12} face={5} fill={id.url('ivory')} />
        <Die x={206} y={92} r={18} face={1} fill={id.url('ivory')} />
        <Die x={236} y={126} r={-6} face={3} fill={id.url('ivory')} />
        <Die x={196} y={142} r={34} face={6} fill={id.url('ivory')} />
        <g className={styles.tumble}>
          <Die x={272} y={96} r={8} face={2} fill={id.url('ivory')} />
        </g>
      </g>
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Liar's Poker — green felt, fanned cards, chips.
// ---------------------------------------------------------------------------

function PlayingCard({ x, rank, suit, rot }: { x: number; rank: string; suit: '♠' | '♥' | '♦' | '♣'; rot: number }) {
  const red = suit === '♥' || suit === '♦';
  const ink = red ? '#b3122a' : '#141414';
  return (
    <g transform={`rotate(${rot} 160 190)`}>
      <rect x={x} y="40" width="62" height="88" rx="5" fill="#fbfaf6" stroke="#cfc8b8" />
      <text x={x + 7} y="56" fontSize="13" fontWeight="700" fill={ink} style={{ fontFamily: 'var(--font-romance)' }}>
        {rank}
      </text>
      <text x={x + 7} y="68" fontSize="11" fill={ink}>
        {suit}
      </text>
      <text x={x + 31} y="100" textAnchor="middle" fontSize="30" fill={ink}>
        {suit}
      </text>
    </g>
  );
}

function LiarsPokerTile() {
  const id = useSvgIds();
  return (
    <Scene
      ids={id}
      bg={['#11603a', '#05200f', '#0d4a2b']}
      defs={
        <>
          <radialGradient id={id('lamp')} cx="50%" cy="20%" r="70%">
            <stop offset="0" stopColor="#fff2c4" stopOpacity="0.22" />
            <stop offset="1" stopColor="#fff2c4" stopOpacity="0" />
          </radialGradient>
        </>
      }
    >
      <rect width="320" height="180" fill={id.url('lamp')} />
      <g filter={id.url('shadow')}>
        <PlayingCard x={78} rank="A" suit="♠" rot={-22} />
        <PlayingCard x={112} rank="K" suit="♥" rot={-8} />
        <PlayingCard x={146} rank="Q" suit="♦" rot={6} />
        <PlayingCard x={180} rank="J" suit="♣" rot={20} />
      </g>
      {/* Chips */}
      <g transform="translate(262 142)" filter={id.url('shadow')}>
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(0 ${-i * 6})`}>
            <ellipse cx="0" cy="4" rx="20" ry="7" fill="#7a0f1b" />
            <ellipse cx="0" cy="0" rx="20" ry="7" fill="#c8202f" />
            <ellipse cx="0" cy="0" rx="20" ry="7" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="5 5" />
          </g>
        ))}
        <g transform="translate(-40 14)">
          <ellipse cx="0" cy="4" rx="20" ry="7" fill="#0b2a5a" />
          <ellipse cx="0" cy="0" rx="20" ry="7" fill="#1f5fbf" />
          <ellipse cx="0" cy="0" rx="20" ry="7" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="5 5" />
        </g>
      </g>
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Cockroach Poker — comic critter cards with a sneaky cockroach.
// ---------------------------------------------------------------------------

function CockroachPokerTile() {
  const id = useSvgIds();
  return (
    <Scene
      ids={id}
      bg={['#e0a63a', '#5a2e0c', '#b06a1e']}
      vignette={0.6}
      defs={
        <>
          <radialGradient id={id('shell')} cx="40%" cy="30%" r="70%">
            <stop offset="0" stopColor="#a8622a" />
            <stop offset="1" stopColor="#3d1d08" />
          </radialGradient>
          <linearGradient id={id('card')} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff5d8" />
            <stop offset="1" stopColor="#f0d79a" />
          </linearGradient>
        </>
      }
    >
      {/* Fanned critter cards */}
      {[
        { r: -24, c: '#7b4aa8', label: 'BAT' },
        { r: -8, c: '#3f8a3c', label: 'TOAD' },
        { r: 8, c: '#c2412d', label: 'SCORPION' },
      ].map((k, i) => (
        <g key={i} transform={`rotate(${k.r} 110 200)`} filter={id.url('shadow')}>
          <rect x="80" y="36" width="60" height="86" rx="6" fill={id.url('card')} stroke="#5a2e0c" strokeWidth="2" />
          <rect x="86" y="42" width="48" height="58" rx="4" fill={k.c} />
          <text x="110" y="114" textAnchor="middle" fontSize="8" fontWeight="700" fill="#5a2e0c" style={{ fontFamily: 'var(--font-rogue)' }}>
            {k.label}
          </text>
        </g>
      ))}
      {/* The cockroach */}
      <g transform="translate(222 98) rotate(-18)" filter={id.url('shadow')}>
        <g className={styles.scuttle}>
        <g stroke="#2a1405" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M-16 -8 l-16 -10 M-18 4 l-20 0 M-14 14 l-16 12 M16 -8 l16 -10 M18 4 l20 0 M14 14 l16 12" />
          <path d="M-6 -30 q-14 -22 -30 -26 M6 -30 q14 -22 30 -26" strokeWidth="2" />
        </g>
        <ellipse cx="0" cy="4" rx="22" ry="32" fill={id.url('shell')} />
        <path d="M0 -24 V36" stroke="#2a1405" strokeWidth="1.5" />
        <ellipse cx="0" cy="-26" rx="12" ry="9" fill="#3d1d08" />
        <circle cx="-5" cy="-28" r="3.5" fill="#fff" />
        <circle cx="5" cy="-28" r="3.5" fill="#fff" />
        <circle cx="-4" cy="-28" r="1.6" fill="#111" />
        <circle cx="6" cy="-28" r="1.6" fill="#111" />
        <path d="M-10 -6 q10 -6 20 0" stroke="#e8b06a" strokeWidth="2" fill="none" opacity="0.6" />
        </g>
      </g>
      <text x="252" y="40" textAnchor="middle" fontSize="18" fill="#3d1d08" style={{ fontFamily: 'var(--font-rogue)' }} transform="rotate(8 252 40)">
        “It’s a fly!”
      </text>
    </Scene>
  );
}
