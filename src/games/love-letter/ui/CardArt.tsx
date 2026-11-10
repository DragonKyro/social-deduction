import type { ReactNode } from 'react';
import { useSvgIds } from '@/ui/shared/svg';
import type { Rank } from '../state';
import { RANK_COUNTS, RANK_NAMES } from '../state';

// ============================================================================
// Love Letter card art — Renaissance court romance.
//
// Cream card stock, a gilded double border, an arched portrait window with a
// per-rank illustrated bust, an ornate numeral medallion and a ribbon name
// banner. The card back is a sealed letter with a red wax seal. All inline
// SVG; every <defs> id comes from useSvgIds so instances never collide.
//
// Presentation only — callers decide which rank a viewer may see.
// ============================================================================

export const CARD_VB_W = 126;
export const CARD_VB_H = 176;

type Ids = ReturnType<typeof useSvgIds>;

interface RankLook {
  bg: [string, string];
  robe: [string, string];
  lines: [string, string];
}

const LOOK: Record<Rank, RankLook> = {
  1: { bg: ['#5d7189', '#1c2733'], robe: ['#aab6c4', '#4a5866'], lines: ['Name a non-Guard card.', 'If they hold it, they are out.'] },
  2: { bg: ['#6e4a86', '#1f1029'], robe: ['#4b2a5e', '#1e0f27'], lines: ['Look at another', "player's hand in secret."] },
  3: { bg: ['#4f7a4e', '#14261a'], robe: ['#2f5a34', '#13261a'], lines: ['Compare hands in secret;', 'the lower card is out.'] },
  4: { bg: ['#4e8790', '#132b30'], robe: ['#3b7b82', '#173a3f'], lines: ['You are protected', 'until your next turn.'] },
  5: { bg: ['#4865a6', '#111d3d'], robe: ['#2f4f9a', '#122251'], lines: ['A player discards', 'their hand and redraws.'] },
  6: { bg: ['#9a3a34', '#3a0b0f'], robe: ['#9b1f2a', '#4a0a12'], lines: ['Trade hands with', 'another player.'] },
  7: { bg: ['#8c3c72', '#2f0c22'], robe: ['#6e2153', '#2f0a23'], lines: ['Must be played if you hold', 'the King or a Prince.'] },
  8: { bg: ['#c66a8a', '#4d1129'], robe: ['#e08aa6', '#9c3c62'], lines: ['If you discard her,', 'you are out of the round.'] },
};

export function cardEffectText(rank: Rank): string {
  return LOOK[rank].lines.join(' ');
}

const FONT = { fontFamily: 'var(--font-romance)' } as const;

// ---------------------------------------------------------------------------
// Shared bust pieces (portrait window spans x 14..112, y 14..112)
// ---------------------------------------------------------------------------

const TORSO = 'M20 113 C22 97 35 87 52 84 L74 84 C91 87 104 97 106 113 Z';

function Head({ ids, skin = '#f1c9a5', female = false, beardless = true }: { ids: Ids; skin?: string; female?: boolean; beardless?: boolean }) {
  return (
    <g>
      <radialGradient id={ids('skin')} cx="40%" cy="35%" r="70%">
        <stop offset="0" stopColor={skin} />
        <stop offset="1" stopColor="#b97d58" />
      </radialGradient>
      <path d="M57 66 L57 85 Q63 89 69 85 L69 66 Z" fill="#c58c66" />
      <ellipse cx="51" cy="57" rx="2.2" ry="3.4" fill="#d69b75" />
      <ellipse cx="75" cy="57" rx="2.2" ry="3.4" fill="#d69b75" />
      <ellipse cx="63" cy="55" rx="12" ry="14.5" fill={ids.url('skin')} />
      {/* eyes */}
      <ellipse cx="58.6" cy="55" rx="1.5" ry={female ? 1.2 : 1} fill="#2a1a12" />
      <ellipse cx="67.4" cy="55" rx="1.5" ry={female ? 1.2 : 1} fill="#2a1a12" />
      <circle cx="59" cy="54.6" r="0.4" fill="#fff" />
      <circle cx="67.8" cy="54.6" r="0.4" fill="#fff" />
      {female ? (
        <>
          <path d="M56.4 53.4 q2.2 -1.6 4.4 0 M65.2 53.4 q2.2 -1.6 4.4 0" stroke="#3a2416" strokeWidth="0.7" fill="none" />
          <circle cx="56.5" cy="60" r="2.4" fill="#e7798a" opacity="0.35" />
          <circle cx="69.5" cy="60" r="2.4" fill="#e7798a" opacity="0.35" />
          <path d="M60.3 63.4 q2.7 -1 5.4 0 q-2.7 2.6 -5.4 0 Z" fill="#b8374d" />
        </>
      ) : (
        <>
          <path d="M56 52.6 q2.6 -1.3 5 -0.2 M65 52.4 q2.6 -1.1 5 0.2" stroke="#3a2416" strokeWidth="1" fill="none" />
          {beardless && <path d="M60.4 64 q2.6 1.4 5.2 0" stroke="#8a3b3b" strokeWidth="0.9" fill="none" />}
        </>
      )}
      <path d="M63 56 q-1.6 3.6 -0.4 5.2 q1 0.4 1.8 -0.1" stroke="#a5694a" strokeWidth="0.7" fill="none" />
    </g>
  );
}

