import { useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
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
import { CharacterArt, CategoryBadge } from './CharacterArt';
import styles from './CoupSetup.module.css';

// Local-host setup screen for Coup. The host picks a ruleset preset (classic
// vs G54 vs G54+Anarchy), edits each player name, then toggles which
// characters are in this match's deck.
//
// Canonical G54 rules: exactly one character per category, total = 5 (Classic
// or G54) or 6 (G54+Anarchy). We enforce the total strictly, but allow the
// host to drift off one-per-category — a warning chip surfaces so they know
// the game may feel uneven.

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
  const [selected, setSelected] = useState<CoupCharacter[]>(() => CLASSIC_FIVE.slice());
  const [online, setOnline] = useState(false);
  const [roomCode, setRoomCode] = useState('');

  const validation = useMemo(
    () => validateCharacterSetFull(selected, ruleset, anarchyOn),
    [selected, ruleset, anarchyOn],
  );
  const required = requiredCharacterCount(ruleset, anarchyOn);
  const hist = useMemo(() => categoryHistogram(selected), [selected]);

  const toggle = (c: CoupCharacter) => {
    if (!CHARACTERS[c].implemented) return;
    setSelected((cur) => {
      if (cur.includes(c)) return cur.filter((x) => x !== c);
      if (cur.length >= required) return cur; // strict cap
      return [...cur, c];
    });
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
    const playerNames = Array.from({ length: playerCount }, (_, i) =>
      (names[i] ?? `Player ${i + 1}`).trim() || `Player ${i + 1}`,
    );
    const opts: CoupOptions = {
      players: playerNames.map((name) => ({ name, isAI: false })),
      ruleset,
      expansions: anarchyOn ? ['anarchy'] : [],
      characters: selected,
    };
    if (online) {
      const code = roomCode.trim();
      if (!code) return;
      useNetworkStore.getState().hostRoom(code, 'coup', {
        seatCount: playerCount,
        names: playerNames,
        options: opts as unknown as Record<string, unknown>,
      });
      return;
    }
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
  const baseCats: Array<{ key: string; label: string }> = [
    { key: 'finance', label: 'Finance' },
    { key: 'communications', label: 'Communications' },
    { key: 'force', label: 'Force' },
    { key: 'specialInterest', label: 'Special Interest' },
    { key: 'movement', label: 'Movement' },
  ];

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
              : 'Same-role only blocking. Canonical G54 = one character per category.'}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 className={styles.h3} style={{ margin: 0 }}>Characters in this match</h3>
          <div style={{ fontSize: 14, color: validation.error ? '#f87171' : '#cbd5e1' }}>
            <strong>{selected.length}</strong> / {required}
          </div>
        </div>
        <p className={styles.subtitle}>
          Canonical G54 plays with one character from each category (5 total; 6 with Anarchy). You
          can drift off-balance — we&apos;ll just warn you.
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

        {ruleset === 'g54' && (
          <div className={styles.poolPreview} style={{ marginTop: 12 }}>
            <strong>Category balance</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {baseCats.map((cat) => {
                const n = hist[cat.key as keyof typeof hist] ?? 0;
                const ok = n === 1;
                return (
                  <span
                    key={cat.key}
                    style={{
                      padding: '2px 8px',
                      border: `1px solid ${ok ? '#22c55e' : '#fbbf24'}`,
                      color: ok ? '#bbf7d0' : '#fde68a',
                      borderRadius: 4,
                      fontSize: 11,
                    }}
                  >
                    {cat.label}: {n}
                  </span>
                );
              })}
              {anarchyOn && (
                <span
                  style={{
                    padding: '2px 8px',
                    border: `1px solid ${hist.anarchy === 1 ? '#22c55e' : '#fbbf24'}`,
                    color: hist.anarchy === 1 ? '#bbf7d0' : '#fde68a',
                    borderRadius: 4,
                    fontSize: 11,
                  }}
                >
                  Anarchy: {hist.anarchy}
                </span>
              )}
            </div>
          </div>
        )}

        <div className={styles.poolPreview}>
          {validation.error && <div className={styles.poolError}>⚠ {validation.error}</div>}
          {!validation.error && validation.warning && (
            <div
              style={{
                background: '#3f2c0a',
                border: '1px solid #b45309',
                color: '#fde68a',
                padding: '6px 10px',
                borderRadius: 4,
                marginBottom: 8,
              }}
            >
              ⚠ {validation.warning}
            </div>
          )}
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

      <section className={styles.panel}>
        <h3 className={styles.h3}>Multiplayer</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={online}
            onChange={(e) => setOnline(e.target.checked)}
          />
          <span>Host an online room (other players join with the room code)</span>
        </label>
        {online && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>Room code:</span>
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="any string (share with friends)"
              maxLength={32}
              style={{ padding: 6, minWidth: 240 }}
            />
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        <button
          className={styles.startButton}
          disabled={!!validation.error || (online && !roomCode.trim())}
          onClick={startGame}
          title={validation.error ?? validation.warning ?? ''}
        >
          {online ? 'Open lobby →' : 'Start game →'}
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
