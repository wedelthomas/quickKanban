import { useCallback, useEffect, useRef, useState } from 'react';
import type { SyncStatus } from '../../shared/types.js';

const POLL_MS = 10_000;

export const useSync = (onSynced: () => void) => {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  /**
   * The last success we have already reflected on the board.
   *
   * Without this the board refetched on every poll where the *last* run had
   * succeeded — which is always, once one has — so it refetched every ten
   * seconds forever. Beyond the pointless load, a refetch landing mid-drag can
   * replace the board under the user's hand and undo an optimistic move they
   * are still making.
   */
  const reflectedSuccessAt = useRef<string | null>(null);

  const refreshStatus = useCallback(async (): Promise<SyncStatus | null> => {
    try {
      const next = (await (await fetch('/api/sync/status')).json()) as SyncStatus;
      setStatus(next);
      // Seed on first read so an already-successful sync from before the page
      // opened does not read as new.
      reflectedSuccessAt.current ??= next.lastSuccessAt ?? null;
      return next;
    } catch {
      // A status endpoint that cannot be reached says nothing useful about
      // Jira, and must not take the board down with it.
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    // Polls the *status*, not Jira. The server decides when to sync; this only
    // asks what happened, so a short interval here costs nothing upstream.
    const timer = setInterval(() => {
      void refreshStatus().then((next) => {
        const at = next?.lastSuccessAt ?? null;
        // Only when a *new* sync has succeeded since we last looked.
        if (at && at !== reflectedSuccessAt.current) {
          reflectedSuccessAt.current = at;
          onSynced();
        }
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshStatus, onSynced]);

  const syncNow = useCallback(async (): Promise<void> => {
    setStatus((s) => (s ? { ...s, running: true } : s));
    try {
      await fetch('/api/sync/run', { method: 'POST' });
    } finally {
      const next = await refreshStatus();
      // A manual refresh always reflects, and records what it reflected so the
      // poll does not immediately repeat it.
      reflectedSuccessAt.current = next?.lastSuccessAt ?? reflectedSuccessAt.current;
      onSynced();
    }
  }, [refreshStatus, onSynced]);

  return { status, syncNow, refreshStatus };
};