function Torso({ ids, colors }: { ids: Ids; colors: [string, string] }) {
  return (
    <g>
      <linearGradient id={ids('robe')} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stopColor={colors[0]} />
        <stop offset="1" stopColor={colors[1]} />
      </linearGradient>
      <path d={TORSO} fill={ids.url('robe')} />
    </g>
  );
}

function GoldDefs({ ids }: { ids: Ids }) {
  return (
    <linearGradient id={ids('gold')} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#8a6420" />
      <stop offset="0.35" stopColor="#f3d27a" />
      <stop offset="0.6" stopColor="#c9963c" />
      <stop offset="1" stopColor="#f6dd8f" />
    </linearGradient>
  );
}

// ---------------------------------------------------------------------------
// Portraits
// ---------------------------------------------------------------------------

function GuardPortrait({ ids }: { ids: Ids }) {
  return (
    <g>
      {/* castle stonework */}
      <g stroke="#0d141c" strokeOpacity="0.35" strokeWidth="0.8" fill="none">
        <path d="M14 40 H112 M14 60 H112 M14 80 H112 M40 20 V40 M86 20 V40 M27 40 V60 M63 40 V60 M99 40 V60 M40 60 V80 M86 60 V80" />
      </g>
      {/* halberd */}
      <rect x="95" y="16" width="2.6" height="98" fill="#6b4a2a" />
      <path d="M96.3 16 L92 24 L96.3 22 L100.6 24 Z" fill="#c9d2dc" />
      <path d="M97.6 26 C106 27 109 33 108 40 C104 36 101 35 97.6 36 Z" fill="#b8c3cf" stroke="#4a5866" strokeWidth="0.6" />
      <path d="M95 28 L89 33 L95 34 Z" fill="#9aa7b5" />
      <Torso ids={ids} colors={LOOK[1].robe} />
      {/* breastplate ridge, rivets, pauldrons */}
      <path d="M63 86 L63 113" stroke="#e7edf3" strokeWidth="1.2" opacity="0.7" />
      <ellipse cx="34" cy="96" rx="12" ry="8" fill="#8d9aa8" stroke="#3b4652" strokeWidth="0.7" />
      <ellipse cx="92" cy="96" rx="12" ry="8" fill="#8d9aa8" stroke="#3b4652" strokeWidth="0.7" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx={30 + i * 4} cy={96} r="0.9" fill="#e7edf3" />
          <circle cx={88 + i * 4} cy={96} r="0.9" fill="#e7edf3" />
        </g>
      ))}
      <path d="M48 85 Q63 92 78 85" stroke="#5a2a1a" strokeWidth="3" fill="none" />
      <Head ids={ids} beardless={false} />
      {/* mustache */}
      <path d="M57 63.2 q3 -2.4 6 -0.6 q3 -1.8 6 0.6 q-3 1.6 -6 0.4 q-3 1.2 -6 -0.4 Z" fill="#5a3a22" />
      {/* morion helmet + plume */}
      <linearGradient id={ids('steel')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#eef2f6" />
        <stop offset="1" stopColor="#6f7d8c" />
      </linearGradient>
      <path d="M48.5 49 C48 33 78 33 77.5 49 Z" fill={ids.url('steel')} stroke="#3b4652" strokeWidth="0.7" />
      <path d="M41 50 Q63 42 85 50 Q63 54 41 50 Z" fill={ids.url('steel')} stroke="#3b4652" strokeWidth="0.7" />
      <path d="M63 33.6 C63 30 63 30 63 33.6 M55 38 Q63 28 71 38" stroke="#3b4652" strokeWidth="1" fill="none" />
      <path d="M64 34 C70 22 82 20 88 26 C80 25 74 28 70 36 Z" fill="#b3122a" />
      <path d="M66 33 C72 25 80 23 84 26" stroke="#ff6b7d" strokeWidth="0.6" fill="none" />
    </g>
  );
}

