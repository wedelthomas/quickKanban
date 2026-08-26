import type { SyncStatus as Status } from '../../shared/types.js';

const relative = (iso: string): string => {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
};

/**
 * Rejected credentials and lost connectivity get different words on purpose
 * (FR-136): the user's next action is entirely different — fix a token versus
 * wait for the network.
 */
const FAILURE_TEXT: Record<string, string> = {
  credentials: 'Jira rejected the credentials',
  connectivity: 'Jira could not be reached',
  rate_limit: 'Jira is rate-limiting',
  malformed: 'Jira sent something unreadable',
};

/**
 * A pill, never an overlay (FR-134). A board that greys itself out while
 * talking to Jira stops being useful exactly when Jira is slow, which is when
 * the user most wants to get on with something else.
 */
export const SyncStatusPill = ({
  status,
  onRefresh,
}: {
  status: Status | null;
  onRefresh: () => void;
}) => {
  if (!status) return null;

  const failed = status.lastRun?.outcome === 'failed';
  const state = !status.configured
    ? 'unconfigured'
    : status.running
      ? 'running'
      : failed
        ? 'failed'
        : 'ok';

  return (
    <div className={`sync sync--${state}`} data-testid="sync-status" data-state={state}>
      {state === 'unconfigured' && <span>Jira not configured</span>}
      {state === 'running' && <span>Syncing…</span>}
      {failed && (
        <span className="sync-failure">
          {FAILURE_TEXT[status.lastRun?.failureKind ?? ''] ?? 'Sync failed'}
        </span>
      )}
      {status.lastSuccessAt && state !== 'unconfigured' && (
        // Kept visible through a failure: "failing now" and "last worked an
        // hour ago" are different facts, and the user needs both.
        <span className="sync-last">Synced {relative(status.lastSuccessAt)}</span>
      )}
      {status.configured && (
        <button
          type="button"
          className="sync-refresh"
          onClick={onRefresh}
          disabled={status.running}
        >
          Refresh
        </button>
      )}
    </div>
  );
};
