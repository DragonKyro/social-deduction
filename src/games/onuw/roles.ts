import type { OnuwRoleId, OnuwTeamId } from './state';

// Static metadata for every ONUW role. Each role declares which "pack" it
// belongs to (base / daybreak / bonus), the team it scores for, its night
// wake order, and a short description used by the setup screen + the
// in-game cheatsheet during discussion / voting.

export type OnuwTeam = OnuwTeamId;

// How a Doppelganger that copies this role acts (official rule):
//  - 'join'  wakes WITH the original role (werewolves see a Doppel-werewolf,
//            masons see a Doppel-mason, ...).
//  - 'now'   performs the copied action immediately, during its own wake-up.
//  - 'after' wakes again right after the original role (Doppel-Insomniac).
export type OnuwDoppelMode = 'join' | 'now' | 'after';

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
  // Doppelganger behaviour when this role is copied (undefined = no night
  // action to copy).
  doppel?: OnuwDoppelMode;
  // The night action must be taken (a plain "pass" is rejected).
  mandatory?: boolean;
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
      'Look at another player\'s card and become that role. Seer, Robber, Troublemaker, Drunk and similar actions happen immediately; a copied Werewolf, Minion or Mason wakes with them; a copied Insomniac, Revealer or Curator wakes again after the original.',
    hasInteractiveAction: true,
    mandatory: true,
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
    doppel: 'join',
  },
  alphaWolf: {
    id: 'alphaWolf',
    name: 'Alpha Wolf',
    team: 'werewolves',
    pack: 'daybreak',
    wakeOrder: 12,
    description:
      'Wakes with the werewolves; then must exchange the center werewolf card with another non-werewolf player\'s card. That player is now a werewolf (but does not know it).',
    hasInteractiveAction: true,
    doppel: 'join',
    mandatory: true,
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
    doppel: 'join',
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
      'See the werewolves; they do not see you. You win with the werewolves — even if you are killed, as long as no werewolf dies. If no player is a werewolf, you win if someone other than you dies.',
    hasInteractiveAction: true,
    doppel: 'join',
  },
  mason: {
    id: 'mason',
    name: 'Mason',
    team: 'village',
    pack: 'base',
    wakeOrder: 30,
    description: 'Wake and see your fellow Mason (if any).',
    hasInteractiveAction: true,
    doppel: 'join',
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
    doppel: 'now',
  },
  apprenticeSeer: {
    id: 'apprenticeSeer',
    name: 'Apprentice Seer',
    team: 'village',
    pack: 'daybreak',
    wakeOrder: 42,
    description: 'Look at one card from the center.',
    hasInteractiveAction: true,
    doppel: 'now',
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
    doppel: 'now',
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
    doppel: 'now',
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
    doppel: 'now',
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
    doppel: 'now',
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
    doppel: 'now',
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
    doppel: 'now',
    mandatory: true,
  },
  insomniac: {
    id: 'insomniac',
    name: 'Insomniac',
    team: 'village',
    pack: 'base',
    wakeOrder: 80,
    description: 'Wake at the end of the night and look at your own card.',
    hasInteractiveAction: false,
    doppel: 'after',
  },
  revealer: {
    id: 'revealer',
    name: 'Revealer',
    team: 'village',
    pack: 'daybreak',
    wakeOrder: 85,
    description:
      'You may flip over another player\'s card. If it is a werewolf or tanner card, flip it back face-down; otherwise it stays face-up for everyone to see.',
    hasInteractiveAction: true,
    doppel: 'after',
  },
  curator: {
    id: 'curator',
    name: 'Curator',
    team: 'village',
    pack: 'daybreak',
    wakeOrder: 90,
    description:
      'You may place an artifact on another player\'s card. (Narrated only in this build — artifacts are flavor.)',
    hasInteractiveAction: true,
    doppel: 'after',
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
      'At the end of the night, learn how many other players woke up during the night.',
    hasInteractiveAction: false,
    doppel: 'after',
  },
  cursed: {
    id: 'cursed',
    name: 'Cursed',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 1000,
    description:
      'Village team, but marked: if you are killed you count as a werewolf — the village wins, and you lose with the werewolves.',
    hasInteractiveAction: false,
  },
  prince: {
    id: 'prince',
    name: 'Prince',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 1000,
    description:
      'Votes against you do not count, so you cannot be voted out (the next-highest player dies instead).',
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
    doppel: 'join',
  },
  thing: {
    id: 'thing',
    name: 'The Thing',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 35,
    description:
      'Tap one of your neighbors on the shoulder. That player learns that The Thing sits beside them.',
    hasInteractiveAction: true,
    doppel: 'now',
    mandatory: true,
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
    doppel: 'join',
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
    doppel: 'now',
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
    doppel: 'join',
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
    doppel: 'now',
  },
  defenderEr: {
    id: 'defenderEr',
    name: 'Defender-er',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 28,
    description:
      'Protect one player. (Narrated only in this build — it has no effect on the night.)',
    hasInteractiveAction: true,
    doppel: 'now',
  },
  theSponge: {
    id: 'theSponge',
    name: 'The Sponge',
    team: 'village',
    pack: 'bonus',
    wakeOrder: 1000,
    description:
      'At the end of the night, your team becomes the team of one of your neighbors. (Honor-system flavor in this build — scored as village.)',
    hasInteractiveAction: false,
  },
  ricochetRhino: {
    id: 'ricochetRhino',
    name: 'Ricochet Rhino',
    team: 'werewolves',
    pack: 'bonus',
    wakeOrder: 1000,
    description:
      'Werewolf team (but not a werewolf). Every vote against you ricochets to the next seat clockwise.',
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

// Printed werewolf cards. (Minion, Squire and Ricochet Rhino are on the
// werewolf TEAM but are not werewolves: killing one doesn't win the vote.)
export const WEREWOLF_CARDS: ReadonlySet<OnuwRoleId> = new Set<OnuwRoleId>([
  'werewolf',
  'alphaWolf',
  'mysticWolf',
  'dreamWolf',
]);

// Werewolves that open their eyes at the werewolf wake-up (Dream Wolf sleeps).
export const AWAKE_WOLF_CARDS: ReadonlySet<OnuwRoleId> = new Set<OnuwRoleId>([
  'werewolf',
  'alphaWolf',
  'mysticWolf',
]);

export function isWerewolfCard(role: OnuwRoleId): boolean {
  return WEREWOLF_CARDS.has(role);
}

// True for roles that wake at night (Dream Wolf has a wake order for the
// cheatsheet but stays asleep).
export function wakesAtNight(role: OnuwRoleId): boolean {
  return ROLES[role].wakeOrder < 1000 && role !== 'dreamWolf';
}

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

// Recommended starting pools per player count (players + 3 cards).
export const RECOMMENDED_POOLS: Record<number, OnuwRoleId[]> = {
  3: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager'],
  4: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager', 'villager'],
  5: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'minion', 'tanner', 'villager'],
  6: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'minion', 'tanner', 'drunk', 'villager'],
  7: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'minion', 'tanner', 'drunk', 'insomniac', 'villager'],
  8: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'minion', 'mason', 'mason', 'tanner', 'drunk', 'insomniac'],
  9: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'minion', 'mason', 'mason', 'tanner', 'drunk', 'insomniac', 'hunter'],
  10: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'minion', 'mason', 'mason', 'tanner', 'drunk', 'insomniac', 'hunter', 'villager'],
};
