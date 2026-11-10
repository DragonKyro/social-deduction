import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHARACTERS } from '../characters';
import type { CoupCharacter, CoupEvent, CoupPublicState } from '../state';

// ============================================================================
// Table effects for the Coup view. Purely presentational and driven only by
// the redacted view: the public event feed (challenges, blocks, strikes,
// exchanges) plus coin diffs between consecutive views. Nothing here can see
// more than the seat's own view already contains.
// ============================================================================

export type SeatFxKind = 'shake' | 'clash' | 'shield' | 'slash' | 'coup' | 'wound' | 'blessed';

export interface SeatFx {
  kind: SeatFxKind;
  key: number;
}

export type BannerTone = 'proven' | 'bluff' | 'coup' | 'assassinate' | 'force' | 'block';

export interface Banner {
  key: number;
  tone: BannerTone;
  title: string;
  sub: string;
  character: CoupCharacter | null;
}

export interface Toast {
  key: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'gold';
}

export interface Flight {
  key: number;
  kind: 'coin' | 'card';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  delay: number;
}

export interface CoinPop {
  key: number;
  amount: number;
}

type AnchorFn = (key: string) => HTMLElement | null;

function centre(el: HTMLElement | null): { x: number; y: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function useTableFx(view: CoupPublicState, anchor: AnchorFn) {
  const [seatFx, setSeatFx] = useState<Record<number, SeatFx>>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [coinPops, setCoinPops] = useState<Record<number, CoinPop>>({});
  // Bumped when a seat's card is replaced from the deck so the UI can replay
  // the deal-in on that slot. Monotonic per slot.
  const [slotGen, setSlotGen] = useState<Record<string, number>>({});
  const [deckPulse, setDeckPulse] = useState(0);

  const keyRef = useRef(1);
  const nextKey = () => keyRef.current++;
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const viewRef = useRef(view);
  viewRef.current = view;
  const name = (i: number) => viewRef.current.seats[i]?.name ?? '???';

  const flash = useCallback(
    (seat: number, kind: SeatFxKind, ms = 1100) => {
      const key = keyRef.current++;
      setSeatFx((cur) => ({ ...cur, [seat]: { kind, key } }));
      later(() => setSeatFx((cur) => (cur[seat]?.key === key ? omit(cur, seat) : cur)), ms);
    },
    [later],
  );

  const toast = useCallback(
    (text: string, tone: Toast['tone'] = 'info') => {
      const key = keyRef.current++;
      setToasts((cur) => [...cur.slice(-3), { key, text, tone }]);
      later(() => setToasts((cur) => cur.filter((t) => t.key !== key)), 3200);
    },
    [later],
  );

  const showBanner = useCallback(
    (b: Omit<Banner, 'key'>, ms = 1700) => {
      const key = keyRef.current++;
      setBanner({ ...b, key });
      later(() => setBanner((cur) => (cur?.key === key ? null : cur)), ms);
    },
    [later],
  );

  const launch = useCallback(
    (kind: Flight['kind'], from: string, to: string, count: number) => {
      const a = centre(anchor(from));
      const b = centre(anchor(to));
      if (!a || !b || count <= 0) return;
      const batch: Flight[] = Array.from({ length: Math.min(count, kind === 'coin' ? 6 : 3) }, (_, i) => ({
        key: keyRef.current++,
        kind,
        x0: a.x,
        y0: a.y,
        x1: b.x,
        y1: b.y,
        delay: i * (kind === 'coin' ? 80 : 140),
      }));
      setFlights((cur) => [...cur, ...batch]);
      const keys = new Set(batch.map((f) => f.key));
      later(() => setFlights((cur) => cur.filter((f) => !keys.has(f.key))), 1500);
    },
    [anchor, later],
  );

  // --- Coins: diff consecutive views -------------------------------------
  const coinsKey = view.seats.map((s) => s.coins).join(',');
  const prevCoins = useRef<number[] | null>(null);
  useLayoutEffect(() => {
    const coins = coinsKey.split(',').map(Number);
    const before = prevCoins.current;
    prevCoins.current = coins;
    if (!before || before.length !== coins.length) return;
    const losers: Array<{ i: number; amt: number }> = [];
    const gainers: Array<{ i: number; amt: number }> = [];
    coins.forEach((c, i) => {
      const d = c - before[i]!;
      if (d < 0) losers.push({ i, amt: -d });
      if (d > 0) gainers.push({ i, amt: d });
      if (d !== 0) {
        const key = keyRef.current++;
        setCoinPops((cur) => ({ ...cur, [i]: { key, amount: d } }));
        later(() => setCoinPops((cur) => (cur[i]?.key === key ? omit(cur, i) : cur)), 1400);
      }
    });
    // Pair losers with gainers (steals, levies, equalising), the rest flows
    // through the treasury.
    while (losers.length && gainers.length) {
      const l = losers[0]!;
      const g = gainers[0]!;
      const amt = Math.min(l.amt, g.amt);
      launch('coin', `seat-${l.i}`, `seat-${g.i}`, amt);
      l.amt -= amt;
      g.amt -= amt;
      if (l.amt === 0) losers.shift();
      if (g.amt === 0) gainers.shift();
    }
    for (const l of losers) launch('coin', `seat-${l.i}`, 'treasury', l.amt);
    for (const g of gainers) launch('coin', 'treasury', `seat-${g.i}`, g.amt);
  }, [coinsKey, launch, later]);

  // --- Public events --------------------------------------------------------
  const maxSeq = view.events.reduce((m, e) => Math.max(m, e.seq), 0);
  const lastSeq = useRef<number | null>(null);
  useEffect(() => {
    if (lastSeq.current === null || maxSeq < lastSeq.current) {
      // First render (or a new match): don't replay history.
      lastSeq.current = maxSeq;
      return;
    }
    const fresh = viewRef.current.events.filter((e) => e.seq > lastSeq.current!);
    lastSeq.current = maxSeq;
    for (const e of fresh) handle(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxSeq]);

  function handle(e: CoupEvent) {
    switch (e.kind) {
      case 'challenge': {
        flash(e.claimer, 'shake', 900);
        flash(e.challenger, 'clash', 900);
        const char = CHARACTERS[e.character].name;
        showBanner(
          e.honest
            ? {
                tone: 'proven',
                title: 'Challenge!',
                sub: `${name(e.claimer)} reveals the ${char}. ${name(e.challenger)} pays the price.`,
                character: e.character,
              }
            : {
                tone: 'bluff',
                title: 'Bluff exposed!',
                sub: `${name(e.claimer)} had no ${char}.`,
                character: null,
              },
        );
        return;
      }
      case 'block':
        flash(e.seat, 'shield', 1300);
        toast(`${name(e.seat)} blocks as ${CHARACTERS[e.character].name}`, 'gold');
        return;
      case 'blockStands':
        flash(e.seat, 'shield', 900);
        toast(`${name(e.seat)}'s block holds`, 'info');
        return;
      case 'strike':
        flash(e.target, e.style === 'coup' ? 'coup' : 'slash', 1300);
        showBanner(
          {
            tone: e.style,
            title: e.style === 'coup' ? 'Coup!' : e.style === 'assassinate' ? 'Assassination' : 'Strike',
            sub: `${name(e.by)} moves against ${name(e.target)}.`,
            character: null,
          },
          1500,
        );
        return;
      case 'influenceLost':
        flash(e.seat, 'wound', 900);
        return;
      case 'redraw':
        setSlotGen((cur) => ({ ...cur, [`${e.seat}-${e.cardIndex}`]: (cur[`${e.seat}-${e.cardIndex}`] ?? 0) + 1 }));
        setDeckPulse((n) => n + 1);
        launch('card', `seat-${e.seat}`, 'deck', 1);
        later(() => launch('card', 'deck', `seat-${e.seat}`, 1), 500);
        return;
      case 'exchange':
        setDeckPulse((n) => n + 1);
        launch('card', 'deck', `seat-${e.seat}`, e.drawn);
        toast(`${name(e.seat)} draws ${e.drawn} from the court deck`, 'info');
        return;
      case 'saved':
        flash(e.seat, 'blessed', 1400);
        toast(`${name(e.seat)} is spared by a blessing`, 'good');
        return;
      case 'eliminated':
        toast(`${name(e.seat)} is exiled from court`, 'bad');
        return;
      case 'win':
        toast(`${name(e.seat)} seizes the throne`, 'gold');
        return;
      case 'declare':
        return;
    }
  }

  return { seatFx, banner, toasts, flights, coinPops, slotGen, deckPulse, nextKey };
}

function omit<T>(rec: Record<number, T>, k: number): Record<number, T> {
  const next = { ...rec };
  delete next[k];
  return next;
}
