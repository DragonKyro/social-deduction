import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useSvgIds } from '@/ui/shared/svg';
import { CREATURES } from '../state';
import type { Creature } from '../state';

// ============================================================================
// Cockroach Poker art — comic-gothic bug cards.
//
// The eight creatures share one cartoon style (heavy ink outline, flat fill
// + one shade + one highlight, big googly eyes). Each is drawn ONCE as a
// <symbol> inside <CreatureDefs/>; every card, row stack and button then
// references it with <use>, which keeps a 21-card hand cheap.
// ============================================================================

export const CREATURE_LABEL: Record<Creature, string> = {
  rat: 'Rat',
  fly: 'Fly',
  spider: 'Spider',
  cockroach: 'Cockroach',
  toad: 'Toad',
  bat: 'Bat',
  scorpion: 'Scorpion',
  stinkbug: 'Stink Bug',
};

/** [light, dark] card background per creature. */
export const CREATURE_COLORS: Record<Creature, [string, string]> = {
  cockroach: ['#f3c96b', '#9a6220'],
  bat: ['#c2aee0', '#46336c'],
  fly: ['#c4e8e0', '#3a7a73'],
  toad: ['#cfe8a0', '#4a7628'],
  rat: ['#f2ccd3', '#935a68'],
  scorpion: ['#f7d6a0', '#b0592a'],
  spider: ['#eba8a8', '#661d29'],
  stinkbug: ['#eaee9e', '#76842a'],
};

const OL = '#1d1310';
const SW = 2.6;

function Eye({ x, y, r = 6, px = 0.6, py = 0.6, iris }: { x: number; y: number; r?: number; px?: number; py?: number; iris?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#fffdf4" stroke={OL} strokeWidth={1.8} />
      {iris && <circle cx={x + px} cy={y + py} r={r * 0.66} fill={iris} />}
      <circle cx={x + px} cy={y + py} r={r * 0.42} fill="#120c0a" />
      <circle cx={x + px - r * 0.2} cy={y + py - r * 0.22} r={r * 0.17} fill="#fff" />
    </g>
  );
}

/** A jointed leg: thick ink stroke with a coloured core. */
function Leg({ d, core, w = 3.4 }: { d: string; core: string; w?: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={OL} strokeWidth={w} />
      <path d={d} stroke={core} strokeWidth={w * 0.45} />
    </g>
  );
}

function Cockroach() {
  const leg = '#6b3f1d';
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M45 22 Q32 5 11 8" fill="none" stroke={OL} strokeWidth={2.2} />
      <path d="M55 22 Q68 5 89 8" fill="none" stroke={OL} strokeWidth={2.2} />
      {['M37 46 L22 40 L13 30', 'M35 60 L18 60 L9 68', 'M38 74 L25 84 L19 95', 'M63 46 L78 40 L87 30', 'M65 60 L82 60 L91 68', 'M62 74 L75 84 L81 95'].map(
        (d) => (
          <Leg key={d} d={d} core={leg} />
        ),
      )}
      <ellipse cx="50" cy="63" rx="19" ry="29" fill="#8d5a2b" stroke={OL} strokeWidth={SW} />
      <path d="M50 40 L50 91" stroke={OL} strokeWidth={1.8} />
      <path d="M38 50 Q40 70 46 86" stroke="#d29a5c" strokeWidth={3} opacity={0.65} fill="none" />
      <path d="M62 52 Q60 70 55 86" stroke="#d29a5c" strokeWidth={2} opacity={0.35} fill="none" />
      <path d="M33 40 Q34 27 50 26 Q66 27 67 40 Q50 46 33 40 Z" fill="#6e4220" stroke={OL} strokeWidth={SW} />
      <path d="M40 33 Q50 29 60 33" stroke="#b9834c" strokeWidth={2.4} fill="none" />
      <ellipse cx="50" cy="21" rx="10.5" ry="8" fill="#5a341a" stroke={OL} strokeWidth={SW} />
      <Eye x={45} y={19} r={4.8} />
      <Eye x={55} y={19} r={4.8} />
      <path d="M46 26 Q50 28.5 54 26" stroke="#f3e2c6" strokeWidth={1.6} fill="none" />
    </g>
  );
}

