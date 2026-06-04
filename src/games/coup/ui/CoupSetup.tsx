import { useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { coupModule } from '../module';
import type { CoupOptions } from '../module';
import { CHARACTERS, CLASSIC_FIVE, G54_BASE_25, G54_ANARCHY_6 } from '../characters';
import type { CoupCharacter, CoupRuleset } from '../state';
import { validateCharacterSet } from '../setup';
import { CharacterArt, CategoryBadge } from './CharacterArt';
import styles from './CoupSetup.module.css';

// Local-host setup screen for Coup. The host picks a ruleset preset (classic
// vs G54 vs G54+Anarchy), edits each player name, then toggles which
// characters are in this match's deck. Default is the 5 classic characters.

interface Props {
  onBack: () => void;
}

type PackTab = 'classic' | 'g54' | 'anarchy';

const PACK_LABEL: Record<PackTab, string> = {
  classic: 'Classic (base)',
  g54: 'G54 (25-character pool)',
  anarchy: 'Anarchy expansion',
};

const PACK_CHARS: Record<PackTab, CoupCharacter[]> = {
  classic: CLASSIC_FIVE,
  g54: G54_BASE_25,
  anarchy: G54_ANARCHY_6,
};

export function CoupSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState<string[]>([
    'Player 1',
    'Player 2',
    'Player 3',
    'Player 4',
    'Player 5',
    'Player 6',
  ]);
  const [ruleset, setRuleset] = useState<CoupRuleset>('classic');
  const [anarchyOn, setAnarchyOn] = useState(false);
  const [pack, setPack] = useState<PackTab>('classic');
  // The set of characters that will be in this match's deck.
  const [selected, setSelected] = useState<CoupCharacter[]>(() => CLASSIC_FIVE.slice());

  const error = useMemo(() => validateCharacterSet(selected), [selected]);

  const toggle = (c: CoupCharacter) => {
    if (!CHARACTERS[c].implemented) return; // locked out
    setSelected((cur) =>
      cur.includes(c) ? cur.filter((x) => x !== c) : cur.length >= 8 ? cur : [...cur, c],
    );
  };

  const applyPreset = (preset: 'classic' | 'g54' | 'g54+anarchy') => {
    if (preset === 'classic') {
      setRuleset('classic');
      setAnarchyOn(false);
      setSelected(CLASSIC_FIVE.slice());
      setPack('classic');
    } else if (preset === 'g54') {
      setRuleset('g54');
      setAnarchyOn(false);
      // Seed with a playable starter from the G54 pool.
      setSelected(['banker', 'taxCollector', 'soldier', 'thief', 'inquisitor']);
      setPack('g54');
    } else {
      setRuleset('g54');
      setAnarchyOn(true);
      setSelected(['banker', 'mercenary', 'thief', 'spy', 'plantationOwner']);
      setPack('anarchy');
    }
  };

  const startGame = () => {
    if (error) return;
    const opts: CoupOptions = {
      players: Array.from({ length: playerCount }, (_, i) => ({
        name: (names[i] ?? `Player ${i + 1}`).trim() || `Player ${i + 1}`,
        isAI: false,
      })),
      ruleset,
      expansions: anarchyOn ? ['anarchy'] : [],
      characters: selected,
    };
    const config = {
      gameId: 'coup' as const,
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
    const initialState = coupModule.createInitialState(config);
    useGameStore.getState().startLocalGame(coupModule, initialState, 0);
  };

  const visibleChars = PACK_CHARS[pack];

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button onClick={onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 22 }}>Coup — Setup</h1>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Ruleset</h3>
        <div className={styles.rulesetRow}>
          <button
            className={`${styles.rulesetBtn} ${ruleset === 'classic' && !anarchyOn ? styles.rulesetActive : ''}`}
            onClick={() => applyPreset('classic')}
          >
            Classic (base)
          </button>
          <button
            className={`${styles.rulesetBtn} ${ruleset === 'g54' && !anarchyOn ? styles.rulesetActive : ''}`}
            onClick={() => applyPreset('g54')}
          >
            G54
          </button>
          <button
            className={`${styles.rulesetBtn} ${ruleset === 'g54' && anarchyOn ? styles.rulesetActive : ''}`}
            onClick={() => applyPreset('g54+anarchy')}
          >
            G54 + Anarchy
          </button>
          <span style={{ marginLeft: 12, color: '#94a3b8', fontSize: 12 }}>
            {ruleset === 'classic'
              ? 'Cross-blocking. Captain + Ambassador both block steal.'
              : 'Same-role only blocking. Captain steal blocked only by Captain.'}
          </span>
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Players</h3>
        <div className={styles.countControls}>
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              className={n === playerCount ? styles.countActive : ''}
              onClick={() => setPlayerCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className={styles.nameGrid}>
          {Array.from({ length: playerCount }, (_, i) => (
            <label key={i} className={styles.nameRow}>
              <span className={styles.seatNumber}>{i + 1}</span>
              <input
                value={names[i] ?? `Player ${i + 1}`}
                onChange={(e) =>
                  setNames((cur) => {
                    const next = cur.slice();
                    next[i] = e.target.value;
                    return next;
                  })
                }
                maxLength={20}
              />
            </label>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Characters in this match</h3>
        <p className={styles.subtitle}>
          Pick 5-8 characters. Three copies of each go into the deck. Default is the five
          Classic characters. Characters marked &quot;coming soon&quot; are described for
          reference but can&apos;t be selected yet.
        </p>
        <div className={styles.packTabs}>
          {(['classic', 'g54', 'anarchy'] as PackTab[]).map((t) => (
            <button
              key={t}
              className={`${styles.packTab} ${pack === t ? styles.packTabActive : ''}`}
              onClick={() => setPack(t)}
            >
              {PACK_LABEL[t]}
            </button>
          ))}
        </div>
        <div className={styles.charGrid}>
          {visibleChars.map((c) => (
            <CharCard
              key={c}
              character={c}
              checked={selected.includes(c)}
              onToggle={() => toggle(c)}
            />
          ))}
        </div>

        <div className={styles.poolPreview}>
          {error && <div className={styles.poolError}>⚠ {error}</div>}
          <strong>Selected ({selected.length}):</strong>
          <div className={styles.poolList}>
            {selected.length === 0 && <span style={{ color: '#94a3b8' }}>None</span>}
            {selected.map((c) => (
              <span key={c} className={styles.poolChip}>
                <CategoryBadge character={c} /> {CHARACTERS[c].name}
              </span>
            ))}
          </div>
          <p style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>
            Deck size: {selected.length * 3} cards · {playerCount} players × 2 starting influences ={' '}
            {playerCount * 2} dealt, {Math.max(0, selected.length * 3 - playerCount * 2)} remain in the deck.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <button
          className={styles.startButton}
          disabled={!!error}
          onClick={startGame}
          title={error ?? ''}
        >
          Start game →
        </button>
      </footer>
    </div>
  );
}

function CharCard({
  character,
  checked,
  onToggle,
}: {
  character: CoupCharacter;
  checked: boolean;
  onToggle: () => void;
}) {
  const spec = CHARACTERS[character];
  const locked = !spec.implemented;
  const cls = [
    styles.charCard,
    checked && styles.charCardOn,
    locked && styles.charCardLocked,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      onClick={onToggle}
      disabled={locked}
      title={locked ? 'Coming soon — character is shown for reference only' : 'Toggle this character'}
    >
      <CharacterArt character={character} size={48} faded={locked} />
      <div style={{ minWidth: 0 }}>
        <div className={styles.charName}>
          <CategoryBadge character={character} />
          <span>{spec.name}</span>
        </div>
        <div className={styles.charDesc}>{spec.description}</div>
      </div>
      <div style={{ fontSize: 18 }}>{checked ? '✓' : ''}</div>
    </button>
  );
}
