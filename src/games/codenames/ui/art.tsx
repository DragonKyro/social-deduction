import type { CardKind } from '../state';

// ============================================================================
// Codenames art: agent-card silhouettes as one inline SVG sprite.
//
// The 25 cover cards reference the symbols with <use>, so each card is a
// handful of paths with flat fills (colour comes from CSS `currentColor`):
// no per-card filters, gradients, or duplicated <defs>. The sprite is
// mounted once per game view; its ids come from the caller (`useSvgIds`).
// ============================================================================

export type PortraitId = 'agentHat' | 'agentBob' | 'bystander' | 'bystanderCap' | 'assassin';

export function portraitFor(kind: CardKind, index: number): PortraitId {
  if (kind === 'assassin') return 'assassin';
  if (kind === 'bystander') return index % 2 === 0 ? 'bystander' : 'bystanderCap';
  return index % 2 === 0 ? 'agentHat' : 'agentBob';
}

/** Hidden sprite with every portrait symbol. Render once per view. */
export function AgentSprite({ id }: { id: (name: string) => string }) {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        {/* Trench-coat agent in a fedora. */}
        <symbol id={id('agentHat')} viewBox="0 0 100 100">
          <path d="M8 100 C10 80 28 70 50 70 C72 70 90 80 92 100 Z" fill="currentColor" />
          <path d="M37 71 L50 95 L63 71 L57 69 L50 82 L43 69 Z" fill="#000" opacity="0.35" />
          <path d="M28 76 L40 100 L34 100 L24 80 Z M72 76 L60 100 L66 100 L76 80 Z" fill="#fff" opacity="0.08" />
          <rect x="44" y="57" width="12" height="14" rx="3" fill="currentColor" />
          <ellipse cx="50" cy="47" rx="13.5" ry="15.5" fill="currentColor" />
          <rect x="39" y="45" width="9.5" height="5" rx="2" fill="#000" opacity="0.85" />
          <rect x="51.5" y="45" width="9.5" height="5" rx="2" fill="#000" opacity="0.85" />
          <rect x="41" y="46" width="3" height="1.4" fill="#fff" opacity="0.5" />
          <rect x="53.5" y="46" width="3" height="1.4" fill="#fff" opacity="0.5" />
          <ellipse cx="50" cy="36" rx="27" ry="5" fill="currentColor" />
          <path d="M35 36 C35 22 41 16 50 16 C59 16 65 22 65 36 Z" fill="currentColor" />
          <path d="M44 18 C48 22 52 22 56 18" stroke="#000" strokeOpacity="0.3" strokeWidth="1.5" fill="none" />
          <rect x="35.4" y="30" width="29.2" height="4.2" fill="#e9cf8f" opacity="0.75" />
        </symbol>

        {/* Agent with a bob haircut and turned-up collar. */}
        <symbol id={id('agentBob')} viewBox="0 0 100 100">
          <path d="M10 100 C12 80 30 71 50 71 C70 71 88 80 90 100 Z" fill="currentColor" />
          <path d="M34 72 L46 90 L50 74 L54 90 L66 72 L58 68 L50 78 L42 68 Z" fill="#000" opacity="0.32" />
          <rect x="44.5" y="57" width="11" height="14" rx="3" fill="currentColor" />
          <ellipse cx="50" cy="46" rx="12.5" ry="15" fill="currentColor" />
          <path
            d="M33 56 C30 33 40 25 50 25 C61 25 70 33 67 56 C63 58 60 54 60 46 C56 39 44 39 40 46 C40 54 37 58 33 56 Z"
            fill="currentColor"
          />
          <path d="M40 36 C45 31 56 31 61 38" stroke="#fff" strokeOpacity="0.12" strokeWidth="2" fill="none" />
          <rect x="40" y="45" width="9" height="4.6" rx="2.2" fill="#000" opacity="0.85" />
          <rect x="51" y="45" width="9" height="4.6" rx="2.2" fill="#000" opacity="0.85" />
          <rect x="42" y="46" width="2.6" height="1.3" fill="#fff" opacity="0.5" />
          <rect x="53" y="46" width="2.6" height="1.3" fill="#fff" opacity="0.5" />
          <path d="M45 55 C48 57 52 57 55 55" stroke="#000" strokeOpacity="0.45" strokeWidth="1.4" fill="none" />
        </symbol>

        {/* Innocent bystander: shirt and tie, bare head. */}
        <symbol id={id('bystander')} viewBox="0 0 100 100">
          <path d="M12 100 C14 81 31 72 50 72 C69 72 86 81 88 100 Z" fill="currentColor" />
          <path d="M43 72 L50 80 L57 72 Z" fill="#fff" opacity="0.5" />
          <path d="M48 79 L52 79 L54 95 L50 99 L46 95 Z" fill="#7a2a1d" opacity="0.7" />
          <rect x="44" y="58" width="12" height="14" rx="3" fill="currentColor" />
          <ellipse cx="50" cy="46" rx="13.5" ry="15.5" fill="currentColor" />
          <path d="M36.5 44 C36 31 43 28 50 28 C59 28 64 32 63.6 44 C60 37 54 35 50 35 C45 35 39 38 36.5 44 Z" fill="#000" opacity="0.28" />
          <circle cx="45" cy="47" r="1.6" fill="#000" opacity="0.55" />
          <circle cx="55" cy="47" r="1.6" fill="#000" opacity="0.55" />
          <path d="M46 54 C48.5 56 51.5 56 54 54" stroke="#000" strokeOpacity="0.4" strokeWidth="1.3" fill="none" />
        </symbol>

        {/* Bystander in a flat cap with a newspaper. */}
        <symbol id={id('bystanderCap')} viewBox="0 0 100 100">
          <path d="M12 100 C14 81 31 72 50 72 C69 72 86 81 88 100 Z" fill="currentColor" />
          <rect x="58" y="80" width="26" height="18" rx="1.5" fill="#f4ecd8" opacity="0.85" transform="rotate(-12 71 89)" />
          <path d="M61 85 L80 81 M62 89 L81 85 M63 93 L76 90" stroke="#000" strokeOpacity="0.35" strokeWidth="1.2" />
          <rect x="44" y="58" width="12" height="14" rx="3" fill="currentColor" />
          <ellipse cx="50" cy="47" rx="13.5" ry="15.5" fill="currentColor" />
          <path d="M34 40 C35 29 65 28 67 38 L76 41 C72 43 42 44 34 42 Z" fill="currentColor" />
          <path d="M34 40 C35 29 65 28 67 38" stroke="#000" strokeOpacity="0.25" strokeWidth="1.5" fill="none" />
          <circle cx="45" cy="49" r="1.6" fill="#000" opacity="0.55" />
          <circle cx="55" cy="49" r="1.6" fill="#000" opacity="0.55" />
        </symbol>

        {/* The assassin: hooded figure behind a scope reticle. */}
        <symbol id={id('assassin')} viewBox="0 0 100 100">
          <path d="M8 100 C10 70 26 42 50 32 C74 42 90 70 92 100 Z" fill="currentColor" />
          <path
            d="M29 64 C27 34 40 19 50 19 C60 19 73 34 71 64 C65 55 58 51 50 51 C42 51 35 55 29 64 Z"
            fill="currentColor"
          />
          <ellipse cx="50" cy="49" rx="13" ry="14" fill="#000" opacity="0.9" />
          <circle cx="45" cy="49" r="1.9" fill="#ff3b30" />
          <circle cx="55" cy="49" r="1.9" fill="#ff3b30" />
          <g stroke="#e8e8e8" strokeOpacity="0.55" fill="none" strokeWidth="1.6">
            <circle cx="50" cy="50" r="31" />
            <circle cx="50" cy="50" r="3" />
            <path d="M50 12 V38 M50 62 V88 M12 50 H38 M62 50 H88" />
          </g>
        </symbol>
      </defs>
    </svg>
  );
}

export function Portrait({
  id,
  portrait,
  className,
}: {
  id: (name: string) => string;
  portrait: PortraitId;
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden focusable="false">
      <use href={`#${id(portrait)}`} />
    </svg>
  );
}

export const KIND_LABEL: Record<CardKind, string> = {
  red: 'red agent',
  blue: 'blue agent',
  bystander: 'innocent bystander',
  assassin: 'the assassin',
};