function Bat() {
  const fur = '#5d4b73';
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M47 44 C38 30 22 24 5 30 C9 38 9 47 12 56 C17 51 22 52 25 60 C29 54 35 55 39 62 C42 56 46 55 48 58 Z" fill="#4b3d5e" stroke={OL} strokeWidth={SW} />
      <path d="M53 44 C62 30 78 24 95 30 C91 38 91 47 88 56 C83 51 78 52 75 60 C71 54 65 55 61 62 C58 56 54 55 52 58 Z" fill="#4b3d5e" stroke={OL} strokeWidth={SW} />
      <path d="M46 44 L12 56 M46 46 L25 60 M47 48 L39 62 M54 44 L88 56 M54 46 L75 60 M53 48 L61 62" stroke="#2c2238" strokeWidth={1.4} />
      <path d="M44 40 C34 32 20 29 9 32" stroke="#8a77a0" strokeWidth={1.6} fill="none" opacity={0.6} />
      <ellipse cx="50" cy="59" rx="11" ry="17" fill={fur} stroke={OL} strokeWidth={SW} />
      <ellipse cx="50" cy="63" rx="6" ry="10" fill="#8a77a0" />
      <path d="M41 34 L36 17 L47 29 Z" fill={fur} stroke={OL} strokeWidth={SW} />
      <path d="M59 34 L64 17 L53 29 Z" fill={fur} stroke={OL} strokeWidth={SW} />
      <path d="M41 30 L38.5 22 L44.5 28 Z M59 30 L61.5 22 L55.5 28 Z" fill="#d98aa0" />
      <circle cx="50" cy="38" r="12" fill={fur} stroke={OL} strokeWidth={SW} />
      <Eye x={45} y={36} r={4.8} iris="#e8c547" />
      <Eye x={55} y={36} r={4.8} iris="#e8c547" />
      <path d="M48 41.5 L52 41.5 L50 43.5 Z" fill="#2c2238" />
      <path d="M45 45 Q50 48.5 55 45" stroke={OL} strokeWidth={1.6} fill="none" />
      <path d="M46.6 45.8 L47.8 50 L49 46.6 Z M51 46.6 L52.2 50 L53.4 45.8 Z" fill="#fff" stroke={OL} strokeWidth={0.8} />
      <path d="M46 76 L44 80 M48 76 L48 81 M54 76 L56 80 M52 76 L52 81" stroke={OL} strokeWidth={1.6} />
    </g>
  );
}

