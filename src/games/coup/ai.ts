import { makeRng, rngInt } from '@/engine/rng';
import type { SeatIndex } from '@/engine/types';
import type { CoupGameAction } from './actions';
import { CHARACTERS } from './characters';
import type { CharacterActionId } from './characters';
import type {
  CoupCharacter,
  CoupPrivateState,
  CoupSeatState,
} from './state';

// ============================================================================
// Coup AI
//
// Plays Classic + G54 + Anarchy. The AI gets the full private state (it runs
// host-side) so it can see its own face-down cards and any private peeks. It
// must not exploit knowledge of other seats' cards.
//
// Decision approach:
//   - Pick the highest-EV ACTION using your own cards + coin state.
//     Honest claims preferred over bluffs at low risk; bluffs increase as
//     coup-pressure rises (we're behind, or we have 7+ coins available).
//   - In challenge/block windows, decide based on:
//       (a) what's in our own hand (we KNOW we don't have it),
//       (b) base rates over the active character set (each character has 3
//           copies; ≈ 1/N per card prior),
//       (c) the claimer's revealed history (cards already flipped reduce
//           the prior).
//     We add randomized jitter so we don't become a perfect calling/blocking
//     machine — that itself is exploitable.
//
// Pure file: no DOM / no network / no store imports.
// ============================================================================

function rngForSeat(state: CoupPrivateState, seat: SeatIndex, salt: number): number {
  const rng = makeRng(
    (state.seed ^ (seat * 0x9e37) ^ (state.rngCursor * 13) ^ (salt * 101)) >>> 0,
  );
  return rngInt(rng, 10000) / 10000;
}

function aliveOpponents(state: CoupPrivateState, self: SeatIndex): SeatIndex[] {
  return state.seats
    .filter((s) => s.index !== self && !s.eliminated)
    .map((s) => s.index);
}

function hasUnrevealed(seat: CoupSeatState, char: CoupCharacter): boolean {
  return seat.influences.some((inf) => !inf.revealed && inf.char === char);
}

// True iff this character is in this match's deck.
function inDeck(state: CoupPrivateState, char: CoupCharacter): boolean {
  return state.activeCharacters.includes(char);
}

// Prior probability that a single random unseen face-down card is `char`,
// accounting for face-up reveals (those copies are no longer in the unknown pool).
function priorHasChar(state: CoupPrivateState, char: CoupCharacter): number {
  if (!inDeck(state, char)) return 0;
  const COPIES = 3;
  let revealedOfChar = 0;
  let totalRevealed = 0;
  for (const s of state.seats) {
    for (const inf of s.influences) {
      if (inf.revealed) {
        totalRevealed++;
        if (inf.char === char) revealedOfChar++;
      }
    }
  }
  const totalUnknown = state.activeCharacters.length * COPIES - totalRevealed;
  const remainingOfChar = COPIES - revealedOfChar;
  if (totalUnknown <= 0) return 0;
  return Math.max(0, remainingOfChar / totalUnknown);
}

// Probability that opponent `seat` is honest about claiming `char`, given
// they have N face-down cards. P(at least one is `char`) ≈ 1 - (1-p)^N where
// p is the single-card prior. We CANNOT see their cards (this is exactly the
// info we'd need to cheat).
function pOpponentHas(
  state: CoupPrivateState,
  seat: SeatIndex,
  char: CoupCharacter,
): number {
  const p = priorHasChar(state, char);
  const n = state.seats[seat]!.influences.filter((i) => !i.revealed).length;
  if (n <= 0) return 0;
  return 1 - Math.pow(1 - p, n);
}

// Highest-value income-style character we can claim. Tax is the standard
// Duke/banker move at +3.
function bestIncomeCharacter(state: CoupPrivateState): {
  char: CoupCharacter;
  actionId: CharacterActionId;
} | null {
  // Prefer characters whose action yields net coins. Sort by face value.
  const incomeRanked: Array<{ char: CoupCharacter; actionId: CharacterActionId; value: number }> = [];
  for (const id of state.activeCharacters) {
    const spec = CHARACTERS[id];
    if (!spec.action || !spec.implemented) continue;
    if (spec.action.target !== 'self') continue;
    let value = 0;
    if (spec.action.effect === 'taxLevy') value = spec.action.amount ?? 3;
    else if (spec.action.effect === 'gainCoins') value = spec.action.amount ?? 0;
    else if (spec.action.effect === 'mayorIncome') value = 2;
    else continue;
    incomeRanked.push({ char: id, actionId: spec.action.id, value });
  }
  if (incomeRanked.length === 0) return null;
  incomeRanked.sort((a, b) => b.value - a.value);
  return { char: incomeRanked[0]!.char, actionId: incomeRanked[0]!.actionId };
}

