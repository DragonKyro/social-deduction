import { createContext, useContext } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useSvgIds } from '@/ui/shared/svg';
import type { DieFace } from '../state';

// ============================================================================
// Liar's Dice art: ivory dice, leather dice cups, tavern candles.
//
// Gradients are declared once per table by <DiceDefs/> and shared through
// context (dozens of dice would otherwise each carry their own <defs>).
// A <Die/> rendered outside a provider falls back to its own defs.
// ============================================================================

type Ids = ReturnType<typeof useSvgIds>;
const DefsCtx = createContext<Ids | null>(null);

function DefsBody({ id }: { id: Ids }) {
  return (
    <>
      <radialGradient id={id('ivory')} cx="32%" cy="26%" r="85%">
        <stop offset="0%" stopColor="#fffdf6" />
        <stop offset="45%" stopColor="#f6eedb" />
        <stop offset="85%" stopColor="#ddcda7" />
        <stop offset="100%" stopColor="#c7b58c" />
      </radialGradient>
      <linearGradient id={id('bevel')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
        <stop offset="50%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="100%" stopColor="#8a7449" stopOpacity="0.45" />
      </linearGradient>
      <radialGradient id={id('pip')} cx="62%" cy="66%" r="70%">
        <stop offset="0%" stopColor="#4a3524" />
        <stop offset="70%" stopColor="#1a0f07" />
        <stop offset="100%" stopColor="#0b0603" />
      </radialGradient>
      <radialGradient id={id('ace')} cx="62%" cy="66%" r="70%">
        <stop offset="0%" stopColor="#e2454b" />
        <stop offset="70%" stopColor="#8d121a" />
        <stop offset="100%" stopColor="#4c070c" />
      </radialGradient>
      <linearGradient id={id('leather')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#2a160a" />
        <stop offset="22%" stopColor="#6a3b1e" />
        <stop offset="42%" stopColor="#94582f" />
        <stop offset="58%" stopColor="#7b4624" />
        <stop offset="82%" stopColor="#4b2812" />
        <stop offset="100%" stopColor="#24120a" />
      </linearGradient>
      <linearGradient id={id('brass')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#6d4f17" />
        <stop offset="30%" stopColor="#e7c46a" />
        <stop offset="50%" stopColor="#fff0b5" />
        <stop offset="70%" stopColor="#c99a37" />
        <stop offset="100%" stopColor="#5e420f" />
      </linearGradient>
      <filter id={id('tooled')} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9 0.35" numOctaves="2" seed="4" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.28 0" result="g" />
        <feComposite in="g" in2="SourceGraphic" operator="in" result="g2" />
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="g2" />
        </feMerge>
      </filter>
    </>
  );
}

/** Declare the shared gradients once and provide them to every die / cup inside. */
export function DiceDefs({ children }: { children: ReactNode }) {
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

function useIds(): { id: Ids; ownDefs: boolean } {
  const ctx = useContext(DefsCtx);
  const own = useSvgIds();
  return ctx ? { id: ctx, ownDefs: false } : { id: own, ownDefs: true };
}

// Pip centres on a 100×100 face.
const PIPS: Record<DieFace, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [[29, 29], [71, 71]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[29, 29], [71, 29], [29, 71], [71, 71]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[30, 25], [70, 25], [30, 50], [70, 50], [30, 75], [70, 75]],
};

export function Die({
  face,
  size = 44,
  className,
  style,
  title,
}: {
  face: DieFace;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const { id, ownDefs } = useIds();
  const ace = face === 1;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={style}
      role="img"
      aria-label={title ?? `die showing ${face}`}
    >
      {ownDefs && (
        <defs>
          <DefsBody id={id} />
        </defs>
      )}
      <rect x="4" y="4" width="92" height="92" rx="21" fill={id.url('ivory')} stroke="#a8936a" strokeWidth="1.5" />
      <rect x="7" y="7" width="86" height="86" rx="18" fill="none" stroke={id.url('bevel')} strokeWidth="5" />
      <path d="M18 14 Q50 6 82 14" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" fill="none" strokeLinecap="round" />
      {PIPS[face].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y + 1.2} r={ace ? 14 : 9.5} fill="#fff" opacity="0.55" />
          <circle cx={x} cy={y} r={ace ? 14 : 9.5} fill={id.url(ace ? 'ace' : 'pip')} />
          <circle cx={x - (ace ? 4 : 3)} cy={y - (ace ? 4 : 3)} r={ace ? 3 : 2} fill="#fff" opacity="0.16" />
        </g>
      ))}
    </svg>
  );
}

