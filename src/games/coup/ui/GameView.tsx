import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { CoupGameAction } from '../actions';
import { CHARACTERS } from '../characters';
import { characterAction } from '../characters';
import type {
  CoupCharacter,
  CoupPublicSeatState,
  CoupPublicState,
} from '../state';
import { CharacterArt, CategoryBadge } from './CharacterArt';
import styles from './GameView.module.css';

// ============================================================================
// Coup — game view (hot-seat).
//
// Layout: main column (game state + action panel) + cheatsheet aside.
// The cheatsheet is always visible; it shows every character in this match's
// deck with their power. This is the "cheatsheet during gameplay" the user
// asked for.
// ============================================================================

export function CoupGameView() {
  const publicView = useGameStore((s) => s.publicView);
  const localSeat = useGameStore((s) => s.localSeat);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);
  if (!publicView) return null;
  const view = publicView.view as CoupPublicState;

  const dispatchAction = (a: CoupGameAction) => dispatch(a);

  return (
    <div className={styles.root}>
      <div className={styles.main}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <h2 className={styles.title}>Coup</h2>
            <p className={styles.subtitle}>
              {rulesetLabel(view)} · {view.seats.length} players · {view.deckSize} in deck
            </p>
          </div>
          <button onClick={exitGame}>Exit</button>
        </header>

        <SeatBoard view={view} localSeat={localSeat} />

        <PhaseRouter
          view={view}
          localSeat={localSeat}
          rotateSeat={setLocalSeat}
          dispatch={dispatchAction}
        />

        <LogPanel view={view} />
      </div>
      <aside className={styles.aside}>
        <div className={styles.panel}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>Cheatsheet</h3>
          <p className={styles.subtitle} style={{ marginBottom: 8 }}>
            Characters in this match&apos;s deck. Tap a character at the table to call out a
            claim or a block.
          </p>
          <Cheatsheet view={view} />
        </div>
      </aside>
    </div>
  );
}

function rulesetLabel(view: CoupPublicState): string {
  if (view.ruleset === 'classic') return 'Classic';
  if (view.expansions.includes('anarchy')) return 'G54 + Anarchy';
  return 'G54';
}

// ============================================================================
// Top board: seat strips with coin count + influence cards.
// ============================================================================

function SeatBoard({ view, localSeat }: { view: CoupPublicState; localSeat: number | null }) {
  return (
    <div className={styles.seatGrid}>
      {view.seats.map((s) => (
        <SeatTile key={s.index} seat={s} active={view.currentSeat === s.index} isLocal={s.index === localSeat} />
      ))}
    </div>
  );
}