// Best steal-style character (Captain in Classic / Thief in G54).
function stealCharacter(state: CoupPrivateState): {
  char: CoupCharacter;
  actionId: CharacterActionId;
} | null {
  for (const id of state.activeCharacters) {
    const spec = CHARACTERS[id];
    if (!spec.action || !spec.implemented) continue;
    if (spec.action.effect === 'stealCoins') {
      return { char: id, actionId: spec.action.id };
    }
  }
  return null;
}

// Assassin / equivalent.
function assassinCharacter(state: CoupPrivateState): {
  char: CoupCharacter;
  actionId: CharacterActionId;
} | null {
  for (const id of state.activeCharacters) {
    const spec = CHARACTERS[id];
    if (!spec.action || !spec.implemented) continue;
    if (spec.action.effect === 'forceLoseInfluence' && spec.action.target === 'other') {
      return { char: id, actionId: spec.action.id };
    }
  }
  return null;
}

// Pick the best target for an attack — opponent with highest coin count and
// most influences left. Skip seats we have a treaty with or that are protected.
function pickAttackTarget(state: CoupPrivateState, self: SeatIndex): SeatIndex | null {
  const me = state.seats[self]!;
  const opps = aliveOpponents(state, self).filter((i) => {
    const o = state.seats[i]!;
    if (o.tokens.peacekeeping) return false;
    if (me.tokens.treaty === i) return false;
    return true;
  });
  if (opps.length === 0) return null;
  opps.sort((a, b) => {
    const oa = state.seats[a]!;
    const ob = state.seats[b]!;
    // Prefer high-coin, high-influence opponents.
    const liveA = oa.influences.filter((i) => !i.revealed).length;
    const liveB = ob.influences.filter((i) => !i.revealed).length;
    if (oa.coins !== ob.coins) return ob.coins - oa.coins;
    return liveB - liveA;
  });
  return opps[0]!;
}

