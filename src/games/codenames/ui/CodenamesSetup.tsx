import { launchGame } from '@/ui/shared/launch';
import { OnlineHostToggle } from '@/ui/shared/OnlineHostToggle';
import { useMemo, useState } from 'react';
import { codenamesModule, defaultTeams, teamsProblem } from '../module';
import type { CodenamesOptions, CodenamesRole, CodenamesTeamSlot } from '../module';
import type { TeamColor } from '../state';
import { WORD_PACK_LIST, buildPoolFromPacks, type WordPackId } from '@/words';
import styles from './CodenamesSetup.module.css';

// Local-host setup for Codenames: player count, per-seat name / team /
// role / AI, and word packs. Team + role travel in `options.teams` because
// the shared launcher (and the online lobby) rebuild `options.players`.

interface Props {
  onBack: () => void;
}

interface SeatDraft {
  name: string;
  team: TeamColor;
  role: CodenamesRole;
  isAI: boolean;
}

const COUNTS = [4, 5, 6, 7, 8, 9, 10, 12, 14, 16];

function draftsFor(count: number, prev: SeatDraft[] = []): SeatDraft[] {
  const teams = defaultTeams(count);
  return teams.map((t, i) => ({
    name: prev[i]?.name ?? `Agent ${i + 1}`,
    isAI: prev[i]?.isAI ?? false,
    team: t.team,
    role: t.role,
  }));
}

