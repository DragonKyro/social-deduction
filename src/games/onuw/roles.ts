import type { OnuwRoleId } from './state';

// Static metadata for every ONUW role. Each role declares which "pack" it
// belongs to (base / daybreak / bonus), the team it scores for, its night
// wake order, and a short description used by the setup screen + the
// in-game cheatsheet during discussion / voting.

export type OnuwTeam = 'village' | 'werewolves' | 'tanner';

export type OnuwPack = 'base' | 'daybreak' | 'bonus';

export interface OnuwRoleSpec {
  id: OnuwRoleId;
  name: string;
  team: OnuwTeam;
  pack: OnuwPack;
  // Canonical wake-order step. Roles that don't act at night use Infinity
  // so they sit at the tail of the sorted order list. We still keep all
  // role entries in the list so the cheatsheet can show "no night action".
  wakeOrder: number;
  // Short rules description, shown on role-reveal and the cheatsheet.
  description: string;
  // True when the role takes an interactive night action (host pauses the
  // night cursor and waits for the seat to submit an action). False = the
  // night step is automatic / observational only (Insomniac, Beholder…).
  hasInteractiveAction: boolean;
}

// Canonical Bezier rulebook wake-order. Lower = earlier in the night.
// References:
//  - Base game rulebook (steps in increments of 10)
//  - Daybreak rulebook (interleaved steps)
//  - Bonus packs (slotted alongside their natural counterparts)
//
// We use multiples of 10 with sub-slots so future roles can wedge in
// without renumbering everyone.
export const ROLES: Record<OnuwRoleId, OnuwRoleSpec> = {
  // ============================================================
  // Base game
  // ============================================================
  doppelganger: {
    id: 'doppelganger',
    name: 'Doppelganger',
    team: 'village',
    pack: 'daybreak',
    wakeOrder: 5,
    description:
      'Look at another player\'s card and become that role. Wake again at that role\'s normal step (if it has a night action).',
    hasInteractiveAction: true,
  },
  werewolf: {
    id: 'werewolf',
    name: 'Werewolf',
    team: 'werewolves',
    pack: 'base',
    wakeOrder: 10,
    description:
      'Wake and see the other werewolves. If you are the only werewolf, you may look at one card in the center.',
    hasInteractiveAction: true,
  },
  alphaWolf: {
    id: 'alphaWolf',
    name: 'Alpha Wolf',
    team: 'werewolves',
    pack: 'daybreak',
    wakeOrder: 12,
    description:
      'Wakes with the werewolves; then chooses a non-werewolf player and swaps that card with a werewolf card from the center. That player is now a werewolf (but does not know it).',
    hasInteractiveAction: true,
  },
  mysticWolf: {
    id: 'mysticWolf',
    name: 'Mystic Wolf',
    team: 'werewolves',
    pack: 'daybreak',
    wakeOrder: 14,
    description:
      'Wakes with the werewolves; then may look at one other player\'s card.',
    hasInteractiveAction: true,
  },
  dreamWolf: {
    id: 'dreamWolf',
    name: 'Dream Wolf',
    team: 'werewolves',
    pack: 'daybreak',
    wakeOrder: 16,
    description:
      'A werewolf, but stays asleep — does not see the other werewolves. Other werewolves see Dream Wolf, but Dream Wolf does not see them.',
    hasInteractiveAction: false,
  },
  minion: {
    id: 'minion',
    name: 'Minion',
    team: 'werewolves',
    pack: 'base',
    wakeOrder: 20,
    description:
      'See the werewolves. The werewolves do not see you. You win with the werewolves — and if no werewolf is killed, you may even survive being voted yourself.',
    hasInteractiveAction: true,
  },
  mason: {
    id: 'mason',
    name: 'Mason',
    team: 'village',
    pack: 'base',
    wakeOrder: 30,
    description: 'Wake and see your fellow Mason (if any).',
    hasInteractiveAction: true,
  },
  seer: {
    id: 'seer',
    name: 'Seer',
    team: 'village',
    pack: 'base',
    wakeOrder: 40,
    description:
      'Look at one other player\'s card OR two of the three center cards.',
    hasInteractiveAction: true,
  },
  apprenticeSeer: {
    id: 'apprenticeSeer',
    name: 'Apprentice Seer',
    team: 'village',
    pack: 'daybreak',
    wakeOrder: 42,
    description: 'Look at one card from the center.',
    hasInteractiveAction: true,
  },
  paranormalInvestigator: {
    id: 'paranormalInvestigator',
    name: 'Paranormal Investigator',
    team: 'village',
    pack: 'daybreak',
    wakeOrder: 44,
    description:
      'Look at up to two players\' cards, one at a time. Stop as soon as you see a werewolf or tanner — and you become that team.',
    hasInteractiveAction: true,
  },
  robber: {
    id: 'robber',
    name: 'Robber',
    team: 'village',
    pack: 'base',
    wakeOrder: 50,
    description:
      'You may swap your card with another player\'s, then secretly look at your new role. You are now that role.',
    hasInteractiveAction: true,
  },
  witch: {
    id: 'witch',
    name: 'Witch',
    team: 'village',
    pack: 'daybreak',
    wakeOrder: 55,
    description:
      'Look at one card from the center, then swap it with another player\'s card. (You may swap with yourself.) That player is now that role.',
    hasInteractiveAction: true,
  },
  troublemaker: {
    id: 'troublemaker',
    name: 'Troublemaker',
    team: 'village',
    pack: 'base',
    wakeOrder: 60,
    description:
      'Swap the cards of two other players (without looking at them).',
    hasInteractiveAction: true,
  },
  villageIdiot: {
    id: 'villageIdiot',
    name: 'Village Idiot',
    team: 'village',
    pack: 'daybreak',
    wakeOrder: 65,
    description:
      'Shift all players\' cards (other than your own) one slot left or right.',
    hasInteractiveAction: true,
  },
  drunk: {
    id: 'drunk',
    name: 'Drunk',
    team: 'village',
    pack: 'base',
    wakeOrder: 70,
    description:
      'Swap your card with a card from the center, without looking at it. You no longer know your own role.',
    hasInteractiveAction: true,
  },
  insomniac: {
    id: 'insomniac',
    name: 'Insomniac',
    team: 'village',
    pack: 'base',
    wakeOrder: 80,
    description: 'Wake at the end of the night and look at your own card.',
    hasInteractiveAction: false,
  },
  revealer: {
    id: 'revealer',
    name: 'Revealer',
    team: 'village',
    pack: 'daybreak',
    wakeOrder: 85,
    description:
      'Flip over another player\'s card so it is visible to everyone. If it is a werewolf or tanner, flip it back; otherwise leave it visible.',
    hasInteractiveAction: true,
  },
  curator: {
    id: 'curator',
    name: 'Curator',
    team: 'village',
    pack: 'daybreak',
    wakeOrder: 90,
    description:
      'Give one random artifact to a player. (We just narrate this — artifacts are flavor.)',
    hasInteractiveAction: true,
  },

  // ============================================================
  // Base game — non-night roles (sorted to the back of the order)
  // ============================================================
  tanner: {
    id: 'tanner',
    name: 'Tanner',
    team: 'tanner',
    pack: 'base',
    wakeOrder: 1000,
    description:
      'You hate your life. You win ONLY if you are killed by the village. You do not win with anyone else.',
    hasInteractiveAction: false,
  },
  hunter: {
    id: 'hunter',
    name: 'Hunter',
    team: 'village',
    pack: 'base',
    wakeOrder: 1000,
    description:
      'If you are killed, the player you voted for is also killed.',
    hasInteractiveAction: false,
  },
  villager: {
    id: 'villager',
    name: 'Villager',
    team: 'village',
    pack: 'base',
    wakeOrder: 1000,
    description: 'A regular villager. No night action. Find the werewolves.',
    hasInteractiveAction: false,
  },

  // ============================================================
  // Bonus Roles pack
  // ============================================================
  auraSeer: {
    id: 'auraSeer',
    name: 'Aura Seer',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 95,
    description:
      'At the end of the night, see how many players woke up and performed an action.',
    hasInteractiveAction: false,
  },
  cursed: {
    id: 'cursed',
    name: 'Cursed',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 1000,
    description:
      'Village team — but if the werewolves "look at" you in the night (PI, Mystic Wolf, etc.) or you are voted out, you count as a werewolf for win conditions.',
    hasInteractiveAction: false,
  },
  prince: {
    id: 'prince',
    name: 'Prince',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 1000,
    description:
      'If you would be voted out, you are not killed. (Votes against you go to the next-highest target.)',
    hasInteractiveAction: false,
  },
  apprenticeTanner: {
    id: 'apprenticeTanner',
    name: 'Apprentice Tanner',
    team: 'tanner',
    pack: 'bonus',
    wakeOrder: 1000,
    description:
      'Like Tanner, but a weaker copy. You win if you are killed.',
    hasInteractiveAction: false,
  },
  beholder: {
    id: 'beholder',
    name: 'Beholder',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 45,
    description: 'Wake after the Seer and learn which player is the Seer.',
    hasInteractiveAction: false,
  },
  thing: {
    id: 'thing',
    name: 'The Thing',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 35,
    description:
      'Secretly tap one of your neighbors on the shoulder. (Flavor only — both neighbors are notified you tapped someone.)',
    hasInteractiveAction: true,
  },
  squire: {
    id: 'squire',
    name: 'Squire',
    team: 'werewolves',
    pack: 'bonus',
    wakeOrder: 18,
    description:
      'Wake and see which positions (player slots or center cards) hold a werewolf card. You do not learn who holds them when swapped.',
    hasInteractiveAction: false,
  },
  bodySnatcher: {
    id: 'bodySnatcher',
    name: 'Body Snatcher',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 52,
    description:
      'Swap your card with another player\'s card. You secretly become that role and take that role\'s team.',
    hasInteractiveAction: true,
  },
  empath: {
    id: 'empath',
    name: 'Empath',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 47,
    description:
      'Count the number of werewolves among your two adjacent neighbors.',
    hasInteractiveAction: false,
  },
  nostradamus: {
    id: 'nostradamus',
    name: 'Nostradamus',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 1000,
    description:
      'Before voting, publicly predict who will be killed. If correct, your team wins regardless. (Honor-system flavor in this implementation.)',
    hasInteractiveAction: false,
  },
  familyMan: {
    id: 'familyMan',
    name: 'Family Man',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 1000,
    description:
      'You are on the village team — but if a werewolf sits next to you at the end of the night, you secretly win with werewolves instead.',
    hasInteractiveAction: false,
  },
  windyWendy: {
    id: 'windyWendy',
    name: 'Windy Wendy',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 63,
    description:
      'Take one card from another player\'s position and slide it into the position next to it (the next seat or center slot).',
    hasInteractiveAction: true,
  },
  defenderEr: {
    id: 'defenderEr',
    name: 'Defender-er',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 28,
    description:
      'Protect one player. They cannot be targeted by night actions afterwards. (Simplified narration in this build.)',
    hasInteractiveAction: true,
  },
  theSponge: {
    id: 'theSponge',
    name: 'The Sponge',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 1000,
    description:
      'At the end of the night, your team becomes the team of one of your neighbors.',
    hasInteractiveAction: false,
  },
  ricochetRhino: {
    id: 'ricochetRhino',
    name: 'Ricochet Rhino',
    team: 'werewolves',
    pack: 'bonus',
    wakeOrder: 1000,
    description:
      'Werewolf team. If you would receive a vote, that vote ricochets to the next seat clockwise.',
    hasInteractiveAction: false,
  },
  innocentBystander: {
    id: 'innocentBystander',
    name: 'Innocent Bystander',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 1000,
    description: 'A village role. No night action. Filler role.',
    hasInteractiveAction: false,
  },
};