// =============================================================================
// Choose action — turnStart
// =============================================================================
function chooseTurnStart(state: CoupPrivateState, seat: SeatIndex): CoupGameAction | null {
  const me = state.seats[seat]!;

  // Forced coup at 10+ coins.
  if (me.coins >= 10) {
    const target = pickAttackTarget(state, seat);
    if (target === null) {
      // No legal target (all protected). Take income.
      return { type: 'declareGeneral', generalId: 'income' };
    }
    return { type: 'declareGeneral', generalId: 'coup', target };
  }

  // Random jitter so we're not 100% predictable.
  const r = rngForSeat(state, seat, 1);

  // Honest assassin play (3+ coins, we hold the assassin card).
  const assn = assassinCharacter(state);
  if (assn && me.coins >= 3 && hasUnrevealed(me, assn.char)) {
    const target = pickAttackTarget(state, seat);
    if (target !== null) {
      return {
        type: 'declareCharacter',
        claimedCharacter: assn.char,
        characterActionId: assn.actionId,
        target,
      };
    }
  }

  // Coup at 7+ when we have nothing better and an opponent is leading.
  if (me.coins >= 7) {
    const target = pickAttackTarget(state, seat);
    const opp = target !== null ? state.seats[target]! : null;
    const opponentThreat = opp ? opp.coins + opp.influences.filter((i) => !i.revealed).length * 3 : 0;
    if (target !== null && (opponentThreat >= 9 || r < 0.4)) {
      return { type: 'declareGeneral', generalId: 'coup', target };
    }
  }

  // Honest income-character play.
  const inc = bestIncomeCharacter(state);
  if (inc && hasUnrevealed(me, inc.char)) {
    return {
      type: 'declareCharacter',
      claimedCharacter: inc.char,
      characterActionId: inc.actionId,
    };
  }

  // Honest steal — we hold it and there's a target with coins.
  const steal = stealCharacter(state);
  if (steal && hasUnrevealed(me, steal.char)) {
    const target = pickAttackTarget(state, seat);
    if (target !== null && state.seats[target]!.coins >= 2) {
      return {
        type: 'declareCharacter',
        claimedCharacter: steal.char,
        characterActionId: steal.actionId,
        target,
      };
    }
  }

  // Bluff scheduler. Bluff a character we DON'T have, with probability
  // scaled by:
  //   - low coins (we need income, foreignAid is safer)
  //   - few opponents (less chance someone challenges)
  //   - we have 2 influences (a failed bluff is recoverable).
  const liveInfluences = me.influences.filter((i) => !i.revealed).length;
  const numOpps = aliveOpponents(state, seat).length;
  const bluffBase = liveInfluences >= 2 ? 0.35 : 0.12;
  const bluffP = bluffBase / Math.max(1, numOpps - 1);

  if (r < bluffP && inc) {
    // Bluff the income character (Duke / Banker / similar).
    return {
      type: 'declareCharacter',
      claimedCharacter: inc.char,
      characterActionId: inc.actionId,
    };
  }
  if (r < bluffP + 0.05 && me.coins >= 3 && assn) {
    const target = pickAttackTarget(state, seat);
    if (target !== null) {
      return {
        type: 'declareCharacter',
        claimedCharacter: assn.char,
        characterActionId: assn.actionId,
        target,
      };
    }
  }

  // Fallback: foreign aid (blockable but free) vs income.
  // Foreign aid yields +2 vs income's +1; prefer when blockers seem unlikely.
  const blockerPrior = priorHasChar(state, 'duke') + priorHasChar(state, 'banker');
  const useFA = blockerPrior < 0.5 && r > 0.3;
  if (useFA) {
    return { type: 'declareGeneral', generalId: 'foreignAid' };
  }
  return { type: 'declareGeneral', generalId: 'income' };
}

// =============================================================================
// Challenge window
// =============================================================================

function chooseChallengeOrPass(
  state: CoupPrivateState,
  seat: SeatIndex,
): CoupGameAction {
  const pending = state.pending;
  if (!pending) return { type: 'pass', bySeat: seat };
  const claimed = pending.claimedCharacter;
  // Already passed?
  if (pending.passes.includes(seat)) return { type: 'pass', bySeat: seat };
  if (pending.by === seat) return { type: 'pass', bySeat: seat };

  if (!claimed) return { type: 'pass', bySeat: seat };

  // Probability the claimer actually has it.
  const p = pOpponentHas(state, pending.by, claimed);

  const me = state.seats[seat]!;
  const liveInfluences = me.influences.filter((i) => !i.revealed).length;
  // Risk tolerance scales with how desperate we are to disrupt:
  //   - 1 influence left: be cautious (don't gamble our last life).
  //   - 2 influences: more willing to challenge.
  //   - target is us with a powerful effect: more willing.
  const target = pending.target;
  const targetingMe = target === seat;
  const claimedSpec = CHARACTERS[claimed];
  const isLethalToMe =
    targetingMe &&
    (claimedSpec.action?.effect === 'forceLoseInfluence' ||
      claimedSpec.action?.effect === 'stealCoins');

  // Challenge threshold: challenge if probability they're honest is low.
  // baseThreshold = "challenge if P(honest) < threshold".
  let threshold: number;
  if (liveInfluences <= 1) threshold = 0.18;
  else if (isLethalToMe) threshold = 0.4;
  else threshold = 0.28;

  // Bayes update: if we hold ALL the unrevealed copies of `claimed`, p drops
  // to 0 — they MUST be bluffing.
  const COPIES = 3;
  let myCopies = 0;
  for (const inf of me.influences) {
    if (!inf.revealed && inf.char === claimed) myCopies++;
  }
  let revealedOfChar = 0;
  for (const s of state.seats) {
    for (const inf of s.influences) {
      if (inf.revealed && inf.char === claimed) revealedOfChar++;
    }
  }
  if (myCopies + revealedOfChar >= COPIES) {
    return { type: 'challenge', bySeat: seat };
  }

  // Random jitter so we don't become 100% predictable.
  const j = (rngForSeat(state, seat, 7) - 0.5) * 0.1;
  if (p < threshold + j) {
    return { type: 'challenge', bySeat: seat };
  }
  return { type: 'pass', bySeat: seat };
}

