import type { SeatIndex } from '@/engine/types';
import type { CodenamesAction } from './actions';
import { hashString, relatedness, themeCandidates, vocabulary } from './lexicon';
import { clueProblem, visibleWords } from './rules';
import type { CodenamesPrivateState, CodenamesPublicCard, CodenamesPublicState, TeamColor } from './state';
import { codenamesViewFor } from './view';
import { WORD_PACK_LIST } from '@/words';

// ============================================================================
// Codenames heuristic AI.
//
// Fairness: every decision is made from `codenamesViewFor(state, seat)` —
// the same redacted view a human in that seat would get. A spymaster's
// view carries the key (as it does for a human spymaster); an operative's
// view does not, so an AI operative can't peek even by accident. The only
// other input is the public word-association lexicon.
//
// - Spymaster: for every theme key in the lexicon, simulate how an
//   operative would rank the face-up words, and count how many of its own
//   agents rank strictly above every non-own word. Pick the key with the
//   largest safe count (assassin anywhere in the top N+1 disqualifies).
//   Falls back to a rhyme / prefix clue for a single agent.
// - Operative: rank face-up words by relatedness to the clue (plus words
//   left over from the team's earlier clues), guess the best, and stop when
//   nothing looks related enough. Defers to human operatives on its team.
//
// Pure: no DOM / network / store imports.
// ============================================================================

const GUESS_THRESHOLD = 0.42;
const BONUS_THRESHOLD = 0.8;

export function aiChooseAction(state: CodenamesPrivateState, seat: SeatIndex): CodenamesAction | null {
  if (state.phase === 'gameOver') return null;
  const me = state.seats[seat];
  if (!me || me.team !== state.currentTeam) return null;

  if (state.phase === 'clue') {
    if (me.role !== 'spymaster') return null;
    return spymasterMove(codenamesViewFor(state, seat), seat);
  }

  // Guessing.
  if (me.role !== 'operative') return null;
  // Human teammates make the calls; AI operatives only fill an all-AI crew.
  const humanOperative = state.seats.some(
    (s) => s.team === me.team && s.role === 'operative' && !s.isAI,
  );
  if (humanOperative) return null;
  return operativeMove(codenamesViewFor(state, seat), seat);
}

// ---- Operative --------------------------------------------------------------

interface Scored {
  card: CodenamesPublicCard;
  score: number;
}

/** Rank face-up cards for the current clue, using only public information. */
export function rankForClue(view: CodenamesPublicState, seat: SeatIndex): Scored[] {
  const clue = view.currentClue;
  if (!clue) return [];
  const faceUp = view.cards.filter((c) => !c.revealed);
  const currentIdx = view.clueHistory.length - 1;
  // Earlier clues from this team that weren't fully found.
  const leftovers = view.clueHistory.filter((r, i) => {
    if (i === currentIdx || r.byTeam !== clue.byTeam || r.number <= 0) return false;
    return r.correctGuesses < r.number;
  });
  const salt = hashString(`${clue.word}|${view.guessesThisClue}|${seat}|${view.clueHistory.length}`);
  return faceUp
    .map((card) => {
      const direct = relatedness(clue.word, card.word);
      let leftover = 0;
      for (const r of leftovers) leftover = Math.max(leftover, 0.85 * relatedness(r.word, card.word));
      // A "zero" clue means "none of ours relate to this": steer away.
      const base = clue.number === 0 ? leftover - 0.5 * direct : Math.max(direct, leftover);
      // Deterministic jitter (< 0.01) so ties don't always pick the top-left.
      const jitter = ((hashString(card.word) ^ salt) % 1000) / 100000;
      return { card, score: base + jitter };
    })
    .sort((a, b) => b.score - a.score);
}

function operativeMove(view: CodenamesPublicState, seat: SeatIndex): CodenamesAction | null {
  const clue = view.currentClue;
  if (!clue) return null;
  const ranked = rankForClue(view, seat);
  const top = ranked[0];
  if (!top) return null;
  const g = view.guessesThisClue;
  const guess: CodenamesAction = { type: 'guessCard', bySeat: seat, cardIndex: top.card.index };
  const stop: CodenamesAction = { type: 'endGuessing', bySeat: seat };
  // The rulebook demands at least one guess per turn.
  if (g === 0) return guess;
  if (clue.number === 0) return top.score >= 0.6 ? guess : stop;
  if (g < clue.number) return top.score >= GUESS_THRESHOLD ? guess : stop;
  // The +1 bonus guess: only for a strong leftover from an earlier clue.
  return top.score >= BONUS_THRESHOLD ? guess : stop;
}

// ---- Spymaster --------------------------------------------------------------

interface ClueChoice {
  word: string;
  number: number;
  score: number;
}