function PriestPortrait({ ids }: { ids: Ids }) {
  return (
    <g>
      {/* stained-glass rays */}
      <g opacity="0.5">
        {[-50, -25, 0, 25, 50].map((a) => (
          <path key={a} d="M63 18 L56 112 L70 112 Z" fill="#f5d27a" opacity="0.18" transform={`rotate(${a} 63 18)`} />
        ))}
      </g>
      <circle cx="63" cy="44" r="22" fill="#f3d27a" opacity="0.18" />
      {/* hood behind */}
      <path d="M44 66 C40 34 86 34 82 66 L80 86 L46 86 Z" fill="#2e1739" />
      <Torso ids={ids} colors={LOOK[2].robe} />
      {/* stole */}
      <path d="M54 84 L50 113 L57 113 L59 86 Z M72 84 L76 113 L69 113 L67 86 Z" fill={ids.url('gold')} />
      <Head ids={ids} />
      {/* hood front */}
      <path d="M47 64 C44 36 82 36 79 64 C77 46 49 46 47 64 Z" fill="#4b2a5e" stroke="#1e0f27" strokeWidth="0.6" />
      {/* tonsure fringe */}
      <path d="M52 47 Q63 42 74 47 Q63 45.5 52 47 Z" fill="#6b4a32" />
      {/* pendant cross */}
      <path d="M63 88 L63 100 M59 92 H67" stroke={ids.url('gold')} strokeWidth="2.2" />
      {/* book */}
      <g transform="rotate(-8 40 104)">
        <rect x="28" y="98" width="22" height="15" rx="1.5" fill="#5a1620" stroke={ids.url('gold')} strokeWidth="1" />
        <path d="M39 98 V113" stroke={ids.url('gold')} strokeWidth="0.8" />
      </g>
    </g>
  );
}

function BaronPortrait({ ids }: { ids: Ids }) {
  return (
    <g>
      {/* drapery */}
      <path d="M14 14 C26 40 22 80 30 112 L14 112 Z" fill="#1b3b20" opacity="0.8" />
      <path d="M112 14 C100 40 104 80 96 112 L112 112 Z" fill="#1b3b20" opacity="0.8" />
      <path d="M18 14 C30 42 26 80 33 112" stroke="#d4a64a" strokeWidth="0.6" fill="none" opacity="0.6" />
      <path d="M108 14 C96 42 100 80 93 112" stroke="#d4a64a" strokeWidth="0.6" fill="none" opacity="0.6" />
      <Torso ids={ids} colors={LOOK[3].robe} />
      {/* doublet buttons */}
      {[92, 98, 104, 110].map((y) => (
        <circle key={y} cx="63" cy={y} r="1.3" fill={ids.url('gold')} />
      ))}
      {/* chain of office */}
      <path d="M42 88 Q63 106 84 88" stroke={ids.url('gold')} strokeWidth="2.4" strokeDasharray="2.4 1.2" fill="none" />
      <circle cx="63" cy="99" r="3.6" fill={ids.url('gold')} stroke="#6b4a1a" strokeWidth="0.5" />
      <Head ids={ids} beardless={false} />
      {/* ruff */}
      <path
        d="M47 80 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0 q2 4 -16 6 q-18 -2 -16 -6 Z"
        fill="#f7f1e3"
        stroke="#bfb39a"
        strokeWidth="0.5"
      />
      {/* curled mustache + goatee */}
      <path d="M56.6 63 q-3 -0.6 -4 -3 q2 2 4 1.4 q3 -2.4 6.4 -0.6 q3.4 -1.8 6.4 0.6 q2 0.6 4 -1.4 q-1 2.4 -4 3 q-3 1.4 -6.4 -0.4 q-3.4 1.8 -6.4 0.4 Z" fill="#2a1a10" />
      <path d="M61 66.5 Q63 73 65 66.5 Z" fill="#2a1a10" />
      {/* slick hair + cap with feather */}
      <path d="M51 52 C50 40 76 40 75 52 C72 45 54 45 51 52 Z" fill="#2a1a10" />
      <path d="M46 44 Q63 33 80 44 Q63 47 46 44 Z" fill="#1f2a1f" stroke="#d4a64a" strokeWidth="0.6" />
      <path d="M76 42 C84 30 94 28 98 22 C96 32 88 38 78 44 Z" fill="#f7f1e3" />
      <path d="M77 42 C85 33 92 29 97 24" stroke="#bfb39a" strokeWidth="0.4" fill="none" />
    </g>
  );
}

