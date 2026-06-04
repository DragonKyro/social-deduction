import type { AvalonAlignment, AvalonRoleId } from './state';

// Static metadata for every Avalon role: name, alignment, and a short
// description used by the lobby and the role-reveal screen.

export interface RoleSpec {
  id: AvalonRoleId;
  name: string;
  alignment: AvalonAlignment;
  // Whether this role is required and cannot be toggled off in the lobby.
  required: boolean;
  description: string;
  // Short label used on the role-knowledge reveal ("looks like Merlin" etc).
  knownAsLabel?: string;
}

export const ROLES: Record<AvalonRoleId, RoleSpec> = {
  merlin: {
    id: 'merlin',
    name: 'Merlin',
    alignment: 'good',
    required: true,
    description:
      'Knows all evils (except Mordred). If good wins three quests, the Assassin gets one chance to identify and kill you — so steer subtly.',
    knownAsLabel: 'Merlin',
  },
  percival: {
    id: 'percival',
    name: 'Percival',
    alignment: 'good',
    required: false,
    description:
      'Sees Merlin and Morgana, but cannot tell them apart. Your job is to protect the real Merlin without revealing which is which.',
  },
  loyalServant: {
    id: 'loyalServant',
    name: 'Loyal Servant of Arthur',
    alignment: 'good',
    required: false,
    description:
      'A regular good player. You know nothing at the start. Win three quests and survive the assassination.',
  },
  assassin: {
    id: 'assassin',
    name: 'Assassin',
    alignment: 'evil',
    required: true,
    description:
      'You see your fellow evils. If good wins three quests, YOU get to nominate one player as Merlin. Hit Merlin → evil wins.',
    knownAsLabel: 'Evil',
  },
  morgana: {
    id: 'morgana',
    name: 'Morgana',
    alignment: 'evil',
    required: false,
    description:
      'You see your fellow evils. To Percival you look identical to Merlin — impersonate him.',
    knownAsLabel: 'Merlin',
  },
  mordred: {
    id: 'mordred',
    name: 'Mordred',
    alignment: 'evil',
    required: false,
    description:
      'You see your fellow evils, but Merlin does NOT see you. You can speak freely; Merlin has no idea you are evil.',
    knownAsLabel: 'Evil',
  },
  oberon: {
    id: 'oberon',
    name: 'Oberon',
    alignment: 'evil',
    required: false,
    description:
      'You are evil but isolated. You do not see the other evils, and they do not see you. Coordinate by inference only.',
    knownAsLabel: 'Evil',
  },
  minionOfMordred: {
    id: 'minionOfMordred',
    name: 'Minion of Mordred',
    alignment: 'evil',
    required: false,
    description:
      'A regular evil player. You see your fellow evils (except Oberon). Sabotage missions and stay hidden.',
    knownAsLabel: 'Evil',
  },
  lancelotGood: {
    id: 'lancelotGood',
    name: 'Good Lancelot',
    alignment: 'good',
    required: false,
    description: '(Two Lancelots module — disabled in base game.)',
  },
  lancelotEvil: {
    id: 'lancelotEvil',
    name: 'Evil Lancelot',
    alignment: 'evil',
    required: false,
    description: '(Two Lancelots module — disabled in base game.)',
  },
};

// Base-box optional special roles (excludes Lancelots which require the
// Two Lancelots module). Order is the recommended "add these first" order.
export const BASE_OPTIONAL_SPECIAL_ROLES: AvalonRoleId[] = [
  'percival',
  'morgana',
  'mordred',
  'oberon',
];

export function isGood(role: AvalonRoleId): boolean {
  return ROLES[role].alignment === 'good';
}

export function isEvil(role: AvalonRoleId): boolean {
  return ROLES[role].alignment === 'evil';
}
