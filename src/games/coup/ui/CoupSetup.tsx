import { launchGame } from '@/ui/shared/launch';
import { OnlineHostToggle } from '@/ui/shared/OnlineHostToggle';
import { useMemo, useState } from 'react';
import { coupModule } from '../module';
import type { CoupOptions } from '../module';
import {
  CHARACTERS,
  CLASSIC_FIVE,
  G54_BASE_25,
  G54_ANARCHY_6,
  G54_BALANCED_DEFAULT,
  G54_ANARCHY_BALANCED_DEFAULT,
  categoryHistogram,
} from '../characters';
import type { CoupCharacter, CoupRuleset } from '../state';
import { validateCharacterSetFull, requiredCharacterCount } from '../setup';
import { CardBack, CharacterArt, CategoryBadge, CATEGORY_THEME } from './CharacterArt';
import styles from './CoupSetup.module.css';

// Local-host setup screen for Coup. The host picks a ruleset preset
// (Classic / G54 / G54 + Anarchy), names each seat and marks AI seats, then
// curates which characters are in this match's deck.
//
// Canonical G54 rules: one character per category, total = 5 (Classic or
// G54) or 6 (G54 + Anarchy). The total is enforced; drifting off
// one-per-category only shows a warning.

interface Props {
  onBack: () => void;
}

type PackTab = 'classic' | 'g54' | 'anarchy';

const PACK_LABEL: Record<PackTab, string> = {
  classic: 'Classic court',
  g54: 'G54 pool (25)',
  anarchy: 'Anarchy',
};

const PACK_CHARS: Record<PackTab, CoupCharacter[]> = {
  classic: CLASSIC_FIVE,
  g54: G54_BASE_25,
  anarchy: G54_ANARCHY_6,
};

type Preset = 'classic' | 'g54' | 'g54+anarchy';

const PRESETS: Array<{ id: Preset; title: string; blurb: string; showcase: CoupCharacter[] }> = [
  {
    id: 'classic',
    title: 'Classic',
    blurb: 'The original court: Duke, Assassin, Captain, Ambassador, Contessa. Captain and Ambassador both block steals.',
    showcase: ['duke', 'assassin', 'contessa'],
  },
  {
    id: 'g54',
    title: 'G54',
    blurb: 'Rebellion G54: pick five of 25 roles, ideally one per category, for a new court every game.',
    showcase: ['banker', 'spy', 'judge'],
  },
  {
    id: 'g54+anarchy',
    title: 'G54 + Anarchy',
    blurb: 'G54 plus one Anarchy role: arms dealers, financiers, paramilitaries.',
    showcase: ['armsDealer', 'paramilitary', 'financier'],
  },
];