function HandmaidPortrait({ ids }: { ids: Ids }) {
  return (
    <g>
      {/* leaded window */}
      <g stroke="#a7d4d9" strokeOpacity="0.35" strokeWidth="0.7">
        {[-40, -20, 0, 20, 40, 60, 80].map((o) => (
          <path key={o} d={`M${14 + o} 14 L${54 + o} 70`} />
        ))}
        {[-40, -20, 0, 20, 40, 60, 80].map((o) => (
          <path key={`b${o}`} d={`M${112 - o} 14 L${72 - o} 70`} />
        ))}
      </g>
      <circle cx="63" cy="40" r="24" fill="#d6f1f2" opacity="0.18" />
      {/* hair bun behind */}
      <circle cx="63" cy="40" r="10" fill="#7a4a2a" />
      <Torso ids={ids} colors={LOOK[4].robe} />
      {/* white collar / apron */}
      <path d="M44 86 Q63 100 82 86 L78 84 Q63 94 48 84 Z" fill="#f7f1e3" />
      <path d="M52 94 L50 113 L76 113 L74 94 Q63 99 52 94 Z" fill="#f2ead8" opacity="0.95" />
      <Head ids={ids} female />
      <path d="M51 54 C50 40 76 40 75 54 C73 47 66 46 63 46 C58 46 53 48 51 54 Z" fill="#8a5632" />
      {/* coif */}
      <path d="M47 58 C45 36 81 36 79 58 C77 42 49 42 47 58 Z" fill="#fbf6ea" stroke="#cfc3a6" strokeWidth="0.6" />
      {/* sealed letter in hands */}
      <g transform="rotate(-6 63 104)">
        <rect x="50" y="98" width="26" height="16" rx="1" fill="#efe2c4" stroke="#b49a6a" strokeWidth="0.6" />
        <path d="M50 98 L63 107 L76 98" fill="none" stroke="#b49a6a" strokeWidth="0.6" />
        <circle cx="63" cy="107" r="3" fill="#a3121f" />
      </g>
      <ellipse cx="49" cy="104" rx="4" ry="3" fill="#f1c9a5" />
      <ellipse cx="77" cy="104" rx="4" ry="3" fill="#f1c9a5" />
    </g>
  );
}

function PrincePortrait({ ids }: { ids: Ids }) {
  return (
    <g>
      {/* banners */}
      <path d="M22 14 V52 L28 46 L34 52 V14 Z" fill="#c9a43c" opacity="0.5" />
      <path d="M92 14 V52 L98 46 L104 52 V14 Z" fill="#c9a43c" opacity="0.5" />
      {/* cape */}
      <path d="M24 113 C26 92 40 84 52 82 L36 113 Z" fill="#7a1424" />
      <Torso ids={ids} colors={LOOK[5].robe} />
      <path d="M52 84 L63 98 L74 84" stroke={ids.url('gold')} strokeWidth="1.6" fill="none" />
      <path d="M40 113 L46 92 M86 113 L80 92" stroke={ids.url('gold')} strokeWidth="1.1" />
      <Head ids={ids} />
      {/* wavy hair */}
      <path d="M50 56 C46 36 80 34 77 56 C76 50 74 47 72 46 C69 50 60 50 56 46 C53 48 51 51 50 56 Z" fill="#6b3a1c" />
      <path d="M50 56 C48 60 49 64 51 66 C50 62 51 59 52 57 Z M76 56 C78 60 77 64 75 66 C76 62 75 59 74 57 Z" fill="#6b3a1c" />
      {/* circlet */}
      <path d="M50 46 Q63 40 76 46 L75 43 L70 44 L67 39 L63 42.5 L59 39 L56 44 L51 43 Z" fill={ids.url('gold')} stroke="#6b4a1a" strokeWidth="0.4" />
      <circle cx="63" cy="43.4" r="1.2" fill="#3f7fd6" />
      {/* a rose for the princess */}
      <path d="M84 112 C85 104 86 98 88 92" stroke="#2f6b2a" strokeWidth="1.4" fill="none" />
      <path d="M86 102 q-5 -2 -6 -6 q5 1 6 6 Z" fill="#3e7a36" />
      <circle cx="88.5" cy="90" r="4" fill="#b3122a" />
      <path d="M86 89.5 q2.5 -2.5 5 0 q-2.5 2 -5 0 Z" fill="#7a0a16" />
      <ellipse cx="86" cy="104" rx="4" ry="3" fill="#f1c9a5" />
    </g>
  );
}