function Fly() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="32" cy="46" rx="18" ry="9" transform="rotate(-28 32 46)" fill="#d6ecff" fillOpacity={0.6} stroke={OL} strokeWidth={1.8} />
      <ellipse cx="68" cy="46" rx="18" ry="9" transform="rotate(28 68 46)" fill="#d6ecff" fillOpacity={0.6} stroke={OL} strokeWidth={1.8} />
      <path d="M42 50 Q30 46 18 40 M40 52 Q30 52 20 50 M58 50 Q70 46 82 40 M60 52 Q70 52 80 50" stroke="#5f7f99" strokeWidth={1} fill="none" />
      {['M41 56 L29 62 L23 72', 'M41 62 L31 72 L29 84', 'M42 50 L31 51 L23 45', 'M59 56 L71 62 L77 72', 'M59 62 L69 72 L71 84', 'M58 50 L69 51 L77 45'].map((d) => (
        <Leg key={d} d={d} core="#244a46" w={2.8} />
      ))}
      <ellipse cx="50" cy="72" rx="13" ry="15" fill="#2f6f68" stroke={OL} strokeWidth={SW} />
      <path d="M38 68 Q50 72 62 68 M39 76 Q50 80 61 76" stroke="#1b3f3b" strokeWidth={2} fill="none" />
      <path d="M43 64 Q41 72 45 82" stroke="#86e0d2" strokeWidth={2.2} fill="none" opacity={0.6} />
      <ellipse cx="50" cy="53" rx="13" ry="11" fill="#2a5751" stroke={OL} strokeWidth={SW} />
      <path d="M44 46 L43 43 M50 45 L50 42 M56 46 L57 43" stroke={OL} strokeWidth={1.2} />
      <circle cx="50" cy="35" r="12" fill="#1f3d39" stroke={OL} strokeWidth={SW} />
      <ellipse cx="41" cy="33" rx="8" ry="9" fill="#c02a2f" stroke={OL} strokeWidth={SW} />
      <ellipse cx="59" cy="33" rx="8" ry="9" fill="#c02a2f" stroke={OL} strokeWidth={SW} />
      <g fill="#e8656a">
        <circle cx="39" cy="31" r="1.3" />
        <circle cx="42.5" cy="29" r="1.3" />
        <circle cx="40" cy="35" r="1.3" />
        <circle cx="43.5" cy="33" r="1.3" />
        <circle cx="57" cy="31" r="1.3" />
        <circle cx="60.5" cy="29" r="1.3" />
        <circle cx="58" cy="35" r="1.3" />
        <circle cx="61.5" cy="33" r="1.3" />
      </g>
      <circle cx="38.5" cy="29" r="1.8" fill="#fff" />
      <circle cx="56.5" cy="29" r="1.8" fill="#fff" />
      <path d="M50 45 L50 50" stroke={OL} strokeWidth={2.2} />
      <circle cx="50" cy="51" r="1.8" fill={OL} />
    </g>
  );
}

function Toad() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 82 Q12 52 32 42 Q50 34 68 42 Q88 52 84 82 Q50 94 16 82 Z" fill="#6f9a3c" stroke={OL} strokeWidth={SW} />
      <path d="M19 76 Q50 90 81 76 Q80 85 50 89 Q20 85 19 76 Z" fill="#557a2c" />
      <ellipse cx="50" cy="74" rx="21" ry="12" fill="#e1d892" stroke={OL} strokeWidth={1.6} />
      <path d="M36 72 Q50 76 64 72" stroke="#bdb26a" strokeWidth={1.4} fill="none" />
      <g fill="#557a2c" stroke="#3f5d20" strokeWidth={0.8}>
        <circle cx="27" cy="57" r="2.8" />
        <circle cx="73" cy="59" r="3.1" />
        <circle cx="36" cy="49" r="2" />
        <circle cx="65" cy="48" r="2.2" />
        <circle cx="23" cy="69" r="2.3" />
        <circle cx="78" cy="70" r="2.5" />
        <circle cx="59" cy="53" r="1.6" />
      </g>
      <circle cx="35" cy="40" r="11" fill="#78a644" stroke={OL} strokeWidth={SW} />
      <circle cx="65" cy="40" r="11" fill="#78a644" stroke={OL} strokeWidth={SW} />
      {[35, 65].map((x) => (
        <g key={x}>
          <circle cx={x} cy={39} r={7} fill="#e0a92e" stroke={OL} strokeWidth={1.6} />
          <ellipse cx={x + 0.5} cy={39.5} rx={4} ry={1.9} fill="#120c0a" />
          <circle cx={x - 2} cy={37} r={1.3} fill="#fff" />
        </g>
      ))}
      <path d="M30 32 Q35 29 40 32 M60 32 Q65 29 70 32" stroke={OL} strokeWidth={1.8} fill="none" />
      <circle cx="46" cy="51" r="1.2" fill={OL} />
      <circle cx="54" cy="51" r="1.2" fill={OL} />
      <path d="M27 57 Q50 69 73 57" stroke={OL} strokeWidth={2.4} fill="none" />
      <path d="M27 57 Q25 55 26 53 M73 57 Q75 55 74 53" stroke={OL} strokeWidth={1.6} fill="none" />
      <ellipse cx="30" cy="87" rx="8" ry="3.6" fill="#78a644" stroke={OL} strokeWidth={1.8} />
      <ellipse cx="70" cy="87" rx="8" ry="3.6" fill="#78a644" stroke={OL} strokeWidth={1.8} />
    </g>
  );
}

