import type { CoupCharacter } from '../state';

// ============================================================================
// Coup portraits — drawn into the arched window of the card frame
// (CharacterArt.tsx). Window box: x 18..102, y 14..120 (clipped).
//
// Classic five get full painted busts in a shared "gilded court" style:
// lit from the upper left, warm skin ramp, jewel-toned costume, a backdrop
// that tells the role (the Duke's sunburst, the Assassin's blood moon, the
// Captain's storm at sea, the Ambassador's globe, the Contessa's damask).
// Every other character gets a heraldic medallion built from its emblem.
//
// Shared gradients (`gold`, `skin`, `silver`) are declared by the frame; each
// portrait declares its own extra defs with ids from the frame's useSvgIds.
// ============================================================================

export type SvgIds = ((name: string) => string) & { url: (name: string) => string };

export interface PortraitPalette {
  bg0: string;
  bg1: string;
  ink: string;
}

export function Portrait({ character, id, palette }: { character: CoupCharacter; id: SvgIds; palette: PortraitPalette }) {
  switch (character) {
    case 'duke':
      return <Duke id={id} />;
    case 'assassin':
      return <Assassin id={id} />;
    case 'captain':
      return <Captain id={id} />;
    case 'ambassador':
      return <Ambassador id={id} />;
    case 'contessa':
      return <Contessa id={id} />;
    default:
      return <Medallion character={character} id={id} palette={palette} />;
  }
}

// --------------------------------------------------------------------------
// Shared bits
// --------------------------------------------------------------------------

function Face({ id, cx = 60, cy = 64, rx = 13.5, ry = 16.5 }: { id: SvgIds; cx?: number; cy?: number; rx?: number; ry?: number }) {
  return (
    <g>
      <ellipse cx={cx - rx + 0.6} cy={cy + 1} rx={2.6} ry={4.2} fill={id.url('skin')} />
      <ellipse cx={cx + rx - 0.6} cy={cy + 1} rx={2.6} ry={4.2} fill={id.url('skin')} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={id.url('skin')} />
      {/* jaw shadow + cheek warmth */}
      <ellipse cx={cx + 3} cy={cy + 7} rx={rx - 3} ry={ry - 8} fill="#7a3f22" opacity={0.18} />
      <ellipse cx={cx - 6} cy={cy + 4} rx={3.4} ry={2.4} fill="#d9735a" opacity={0.25} />
      <ellipse cx={cx + 6} cy={cy + 4} rx={3.4} ry={2.4} fill="#d9735a" opacity={0.2} />
    </g>
  );
}

function Eyes({ cx = 60, cy = 62, gap = 5.6, color = '#24160c', brow = '#4a3424', browTilt = 0 }: {
  cx?: number;
  cy?: number;
  gap?: number;
  color?: string;
  brow?: string;
  browTilt?: number;
}) {
  return (
    <g>
      <ellipse cx={cx - gap} cy={cy} rx={2.4} ry={1.3} fill="#f6efe4" />
      <ellipse cx={cx + gap} cy={cy} rx={2.4} ry={1.3} fill="#f6efe4" />
      <circle cx={cx - gap + 0.3} cy={cy} r={1.05} fill={color} />
      <circle cx={cx + gap + 0.3} cy={cy} r={1.05} fill={color} />
      <path d={`M${cx - gap - 2.8} ${cy - 0.4} Q${cx - gap} ${cy - 2.1} ${cx - gap + 2.8} ${cy - 0.4}`} stroke={color} strokeWidth={0.8} fill="none" />
      <path d={`M${cx + gap - 2.8} ${cy - 0.4} Q${cx + gap} ${cy - 2.1} ${cx + gap + 2.8} ${cy - 0.4}`} stroke={color} strokeWidth={0.8} fill="none" />
      <path d={`M${cx - gap - 3.4} ${cy - 3.6 + browTilt} L${cx - gap + 3} ${cy - 3.4 - browTilt}`} stroke={brow} strokeWidth={1.4} strokeLinecap="round" />
      <path d={`M${cx + gap - 3} ${cy - 3.4 - browTilt} L${cx + gap + 3.4} ${cy - 3.6 + browTilt}`} stroke={brow} strokeWidth={1.4} strokeLinecap="round" />
    </g>
  );
}

function Nose({ cx = 60, cy = 62 }: { cx?: number; cy?: number }) {
  return (
    <path
      d={`M${cx + 0.4} ${cy + 0.5} L${cx - 1.4} ${cy + 7} Q${cx + 0.2} ${cy + 8.4} ${cx + 2.2} ${cy + 7.4}`}
      stroke="#8f553a"
      strokeWidth={0.9}
      fill="none"
      strokeLinecap="round"
    />
  );
}

function Rays({ color, opacity = 0.22, cx = 60, cy = 60 }: { color: string; opacity?: number; cx?: number; cy?: number }) {
  const lines = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    return `M${cx} ${cy} L${(cx + Math.cos(a) * 90).toFixed(1)} ${(cy + Math.sin(a) * 90).toFixed(1)}`;
  }).join(' ');
  return <path d={lines} stroke={color} strokeWidth={3.2} opacity={opacity} />;
}

// --------------------------------------------------------------------------
// The Duke — sunburst throne room, ermine mantle, crown, sceptre.
// --------------------------------------------------------------------------