// =============================================================================
// Block window
// =============================================================================

function chooseBlockOrPass(
  state: CoupPrivateState,
  seat: SeatIndex,
): CoupGameAction {
  const pending = state.pending;
  if (!pending) return { type: 'pass', bySeat: seat };
  if (pending.passes.includes(seat)) return { type: 'pass', bySeat: seat };
  // The active player doesn't block their own action.
  if (pending.by === seat) return { type: 'pass', bySeat: seat };

  const me = state.seats[seat]!;
  // Find candidate blockers in this deck.
  const blockerCandidates: CoupCharacter[] = [];
  for (const id of state.activeCharacters) {
    const spec = CHARACTERS[id];
    if (!spec.blocks || spec.blocks.length === 0) continue;
    for (const b of spec.blocks) {
      let matches = false;
      if (b.blocks === 'foreignAid' && pending.generalId === 'foreignAid') matches = true;
      if (b.blocks === 'coup' && pending.generalId === 'coup' && pending.target === seat) matches = true;
      if (
        b.blocks === 'assassinate' &&
        pending.kind === 'character' &&
        pending.characterActionId === 'assassinate' &&
        pending.target === seat
      )
        matches = true;
      if (
        b.blocks === 'steal' &&
        pending.kind === 'character' &&
        (pending.characterActionId === 'steal' ||
          pending.characterActionId === 'thiefSteal' ||
          pending.characterActionId === 'customSteal') &&
        pending.target === seat
      )
        matches = true;
      if (matches) blockerCandidates.push(id);
    }
  }
  if (blockerCandidates.length === 0) return { type: 'pass', bySeat: seat };

  // Honest block?
  for (const c of blockerCandidates) {
    if (hasUnrevealed(me, c)) {
      return { type: 'declareBlock', bySeat: seat, character: c };
    }
  }

  // Bluff-block. Probability scales with how lethal the action is to us +
  // our remaining influences.
  const liveInfluences = me.influences.filter((i) => !i.revealed).length;
  const targetingMe = pending.target === seat;
  const isAssassinate =
    pending.kind === 'character' && pending.characterActionId === 'assassinate';
  const isCoup = pending.generalId === 'coup';
  const r = rngForSeat(state, seat, 31);
  let bluffP = 0;
  if (isAssassinate && targetingMe) {
    // Bluffing contessa is a classic move — high EV if challenged we lose
    // an influence, but if not challenged we save one.
    bluffP = liveInfluences >= 2 ? 0.45 : 0.7;
  } else if (isCoup && targetingMe) {
    // Coup-blocking (paramilitary / guerrilla) is rare; bluff occasionally.
    bluffP = liveInfluences >= 2 ? 0.15 : 0.35;
  } else if (pending.generalId === 'foreignAid') {
    // Bluff-Duke blocks are common in classic — low cost to fail (just lose
    // one influence), so semi-bluff at low rate.
    bluffP = liveInfluences >= 2 ? 0.12 : 0;
  } else {
    bluffP = liveInfluences >= 2 ? 0.1 : 0.2;
  }
  if (r < bluffP) {
    return {
      type: 'declareBlock',
      bySeat: seat,
      character: blockerCandidates[0]!,
    };
  }
  return { type: 'pass', bySeat: seat };
}

// =============================================================================
// Reveal / lose-influence / exchange
// =============================================================================

function chooseRevealCard(
  state: CoupPrivateState,
  seat: SeatIndex,
): CoupGameAction | null {
  const pending = state.pending;
  if (!pending) return null;
  const claimed = pending.claimedCharacter;
  // Find the card matching the claim, if we have it.
  const me = state.seats[seat]!;
  for (let i = 0; i < me.influences.length; i++) {
    const inf = me.influences[i]!;
    if (!inf.revealed && inf.char === claimed) {
      return { type: 'revealCard', bySeat: seat, cardIndex: i as 0 | 1 };
    }
  }
  // Bluff caught — reveal first unrevealed.
  for (let i = 0; i < me.influences.length; i++) {
    if (!me.influences[i]!.revealed) {
      return { type: 'revealCard', bySeat: seat, cardIndex: i as 0 | 1 };
    }
  }
  return null;
}

