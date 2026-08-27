import { useCallback, useEffect, useState } from 'react';
import type { OpenConflict } from './ConflictDialog.js';

/** Open conflicts, re-read whenever the board is. */
export const useConflicts = (boardVersion: unknown) => {
  const [conflicts, setConflicts] = useState<OpenConflict[]>([]);

  const reload = useCallback(async (): Promise<void> => {
    const response = await fetch('/api/conflicts');
    if (!response.ok) return;
    const body = (await response.json()) as { conflicts: OpenConflict[] };
    setConflicts(body.conflicts);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, boardVersion]);

  const resolve = useCallback(
    async (id: number, resolution: 'kept_board' | 'accepted_jira'): Promise<void> => {
      const response = await fetch(`/api/conflicts/${id}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(problem?.detail ?? 'That could not be resolved.');
      }
      await reload();
    },
    [reload],
  );

  return { conflicts, resolve, reload };
};
