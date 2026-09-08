/**
 * A card is overdue once the current local date is past its due date. A card
 * due today is not overdue (FR-042).
 *
 * `today` is passed in rather than read here so the function stays pure and the
 * boundary cases are testable without touching the system clock.
 */
export const isOverdue = (dueDate: string | null, today: Date): boolean => {
  if (!dueDate) return false;
  return dueDate < toCalendarDate(today);
};

/** Local calendar date as YYYY-MM-DD — not UTC, which would shift the boundary. */
export const toCalendarDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
