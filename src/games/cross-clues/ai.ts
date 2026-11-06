import type { SeatIndex } from '@/engine/types';
import { hashString, relatedness, themeCandidates, vocabulary } from '@/games/codenames/lexicon';
import type { CrossCluesAction } from './actions';
import { clueProblem } from './rules';
import type { Coord, CrossCluesPrivateState, CrossCluesPublicState } from './state';
import { crossCluesViewFor } from './view';

// ============================================================================
// Cross Clues heuristic AI.
//
// Fairness: decisions are made from `crossCluesViewFor(state, seat)` — the
// same redacted view a human in that seat gets. Only the clue-giver's view
// carries the held coordinate, so an AI guesser cannot read it.
//
// - Clue-giver: try every word in the shared association lexicon and keep
//   the one that points at its cell (row word + column word) most clearly
//   above every other open cell. If no theme word separates the cell, fall
//   back to a blend of the two words (OCEAN × PIANO → "OCEAIANO"): legal (it
//   contains neither word), and decodable by humans and the AI guesser.
// - Guesser: score each open cell by how strongly the clue relates to its
//   row and column words (themes, rhymes, blends) and pick the best.
// - Setup / reveal: acknowledge straight away.
//
// Pure: no DOM / network / store imports.
// ============================================================================

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

/** How well `clue` reads as a blend of `row` (front) + `col` (back), 0..~1. */
export function blendScore(clueRaw: string, rowRaw: string, colRaw: string): number {
  const clue = clueRaw.toUpperCase().replace(/['’-]/g, '');
  const row = rowRaw.toUpperCase();
  const col = colRaw.toUpperCase();
  const p = commonPrefix(clue, row);
  const q = commonSuffix(clue, col);
  if (p < 2 || q < 2 || p + q > clue.length) return 0;
  return 0.5 * (p / row.length + q / col.length);
}

function openCells(view: CrossCluesPublicState): Coord[] {
  const out: Coord[] = [];
  view.grid.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (!cell.resolved) out.push({ row: r, col: c });
    }),
  );
  return out;
}

/** Score every open cell for a clue (public information only). */
export function scoreCells(view: CrossCluesPublicState, clue: string): Array<{ coord: Coord; score: number }> {
  const rowRel = view.rowWords.map((w) => relatedness(clue, w));
  const colRel = view.colWords.map((w) => relatedness(clue, w));
  return openCells(view).map((coord) => {
    const r = rowRel[coord.row] ?? 0;
    const c = colRel[coord.col] ?? 0;
    // Reward cells where BOTH words connect, not one very strong half.
    const both = r + c + 0.5 * Math.min(r, c);
    const blend = 1.6 * blendScore(clue, view.rowWords[coord.row]!, view.colWords[coord.col]!);
    return { coord, score: Math.max(both, blend) };
  });
}

function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

let candidatePool: string[] | null = null;
function candidates(): string[] {
  if (!candidatePool) {
    const set = new Set<string>();
    for (const t of themeCandidates()) set.add(t.key);
    for (const w of vocabulary()) set.add(w);
    candidatePool = [...set];
  }
  return candidatePool;
}

export function chooseCrossClue(view: CrossCluesPublicState, target: Coord): string {
  const gridWords = [...view.rowWords, ...view.colWords];
  // Engine legality, plus a stricter AI house rule: never start or end with
  // a grid word (so no "OCEANFRONT" while OCEAN is a header).
  const legal = (w: string) =>
    clueProblem(w, gridWords) === null &&
    !gridWords.some((g) => g.length >= 3 && (w.startsWith(g) || w.endsWith(g)));
  const salt = hashString(`${gridWords.join('|')}#${view.roundNumber}`);

  const rowWord = view.rowWords[target.row]!;
  const colWord = view.colWords[target.col]!;
  let best: { word: string; margin: number } | null = null;
  for (const w of candidates()) {
    // Cheap pre-filter: a word that misses either half can't single the
    // cell out (its whole row or column would score at least as high).
    if (relatedness(w, rowWord) === 0 || relatedness(w, colWord) === 0) continue;
    if (!legal(w)) continue;
    const scored = scoreCells(view, w);
    const mine = scored.find((s) => sameCoord(s.coord, target))?.score ?? 0;
    let rival = 0;
    for (const s of scored) if (!sameCoord(s.coord, target)) rival = Math.max(rival, s.score);
    const jitter = ((hashString(w) ^ salt) % 1000) / 50000;
    const margin = mine - rival + jitter;
    if (mine > 0 && (!best || margin > best.margin)) best = { word: w, margin };
  }
  if (best && best.margin > 0.08) return best.word;

  // Blend fallback: longest front of the row word + longest back of the
  // column word that is still legal (contains neither word whole).
  const row = view.rowWords[target.row]!.toUpperCase();
  const col = view.colWords[target.col]!.toUpperCase();
  for (let cut = 1; cut < Math.max(row.length, col.length); cut++) {
    const front = row.slice(0, Math.max(2, row.length - cut));
    const back = col.slice(Math.min(col.length - 2, cut));
    const blend = `${front}${back}`.slice(0, 32);
    if (legal(blend)) return blend;
  }
  if (best) return best.word;
  // Last resort: any legal lexicon word (never stalls).
  for (const w of candidates()) if (legal(w)) return w;
  return 'HMM';
}

export function chooseGuess(view: CrossCluesPublicState, seat: SeatIndex): Coord | null {
  const clue = view.currentClue;
  const scored = scoreCells(view, clue ?? '');
  if (scored.length === 0) return null;
  const salt = hashString(`${clue ?? ''}|${view.roundNumber}|${seat}`);
  let best = scored[0]!;
  let bestScore = -Infinity;
  for (const s of scored) {
    // Deterministic jitter (< 0.01) so ties don't always go top-left.
    const jitter = ((salt ^ Math.imul(s.coord.row * 5 + s.coord.col + 1, 0x9e3779b1)) >>> 0) % 1000 / 100000;
    if (s.score + jitter > bestScore) {
      bestScore = s.score + jitter;
      best = s;
    }
  }
  return best.coord;
}

export function aiChooseAction(state: CrossCluesPrivateState, seat: SeatIndex): CrossCluesAction | null {
  switch (state.phase) {
    case 'setup':
      if (state.setupAcked[seat]) return null;
      return { type: 'ackSetup', bySeat: seat };

    case 'clueGiving': {
      if (seat !== state.currentClueGiver) return null;
      const view = crossCluesViewFor(state, seat);
      if (!view.yourCoord) return null;
      return { type: 'submitClue', bySeat: seat, clue: chooseCrossClue(view, view.yourCoord) };
    }

    case 'guessing': {
      if (seat !== state.currentGuesser) return null;
      const pick = chooseGuess(crossCluesViewFor(state, seat), seat);
      if (!pick) return null;
      return { type: 'submitGuess', bySeat: seat, coord: pick };
    }

    case 'revealRound':
      if (state.revealAcked[seat]) return null;
      return { type: 'ackReveal', bySeat: seat };

    case 'gameOver':
      return null;
  }
}
