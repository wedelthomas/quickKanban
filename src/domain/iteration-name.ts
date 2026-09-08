/**
 * The part of a sprint name worth showing.
 *
 * Sprint names carry the team that owns them, because a Jira board may serve
 * several: "Anchor Team 2026 S18", "Signal 2026 S18", "OpsTeam2026 S18
 * (08/25-09/08)", "TSPRO 2026 I15". On a single-user board every one of those
 * prefixes says the same thing — yours — so the ordinal is the only part that
 * distinguishes one iteration from the next.
 *
 * Display only. The full name stays on the record: it is what the source
 * actually reported, and shortening it in storage would lose which team's
 * sprint was chosen — the one fact that mattered enough to be configurable.
 */

/** Matches an ordinal such as S18, I15, s7 — optionally spaced, at a word edge. */
const ORDINAL = /\b([SI])\s?(\d{1,3})\b/i;

export const shortIterationName = (fullName: string | null): string | null => {
  if (fullName === null) return null;
  const match = ORDINAL.exec(fullName);
  // No recognisable ordinal: show the name as given rather than nothing. A
  // board named in a way this does not anticipate should still say something.
  if (!match) return fullName;
  return `${match[1]!.toUpperCase()}${Number(match[2])}`;
};