function Rat() {
  const fur = '#8f8b95';
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M76 72 Q97 76 93 89 Q89 98 74 94" fill="none" stroke={OL} strokeWidth={6.4} />
      <path d="M76 72 Q97 76 93 89 Q89 98 74 94" fill="none" stroke="#e7a1ad" strokeWidth={3.4} />
      <ellipse cx="57" cy="66" rx="26" ry="19" fill={fur} stroke={OL} strokeWidth={SW} />
      <ellipse cx="54" cy="73" rx="16" ry="9" fill="#bab6c0" />
      <path d="M64 52 Q70 50 74 54 M70 58 Q76 57 79 61" stroke="#6f6b76" strokeWidth={1.6} fill="none" />
      <circle cx="47" cy="36" r="9" fill={fur} stroke={OL} strokeWidth={SW} />
      <circle cx="47" cy="36" r="5" fill="#e7a1ad" />
      <path d="M50 44 Q45 35 34 39 Q20 44 9 56 Q22 65 38 62 Q51 58 50 44 Z" fill="#9a96a0" stroke={OL} strokeWidth={SW} />
      <circle cx="37" cy="35" r="9.5" fill={fur} stroke={OL} strokeWidth={SW} />
      <circle cx="37" cy="35" r="5.4" fill="#e7a1ad" />
      <Eye x={31} y={48} r={4.6} px={-0.8} />
      <circle cx="9" cy="56" r="3.2" fill="#e7a1ad" stroke={OL} strokeWidth={1.4} />
      <path d="M13 55 L1 50 M13 57 L1 58 M14 59 L3 65" stroke={OL} strokeWidth={1} opacity={0.8} />
      <rect x="14.5" y="59.5" width="3" height="4" rx="0.6" fill="#fff" stroke={OL} strokeWidth={0.8} />
      <ellipse cx="40" cy="85" rx="5.5" ry="2.8" fill="#e7a1ad" stroke={OL} strokeWidth={1.4} />
      <ellipse cx="68" cy="85" rx="5.5" ry="2.8" fill="#e7a1ad" stroke={OL} strokeWidth={1.4} />
    </g>
  );
}

function Scorpion() {
  const shell = '#d0742c';
  const legs = [
    'M42 58 L30 54 L24 60',
    'M42 64 L28 64 L22 72',
    'M43 70 L30 76 L26 86',
    'M45 75 L36 84 L34 94',
    'M58 58 L70 54 L76 60',
    'M58 64 L72 64 L78 72',
    'M57 70 L70 76 L74 86',
    'M55 75 L64 84 L66 94',
  ];
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {legs.map((d) => (
        <Leg key={d} d={d} core="#9c4f19" w={3} />
      ))}
      <Leg d="M42 50 Q30 46 26 36" core={shell} w={5} />
      <Leg d="M58 50 Q70 46 74 36" core={shell} w={5} />
      <path d="M26 36 Q13 33 15 19 Q21 24 26 22 Q22 30 30 34 Z" fill={shell} stroke={OL} strokeWidth={SW} />
      <path d="M26 22 Q31 13 23 9 Q18 15 21 22 Z" fill={shell} stroke={OL} strokeWidth={SW} />
      <path d="M74 36 Q87 33 85 19 Q79 24 74 22 Q78 30 70 34 Z" fill={shell} stroke={OL} strokeWidth={SW} />
      <path d="M74 22 Q69 13 77 9 Q82 15 79 22 Z" fill={shell} stroke={OL} strokeWidth={SW} />
      <ellipse cx="50" cy="64" rx="13" ry="17" fill={shell} stroke={OL} strokeWidth={SW} />
      <path d="M38 60 Q50 64 62 60 M38 68 Q50 72 62 68 M40 75 Q50 79 60 75" stroke="#9c4f19" strokeWidth={1.6} fill="none" />
      <path d="M44 52 Q42 62 45 74" stroke="#f3b46e" strokeWidth={2.2} fill="none" opacity={0.7} />
      {[
        [52, 83, 6],
        [62, 87, 5.6],
        [72, 83, 5.2],
        [78, 73, 5],
        [79, 62, 4.7],
        [75, 52, 4.4],
      ].map(([x, y, r]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={r} fill={shell} stroke={OL} strokeWidth={2.2} />
          <circle cx={x! - r! * 0.3} cy={y! - r! * 0.35} r={r! * 0.28} fill="#f7c48a" opacity={0.8} />
        </g>
      ))}
      <path d="M73 47 Q72 38 65 35 Q70 42 67.5 46 Z" fill="#5a2a10" stroke={OL} strokeWidth={1.8} />
      <circle cx="64" cy="35" r="1.6" fill="#8ad04a" />
      <ellipse cx="50" cy="47" rx="10" ry="7" fill="#b85f22" stroke={OL} strokeWidth={SW} />
      <Eye x={46} y={46} r={3.8} />
      <Eye x={54} y={46} r={3.8} />
    </g>
  );
}

