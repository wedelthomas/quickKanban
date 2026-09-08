import { useEffect, useState } from 'react';
import type { Burndown, BurndownPoint, Iteration, IterationReport } from '../../shared/types.js';

const formatHours = (seconds: number): string => `${(seconds / 3600).toFixed(1)}h`;
const formatShare = (share: number): string => `${Math.round(share * 100)}%`;

/**
 * Decorative line, coloured dots for the day's cause (FR-532). Purely
 * illustrative — `aria-hidden`, because the list beside it already states
 * every figure in text (FR-545), which is what a screen reader reads.
 */
const BurndownChart = ({ points }: { points: BurndownPoint[] }) => {
  const width = 280;
  const height = 100;
  const max = Math.max(1, ...points.map((p) => p.outstanding));
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map(
    (p, i) => [i * stepX, height - (p.outstanding / max) * height] as const,
  );

  return (
    <svg
      className="burndown-chart"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <polyline
        points={coords.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
      />
      {points.map((p, i) => {
        if (p.completedThatDay === 0 && p.scopeAddedThatDay === 0) return null;
        const [x, y] = coords[i]!;
        return (
          <circle
            key={p.date}
            cx={x}
            cy={y}
            r={3}
            fill={p.completedThatDay > 0 ? 'var(--column-done)' : 'var(--warning)'}
          />
        );
      })}
    </svg>
  );
};

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
  const [burndown, setBurndown] = useState<Burndown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/iteration')
      .then((r) => (r.ok ? r.json() : null))
      .then((it: Iteration | null) => setIteration(it))
      .catch(() => setIteration(null));
  }, []);

  useEffect(() => {
    if (!iteration?.ordinalName) return;
    const ordinal = encodeURIComponent(iteration.ordinalName);
    fetch(`/api/iterations/${ordinal}/report`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((r: IterationReport) => setReport(r))
      .catch(() => setError('The report could not be generated.'));
    // Fetched independently: a burndown failure must not blank out the
    // report the user already has (mirrors IterationBanner's own isolation).
    fetch(`/api/iterations/${ordinal}/burndown`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: Burndown | null) => setBurndown(b))
      .catch(() => {});
  }, [iteration]);

  return (
    <div className="dialog-backdrop" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog dialog--wide" role="dialog" aria-label="Report">
        <div className="summary-head">
          <h2 className="help-title">Report</h2>
        </div>

        {iteration === undefined && !error && <p className="field-note">Loading…</p>}

        {iteration !== undefined && !iteration?.ordinalName && (
          // Covers both "no iteration at all" and an estimated one with no
          // ordinal (the ordinal resets at the fiscal year and cannot be
          // counted — IterationBanner carries the same caveat) — neither has
          // anything this report can be keyed against.
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
              {report.time.byProject.length > 0 && (
                // The invisible-work number the product exists to answer
                // (US2): how much of the iteration's hours no Jira board
                // would ever show.
                <p className="field-note" data-testid="report-time-share">
                  {formatShare(report.time.localShare)} local, {formatShare(report.time.jiraShare)} Jira
                </p>
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

            <section className="summary-group" data-testid="report-points">
              <h3 className="field-label">Points</h3>
              {'withheld' in report.points ? (
                // FR-523: withheld rather than reported as a misleading zero.
                <p className="field-note" data-testid="report-points-withheld">
                  {report.points.reason}
                </p>
              ) : (
                <>
                  {/* Commitment, completion and scope change as three
                      distinct figures (FR-530) — overcommitment is now
                      something the report states, not something the user
                      has to notice on their own. */}
                  <p className="report-row" data-testid="report-points-committed">
                    <span>Committed</span>
                    <span>{report.points.committed}</span>
                  </p>
                  <p className="report-row" data-testid="report-points-completed">
                    <span>Completed</span>
                    <span>{report.points.completed}</span>
                  </p>
                  {(report.points.scopeAdded > 0 || report.points.scopeRemoved > 0) && (
                    <p className="report-row" data-testid="report-points-scope">
                      <span>Scope change</span>
                      <span>
                        {report.points.scopeAdded > 0 && `+${report.points.scopeAdded}`}
                        {report.points.scopeAdded > 0 && report.points.scopeRemoved > 0 && ' / '}
                        {report.points.scopeRemoved > 0 && `-${report.points.scopeRemoved}`}
                      </span>
                    </p>
                  )}
                  <p className="field-note" data-testid="report-points-share">
                    {formatShare(report.points.localShare)} local, {formatShare(report.points.jiraShare)} Jira
                  </p>
                  {report.points.excludedUnpointed > 0 && (
                    <p className="field-note" data-testid="report-points-excluded">
                      {report.points.excludedUnpointed} card
                      {report.points.excludedUnpointed === 1 ? '' : 's'} excluded (unpointed)
                    </p>
                  )}
                </>
              )}
            </section>

            {burndown && burndown.points.length > 0 && (
              <section className="summary-group" data-testid="report-burndown">
                <h3 className="field-label">Burndown</h3>
                <BurndownChart points={burndown.points} />
                {/* The chart is decorative; this list is the one legible to a
                    screen reader and is what the SVG merely illustrates
                    (FR-545) — every figure the chart shows is stated here in
                    text, cause included. */}
                <ul className="summary-list" data-testid="report-burndown-list">
                  {burndown.points.map((p) => (
                    <li key={p.date}>
                      {p.date}: {p.outstanding} outstanding
                      {p.completedThatDay > 0 && `, ${p.completedThatDay} completed`}
                      {p.scopeAddedThatDay > 0 && `, +${p.scopeAddedThatDay} scope added`}
                      {p.scopeRemovedThatDay > 0 && `, -${p.scopeRemovedThatDay} scope removed`}
                    </li>
                  ))}
                </ul>
              </section>
            )}
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