function KingPortrait({ ids }: { ids: Ids }) {
  return (
    <g>
      {/* throne back */}
      <path d="M26 112 V34 Q26 20 40 20 H86 Q100 20 100 34 V112 Z" fill="#5a1418" stroke={ids.url('gold')} strokeWidth="1.4" />
      <path d="M32 112 V36 Q32 26 42 26 H84 Q94 26 94 36 V112" fill="none" stroke={ids.url('gold')} strokeWidth="0.5" opacity="0.7" />
      <Torso ids={ids} colors={LOOK[6].robe} />
      {/* ermine collar */}
      <path d="M36 92 C40 82 52 80 63 88 C74 80 86 82 90 92 C80 98 70 96 63 92 C56 96 46 98 36 92 Z" fill="#f7f3ea" />
      {[42, 50, 58, 68, 76, 84].map((x, i) => (
        <path key={x} d={`M${x} ${90 + (i % 2)} l0.8 2.4 l-1.6 0 Z`} fill="#141414" />
      ))}
      <Head ids={ids} skin="#efc29d" beardless={false} />
      {/* full beard */}
      <path d="M50 58 C50 72 56 82 63 82 C70 82 76 72 76 58 C73 66 69 68 63 68 C57 68 53 66 50 58 Z" fill="#8a7a6a" />
      <path d="M57 63.6 q3 -2 6 -0.4 q3 -1.6 6 0.4 q-3 1.8 -6 0.6 q-3 1.2 -6 -0.6 Z" fill="#6f6152" />
      <path d="M50 54 C49 44 77 44 76 54 C74 49 52 49 50 54 Z" fill="#8a7a6a" />
      {/* crown */}
      <path d="M47 47 L46 30 L53 38 L58 27 L63 36 L68 27 L73 38 L80 30 L79 47 Q63 43 47 47 Z" fill={ids.url('gold')} stroke="#6b4a1a" strokeWidth="0.6" />
      <circle cx="46" cy="30" r="1.4" fill="#f7f3ea" />
      <circle cx="58" cy="27" r="1.4" fill="#f7f3ea" />
      <circle cx="68" cy="27" r="1.4" fill="#f7f3ea" />
      <circle cx="80" cy="30" r="1.4" fill="#f7f3ea" />
      <rect x="48" y="42" width="30" height="4" fill="#7a1424" opacity="0.8" />
      <circle cx="63" cy="44" r="1.6" fill="#3f7fd6" />
      <circle cx="54" cy="44" r="1.1" fill="#2fae7a" />
      <circle cx="72" cy="44" r="1.1" fill="#2fae7a" />
      {/* sceptre */}
      <rect x="88" y="54" width="2.4" height="58" fill={ids.url('gold')} transform="rotate(8 89 84)" />
      <circle cx="86.4" cy="53" r="3.6" fill={ids.url('gold')} />
      <circle cx="86.4" cy="53" r="1.6" fill="#b3122a" />
    </g>
  );
}

function CountessPortrait({ ids }: { ids: Ids }) {
  return (
    <g>
      {/* candles */}
      {[24, 102].map((x) => (
        <g key={x}>
          <rect x={x - 2} y="58" width="4" height="22" fill="#f2e6c8" />
          <ellipse cx={x} cy="55" rx="2" ry="4" fill="#ffcf6b" style={{ animation: 'sd-flicker 2.6s linear infinite' }} />
          <circle cx={x} cy="55" r="9" fill="#ffcf6b" opacity="0.12" />
        </g>
      ))}
      {/* tall updo behind */}
      <path d="M50 50 C46 26 80 26 76 50 Z" fill="#241016" />
      <Torso ids={ids} colors={LOOK[7].robe} />
      {/* off-shoulder neckline (skin) */}
      <path d="M40 92 C48 86 56 86 63 92 C70 86 78 86 86 92 C80 88 74 84 63 84 C52 84 46 88 40 92 Z" fill="#efc29d" />
      <path d="M38 93 C48 90 56 92 63 96 C70 92 78 90 88 93" stroke="#2f0a23" strokeWidth="1.4" fill="none" />
      {/* pearls */}
      <path d="M54 84 Q63 90 72 84" stroke="#f7f3ea" strokeWidth="1.8" strokeDasharray="0.1 2.4" strokeLinecap="round" fill="none" />
      <Head ids={ids} female skin="#f3cfb0" />
      <circle cx="68.6" cy="61.4" r="0.6" fill="#2a1a12" />
      <path d="M50 56 C48 40 78 38 76 56 C73 46 66 44 63 46 C58 44 52 48 50 56 Z" fill="#2c1218" />
      {/* tiara */}
      <path d="M52 44 Q63 38 74 44 L72 41 L67 41.6 L63 36 L59 41.6 L54 41 Z" fill="#dfe6ee" stroke="#8b96a3" strokeWidth="0.4" />
      <circle cx="63" cy="39.4" r="1.2" fill="#c43b8b" />
      {/* fan */}
      <g transform="translate(32 104) rotate(-20)">
        {[-50, -30, -10, 10, 30, 50].map((a) => (
          <path key={a} d="M0 0 L-3 -22 L3 -22 Z" fill={a % 20 === 0 ? '#e9c2d8' : '#c98fb1'} transform={`rotate(${a})`} />
        ))}
        <path d="M-17 -14 A22 22 0 0 1 17 -14" stroke={ids.url('gold')} strokeWidth="1" fill="none" />
        <circle r="1.6" fill={ids.url('gold')} />
      </g>
    </g>
  );
}

