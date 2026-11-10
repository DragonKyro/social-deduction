import type { CSSProperties, ReactNode } from 'react';
import { Glow, SoftShadow, Vignette, useSvgIds } from '@/ui/shared/svg';
import { ROLES } from '../roles';
import type { AvalonAlignment, AvalonRoleId } from '../state';
import art from './Art.module.css';

// ============================================================================
// Avalon role art — illuminated-manuscript portraits, one per character.
//
//   <RolePortrait role>   bare 120×150 illustration (fills its box)
//   <RoleArt role size>   portrait in a gilded arch (setup screen, rosters)
//   <RoleCardFace role>   the full illuminated role card
//   <RoleCardBack>        the shared card back (identical for every role)
//   <AlignmentBadge>      tiny heraldic shield for good / evil
//
// Every SVG derives its <defs> ids from useSvgIds() — inline ids are
// document-global and a table shows many portraits at once.
// ============================================================================

type Id = ReturnType<typeof useSvgIds>;

const SKIN = ['#f1d2b4', '#c99572'];

function Defs({ id, sky }: { id: Id; sky: [string, string, string] }) {
  return (
    <defs>
      <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={sky[0]} />
        <stop offset="55%" stopColor={sky[1]} />
        <stop offset="100%" stopColor={sky[2]} />
      </linearGradient>
      <radialGradient id={id('skin')} cx="45%" cy="38%" r="70%">
        <stop offset="0%" stopColor={SKIN[0]} />
        <stop offset="100%" stopColor={SKIN[1]} />
      </radialGradient>
      <linearGradient id={id('gold')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff1b8" />
        <stop offset="45%" stopColor="#d4a64a" />
        <stop offset="100%" stopColor="#7a5418" />
      </linearGradient>
      <linearGradient id={id('steel')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#5d6878" />
        <stop offset="35%" stopColor="#f2f5f9" />
        <stop offset="60%" stopColor="#a6b0be" />
        <stop offset="100%" stopColor="#3f4855" />
      </linearGradient>
      <linearGradient id={id('dark')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#0b0c10" />
        <stop offset="45%" stopColor="#3b3f4a" />
        <stop offset="100%" stopColor="#0b0c10" />
      </linearGradient>
      <Vignette id={id('vig')} inner={0.5} opacity={0.75} />
      <SoftShadow id={id('shadow')} dy={2} blur={2} opacity={0.6} />
    </defs>
  );
}

function Frame({ id, children }: { id: Id; children: ReactNode }) {
  return (
    <>
      <rect width="120" height="150" fill={id.url('sky')} />
      {children}
      <rect width="120" height="150" fill={id.url('vig')} pointerEvents="none" />
    </>
  );
}

function Stars({ pts }: { pts: Array<[number, number, number]> }) {
  return (
    <g fill="#fff6d8">
      {pts.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} className={art.twinkle} style={{ animationDelay: `${i * 0.37}s` }} />
      ))}
    </g>
  );
}