function choosePickInfluence(
  state: CoupPrivateState,
  seat: SeatIndex,
): CoupGameAction | null {
  const me = state.seats[seat]!;
  // Lose the LEAST valuable card. Rank value: assassin > duke > captain >
  // ambassador > contessa for classic; for G54 use action value as a proxy.
  // We approximate by preferring to lose a card whose character has the
  // smallest "best action value", protecting our strongest claim.
  function value(char: CoupCharacter): number {
    const spec = CHARACTERS[char];
    if (!spec.action) return 0;
    if (spec.action.effect === 'taxLevy') return spec.action.amount ?? 3;
    if (spec.action.effect === 'gainCoins') return spec.action.amount ?? 0;
    if (spec.action.effect === 'forceLoseInfluence') return 6;
    if (spec.action.effect === 'stealCoins') return 4;
    if (spec.action.effect === 'exchange') return 3;
    return 1;
  }
  let pickIdx = -1;
  let pickVal = Infinity;
  for (let i = 0; i < me.influences.length; i++) {
    const inf = me.influences[i]!;
    if (inf.revealed) continue;
    const v = value(inf.char);
    if (v < pickVal) {
      pickVal = v;
      pickIdx = i;
    }
  }
  if (pickIdx === -1) return null;
  return { type: 'pickInfluenceToLose', bySeat: seat, cardIndex: pickIdx as 0 | 1 };
}

function chooseExchange(
  state: CoupPrivateState,
  seat: SeatIndex,
): CoupGameAction | null {
  const offer = state.exchangeOffer;
  if (!offer) return null;
  // Pick the `keepCount` strongest cards.
  function value(char: CoupCharacter): number {
    const spec = CHARACTERS[char];
    if (!spec.action) return 0;
    if (spec.action.effect === 'taxLevy') return spec.action.amount ?? 3;
    if (spec.action.effect === 'gainCoins') return spec.action.amount ?? 0;
    if (spec.action.effect === 'forceLoseInfluence') return 6;
    if (spec.action.effect === 'stealCoins') return 4;
    if (spec.action.effect === 'exchange') return 3;
    return 1;
  }
  const indexed = offer.cards.map((c, i) => ({ idx: i, char: c, v: value(c) }));
  indexed.sort((a, b) => b.v - a.v);
  const keepIndices = indexed.slice(0, offer.keepCount).map((x) => x.idx);
  return { type: 'exchangeReturn', bySeat: seat, keepIndices };
}

// =============================================================================
// Top-level dispatch
// =============================================================================

