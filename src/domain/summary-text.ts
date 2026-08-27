import type { Actor, Summary, SummaryCard, SummaryMovement } from '../shared/types.js';

/** "2026-08-26" -> "26 Aug". Parsed by hand: `new Date('2026-08-26')` is UTC
 *  midnight, which reads as the previous day west of Greenwich. */
const shortDate = (iso: string): string => {
  const [, month, day] = iso.split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${Number(day)} ${months[Number(month) - 1]}`;
};

/**
 * Where a movement came from, when it did not come from the user.
 *
 * On the line rather than in the interface, because the line is what gets
 * pasted. FR-328 exists so the user does not report a transition a teammate
 * made as their own progress, and a marker that lived only on screen would be
 * lost at exactly the moment it mattered.
 */
const origin = (actor: Actor): string => {
  if (actor === 'sync') return ' (in Jira)';
  if (actor === 'system') return ' (automatic)';
  return '';
};

const label = (entry: { title: string; issueKey: string | null }): string =>
  entry.issueKey ? `${entry.issueKey} ${entry.title}` : entry.title;

const movementLine = (m: SummaryMovement): string =>
  `• ${label(m)} — ${m.fromColumn} → ${m.toColumn}${origin(m.actor)}`;

const cardLine = (c: SummaryCard): string => `• ${label(c)}`;

/**
 * The exact text the user pastes into a chat (FR-329).
 *
 * Plain: no HTML, no markdown emphasis, no trailing newline. Anything that
 * renders differently in one chat client than another is a decoration the
 * reader did not ask for, and a trailing newline is a blank line they have to
 * delete every single morning.
 */
export const renderSummaryText = (summary: Omit<Summary, 'text'>): string => {
  if (summary.empty) {
    return `No activity between ${shortDate(summary.from)} and ${shortDate(summary.to)}.`;
  }

  // A heading with nothing under it reads like something failed to load, so an
  // empty group is omitted rather than printed bare.
  const sections: string[][] = [];
  if (summary.moved.length > 0)
    sections.push(['Moved', ...summary.moved.map(movementLine)]);
  if (summary.inProgress.length > 0) {
    sections.push(['In progress', ...summary.inProgress.map(cardLine)]);
  }
  if (summary.blocked.length > 0)
    sections.push(['Blocked', ...summary.blocked.map(cardLine)]);

  return sections.map((lines) => lines.join('\n')).join('\n\n');
};
