import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useSvgIds } from '@/ui/shared/svg';
import { RANK_LABEL, RANK_NAME } from '../hands';
import type { Card, CardRank, Suit } from '../state';

// ============================================================================
// Liar's Poker art: a 63×88 poker card with proper corner indices, standard
// pip layouts (lower-half pips inverted), double-headed court figures, and
// an engraved card back. Shared gradients live in <CardDefs/>.
// ============================================================================

type Ids = ReturnType<typeof useSvgIds>;
const DefsCtx = createContext<Ids | null>(null);

const W = 63;
const H = 88;

// Suit glyphs drawn in a 10×10 box.
const SUIT_PATH: Record<Suit, string> = {
  hearts:
    'M5 9.4 C4.2 8.6 0.4 6 0.4 3.3 C0.4 1.6 1.7 0.4 3.1 0.4 C4 0.4 4.7 0.9 5 1.8 C5.3 0.9 6 0.4 6.9 0.4 C8.3 0.4 9.6 1.6 9.6 3.3 C9.6 6 5.8 8.6 5 9.4 Z',
  diamonds: 'M5 0.2 C6.2 2.2 7.6 3.7 9.2 5 C7.6 6.3 6.2 7.8 5 9.8 C3.8 7.8 2.4 6.3 0.8 5 C2.4 3.7 3.8 2.2 5 0.2 Z',
  spades:
    'M5 0.2 C6.3 2.4 9.5 4.3 9.5 6.6 C9.5 8 8.4 8.9 7.2 8.9 C6.4 8.9 5.8 8.5 5.4 7.9 C5.5 8.8 5.9 9.4 6.6 9.8 L3.4 9.8 C4.1 9.4 4.5 8.8 4.6 7.9 C4.2 8.5 3.6 8.9 2.8 8.9 C1.6 8.9 0.5 8 0.5 6.6 C0.5 4.3 3.7 2.4 5 0.2 Z',
  clubs:
    'M5 0.4 A2.25 2.25 0 0 1 6.9 3.9 A2.25 2.25 0 1 1 5.5 7.6 C5.6 8.6 6 9.3 6.7 9.8 L3.3 9.8 C4 9.3 4.4 8.6 4.5 7.6 A2.25 2.25 0 1 1 3.1 3.9 A2.25 2.25 0 0 1 5 0.4 Z',
};

export const isRed = (s: Suit) => s === 'hearts' || s === 'diamonds';
const ink = (s: Suit) => (isRed(s) ? '#b3141f' : '#16161c');

function Pip({ suit, x, y, size = 10, flip = false }: { suit: Suit; x: number; y: number; size?: number; flip?: boolean }) {
  const k = size / 10;
  return (
    <path
      d={SUIT_PATH[suit]}
      fill={ink(suit)}
      transform={`translate(${x} ${y}) ${flip ? 'rotate(180)' : ''} scale(${k}) translate(-5 -5)`}
    />
  );
}

// Pip centres for 2–10 (x columns 19 / 31.5 / 44; y from 17 to 71).
const L = 19;
const C = 31.5;
const R = 44;
const PIP_LAYOUT: Partial<Record<CardRank, Array<[number, number]>>> = {
  2: [[C, 17], [C, 71]],
  3: [[C, 17], [C, 44], [C, 71]],
  4: [[L, 17], [R, 17], [L, 71], [R, 71]],
  5: [[L, 17], [R, 17], [C, 44], [L, 71], [R, 71]],
  6: [[L, 17], [R, 17], [L, 44], [R, 44], [L, 71], [R, 71]],
  7: [[L, 17], [R, 17], [C, 30.5], [L, 44], [R, 44], [L, 71], [R, 71]],
  8: [[L, 17], [R, 17], [C, 30.5], [L, 44], [R, 44], [C, 57.5], [L, 71], [R, 71]],
  9: [[L, 17], [R, 17], [L, 35], [R, 35], [C, 44], [L, 53], [R, 53], [L, 71], [R, 71]],
  10: [[L, 17], [R, 17], [C, 26], [L, 35], [R, 35], [L, 53], [R, 53], [C, 62], [L, 71], [R, 71]],
};

