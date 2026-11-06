import { useMemo, type CSSProperties } from 'react';
import styles from './Sky.module.css';

// Full-bleed animated backdrop. `mode` crossfades between a deep moonlit
// night (twinkling stars, drifting fog, a sleeping village) and a warm dawn.
// Pure decoration: aria-hidden, pointer-events: none.

export type SkyMode = 'dusk' | 'night' | 'dawn';

// Deterministic star field (no Math.random → stable between renders).
function stars(count: number) {
  let x = 0x2f6b9d31;
  const rnd = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  };
  return Array.from({ length: count }, () => ({
    left: rnd() * 100,
    top: rnd() * 62,
    size: 1 + rnd() * 2.2,
    delay: rnd() * 6,
    dur: 2.4 + rnd() * 4,
  }));
}

export function Sky({ mode }: { mode: SkyMode }) {
  const field = useMemo(() => stars(70), []);
  return (
    <div className={`${styles.sky} ${styles[mode]}`} aria-hidden>
      <div className={styles.nightLayer}>
        <div className={styles.moonHalo} />
        <div className={styles.moon} />
        {field.map((s, i) => (
          <span
            key={i}
            className={styles.star}
            style={
              {
                left: `${s.left}%`,
                top: `${s.top}%`,
                width: s.size,
                height: s.size,
                animationDelay: `${s.delay}s`,
                animationDuration: `${s.dur}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className={styles.dawnLayer}>
        <div className={styles.sun} />
      </div>
      <div className={`${styles.fog} ${styles.fogA}`} />
      <div className={`${styles.fog} ${styles.fogB}`} />
      <svg className={styles.village} viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice">
        <path
          d="M0 220 L0 150 Q 120 120 240 140 Q 360 110 520 135 Q 700 100 860 132 Q 1020 112 1200 140 L1200 220 Z"
          className={styles.hills}
        />
        <g className={styles.houses}>
          <path d="M90 170 L90 132 L118 108 L146 132 L146 170 Z" />
          <path d="M160 172 L160 144 L180 126 L200 144 L200 172 Z" />
          <path d="M380 166 L380 120 L412 92 L444 120 L444 166 Z" />
          <rect x="420" y="80" width="10" height="26" />
          <path d="M470 168 L470 136 L492 118 L514 136 L514 168 Z" />
          <path d="M600 170 L600 96 L612 60 L624 96 L624 170 Z" />
          <path d="M760 168 L760 128 L790 102 L820 128 L820 168 Z" />
          <path d="M980 170 L980 138 L1004 118 L1028 138 L1028 170 Z" />
          <path d="M1060 172 L1060 132 L1092 106 L1124 132 L1124 172 Z" />
          {/* pines */}
          <path d="M260 175 L280 110 L300 175 Z M300 178 L322 100 L344 178 Z M680 176 L700 118 L720 176 Z M880 176 L904 104 L928 176 Z" />
        </g>
        <g className={styles.windows}>
          <rect x="112" y="140" width="9" height="10" style={{ animationDelay: '0.4s' }} />
          <rect x="404" y="128" width="10" height="11" style={{ animationDelay: '1.3s' }} />
          <rect x="782" y="134" width="9" height="10" style={{ animationDelay: '2.1s' }} />
          <rect x="1086" y="140" width="10" height="10" style={{ animationDelay: '0.9s' }} />
          <rect x="608" y="104" width="6" height="12" style={{ animationDelay: '1.7s' }} />
        </g>
      </svg>
    </div>
  );
}
