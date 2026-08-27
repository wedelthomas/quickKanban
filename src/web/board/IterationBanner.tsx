import { useEffect, useState } from 'react';
import type { Iteration } from '../../shared/types.js';
import { shortIterationName } from '../../domain/iteration-name.js';

const formatRange = (startsOn: string, endsOn: string): string => {
  const at = (iso: string): Date => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y!, m! - 1, d!);
  };
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${at(startsOn).toLocaleDateString(undefined, opts)} – ${at(endsOn).toLocaleDateString(undefined, opts)}`;
};

/**
 * Which iteration it is, on the board rather than in another tab.
 *
 * Fetched separately from the board and rendered independently of it. That is
 * the whole point of FR-429: an iteration source that is slow, unreachable or
 * misconfigured must not delay the board by a single millisecond, and the way
 * to guarantee that is for the board's own load path never to await this.
 *
 * Provenance is shown, not hidden. A cached or estimated iteration is useful; a
 * cached one presented as current is a lie the reader plans against (FR-427).
 */
export const IterationBanner = () => {
  const [iteration, setIteration] = useState<Iteration | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/iteration')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: Iteration | null) => {
        if (!cancelled) setIteration(body);
      })
      // Nothing to surface. A board with no iteration is a working board, and
      // an error here would be reporting a problem the user cannot act on.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Renders nothing rather than a placeholder: an empty banner would occupy
  // the density budget NFR-32 protects without saying anything.
  if (!iteration) return null;

  const { ordinalName, startsOn, endsOn, workingDaysRemaining, provenance } = iteration;
  const days = workingDaysRemaining;

  return (
    <div
      className="iteration"
      data-testid="iteration-banner"
      data-provenance={provenance}
    >
      <span
        className="iteration-name"
        data-testid="iteration-name"
        // The full name in the tooltip: which team's sprint was chosen is the
        // one fact worth making configurable, so it stays reachable even though
        // the prefix is noise on a board that is entirely one person's.
        title={ordinalName ?? undefined}
      >
        {/* An estimated iteration carries no ordinal: the number resets at the
            fiscal year, so a computed one would be wrong every January. */}
        {shortIterationName(ordinalName) ?? 'Current iteration'}
      </span>
      <span className="iteration-dates">{formatRange(startsOn, endsOn)}</span>
      <span className="iteration-days" data-testid="iteration-days">
        {days === 0
          ? 'ends today'
          : `${days} working ${days === 1 ? 'day' : 'days'} left`}
      </span>
      {provenance !== 'read' && (
        <span
          className="badge iteration-provenance"
          data-testid="iteration-provenance"
          title={
            provenance === 'cached'
              ? 'Jira could not be reached. This is the last iteration read.'
              : 'Computed from the configured anchor date, not read from Jira.'
          }
        >
          {provenance === 'cached' ? 'cached' : 'estimated'}
        </span>
      )}
    </div>
  );
};