function Spider() {
  const legs = [
    'M44 42 L28 28 L17 37',
    'M43 46 L23 41 L10 52',
    'M43 50 L25 56 L15 69',
    'M45 54 L32 67 L26 84',
    'M56 42 L72 28 L83 37',
    'M57 46 L77 41 L90 52',
    'M57 50 L75 56 L85 69',
    'M55 54 L68 67 L74 84',
  ];
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 0 L50 34" stroke="#e8e2f2" strokeWidth={1} opacity={0.75} />
      {legs.map((d) => (
        <Leg key={d} d={d} core="#4a3c5c" w={4.4} />
      ))}
      <circle cx="50" cy="67" r="19" fill="#2e2440" stroke={OL} strokeWidth={SW} />
      <path d="M46 59 L54 59 L50 67 L54 75 L46 75 L50 67 Z" fill="#c0262d" stroke={OL} strokeWidth={1} />
      <path d="M38 58 Q40 52 46 50" stroke="#7e6c99" strokeWidth={2.4} fill="none" opacity={0.75} />
      <ellipse cx="50" cy="44" rx="12" ry="10" fill="#3b2f4a" stroke={OL} strokeWidth={SW} />
      <Eye x={45} y={41} r={4.4} iris="#c0262d" />
      <Eye x={55} y={41} r={4.4} iris="#c0262d" />
      <g fill="#c0262d" stroke={OL} strokeWidth={0.6}>
        <circle cx="41" cy="47" r="1.6" />
        <circle cx="59" cy="47" r="1.6" />
        <circle cx="46.5" cy="35.5" r="1.4" />
        <circle cx="53.5" cy="35.5" r="1.4" />
      </g>
      <path d="M46.5 51 Q45.5 56 48.5 57.5 L48 52 Z M53.5 51 Q54.5 56 51.5 57.5 L52 52 Z" fill="#f3ead8" stroke={OL} strokeWidth={1} />
    </g>
  );
}