function DefsBody({ id }: { id: Ids }) {
  return (
    <>
      <linearGradient id={id('stock')} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stopColor="#fffefa" />
        <stop offset="100%" stopColor="#f1eadb" />
      </linearGradient>
      <linearGradient id={id('gold')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f7df93" />
        <stop offset="50%" stopColor="#c99a37" />
        <stop offset="100%" stopColor="#8a6420" />
      </linearGradient>
      <pattern id={id('lattice')} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="#7a1222" />
        <path d="M0 0 L0 6 M0 0 L6 0" stroke="#a8303e" strokeWidth="1.1" />
        <circle cx="3" cy="3" r="0.7" fill="#e9c46a" opacity="0.75" />
      </pattern>
      <radialGradient id={id('backGlow')} cx="50%" cy="45%" r="70%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.25" />
      </radialGradient>
    </>
  );
}

/** Declare shared card gradients once and provide them to every card inside. */
export function CardDefs({ children }: { children: ReactNode }) {
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

function Index({ card }: { card: Card }) {
  const label = RANK_LABEL[card.rank];
  return (
    <g>
      <text
        x="6"
        y="11"
        textAnchor="middle"
        fontSize={label.length > 1 ? 8.4 : 9.6}
        fontWeight="700"
        fill={ink(card.suit)}
        style={{ fontFamily: 'var(--font-romance)', fontVariantNumeric: 'lining-nums' }}
        letterSpacing={label.length > 1 ? -0.6 : 0}
      >
        {label}
      </text>
      <Pip suit={card.suit} x={6} y={16} size={5.2} />
    </g>
  );
}

/** A double-headed court figure (top half drawn, bottom half rotated). */
function CourtHalf({ rank, suit, id }: { rank: 11 | 12 | 13; suit: Suit; id: Ids }) {
  const robe = isRed(suit) ? '#b3212e' : '#223a78';
  const robe2 = isRed(suit) ? '#223a78' : '#b3212e';
  const skin = '#f3d6ae';
  return (
    <g>
      {/* robe + shoulders */}
      <path d="M13 44 L13 39 Q16 32 24 31 L39 31 Q47 32 50 39 L50 44 Z" fill={robe} stroke="#1b1b22" strokeWidth="0.6" />
      <path d="M24 31 L31.5 44 L39 31" fill={robe2} stroke="#1b1b22" strokeWidth="0.5" />
      <path d="M13 40.5 Q22 36 31.5 44 Q41 36 50 40.5" fill="none" stroke={id.url('gold')} strokeWidth="1.4" />
      <path d="M16 44 L16 38 M47 44 L47 38" stroke={id.url('gold')} strokeWidth="0.8" />
      {/* collar */}
      <path d="M25 31 Q31.5 35 38 31 L36 29 Q31.5 31.5 27 29 Z" fill="#f4efe2" stroke="#1b1b22" strokeWidth="0.4" />
      {/* hair behind */}
      {rank === 12 && <path d="M24 18 Q22 28 25 33 L38 33 Q41 28 39 18 Z" fill="#7a4a1d" stroke="#1b1b22" strokeWidth="0.4" />}
      {/* head */}
      <ellipse cx="31.5" cy="23.5" rx="5.6" ry="6.4" fill={skin} stroke="#1b1b22" strokeWidth="0.5" />
      <circle cx="29.4" cy="22.8" r="0.65" fill="#1b1b22" />
      <circle cx="33.6" cy="22.8" r="0.65" fill="#1b1b22" />
      <path d="M30.2 26.8 Q31.5 27.6 32.8 26.8" stroke="#8c2a2a" strokeWidth="0.55" fill="none" />
      {rank === 13 && (
        <>
          {/* beard */}
          <path d="M26 25 Q26.5 31.5 31.5 32.5 Q36.5 31.5 37 25 Q34.5 28.5 31.5 28.5 Q28.5 28.5 26 25 Z" fill="#d9d2c4" stroke="#1b1b22" strokeWidth="0.4" />
          {/* crown */}
          <path d="M25.5 18 L25 11 L28.2 14.5 L31.5 9.5 L34.8 14.5 L38 11 L37.5 18 Z" fill={id.url('gold')} stroke="#5c430f" strokeWidth="0.5" />
          <circle cx="31.5" cy="15.8" r="0.9" fill={robe2} />
        </>
      )}
      {rank === 12 && (
        <>
          <path d="M25.6 18.6 Q26 13 28.4 14.6 Q29.6 10.8 31.5 13.6 Q33.4 10.8 34.6 14.6 Q37 13 37.4 18.6 Z" fill={id.url('gold')} stroke="#5c430f" strokeWidth="0.5" />
          <circle cx="28.4" cy="14.4" r="0.7" fill="#fff" />
          <circle cx="31.5" cy="13.4" r="0.7" fill={robe} />
          <circle cx="34.6" cy="14.4" r="0.7" fill="#fff" />
          {/* flower */}
          <circle cx="44" cy="35" r="1.8" fill="#e8b4c0" stroke="#1b1b22" strokeWidth="0.3" />
          <path d="M44 37 L43 42" stroke="#2f6b33" strokeWidth="0.6" />
        </>
      )}
      {rank === 11 && (
        <>
          <path d="M26 19.5 Q31.5 14 37 19.5 L38.5 18 Q31.5 10.5 24.5 18 Z" fill={robe2} stroke="#1b1b22" strokeWidth="0.4" />
          <path d="M37 16 Q44 9.5 46 14 Q41 13.5 38 18" fill="#f0e6c8" stroke="#1b1b22" strokeWidth="0.4" />
          <path d="M26.2 20 Q25.4 25 26.6 27 M36.8 20 Q37.6 25 36.4 27" stroke="#7a4a1d" strokeWidth="1.4" fill="none" />
          {/* halberd */}
          <path d="M18 44 L18 22" stroke="#6b4a1e" strokeWidth="0.9" />
          <path d="M18 22 L15.5 26 L18 25 L20.5 26 Z" fill="#c8ccd6" stroke="#1b1b22" strokeWidth="0.3" />
        </>
      )}
      <Pip suit={suit} x={rank === 11 ? 44 : 19} y={rank === 12 ? 26 : 35} size={6} />
    </g>
  );
}

export function PlayingCard({
  card,
  width = 63,
  highlighted = false,
  className,
}: {
  card: Card;
  width?: number;
  highlighted?: boolean;
  className?: string;
}) {
  const { id, ownDefs } = useIds();
  const pips = PIP_LAYOUT[card.rank];
  const court = card.rank >= 11 && card.rank <= 13;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={width}
      height={(width * H) / W}
      className={className}
      role="img"
      aria-label={`${RANK_NAME[card.rank]} of ${card.suit}`}
    >
      {ownDefs && (
        <defs>
          <DefsBody id={id} />
        </defs>
      )}
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="4.2" fill={id.url('stock')} stroke={highlighted ? '#d9a93a' : '#c4b9a2'} strokeWidth={highlighted ? 2 : 0.7} />
      <Index card={card} />
      <g transform={`rotate(180 ${W / 2} ${H / 2})`}>
        <Index card={card} />
      </g>
      {pips && pips.map(([x, y], i) => <Pip key={i} suit={card.suit} x={x} y={y} size={10} flip={y > 44} />)}
      {card.rank === 14 && (
        <g>
          {card.suit === 'spades' && (
            <ellipse cx={C} cy={44} rx="16" ry="18" fill="none" stroke={id.url('gold')} strokeWidth="0.8" strokeDasharray="1.2 1.4" />
          )}
          <Pip suit={card.suit} x={C} y={44} size={card.suit === 'spades' ? 25 : 20} />
        </g>
      )}
      {court && (
        <g>
          <rect x="11" y="9" width="41" height="70" rx="1.5" fill="#fbf6ea" stroke={ink(card.suit)} strokeWidth="0.6" />
          <rect x="12.4" y="10.4" width="38.2" height="67.2" rx="1" fill="none" stroke={id.url('gold')} strokeWidth="0.7" />
          <g clipPath="none">
            <CourtHalf rank={card.rank as 11 | 12 | 13} suit={card.suit} id={id} />
            <g transform={`rotate(180 ${W / 2} ${H / 2})`}>
              <CourtHalf rank={card.rank as 11 | 12 | 13} suit={card.suit} id={id} />
            </g>
          </g>
          <path d="M12.4 44 L50.6 44" stroke={ink(card.suit)} strokeWidth="0.4" />
        </g>
      )}
    </svg>
  );
}

/** Engraved card back: lattice field, white border, gold rosette. */
export function CardBack({ width = 63, className, label }: { width?: number; className?: string; label?: string }) {
  const { id, ownDefs } = useIds();
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={width}
      height={(width * H) / W}
      className={className}
      role="img"
      aria-label={label ?? 'face-down card'}
    >
      {ownDefs && (
        <defs>
          <DefsBody id={id} />
        </defs>
      )}
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="4.2" fill="#fbf7ee" stroke="#c4b9a2" strokeWidth="0.7" />
      <rect x="4" y="4" width={W - 8} height={H - 8} rx="2.5" fill={id.url('lattice')} />
      <rect x="4" y="4" width={W - 8} height={H - 8} rx="2.5" fill={id.url('backGlow')} />
      <rect x="5.5" y="5.5" width={W - 11} height={H - 11} rx="2" fill="none" stroke="#e9c46a" strokeWidth="0.6" />
      <g transform={`translate(${W / 2} ${H / 2})`}>
        {Array.from({ length: 8 }, (_, i) => (
          <ellipse key={i} rx="3.2" ry="9" fill="#5a0d19" stroke="#e9c46a" strokeWidth="0.5" transform={`rotate(${i * 22.5})`} />
        ))}
        <circle r="5.2" fill="#7a1222" stroke="#e9c46a" strokeWidth="0.7" />
        <path d={SUIT_PATH.spades} fill="#e9c46a" transform="scale(0.62) translate(-5 -5)" />
      </g>
    </svg>
  );
}
