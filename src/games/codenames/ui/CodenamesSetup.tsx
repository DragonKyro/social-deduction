import { useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { codenamesModule } from '../module';
import type { CodenamesOptions, CodenamesSeatConfig } from '../module';
import type { TeamColor } from '../state';
import {
  WORD_PACK_LIST,
  buildPoolFromPacks,
  type WordPackId,
} from '@/words';
import styles from './CodenamesSetup.module.css';

// Local-host setup for Codenames. Player count + per-seat team + spymaster
// pick. Spymasters are exactly one per team; everyone else is an operative.

interface Props {
  onBack: () => void;
}

function defaultPlayers(count: number): CodenamesSeatConfig[] {
  const half = Math.ceil(count / 2);
  return Array.from({ length: count }, (_, i) => {
    const team: TeamColor = i < half ? 'red' : 'blue';
    const isFirstOnTeam = i === 0 || i === half;
    return {
      name: `Player ${i + 1}`,
      team,
      role: isFirstOnTeam ? ('spymaster' as const) : ('operative' as const),
      isAI: false,
    };
  });
}

export function CodenamesSetup({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(4);
  const [players, setPlayers] = useState<CodenamesSeatConfig[]>(() => defaultPlayers(16));
  const [selectedPacks, setSelectedPacks] = useState<WordPackId[]>(['classic']);
  const [online, setOnline] = useState(false);
  const [roomCode, setRoomCode] = useState('');

  const togglePack = (id: WordPackId) => {
    setSelectedPacks((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  };

  const pool = useMemo(() => buildPoolFromPacks(selectedPacks), [selectedPacks]);
  const poolTooSmall = pool.length < 25;
  const hasAdultsOnly = selectedPacks.some(
    (id) => WORD_PACK_LIST.find((p) => p.id === id)?.adultsOnly,
  );

  const slice = players.slice(0, playerCount);

  // Validation: exactly one spymaster per team, at least one operative per team.
  const validation = useMemo(() => {
    for (const team of ['red', 'blue'] as TeamColor[]) {
      const onTeam = slice.filter((p) => p.team === team);
      const spymasters = onTeam.filter((p) => p.role === 'spymaster');
      const operatives = onTeam.filter((p) => p.role === 'operative');
      if (spymasters.length !== 1) {
        return `Team ${team} must have exactly one spymaster.`;
      }
      if (operatives.length < 1) {
        return `Team ${team} must have at least one operative.`;
      }
    }
    return null;
  }, [slice]);

  const updatePlayer = (i: number, patch: Partial<CodenamesSeatConfig>) => {
    setPlayers((cur) => {
      const next = cur.slice();
      next[i] = { ...next[i]!, ...patch };
      return next;
    });
  };

  const toggleTeam = (i: number) => {
    const cur = players[i]!;
    const newTeam: TeamColor = cur.team === 'red' ? 'blue' : 'red';
    // If swapping a spymaster off a team that already has one, demote them
    // to operative on the new team (otherwise we create a 2-spymaster team).
    const newTeamHasSpy = slice.some(
      (p, idx) => idx !== i && p.team === newTeam && p.role === 'spymaster',
    );
    updatePlayer(i, {
      team: newTeam,
      role: cur.role === 'spymaster' && newTeamHasSpy ? 'operative' : cur.role,
    });
  };

  const toggleRole = (i: number) => {
    const cur = players[i]!;
    if (cur.role === 'spymaster') {
      updatePlayer(i, { role: 'operative' });
      return;
    }
    // Promote to spymaster: demote any other spymaster on the same team.
    setPlayers((all) => {
      const next = all.slice();
      for (let j = 0; j < next.length; j++) {
        if (j < playerCount && j !== i && next[j]!.team === cur.team && next[j]!.role === 'spymaster') {
          next[j] = { ...next[j]!, role: 'operative' };
        }
      }
      next[i] = { ...next[i]!, role: 'spymaster' };
      return next;
    });
  };

  const startGame = () => {
    const final = players.slice(0, playerCount).map((p, i) => ({
      ...p,
      name: p.name.trim() || `Player ${i + 1}`,
    }));
    const opts: CodenamesOptions = {
      players: final,
      packs: selectedPacks.length > 0 ? selectedPacks : ['classic'],
    };
    if (online) {
      const code = roomCode.trim();
      if (!code) return;
      useNetworkStore.getState().hostRoom(code, 'codenames', {
        seatCount: playerCount,
        names: final.map((p) => p.name),
        options: opts as unknown as Record<string, unknown>,
      });
      return;
    }
    const config = {
      gameId: 'codenames' as const,
      seats: [],
      seed: Math.floor(Math.random() * 2 ** 31),
      gameOptions: opts as unknown as Record<string, unknown>,
    };
    const initialState = codenamesModule.createInitialState(config);
    // Start at seat 0; in hot-seat, the device will rotate.
    useGameStore.getState().startLocalGame(codenamesModule, initialState, 0);
  };

  const counts = useMemo(() => {
    const redCount = slice.filter((p) => p.team === 'red').length;
    const blueCount = slice.filter((p) => p.team === 'blue').length;
    return { redCount, blueCount };
  }, [slice]);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button onClick={onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 22 }}>Codenames — Setup</h1>
      </header>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Players</h3>
        <p className={styles.subtitle}>
          4–16 players. Each team needs exactly one spymaster and at least one operative.
          Tap a player&apos;s team chip to swap them, and tap their role chip to crown a spymaster.
        </p>
        <div className={styles.countControls}>
          {[4, 5, 6, 7, 8, 9, 10, 12, 14, 16].map((n) => (
            <button
              key={n}
              className={n === playerCount ? styles.countActive : ''}
              onClick={() => setPlayerCount(n)}
            >
              {n}
            </button>
          ))}
          <span style={{ marginLeft: 12, color: '#94a3b8', fontSize: 13 }}>
            <span style={{ color: '#fca5a5' }}>{counts.redCount} red</span> ·{' '}
            <span style={{ color: '#93c5fd' }}>{counts.blueCount} blue</span>
          </span>
        </div>
        <div className={styles.playerGrid}>
          {slice.map((p, i) => (
            <div key={i} className={`${styles.playerRow} ${styles[p.team]}`}>
              <span className={styles.seatNumber}>{i + 1}</span>
              <input
                className={styles.nameInput}
                value={p.name}
                onChange={(e) => updatePlayer(i, { name: e.target.value })}
                maxLength={20}
              />
              <button
                type="button"
                className={`${styles.teamToggle} ${styles[p.team]}`}
                onClick={() => toggleTeam(i)}
                title="Swap team"
              >
                {p.team === 'red' ? 'Red' : 'Blue'}
              </button>
              <button
                type="button"
                className={`${styles.roleToggle} ${p.role === 'spymaster' ? styles.spy : ''}`}
                onClick={() => toggleRole(i)}
                title="Toggle spymaster"
              >
                {p.role === 'spymaster' ? '★ Spy' : 'Op'}
              </button>
            </div>
          ))}
        </div>
        {validation && <div className={styles.warning}>{validation}</div>}
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Word packs</h3>
        <p className={styles.subtitle}>
          Pick any combination. Words are deduped across selected packs. Classic
          on its own keeps the standard experience; mix in themed packs for a
          different vibe.
        </p>
        <div className={styles.packGrid}>
          {WORD_PACK_LIST.map((p) => {
            const on = selectedPacks.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={`${styles.packCard} ${on ? styles.packCardOn : ''}`}
                onClick={() => togglePack(p.id)}
              >
                <div className={styles.packEmoji}>{p.emoji}</div>
                <div className={styles.packBody}>
                  <div className={styles.packName}>
                    {p.name}
                    {p.adultsOnly && <span className={styles.packAdult}> 18+</span>}
                  </div>
                  <div className={styles.packBlurb}>{p.blurb}</div>
                  <div className={styles.packCount}>{p.words.length} words</div>
                </div>
                <div className={styles.packCheck}>{on ? '✓' : ''}</div>
              </button>
            );
          })}
        </div>
        <div className={styles.packSummary}>
          <span>
            Pool size: <b>{pool.length}</b> unique words
          </span>
          {poolTooSmall && (
            <span className={styles.warning}>
              Need at least 25 words — pick at least one pack.
            </span>
          )}
          {hasAdultsOnly && !poolTooSmall && (
            <span style={{ color: '#fbbf24', fontSize: 12 }}>
              Includes a Spicy (18+) pack — make sure your table is on board.
            </span>
          )}
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Rules summary</h3>
        <ul style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
          <li>5×5 grid. Starting team has 9 cards; the other has 8. 7 bystanders + 1 assassin.</li>
          <li>The spymaster gives a <b>one-word clue</b> followed by a number (cards on the board that match).</li>
          <li>Operatives may make up to <b>clue number + 1 guesses</b>. A wrong guess ends the turn.</li>
          <li>Touching the <b>assassin</b> ends the game — your team loses immediately.</li>
          <li>Use 0 for an <b>unlimited</b> clue (operatives keep going as long as they hit).</li>
        </ul>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.h3}>Multiplayer</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
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
          disabled={!!validation || poolTooSmall || (online && !roomCode.trim())}
          onClick={startGame}
        >
          {online ? 'Open lobby →' : 'Start game →'}
        </button>
      </footer>
    </div>
  );
}
