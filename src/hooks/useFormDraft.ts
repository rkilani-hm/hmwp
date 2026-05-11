import { useEffect, useRef, useState } from 'react';

/**
 * Persist form state to localStorage so users don't lose work if they
 * navigate away mid-fill. Restore on next mount; clear explicitly on
 * successful submit.
 *
 * Storage is scoped by:
 *   - userId  → so drafts don't leak between accounts on a shared device
 *   - formKey → e.g. 'new-permit-wizard' / 'new-gate-pass-wizard'
 *
 * Writes are debounced (500 ms by default) so a typing user doesn't
 * pin localStorage to busy. Privacy mode / quota-exceeded errors are
 * swallowed silently — the form still works, drafts just don't
 * persist.
 *
 * Returns:
 *   - restored: the value loaded from storage on mount, or null if
 *     none / disabled
 *   - clearDraft: imperatively wipe the draft (call on submit success)
 */
const DEFAULT_DEBOUNCE_MS = 500;

interface UseFormDraftOptions<T> {
  /** Unique form id, e.g. 'new-permit-wizard'. */
  formKey: string;
  /** User id used to scope the draft. Pass null/undefined when not
   *  signed in; the hook becomes a no-op. */
  userId: string | null | undefined;
  /** Current form value. Persisted on each change. */
  value: T;
  /** Skip persistence entirely (e.g. for edit-mode where state comes
   *  from a server fetch). Default false. */
  disabled?: boolean;
  /** How long to wait after a change before writing. */
  debounceMs?: number;
}

interface UseFormDraftResult<T> {
  /** The value loaded from storage on mount; null when nothing or
   *  the hook is disabled. The caller decides whether to merge this
   *  into their form state. */
  restored: T | null;
  /** Call this on successful submit so the draft doesn't haunt
   *  subsequent sessions. */
  clearDraft: () => void;
}

function storageKey(formKey: string, userId: string): string {
  return `hmwp_draft_${formKey}_${userId}`;
}

export function useFormDraft<T>({
  formKey,
  userId,
  value,
  disabled = false,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseFormDraftOptions<T>): UseFormDraftResult<T> {
  // Load on mount. We do this synchronously inside useState's lazy
  // initializer so the restored value is available on the first
  // render (no flicker / no "useEffect saw an empty form" race).
  const [restored] = useState<T | null>(() => {
    if (disabled || !userId) return null;
    try {
      const raw = localStorage.getItem(storageKey(formKey, userId));
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      // Corrupted JSON, quota issue, or storage unavailable —
      // proceed without restoring.
      return null;
    }
  });

  // Debounced write timer
  const writeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (disabled || !userId) return;

    // Clear any pending write so debounce works correctly
    if (writeTimerRef.current !== null) {
      window.clearTimeout(writeTimerRef.current);
    }

    writeTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(
          storageKey(formKey, userId),
          JSON.stringify(value),
        );
      } catch {
        // Private mode / quota exceeded — silently degrade.
      }
    }, debounceMs);

    return () => {
      if (writeTimerRef.current !== null) {
        window.clearTimeout(writeTimerRef.current);
      }
    };
  }, [value, formKey, userId, disabled, debounceMs]);

  const clearDraft = () => {
    if (!userId) return;
    try {
      localStorage.removeItem(storageKey(formKey, userId));
    } catch {
      // No-op
    }
  };

  return { restored, clearDraft };
}