function PrincessPortrait({ ids }: { ids: Ids }) {
  return (
    <g>
      {/* rose vines */}
      <g>
        <path d="M14 30 C26 36 22 52 34 58 M112 30 C100 36 104 52 92 58" stroke="#2f6b2a" strokeWidth="1.2" fill="none" />
        {[
          [20, 34],
          [30, 52],
          [106, 34],
          [96, 52],
          [24, 74],
          [102, 74],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="3.4" fill="#d43d5c" />
            <path d={`M${x! - 2} ${y! - 0.4} q2 -2.2 4 0 q-2 1.6 -4 0 Z`} fill="#8a1530" />
          </g>
        ))}
      </g>
      <circle cx="63" cy="46" r="26" fill="#ffd9e4" opacity="0.2" />
      {/* long golden hair behind */}
      <path d="M48 52 C40 72 40 96 46 112 L80 112 C86 96 86 72 78 52 C76 40 50 40 48 52 Z" fill="#d9a441" />
      <Torso ids={ids} colors={LOOK[8].robe} />
      <path d="M46 88 C52 84 58 84 63 90 C68 84 74 84 80 88" stroke="#fbe3ea" strokeWidth="1.2" fill="none" />
      <path d="M44 98 Q63 106 82 98" stroke="#fbe3ea" strokeWidth="0.8" strokeDasharray="1.5 1.5" fill="none" />
      <Head ids={ids} female skin="#f6d4b8" />
      <path d="M50 58 C47 40 79 40 76 58 C75 48 70 45 63 47 C56 45 51 48 50 58 Z" fill="#e6b54f" />
      <path d="M50 58 C47 70 46 80 50 88 C50 76 51 66 53 60 Z M76 58 C79 70 80 80 76 88 C76 76 75 66 73 60 Z" fill="#e6b54f" />
      {/* tiara with heart */}
      <path d="M52 45.6 Q63 40.6 74 45.6 L73 43 L68 43 L63 38.6 L58 43 L53 43 Z" fill={ids.url('gold')} stroke="#6b4a1a" strokeWidth="0.4" />
      <path d="M63 42.6 c-1.4 -1.6 -3 0 -1.6 1.4 l1.6 1.4 l1.6 -1.4 c1.4 -1.4 -0.2 -3 -1.6 -1.4 Z" fill="#c8202d" />
      {/* love letter clasped to her heart */}
      <g transform="rotate(8 63 104)">
        <rect x="52" y="98" width="22" height="14" rx="1" fill="#f6ecd6" stroke="#b49a6a" strokeWidth="0.5" />
        <path d="M52 98 L63 106 L74 98" fill="none" stroke="#b49a6a" strokeWidth="0.5" />
        <path d="M63 104.6 c-1.6 -1.8 -3.4 0 -1.8 1.6 l1.8 1.6 l1.8 -1.6 c1.6 -1.6 -0.2 -3.4 -1.8 -1.6 Z" fill="#c8202d" />
      </g>
    </g>
  );
}

const PORTRAITS: Record<Rank, (p: { ids: Ids }) => ReactNode> = {
  1: GuardPortrait,
  2: PriestPortrait,
  3: BaronPortrait,
  4: HandmaidPortrait,
  5: PrincePortrait,
  6: KingPortrait,
  7: CountessPortrait,
  8: PrincessPortrait,
};

// ---------------------------------------------------------------------------
// Card face
// ---------------------------------------------------------------------------

const WINDOW = 'M14 112 L14 40 C14 24 30 15 63 14 C96 15 112 24 112 40 L112 112 Z';

