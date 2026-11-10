import type { CSSProperties, ReactNode } from 'react';
import styles from './FlipCard.module.css';

// A 3D card that flips between a hidden face (`back`, e.g. the card back)
// and a revealed face (`front`). Size it via `width` / `height` or style.
//
// Hidden-info note: this is presentation only. Never pass a real hidden value
// as `front` "just to animate it later" — if the view doesn't contain the
// value, render a back on both sides. The DOM is inspectable.

export interface FlipCardProps {
  /** Shown when `revealed` is true. */
  front: ReactNode;
  /** Shown when `revealed` is false (the card back). */
  back: ReactNode;
  revealed: boolean;
  width?: number | string;
  height?: number | string;
  /** Play the deal-in animation on mount; delay in ms for staggering. */
  dealDelayMs?: number | null;
  /** Hover lift (for interactive hand cards). */
  lift?: boolean;
  radius?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  title?: string;
}

export function FlipCard({
  front,
  back,
  revealed,
  width = 90,
  height = 126,
  dealDelayMs = null,
  lift = false,
  radius = 8,
  className,
  style,
  onClick,
  title,
}: FlipCardProps) {
  const sceneClass = [
    styles.scene,
    dealDelayMs !== null ? styles.dealt : '',
    lift ? styles.lift : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={sceneClass}
      style={{
        width,
        height,
        borderRadius: radius,
        ...(dealDelayMs !== null ? ({ '--sd-deal-delay': `${dealDelayMs}ms` } as CSSProperties) : {}),
        ...style,
      }}
      onClick={onClick}
      title={title}
      role={onClick ? 'button' : undefined}
    >
      <div className={`${styles.card} ${revealed ? styles.flipped : ''}`} style={{ borderRadius: radius }}>
        <div className={`${styles.face} ${styles.front}`}>{back}</div>
        <div className={`${styles.face} ${styles.back}`}>{revealed ? front : back}</div>
      </div>
    </div>
  );
}
