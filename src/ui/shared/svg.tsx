import { useId } from 'react';

// SVG helpers shared by every game's art.
//
// IDs inside inline SVG are document-global: two <RoleArt/> instances that
// both declare `<linearGradient id="bg">` will silently share (or clobber)
// each other's gradients. Always derive ids from `useSvgIds`.

/**
 * Stable, document-unique ids for an SVG's defs. `const id = useSvgIds();`
 * then `id('glow')` → `"sd-r12-glow"`, and `id.url('glow')` → `"url(#sd-r12-glow)"`.
 */
export function useSvgIds(): ((name: string) => string) & { url: (name: string) => string } {
  const base = `sd-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const fn = ((name: string) => `${base}-${name}`) as ((name: string) => string) & {
    url: (name: string) => string;
  };
  fn.url = (name: string) => `url(#${base}-${name})`;
  return fn;
}

/** Soft drop shadow filter. Usage: <g filter={id.url('shadow')}>. */
export function SoftShadow({ id, dy = 2, blur = 2.5, opacity = 0.55 }: { id: string; dy?: number; blur?: number; opacity?: number }) {
  return (
    <filter id={id} x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation={blur} />
      <feOffset dy={dy} result="o" />
      <feComponentTransfer>
        <feFuncA type="linear" slope={opacity} />
      </feComponentTransfer>
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

/** Outer glow in a given colour (magic, embers, highlights). */
export function Glow({ id, color, blur = 4, strength = 1 }: { id: string; color: string; blur?: number; strength?: number }) {
  return (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result="b" />
      <feFlood floodColor={color} floodOpacity={strength} />
      <feComposite in2="b" operator="in" result="g" />
      <feMerge>
        <feMergeNode in="g" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

/**
 * Paper / parchment grain. Composites fractal noise over the source so flat
 * fills read as printed card stock. `amount` 0..1.
 */
export function PaperGrain({ id, amount = 0.18, freq = 0.85, seed = 3 }: { id: string; amount?: number; freq?: number; seed?: number }) {
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={3} seed={seed} result="noise" />
      <feColorMatrix
        in="noise"
        type="matrix"
        values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${amount} 0`}
        result="grain"
      />
      <feComposite in="grain" in2="SourceGraphic" operator="in" result="g2" />
      <feMerge>
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="g2" />
      </feMerge>
    </filter>
  );
}

/**
 * Embossed / engraved metal look for emblems (gold leaf, silver, iron).
 * Apply to a filled shape; lighting comes from the top-left.
 */
export function Emboss({ id, depth = 1.6, light = '#fff6d8' }: { id: string; depth?: number; light?: string }) {
  return (
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation={depth} result="blur" />
      <feSpecularLighting in="blur" surfaceScale={depth * 2} specularConstant={0.9} specularExponent={18} lightingColor={light} result="spec">
        <feDistantLight azimuth={225} elevation={42} />
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn" />
      <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1={0} k2={1} k3={0.55} k4={0} />
    </filter>
  );
}

/** Radial vignette gradient (use as a rect overlay with fill={id.url('vig')}). */
export function Vignette({ id, color = '#000', inner = 0.55, opacity = 0.7 }: { id: string; color?: string; inner?: number; opacity?: number }) {
  return (
    <radialGradient id={id} cx="50%" cy="45%" r="75%">
      <stop offset={`${inner * 100}%`} stopColor={color} stopOpacity={0} />
      <stop offset="100%" stopColor={color} stopOpacity={opacity} />
    </radialGradient>
  );
}
