import { useSvgIds } from '@/ui/shared/svg';

// ============================================================================
// Skull disk art — biker-bar / tribal beer mats.
//
// Each disk is a stitched leather coaster with a cork ring and a tooled
// centre: a tattoo-flash rose, a skull over crossed bones, or (the back) the
// owner's tribal emblem. Rim colour = the owner's tribe, so stacks read at a
// glance. Presentation only: callers decide which face a viewer may see.
// ============================================================================

export type DiskFace = 'rose' | 'skull' | 'back';

export const TRIBES = [
  { name: 'Crimson', tint: '#b3202f', light: '#e0525e' },
  { name: 'Teal', tint: '#1f8a8a', light: '#4fc2bf' },
  { name: 'Amber', tint: '#c97d16', light: '#f0b04c' },
  { name: 'Violet', tint: '#6e3fa3', light: '#a37ad8' },
  { name: 'Moss', tint: '#3f8a3a', light: '#76c46e' },
  { name: 'Steel', tint: '#3a6ea8', light: '#78a8dc' },
] as const;

export function tribeOf(seat: number) {
  return TRIBES[((seat % TRIBES.length) + TRIBES.length) % TRIBES.length]!;
}

function Emblem({ color }: { color: string }) {
  // Tribal sun: eight hooked flames around a diamond.
  const flames = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <g>
      <g fill="#000" opacity="0.45" transform="translate(0.8 1)">
        {flames.map((a) => (
          <path key={a} d="M0 -12 C5 -16 5 -22 1 -27 C2 -21 -2 -19 -4 -15 Z" transform={`rotate(${a})`} />
        ))}
        <path d="M0 -8 L8 0 L0 8 L-8 0 Z" />
      </g>
      <g fill={color}>
        {flames.map((a) => (
          <path key={a} d="M0 -12 C5 -16 5 -22 1 -27 C2 -21 -2 -19 -4 -15 Z" transform={`rotate(${a})`} />
        ))}
        <path d="M0 -8 L8 0 L0 8 L-8 0 Z" />
      </g>
      <path d="M0 -4 L4 0 L0 4 L-4 0 Z" fill="#120a05" />
    </g>
  );
}

function Rose() {
  return (
    <g strokeLinejoin="round">
      {/* leaves */}
      <path d="M-4 10 C-14 10 -22 4 -24 -2 C-16 -2 -8 2 -4 10 Z" fill="#3f7a2e" stroke="#16200c" strokeWidth="1.6" />
      <path d="M4 10 C14 12 21 7 24 1 C16 0 8 4 4 10 Z" fill="#3f7a2e" stroke="#16200c" strokeWidth="1.6" />
      <path d="M-20 -1 C-14 2 -9 5 -6 9 M20 2 C14 4 9 6 6 9" stroke="#16200c" strokeWidth="0.9" fill="none" />
      {/* outer petals */}
      <path d="M0 15 C-13 15 -19 6 -17 -4 C-15 -12 -7 -17 0 -16 C7 -17 15 -12 17 -4 C19 6 13 15 0 15 Z" fill="#b3122a" stroke="#2a0a08" strokeWidth="1.8" />
      <path d="M-16 -2 C-10 4 -4 6 0 6 C4 6 10 4 16 -2" stroke="#2a0a08" strokeWidth="1.3" fill="none" />
      <path d="M-15 4 C-9 11 9 11 15 4" stroke="#6b0a14" strokeWidth="1" fill="none" />
      {/* inner bloom + spiral */}
      <path d="M-9 -2 C-10 -10 -3 -13 1 -12 C7 -12 10 -7 9 -2 C8 3 -8 3 -9 -2 Z" fill="#d42a44" stroke="#2a0a08" strokeWidth="1.4" />
      <path d="M-4 -4 C-4 -9 3 -10 4 -6 C5 -3 1 -1 -1 -3 C-2 -5 1 -6 1.6 -5" stroke="#2a0a08" strokeWidth="1.3" fill="none" />
      {/* tattoo highlights */}
      <path d="M-12 -6 C-11 -10 -8 -12 -5 -13" stroke="#ff8a9b" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M8 -9 C10 -8 12 -6 12.5 -3" stroke="#ff8a9b" strokeWidth="1" strokeLinecap="round" fill="none" />
    </g>
  );
}

