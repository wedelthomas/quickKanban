import { useEffect, useState } from 'react';
import type { Iteration, IterationReport } from '../../shared/types.js';

const formatHours = (seconds: number): string => `${(seconds / 3600).toFixed(1)}h`;

/**
 * Per-card and per-project elapsed time for the current iteration (US1).
 *
 * Fetches the iteration first, then the report keyed by its ordinal — the
 * same two-step shape `IterationBanner` already uses, so a slow or absent
 * iteration degrades to a message rather than a stuck spinner.
 */
export const ReportDialog = ({ onClose }: { onClose: () => void }) => {
  const [iteration, setIteration] = useState<Iteration | null | undefined>(undefined);
  const [report, setReport] = useState<IterationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/iteration')
      .then((r) => (r.ok ? r.json() : null))
      .then((it: Iteration | null) => setIteration(it))
      .catch(() => setIteration(null));
  }, []);

  useEffect(() => {
    if (!iteration?.ordinalName) return;
    fetch(`/api/iterations/${encodeURIComponent(iteration.ordinalName)}/report`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((r: IterationReport) => setReport(r))
      .catch(() => setError('The report could not be generated.'));
  }, [iteration]);

  return (
    <div className="dialog-backdrop" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog dialog--wide" role="dialog" aria-label="Report">
        <div className="summary-head">
          <h2 className="help-title">Report</h2>
        </div>

        {iteration === undefined && !error && <p className="field-note">Loading…</p>}

        {iteration === null && (
          <p className="field-note" data-testid="report-no-iteration">
            No current iteration to report on.
          </p>
        )}

        {error && (
          <p className="field-error" role="alert" data-testid="report-error">
            {error}
          </p>
        )}

        {iteration?.ordinalName && !report && !error && (
          <p className="field-note">Generating…</p>
        )}

        {report && (
          <>
            <p className="field-note" data-testid="report-range">
              {report.startsOn} – {report.endsOn}
              {report.incomplete && (
                // FR-542: part of the period predates recorded history — the
                // figure is an upper bound, not the whole story.
                <span
                  className="badge"
                  data-testid="report-incomplete"
                  title="Part of this period predates recorded history."
                >
                  incomplete
                </span>
              )}
            </p>

            <section className="summary-group" data-testid="report-by-project">
              <h3 className="field-label">Time by project</h3>
              <ul className="summary-list">
                {report.time.byProject.map((row) => (
                  <li key={row.project} className="report-row">
                    <span>{row.project === 'local' ? 'Local' : row.project}</span>
                    <span>{formatHours(row.seconds)}</span>
                  </li>
                ))}
              </ul>
              {report.time.byProject.length === 0 && (
                <p className="field-note">No time recorded yet.</p>
              )}
            </section>

            <section className="summary-group" data-testid="report-by-card">
              <h3 className="field-label">Time by card</h3>
              <ul className="summary-list">
                {report.time.byCard.map((row) => (
                  <li key={row.cardId} className="report-row">
                    <span>{row.title}</span>
                    <span>{formatHours(row.seconds)}</span>
                  </li>
                ))}
              </ul>
              {report.time.byCard.length === 0 && (
                <p className="field-note">No time recorded yet.</p>
              )}
            </section>
          </>
        )}

        <div className="dialog-actions">
          <span className="dialog-actions-spacer" />
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
