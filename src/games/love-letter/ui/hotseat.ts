import { useEffect, useState } from 'react';
import type { SeatIndex } from '@/engine/types';
import { useSeatSwitching } from '@/store/gameStore';

// Hot-seat (pass-and-play) helper built on `useSeatSwitching`.
//
// When a seat this device may play must make a private decision and the
// screen currently shows someone else, we immediately drop to the spectator
// view (no hands on screen) and show a "pass the device" cover. The next
// player reveals their own view by tapping it. Online / single-human games
// never trigger this (switching is disabled or the needed seat is an AI).

export interface HotSeat {
  enabled: boolean;
  /** Show the hand-over cover for `handoffTo`. */
  showCover: boolean;
  handoffTo: SeatIndex | null;
  accept: () => void;
  /** Seats this device should ack for: every local human on a shared screen. */
  ackSeats: (waitingOn: readonly SeatIndex[]) => SeatIndex[];
}

export function useHotSeat(localSeat: SeatIndex | null, needed: SeatIndex | null): HotSeat {
  const { enabled, canView, setLocalSeat } = useSeatSwitching();
  const [handoffTo, setHandoffTo] = useState<SeatIndex | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (needed !== null && needed !== localSeat && canView(needed)) {
      setHandoffTo(needed);
      if (localSeat !== null) setLocalSeat(null);
    }
    // canView is a fresh closure every render; the inputs that matter are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, needed, localSeat]);

  return {
    enabled,
    showCover: enabled && handoffTo !== null && handoffTo !== localSeat,
    handoffTo,
    accept: () => {
      if (handoffTo === null) return;
      setLocalSeat(handoffTo);
      setHandoffTo(null);
    },
    ackSeats: (waitingOn) =>
      enabled
        ? waitingOn.filter((s) => canView(s))
        : localSeat !== null && waitingOn.includes(localSeat)
          ? [localSeat]
          : [],
  };
}
