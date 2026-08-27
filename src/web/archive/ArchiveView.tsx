import { useEffect, useState } from 'react';
import type { ArchiveDay, ArchivedCard } from '../../shared/types.js';

interface ArchiveResult {
  from: string;
  to: string;
  days: ArchiveDay[];
  total: number;
}

const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

/** "2026-08-20" -> "Thu 20 Aug". Split by hand rather than through Date, whose
 *  string parsing treats a bare date as UTC and shifts it west of Greenwich. */
const dayHeading = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const Entry = ({ card }: { card: ArchivedCard }) => (
  <article className="archive-card" data-testid="archive-card">
    <div className="archive-card-main">
      {card.issueKey && (
        <a
          className="badge badge--link"
          href={card.issueUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
        >
          {card.issueKey}
        </a>
      )}
      <span className="archive-card-title">{card.title}</span>
    </div>
    <div className="archive-card-meta">
      {card.tags.map((tag) => (
        <span className="tag" data-testid="archive-tag" key={tag}>
          {tag}
        </span>
      ))}
      {card.archivedReason && (
        // "I finished it" and "it was reassigned away from me" look identical
        // in an archive that does not say which (FR-322).
        <span className="archive-reason" data-testid="archive-reason">
          {card.archivedReason}
        </span>
      )}
    </div>
  </article>
);

/**
 * Archived work, by date.
 *
 * Browsed by range rather than searched: the question this answers is "when did
 * that finish" or "what did that week hold", and both are date questions. Full
 * text search over the archive is explicitly out of scope.
 */
export const ArchiveView = ({ onClose }: { onClose: () => void }) => {
  const [from, setFrom] = useState(() => isoDaysAgo(30));
  const [to, setTo] = useState(() => isoDaysAgo(0));
  const [result, setResult] = useState<ArchiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetch(`/api/archive?from=${from}&to=${to}`)
      .then(async (r) => {
        if (!r.ok) {
          const problem = (await r.json().catch(() => null)) as {
            detail?: string;
          } | null;
          throw new Error(problem?.detail ?? 'The archive could not be read.');
        }
        return r.json() as Promise<ArchiveResult>;
      })
      .then(setResult)
      .catch((cause: Error) => {
        setResult(null);
        setError(cause.message);
      });
  }, [from, to]);

  return (
    <div className="dialog-backdrop" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog dialog--wide" role="dialog" aria-label="Archive">
        <div className="summary-head">
          <h2 className="help-title">Archive</h2>
          <div className="archive-range">
            <label className="field field--row">
              <span className="field-label">From</span>
              <input
                className="input"
                type="date"
                data-testid="archive-from"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="field field--row">
              <span className="field-label">To</span>
              <input
                className="input"
                type="date"
                data-testid="archive-to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
        </div>

        {error && (
          <p className="field-error" role="alert" data-testid="archive-error">
            {error}
          </p>
        )}

        {result?.total === 0 && (
          // Stated, not blank: a blank panel is indistinguishable from a
          // failure to load (FR-323).
          <p className="field-note" data-testid="archive-empty">
            Nothing was archived between {from} and {to}.
          </p>
        )}

        {result?.days.map((day) => (
          <section className="archive-day" data-testid="archive-day" key={day.date}>
            <h3 className="field-label">{dayHeading(day.date)}</h3>
            {day.cards.map((card) => (
              <Entry card={card} key={card.id} />
            ))}
          </section>
        ))}

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
