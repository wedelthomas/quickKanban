/**
 * Delays between retries, in milliseconds.
 *
 * Bounded on purpose: a sync that retries forever against a rate-limited Jira
 * is indistinguishable from an attack, and the poll interval will bring
 * another attempt along shortly anyway (FR-130).
 *
 * Pure — returns the sequence rather than sleeping, so the policy is testable
 * without waiting for it.
 */
export const backoffDelays = (attempts = 3, baseMs = 500): number[] =>
  Array.from({ length: attempts }, (_, i) => baseMs * 2 ** i);
