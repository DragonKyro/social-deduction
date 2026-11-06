// Display name + per-tab testing mode + room codes.
//
// Online identity is the device's anonymous Firebase uid (kept by Firebase
// Auth in IndexedDB), so a seat survives a reload and the security rules can
// tie every write to its author. Nothing here is secret.
//
// Local-testing escape hatch: append `?fresh` to the URL and both the auth
// session and the display name live in sessionStorage, so two tabs in the
// same browser are two different players.

const NAME_KEY = 'social-deduction.name';

export function freshTabMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('fresh');
}

// Storage can be missing or throw (privacy modes, some test runtimes).
function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = freshTabMode() ? window.sessionStorage : window.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

export function getDisplayName(): string {
  try {
    return storage()?.getItem(NAME_KEY) ?? 'Player';
  } catch {
    return 'Player';
  }
}

export function setDisplayName(name: string): void {
  try {
    storage()?.setItem(NAME_KEY, name);
  } catch {
    // Not persisted; the name still applies for this session.
  }
}

// No 0/O, 1/I/L: codes are read aloud and typed on phones.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

export function generateRoomCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return s;
}

/** Uppercase, strip spaces/dashes. Returns null if it can't be a room code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{4,6}$/.test(code) ? code : null;
}
