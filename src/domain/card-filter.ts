import type { Card, CardSource, Priority } from '../shared/types.js';

/**
 * A transient narrowing of the board. Holds no persistent state, by design:
 * FR-310 requires the board to open unfiltered, and state that lives only in a
 * component dies on reload without anything having to enforce it.
 */
export interface Filter {
  text: string;
  tag: string | null;
  priority: Priority | null;
  source: CardSource | null;
  overdueOnly: boolean;
  /**
   * Blocked was a column until slice 5, so "show me what is stuck" used to be
   * answered by looking at one place on the board. Making it a card attribute
   * removed that, and this filter is what replaces it (FR-413).
   */
  blockedOnly: boolean;
}

export const EMPTY_FILTER: Filter = {
  text: '',
  tag: null,
  priority: null,
  source: null,
  overdueOnly: false,
  blockedOnly: false,
};

/**
 * Whether anything is being hidden.
 *
 * Whitespace-only text counts as no filter: a stray space would otherwise
 * empty the board with no visible cause.
 */
export const isActive = (filter: Filter): boolean =>
  filter.text.trim() !== '' ||
  filter.tag !== null ||
  filter.priority !== null ||
  filter.source !== null ||
  filter.overdueOnly ||
  filter.blockedOnly;

/**
 * Whether a card survives a filter.
 *
 * Every clause is a conjunction — FR-306 requires multiple filters to narrow to
 * cards matching *all* of them — so an unset clause passes rather than
 * short-circuiting the rest.
 *
 * Text matches title and description **only**. Tags have their own control, so
 * a card tagged "ops" is not pulled in by typing "ops" into the text box; the
 * spec calls that overlap out as one to prevent rather than tolerate.
 */
export const matches = (card: Card, filter: Filter): boolean => {
  const text = filter.text.trim().toLowerCase();
  if (text !== '') {
    const haystack = `${card.title} ${card.description ?? ''}`.toLowerCase();
    if (!haystack.includes(text)) return false;
  }

  if (filter.tag !== null && !card.tags.includes(filter.tag)) return false;
  if (filter.priority !== null && card.priority !== filter.priority) return false;
  if (filter.source !== null && card.source !== filter.source) return false;
  if (filter.overdueOnly && !card.overdue) return false;
  if (filter.blockedOnly && !card.blocked) return false;

  return true;
};
