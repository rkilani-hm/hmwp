import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useFormDraft — localStorage-backed draft autosave for wizard forms.
 *
 * Behavior:
 *  - Storage key is namespaced per-user and per-form: `draft:<formKey>:<userId>`.
 *    Falls back to `anon` when no user, so anonymous flows still work in dev.
 *  - Debounced writes (default 500ms) avoid spamming storage on every keystroke.
 *  - `restore()` returns the saved value if it exists AND the optional
 *    `hasContent` predicate returns true (so we don't restore a blank skeleton).
 *  - `clear()` removes the entry — call this on successful submit.
 *  - File / Blob attachments are NOT persisted (JSON.stringify drops them).
 *    Callers should strip attachments before save and re-attach manually.
 */
export function useFormDraft<T>(opts: {
  formKey: string;
  userId: string | null | undefined;
  debounceMs?: number;
  hasContent?: (value: T) => boolean;
}) {
  const { formKey, userId, debounceMs = 500, hasContent } = opts;
  const storageKey = `draft:${formKey}:${userId || 'anon'}`;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Mark hydration complete on first render so the consumer can safely
  // call restore() inside a useEffect without SSR concerns.
  useEffect(() => { setHydrated(true); }, []);

  const save = useCallback((value: T) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        // Quota exceeded or serialization error — fail silently; this is
        // a best-effort UX feature, not a correctness requirement.
      }
    }, debounceMs);
  }, [storageKey, debounceMs]);

  const restore = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as T;
      if (hasContent && !hasContent(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [storageKey, hasContent]);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    try { localStorage.removeItem(storageKey); } catch { /* noop */ }
  }, [storageKey]);

  // Flush any pending write when component unmounts.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { save, restore, clear, hydrated };
}
