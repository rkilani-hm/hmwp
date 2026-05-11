import { useEffect, useRef, useCallback } from 'react';

/**
 * Activity events that count as "the user is still here." We listen
 * passively on the window so any descendant element triggers a reset
 * without needing to attach listeners per-component.
 *
 * - mousedown / touchstart: explicit interactions
 * - keydown: typing in any input also keeps the session alive
 * - scroll: reading a long page still counts
 * - visibilitychange: tabbing back into the app counts as activity
 *   (otherwise users coming back from a quick tab-switch get
 *   immediately kicked out)
 *
 * mousemove is intentionally excluded — it fires far too often and
 * would defeat the purpose of an idle timer (any cursor twitch over
 * the window would keep the session alive forever).
 */
const ACTIVITY_EVENTS = [
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'visibilitychange',
] as const;

/**
 * localStorage key for cross-tab activity sync. When the user is
 * active in tab A, every other open tab needs to see that activity
 * and reset its own idle timer — otherwise tab B might log them out
 * even though they've been working in tab A the whole time.
 */
const STORAGE_KEY = 'hmwp_last_activity_at';

/**
 * Don't write to localStorage more than once a second — the storage
 * event listener in other tabs would otherwise fire on every keystroke,
 * thrashing them. One write per second is plenty for cross-tab sync.
 */
const STORAGE_WRITE_THROTTLE_MS = 1000;

interface UseInactivityLogoutOptions {
  /** Total idle time before signing the user out. Defaults to 15 min. */
  timeoutMs?: number;
  /**
   * When to fire the warning callback before final signout. Defaults
   * to 14 min (1-minute warning window). Pass 0 to disable the
   * warning entirely.
   */
  warningMs?: number;
  /** Disable the whole system (e.g., when no user is signed in). */
  enabled?: boolean;
  /** Called when warningMs elapses without activity. */
  onWarning?: () => void;
  /** Called when timeoutMs elapses without activity. */
  onTimeout: () => void;
}

/**
 * Watches global user activity and fires onWarning/onTimeout callbacks
 * when the user has been idle for long enough. Synchronizes activity
 * across tabs via localStorage so the user isn't logged out of one
 * tab while actively working in another.
 *
 * Returns a `resetTimer` function the caller can invoke explicitly
 * (e.g., from a "Stay signed in" button on a warning dialog).
 */
export function useInactivityLogout({
  timeoutMs = 15 * 60 * 1000,
  warningMs = 14 * 60 * 1000,
  enabled = true,
  onWarning,
  onTimeout,
}: UseInactivityLogoutOptions) {
  // Refs hold the latest callback values without retriggering the
  // listener-attach effect every render. If we depended on
  // onWarning/onTimeout directly, every parent re-render would tear
  // down and re-attach window listeners, also resetting the timers.
  const onWarningRef = useRef(onWarning);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onWarningRef.current = onWarning;
    onTimeoutRef.current = onTimeout;
  });

  const warningTimerRef = useRef<number | null>(null);
  const timeoutTimerRef = useRef<number | null>(null);
  const lastStorageWriteRef = useRef(0);

  // Imperative reset — exposed so callers can manually extend the
  // session (e.g., from a confirmation dialog action).
  const resetTimer = useCallback(() => {
    if (warningTimerRef.current !== null) {
      window.clearTimeout(warningTimerRef.current);
    }
    if (timeoutTimerRef.current !== null) {
      window.clearTimeout(timeoutTimerRef.current);
    }

    if (warningMs > 0 && warningMs < timeoutMs) {
      warningTimerRef.current = window.setTimeout(() => {
        onWarningRef.current?.();
      }, warningMs);
    }

    timeoutTimerRef.current = window.setTimeout(() => {
      onTimeoutRef.current();
    }, timeoutMs);
  }, [warningMs, timeoutMs]);

  useEffect(() => {
    if (!enabled) {
      // If disabled (e.g., user signed out), make sure any pending
      // timers don't fire after we've stopped caring.
      if (warningTimerRef.current !== null) {
        window.clearTimeout(warningTimerRef.current);
        warningTimerRef.current = null;
      }
      if (timeoutTimerRef.current !== null) {
        window.clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }
      return;
    }

    /**
     * Local activity handler. Two responsibilities:
     *   1. Reset our timers
     *   2. Broadcast to other tabs by writing to localStorage
     *      (throttled to once per second)
     */
    const handleLocalActivity = () => {
      resetTimer();

      const now = Date.now();
      if (now - lastStorageWriteRef.current > STORAGE_WRITE_THROTTLE_MS) {
        try {
          localStorage.setItem(STORAGE_KEY, String(now));
          lastStorageWriteRef.current = now;
        } catch {
          // Private-browsing mode disables localStorage; cross-tab
          // sync silently degrades to no-op in that case.
        }
      }
    };

    /**
     * Cross-tab activity handler. Fires when another tab writes to
     * STORAGE_KEY. Resets our timers but does NOT write back
     * (would cause a feedback loop between tabs).
     */
    const handleStorageActivity = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        resetTimer();
      }
    };

    ACTIVITY_EVENTS.forEach((evt) => {
      window.addEventListener(evt, handleLocalActivity, { passive: true });
    });
    window.addEventListener('storage', handleStorageActivity);

    // Kick the timers off immediately so the user has a fresh
    // window the moment the guard mounts (e.g., right after sign-in).
    resetTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => {
        window.removeEventListener(evt, handleLocalActivity);
      });
      window.removeEventListener('storage', handleStorageActivity);
      if (warningTimerRef.current !== null) {
        window.clearTimeout(warningTimerRef.current);
      }
      if (timeoutTimerRef.current !== null) {
        window.clearTimeout(timeoutTimerRef.current);
      }
    };
  }, [enabled, resetTimer]);

  return { resetTimer };
}