export function CodenamesSetup({ onBack }: Props) {
  const [seats, setSeats] = useState<SeatDraft[]>(() => draftsFor(4));
  const [selectedPacks, setSelectedPacks] = useState<WordPackId[]>(['classic']);
  const [online, setOnline] = useState(false);

  const count = seats.length;
  const pool = useMemo(() => buildPoolFromPacks(selectedPacks), [selectedPacks]);
  const poolTooSmall = pool.length < 25;
  const hasAdultsOnly = selectedPacks.some((id) => WORD_PACK_LIST.find((p) => p.id === id)?.adultsOnly);
  const slots: CodenamesTeamSlot[] = seats.map((s) => ({ team: s.team, role: s.role }));
  const validation = teamsProblem(slots);
  const aiCount = seats.filter((s) => s.isAI).length;

  const setCount = (n: number) => setSeats((cur) => draftsFor(n, cur));
  const update = (i: number, patch: Partial<SeatDraft>) =>
    setSeats((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const toggleTeam = (i: number) =>
    setSeats((cur) => {
      const me = cur[i]!;
      const team: TeamColor = me.team === 'red' ? 'blue' : 'red';
      // Moving a spymaster onto a team that already has one demotes them.
      const clash = me.role === 'spymaster' && cur.some((s, j) => j !== i && s.team === team && s.role === 'spymaster');
      return cur.map((s, j) => (j === i ? { ...s, team, role: clash ? 'operative' : s.role } : s));
    });

  const toggleRole = (i: number) =>
    setSeats((cur) => {
      const me = cur[i]!;
      if (me.role === 'spymaster') return cur.map((s, j) => (j === i ? { ...s, role: 'operative' } : s));
      // Crown a new spymaster; the old one becomes an operative.
      return cur.map((s, j) =>
        j === i ? { ...s, role: 'spymaster' } : s.team === me.team && s.role === 'spymaster' ? { ...s, role: 'operative' } : s,
      );
    });

  const togglePack = (id: WordPackId) =>
    setSelectedPacks((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const startGame = () => {
    const names = seats.map((s, i) => s.name.trim() || `Agent ${i + 1}`);
    const opts: CodenamesOptions = {
      players: seats.map((s, i) => ({ name: names[i]!, team: s.team, role: s.role, isAI: s.isAI })),
      teams: slots,
      packs: selectedPacks.length > 0 ? selectedPacks : ['classic'],
    };
    launchGame({
      module: codenamesModule,
      options: opts,
      playerNames: names,
      aiSeats: seats.flatMap((s, i) => (s.isAI ? [i] : [])),
      online,
    });
  };

  const byTeam = (team: TeamColor) => seats.map((s, i) => ({ s, i })).filter(({ s }) => s.team === team);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          ← Back
        </button>
        <div>
          <span className={styles.stamp} aria-hidden>
            Top secret
          </span>
          <h1 className={styles.title}>Codenames</h1>
          <p className={styles.tagline}>Operation briefing · assemble your networks</p>
        </div>
      </header>

      <section className={styles.folder} aria-labelledby="cn-agents">
        <span className={styles.folderTab}>File 01</span>
        <h3 id="cn-agents" className={styles.h3}>
          Field agents
        </h3>
        <p className={styles.subtitle}>
          4–16 players. Each network needs exactly one spymaster (★) and at least one operative. Tap a team chip to
          defect, the role chip to crown a spymaster, and “AI” to hand a seat to the computer.
        </p>
        <div className={styles.countControls} role="radiogroup" aria-label="Number of players">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === count}
              className={`${styles.countKey} ${n === count ? styles.countActive : ''}`}
              onClick={() => setCount(n)}
            >
              {n}
            </button>
          ))}
          {aiCount > 0 && <span className={styles.aiSummary}>{aiCount} AI</span>}
        </div>

        <div className={styles.teams}>
          {(['red', 'blue'] as TeamColor[]).map((team) => (
            <div key={team} className={styles.teamColumn} data-team={team}>
              <h4 className={styles.teamHead}>
                {team === 'red' ? 'Red' : 'Blue'} network · {byTeam(team).length}
              </h4>
              {byTeam(team).map(({ s, i }) => (
                <div key={i} className={styles.playerRow} data-team={s.team}>
                  <span className={styles.seatNumber}>{i + 1}</span>
                  <input
                    className={styles.nameInput}
                    value={s.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    maxLength={20}
                    aria-label={`Seat ${i + 1} name`}
                  />
                  <button
                    type="button"
                    className={`${styles.teamToggle} ${styles[s.team]}`}
                    onClick={() => toggleTeam(i)}
                    aria-label={`Seat ${i + 1}: ${s.team} team. Switch team`}
                  >
                    {s.team === 'red' ? 'Red' : 'Blue'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.roleToggle} ${s.role === 'spymaster' ? styles.spy : ''}`}
                    onClick={() => toggleRole(i)}
                    aria-pressed={s.role === 'spymaster'}
                    aria-label={`Seat ${i + 1}: ${s.role}. Toggle spymaster`}
                  >
                    {s.role === 'spymaster' ? '★ Spy' : 'Op'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.aiToggle} ${s.isAI ? styles.aiOn : ''}`}
                    onClick={() => update(i, { isAI: !s.isAI })}
                    aria-pressed={s.isAI}
                    aria-label={`Seat ${i + 1}: ${s.isAI ? 'AI' : 'human'}. Toggle AI`}
                  >
                    AI
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
        {validation && (
          <div className={styles.warning} role="alert">
            {validation}.
          </div>
        )}
        {online && aiCount > 0 && (
          <p className={styles.note}>AI seats run on your device as host; they freeze if you leave.</p>
        )}
      </section>

      <section className={styles.folder} aria-labelledby="cn-packs">
        <span className={styles.folderTab}>File 02</span>
        <h3 id="cn-packs" className={styles.h3}>
          Word packs
        </h3>
        <p className={styles.subtitle}>
          Pick any combination; words are deduped across packs. Classic alone is the standard game.
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
                aria-pressed={on}
              >
                <span className={styles.packEmoji} aria-hidden>
                  {p.emoji}
                </span>
                <span className={styles.packBody}>
                  <span className={styles.packName}>
                    {p.name}
                    {p.adultsOnly && <span className={styles.packAdult}> 18+</span>}
                  </span>
                  <span className={styles.packBlurb}>{p.blurb}</span>
                  <span className={styles.packCount}>{p.words.length} words</span>
                </span>
                <span className={styles.packCheck} aria-hidden>
                  {on ? 'Filed' : ''}
                </span>
              </button>
            );
          })}
        </div>
        <div className={styles.packSummary}>
          <span>
            Pool: <b>{pool.length}</b> unique words
          </span>
          {poolTooSmall && <span className={styles.warning}>Need at least 25 words — pick a pack.</span>}
          {hasAdultsOnly && !poolTooSmall && (
            <span className={styles.note}>Includes a Spicy (18+) pack — make sure your table is on board.</span>
          )}
        </div>
      </section>

      <section className={styles.folder} aria-labelledby="cn-rules">
        <span className={styles.folderTab}>File 03</span>
        <h3 id="cn-rules" className={styles.h3}>
          Standing orders
        </h3>
        <ul className={styles.rules}>
          <li>25 words. The first network has 9 agents, the other 8; 7 bystanders and 1 assassin.</li>
          <li>
            Spymasters give a <b>one-word clue</b> and a number. It may not be any form of a word still on the board.
          </li>
          <li>
            Operatives get up to <b>number + 1</b> guesses and must make at least one. A bystander or an enemy agent
            ends the turn.
          </li>
          <li>
            Touch the <b>assassin</b> and your network loses at once. Contact all your agents to win.
          </li>
        </ul>
      </section>

      <OnlineHostToggle online={online} onChange={setOnline} />

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.startButton}
          disabled={!!validation || poolTooSmall}
          onClick={startGame}
        >
          {online ? 'Open lobby →' : 'Begin operation →'}
        </button>
      </footer>
    </div>
  );
}
