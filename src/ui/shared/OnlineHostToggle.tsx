import styles from './OnlineHostToggle.module.css';

// The "Multiplayer" block every setup screen shows. Online rooms get a
// generated code (shown in the lobby, with an invite link), so there's
// nothing to type here.

export function OnlineHostToggle({
  online,
  onChange,
  className,
}: {
  online: boolean;
  onChange: (online: boolean) => void;
  className?: string;
}) {
  return (
    <section className={`${styles.root} ${className ?? ''}`}>
      <h3 className={styles.title}>Multiplayer</h3>
      <div className={styles.options} role="radiogroup" aria-label="Where to play">
        <button
          type="button"
          role="radio"
          aria-checked={!online}
          className={`${styles.option} ${!online ? styles.selected : ''}`}
          onClick={() => onChange(false)}
        >
          <span className={styles.icon} aria-hidden>
            ⌂
          </span>
          <span>
            <strong>This device</strong>
            <small>Pass-and-play, or against AI seats</small>
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={online}
          className={`${styles.option} ${online ? styles.selected : ''}`}
          onClick={() => onChange(true)}
        >
          <span className={styles.icon} aria-hidden>
            ⇄
          </span>
          <span>
            <strong>Host online</strong>
            <small>Friends join with a room code. Everyone sees only their own secrets.</small>
          </span>
        </button>
      </div>
    </section>
  );
}
