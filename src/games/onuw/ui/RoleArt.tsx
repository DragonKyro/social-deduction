import type { CSSProperties } from 'react';
import type { OnuwRoleId } from '../state';
import { ROLES } from '../roles';

// Stylized SVG role art for ONUW. Each role gets a 100×108 shield-card
// with a team-colored gradient + a unique central emblem. We split the
// emblems into a small library of glyphs (moon, eye, axe, hat, …) and
// compose them per role.

export interface RoleArtProps {
  role: OnuwRoleId;
  size?: number;
  style?: CSSProperties;
}

type Palette = { primary: string; secondary: string; emblem: string; rim: string };

const VILLAGE: Palette = {
  primary: '#1e3a8a',
  secondary: '#3b82f6',
  emblem: '#fef3c7',
  rim: '#cbd5e1',
};

const WOLF: Palette = {
  primary: '#7f1d1d',
  secondary: '#dc2626',
  emblem: '#fca5a5',
  rim: '#52525b',
};

const TANNER: Palette = {
  primary: '#854d0e',
  secondary: '#ca8a04',
  emblem: '#fef08a',
  rim: '#1f2937',
};

const SEER: Palette = {
  primary: '#1e1b4b',
  secondary: '#6366f1',
  emblem: '#e0e7ff',
  rim: '#a5b4fc',
};

const ROBBER: Palette = {
  primary: '#0f172a',
  secondary: '#475569',
  emblem: '#fde68a',
  rim: '#94a3b8',
};

const TROUBLEMAKER: Palette = {
  primary: '#831843',
  secondary: '#db2777',
  emblem: '#fbcfe8',
  rim: '#fda4af',
};

const DRUNK: Palette = {
  primary: '#3f3f46',
  secondary: '#71717a',
  emblem: '#fde68a',
  rim: '#a1a1aa',
};

const INSOMNIAC: Palette = {
  primary: '#1e293b',
  secondary: '#334155',
  emblem: '#bae6fd',
  rim: '#94a3b8',
};

const HUNTER: Palette = {
  primary: '#14532d',
  secondary: '#16a34a',
  emblem: '#fef3c7',
  rim: '#bbf7d0',
};

const MASON: Palette = {
  primary: '#1c1917',
  secondary: '#57534e',
  emblem: '#fde047',
  rim: '#a8a29e',
};

const MINION: Palette = {
  primary: '#450a0a',
  secondary: '#7f1d1d',
  emblem: '#fca5a5',
  rim: '#1f2937',
};

const WITCH: Palette = {
  primary: '#3b0764',
  secondary: '#7e22ce',
  emblem: '#f0abfc',
  rim: '#c084fc',
};

const ALPHA_WOLF: Palette = {
  primary: '#1c1917',
  secondary: '#991b1b',
  emblem: '#fde047',
  rim: '#facc15',
};

const MYSTIC_WOLF: Palette = {
  primary: '#581c87',
  secondary: '#a21caf',
  emblem: '#fbcfe8',
  rim: '#f0abfc',
};

const PRINCE: Palette = {
  primary: '#0c4a6e',
  secondary: '#0ea5e9',
  emblem: '#fef9c3',
  rim: '#fde047',
};

const PALETTES: Partial<Record<OnuwRoleId, Palette>> = {
  werewolf: WOLF,
  alphaWolf: ALPHA_WOLF,
  mysticWolf: MYSTIC_WOLF,
  dreamWolf: WOLF,
  minion: MINION,
  ricochetRhino: WOLF,
  squire: WOLF,
  mason: MASON,
  seer: SEER,
  apprenticeSeer: SEER,
  paranormalInvestigator: SEER,
  beholder: SEER,
  auraSeer: SEER,
  robber: ROBBER,
  bodySnatcher: ROBBER,
  troublemaker: TROUBLEMAKER,
  windyWendy: TROUBLEMAKER,
  villageIdiot: TROUBLEMAKER,
  drunk: DRUNK,
  insomniac: INSOMNIAC,
  hunter: HUNTER,
  villager: VILLAGE,
  innocentBystander: VILLAGE,
  witch: WITCH,
  doppelganger: WITCH,
  revealer: VILLAGE,
  curator: VILLAGE,
  tanner: TANNER,
  apprenticeTanner: TANNER,
  prince: PRINCE,
  cursed: VILLAGE,
  thing: VILLAGE,
  empath: VILLAGE,
  nostradamus: VILLAGE,
  familyMan: VILLAGE,
  defenderEr: VILLAGE,
  theSponge: VILLAGE,
};

function paletteFor(role: OnuwRoleId): Palette {
  if (PALETTES[role]) return PALETTES[role]!;
  const team = ROLES[role].team;
  if (team === 'werewolves') return WOLF;
  if (team === 'tanner') return TANNER;
  return VILLAGE;
}