function StinkBug() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <g fill="#c3cc52" opacity={0.5}>
        <circle cx="14" cy="88" r="6" />
        <circle cx="22" cy="93" r="5" />
        <circle cx="8" cy="80" r="4" />
        <circle cx="86" cy="88" r="6" />
        <circle cx="78" cy="93" r="5" />
        <circle cx="92" cy="80" r="4" />
      </g>
      <path d="M17 72 q-4 -4 0 -8 q4 -4 0 -8 M83 72 q4 -4 0 -8 q-4 -4 0 -8 M12 62 q-3 -3 0 -6" stroke="#9fb03a" strokeWidth={2} fill="none" opacity={0.85} />
      {['M30 50 L18 46 L12 38', 'M28 62 L15 64 L9 72', 'M32 74 L22 84 L19 94', 'M70 50 L82 46 L88 38', 'M72 62 L85 64 L91 72', 'M68 74 L78 84 L81 94'].map((d) => (
        <Leg key={d} d={d} core="#4c6820" w={3} />
      ))}
      <path d="M45 24 L38 14 L33 5 M55 24 L62 14 L67 5" stroke={OL} strokeWidth={2.2} fill="none" />
      <circle cx="38" cy="14" r="1.6" fill={OL} />
      <circle cx="62" cy="14" r="1.6" fill={OL} />
      <path d="M50 30 L74 38 Q82 58 68 82 Q50 92 32 82 Q18 58 26 38 Z" fill="#6e8f2d" stroke={OL} strokeWidth={SW} />
      <path d="M24 38 L76 38 Q73 47 50 49 Q27 47 24 38 Z" fill="#5a7824" stroke={OL} strokeWidth={1.8} />
      <path d="M38 49 L62 49 L50 75 Z" fill="#8aab3a" stroke={OL} strokeWidth={1.6} />
      <path d="M40 81 Q50 88 60 81" stroke={OL} strokeWidth={1.4} fill="none" />
      <g fill="#dde284">
        <circle cx="32" cy="58" r="1.8" />
        <circle cx="68" cy="58" r="1.8" />
        <circle cx="34" cy="68" r="1.6" />
        <circle cx="66" cy="68" r="1.6" />
      </g>
      <path d="M30 44 Q34 41 40 42" stroke="#9fc04a" strokeWidth={1.8} fill="none" />
      <path d="M43 24 L57 24 L60 33 L40 33 Z" fill="#4c6820" stroke={OL} strokeWidth={SW} />
      <Eye x={41} y={28} r={3.8} px={-0.6} />
      <Eye x={59} y={28} r={3.8} px={0.6} />
    </g>
  );
}

const ART: Record<Creature, () => ReactNode> = {
  rat: Rat,
  fly: Fly,
  spider: Spider,
  cockroach: Cockroach,
  toad: Toad,
  bat: Bat,
  scorpion: Scorpion,
  stinkbug: StinkBug,
};

// ---------------------------------------------------------------------------
// Shared defs
// ---------------------------------------------------------------------------

type Ids = ReturnType<typeof useSvgIds>;
const DefsCtx = createContext<Ids | null>(null);