function SeatTile({
  seat,
  active,
  isLocal,
}: {
  seat: CoupPublicSeatState;
  active: boolean;
  isLocal: boolean;
}) {
  const cls = [
    styles.seat,
    active && styles.seatActive,
    isLocal && styles.seatYou,
    seat.eliminated && styles.seatDead,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <div className={styles.seatHeader}>
        <span className={styles.seatName}>
          {seat.name}
          {isLocal && <span style={{ color: '#60a5fa', fontSize: 11, marginLeft: 6 }}>(you)</span>}
        </span>
        <span className={styles.seatCoins}>{seat.coins} ¢</span>
      </div>
      <div className={styles.seatInfluences}>
        {seat.influences.map((inf, i) => (
          <div key={i} className={`${styles.influenceCard} ${inf.revealed ? styles.influenceCardRevealed : ''}`}>
            {inf.revealed && inf.char ? CHARACTERS[inf.char].name.slice(0, 4) : '?'}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>
        Seat {seat.index + 1}
        {seat.eliminated && <span style={{ color: '#f87171', marginLeft: 6 }}>☠</span>}
      </div>
    </div>
  );
}

// ============================================================================
// Phase router
// ============================================================================

function PhaseRouter({
  view,
  localSeat,
  rotateSeat,
  dispatch,
}: {
  view: CoupPublicState;
  localSeat: number | null;
  rotateSeat: (seat: number) => void;
  dispatch: (a: CoupGameAction) => void;
}) {
  if (view.phase === 'gameOver') {
    return (
      <div className={styles.panel}>
        <div className={styles.gameOverBanner}>
          🏆 {view.seats[view.winnerSeat!]?.name ?? '???'} wins!
        </div>
      </div>
    );
  }

  // Identify the seat that needs to act in the current phase. For most phases
  // that's the current player. For lose-influence / spy-peek / exchange the
  // seat is dictated by the pending action.
  const actorSeat = currentActor(view);
  const localIsActor = localSeat === actorSeat;

  // Hot-seat cover screen: if the local seat isn't the actor, prompt to pass
  // the device. We exclude challenge windows from the cover-screen flow —
  // any seat may challenge so we show the full board.
  const isWindowPhase =
    view.phase === 'awaitingChallenge' ||
    view.phase === 'awaitingBlock' ||
    view.phase === 'awaitingBlockChallenge';

  if (!isWindowPhase && !localIsActor && actorSeat !== null) {
    const next = view.seats[actorSeat]!;
    return (
      <div className={styles.coverScreen}>
        <div className={styles.coverInner}>
          <h2>Pass the device</h2>
          <p>It&apos;s {next.name}&apos;s turn to act.</p>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>Everyone else, look away.</p>
          <button className={styles.primary} onClick={() => rotateSeat(actorSeat)}>
            I am {next.name}
          </button>
        </div>
      </div>
    );
  }

  switch (view.phase) {
    case 'turnStart':
      return <TurnStartPanel view={view} dispatch={dispatch} />;
    case 'awaitingChallenge':
      return <ChallengeWindow view={view} kind="action" localSeat={localSeat} dispatch={dispatch} />;
    case 'awaitingBlock':
      return <BlockWindow view={view} localSeat={localSeat} dispatch={dispatch} />;
    case 'awaitingBlockChallenge':
      return <ChallengeWindow view={view} kind="block" localSeat={localSeat} dispatch={dispatch} />;
    case 'loseInfluence':
      return <LoseInfluencePanel view={view} dispatch={dispatch} />;
    case 'exchangePick':
      return <ExchangePanel view={view} dispatch={dispatch} />;
    case 'spyPeek':
      return <SpyPeekPanel view={view} dispatch={dispatch} />;
    default:
      return null;
  }
}

// Whose action is the phase blocking on?
function currentActor(view: CoupPublicState): number | null {
  const p = view.pending;
  switch (view.phase) {
    case 'turnStart':
      return view.currentSeat;
    case 'awaitingChallenge':
    case 'awaitingBlock':
    case 'awaitingBlockChallenge':
      return null; // anyone can challenge/pass
    case 'loseInfluence':
      return p?.loseInfluencePending?.seat ?? null;
    case 'exchangePick':
    case 'spyPeek':
      return p?.by ?? null;
    default:
      return null;
  }
}

// ============================================================================
// Phase: turnStart — active player picks an action.
// ============================================================================

function TurnStartPanel({
  view,
  dispatch,
}: {
  view: CoupPublicState;
  dispatch: (a: CoupGameAction) => void;
}) {
  const cur = view.seats[view.currentSeat]!;
  const localIsCurrent = view.yourSeat === view.currentSeat;
  const mustCoup = cur.coins >= 10;
  const [target, setTarget] = useState<number | null>(null);
  const [mode, setMode] = useState<
    | 'idle'
    | 'coup'
    | 'foreignAid'
    | 'character'
  >('idle');
  const [claim, setClaim] = useState<CoupCharacter | null>(null);
  const [mercenaryPartner, setMercenaryPartner] = useState<number | null>(null);
  const [inquisitorBranch, setInquisitorBranch] = useState<'exchange' | 'peek'>('exchange');
  const [peekCardIndex, setPeekCardIndex] = useState<0 | 1>(0);

  const reset = () => {
    setMode('idle');
    setClaim(null);
    setTarget(null);
    setMercenaryPartner(null);
    setInquisitorBranch('exchange');
    setPeekCardIndex(0);
  };

  if (!localIsCurrent) {
    return (
      <div className={styles.panel}>
        <h3 style={{ marginTop: 0 }}>Waiting on {cur.name}…</h3>
      </div>
    );
  }

  // 10-coin rule: only Coup is legal.
  if (mustCoup || mode === 'coup') {
    const eligible = view.seats.filter((s) => !s.eliminated && s.index !== view.currentSeat);
    return (
      <div className={styles.panel}>
        <h3 style={{ marginTop: 0 }}>{mustCoup ? 'You have 10+ coins — you MUST Coup.' : 'Coup'}</h3>
        <p className={styles.subtitle}>Pick a target. Coup costs 7 coins.</p>
        <div className={styles.targetGrid}>
          {eligible.map((s) => (
            <button
              key={s.index}
              className={styles.targetBtn}
              onClick={() => {
                dispatch({ type: 'declareGeneral', generalId: 'coup', target: s.index });
                reset();
              }}
            >
              {s.name} <span style={{ color: '#94a3b8' }}>({s.coins} ¢)</span>
            </button>
          ))}
        </div>
        {!mustCoup && (
          <div className={styles.actions} style={{ marginTop: 8 }}>
            <button className={styles.muted} onClick={reset}>
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'character' && claim) {
    const charAct = characterAction(claim)!;
    const needsTarget = charAct.target === 'other';
    const eligible = view.seats.filter((s) => !s.eliminated && s.index !== view.currentSeat);

    return (
      <div className={styles.panel}>
        <h3 style={{ marginTop: 0 }}>Claim {CHARACTERS[claim].name}</h3>
        <p className={styles.subtitle}>
          {CHARACTERS[claim].description}
          {charAct.cost > 0 && <> · Cost: {charAct.cost} coins</>}
        </p>

        {charAct.id === 'inquisitorExchange' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              className={`${styles.actionBtn} ${inquisitorBranch === 'exchange' ? styles.primary : ''}`}
              onClick={() => setInquisitorBranch('exchange')}
            >
              <span className={styles.actionBtnLabel}>Exchange 1 with deck</span>
            </button>
            <button
              className={`${styles.actionBtn} ${inquisitorBranch === 'peek' ? styles.primary : ''}`}
              onClick={() => setInquisitorBranch('peek')}
            >
              <span className={styles.actionBtnLabel}>Peek a target</span>
            </button>
          </div>
        )}

        {needsTarget && (
          <>
            <p className={styles.subtitle}>Target:</p>
            <div className={styles.targetGrid}>
              {eligible.map((s) => (
                <button
                  key={s.index}
                  className={styles.targetBtn}
                  onClick={() => setTarget(s.index)}
                  style={target === s.index ? { borderColor: '#60a5fa' } : undefined}
                >
                  {s.name} <span style={{ color: '#94a3b8' }}>({s.coins} ¢)</span>
                </button>
              ))}
            </div>
          </>
        )}

        {(charAct.id === 'spyPeek' ||
          (charAct.id === 'inquisitorExchange' && inquisitorBranch === 'peek')) && target !== null && (
          <div style={{ marginTop: 8 }}>
            <p className={styles.subtitle}>Which card to peek?</p>
            <div className={styles.actions}>
              {[0, 1].map((i) => (
                <button
                  key={i}
                  className={`${styles.actionBtn} ${peekCardIndex === i ? styles.primary : ''}`}
                  onClick={() => setPeekCardIndex(i as 0 | 1)}
                >
                  Card {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {charAct.id === 'mercenaryHire' && (
          <div style={{ marginTop: 8 }}>
            <p className={styles.subtitle}>Pick your partner (they pay 1 coin too):</p>
            <div className={styles.targetGrid}>
              {view.seats
                .filter((s) => !s.eliminated && s.index !== view.currentSeat && s.index !== target && s.coins > 0)
                .map((s) => (
                  <button
                    key={s.index}
                    className={styles.targetBtn}
                    style={mercenaryPartner === s.index ? { borderColor: '#60a5fa' } : undefined}
                    onClick={() => setMercenaryPartner(s.index)}
                  >
                    {s.name} <span style={{ color: '#94a3b8' }}>({s.coins} ¢)</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        <div className={styles.actions} style={{ marginTop: 12 }}>
          <button className={styles.muted} onClick={reset}>
            Cancel
          </button>
          <button
            className={styles.primary}
            disabled={
              (needsTarget && target === null) ||
              (charAct.id === 'mercenaryHire' && mercenaryPartner === null) ||
              cur.coins < charAct.cost
            }
            onClick={() => {
              dispatch({
                type: 'declareCharacter',
                claimedCharacter: claim,
                characterActionId: charAct.id,
                target: target ?? undefined,
                mercenaryPartner: mercenaryPartner ?? undefined,
                inquisitorBranch: charAct.id === 'inquisitorExchange' ? inquisitorBranch : undefined,
                inquisitorPeekCardIndex:
                  charAct.id === 'inquisitorExchange' && inquisitorBranch === 'peek'
                    ? peekCardIndex
                    : charAct.id === 'spyPeek'
                      ? peekCardIndex
                      : undefined,
              });
              reset();
            }}
          >
            Claim
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'foreignAid') {
    // Should never sit here — declared immediately. Defensive only.
    return null;
  }

  // Default: action picker.
  const claimableChars = view.activeCharacters.filter((c) => CHARACTERS[c].action !== null);
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>{cur.name}, choose your action</h3>
      <div className={styles.actionRow}>
        <button
          className={styles.actionBtn}
          onClick={() => dispatch({ type: 'declareGeneral', generalId: 'income' })}
        >
          <span className={styles.actionBtnLabel}>Income</span>
          <span className={styles.actionBtnSub}>+1 coin · no challenge</span>
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => dispatch({ type: 'declareGeneral', generalId: 'foreignAid' })}
        >
          <span className={styles.actionBtnLabel}>Foreign Aid</span>
          <span className={styles.actionBtnSub}>+2 coins · Duke/Banker can block</span>
        </button>
        <button
          className={styles.actionBtn}
          disabled={cur.coins < 7}
          onClick={() => setMode('coup')}
        >
          <span className={styles.actionBtnLabel}>Coup</span>
          <span className={styles.actionBtnSub}>pay 7 · target loses 1 influence</span>
        </button>
      </div>
      <h4 style={{ marginTop: 14, marginBottom: 6, fontSize: 13, color: '#cbd5e1' }}>
        Claim a character
      </h4>
      <div className={styles.actionRow}>
        {claimableChars.map((c) => {
          const a = CHARACTERS[c].action!;
          const canAfford = cur.coins >= a.cost;
          return (
            <button
              key={c}
              className={styles.actionBtn}
              disabled={!canAfford}
              onClick={() => {
                setClaim(c);
                setMode('character');
              }}
            >
              <span className={styles.actionBtnLabel}>{CHARACTERS[c].name}</span>
              <span className={styles.actionBtnSub}>{a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Phase: awaitingChallenge / awaitingBlockChallenge
// ============================================================================

function ChallengeWindow({
  view,
  kind,
  localSeat,
  dispatch,
}: {
  view: CoupPublicState;
  kind: 'action' | 'block';
  localSeat: number | null;
  dispatch: (a: CoupGameAction) => void;
}) {
  const p = view.pending!;
  const claimer = kind === 'action' ? p.by : p.blocker!.by;
  const claimerName = view.seats[claimer]?.name ?? '???';
  const claim =
    kind === 'action'
      ? p.claimedCharacter
        ? CHARACTERS[p.claimedCharacter].name
        : 'an action'
      : p.blocker
        ? CHARACTERS[p.blocker.character].name
        : '???';

  const me = localSeat;
  const canActAsMe = me !== null && me !== claimer && !view.seats[me]!.eliminated;
  const alreadyPassed = me !== null && p.passes.includes(me);
  const targetIfAny = p.target !== null ? view.seats[p.target]?.name : null;

  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>
        {kind === 'action' ? 'Challenge window' : 'Block challenge window'}
      </h3>
      <p className={styles.subtitle}>
        {claimerName} claims <strong>{claim}</strong>
        {targetIfAny && kind === 'action' ? ` on ${targetIfAny}` : ''}.
        {kind === 'action'
          ? ' Any opponent may challenge or pass.'
          : ' Any opponent may challenge the block or pass.'}
      </p>
      <p className={styles.subtitle}>
        Passed: {p.passes.length === 0 ? 'nobody yet' : p.passes.map((s) => view.seats[s]?.name).join(', ')}
      </p>
      {me === null && (
        <p className={styles.subtitle} style={{ color: '#fbbf24' }}>
          Pick a seat from the seat board to act as them in this challenge window.
        </p>
      )}
      <div className={styles.actions}>
        <button
          className={styles.danger}
          disabled={!canActAsMe || alreadyPassed}
          onClick={() => dispatch({ type: 'challenge', bySeat: me! })}
        >
          {alreadyPassed ? 'Passed' : `Challenge${me !== null ? ` (as ${view.seats[me]?.name})` : ''}`}
        </button>
        <button
          className={styles.muted}
          disabled={!canActAsMe || alreadyPassed}
          onClick={() => dispatch({ type: 'pass', bySeat: me! })}
        >
          Pass
        </button>
      </div>
      <SeatSwitcher view={view} />
    </div>
  );
}

// ============================================================================
// Phase: awaitingBlock
// ============================================================================

function BlockWindow({
  view,
  localSeat,
  dispatch,
}: {
  view: CoupPublicState;
  localSeat: number | null;
  dispatch: (a: CoupGameAction) => void;
}) {
  const p = view.pending!;
  const actorName = view.seats[p.by]?.name;
  const me = localSeat;
  const eligibleBlockers = view.activeCharacters.filter((c) => {
    const blocks = CHARACTERS[c].blocks;
    if (p.kind === 'general' && p.generalId === 'foreignAid') {
      return blocks.some((b) => b.blocks === 'foreignAid');
    }
    if (p.kind === 'character' && p.characterActionId === 'assassinate') {
      return blocks.some((b) => b.blocks === 'assassinate');
    }
    if (
      p.kind === 'character' &&
      (p.characterActionId === 'steal' || p.characterActionId === 'thiefSteal')
    ) {
      return blocks.some((b) => b.blocks === 'steal');
    }
    return false;
  });
  const canBlock = (() => {
    if (me === null || me === p.by) return false;
    if (view.seats[me]!.eliminated) return false;
    if (p.kind === 'character' && p.characterActionId === 'assassinate' && p.target !== me) return false;
    if (
      p.kind === 'character' &&
      (p.characterActionId === 'steal' || p.characterActionId === 'thiefSteal') &&
      p.target !== me
    ) {
      return false;
    }
    return true;
  })();
  const alreadyPassed = me !== null && p.passes.includes(me);

  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>Block window</h3>
      <p className={styles.subtitle}>
        {actorName} declared{' '}
        {p.kind === 'general'
          ? p.generalId
          : p.characterActionId
            ? CHARACTERS[p.claimedCharacter!].name
            : '???'}
        {p.target !== null ? ` on ${view.seats[p.target]?.name}` : ''}. Anyone may claim a blocker.
      </p>
      <p className={styles.subtitle}>
        Passed: {p.passes.length === 0 ? 'nobody yet' : p.passes.map((s) => view.seats[s]?.name).join(', ')}
      </p>

      <div className={styles.actionRow}>
        {eligibleBlockers.map((c) => (
          <button
            key={c}
            className={styles.actionBtn}
            disabled={!canBlock}
            onClick={() => dispatch({ type: 'declareBlock', bySeat: me!, character: c })}
          >
            <span className={styles.actionBtnLabel}>Block as {CHARACTERS[c].name}</span>
            <span className={styles.actionBtnSub}>{CHARACTERS[c].description}</span>
          </button>
        ))}
        <button
          className={styles.muted}
          disabled={me === null || me === p.by || alreadyPassed}
          onClick={() => dispatch({ type: 'pass', bySeat: me! })}
        >
          Pass
        </button>
      </div>
      <SeatSwitcher view={view} />
    </div>
  );
}

// ============================================================================
// Phase: loseInfluence — the seat that must lose an influence picks a card.
// ============================================================================

function LoseInfluencePanel({
  view,
  dispatch,
}: {
  view: CoupPublicState;
  dispatch: (a: CoupGameAction) => void;
}) {
  const pending = view.pending!;
  const loseSeat = pending.loseInfluencePending!.seat;
  const seat = view.seats[loseSeat]!;
  const isMe = view.yourSeat === loseSeat;
  if (!isMe) {
    return (
      <div className={styles.panel}>
        <h3 style={{ marginTop: 0 }}>{seat.name} must lose an influence</h3>
      </div>
    );
  }
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>You must lose an influence</h3>
      <p className={styles.subtitle}>
        Reason: {pending.loseInfluencePending!.reason}. Pick which face-down card to flip.
      </p>
      <div className={styles.exchangeRow}>
        {view.yourInfluences.map((inf, i) => {
          if (inf.revealed) {
            return (
              <div key={i} className={styles.exchangeCard}>
                <CharacterArt character={inf.char} size={56} faded />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Already revealed</span>
              </div>
            );
          }
          return (
            <button
              key={i}
              className={styles.exchangeCard}
              onClick={() => dispatch({ type: 'pickInfluenceToLose', bySeat: loseSeat, cardIndex: i as 0 | 1 })}
            >
              <CharacterArt character={inf.char} size={56} />
              <span style={{ fontSize: 11 }}>{CHARACTERS[inf.char].name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Phase: exchangePick — active seat keeps N of M cards.
// ============================================================================

function ExchangePanel({
  view,
  dispatch,
}: {
  view: CoupPublicState;
  dispatch: (a: CoupGameAction) => void;
}) {
  const [picks, setPicks] = useState<number[]>([]);
  const offer = view.yourExchangeOffer;
  const me = view.yourSeat;
  if (!offer || me === null) {
    return (
      <div className={styles.panel}>
        <h3 style={{ marginTop: 0 }}>Waiting on exchange…</h3>
      </div>
    );
  }
  const togglePick = (i: number) => {
    setPicks((cur) =>
      cur.includes(i) ? cur.filter((x) => x !== i) : cur.length < offer.keepCount ? [...cur, i] : cur,
    );
  };
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>Exchange — keep {offer.keepCount} card{offer.keepCount === 1 ? '' : 's'}</h3>
      <p className={styles.subtitle}>
        Pick {offer.keepCount} card{offer.keepCount === 1 ? '' : 's'} to keep. The rest return to the
        deck (shuffled).
      </p>
      <div className={styles.exchangeRow}>
        {offer.cards.map((c, i) => (
          <button
            key={i}
            className={`${styles.exchangeCard} ${picks.includes(i) ? styles.selected : ''}`}
            onClick={() => togglePick(i)}
          >
            <CharacterArt character={c} size={56} />
            <span style={{ fontSize: 11 }}>{CHARACTERS[c].name}</span>
          </button>
        ))}
      </div>
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button
          className={styles.primary}
          disabled={picks.length !== offer.keepCount}
          onClick={() => dispatch({ type: 'exchangeReturn', bySeat: me, keepIndices: picks })}
        >
          Confirm ({picks.length}/{offer.keepCount})
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Phase: spyPeek — show the result of the spy / inquisitor peek to the actor.
// ============================================================================

function SpyPeekPanel({
  view,
  dispatch,
}: {
  view: CoupPublicState;
  dispatch: (a: CoupGameAction) => void;
}) {
  const me = view.yourSeat;
  const p = view.pending!;
  if (me === null || me !== p.by) {
    return (
      <div className={styles.panel}>
        <h3 style={{ marginTop: 0 }}>Peek in progress…</h3>
      </div>
    );
  }
  const latest = view.yourPeeks[view.yourPeeks.length - 1];
  if (!latest) {
    return (
      <div className={styles.panel}>
        <h3 style={{ marginTop: 0 }}>No peek result.</h3>
      </div>
    );
  }
  const targetName = view.seats[latest.target]?.name ?? '???';
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>You see {targetName}&apos;s card {latest.cardIndex + 1}</h3>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <CharacterArt character={latest.card} size={80} />
        <div>
          <div style={{ fontWeight: 700 }}>{CHARACTERS[latest.card].name}</div>
          <div className={styles.subtitle}>{CHARACTERS[latest.card].description}</div>
        </div>
      </div>
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button className={styles.primary} onClick={() => dispatch({ type: 'ackPeek', bySeat: me })}>
          OK, end my turn
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Helper: seat switcher — used during challenge / block windows so the local
// device can "be" any seat. In real online play this would be replaced by the
// real seat-binding flow.
// ============================================================================

function SeatSwitcher({ view }: { view: CoupPublicState }) {
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #1f2937' }}>
      <p className={styles.subtitle}>Acting as…</p>
      <div className={styles.actionRow}>
        {view.seats.map((s) => (
          <button
            key={s.index}
            className={`${styles.actionBtn} ${view.yourSeat === s.index ? styles.primary : ''}`}
            disabled={s.eliminated}
            onClick={() => setLocalSeat(s.index)}
          >
            <span className={styles.actionBtnLabel}>{s.name}</span>
            {s.eliminated && <span className={styles.actionBtnSub}>eliminated</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Log panel
// ============================================================================

function LogPanel({ view }: { view: CoupPublicState }) {
  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>Log</h3>
      <div className={styles.log}>
        {view.log
          .slice()
          .reverse()
          .map((line, i) => (
            <div key={i} className={styles.logLine}>
              {line}
            </div>
          ))}
      </div>
    </div>
  );
}

// ============================================================================
// Cheatsheet — always visible aside listing every character in the deck.
// ============================================================================

function Cheatsheet({ view }: { view: CoupPublicState }) {
  return (
    <div className={styles.cheatsheet}>
      <CheatGeneralRow
        title="Income"
        desc="+1 coin. No challenge, no block."
      />
      <CheatGeneralRow
        title="Foreign Aid"
        desc="+2 coins. No challenge. Blockable by Duke / Banker."
      />
      <CheatGeneralRow
        title="Coup"
        desc="Pay 7 coins. Target loses an influence. No challenge or block (Classic). At 10+ coins you MUST Coup."
      />
      {view.activeCharacters.map((c) => {
        const spec = CHARACTERS[c];
        return (
          <div key={c} className={styles.cheatRow}>
            <CharacterArt character={c} size={36} />
            <div>
              <div className={styles.cheatName}>
                <CategoryBadge character={c} />
                <span>{spec.name}</span>
              </div>
              <div className={styles.cheatDesc}>{spec.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CheatGeneralRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div className={styles.cheatRow}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          background: '#1f2937',
          border: '1px solid #334155',
          display: 'grid',
          placeItems: 'center',
          fontSize: 10,
          color: '#94a3b8',
        }}
      >
        GEN
      </div>
      <div>
        <div className={styles.cheatName}>{title}</div>
        <div className={styles.cheatDesc}>{desc}</div>
      </div>
    </div>
  );
}