function Shield({ p, id }: { p: Palette; id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={p.secondary} />
          <stop offset="100%" stopColor={p.primary} />
        </linearGradient>
      </defs>
      <path
        d="M50 6 L92 18 V52 C92 76 72 92 50 102 C28 92 8 76 8 52 V18 Z"
        fill={`url(#${id})`}
        stroke={p.rim}
        strokeWidth="2"
      />
    </>
  );
}

function Emblem({ role, p }: { role: OnuwRoleId; p: Palette }) {
  switch (role) {
    // === Werewolves family ===
    case 'werewolf':
    case 'dreamWolf':
      return (
        <g fill={p.emblem}>
          <path d="M28 38 L40 28 L46 36 L54 36 L60 28 L72 38 L66 60 Q50 72 34 60 Z" />
          <polygon points="44,52 48,62 52,52" fill={p.primary} />
          <circle cx="40" cy="48" r="2.5" fill={p.primary} />
          <circle cx="60" cy="48" r="2.5" fill={p.primary} />
          {role === 'dreamWolf' && (
            <text x="50" y="84" textAnchor="middle" fontSize="12" fill={p.emblem}>
              Zzz
            </text>
          )}
        </g>
      );
    case 'alphaWolf':
      return (
        <g fill={p.emblem}>
          <path d="M28 38 L40 28 L46 36 L54 36 L60 28 L72 38 L66 60 Q50 72 34 60 Z" />
          <circle cx="40" cy="48" r="2.5" fill={p.primary} />
          <circle cx="60" cy="48" r="2.5" fill={p.primary} />
          <text x="50" y="86" textAnchor="middle" fontSize="13" fontWeight="700" fill={p.emblem}>
            α
          </text>
        </g>
      );
    case 'mysticWolf':
      return (
        <g fill={p.emblem}>
          <path d="M28 38 L40 28 L46 36 L54 36 L60 28 L72 38 L66 60 Q50 72 34 60 Z" />
          <circle cx="40" cy="48" r="2.5" fill={p.primary} />
          <circle cx="60" cy="48" r="2.5" fill={p.primary} />
          <circle cx="50" cy="78" r="6" fill="none" stroke={p.emblem} strokeWidth="1.5" />
          <circle cx="50" cy="78" r="2" fill={p.emblem} />
        </g>
      );
    case 'minion':
      return (
        <g fill={p.emblem}>
          <path d="M32 32 Q50 22 68 32 V58 Q50 70 32 58 Z" />
          <circle cx="42" cy="46" r="3" fill={p.primary} />
          <circle cx="58" cy="46" r="3" fill={p.primary} />
          <rect x="46" y="58" width="3" height="6" fill={p.primary} />
          <rect x="51" y="58" width="3" height="6" fill={p.primary} />
        </g>
      );
    case 'ricochetRhino':
      return (
        <g fill={p.emblem}>
          <path d="M22 60 Q22 38 50 38 Q78 38 78 60 Z" />
          <path d="M50 32 L54 22 L58 38" stroke={p.emblem} strokeWidth="3" fill="none" />
          <circle cx="40" cy="52" r="2" fill={p.primary} />
        </g>
      );
    case 'squire':
      return (
        <g fill={p.emblem} stroke={p.primary} strokeWidth="0.8">
          <rect x="44" y="24" width="12" height="38" />
          <polygon points="40,62 60,62 50,80" />
          <circle cx="50" cy="32" r="4" fill={p.primary} />
        </g>
      );

    // === Village specialists ===
    case 'seer':
      return (
        <g fill={p.emblem}>
          <path d="M28 50 Q50 28 72 50 Q50 72 28 50 Z" stroke={p.primary} strokeWidth="1.5" />
          <circle cx="50" cy="50" r="8" fill={p.primary} />
          <circle cx="50" cy="50" r="3.5" fill={p.emblem} />
          <circle cx="22" cy="36" r="1.6" />
          <circle cx="78" cy="68" r="1.6" />
        </g>
      );
    case 'apprenticeSeer':
      return (
        <g fill={p.emblem}>
          <path d="M28 50 Q50 30 72 50" fill="none" stroke={p.emblem} strokeWidth="3" />
          <circle cx="50" cy="50" r="6" fill={p.primary} />
          <circle cx="50" cy="50" r="2.5" fill={p.emblem} />
        </g>
      );
    case 'paranormalInvestigator':
      return (
        <g fill={p.emblem}>
          <circle cx="44" cy="48" r="14" fill="none" stroke={p.emblem} strokeWidth="3" />
          <line x1="54" y1="58" x2="70" y2="74" stroke={p.emblem} strokeWidth="4" strokeLinecap="round" />
          <circle cx="44" cy="48" r="3" fill={p.emblem} />
        </g>
      );
    case 'beholder':
      return (
        <g fill={p.emblem}>
          <circle cx="50" cy="50" r="20" fill="none" stroke={p.emblem} strokeWidth="2" />
          <circle cx="50" cy="50" r="8" fill={p.primary} />
          <circle cx="50" cy="50" r="3" fill={p.emblem} />
        </g>
      );
    case 'auraSeer':
      return (
        <g fill="none" stroke={p.emblem} strokeWidth="2">
          <circle cx="50" cy="52" r="10" />
          <circle cx="50" cy="52" r="16" />
          <circle cx="50" cy="52" r="22" />
        </g>
      );

    case 'robber':
      return (
        <g fill={p.emblem}>
          <rect x="34" y="38" width="32" height="14" rx="2" />
          <rect x="32" y="48" width="36" height="22" rx="2" fill={p.primary} stroke={p.emblem} strokeWidth="1.5" />
          <rect x="46" y="56" width="8" height="6" fill={p.emblem} />
        </g>
      );
    case 'bodySnatcher':
      return (
        <g fill={p.emblem}>
          <circle cx="38" cy="36" r="6" />
          <circle cx="62" cy="64" r="6" />
          <path d="M38 42 L62 58" stroke={p.emblem} strokeWidth="2.5" />
          <polygon points="56,52 62,58 56,60" />
          <polygon points="44,48 38,42 44,40" />
        </g>
      );

    case 'troublemaker':
      return (
        <g fill={p.emblem}>
          <path d="M40 30 L44 50 L36 70" fill="none" stroke={p.emblem} strokeWidth="3" />
          <path d="M60 30 L56 50 L64 70" fill="none" stroke={p.emblem} strokeWidth="3" />
          <polygon points="36,70 40,72 38,76" />
          <polygon points="64,70 60,72 62,76" />
        </g>
      );
    case 'windyWendy':
      return (
        <g fill="none" stroke={p.emblem} strokeWidth="3" strokeLinecap="round">
          <path d="M20 38 Q40 32 60 38 Q80 44 70 50" />
          <path d="M18 50 Q40 44 64 50 Q84 56 72 62" />
          <path d="M22 64 Q44 58 60 64" />
        </g>
      );
    case 'villageIdiot':
      return (
        <g fill={p.emblem}>
          <circle cx="50" cy="42" r="14" />
          <polygon points="40,28 50,18 60,28" />
          <circle cx="44" cy="42" r="2" fill={p.primary} />
          <circle cx="56" cy="42" r="2" fill={p.primary} />
          <path d="M40 50 Q50 56 60 50" fill="none" stroke={p.primary} strokeWidth="2" />
          <circle cx="36" cy="34" r="2" />
          <circle cx="64" cy="34" r="2" />
        </g>
      );

    case 'drunk':
      return (
        <g fill={p.emblem}>
          <rect x="42" y="26" width="16" height="40" rx="2" />
          <rect x="40" y="24" width="20" height="6" />
          <ellipse cx="50" cy="58" rx="6" ry="4" fill={p.primary} />
        </g>
      );

    case 'insomniac':
      return (
        <g fill={p.emblem}>
          <path d="M62 30 a22 22 0 1 0 8 32 a18 18 0 1 1 -8 -32 Z" />
          <circle cx="78" cy="32" r="1.5" />
          <circle cx="72" cy="42" r="1" />
        </g>
      );

    case 'hunter':
      return (
        <g fill={p.emblem}>
          <path d="M30 30 L70 70" stroke={p.emblem} strokeWidth="3" fill="none" />
          <polygon points="30,30 38,32 30,38" />
          <path d="M70 70 m-7 -2 a8 8 0 1 1 14 -2" fill="none" stroke={p.emblem} strokeWidth="2.5" />
        </g>
      );

    case 'mason':
      return (
        <g fill={p.emblem} stroke={p.primary} strokeWidth="0.8">
          <polygon points="50,24 76,40 76,68 50,84 24,68 24,40" />
          <circle cx="50" cy="54" r="6" fill={p.primary} />
        </g>
      );

    case 'villager':
    case 'innocentBystander':
      return (
        <g fill={p.emblem}>
          <circle cx="50" cy="40" r="10" />
          <path d="M30 72 Q50 56 70 72 V80 H30 Z" />
        </g>
      );

    case 'witch':
      return (
        <g fill={p.emblem}>
          <ellipse cx="50" cy="50" rx="22" ry="14" />
          <path d="M40 30 L48 46 L60 24 L52 46 Z" />
          <circle cx="50" cy="58" r="3" fill={p.primary} />
        </g>
      );
    case 'doppelganger':
      return (
        <g fill={p.emblem}>
          <circle cx="40" cy="40" r="10" />
          <circle cx="60" cy="60" r="10" />
          <rect x="44" y="44" width="12" height="12" fill={p.primary} />
        </g>
      );

    case 'revealer':
      return (
        <g fill={p.emblem}>
          <rect x="32" y="32" width="36" height="48" rx="3" stroke={p.primary} strokeWidth="2" />
          <path d="M44 56 L50 64 L62 50" fill="none" stroke={p.primary} strokeWidth="3" />
        </g>
      );

    case 'curator':
      return (
        <g fill={p.emblem}>
          <rect x="34" y="44" width="32" height="24" />
          <rect x="30" y="38" width="40" height="8" />
          <rect x="46" y="68" width="8" height="14" />
          <rect x="38" y="80" width="24" height="4" />
        </g>
      );

    case 'tanner':
    case 'apprenticeTanner':
      return (
        <g fill={p.emblem}>
          <path d="M30 70 L40 28 L60 28 L70 70 Z" />
          <circle cx="50" cy="50" r="8" fill={p.primary} />
          <path d="M44 60 Q50 64 56 60" fill="none" stroke={p.primary} strokeWidth="2" />
          {role === 'apprenticeTanner' && (
            <text x="50" y="86" textAnchor="middle" fontSize="11" fill={p.emblem}>
              ★
            </text>
          )}
        </g>
      );

    case 'prince':
      return (
        <g fill={p.emblem}>
          <path d="M26 48 L36 30 L44 48 L50 28 L56 48 L64 30 L74 48 L70 62 H30 Z" />
          <rect x="30" y="62" width="40" height="6" />
        </g>
      );

    case 'cursed':
      return (
        <g fill={p.emblem}>
          <circle cx="50" cy="50" r="20" fill="none" stroke={p.emblem} strokeWidth="2" />
          <text x="50" y="58" textAnchor="middle" fontSize="22" fontWeight="700" fill={p.emblem}>
            ✦
          </text>
        </g>
      );

    case 'thing':
      return (
        <g fill={p.emblem}>
          <path d="M50 30 L60 50 H56 V70 H44 V50 H40 Z" />
        </g>
      );

    case 'empath':
      return (
        <g fill={p.emblem}>
          <path d="M50 72 C20 58 28 32 50 44 C72 32 80 58 50 72 Z" />
        </g>
      );

    case 'nostradamus':
      return (
        <g fill={p.emblem}>
          <circle cx="50" cy="52" r="20" fill={p.primary} stroke={p.emblem} strokeWidth="2" />
          <text x="50" y="58" textAnchor="middle" fontSize="20" fill={p.emblem}>
            ☄
          </text>
        </g>
      );

    case 'familyMan':
      return (
        <g fill={p.emblem}>
          <circle cx="38" cy="40" r="7" />
          <circle cx="62" cy="40" r="7" />
          <circle cx="50" cy="60" r="6" />
          <path d="M28 76 Q38 64 50 70 Q62 64 72 76 V82 H28 Z" />
        </g>
      );

    case 'defenderEr':
      return (
        <g fill={p.emblem}>
          <path d="M50 24 L72 32 V56 C72 70 60 80 50 84 C40 80 28 70 28 56 V32 Z" />
          <path d="M44 54 L48 60 L58 48" fill="none" stroke={p.primary} strokeWidth="3" />
        </g>
      );

    case 'theSponge':
      return (
        <g fill={p.emblem}>
          <rect x="28" y="32" width="44" height="40" rx="6" />
          <circle cx="38" cy="44" r="2.5" fill={p.primary} />
          <circle cx="50" cy="50" r="2.5" fill={p.primary} />
          <circle cx="62" cy="42" r="2.5" fill={p.primary} />
          <circle cx="42" cy="58" r="2.5" fill={p.primary} />
          <circle cx="58" cy="60" r="2.5" fill={p.primary} />
        </g>
      );
  }
}

export function RoleArt({ role, size = 96, style }: RoleArtProps) {
  const p = paletteFor(role);
  const gradId = `bg-${role}`;
  return (
    <svg
      width={size}
      height={size * 1.08}
      viewBox="0 0 100 108"
      style={style}
      role="img"
      aria-label={ROLES[role].name}
    >
      <Shield p={p} id={gradId} />
      <Emblem role={role} p={p} />
    </svg>
  );
}

// Small badge — team-colored circle. Shown next to role names in lists.
export function TeamBadge({ role, size = 14 }: { role: OnuwRoleId; size?: number }) {
  const team = ROLES[role].team;
  const color = team === 'werewolves' ? '#dc2626' : team === 'tanner' ? '#ca8a04' : '#3b82f6';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={team}>
      <circle cx="8" cy="8" r="7" fill={color} stroke="#0b0f17" strokeWidth="1.5" />
    </svg>
  );
}