/**
 * How many of `team`'s agents an operative would take, in order, before
 * touching anything else for `clue` — and whether that risks the assassin.
 */
function evaluateClue(
  clue: string,
  faceUp: CodenamesPublicCard[],
  team: TeamColor,
  themeOnly: boolean,
): { safe: number; margin: number; assassinRisk: boolean } {
  // Own agents only count when the link is a real theme link (for a human
  // operative, FORECAST → FORK is not a clue); everyone else is scored with
  // every link the operative AI would use, so spelling accidents still block.
  const scored = faceUp
    .map((c) => ({
      c,
      s: c.kind === team && themeOnly ? relatedness(clue, c.word, false) : relatedness(clue, c.word),
    }))
    .sort((a, b) => b.s - a.s);
  const bestBad = scored.find((x) => x.c.kind !== team)?.s ?? 0;
  let safe = 0;
  let lastOwn = 0;
  for (const x of scored) {
    if (x.c.kind !== team) break;
    if (x.s < GUESS_THRESHOLD || x.s <= bestBad + 0.04) break;
    safe++;
    lastOwn = x.s;
  }
  // The assassin must not sit within reach of the N+1 guesses.
  const reach = scored.slice(0, safe + 1);
  const assassinRisk = reach.some((x) => x.c.kind === 'assassin' && x.s >= GUESS_THRESHOLD - 0.1);
  return { safe, margin: lastOwn - bestBad, assassinRisk };
}

let fallbackPool: string[] | null = null;
function fallbackVocabulary(): string[] {
  if (!fallbackPool) {
    const set = new Set<string>(vocabulary());
    for (const p of WORD_PACK_LIST) for (const w of p.words) set.add(w.toUpperCase());
    fallbackPool = [...set];
  }
  return fallbackPool;
}

export function chooseClue(view: CodenamesPublicState): ClueChoice {
  const team = view.yourTeam ?? view.currentTeam;
  const faceUp = view.cards.filter((c) => !c.revealed);
  const visible = visibleWords(view.cards);
  const used = new Set(view.clueHistory.map((c) => c.word));
  const salt = hashString(`${view.cards.map((c) => c.word).join('|')}#${view.clueHistory.length}`);
  // Engine legality, plus a stricter house rule for the AI: no clue that
  // starts or ends with a face-up word (BIRTHDAY while DAY is visible).
  const valid = (w: string) =>
    !used.has(w) &&
    clueProblem(w, visible) === null &&
    !visible.some((v) => v.length >= 3 && (w.startsWith(v) || w.endsWith(v)));

  let best: ClueChoice | null = null;
  const seen = new Set<string>();
  for (const cand of themeCandidates()) {
    if (seen.has(cand.key)) continue;
    seen.add(cand.key);
    if (!valid(cand.key)) continue;
    const { safe, margin, assassinRisk } = evaluateClue(cand.key, faceUp, team, true);
    if (safe < 1 || assassinRisk) continue;
    // Bigger safe counts win; margin and a little jitter break ties so the
    // AI doesn't open with the same clue on every similar board.
    const jitter = ((hashString(cand.key) ^ salt) % 1000) / 20000;
    const score = safe + Math.min(0.4, margin) + jitter;
    if (!best || score > best.score) best = { word: cand.key, number: safe, score };
  }
  if (best) return best;

  // Fallback: a one-agent rhyme / prefix clue (BRIDGE → FRIDGE).
  const own = faceUp.filter((c) => c.kind === team);
  let fb: ClueChoice | null = null;
  for (const w of fallbackVocabulary()) {
    if (!valid(w)) continue;
    for (const target of own) {
      const t = relatedness(w, target.word);
      if (t < GUESS_THRESHOLD) continue;
      let worst = 0;
      for (const c of faceUp) if (c !== target) worst = Math.max(worst, relatedness(w, c.word));
      const score = t - worst;
      if (score > 0.04 && (!fb || score > fb.score)) fb = { word: w, number: 1, score };
    }
  }
  if (fb) return fb;

  // Last resort: any legal word, one agent. The operatives will have to
  // take a punt — still a legal move, so the game never stalls.
  const pool = fallbackVocabulary();
  const start = salt % pool.length;
  for (let k = 0; k < pool.length; k++) {
    const w = pool[(start + k) % pool.length]!;
    if (valid(w)) return { word: w, number: 1, score: 0 };
  }
  for (let n = 1; ; n++) {
    const w = `AGENT${n}`;
    if (valid(w)) return { word: w, number: 1, score: 0 };
  }
}

function spymasterMove(view: CodenamesPublicState, seat: SeatIndex): CodenamesAction {
  const { word, number } = chooseClue(view);
  return { type: 'giveClue', bySeat: seat, word, number };
}