// Ordered groupings for the setup UI.
export const BASE_ROLES: OnuwRoleId[] = [
  'werewolf',
  'minion',
  'mason',
  'seer',
  'robber',
  'troublemaker',
  'tanner',
  'drunk',
  'insomniac',
  'hunter',
  'villager',
];

export const DAYBREAK_ROLES: OnuwRoleId[] = [
  'doppelganger',
  'witch',
  'apprenticeSeer',
  'paranormalInvestigator',
  'villageIdiot',
  'revealer',
  'curator',
  'alphaWolf',
  'mysticWolf',
  'dreamWolf',
];

export const BONUS_ROLES: OnuwRoleId[] = [
  'auraSeer',
  'cursed',
  'prince',
  'apprenticeTanner',
  'beholder',
  'thing',
  'squire',
  'bodySnatcher',
  'empath',
  'nostradamus',
  'familyMan',
  'windyWendy',
  'defenderEr',
  'theSponge',
  'ricochetRhino',
  'innocentBystander',
];

// Default maximum copies of a given role in a single match. Werewolves cap
// at 2, Masons at 2, Villagers at 3 (matching the printed cards in the
// base game); everything else is unique.
export const ROLE_MAX_COUNT: Record<OnuwRoleId, number> = (() => {
  const out: Record<string, number> = {};
  for (const id of Object.keys(ROLES)) out[id] = 1;
  out.werewolf = 2;
  out.mason = 2;
  out.villager = 3;
  return out as Record<OnuwRoleId, number>;
})();

export function rolesSortedByWakeOrder(pool: readonly OnuwRoleId[]): OnuwRoleId[] {
  return pool
    .slice()
    .sort((a, b) => {
      const wa = ROLES[a].wakeOrder;
      const wb = ROLES[b].wakeOrder;
      if (wa !== wb) return wa - wb;
      return a.localeCompare(b);
    });
}
