// `?room=CODE` in the address bar: set while in a room so a reload rejoins
// (and so the URL is an invite link), cleared on leave. Other query params
// (e.g. `?fresh`) are kept.

import { normalizeRoomCode } from './identity';

const PARAM = 'room';

export function roomFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get(PARAM);
  return raw ? normalizeRoomCode(raw) : null;
}

export function setRoomInUrl(code: string | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (code) url.searchParams.set(PARAM, code);
  else url.searchParams.delete(PARAM);
  window.history.replaceState(window.history.state, '', url);
}

/** A shareable link that opens this app straight into room `code`. */
export function inviteLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(PARAM, code);
  return url.toString();
}
