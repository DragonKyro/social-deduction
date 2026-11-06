# ui/shared/

Cross-game UI kit. Everything here is presentation-only: no game rules, no
hidden information.

## Theme (`theme.css`, imported once by `src/index.css`)

**Fonts** (self-hosted via @fontsource, OFL): use the CSS variables, never
the family names directly.

| Variable | Face | Intended for |
|---|---|---|
| `--font-ui` | Inter | Body text, controls, numbers |
| `--font-regal` | Cinzel | Avalon, Coup, headings everywhere |
| `--font-folk` | IM Fell English | One Night Werewolf (village folklore) |
| `--font-dossier` | Special Elite | Secret Hitler, Codenames (typewritten dossiers) |
| `--font-romance` | Playfair Display | Love Letter, Liar's Poker |
| `--font-rogue` | Pirata One | Skull, Liar's Dice, Cockroach Poker titles |

**Tokens**: `--bg-0..3`, `--line`, `--line-strong`, `--text`, `--text-dim`,
`--text-faint`, `--gold`, `--gold-bright`, `--gold-deep`, `--parchment`,
`--parchment-dark`, `--ink`, `--blood`, `--ember`, `--good`, `--evil`,
`--success`, `--danger`, `--shadow-sm|md|lg|card`, `--glow-gold`,
`--ease-out|in-out|spring`, `--dur-fast|med|slow`, `--card-ratio`.
Texture layers: `background-image: var(--grain)` (film grain) and
`var(--paper-fibre)` (paper stock) stack over any fill.

**Keyframes** (global names). Inside a `.module.css` file you **must** wrap them
in `global(...)` — CSS Modules renames bare animation names, which silently
breaks the reference: `animation: global(sd-deal-in) var(--dur-slow) var(--ease-out) both;`.
Keyframes defined inside your own module file need no wrapper. Available:
`sd-fade-in`, `sd-rise-in`, `sd-drop-in`, `sd-deal-in`, `sd-pop`,
`sd-stamp`, `sd-shake`, `sd-pulse-glow` (set `--sd-glow`), `sd-float`,
`sd-flicker`, `sd-sheen`, `sd-spin`, `sd-tumble`, `sd-drift`, `sd-twinkle`,
`sd-unfurl`.

Utility classes (plain global classes, usable from TSX): `.sd-rise-in`, `.sd-fade-in`, `.sd-pop`,
`.sd-shake`, `.sd-float`, `.sd-flicker`, `.sd-your-turn`, `.sd-stagger`
(children get `style={{ '--i': n }}`). `prefers-reduced-motion` is honoured
globally.

## Components

- `FlipCard` — 3D card flip between `back` and `front` (`revealed` prop),
  optional deal-in (`dealDelayMs`) and hover lift. **Only pass a `front`
  that the current view actually contains**; the DOM is inspectable.
- `svg.tsx` — `useSvgIds()` for collision-free `<defs>` ids (inline SVG ids
  are document-global), plus filter/gradient defs: `SoftShadow`, `Glow`,
  `PaperGrain`, `Emboss`, `Vignette`.
- `OnlineHostToggle` — the Multiplayer block on every setup screen.
- `launch.ts` — `launchGame({ module, options, playerNames, aiSeats, online })`
  starts a solo / hot-seat game or opens an online lobby.
- `ChatPanel` — room chat (lobby + the in-game drawer in `ui/game/OnlineOverlay`).

## Seat switching (hidden-info rule for UIs)

Use `useSeatSwitching()` from `@/store/gameStore` for any "switch to this
player" / pass-and-play control. It is disabled online (you only ever see
your own seat) and never allows switching to an AI seat. Don't call
`setLocalSeat` from a seat panel's onClick unconditionally.
