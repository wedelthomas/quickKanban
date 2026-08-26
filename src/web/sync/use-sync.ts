import { useCallback, useEffect, useState } from 'react';
import type { SyncStatus } from '../../shared/types.js';

const POLL_MS = 10_000;

export const useSync = (onSynced: () => void) => {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  const refreshStatus = useCallback(async (): Promise<SyncStatus | null> => {
    try {
      const next = (await (await fetch('/api/sync/status')).json()) as SyncStatus;
      setStatus(next);
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
        if (next?.lastRun?.outcome === 'succeeded') onSynced();
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshStatus, onSynced]);

  const syncNow = useCallback(async (): Promise<void> => {
    setStatus((s) => (s ? { ...s, running: true } : s));
    try {
      await fetch('/api/sync/run', { method: 'POST' });
    } finally {
      await refreshStatus();
      onSynced();
    }
  }, [refreshStatus, onSynced]);

  return { status, syncNow, refreshStatus };
};