function Eyes({ y = 72, gap = 5.5, color = '#2a1f14', glow }: { y?: number; gap?: number; color?: string; glow?: string }) {
  return (
    <g fill={color} filter={glow}>
      <ellipse cx={60 - gap} cy={y} rx="1.9" ry="1.3" />
      <ellipse cx={60 + gap} cy={y} rx="1.9" ry="1.3" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Per-role illustrations (120 × 150)
// ---------------------------------------------------------------------------

function Merlin({ id }: { id: Id }) {
  return (
    <>
      <defs>
        <linearGradient id={id('robe')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a55b8" />
          <stop offset="100%" stopColor="#141c4d" />
        </linearGradient>
        <linearGradient id={id('hat')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1c275f" />
          <stop offset="50%" stopColor="#3550a8" />
          <stop offset="100%" stopColor="#111a45" />
        </linearGradient>
        <linearGradient id={id('beard')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#b9b4aa" />
        </linearGradient>
        <radialGradient id={id('orb')} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#9ff1ff" />
          <stop offset="100%" stopColor="#1f8fd6" />
        </radialGradient>
        <Glow id={id('orbGlow')} color="#7fe3ff" blur={5} strength={0.9} />
        <mask id={id('moon')}>
          <rect width="120" height="150" fill="black" />
          <circle cx="22" cy="24" r="9" fill="white" />
          <circle cx="26.5" cy="20.5" r="8" fill="black" />
        </mask>
      </defs>
      <Frame id={id}>
        <rect width="120" height="150" fill="#f6e7b0" mask={`url(#${id('moon')})`} opacity="0.95" />
        <Stars pts={[[14, 52, 0.9], [40, 14, 0.8], [92, 18, 1.1], [108, 44, 0.7], [84, 34, 0.6], [10, 84, 0.7], [110, 76, 0.8]]} />
        {/* robe + gold trim */}
        <path d="M12 150 C16 112 36 97 60 95 C84 97 104 112 108 150 Z" fill={id.url('robe')} />
        <path d="M44 99 C50 112 54 130 56 150 M76 99 C70 112 66 130 64 150" stroke={id.url('gold')} strokeWidth="2.2" fill="none" />
        {/* staff */}
        <path d="M98 46 L101 150" stroke="#6b4423" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M98 46 L101 150" stroke="#a87a4a" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
        <path d="M92 44 C94 34 104 34 104 44" stroke="#6b4423" strokeWidth="2.5" fill="none" />
        <circle cx="98" cy="36" r="6.5" fill={id.url('orb')} filter={id.url('orbGlow')} className={art.pulse} />
        <ellipse cx="99.5" cy="96" rx="5" ry="6" fill={id.url('skin')} />
        {/* face */}
        <ellipse cx="60" cy="74" rx="13" ry="15" fill={id.url('skin')} />
        <Eyes y={72} />
        <path d="M51 67 Q55 63.5 58 67 M62 67 Q65 63.5 69 67" stroke="#f4f2ec" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d="M60 72 L58.5 79 L61 79.5" stroke="#9c6a48" strokeWidth="1" fill="none" />
        {/* beard + moustache */}
        <path d="M46 78 C43 98 49 122 60 138 C71 122 77 98 74 78 C69 85 51 85 46 78 Z" fill={id.url('beard')} />
        <path d="M52 92 C54 106 56 118 59 128 M66 92 C65 106 63 118 61 128 M58 88 C58 104 60 120 60 132" stroke="#a9a397" strokeWidth="0.7" fill="none" />
        <path d="M50 82 C54 79 58 80 60 82 C62 80 66 79 70 82 C66 86 62 85 60 84 C58 85 54 86 50 82 Z" fill="#e9e6df" />
        {/* hat */}
        <path d="M33 60 C44 46 52 24 68 5 C65 22 72 40 87 60 Z" fill={id.url('hat')} />
        <path d="M68 5 C75 8 80 13 82 20" stroke="#3550a8" strokeWidth="3" fill="none" strokeLinecap="round" />
        <ellipse cx="60" cy="60" rx="31" ry="6.5" fill="#1a2459" />
        <path d="M34 57 C48 61 72 61 86 57" stroke={id.url('gold')} strokeWidth="2.4" fill="none" />
        <g fill={id.url('gold')}>
          <path d="M56 34 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z" />
          <path d="M66 44 l0.9 2.2 2.2 0.9 -2.2 0.9 -0.9 2.2 -0.9 -2.2 -2.2 -0.9 2.2 -0.9z" />
          <path d="M50 49 l0.8 2 2 0.8 -2 0.8 -0.8 2 -0.8 -2 -2 -0.8 2 -0.8z" />
          <circle cx="62" cy="24" r="1.2" />
        </g>
      </Frame>
    </>
  );
}

function Percival({ id }: { id: Id }) {
  return (
    <>
      <defs>
        <radialGradient id={id('sun')} cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#fff6cf" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#ffd27a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffd27a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('plume')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7fb2ff" />
          <stop offset="100%" stopColor="#1d3f8f" />
        </linearGradient>
        <Glow id={id('grailGlow')} color="#ffe08a" blur={4} strength={0.9} />
      </defs>
      <Frame id={id}>
        <circle cx="60" cy="58" r="56" fill={id.url('sun')} />
        <g stroke="#fff3c4" strokeWidth="1" opacity="0.35">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <line key={i} x1={60 + Math.cos(a) * 34} y1={58 + Math.sin(a) * 34} x2={60 + Math.cos(a) * 60} y2={58 + Math.sin(a) * 60} />;
          })}
        </g>
        {/* mail + surcoat */}
        <path d="M12 150 C16 114 34 99 60 97 C86 99 104 114 108 150 Z" fill="#7d8796" />
        <path d="M12 150 C16 114 34 99 60 97 C86 99 104 114 108 150 Z" fill="none" stroke="#5b6472" strokeWidth="0.6" strokeDasharray="1.5 1.5" />
        <path d="M34 150 L38 108 C46 102 74 102 82 108 L86 150 Z" fill="#1f4aa8" />
        <path d="M57 108 H63 V150 H57 Z M44 118 H76 V124 H44 Z" fill={id.url('gold')} />
        {/* plume */}
        <path d="M60 24 C68 4 98 4 104 22 C92 16 78 20 66 32 Z" fill={id.url('plume')} />
        <path d="M66 22 C76 12 90 12 98 18" stroke="#c7dcff" strokeWidth="0.8" fill="none" />
        {/* great helm */}
        <g filter={id.url('shadow')}>
          <path d="M40 42 C40 21 80 21 80 42 L80 88 C80 93 76 95 72 95 L48 95 C44 95 40 93 40 88 Z" fill={id.url('steel')} />
          <rect x="43" y="57" width="34" height="4.5" rx="1" fill="#0b0f17" />
          <rect x="57.6" y="27" width="4.8" height="66" fill="#dfe5ec" opacity="0.65" />
          <rect x="57.6" y="57" width="4.8" height="4.5" fill="#0b0f17" />
          <g fill="#1a2028">
            <circle cx="68" cy="72" r="1.1" />
            <circle cx="72" cy="72" r="1.1" />
            <circle cx="68" cy="77" r="1.1" />
            <circle cx="72" cy="77" r="1.1" />
            <circle cx="68" cy="82" r="1.1" />
            <circle cx="72" cy="82" r="1.1" />
          </g>
          <path d="M40 46 H80" stroke={id.url('gold')} strokeWidth="2" />
        </g>
        {/* the grail */}
        <g filter={id.url('grailGlow')} className={art.pulse}>
          <path d="M47 113 C47 127 73 127 73 113 Z" fill={id.url('gold')} />
          <rect x="58" y="125" width="4" height="9" fill={id.url('gold')} />
          <ellipse cx="60" cy="136" rx="9" ry="3" fill={id.url('gold')} />
          <ellipse cx="60" cy="113" rx="13" ry="2.4" fill="#fff3c4" />
          <circle cx="60" cy="119" r="1.6" fill="#c0392b" />
        </g>
      </Frame>
    </>
  );
}

function LoyalServant({ id }: { id: Id }) {
  return (
    <>
      <defs>
        <linearGradient id={id('banner')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#173a7a" />
          <stop offset="50%" stopColor="#2f62c4" />
          <stop offset="100%" stopColor="#173a7a" />
        </linearGradient>
      </defs>
      <Frame id={id}>
        {/* castle wall */}
        <g fill="#20384f" opacity="0.55">
          <path d="M0 88 V60 H10 V54 H18 V60 H30 V54 H38 V60 H50 V88 Z" />
          <path d="M70 88 V60 H82 V54 H90 V60 H102 V54 H110 V60 H120 V88 Z" />
        </g>
        {/* banner */}
        <path d="M78 8 H104 V52 L91 44 L78 52 Z" fill={id.url('banner')} />
        <path d="M89 14 H93 V44 H89 Z M81 24 H101 V28 H81 Z" fill={id.url('gold')} />
        <path d="M77 6 V96" stroke="#6b4423" strokeWidth="2" />
        {/* spear */}
        <path d="M27 18 L30 150" stroke="#6b4423" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M27 2 L31 18 L23 18 Z" fill={id.url('steel')} />
        {/* body: leather + tabard with cross */}
        <path d="M12 150 C16 114 34 100 60 98 C86 100 104 114 108 150 Z" fill="#5b3b25" />
        <path d="M34 150 L37 108 C46 103 74 103 83 108 L86 150 Z" fill="#2453b0" />
        <path d="M56.5 108 H63.5 V150 H56.5 Z M42 120 H78 V127 H42 Z" fill="#f4efe2" />
        <ellipse cx="29" cy="104" rx="5.5" ry="6" fill={id.url('skin')} />
        {/* head + kettle helm */}
        <ellipse cx="60" cy="77" rx="12.5" ry="14.5" fill={id.url('skin')} />
        <Eyes y={76} />
        <path d="M56 85 Q60 87.5 64 85" stroke="#8a4f34" strokeWidth="1" fill="none" />
        <path d="M49 82 C50 92 56 96 60 96 C64 96 70 92 71 82 C68 88 64 90 60 90 C56 90 52 88 49 82 Z" fill="#7a4a26" />
        <path d="M44 66 C44 48 76 48 76 66 Z" fill={id.url('steel')} />
        <ellipse cx="60" cy="66" rx="24" ry="4.5" fill={id.url('steel')} filter={id.url('shadow')} />
        <path d="M58.5 50 H61.5 V66 H58.5 Z" fill="#dfe5ec" opacity="0.7" />
      </Frame>
    </>
  );
}

function Dagger({ x, y, rot, id, blood }: { x: number; y: number; rot: number; id: Id; blood?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d="M0 -38 L3.4 -6 L0 -3 L-3.4 -6 Z" fill={id.url('steel')} />
      <path d="M0 -38 L0 -4" stroke="#ffffff" strokeWidth="0.5" opacity="0.7" />
      {blood && <path d="M0 -38 C1.6 -32 2.4 -28 0 -25 C-2.4 -28 -1.6 -32 0 -38 Z" fill="#a3121a" />}
      <rect x="-10" y="-6" width="20" height="3.6" rx="1.6" fill={id.url('gold')} />
      <rect x="-1.9" y="-2.4" width="3.8" height="12" fill="#2b1a10" />
      <circle cx="0" cy="11.5" r="3" fill={id.url('gold')} />
    </g>
  );
}

function Assassin({ id }: { id: Id }) {
  return (
    <>
      <defs>
        <linearGradient id={id('cloak')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#09090c" />
          <stop offset="50%" stopColor="#2c2c34" />
          <stop offset="100%" stopColor="#09090c" />
        </linearGradient>
        <Glow id={id('redGlow')} color="#ff2b2b" blur={2.4} strength={1} />
      </defs>
      <Frame id={id}>
        <circle cx="92" cy="26" r="12" fill="#e8c9a0" opacity="0.18" />
        <path d="M18 150 C20 112 30 92 38 72 C40 42 50 22 60 20 C70 22 80 42 82 72 C90 92 100 112 102 150 Z" fill={id.url('cloak')} />
        <path d="M60 20 C52 30 46 46 44 60 M60 20 C68 30 74 46 76 60" stroke="#40404a" strokeWidth="0.8" fill="none" />
        <ellipse cx="60" cy="66" rx="15" ry="19" fill="#040406" />
        <g filter={id.url('redGlow')} className={art.pulse}>
          <path d="M50.5 63 Q54 60.5 57.5 63 Q54 64.6 50.5 63 Z" fill="#ff4a3d" />
          <path d="M62.5 63 Q66 60.5 69.5 63 Q66 64.6 62.5 63 Z" fill="#ff4a3d" />
        </g>
        <path d="M45 72 C50 78 70 78 75 72 L76 86 C70 92 50 92 44 86 Z" fill="#5a0d12" />
        <path d="M46 80 C54 84 66 84 74 80" stroke="#7e1a20" strokeWidth="0.8" fill="none" />
        <Dagger x={60} y={124} rot={-32} id={id} blood />
        <Dagger x={60} y={124} rot={32} id={id} />
      </Frame>
    </>
  );
}

function Morgana({ id }: { id: Id }) {
  return (
    <>
      <defs>
        <radialGradient id={id('moonHalo')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#efe2ff" stopOpacity="0.85" />
          <stop offset="70%" stopColor="#b48ae6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#b48ae6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('gown')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6f2aa3" />
          <stop offset="100%" stopColor="#240a3c" />
        </linearGradient>
        <radialGradient id={id('pale')} cx="45%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#f7ecf2" />
          <stop offset="100%" stopColor="#c7a5b7" />
        </radialGradient>
        <radialGradient id={id('flame')} cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#e2a8ff" />
          <stop offset="100%" stopColor="#7a1fd0" />
        </radialGradient>
        <Glow id={id('violet')} color="#c46bff" blur={4.5} strength={0.95} />
      </defs>
      <Frame id={id}>
        <circle cx="60" cy="56" r="34" fill={id.url('moonHalo')} />
        <ellipse cx="34" cy="128" rx="40" ry="10" fill="#d9b8ff" opacity="0.08" className={art.drift} />
        {/* hair behind */}
        <path d="M38 62 C33 92 29 122 24 150 L96 150 C91 122 87 92 82 62 C80 38 40 38 38 62 Z" fill="#0d0a14" />
        <path d="M42 70 C40 96 38 118 34 140 M78 70 C80 96 82 118 86 140" stroke="#3e2a5a" strokeWidth="1" fill="none" />
        {/* gown + spiked collar */}
        <path d="M18 150 C22 116 38 102 60 100 C82 102 98 116 102 150 Z" fill={id.url('gown')} />
        <path d="M34 104 L44 86 L50 99 L60 88 L70 99 L76 86 L86 104 C78 100 70 98 60 98 C50 98 42 100 34 104 Z" fill="#1c0830" />
        <path d="M56 100 L60 116 L64 100" fill="#c9a6ff" opacity="0.5" />
        {/* face */}
        <ellipse cx="60" cy="72" rx="11.5" ry="14.5" fill={id.url('pale')} />
        <path d="M49.5 70 Q54 66 58 69.5 M62 69.5 Q66 66 70.5 70" stroke="#1b0d26" strokeWidth="1.2" fill="none" />
        <g fill="#1b0d26">
          <path d="M51 72.5 Q54.2 70.6 57.3 72.5 Q54.2 73.8 51 72.5 Z" />
          <path d="M62.7 72.5 Q65.8 70.6 69 72.5 Q65.8 73.8 62.7 72.5 Z" />
        </g>
        <path d="M56.5 81.5 Q60 83.6 63.5 81.5 Q60 80.4 56.5 81.5 Z" fill="#7a1430" />
        {/* hair front locks */}
        <path d="M48 58 C44 70 46 84 42 96 C40 80 40 66 48 58 Z M72 58 C76 70 74 84 78 96 C80 80 80 66 72 58 Z" fill="#0d0a14" />
        {/* circlet with crescent */}
        <path d="M47 61 C54 57 66 57 73 61" stroke="#d9dde6" strokeWidth="1.8" fill="none" />
        <path d="M60 50 a5.5 5.5 0 1 0 5 8 a4.5 4.5 0 1 1 -5 -8 Z" fill="#e9eef7" />
        {/* violet flame in raised hand */}
        <path d="M18 150 C20 132 22 118 26 108" stroke={id.url('gown')} strokeWidth="9" strokeLinecap="round" fill="none" />
        <ellipse cx="26" cy="106" rx="5" ry="4.2" fill={id.url('pale')} />
        <g filter={id.url('violet')} className={art.flicker}>
          <path d="M26 101 C18 92 24 84 22 74 C30 80 36 90 30 101 Z" fill={id.url('flame')} />
          <path d="M26 100 C23 94 26 89 25 84 C29 89 31 95 28 100 Z" fill="#ffffff" opacity="0.8" />
        </g>
      </Frame>
    </>
  );
}

function Mordred({ id }: { id: Id }) {
  return (
    <>
      <defs>
        <linearGradient id={id('cape')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8f121c" />
          <stop offset="100%" stopColor="#3a050a" />
        </linearGradient>
        <linearGradient id={id('bronze')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e3b26a" />
          <stop offset="50%" stopColor="#8a5a22" />
          <stop offset="100%" stopColor="#3d240b" />
        </linearGradient>
        <Glow id={id('ember')} color="#ff3030" blur={2.6} strength={1} />
      </defs>
      <Frame id={id}>
        <path d="M70 0 L62 22 L70 20 L58 44" stroke="#ffb4a8" strokeWidth="1.2" fill="none" opacity="0.5" className={art.flicker} />
        <path d="M6 150 C10 110 28 92 60 90 C92 92 110 110 114 150 Z" fill={id.url('cape')} />
        {/* armour */}
        <path d="M18 150 C22 118 38 104 60 102 C82 104 98 118 102 150 Z" fill={id.url('dark')} />
        <ellipse cx="32" cy="112" rx="15" ry="9" fill={id.url('dark')} stroke="#8f121c" strokeWidth="1.2" />
        <ellipse cx="88" cy="112" rx="15" ry="9" fill={id.url('dark')} stroke="#8f121c" strokeWidth="1.2" />
        {/* sword, point down, hands on the pommel */}
        <path d="M56 110 L64 110 L60 150 Z" fill={id.url('steel')} opacity="0.9" />
        <rect x="42" y="105" width="36" height="5" rx="2" fill={id.url('bronze')} />
        <rect x="57.5" y="92" width="5" height="13" fill="#1a0f08" />
        <circle cx="60" cy="90" r="4" fill={id.url('bronze')} />
        {/* helm */}
        <g filter={id.url('shadow')}>
          <path d="M42 46 C42 27 78 27 78 46 L78 84 C78 91 70 96 60 98 C50 96 42 91 42 84 Z" fill={id.url('dark')} />
          <path d="M45 60 H75 V64 H62.5 V86 H57.5 V64 H45 Z" fill="#ff3b30" filter={id.url('ember')} className={art.pulse} />
          {/* iron crown */}
          <path d="M41 44 L45 24 L51 37 L60 16 L69 37 L75 24 L79 44 Z" fill={id.url('bronze')} />
          <circle cx="60" cy="35" r="2.6" fill="#c0101c" stroke="#ffd0b0" strokeWidth="0.5" />
        </g>
      </Frame>
    </>
  );
}

function Oberon({ id }: { id: Id }) {
  return (
    <>
      <defs>
        <radialGradient id={id('fey')} cx="45%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#cfdcc4" />
          <stop offset="100%" stopColor="#6d8a68" />
        </radialGradient>
        <Glow id={id('amber')} color="#ffb21e" blur={2.4} strength={1} />
      </defs>
      <Frame id={id}>
        {/* forest silhouettes */}
        <g fill="#06140d" opacity="0.85">
          <path d="M0 150 V70 L8 50 L16 70 V150 Z M100 150 V64 L110 40 L120 64 V150 Z" />
          <path d="M14 150 V90 L22 72 L30 90 V150 Z M88 150 V86 L96 70 L104 86 V150 Z" />
        </g>
        <ellipse cx="30" cy="120" rx="44" ry="9" fill="#a8c9b0" opacity="0.12" className={art.drift} />
        <ellipse cx="90" cy="134" rx="40" ry="8" fill="#a8c9b0" opacity="0.1" className={art.drift} style={{ animationDelay: '-4s' }} />
        {/* antlers */}
        <g stroke="#8d7c60" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M52 52 C46 36 40 26 30 14 M44 36 L34 34 M40 28 C38 22 40 16 42 10 M34 20 L24 22" />
          <path d="M68 52 C74 36 80 26 90 14 M76 36 L86 34 M80 28 C82 22 80 16 78 10 M86 20 L96 22" />
        </g>
        {/* leafy mantle */}
        <path d="M14 150 C18 116 36 102 60 100 C84 102 102 116 106 150 Z" fill="#1d4a2c" />
        <g fill="#2f6b3e" stroke="#163a22" strokeWidth="0.6">
          {[[28, 118, -30], [42, 108, -15], [60, 106, 0], [78, 108, 15], [92, 118, 30], [36, 132, -20], [60, 124, 0], [84, 132, 20]].map(([x, y, r], i) => (
            <path key={i} transform={`translate(${x} ${y}) rotate(${r})`} d="M0 -10 C7 -5 7 5 0 10 C-7 5 -7 -5 0 -10 Z" />
          ))}
        </g>
        {/* face with pointed ears */}
        <path d="M46 70 L36 60 L47 76 Z M74 70 L84 60 L73 76 Z" fill={id.url('fey')} />
        <path d="M47 64 C47 52 73 52 73 64 L72 80 C70 90 64 96 60 98 C56 96 50 90 48 80 Z" fill={id.url('fey')} />
        <g filter={id.url('amber')} className={art.pulse}>
          <path d="M50 72 L57 71 L56 73.5 Z" fill="#ffcc4d" />
          <path d="M70 72 L63 71 L64 73.5 Z" fill="#ffcc4d" />
        </g>
        <path d="M57 87 Q60 88.4 63 87" stroke="#3f5a3b" strokeWidth="1" fill="none" />
        {/* thorn crown */}
        <path d="M46 60 C54 56 66 56 74 60 L72 62 L70 55 L67 60 L64 53 L61 59 L58 52 L56 59 L53 54 L51 60 L48 56 Z" fill="#2a1d12" />
      </Frame>
    </>
  );
}

function Minion({ id }: { id: Id }) {
  return (
    <>
      <defs>
        <linearGradient id={id('bone')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2e8d0" />
          <stop offset="100%" stopColor="#8a7a5a" />
        </linearGradient>
        <Glow id={id('fire')} color="#ff6a1e" blur={2.4} strength={1} />
      </defs>
      <Frame id={id}>
        <g fill="#ff8a3d">
          {[[20, 120], [34, 140], [92, 126], [104, 142], [76, 140]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.2" className={art.ember} style={{ animationDelay: `${i * 0.6}s` }} />
          ))}
        </g>
        {/* halberd */}
        <path d="M96 20 L99 150" stroke="#4a2e18" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M97 26 C110 30 112 46 98 52 Z" fill={id.url('steel')} />
        <path d="M96 26 L90 36 L96 40 Z" fill={id.url('steel')} />
        <path d="M96 8 L99 24 L93 24 Z" fill={id.url('steel')} />
        {/* armour + tabard with skull */}
        <path d="M12 150 C16 114 34 100 60 98 C86 100 104 114 108 150 Z" fill="#2c1d18" />
        <path d="M34 150 L37 108 C46 103 74 103 83 108 L86 150 Z" fill="#6e0f14" />
        <g transform="translate(60 126)">
          <path d="M-8 -6 C-8 -14 8 -14 8 -6 L8 1 L4 3 L4 7 L-4 7 L-4 3 L-8 1 Z" fill="#e9dfc8" />
          <circle cx="-3.4" cy="-4" r="2" fill="#2c1d18" />
          <circle cx="3.4" cy="-4" r="2" fill="#2c1d18" />
        </g>
        {/* horned helm */}
        <path d="M44 56 C30 54 24 40 26 28 C32 38 38 44 46 46 Z" fill={id.url('bone')} />
        <path d="M76 56 C90 54 96 40 94 28 C88 38 82 44 74 46 Z" fill={id.url('bone')} />
        <g filter={id.url('shadow')}>
          <path d="M42 56 C42 34 78 34 78 56 L78 82 C78 90 70 96 60 97 C50 96 42 90 42 82 Z" fill={id.url('dark')} />
          <path d="M44 62 C50 58 56 60 58 66 L58 70 C54 70 48 69 44 66 Z M76 62 C70 58 64 60 62 66 L62 70 C66 70 72 69 76 66 Z" fill="#050505" />
          <g filter={id.url('fire')} className={art.pulse}>
            <circle cx="51" cy="65" r="1.8" fill="#ff7a2a" />
            <circle cx="69" cy="65" r="1.8" fill="#ff7a2a" />
          </g>
          <path d="M60 40 V92" stroke="#5a5f6a" strokeWidth="2" />
          <g fill="#1a1a1e">
            <rect x="52" y="78" width="2" height="9" />
            <rect x="57" y="79" width="2" height="9" />
            <rect x="62" y="79" width="2" height="9" />
            <rect x="67" y="78" width="2" height="9" />
          </g>
        </g>
      </Frame>
    </>
  );
}

function Lancelot({ id, evil }: { id: Id; evil: boolean }) {
  return (
    <Frame id={id}>
      <path d="M12 150 C16 114 34 99 60 97 C86 99 104 114 108 150 Z" fill={evil ? '#3a0d12' : '#1f4aa8'} />
      <path d="M40 42 C40 21 80 21 80 42 L80 88 C80 93 76 95 72 95 L48 95 C44 95 40 93 40 88 Z" fill={id.url('steel')} />
      <rect x="43" y="57" width="34" height="4.5" rx="1" fill="#0b0f17" />
      <path d="M58 100 L62 100 L60 146 Z" fill={id.url('steel')} />
      <rect x="48" y="98" width="24" height="4" fill={id.url('gold')} />
    </Frame>
  );
}

const SKY: Record<AvalonRoleId, [string, string, string]> = {
  merlin: ['#1f2766', '#151a47', '#07081c'],
  percival: ['#ffd98a', '#c46a3a', '#3a1d2a'],
  loyalServant: ['#4d7aa6', '#25496e', '#0f1d2c'],
  assassin: ['#4a1015', '#22070a', '#080203'],
  morgana: ['#4b2373', '#25103e', '#0c0516'],
  mordred: ['#6e1218', '#2e060b', '#0b0204'],
  oberon: ['#1e4a34', '#0f2a1e', '#040a07'],
  minionOfMordred: ['#3d1210', '#1a0808', '#060202'],
  lancelotGood: ['#4d7aa6', '#25496e', '#0f1d2c'],
  lancelotEvil: ['#4a1015', '#22070a', '#080203'],
};

function Illustration({ role, id }: { role: AvalonRoleId; id: Id }) {
  switch (role) {
    case 'merlin':
      return <Merlin id={id} />;
    case 'percival':
      return <Percival id={id} />;
    case 'loyalServant':
      return <LoyalServant id={id} />;
    case 'assassin':
      return <Assassin id={id} />;
    case 'morgana':
      return <Morgana id={id} />;
    case 'mordred':
      return <Mordred id={id} />;
    case 'oberon':
      return <Oberon id={id} />;
    case 'minionOfMordred':
      return <Minion id={id} />;
    case 'lancelotGood':
      return <Lancelot id={id} evil={false} />;
    case 'lancelotEvil':
      return <Lancelot id={id} evil />;
  }
}

/** Bare portrait, 120×150 viewBox, scales to its container. */
export function RolePortrait({ role, className, style }: { role: AvalonRoleId; className?: string; style?: CSSProperties }) {
  const id = useSvgIds();
  return (
    <svg viewBox="0 0 120 150" className={className} style={style} role="img" aria-label={ROLES[role].name} preserveAspectRatio="xMidYMid slice">
      <Defs id={id} sky={SKY[role]} />
      <Illustration role={role} id={id} />
    </svg>
  );
}

export interface RoleArtProps {
  role: AvalonRoleId;
  size?: number;
  style?: CSSProperties;
}

/** Portrait in a gilded arch. `size` is the width; height is 1.25×. */
export function RoleArt({ role, size = 96, style }: RoleArtProps) {
  const id = useSvgIds();
  const arch = 'M6 150 V52 C6 22 30 4 60 4 C90 4 114 22 114 52 V150 Z';
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 120 150" style={style} role="img" aria-label={ROLES[role].name}>
      <Defs id={id} sky={SKY[role]} />
      <clipPath id={id('arch')}>
        <path d={arch} />
      </clipPath>
      <g clipPath={id.url('arch')}>
        <Illustration role={role} id={id} />
      </g>
      <path d={arch} fill="none" stroke={id.url('gold')} strokeWidth="6" />
      <path d={arch} fill="none" stroke="#2a1f14" strokeWidth="1" transform="translate(60 77) scale(0.93) translate(-60 -77)" opacity="0.6" />
    </svg>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M2 38 V14 C2 7 7 2 14 2 H38" fill="none" stroke="#8a6420" strokeWidth="2" />
      <path d="M8 38 V18 C8 12 12 8 18 8 H38" fill="none" stroke="#d4a64a" strokeWidth="1" />
      <path d="M14 14 C20 10 24 16 20 20 C16 24 10 18 14 14 Z" fill="#9b1c1c" />
      <path d="M6 30 C12 28 12 22 18 22 M30 6 C28 12 22 12 22 18" fill="none" stroke="#2f6b3e" strokeWidth="1.4" />
      <circle cx="18" cy="22" r="1.6" fill="#d4a64a" />
      <circle cx="22" cy="18" r="1.6" fill="#d4a64a" />
    </svg>
  );
}

// Ribbon-friendly names for small cards.
const SHORT_NAME: Partial<Record<AvalonRoleId, string>> = {
  loyalServant: 'Loyal Servant',
  minionOfMordred: 'Minion',
  lancelotGood: 'Lancelot',
  lancelotEvil: 'Lancelot',
};

/** The illuminated role card. Sized by its container (use the card ratio). */
export function RoleCardFace({ role, compact = false }: { role: AvalonRoleId; compact?: boolean }) {
  const spec = ROLES[role];
  const name = compact ? SHORT_NAME[role] ?? spec.name : spec.name;
  return (
    <div className={`${art.card} ${spec.alignment === 'good' ? art.cardGood : art.cardEvil} ${compact ? art.cardCompact : ''}`}>
      <Corner className={`${art.corner} ${art.tl}`} />
      <Corner className={`${art.corner} ${art.tr}`} />
      <Corner className={`${art.corner} ${art.bl}`} />
      <Corner className={`${art.corner} ${art.br}`} />
      <div className={art.arch}>
        <RolePortrait role={role} className={art.portrait} />
      </div>
      <div className={art.ribbon}>
        <span>{name}</span>
      </div>
      <div className={art.allegiance}>{spec.alignment === 'good' ? 'Loyal to Arthur' : 'Servant of Mordred'}</div>
    </div>
  );
}

/** The shared card back: every role's back is identical. */
export function RoleCardBack({ label }: { label?: string }) {
  const id = useSvgIds();
  return (
    <div className={art.cardBack}>
      <svg viewBox="0 0 126 176" preserveAspectRatio="none" className={art.backSvg} aria-hidden>
        <defs>
          <linearGradient id={id('g')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff1b8" />
            <stop offset="45%" stopColor="#d4a64a" />
            <stop offset="100%" stopColor="#7a5418" />
          </linearGradient>
          <pattern id={id('knot')} width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M0 6 Q3 0 6 6 T12 6 M6 0 Q0 3 6 6 T6 12" fill="none" stroke="#2a3f7a" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="126" height="176" fill="#0e1736" />
        <rect width="126" height="176" fill={id.url('knot')} opacity="0.7" />
        <rect x="6" y="6" width="114" height="164" rx="6" fill="none" stroke={id.url('g')} strokeWidth="2.5" />
        <rect x="11" y="11" width="104" height="154" rx="4" fill="none" stroke={id.url('g')} strokeWidth="0.8" />
        <g transform="translate(63 86)">
          <circle r="34" fill="#0b1029" stroke={id.url('g')} strokeWidth="2" />
          <path d="M-18 -16 H18 V4 C18 18 8 26 0 30 C-8 26 -18 18 -18 4 Z" fill="#1f3c86" stroke={id.url('g')} strokeWidth="1.6" />
          <path d="M-12 -24 L-8 -32 L-3 -25 L0 -34 L3 -25 L8 -32 L12 -24 Z" fill={id.url('g')} />
          <path d="M0 -22 V30" stroke="#e7ecf4" strokeWidth="3" />
          <path d="M-8 -12 H8" stroke={id.url('g')} strokeWidth="3" strokeLinecap="round" />
          <circle cy="-22" r="2.2" fill={id.url('g')} />
        </g>
        <text x="63" y="146" textAnchor="middle" fill="#d4a64a" fontFamily="Cinzel, serif" fontSize="11" letterSpacing="3">
          AVALON
        </text>
      </svg>
      {label && <span className={art.backLabel}>{label}</span>}
    </div>
  );
}

// Tiny alignment shield (game-over roster, setup chips).
export function AlignmentBadge({ alignment, size = 16 }: { alignment: AvalonAlignment; size?: number }) {
  const good = alignment === 'good';
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 20 23" role="img" aria-label={good ? 'Good' : 'Evil'}>
      <path d="M2 2 H18 V11 C18 17 13 20 10 21.5 C7 20 2 17 2 11 Z" fill={good ? '#2453b0' : '#7a0f16'} stroke="#d4a64a" strokeWidth="1.4" />
      {good ? (
        <path d="M9 5 H11 V18 H9 Z M5 9 H15 V11 H5 Z" fill="#f3d27a" />
      ) : (
        <path d="M6 6 L14 16 M14 6 L6 16" stroke="#111" strokeWidth="2.2" strokeLinecap="round" />
      )}
    </svg>
  );
}
