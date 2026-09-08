import { useEffect, useState } from 'react';
import type { Summary, SummaryMovement, SummaryPeriod } from '../../shared/types.js';

const originLabel = (actor: SummaryMovement['actor']): string | null => {
  if (actor === 'sync') return 'in Jira';
  if (actor === 'system') return 'automatic';
  return null;
};

const entryLabel = (entry: { title: string; issueKey: string | null }) =>
  entry.issueKey ? `${entry.issueKey} ${entry.title}` : entry.title;

/**
 * The standup update, ready to paste.
 *
 * The interaction budget is two: open this, press Copy. SC-306 says so, and
 * anything that adds a third — choosing a date range, confirming a format —
 * loses to writing it by hand.
 */
export const SummaryDialog = ({ onClose }: { onClose: () => void }) => {
  const [period, setPeriod] = useState<SummaryPeriod>('daily');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSummary(null);
    setCopied(false);
    setError(null);
    fetch(`/api/summary?period=${period}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((s: Summary) => setSummary(s))
      .catch(() =>
        setError(
          // 404 ITERATION_NOT_FOUND is the one case with a more specific
          // thing to say (BH-529) — anything else keeps the generic message.
          period === 'iteration'
            ? 'No current iteration to summarize.'
            : 'The summary could not be generated.',
        ),
      );
  }, [period]);

  const copy = async (): Promise<void> => {
    if (!summary) return;
    try {
      // The text the server rendered, not something reassembled from the DOM:
      // the bytes asserted in the tests are the bytes that get pasted.
      await navigator.clipboard.writeText(summary.text);
      setCopied(true);
    } catch {
      setError('The summary could not be copied. Select the text and copy it manually.');
    }
  };

  return (
    <div className="dialog-backdrop" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog dialog--wide" role="dialog" aria-label="Summary">
        <div className="summary-head">
          <h2 className="help-title">Summary</h2>
          <div className="summary-periods">
            {(['daily', 'weekly', 'iteration'] as const).map((p) => (
              <button
                key={p}
                className={`button${period === p ? ' button--primary' : ''}`}
                data-testid={`summary-period-${p}`}
                onClick={() => setPeriod(p)}
              >
                {p === 'daily' ? 'Daily' : p === 'weekly' ? 'Weekly' : 'Iteration'}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="field-error" role="alert" data-testid="summary-error">
            {error}
          </p>
        )}

        {!summary && !error && <p className="field-note">Generating…</p>}

        {summary?.empty && (
          // One sentence rather than three empty headings, which read like
          // something failed to load (FR-330).
          <p className="field-note" data-testid="summary-empty">
            No activity between {summary.from} and {summary.to}.
          </p>
        )}

        {summary && !summary.empty && (
          <>
            {summary.moved.length > 0 && (
              <section className="summary-group" data-testid="summary-moved">
                <h3 className="field-label">Moved</h3>
                <ul className="summary-list">
                  {summary.moved.map((m) => (
                    <li key={`${m.cardId}-${m.occurredAt}`}>
                      {entryLabel(m)} — {m.fromColumn} → {m.toColumn}
                      {originLabel(m.actor) && (
                        // Marked so the user does not report a transition a
                        // teammate made as their own progress (FR-328).
                        <span className="summary-origin" data-testid="summary-origin">
                          {originLabel(m.actor)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {summary.inProgress.length > 0 && (
              <section className="summary-group" data-testid="summary-in-progress">
                <h3 className="field-label">In progress</h3>
                <ul className="summary-list">
                  {summary.inProgress.map((c) => (
                    <li key={c.cardId}>{entryLabel(c)}</li>
                  ))}
                </ul>
              </section>
            )}

            {summary.blocked.length > 0 && (
              <section className="summary-group" data-testid="summary-blocked">
                <h3 className="field-label">Blocked</h3>
                <ul className="summary-list">
                  {summary.blocked.map((c) => (
                    <li key={c.cardId}>{entryLabel(c)}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <div className="dialog-actions">
          <span className="dialog-actions-spacer" />
          {copied && <span className="field-note">Copied.</span>}
          <button
            type="button"
            className="button button--primary"
            data-testid="summary-copy"
            disabled={!summary}
            onClick={() => void copy()}
          >
            Copy
          </button>
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
