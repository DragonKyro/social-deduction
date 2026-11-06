import { MAX_REJECTED_PROPOSALS } from '../quest-tracks';
import type { AvalonPublicState } from '../state';
import { QuestMedallion, type MedallionState } from './Tokens';
import { roman } from './turns';
import styles from './GameView.module.css';

// The quest board: five embossed medallions (team size, 2-fail marker,
// enamelled result) and the five-step vote track. `holdQuest` keeps one
// quest's medallion unresolved until its card reveal has played out.

export function QuestBoard({ view, holdQuest }: { view: AvalonPublicState; holdQuest: number | null }) {
  const over = view.phase === 'gameOver';
  const successes = view.questHistory.filter((q) => q.result === 'success' && q.questNumber !== holdQuest).length;
  const fails = view.questHistory.filter((q) => q.result === 'fail' && q.questNumber !== holdQuest).length;
  return (
    <section className={styles.board} aria-label="Quest board">
      <div className={styles.boardTitle}>
        <span>The Quests</span>
        <span className={styles.score} aria-label={`${successes} quests succeeded, ${fails} failed`}>
          <b className={styles.scoreGood}>{successes}</b> · <b className={styles.scoreEvil}>{fails}</b>
        </span>
      </div>
      <ol className={styles.medallions}>
        {view.questTrack.map((q, i) => {
          const n = i + 1;
          const rec = view.questHistory.find((h) => h.questNumber === n && n !== holdQuest);
          const state: MedallionState = rec
            ? rec.result
            : n === view.currentQuestNumber && !over
              ? 'current'
              : 'pending';
          const desc = rec
            ? `Quest ${n}: ${rec.result === 'success' ? 'succeeded' : 'failed'} with ${rec.failCount} fail card${rec.failCount === 1 ? '' : 's'}`
            : `Quest ${n}: team of ${q.teamSize}${q.failsRequired > 1 ? `, needs ${q.failsRequired} fails to fail` : ''}`;
          return (
            <li key={n} className={`${styles.medallion} ${state === 'current' ? styles.medallionCurrent : ''}`} aria-label={desc} title={desc}>
              <QuestMedallion
                quest={n}
                teamSize={q.teamSize}
                failsRequired={q.failsRequired}
                state={state}
                failCount={rec?.failCount}
              />
              <span className={styles.medallionLabel}>Quest {roman(n)}</span>
            </li>
          );
        })}
      </ol>
      <div className={styles.voteTrack} aria-label={`Rejected proposals this quest: ${view.failedProposalsThisQuest} of ${MAX_REJECTED_PROPOSALS}`}>
        <span className={styles.voteTrackLabel}>Vote track</span>
        <ol>
          {Array.from({ length: MAX_REJECTED_PROPOSALS }, (_, i) => {
            const filled = i < view.failedProposalsThisQuest;
            const isNext = i === view.failedProposalsThisQuest && !over;
            return (
              <li
                key={i}
                className={[styles.notch, filled ? styles.notchFilled : '', isNext ? styles.notchNext : '', i === MAX_REJECTED_PROPOSALS - 1 ? styles.notchDoom : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                {i + 1}
              </li>
            );
          })}
        </ol>
        <span className={styles.voteTrackHint}>5th rejection: evil wins</span>
      </div>
    </section>
  );
}