export function LoveCard({
  rank,
  showText = true,
  className,
  title,
}: {
  rank: Rank;
  /** Effect text under the name banner (skip for tiny cards). */
  showText?: boolean;
  className?: string;
  title?: string;
}) {
  const ids = useSvgIds();
  const look = LOOK[rank];
  const Portrait = PORTRAITS[rank];
  const name = RANK_NAMES[rank];
  return (
    <svg
      viewBox={`0 0 ${CARD_VB_W} ${CARD_VB_H}`}
      className={className}
      role="img"
      aria-label={title ?? `${name} (${rank})`}
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <defs>
        <GoldDefs ids={ids} />
        <linearGradient id={ids('stock')} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#fbf3e1" />
          <stop offset="0.6" stopColor="#f1e3c3" />
          <stop offset="1" stopColor="#e3cfa4" />
        </linearGradient>
        <radialGradient id={ids('win')} cx="50%" cy="30%" r="80%">
          <stop offset="0" stopColor={look.bg[0]} />
          <stop offset="1" stopColor={look.bg[1]} />
        </radialGradient>
        <radialGradient id={ids('vig')} cx="50%" cy="40%" r="70%">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>
        <radialGradient id={ids('medal')} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#a3202f" />
          <stop offset="1" stopColor="#3b0610" />
        </radialGradient>
        <linearGradient id={ids('ribbon')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8e1b2b" />
          <stop offset="1" stopColor="#4d0913" />
        </linearGradient>
        <clipPath id={ids('clip')}>
          <path d={WINDOW} />
        </clipPath>
      </defs>

      {/* card stock */}
      <rect x="0.5" y="0.5" width={CARD_VB_W - 1} height={CARD_VB_H - 1} rx="8" fill={ids.url('stock')} stroke="#a88a55" strokeWidth="0.8" />
      <rect x="4" y="4" width="118" height="168" rx="6" fill="none" stroke={ids.url('gold')} strokeWidth="2.2" />
      <rect x="7.5" y="7.5" width="111" height="161" rx="4" fill="none" stroke={ids.url('gold')} strokeWidth="0.7" />

      {/* portrait */}
      <g clipPath={ids.url('clip')}>
        <rect x="14" y="14" width="98" height="98" fill={ids.url('win')} />
        <Portrait ids={ids} />
        <rect x="14" y="14" width="98" height="98" fill={ids.url('vig')} />
      </g>
      <path d={WINDOW} fill="none" stroke={ids.url('gold')} strokeWidth="1.8" />

      {/* name ribbon */}
      <path d="M6 112 L18 107 H108 L120 112 L113 117.5 L120 123 L108 128 H18 L6 123 L13 117.5 Z" fill={ids.url('ribbon')} stroke={ids.url('gold')} strokeWidth="0.8" />
      <text x="63" y="121.2" textAnchor="middle" fontSize="10.5" fontWeight="700" letterSpacing="1.2" fill="#f8e7bd" style={FONT}>
        {name.toUpperCase()}
      </text>

      {showText && (
        <g style={FONT}>
          <path d="M30 134 H56 M70 134 H96" stroke="#b48a3c" strokeWidth="0.6" />
          <path d="M63 131.4 l2.6 2.6 l-2.6 2.6 l-2.6 -2.6 Z" fill={ids.url('gold')} />
          <text x="63" y="145" textAnchor="middle" fontSize="6.6" fontStyle="italic" fill="#4a3420">
            {look.lines[0]}
          </text>
          <text x="63" y="153.6" textAnchor="middle" fontSize="6.6" fontStyle="italic" fill="#4a3420">
            {look.lines[1]}
          </text>
        </g>
      )}
      <text x="14" y="166" fontSize="6.2" fill="#7a5a32" style={FONT}>
        ×{RANK_COUNTS[rank]}
      </text>

      {/* numeral medallions */}
      <g>
        <circle cx="21" cy="22" r="12" fill={ids.url('medal')} stroke={ids.url('gold')} strokeWidth="1.8" />
        <circle cx="21" cy="22" r="9.3" fill="none" stroke={ids.url('gold')} strokeWidth="0.5" strokeDasharray="1 1.2" />
        <text x="21" y="27.6" textAnchor="middle" fontSize="16" fontWeight="700" fill="#f6dd8f" style={FONT}>
          {rank}
        </text>
      </g>
      <g transform="rotate(180 110 163.5)">
        <circle cx="110" cy="163.5" r="6.2" fill={ids.url('medal')} stroke={ids.url('gold')} strokeWidth="1" />
        <text x="110" y="166.6" textAnchor="middle" fontSize="8.4" fontWeight="700" fill="#f6dd8f" style={FONT}>
          {rank}
        </text>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Card back — a sealed love letter
// ---------------------------------------------------------------------------

export function LoveCardBack({ className, title = 'Face-down card' }: { className?: string; title?: string }) {
  const ids = useSvgIds();
  return (
    <svg
      viewBox={`0 0 ${CARD_VB_W} ${CARD_VB_H}`}
      className={className}
      role="img"
      aria-label={title}
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <defs>
        <GoldDefs ids={ids} />
        <linearGradient id={ids('paper')} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="#f4e7c9" />
          <stop offset="1" stopColor="#dcc597" />
        </linearGradient>
        <linearGradient id={ids('flap')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9d6ad" />
          <stop offset="1" stopColor="#d1b884" />
        </linearGradient>
        <radialGradient id={ids('wax')} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#e2414d" />
          <stop offset="0.55" stopColor="#a3121f" />
          <stop offset="1" stopColor="#5c0710" />
        </radialGradient>
        <pattern id={ids('damask')} width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M9 2 C12 6 12 12 9 16 C6 12 6 6 9 2 Z" fill="none" stroke="#b08a4a" strokeWidth="0.5" opacity="0.35" />
        </pattern>
        <filter id={ids('waxShadow')} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" />
          <feOffset dy="1.6" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.5" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x="0.5" y="0.5" width={CARD_VB_W - 1} height={CARD_VB_H - 1} rx="8" fill={ids.url('paper')} stroke="#a88a55" strokeWidth="0.8" />
      <rect x="4" y="4" width="118" height="168" rx="6" fill={ids.url('damask')} />
      {/* envelope folds */}
      <path d="M6 170 L63 100 L120 170 Z" fill="#000" opacity="0.06" />
      <path d="M6 6 L63 98 L6 170 Z M120 6 L63 98 L120 170 Z" fill="#000" opacity="0.035" />
      <path d="M6 170 L63 100 L120 170 M6 6 L6 170 M120 6 L120 170" stroke="#9c7f4c" strokeWidth="0.6" fill="none" opacity="0.6" />
      {/* top flap with shadow */}
      <path d="M6 6 H120 L63 100 Z" fill="#000" opacity="0.12" transform="translate(0 2.4)" />
      <path d="M6 6 H120 L63 98 Z" fill={ids.url('flap')} stroke="#9c7f4c" strokeWidth="0.6" />
      <rect x="4" y="4" width="118" height="168" rx="6" fill="none" stroke={ids.url('gold')} strokeWidth="2" />
      <rect x="7.5" y="7.5" width="111" height="161" rx="4" fill="none" stroke={ids.url('gold')} strokeWidth="0.6" />
      {/* wax seal */}
      <g filter={ids.url('waxShadow')}>
        <path
          d="M63 79 C70 78 75 81 78 85 C82 87 83 92 81 97 C83 102 80 107 76 109 C73 114 67 115 63 113 C58 116 52 114 50 110 C45 108 43 102 45 98 C42 93 45 87 49 85 C52 80 58 78 63 79 Z"
          fill={ids.url('wax')}
        />
        <path d="M77 108 C79 112 79 116 77 118 C75 116 75 112 77 108 Z" fill="#8a0c18" />
        <circle cx="63" cy="96.5" r="11.5" fill="none" stroke="#5c0710" strokeWidth="1.2" opacity="0.7" />
        <circle cx="63" cy="96.5" r="11.5" fill="none" stroke="#f08a92" strokeWidth="0.5" opacity="0.5" transform="translate(-0.6 -0.6)" />
        <path d="M63 103.5 C55 97.5 55.5 91 59.5 90.2 C61.4 89.8 62.6 91 63 92.4 C63.4 91 64.6 89.8 66.5 90.2 C70.5 91 71 97.5 63 103.5 Z" fill="#7a0a14" />
        <path d="M60 91.6 C58.6 92.4 58.4 94.4 59.4 95.6" stroke="#f3949b" strokeWidth="0.7" fill="none" opacity="0.8" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Token of affection — a faceted red gem heart
// ---------------------------------------------------------------------------

export function TokenGem({ filled = true, size = 20, title }: { filled?: boolean; size?: number; title?: string }) {
  const ids = useSvgIds();
  const heart =
    'M12 21.5 C4.5 15.8 1 11.6 1 7.4 C1 3.8 3.8 1.2 7.1 1.2 C9.3 1.2 11 2.4 12 4.2 C13 2.4 14.7 1.2 16.9 1.2 C20.2 1.2 23 3.8 23 7.4 C23 11.6 19.5 15.8 12 21.5 Z';
  return (
    <svg viewBox="0 0 24 23" width={size} height={size * (23 / 24)} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={ids('g')} x1="0.1" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#ff7d8c" />
          <stop offset="0.45" stopColor="#d1192f" />
          <stop offset="1" stopColor="#5e0612" />
        </linearGradient>
        <linearGradient id={ids('rim')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a6420" />
          <stop offset="0.5" stopColor="#f3d27a" />
          <stop offset="1" stopColor="#8a6420" />
        </linearGradient>
      </defs>
      {filled ? (
        <g>
          <path d={heart} fill={ids.url('g')} stroke={ids.url('rim')} strokeWidth="1" />
          <path d="M12 4.2 L12 21.5 M1.3 7.4 L12 10.5 L22.7 7.4 M7 1.4 L12 10.5 L17 1.4 M4 15 L12 10.5 L20 15" stroke="#fff" strokeOpacity="0.18" strokeWidth="0.5" fill="none" />
          <path d="M4.2 6.4 C4.6 4.4 6.2 3.4 7.8 3.6" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </g>
      ) : (
        <path d={heart} fill="#2a0d14" fillOpacity="0.55" stroke={ids.url('rim')} strokeWidth="0.9" strokeOpacity="0.55" />
      )}
    </svg>
  );
}