function DefsBody({ id }: { id: Ids }) {
  return (
    <>
      {CREATURES.map((c) => {
        const Art = ART[c];
        const [light, dark] = CREATURE_COLORS[c];
        return (
          <g key={c}>
            <symbol id={id(`art-${c}`)} viewBox="0 0 100 100">
              <Art />
            </symbol>
            <radialGradient id={id(`bg-${c}`)} cx="50%" cy="38%" r="75%">
              <stop offset="0%" stopColor={light} />
              <stop offset="100%" stopColor={dark} />
            </radialGradient>
          </g>
        );
      })}
      <pattern id={id('dots')} width="4" height="4" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.75" fill="#000" opacity="0.22" />
      </pattern>
      <pattern id={id('backDots')} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
        <rect width="5" height="5" fill="#241a2e" />
        <circle cx="2.5" cy="2.5" r="1" fill="#3d2f4d" />
      </pattern>
      <linearGradient id={id('bone')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f6ead0" />
        <stop offset="100%" stopColor="#c9b48a" />
      </linearGradient>
    </>
  );
}

export function CreatureDefs({ children }: { children: ReactNode }) {
  const id = useSvgIds();
  return (
    <DefsCtx.Provider value={id}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
        <defs>
          <DefsBody id={id} />
        </defs>
      </svg>
      {children}
    </DefsCtx.Provider>
  );
}

function useIds(): Ids {
  const ctx = useContext(DefsCtx);
  if (!ctx) throw new Error('Cockroach Poker art must be inside <CreatureDefs>');
  return ctx;
}

// ---------------------------------------------------------------------------
// Cards & icons
// ---------------------------------------------------------------------------

const CW = 70;
const CH = 98;
// Gothic pointed-arch panel.
const ARCH = 'M5 24 Q5 9 35 5 Q65 9 65 24 L65 93 L5 93 Z';

export function CreatureCard({
  creature,
  width = 70,
  className,
}: {
  creature: Creature;
  width?: number;
  className?: string;
}) {
  const id = useIds();
  const [, dark] = CREATURE_COLORS[creature];
  return (
    <svg
      viewBox={`0 0 ${CW} ${CH}`}
      width={width}
      height={(width * CH) / CW}
      className={className}
      role="img"
      aria-label={CREATURE_LABEL[creature]}
    >
      <rect x="0.5" y="0.5" width={CW - 1} height={CH - 1} rx="6" fill="#1e1512" stroke="#0b0706" />
      <path d={ARCH} fill={id.url(`bg-${creature}`)} />
      <path d={ARCH} fill={id.url('dots')} />
      <path d="M8 25 Q8 12 35 8.5 Q62 12 62 25 L62 90 L8 90 Z" fill="none" stroke={id.url('bone')} strokeWidth="0.8" opacity="0.8" />
      {/* corner flourishes */}
      <path d="M3 3 Q10 3 10 10 M67 3 Q60 3 60 10 M3 95 Q10 95 10 88 M67 95 Q60 95 60 88" stroke="#c9b48a" strokeWidth="0.9" fill="none" />
      <use href={`#${id(`art-${creature}`)}`} x="8" y="14" width="54" height="54" />
      {/* name ribbon */}
      <path d="M2 74 L10 72 L60 72 L68 74 L64 80 L68 86 L60 84 L10 84 L2 86 L6 80 Z" fill={dark} stroke="#0b0706" strokeWidth="0.8" />
      <path d="M10 72 L60 72 L60 84 L10 84 Z" fill="#1e1512" opacity="0.35" />
      <text x="35" y="81.6" textAnchor="middle" fontSize="8.6" fill="#f6ead0" style={{ fontFamily: 'var(--font-rogue)' }} letterSpacing="0.3">
        {CREATURE_LABEL[creature]}
      </text>
      <use href={`#${id(`art-${creature}`)}`} x="3.5" y="3" width="11" height="11" />
    </svg>
  );
}

/** Face-down card: dotted violet field, bone frame, a cockroach crest. */
export function CardBack({ width = 70, className, label }: { width?: number; className?: string; label?: string }) {
  const id = useIds();
  return (
    <svg
      viewBox={`0 0 ${CW} ${CH}`}
      width={width}
      height={(width * CH) / CW}
      className={className}
      role="img"
      aria-label={label ?? 'face-down card'}
    >
      <rect x="0.5" y="0.5" width={CW - 1} height={CH - 1} rx="6" fill="#1e1512" stroke="#0b0706" />
      <path d={ARCH} fill={id.url('backDots')} />
      <path d="M8 25 Q8 12 35 8.5 Q62 12 62 25 L62 90 L8 90 Z" fill="none" stroke={id.url('bone')} strokeWidth="1" />
      <circle cx="35" cy="52" r="19" fill="#120c16" stroke={id.url('bone')} strokeWidth="1.2" />
      <circle cx="35" cy="52" r="15.5" fill="none" stroke="#c9b48a" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
      <g opacity="0.9" style={{ filter: 'grayscale(1) brightness(1.6)' }}>
        <use href={`#${id('art-cockroach')}`} x="22" y="39" width="26" height="26" />
      </g>
      <path d="M3 3 Q10 3 10 10 M67 3 Q60 3 60 10 M3 95 Q10 95 10 88 M67 95 Q60 95 60 88" stroke="#c9b48a" strokeWidth="0.9" fill="none" />
    </svg>
  );
}

/** Just the creature (for buttons, rows, speech bubbles). */
export function CreatureIcon({ creature, size = 28, className }: { creature: Creature; size?: number; className?: string }) {
  const id = useIds();
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      <use href={`#${id(`art-${creature}`)}`} width="100" height="100" />
    </svg>
  );
}