export function CoupSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>(() => Array.from({ length: 6 }, (_, i) => `Player ${i + 1}`));
  const [ai, setAi] = useState<boolean[]>(() => [false, true, true, true, true, true]);
  const [ruleset, setRuleset] = useState<CoupRuleset>('classic');
  const [anarchyOn, setAnarchyOn] = useState(false);
  const [pack, setPack] = useState<PackTab>('classic');
  const [selected, setSelected] = useState<CoupCharacter[]>(() => CLASSIC_FIVE.slice());
  const [online, setOnline] = useState(false);

  const validation = useMemo(() => validateCharacterSetFull(selected, ruleset, anarchyOn), [selected, ruleset, anarchyOn]);
  const required = requiredCharacterCount(ruleset, anarchyOn);
  const hist = useMemo(() => categoryHistogram(selected), [selected]);
  const preset: Preset = ruleset === 'classic' ? 'classic' : anarchyOn ? 'g54+anarchy' : 'g54';
  const aiSeats = Array.from({ length: playerCount }, (_, i) => i).filter((i) => ai[i]);
  const humans = playerCount - aiSeats.length;

  const toggle = (c: CoupCharacter) => {
    if (!CHARACTERS[c].implemented) return;
    setSelected((cur) => {
      if (cur.includes(c)) return cur.filter((x) => x !== c);
      if (cur.length >= required) return cur; // strict cap
      return [...cur, c];
    });
  };

  const applyPreset = (p: Preset) => {
    if (p === 'classic') {
      setRuleset('classic');
      setAnarchyOn(false);
      setSelected(CLASSIC_FIVE.slice());
      setPack('classic');
    } else if (p === 'g54') {
      setRuleset('g54');
      setAnarchyOn(false);
      setSelected(G54_BALANCED_DEFAULT.slice());
      setPack('g54');
    } else {
      setRuleset('g54');
      setAnarchyOn(true);
      setSelected(G54_ANARCHY_BALANCED_DEFAULT.slice());
      setPack('anarchy');
    }
  };

  const startGame = () => {
    if (validation.error) return;
    const playerNames = Array.from({ length: playerCount }, (_, i) => (names[i] ?? '').trim() || `Player ${i + 1}`);
    const opts: CoupOptions = {
      players: playerNames.map((name, i) => ({ name, isAI: aiSeats.includes(i) })),
      ruleset,
      expansions: anarchyOn ? ['anarchy'] : [],
      characters: selected,
    };
    launchGame({ module: coupModule, options: opts, playerNames, aiSeats, online });
  };

  const baseCats = ['finance', 'communications', 'force', 'specialInterest', 'movement'] as const;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          ← Back
        </button>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Coup</h1>
          <p className={styles.tagline}>Bluff, bribe and betray your way to the last seat at court.</p>
        </div>
        <div className={styles.headerCards} aria-hidden>
          <CardBack size={54} className={styles.hc1} />
          <CharacterArt character="duke" size={54} className={styles.hc2} decorative />
          <CharacterArt character="assassin" size={54} className={styles.hc3} decorative />
        </div>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Ruleset</h3>
        <div className={styles.presetRow} role="radiogroup" aria-label="Ruleset">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={preset === p.id}
              className={`${styles.presetCard} ${preset === p.id ? styles.presetOn : ''}`}
              onClick={() => applyPreset(p.id)}
            >
              <span className={styles.presetFan} aria-hidden>
                {p.showcase.map((c, i) => (
                  <span key={c} style={{ ['--k' as string]: i - 1 }}>
                    <CharacterArt character={c} size={46} decorative />
                  </span>
                ))}
              </span>
              <span className={styles.presetTitle}>{p.title}</span>
              <span className={styles.presetBlurb}>{p.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h3 className={styles.h3}>Seats at court</h3>
          <div className={styles.countControls} role="radiogroup" aria-label="Number of players">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={n === playerCount}
                className={n === playerCount ? styles.countActive : ''}
                onClick={() => setPlayerCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.seatGrid}>
          {Array.from({ length: playerCount }, (_, i) => (
            <div key={i} className={`${styles.seatRow} ${ai[i] ? styles.seatAI : ''}`}>
              <span className={styles.seatNumber} aria-hidden>
                {['I', 'II', 'III', 'IV', 'V', 'VI'][i]}
              </span>
              <input
                aria-label={`Seat ${i + 1} name`}
                value={names[i] ?? ''}
                placeholder={`Player ${i + 1}`}
                onChange={(e) =>
                  setNames((cur) => {
                    const next = cur.slice();
                    next[i] = e.target.value;
                    return next;
                  })
                }
                maxLength={20}
              />
              <div className={styles.seatToggle} role="radiogroup" aria-label={`Seat ${i + 1} controller`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!ai[i]}
                  className={!ai[i] ? styles.toggleOn : ''}
                  onClick={() => setAi((cur) => cur.map((v, k) => (k === i ? false : v)))}
                >
                  Human
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!!ai[i]}
                  className={ai[i] ? styles.toggleOn : ''}
                  onClick={() => setAi((cur) => cur.map((v, k) => (k === i ? true : v)))}
                >
                  AI
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className={styles.subtitle}>
          {humans === 0
            ? 'All seats are AI: you will watch the court from the gallery.'
            : humans === 1
              ? 'One human against the AI court.'
              : online
                ? `${humans} human seats; friends claim them from the lobby.`
                : `${humans} humans pass the device; secrets are covered at every handoff.`}
        </p>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h3 className={styles.h3}>The court deck</h3>
          <div className={`${styles.counter} ${validation.error ? styles.counterBad : ''}`} aria-live="polite">
            <strong>{selected.length}</strong> / {required} roles
          </div>
        </div>
        <p className={styles.subtitle}>
          Three copies of each role go into the deck. Canonical G54 takes one role from each category ({required} total
          {anarchyOn ? ' with Anarchy' : ''}). You can drift off-balance; we&apos;ll warn you.
        </p>
        <div className={styles.packTabs} role="tablist" aria-label="Role pool">
          {(['classic', 'g54', 'anarchy'] as PackTab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={pack === t} className={`${styles.packTab} ${pack === t ? styles.packTabActive : ''}`} onClick={() => setPack(t)}>
              {PACK_LABEL[t]}
            </button>
          ))}
        </div>
        <div className={styles.charGrid}>
          {PACK_CHARS[pack].map((c, i) => (
            <CharCard key={c} character={c} index={i} checked={selected.includes(c)} full={selected.length >= required} onToggle={() => toggle(c)} />
          ))}
        </div>

        {ruleset === 'g54' && (
          <div className={styles.balance}>
            {baseCats.map((cat) => {
              const n = hist[cat];
              return (
                <span key={cat} className={`${styles.balanceChip} ${n === 1 ? styles.balanceOk : styles.balanceWarn}`} style={{ ['--gem' as string]: CATEGORY_THEME[cat].gem }}>
                  {CATEGORY_THEME[cat].label}: {n}
                </span>
              );
            })}
            {anarchyOn && (
              <span className={`${styles.balanceChip} ${hist.anarchy === 1 ? styles.balanceOk : styles.balanceWarn}`} style={{ ['--gem' as string]: CATEGORY_THEME.anarchy.gem }}>
                Anarchy: {hist.anarchy}
              </span>
            )}
          </div>
        )}

        <div className={styles.poolPreview}>
          {validation.error && <div className={styles.poolError}>⚠ {validation.error}</div>}
          {!validation.error && validation.warning && <div className={styles.poolWarn}>⚠ {validation.warning}</div>}
          <div className={styles.poolList}>
            {selected.length === 0 && <span className={styles.subtitle}>No roles chosen yet.</span>}
            {selected.map((c) => (
              <button key={c} type="button" className={styles.poolChip} onClick={() => toggle(c)} aria-label={`Remove ${CHARACTERS[c].name}`}>
                <CharacterArt character={c} size={30} decorative />
                <span>{CHARACTERS[c].name}</span>
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
          <p className={styles.deckMath}>
            Deck: {selected.length * 3} cards · {playerCount * 2} dealt to {playerCount} players ·{' '}
            {Math.max(0, selected.length * 3 - playerCount * 2)} left in the court deck.
          </p>
        </div>
      </section>

      <OnlineHostToggle online={online} onChange={setOnline} />

      <footer className={styles.footer}>
        <button className={styles.startButton} disabled={!!validation.error} onClick={startGame} title={validation.error ?? validation.warning ?? ''}>
          {online ? 'Open the lobby' : 'Convene the court'}
        </button>
      </footer>
    </div>
  );
}

function CharCard({
  character,
  index,
  checked,
  full,
  onToggle,
}: {
  character: CoupCharacter;
  index: number;
  checked: boolean;
  full: boolean;
  onToggle: () => void;
}) {
  const spec = CHARACTERS[character];
  const locked = !spec.implemented;
  const blocked = !checked && full;
  return (
    <button
      type="button"
      className={`${styles.charCard} ${checked ? styles.charCardOn : ''} ${blocked ? styles.charCardFull : ''}`}
      style={{ ['--i' as string]: index }}
      onClick={onToggle}
      disabled={locked}
      aria-pressed={checked}
      title={blocked ? 'Deck is full: remove a role first' : checked ? 'Remove from the deck' : 'Add to the deck'}
    >
      <span className={styles.charArt}>
        <CharacterArt character={character} size={64} faded={locked} decorative />
        {checked && (
          <span className={styles.check} aria-hidden>
            ✓
          </span>
        )}
      </span>
      <span className={styles.charText}>
        <span className={styles.charName}>
          {spec.name} <CategoryBadge character={character} />
        </span>
        <span className={styles.charDesc}>{spec.description}</span>
      </span>
    </button>
  );
}