export function aiChooseAction(
  state: CoupPrivateState,
  seat: SeatIndex,
): CoupGameAction | null {
  if (state.seats[seat]!.eliminated) return null;
  switch (state.phase) {
    case 'setup':
      return null;
    case 'gameOver':
      return null;

    case 'turnStart': {
      if (seat !== state.currentSeat) return null;
      return chooseTurnStart(state, seat);
    }

    case 'awaitingChallenge': {
      // Only opponents act here.
      if (state.pending?.by === seat) return null;
      if (state.pending?.passes.includes(seat)) return null;
      return chooseChallengeOrPass(state, seat);
    }

    case 'awaitingBlock': {
      if (state.pending?.by === seat) return null;
      if (state.pending?.passes.includes(seat)) return null;
      return chooseBlockOrPass(state, seat);
    }

    case 'awaitingBlockChallenge': {
      // We're deciding whether to challenge the blocker.
      const blockerSeat = state.pending?.blocker?.by;
      if (blockerSeat === undefined) return { type: 'pass', bySeat: seat };
      if (blockerSeat === seat) return null;
      if (state.pending?.passes.includes(seat)) return null;
      // Use the same challenge logic on the block claim.
      const claimed = state.pending?.blocker?.character;
      if (!claimed) return { type: 'pass', bySeat: seat };
      const me = state.seats[seat]!;
      // If we hold all 3 copies, challenge.
      let myCopies = 0;
      for (const inf of me.influences) {
        if (!inf.revealed && inf.char === claimed) myCopies++;
      }
      let revealedOfChar = 0;
      for (const s of state.seats) {
        for (const inf of s.influences) {
          if (inf.revealed && inf.char === claimed) revealedOfChar++;
        }
      }
      if (myCopies + revealedOfChar >= 3) {
        return { type: 'challenge', bySeat: seat };
      }
      const p = pOpponentHas(state, blockerSeat, claimed);
      const j = (rngForSeat(state, seat, 13) - 0.5) * 0.1;
      // Slightly more aggressive on block-challenges — the blocker is
      // usually the threatened seat and bluff-blocks are common.
      if (p < 0.32 + j) {
        return { type: 'challenge', bySeat: seat };
      }
      return { type: 'pass', bySeat: seat };
    }

    case 'challengeReveal': {
      // Only the claimer reveals.
      if (state.pending?.blocker?.by === seat) {
        return chooseRevealCard(state, seat);
      }
      if (state.pending?.by === seat) {
        return chooseRevealCard(state, seat);
      }
      return null;
    }

    case 'loseInfluence': {
      const pendingSeat = state.pending?.loseInfluencePending?.seat;
      if (pendingSeat !== seat) return null;
      return choosePickInfluence(state, seat);
    }

    case 'exchangePick': {
      if (state.pending?.by !== seat) return null;
      return chooseExchange(state, seat);
    }

    case 'spyPeek': {
      if (state.pending?.by !== seat) return null;
      return { type: 'ackPeek', bySeat: seat };
    }

    case 'pileOnWindow': {
      // Opponents may join the pile-on for a +1 coin tax/income. Always join
      // if it's positive (coinsEach >= 1) and we're not the originator.
      if (state.pending?.by === seat) return { type: 'closePileOn', bySeat: seat };
      const pot = state.pending?.pileOnPot;
      if (!pot) return null;
      if (pot.contributors.includes(seat) || pot.closed.includes(seat)) {
        return null;
      }
      const r = rngForSeat(state, seat, 41);
      // 70% join — small upside, but skipping is fine too.
      if (r < 0.7) return { type: 'joinPileOn', bySeat: seat };
      return { type: 'closePileOn', bySeat: seat };
    }

    case 'chipInWindow': {
      const pot = state.pending?.chipInPot;
      if (!pot) return null;
      if (state.pending?.by === seat) return null;
      if (state.pending?.target === seat) return null;
      if (pot.contributors.includes(seat) || pot.passes.includes(seat)) {
        return null;
      }
      // Chip in if we can afford and we'd benefit (target is a leader).
      const me = state.seats[seat]!;
      if (me.coins < 1) return { type: 'pass', bySeat: seat };
      const tgt = state.pending?.target !== null ? state.seats[state.pending!.target!]! : null;
      const tgtThreat = tgt
        ? tgt.coins + tgt.influences.filter((i) => !i.revealed).length * 3
        : 0;
      const r = rngForSeat(state, seat, 47);
      if (tgtThreat >= 6 && r < 0.6) return { type: 'chipIn', bySeat: seat };
      return { type: 'pass', bySeat: seat };
    }

    case 'targetSwapPick': {
      // Target picks a card to swap.
      if (state.pending?.swapInProgress?.target !== seat) return null;
      // Lose the least valuable.
      return choosePickInfluence(state, seat) === null
        ? null
        : {
            type: 'targetSwapPick',
            bySeat: seat,
            cardIndex:
              (
                choosePickInfluence(state, seat) as Extract<
                  CoupGameAction,
                  { type: 'pickInfluenceToLose' }
                >
              ).cardIndex,
          };
    }

    case 'sellInfluencePick': {
      if (state.pending?.by !== seat) return null;
      // Sell our least valuable card.
      const me = state.seats[seat]!;
      let pickIdx = -1;
      for (let i = 0; i < me.influences.length; i++) {
        if (!me.influences[i]!.revealed) {
          pickIdx = i;
          break;
        }
      }
      if (pickIdx === -1) return null;
      return { type: 'sellInfluence', bySeat: seat, cardIndex: pickIdx as 0 | 1 };
    }

    case 'turnEnd': {
      // Ack passes through to next turn automatically.
      return { type: 'ackTurn', bySeat: seat };
    }
  }
  void seat;
  return null;
}