function Duke({ id }: { id: SvgIds }) {
  return (
    <g>
      <defs>
        <radialGradient id={id('dukeBg')} cx="50%" cy="38%" r="70%">
          <stop offset="0" stopColor="#8a55b0" />
          <stop offset="0.55" stopColor="#3f1d5e" />
          <stop offset="1" stopColor="#1a0a2a" />
        </radialGradient>
        <linearGradient id={id('dukeRobe')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b3263d" />
          <stop offset="0.6" stopColor="#6e0f22" />
          <stop offset="1" stopColor="#3a0612" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={120} height={130} fill={id.url('dukeBg')} />
      <Rays color="#f3d27a" opacity={0.16} cy={56} />
      {/* throne back */}
      <path d="M30 120 L30 52 Q30 36 44 32 L76 32 Q90 36 90 52 L90 120 Z" fill="#2a1240" opacity={0.7} />
      <path d="M30 52 Q30 36 44 32 L76 32 Q90 36 90 52" stroke={id.url('gold')} strokeWidth={1.6} fill="none" opacity={0.8} />
      {/* mantle */}
      <path d="M12 126 C16 102 28 92 44 88 L60 98 L76 88 C92 92 104 102 108 126 Z" fill={id.url('dukeRobe')} />
      <path d="M44 88 L60 98 L76 88" stroke="#f3d27a" strokeWidth={0.8} fill="none" opacity={0.6} />
      {/* ermine collar */}
      <path d="M28 96 C38 86 50 86 60 98 C70 86 82 86 92 96 C88 106 76 108 60 108 C44 108 32 106 28 96 Z" fill="#f4efe6" />
      {[[36, 98], [44, 102], [52, 100], [68, 100], [76, 102], [84, 98], [60, 105]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y! - 2} l1 2 l-1 1.6 l-1 -1.6 Z`} fill="#1a1410" />
      ))}
      {/* chain of office */}
      <path d="M42 100 Q60 120 78 100" stroke={id.url('gold')} strokeWidth={2.4} fill="none" strokeDasharray="2.4 1.2" />
      <circle cx={60} cy={112} r={4.6} fill={id.url('gold')} stroke="#5a3a0a" strokeWidth={0.7} />
      <circle cx={60} cy={112} r={1.8} fill="#a3122f" />
      {/* neck + head */}
      <path d="M53 78 L53 92 Q60 96 67 92 L67 78 Z" fill={id.url('skin')} />
      <path d="M53 86 Q60 90 67 86 L67 92 Q60 96 53 92 Z" fill="#7a3f22" opacity={0.25} />
      <Face id={id} cy={63} />
      {/* silver hair at temples */}
      <path d="M46.5 62 Q44 50 50 45 L51.5 58 Z" fill="#c9c2b6" />
      <path d="M73.5 62 Q76 50 70 45 L68.5 58 Z" fill="#b5ad9f" />
      <Eyes cy={61} brow="#8d857a" browTilt={0.8} />
      <Nose cy={61} />
      {/* beard + moustache */}
      <path d="M47 68 Q48 86 60 92 Q72 86 73 68 Q68 77 60 77 Q52 77 47 68 Z" fill="#a39a8e" />
      <path d="M50 74 Q60 88 70 74 Q66 82 60 83 Q54 82 50 74 Z" fill="#7d756b" opacity={0.6} />
      <path d="M51.5 72.5 Q56 69.2 60 71.2 Q64 69.2 68.5 72.5 Q64 74.6 60 73.2 Q56 74.6 51.5 72.5 Z" fill="#6f675d" />
      {/* crown */}
      <path d="M44.5 50 L44.5 37 L50.5 43.5 L55 32.5 L60 41 L65 32.5 L69.5 43.5 L75.5 37 L75.5 50 Z" fill={id.url('gold')} stroke="#5a3a0a" strokeWidth={0.8} />
      <rect x={43.5} y={47.5} width={33} height={5.4} rx={1.2} fill={id.url('gold')} stroke="#5a3a0a" strokeWidth={0.8} />
      <circle cx={60} cy={50.2} r={1.9} fill="#c0142f" />
      <circle cx={51} cy={50.2} r={1.4} fill="#2f62c9" />
      <circle cx={69} cy={50.2} r={1.4} fill="#2f62c9" />
      {[[44.5, 37], [55, 32.5], [65, 32.5], [75.5, 37]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.5} fill="#fff6dc" />
      ))}
      {/* sceptre */}
      <g transform="rotate(14 92 90)">
        <rect x={90.5} y={56} width={3} height={66} rx={1} fill={id.url('gold')} stroke="#5a3a0a" strokeWidth={0.5} />
        <circle cx={92} cy={53} r={5} fill={id.url('gold')} stroke="#5a3a0a" strokeWidth={0.6} />
        <path d="M92 44 L92 49 M89.6 46.4 L94.4 46.4" stroke={id.url('gold')} strokeWidth={1.6} />
      </g>
      {/* gloved hand on sceptre */}
      <ellipse cx={95} cy={104} rx={5} ry={4} fill="#5b1a7a" />
    </g>
  );
}

// --------------------------------------------------------------------------
// The Assassin — hooded, masked, eyes catching the blood moon, dagger raised.
// --------------------------------------------------------------------------

function Assassin({ id }: { id: SvgIds }) {
  return (
    <g>
      <defs>
        <radialGradient id={id('asBg')} cx="70%" cy="22%" r="85%">
          <stop offset="0" stopColor="#7a1622" />
          <stop offset="0.5" stopColor="#2c0709" />
          <stop offset="1" stopColor="#0b0204" />
        </radialGradient>
        <linearGradient id={id('asCloak')} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#40363e" />
          <stop offset="1" stopColor="#0c080a" />
        </linearGradient>
        <linearGradient id={id('asHood')} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#4d424a" />
          <stop offset="0.6" stopColor="#1e161b" />
          <stop offset="1" stopColor="#0b0709" />
        </linearGradient>
        <filter id={id('asGlow')} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation={1.2} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x={0} y={0} width={120} height={130} fill={id.url('asBg')} />
      {/* blood moon */}
      <circle cx={86} cy={30} r={11} fill="#e6b9a0" opacity={0.85} />
      <circle cx={90} cy={27} r={10} fill="#3a0a0e" opacity={0.92} />
      {/* rooftop smoke */}
      <path d="M10 92 Q30 80 44 88 T80 84 T112 90" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={6} fill="none" />
      {/* cloak */}
      <path d="M10 126 C14 98 28 86 40 82 L60 94 L80 82 C92 86 106 98 110 126 Z" fill={id.url('asCloak')} />
      <path d="M40 82 L60 94 L80 82" stroke="#7a1622" strokeWidth={1.2} fill="none" opacity={0.8} />
      {/* hood */}
      <path d="M35 94 C28 68 32 36 60 29 C88 36 92 68 85 94 C79 85 72 80 60 80 C48 80 41 85 35 94 Z" fill={id.url('asHood')} />
      <path d="M38 88 C33 66 37 40 60 33" stroke="#ffffff" strokeOpacity={0.09} strokeWidth={1.2} fill="none" />
      {/* face in shadow */}
      <ellipse cx={60} cy={62} rx={13.5} ry={16} fill="#060304" />
      <ellipse cx={60} cy={70} rx={9} ry={7} fill="#2a1a14" opacity={0.6} />
      {/* crimson mask */}
      <path d="M46.5 64 Q60 69 73.5 64 L71.5 77 Q60 84 48.5 77 Z" fill="#6d1019" />
      <path d="M46.5 64 Q60 69 73.5 64" stroke="#a3202c" strokeWidth={0.8} fill="none" />
      {/* eyes */}
      <g filter={id.url('asGlow')}>
        <path d="M49.5 58 L57.5 59.6 L50.5 61 Z" fill="#ffb347" />
        <path d="M70.5 58 L62.5 59.6 L69.5 61 Z" fill="#ffb347" />
      </g>
      {/* dagger */}
      <g transform="rotate(-24 30 92)">
        <path d="M28 96 L31.5 46 L35 96 Z" fill={id.url('silver')} stroke="#2a2a30" strokeWidth={0.5} />
        <path d="M31.5 50 L31.5 94" stroke="#ffffff" strokeOpacity={0.6} strokeWidth={0.5} />
        <rect x={23} y={95} width={17} height={3.4} rx={1.4} fill={id.url('gold')} stroke="#4a300a" strokeWidth={0.5} />
        <rect x={29.6} y={98} width={3.8} height={12} rx={1} fill="#1b1012" />
        <circle cx={31.5} cy={112} r={2.6} fill="#b0142a" stroke={id.url('gold')} strokeWidth={0.8} />
      </g>
      {/* gloved hand */}
      <ellipse cx={34} cy={104} rx={6} ry={5} fill="#141012" />
    </g>
  );
}

// --------------------------------------------------------------------------
// The Captain — tricorn, epaulettes, storm-tossed ship behind.
// --------------------------------------------------------------------------

function Captain({ id }: { id: SvgIds }) {
  return (
    <g>
      <defs>
        <linearGradient id={id('capSky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3d6487" />
          <stop offset="0.55" stopColor="#1a3350" />
          <stop offset="1" stopColor="#0a1626" />
        </linearGradient>
        <linearGradient id={id('capCoat')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a4680" />
          <stop offset="0.6" stopColor="#14244a" />
          <stop offset="1" stopColor="#0a1229" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={120} height={130} fill={id.url('capSky')} />
      {/* lightning glow */}
      <ellipse cx={30} cy={24} rx={30} ry={16} fill="#9cc3e6" opacity={0.15} />
      {/* distant ship */}
      <g fill="#081322" opacity={0.85}>
        <path d="M78 74 L104 74 L100 80 L82 80 Z" />
        <rect x={90.5} y={40} width={1.4} height={34} />
        <path d="M91.9 44 Q100 52 91.9 62 Z" />
        <path d="M90.5 46 Q83 54 90.5 66 Z" />
        <rect x={84} y={52} width={1} height={22} />
        <path d="M85 55 Q90 60 85 68 Z" />
      </g>
      {/* sea */}
      <path d="M0 82 Q12 76 24 82 T48 82 T72 82 T96 82 T120 82 L120 130 L0 130 Z" fill="#0f2a44" />
      <path d="M0 86 Q12 80 24 86 T48 86 T72 86 T96 86 T120 86" stroke="#9cc3e6" strokeOpacity={0.25} strokeWidth={1} fill="none" />
      {/* coat */}
      <path d="M12 126 C16 100 28 90 42 86 L60 98 L78 86 C92 90 104 100 108 126 Z" fill={id.url('capCoat')} />
      {/* shirt + cravat */}
      <path d="M50 88 L60 110 L70 88 Z" fill="#efe4cc" />
      <path d="M56 90 Q60 96 64 90 L62 100 Q60 103 58 100 Z" fill="#f8f2e4" stroke="#c9b993" strokeWidth={0.5} />
      {/* lapels */}
      <path d="M42 86 L50 88 L58 116 L48 120 Z" fill="#1a2c5c" stroke={id.url('gold')} strokeWidth={0.9} />
      <path d="M78 86 L70 88 L62 116 L72 120 Z" fill="#1a2c5c" stroke={id.url('gold')} strokeWidth={0.9} />
      {[100, 107, 114].map((y) => (
        <g key={y}>
          <circle cx={46} cy={y} r={1.4} fill={id.url('gold')} />
          <circle cx={74} cy={y} r={1.4} fill={id.url('gold')} />
        </g>
      ))}
      {/* epaulettes */}
      {[30, 90].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={93} rx={11} ry={4.2} fill={id.url('gold')} stroke="#5a3a0a" strokeWidth={0.6} />
          <path d={`M${x - 9} 96 L${x - 9} 102 M${x - 5} 97 L${x - 5} 103 M${x - 1} 97 L${x - 1} 103 M${x + 3} 97 L${x + 3} 103 M${x + 7} 96 L${x + 7} 102`} stroke="#d9b45a" strokeWidth={1.2} />
        </g>
      ))}
      {/* neck + head */}
      <path d="M53.5 78 L53.5 92 Q60 95 66.5 92 L66.5 78 Z" fill={id.url('skin')} />
      {/* tied hair */}
      <path d="M72 58 Q80 66 76 80 Q74 70 70 66 Z" fill="#3b2617" />
      <Face id={id} cy={64} />
      {/* stubble + moustache */}
      <path d="M48 70 Q50 82 60 84 Q70 82 72 70 Q66 78 60 78 Q54 78 48 70 Z" fill="#3b2617" opacity={0.32} />
      <path d="M52.5 73 Q56 70.6 60 72 Q64 70.6 67.5 73 Q64 74.8 60 73.8 Q56 74.8 52.5 73 Z" fill="#4a2f1b" />
      <Eyes cy={62} brow="#3b2617" browTilt={-0.6} />
      <Nose cy={62} />
      {/* scar */}
      <path d="M67.5 56 L70.5 66" stroke="#a5583f" strokeWidth={0.9} strokeLinecap="round" />
      {/* tricorn */}
      <path d="M46 50 Q47 30 60 29 Q73 30 74 50 Z" fill="#17110d" />
      <path d="M33 52 Q60 30 87 52 Q78 46 60 46 Q42 46 33 52 Z" fill="#100b08" stroke={id.url('gold')} strokeWidth={1.2} />
      <circle cx={60} cy={44} r={3} fill="#c41e3a" stroke="#f4ead2" strokeWidth={0.9} />
      {/* cutlass hilt */}
      <path d="M96 108 Q104 100 100 92" stroke={id.url('gold')} strokeWidth={2.4} fill="none" />
      <rect x={94} y={104} width={4} height={18} rx={1.2} fill="#2a1a10" transform="rotate(-18 96 112)" />
    </g>
  );
}

// --------------------------------------------------------------------------
// The Ambassador — emerald robe, red sash and star, sealed treaty in hand.
// --------------------------------------------------------------------------

function Ambassador({ id }: { id: SvgIds }) {
  return (
    <g>
      <defs>
        <radialGradient id={id('ambBg')} cx="50%" cy="40%" r="75%">
          <stop offset="0" stopColor="#2f8569" />
          <stop offset="0.55" stopColor="#123f32" />
          <stop offset="1" stopColor="#061a14" />
        </radialGradient>
        <linearGradient id={id('ambRobe')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a7d5c" />
          <stop offset="0.6" stopColor="#11452f" />
          <stop offset="1" stopColor="#072519" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={120} height={130} fill={id.url('ambBg')} />
      {/* globe */}
      <g stroke="#f3d27a" strokeOpacity={0.2} fill="none" strokeWidth={0.9}>
        <circle cx={60} cy={58} r={38} />
        <ellipse cx={60} cy={58} rx={18} ry={38} />
        <ellipse cx={60} cy={58} rx={32} ry={38} />
        <path d="M22 58 H98 M27 40 H93 M27 76 H93" />
      </g>
      {/* robe */}
      <path d="M12 126 C16 100 28 90 42 86 L60 96 L78 86 C92 90 104 100 108 126 Z" fill={id.url('ambRobe')} />
      <path d="M42 86 Q60 100 78 86" stroke={id.url('gold')} strokeWidth={1.6} fill="none" />
      {/* sash */}
      <path d="M30 94 L40 90 L92 126 L76 126 Z" fill="#a8233a" />
      <path d="M30 94 L40 90 L92 126 M30 94 L76 126" stroke={id.url('gold')} strokeWidth={0.8} fill="none" />
      {/* star of order */}
      <g transform="translate(46 108)">
        <path d="M0 -7 L1.8 -2 L7 -2.2 L3 1 L4.6 6 L0 3 L-4.6 6 L-3 1 L-7 -2.2 L-1.8 -2 Z" fill={id.url('gold')} stroke="#5a3a0a" strokeWidth={0.5} />
        <circle r={1.6} fill="#2f62c9" />
      </g>
      {/* neck + head */}
      <path d="M53.5 78 L53.5 92 Q60 95 66.5 92 L66.5 78 Z" fill={id.url('skin')} />
      <Face id={id} cy={63} rx={13} />
      {/* hair: dark, silver at the temples, neat side part */}
      <path d="M46.5 60 Q45 44 60 42 Q75 44 73.5 60 Q72 50 64 48 Q54 47 49 52 Q47.5 55 46.5 60 Z" fill="#2c2420" />
      <path d="M46.5 60 Q46 54 48 51 L49 58 Z M73.5 60 Q74 54 72 51 L71 58 Z" fill="#a9a196" />
      <Eyes cy={61} brow="#2c2420" />
      {/* spectacles */}
      <g stroke={id.url('gold')} strokeWidth={0.7} fill="none">
        <circle cx={54.4} cy={61} r={3.4} />
        <circle cx={65.6} cy={61} r={3.4} />
        <path d="M57.8 61 Q60 59.8 62.2 61" />
      </g>
      <Nose cy={61} />
      <path d="M55.5 72 Q60 75 64.5 72" stroke="#8f4a36" strokeWidth={0.9} fill="none" strokeLinecap="round" />
      {/* treaty scroll */}
      <g transform="translate(74 106) rotate(-12)">
        <rect x={-16} y={-4} width={30} height={8} rx={2} fill="#f2e6c7" stroke="#b49a63" strokeWidth={0.5} />
        <ellipse cx={-16} cy={0} rx={2.4} ry={4} fill="#e2d2a8" stroke="#b49a63" strokeWidth={0.5} />
        <ellipse cx={14} cy={0} rx={2.4} ry={4} fill="#e2d2a8" stroke="#b49a63" strokeWidth={0.5} />
        <circle cx={0} cy={4.6} r={3.4} fill="#a3122f" />
        <path d="M-1.5 7.6 L-3 12 M1.5 7.6 L3 12" stroke="#a3122f" strokeWidth={1.4} />
      </g>
      <ellipse cx={66} cy={110} rx={5} ry={4} fill={id.url('skin')} />
    </g>
  );
}

// --------------------------------------------------------------------------
// The Contessa — damask salon, crimson gown, pearls, tiara, lace fan.
// --------------------------------------------------------------------------

function Contessa({ id }: { id: SvgIds }) {
  return (
    <g>
      <defs>
        <radialGradient id={id('conBg')} cx="50%" cy="38%" r="75%">
          <stop offset="0" stopColor="#9b2b4b" />
          <stop offset="0.6" stopColor="#4a0d22" />
          <stop offset="1" stopColor="#1f040d" />
        </radialGradient>
        <pattern id={id('damask')} width={14} height={14} patternUnits="userSpaceOnUse">
          <path d="M7 1 Q10 7 7 13 Q4 7 7 1 Z M1 7 Q7 4 13 7 Q7 10 1 7 Z" fill="#f3d27a" opacity={0.08} />
        </pattern>
        <linearGradient id={id('conGown')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c21d3f" />
          <stop offset="0.6" stopColor="#7a0a22" />
          <stop offset="1" stopColor="#3d0410" />
        </linearGradient>
        <linearGradient id={id('conHair')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a3c1c" />
          <stop offset="1" stopColor="#3a160a" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={120} height={130} fill={id.url('conBg')} />
      <rect x={0} y={0} width={120} height={130} fill={id.url('damask')} />
      {/* bare shoulders + neck */}
      <path d="M20 126 C24 104 34 96 46 94 L52 80 L68 80 L74 94 C86 96 96 104 100 126 Z" fill={id.url('skin')} />
      <path d="M52 84 Q60 90 68 84 L68 80 L52 80 Z" fill="#7a3f22" opacity={0.2} />
      {/* gown */}
      <path d="M18 126 C22 112 30 104 40 104 Q60 114 80 104 C90 104 98 112 102 126 Z" fill={id.url('conGown')} />
      <path d="M40 104 Q60 114 80 104" stroke={id.url('gold')} strokeWidth={1.4} fill="none" />
      {/* pearls */}
      {Array.from({ length: 11 }, (_, i) => {
        const t = i / 10;
        const x = 49 + t * 22;
        const y = 92 + Math.sin(t * Math.PI) * 6;
        return <circle key={i} cx={x} cy={y} r={1.25} fill="#fbf6ec" stroke="#cfc4b0" strokeWidth={0.3} />;
      })}
      <path d="M58.6 99 L60 103 L61.4 99 Z" fill="#c0142f" />
      {/* hair back volume */}
      <path d="M44 72 Q38 46 60 38 Q82 46 76 72 Q72 58 60 56 Q48 58 44 72 Z" fill={id.url('conHair')} />
      <Face id={id} cy={64} rx={12.5} ry={15.6} />
      {/* hair front + bun + curls */}
      <path d="M47.5 60 Q47 46 60 44 Q73 46 72.5 60 Q70 50 60 49 Q51 50 47.5 60 Z" fill={id.url('conHair')} />
      <circle cx={60} cy={37} r={8} fill={id.url('conHair')} />
      <path d="M46 66 q-3 5 0 10 M74 66 q3 5 0 10" stroke="#6a2c12" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      {/* tiara */}
      <path d="M50 47 L53 42 L56 45.5 L60 39.5 L64 45.5 L67 42 L70 47 Q60 44.5 50 47 Z" fill={id.url('gold')} stroke="#5a3a0a" strokeWidth={0.5} />
      <circle cx={60} cy={43.6} r={1.5} fill="#5a8cf0" />
      {/* eyes with lashes */}
      <Eyes cy={62} gap={5.2} brow="#5a2410" browTilt={0.4} />
      <path d="M52 60.6 l-1.2 -1.2 M55.6 60 l0 -1.6 M64.4 60 l0 -1.6 M68 60.6 l1.2 -1.2" stroke="#24160c" strokeWidth={0.6} />
      <Nose cy={62} />
      {/* lips */}
      <path d="M56 72.2 Q58 70.8 60 71.8 Q62 70.8 64 72.2 Q60 75.4 56 72.2 Z" fill="#b3122f" />
      {/* lace fan */}
      <g transform="translate(36 120)">
        {Array.from({ length: 9 }, (_, i) => {
          const a = (-150 + i * 12) * (Math.PI / 180);
          const x = Math.cos(a) * 30;
          const y = Math.sin(a) * 30;
          return <path key={i} d={`M0 0 L${x.toFixed(1)} ${y.toFixed(1)}`} stroke="#5a3a0a" strokeWidth={0.6} />;
        })}
        <path
          d={`M0 0 L${(Math.cos((-150 * Math.PI) / 180) * 30).toFixed(1)} ${(Math.sin((-150 * Math.PI) / 180) * 30).toFixed(1)} A30 30 0 0 1 ${(Math.cos((-54 * Math.PI) / 180) * 30).toFixed(1)} ${(Math.sin((-54 * Math.PI) / 180) * 30).toFixed(1)} Z`}
          fill="#f4e9d4"
          opacity={0.9}
          stroke={id.url('gold')}
          strokeWidth={1}
        />
        <path
          d={`M${(Math.cos((-150 * Math.PI) / 180) * 22).toFixed(1)} ${(Math.sin((-150 * Math.PI) / 180) * 22).toFixed(1)} A22 22 0 0 1 ${(Math.cos((-54 * Math.PI) / 180) * 22).toFixed(1)} ${(Math.sin((-54 * Math.PI) / 180) * 22).toFixed(1)}`}
          stroke="#c21d3f"
          strokeWidth={1.2}
          fill="none"
          strokeDasharray="1.5 1.5"
        />
        <circle r={2.4} fill={id.url('gold')} />
      </g>
      <ellipse cx={40} cy={117} rx={5} ry={4} fill={id.url('skin')} />
    </g>
  );
}

// --------------------------------------------------------------------------
// Heraldic medallion for every other character: category backdrop, laurel
// wreath, embossed gold roundel engraved with the character's emblem.
// --------------------------------------------------------------------------

function Medallion({ character, id, palette }: { character: CoupCharacter; id: SvgIds; palette: PortraitPalette }) {
  const leaves = Array.from({ length: 7 }, (_, i) => i);
  return (
    <g>
      <defs>
        <radialGradient id={id('medBg')} cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor={palette.bg0} />
          <stop offset="1" stopColor={palette.bg1} />
        </radialGradient>
        <radialGradient id={id('medFace')} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor={palette.bg0} />
          <stop offset="1" stopColor={palette.ink} />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={120} height={130} fill={id.url('medBg')} />
      <Rays color="#f3d27a" opacity={0.12} cy={64} />
      {/* laurel */}
      {[-1, 1].map((side) => (
        <g key={side}>
          <path
            d={`M60 104 Q${60 + side * 34} 96 ${60 + side * 34} 62`}
            stroke={id.url('gold')}
            strokeWidth={1.2}
            fill="none"
          />
          {leaves.map((i) => {
            const t = i / 6;
            const x = 60 + side * (8 + 26 * Math.sin(t * 1.4));
            const y = 102 - t * 40;
            return (
              <ellipse
                key={i}
                cx={x}
                cy={y}
                rx={2.2}
                ry={5}
                fill={id.url('gold')}
                transform={`rotate(${side * (60 - t * 50)} ${x} ${y})`}
                opacity={0.95}
              />
            );
          })}
        </g>
      ))}
      {/* roundel */}
      <circle cx={60} cy={66} r={28} fill="#00000055" />
      <circle cx={60} cy={64} r={27} fill={id.url('gold')} stroke="#4a300a" strokeWidth={1} />
      <circle cx={60} cy={64} r={23.5} fill="none" stroke="#4a300a" strokeWidth={0.6} strokeDasharray="1.4 1.6" />
      <circle cx={60} cy={64} r={21} fill={id.url('medFace')} stroke="#fff3c4" strokeOpacity={0.5} strokeWidth={0.6} />
      <g transform="translate(26 40.9) scale(0.68)">
        <Glyph character={character} gold={id.url('gold')} dark={palette.ink} rim="#3a2406" />
      </g>
      {/* ribbon */}
      <path d="M38 98 L82 98 L78 104 L82 110 L38 110 L42 104 Z" fill="#7a0f1f" stroke={id.url('gold')} strokeWidth={0.8} />
      <circle cx={60} cy={104} r={2} fill={id.url('gold')} />
    </g>
  );
}

// Emblems drawn on a 100x64 box centred on (50, 34).
function Glyph({ character, gold, dark, rim }: { character: CoupCharacter; gold: string; dark: string; rim: string }) {
  const g = { fill: gold, stroke: rim, strokeWidth: 1.4 } as const;
  const line = { fill: 'none', stroke: gold, strokeWidth: 3.4, strokeLinecap: 'round' as const };
  switch (character) {
    case 'banker':
      return (
        <g {...g}>
          <path d="M22 26 L50 12 L78 26 Z" />
          <rect x={24} y={26} width={52} height={4} />
          {[30, 42, 54, 66].map((x) => (
            <rect key={x} x={x} y={31} width={5} height={18} />
          ))}
          <rect x={20} y={49} width={60} height={5} />
        </g>
      );
    case 'taxCollector':
      return (
        <g {...g}>
          {[46, 39, 32, 25].map((y) => (
            <ellipse key={y} cx={50} cy={y} rx={18} ry={5} />
          ))}
          <ellipse cx={50} cy={18} rx={18} ry={5} />
          <text x={50} y={21} textAnchor="middle" fontSize={8} fontWeight={700} fill={dark} stroke="none">
            ¢
          </text>
        </g>
      );
    case 'assassinG54':
    case 'soldier':
      return (
        <g {...g}>
          <path d="M50 4 L57 38 L50 50 L43 38 Z" />
          <rect x={38} y={38} width={24} height={5} rx={1.5} />
          <rect x={47} y={43} width={6} height={12} fill={dark} />
          <circle cx={50} cy={58} r={3.5} />
          {character === 'soldier' && <path d="M24 56 L76 12" {...line} strokeWidth={3} />}
        </g>
      );
    case 'thief':
      return (
        <g>
          <path d="M28 22 Q50 10 72 22 L72 30 Q50 22 28 30 Z" fill={gold} stroke={rim} strokeWidth={1.2} />
          <ellipse cx={39} cy={26} rx={6} ry={3} fill={dark} />
          <ellipse cx={61} cy={26} rx={6} ry={3} fill={dark} />
          <path d="M34 36 Q50 64 66 36 Q66 56 50 58 Q34 56 34 36 Z" fill={gold} stroke={rim} strokeWidth={1.2} />
          <text x={50} y={52} textAnchor="middle" fontSize={11} fontWeight={700} fill={dark}>
            ¢
          </text>
        </g>
      );
    case 'mercenary':
      return (
        <g>
          <path d="M26 10 L72 54" {...line} />
          <path d="M74 10 L28 54" {...line} />
          <path d="M22 18 L32 8 M78 18 L68 8" stroke={gold} strokeWidth={5} strokeLinecap="round" />
          <circle cx={50} cy={32} r={6} fill={gold} stroke={rim} strokeWidth={1.2} />
        </g>
      );
    case 'spy':
      return (
        <g {...g}>
          <path d="M18 34 Q50 6 82 34 Q50 62 18 34 Z" />
          <circle cx={50} cy={34} r={11} fill={dark} />
          <circle cx={50} cy={34} r={5} fill={gold} stroke="none" />
          <circle cx={53} cy={31} r={2} fill="#fff6dc" stroke="none" />
        </g>
      );
    case 'plantationOwner':
      return (
        <g>
          <path d="M50 10 L50 58" {...line} strokeWidth={3} />
          {[16, 28, 40].map((y) => (
            <g key={y}>
              <ellipse cx={42} cy={y} rx={4.5} ry={9} transform={`rotate(-24 42 ${y})`} fill={gold} stroke={rim} strokeWidth={1} />
              <ellipse cx={58} cy={y} rx={4.5} ry={9} transform={`rotate(24 58 ${y})`} fill={gold} stroke={rim} strokeWidth={1} />
            </g>
          ))}
        </g>
      );
    case 'capitalist':
    case 'financier':
      return (
        <g {...g}>
          <rect x={33} y={6} width={34} height={26} rx={2} />
          <rect x={33} y={24} width={34} height={4} fill={dark} />
          <rect x={24} y={31} width={52} height={5} rx={2} />
          <text x={50} y={60} textAnchor="middle" fontSize={22} fontWeight={700} fill={gold} stroke={rim} strokeWidth={0.8} fontFamily="Georgia, serif">
            {character === 'financier' ? '%' : '$'}
          </text>
        </g>
      );
    case 'speculator':
      return (
        <g>
          <path d="M16 52 L34 36 L46 44 L76 14" {...line} />
          <path d="M76 14 L64 14 M76 14 L76 26" {...line} />
          <path d="M16 58 H84" stroke={gold} strokeWidth={2} />
        </g>
      );
    case 'treasurer':
      return (
        <g>
          <path d="M50 8 L50 56 M24 20 L76 20" {...line} strokeWidth={2.6} />
          <path d="M24 20 L16 38 L32 38 Z M76 20 L68 38 L84 38 Z" fill={gold} stroke={rim} strokeWidth={1.2} />
          <circle cx={24} cy={44} r={6} fill={gold} stroke={rim} strokeWidth={1.2} />
          <circle cx={76} cy={44} r={6} fill={gold} stroke={rim} strokeWidth={1.2} />
          <rect x={40} y={54} width={20} height={5} rx={2} fill={gold} />
        </g>
      );
    case 'newscaster':
    case 'reporter':
      return (
        <g>
          <rect x={41} y={8} width={18} height={26} rx={9} fill={gold} stroke={rim} strokeWidth={1.2} />
          <path d="M45 16 H55 M45 22 H55 M45 28 H55" stroke={dark} strokeWidth={1.2} />
          <path d="M32 28 Q32 46 50 46 Q68 46 68 28" {...line} strokeWidth={2.6} />
          <path d="M50 46 L50 56 M40 58 H60" {...line} strokeWidth={3} />
          {character === 'reporter' && <path d="M74 16 q6 8 0 16 M80 12 q9 12 0 24" stroke={gold} strokeWidth={2} fill="none" />}
        </g>
      );
    case 'producer':
      return (
        <g {...g}>
          <rect x={20} y={28} width={60} height={28} rx={2} />
          <path d="M20 16 L80 22 L80 28 L20 28 Z" />
          <path d="M30 17 L35 27 M46 18.5 L51 28 M62 20 L67 28" stroke={dark} strokeWidth={2} />
          <path d="M44 36 L44 50 L57 43 Z" fill={dark} stroke="none" />
        </g>
      );
    case 'lobbyist':
      return (
        <g {...g}>
          <rect x={20} y={24} width={60} height={32} rx={4} />
          <rect x={38} y={14} width={24} height={11} rx={2} fill="none" strokeWidth={3} stroke={gold} />
          <path d="M20 38 H80" stroke={dark} strokeWidth={2} />
          <rect x={45} y={34} width={10} height={8} rx={1} fill={dark} />
        </g>
      );
    case 'guerrilla':
      return (
        <g {...g}>
          <path d="M50 6 L58 28 L82 28 L63 42 L70 64 L50 51 L30 64 L37 42 L18 28 L42 28 Z" />
          <circle cx={50} cy={36} r={6} fill={dark} />
        </g>
      );
    case 'judge':
      return (
        <g {...g}>
          <rect x={20} y={52} width={50} height={6} rx={1.5} />
          <g transform="rotate(-35 50 30)">
            <rect x={36} y={14} width={30} height={14} rx={3} />
            <rect x={48} y={28} width={6} height={30} rx={2} />
          </g>
          <rect x={64} y={44} width={18} height={8} rx={2} />
        </g>
      );
    case 'mayor':
      return (
        <g {...g}>
          <path d="M18 28 L50 10 L82 28 Z" />
          <rect x={24} y={28} width={52} height={28} />
          {[30, 42, 54, 66].map((x) => (
            <rect key={x} x={x} y={34} width={5} height={22} fill={dark} stroke="none" />
          ))}
          <circle cx={50} cy={20} r={3.5} fill={dark} stroke="none" />
        </g>
      );
    case 'priest':
      return (
        <g {...g}>
          <rect x={44} y={6} width={12} height={54} rx={1.5} />
          <rect x={28} y={20} width={44} height={11} rx={1.5} />
          <circle cx={50} cy={25.5} r={3.4} fill={dark} stroke="none" />
        </g>
      );
    case 'lawyer':
      return (
        <g>
          <path d="M50 8 L50 56 M26 18 L74 18 M38 58 H62" {...line} strokeWidth={2.8} />
          <path d="M26 18 L18 36 Q26 42 34 36 Z" fill={gold} stroke={rim} strokeWidth={1.2} />
          <path d="M74 18 L66 36 Q74 42 82 36 Z" fill={gold} stroke={rim} strokeWidth={1.2} />
          <circle cx={50} cy={8} r={3.5} fill={gold} />
        </g>
      );
    case 'bishop':
      return (
        <g {...g}>
          <path d="M50 6 Q36 20 34 36 L34 58 L66 58 L66 36 Q64 20 50 6 Z" />
          <path d="M50 22 L50 50 M40 34 L60 34" stroke={dark} strokeWidth={3} fill="none" />
          <path d="M34 50 H66" stroke={dark} strokeWidth={1.6} />
        </g>
      );
    case 'inquisitor':
      return (
        <g>
          <circle cx={44} cy={28} r={16} fill={dark} stroke={gold} strokeWidth={4} />
          <circle cx={39} cy={23} r={4} fill="#fff6dc" opacity={0.6} />
          <path d="M56 40 L74 58" {...line} strokeWidth={6} />
        </g>
      );
    case 'protestor':
      return (
        <g {...g}>
          <rect x={34} y={22} width={30} height={26} rx={5} />
          <path d="M34 22 V14 Q34 10 38 10 Q42 10 42 14 V22 M42 22 V12 Q42 8 46 8 Q50 8 50 12 V22 M50 22 V12 Q50 8 54 8 Q58 8 58 12 V22 M58 22 V14 Q58 10 62 10 Q66 10 66 14 V24" fill={gold} />
          <rect x={40} y={48} width={18} height={12} />
        </g>
      );
    case 'peacekeeper':
      return (
        <g {...g}>
          <path d="M50 6 L74 16 L70 40 Q64 56 50 62 Q36 56 30 40 L26 16 Z" />
          <path d="M38 34 Q46 26 56 30 Q62 22 68 26 Q60 30 60 38 Q50 44 38 34 Z" fill={dark} stroke="none" />
        </g>
      );
    case 'foreignConsular':
      return (
        <g>
          <path d="M14 40 L30 26 L44 34 L56 26 L70 34 L86 22" {...line} />
          <path d="M30 26 L50 46 L70 34" {...line} strokeWidth={4} />
          <path d="M40 40 L46 46 M46 36 L54 44" stroke={dark} strokeWidth={1.6} />
          <circle cx={50} cy={16} r={5} fill={gold} stroke={rim} strokeWidth={1.2} />
        </g>
      );
    case 'diplomat':
      return (
        <g {...g}>
          <rect x={18} y={18} width={64} height={38} rx={2} />
          <path d="M18 18 L50 42 L82 18" fill="none" stroke={dark} strokeWidth={2.4} />
          <circle cx={50} cy={42} r={6} fill="#a3122f" stroke={rim} />
        </g>
      );
    case 'anarchist':
      return (
        <g>
          <circle cx={50} cy={34} r={22} fill="none" stroke={gold} strokeWidth={4} />
          <path d="M36 52 L50 12 L64 52 M41 38 L59 38" {...line} strokeWidth={4} />
          <path d="M28 56 L72 12" stroke={gold} strokeWidth={2} />
        </g>
      );
    case 'armsDealer':
      return (
        <g>
          <path d="M18 12 L78 52" {...line} strokeWidth={5} />
          <path d="M82 12 L22 52" {...line} strokeWidth={5} />
          <path d="M70 46 L80 60 M30 46 L20 60" stroke={dark} strokeWidth={5} strokeLinecap="round" />
          <circle cx={50} cy={32} r={5} fill={gold} stroke={rim} strokeWidth={1.2} />
        </g>
      );
    case 'paramilitary':
      return (
        <g {...g}>
          <path d="M20 40 Q20 12 50 12 Q80 12 80 40 L80 46 L20 46 Z" />
          <rect x={16} y={46} width={68} height={7} rx={2} />
          <path d="M30 30 H70" stroke={dark} strokeWidth={2} />
          <circle cx={50} cy={24} r={4} fill={dark} stroke="none" />
        </g>
      );
    case 'socialist':
      return (
        <g {...g}>
          <rect x={22} y={18} width={56} height={8} rx={2} />
          <rect x={22} y={32} width={56} height={8} rx={2} />
          <rect x={22} y={46} width={56} height={8} rx={2} />
          <path d="M14 36 L22 30 L22 42 Z M86 36 L78 30 L78 42 Z" />
        </g>
      );
    case 'worldBank':
      return (
        <g>
          <circle cx={50} cy={34} r={24} fill={gold} stroke={rim} strokeWidth={1.4} />
          <g stroke={dark} strokeWidth={1.8} fill="none">
            <ellipse cx={50} cy={34} rx={11} ry={24} />
            <path d="M26 34 H74 M30 22 H70 M30 46 H70" />
          </g>
        </g>
      );
    default:
      return (
        <text x={50} y={46} textAnchor="middle" fontSize={34} fontWeight={700} fill={gold}>
          ?
        </text>
      );
  }
}