/** Upturned leather dice cup with brass bands and a skull-and-bones brand. */
export function DiceCup({ size = 84, className }: { size?: number; className?: string }) {
  const { id, ownDefs } = useIds();
  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2} className={className} aria-hidden>
      {ownDefs && (
        <defs>
          <DefsBody id={id} />
        </defs>
      )}
      <ellipse cx="50" cy="112" rx="38" ry="6" fill="#000" opacity="0.45" />
      <g filter={id.url('tooled')}>
        <path d="M20 108 L31 20 Q50 9 69 20 L80 108 Q50 116 20 108 Z" fill={id.url('leather')} stroke="#1d0e05" strokeWidth="2" />
      </g>
      <ellipse cx="50" cy="19" rx="19" ry="5.5" fill="#3b200f" stroke="#1d0e05" strokeWidth="1.5" />
      <ellipse cx="50" cy="18" rx="14" ry="3" fill="#5a3218" opacity="0.8" />
      {/* side stitching */}
      <path d="M35 25 L26 104" stroke="#e1c48f" strokeWidth="1.3" strokeDasharray="3 3" opacity="0.65" />
      <path d="M65 25 L74 104" stroke="#e1c48f" strokeWidth="1.3" strokeDasharray="3 3" opacity="0.65" />
      {/* brass bands */}
      <path d="M29.5 34 Q50 40 70.5 34" stroke={id.url('brass')} strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M21 101 Q50 110 79 101" stroke={id.url('brass')} strokeWidth="6" fill="none" strokeLinecap="round" />
      {/* skull & crossbones brand */}
      <g transform="translate(50 66)" fill="#e9dcc0" opacity="0.82">
        <path d="M-15 10 L15 -8 M-15 -8 L15 10" stroke="#e9dcc0" strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="-15.5" cy="10.5" r="2.4" />
        <circle cx="15.5" cy="10.5" r="2.4" />
        <circle cx="-15.5" cy="-8.5" r="2.4" />
        <circle cx="15.5" cy="-8.5" r="2.4" />
        <path d="M-9 -1 Q-9 -13 0 -13 Q9 -13 9 -1 Q9 4 5 5 L5 9 L-5 9 L-5 5 Q-9 4 -9 -1 Z" />
        <circle cx="-3.6" cy="-3" r="2.6" fill="#3a1f0e" />
        <circle cx="3.6" cy="-3" r="2.6" fill="#3a1f0e" />
        <path d="M0 0.5 L-1.4 3 L1.4 3 Z" fill="#3a1f0e" />
      </g>
      {/* sheen */}
      <path d="M40 24 L34 100" stroke="#fff" strokeOpacity="0.13" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

/** A dripping tavern candle with a flickering flame. */
export function Candle({
  height = 120,
  className,
  flameClassName,
}: {
  height?: number;
  className?: string;
  flameClassName?: string;
}) {
  const id = useSvgIds();
  return (
    <svg viewBox="0 0 60 150" height={height} width={height * 0.4} className={className} aria-hidden>
      <defs>
        <radialGradient id={id('halo')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd27a" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#ff9a2e" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ff9a2e" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('flame')} cx="50%" cy="72%" r="60%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#fff2b0" />
          <stop offset="65%" stopColor="#ffb238" />
          <stop offset="100%" stopColor="#e5560f" stopOpacity="0.85" />
        </radialGradient>
        <linearGradient id={id('wax')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#b9a47a" />
          <stop offset="40%" stopColor="#f4ead2" />
          <stop offset="100%" stopColor="#a8916a" />
        </linearGradient>
      </defs>
      <g className={flameClassName} style={{ transformOrigin: '30px 42px', transformBox: 'view-box' }}>
        <circle cx="30" cy="30" r="28" fill={id.url('halo')} />
        <path d="M30 6 C38 20 40 30 30 42 C20 30 22 20 30 6 Z" fill={id.url('flame')} />
        <path d="M30 22 C33 28 33 33 30 38 C27 33 27 28 30 22 Z" fill="#6aa8ff" opacity="0.35" />
      </g>
      <path d="M30 40 L30 48" stroke="#2a1a10" strokeWidth="2" />
      <path d="M14 52 Q30 45 46 52 L46 140 L14 140 Z" fill={id.url('wax')} stroke="#8f7a52" strokeWidth="1" />
      <path d="M15 53 Q15 66 17.5 70 Q20.5 66 20.5 55 Z" fill="#f7efdc" opacity="0.9" />
      <path d="M37 54 Q37 75 40 80 Q43.5 75 43.5 56 Z" fill="#efe3c6" opacity="0.85" />
      <path d="M17 60 L17 136" stroke="#fff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="30" cy="141" rx="22" ry="5" fill="#5a3a1e" />
      <ellipse cx="30" cy="139" rx="19" ry="3.5" fill="#8a5d2e" />
    </svg>
  );
}
