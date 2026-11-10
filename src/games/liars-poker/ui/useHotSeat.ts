import { useState } from 'react';
import type { SeatIndex } from '@/engine/types';
import { useGameStore, useSeatSwitching } from '@/store/gameStore';

// ============================================================================
// Hot-seat hand-off for pass-and-play on one device.
//
// Active only when this device controls 2+ human seats (never online, never
// for AI seats — see `useSeatSwitching`). While a hand-off is pending the UI
// renders a redacted copy of the view (no cup / hand / peeked card in the
// DOM) under a cover, and the next player reveals their own secrets.
//
//  - `mustAct`: seats the game is waiting on right now, in priority order.
//    The first human one becomes the hand-off target.
//  - `publicPhase`: a phase with nothing private on screen (reveal recaps).
//    No cover; secrets stay redacted; acks are batched for every local seat.
// ============================================================================

export interface HotSeat {
  /** Pass-and-play with 2+ human seats on this device. */
  hotSeat: boolean;
  /** A hand-off is pending: show the cover. */
  covered: boolean;
  /** Render without private info (covered or public phase). */
  redact: boolean;
  /** Human seat that must act next (null = AI / nobody). */
  nextHuman: SeatIndex | null;
  /** Human seats on this device. */
  humanSeats: SeatIndex[];
  canView: (seat: SeatIndex) => boolean;
  /** Switch to `seat` and show its secrets. */
  revealTo: (seat: SeatIndex) => void;
  /** Call after a local action that ends this player's go. */
  afterAct: () => void;
}

export function useHotSeat(opts: {
  seats: SeatIndex[];
  mustAct: SeatIndex[];
  publicPhase: boolean;
}): HotSeat {
  const { enabled, canView, setLocalSeat } = useSeatSwitching();
  const localSeat = useGameStore((s) => s.localSeat);
  const [revealedFor, setRevealedFor] = useState<SeatIndex | null>(null);

  const humanSeats = opts.seats.filter((s) => canView(s));
  const hotSeat = enabled && humanSeats.length > 1;
  const nextHuman = opts.mustAct.find((s) => canView(s)) ?? null;
  const target = nextHuman ?? localSeat;
  const covered =
    hotSeat && !opts.publicPhase && (revealedFor === null || revealedFor !== localSeat || target !== localSeat);

  return {
    hotSeat,
    covered,
    redact: hotSeat && (covered || opts.publicPhase),
    nextHuman,
    humanSeats,
    canView,
    revealTo: (seat) => {
      if (seat !== localSeat) setLocalSeat(seat);
      setRevealedFor(seat);
    },
    afterAct: () => {
      if (hotSeat) setRevealedFor(null);
    },
  };
}