function SkullMark() {
  return (
    <g strokeLinejoin="round">
      {/* crossed bones */}
      <g fill="#e9dfc8" stroke="#1a0606" strokeWidth="1.4">
        <path d="M-22 -14 L18 16 M22 -14 L-18 16" stroke="#1a0606" strokeWidth="6.4" strokeLinecap="round" />
        <path d="M-22 -14 L18 16 M22 -14 L-18 16" stroke="#e9dfc8" strokeWidth="3.6" strokeLinecap="round" />
        <circle cx="-23" cy="-12" r="3" />
        <circle cx="-20" cy="-16" r="3" />
        <circle cx="23" cy="-12" r="3" />
        <circle cx="20" cy="-16" r="3" />
        <circle cx="-20" cy="18" r="3" />
        <circle cx="-17" cy="14" r="3" />
        <circle cx="20" cy="18" r="3" />
        <circle cx="17" cy="14" r="3" />
      </g>
      {/* skull */}
      <path
        d="M0 -19 C11 -19 17 -11 17 -3 C17 3 14 6 11 8 L11 13 C11 15 9 16 7 16 L-7 16 C-9 16 -11 15 -11 13 L-11 8 C-14 6 -17 3 -17 -3 C-17 -11 -11 -19 0 -19 Z"
        fill="#f2e9d4"
        stroke="#1a0606"
        strokeWidth="1.8"
      />
      <path d="M-13 -9 C-11 -15 -5 -17 0 -17" stroke="#fffaf0" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M6 -17 L4 -12 L7 -9" stroke="#1a0606" strokeWidth="0.9" fill="none" />
      {/* sockets with a faint ember glow */}
      <path d="M-11 -3 C-11 -8 -3 -8 -3 -3 C-3 1 -11 2 -11 -3 Z" fill="#160404" />
      <path d="M11 -3 C11 -8 3 -8 3 -3 C3 1 11 2 11 -3 Z" fill="#160404" />
      <circle cx="-7" cy="-3" r="1.6" fill="#ff4d3a" opacity="0.85" />
      <circle cx="7" cy="-3" r="1.6" fill="#ff4d3a" opacity="0.85" />
      <path d="M0 2 L-2.4 7 L2.4 7 Z" fill="#160404" />
      <path d="M-6 11 V15.6 M-2 11 V15.8 M2 11 V15.8 M6 11 V15.6 M-8 11 H8" stroke="#1a0606" strokeWidth="1" />
    </g>
  );
}

export function SkullDisk({
  face,
  seat,
  size = 64,
  title,
  className,
}: {
  face: DiskFace;
  /** Owner seat (picks the tribe colour). */
  seat: number;
  size?: number | string;
  title?: string;
  className?: string;
}) {
  const ids = useSvgIds();
  const tribe = tribeOf(seat);
  const label = title ?? (face === 'back' ? `${tribe.name} disk, face down` : `${face} disk`);
  return (
    <svg
      viewBox="-50 -50 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={label}
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id={ids('rim')} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor={tribe.light} />
          <stop offset="0.55" stopColor={tribe.tint} />
          <stop offset="1" stopColor="#1a0d06" />
        </radialGradient>
        <radialGradient id={ids('leather')} cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#4a2e1a" />
          <stop offset="1" stopColor="#140b05" />
        </radialGradient>
        <radialGradient id={ids('cork')} cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#f1e4c6" />
          <stop offset="1" stopColor="#c6a978" />
        </radialGradient>
        <radialGradient id={ids('blood')} cx="45%" cy="40%" r="75%">
          <stop offset="0" stopColor="#5a1414" />
          <stop offset="1" stopColor="#140303" />
        </radialGradient>
        <pattern id={ids('speck')} width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="2" r="0.7" fill="#6b4a25" opacity="0.55" />
          <circle cx="5" cy="5.4" r="0.5" fill="#6b4a25" opacity="0.45" />
        </pattern>
      </defs>
      {/* drop shadow */}
      <ellipse cx="0" cy="4" rx="47" ry="45" fill="#000" opacity="0.4" />
      {/* leather rim + stitching */}
      <circle r="47" fill={ids.url('rim')} stroke="#120904" strokeWidth="1.6" />
      <circle r="41.5" fill="none" stroke="#f3e2c0" strokeWidth="1.6" strokeDasharray="3.2 2.6" opacity="0.85" />
      {/* cork ring */}
      <circle r="37" fill="#b88a55" />
      <circle r="37" fill={ids.url('speck')} />
      <circle r="37" fill="none" stroke="#120904" strokeWidth="1" />
      {/* centre */}
      <circle r="33" fill={face === 'rose' ? ids.url('cork') : face === 'skull' ? ids.url('blood') : ids.url('leather')} stroke="#120904" strokeWidth="1.2" />
      {face === 'rose' && (
        <>
          <circle r="33" fill={ids.url('speck')} opacity="0.5" />
          <Rose />
        </>
      )}
      {face === 'skull' && <SkullMark />}
      {face === 'back' && <Emblem color={tribe.light} />}
      {/* sheen */}
      <path d="M-34 -18 C-28 -34 -12 -42 4 -42" stroke="#fff" strokeOpacity="0.22" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Small gold medallion for a won challenge. */
export function WinMedal({ won, size = 20 }: { won: boolean; size?: number }) {
  const ids = useSvgIds();
  return (
    <svg viewBox="-12 -12 24 24" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={ids('g')} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.5" stopColor="#d4a64a" />
          <stop offset="1" stopColor="#6b4a14" />
        </radialGradient>
      </defs>
      {won ? (
        <g>
          <circle r="11" fill={ids.url('g')} stroke="#3d2a08" strokeWidth="1" />
          <path d="M0 -6 C4 -6 6 -3 6 0 C6 2 5 3 4 3.6 L4 5.4 L-4 5.4 L-4 3.6 C-5 3 -6 2 -6 0 C-6 -3 -4 -6 0 -6 Z" fill="#3d2a08" />
          <circle cx="-2.4" cy="-0.6" r="1.4" fill="#d4a64a" />
          <circle cx="2.4" cy="-0.6" r="1.4" fill="#d4a64a" />
        </g>
      ) : (
        <circle r="10" fill="#120904" fillOpacity="0.5" stroke="#d4a64a" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="2 2" />
      )}
    </svg>
  );
}
