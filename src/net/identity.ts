// Persistent identity for a peer. Trystero's peerId is randomized per
// session; we want a stable UUID across reloads so seat ownership survives
// disconnect/reconnect. Same model as the Catan reference project.
//
// Local-testing escape hatch: append `?fresh` to the URL and we use
// sessionStorage instead of localStorage so two windows in the same
// browser (incognito) get distinct UUIDs.

const KEY = 'social-deduction.uuid';
const NAME_KEY = 'social-deduction.name';

function storage(): Storage {
  const params = new URLSearchParams(window.location.search);
  return params.has('fresh') ? sessionStorage : localStorage;
}

export function getOrCreateUuid(): string {
  const s = storage();
  const existing = s.getItem(KEY);
  if (existing) return existing;
  const uuid =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  s.setItem(KEY, uuid);
  return uuid;
}

export function getDisplayName(): string {
  const s = storage();
  return s.getItem(NAME_KEY) ?? 'Player';
}

export function setDisplayName(name: string): void {
  storage().setItem(NAME_KEY, name);
}
