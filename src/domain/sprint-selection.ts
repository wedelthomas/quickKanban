/**
 * Which sprint on the reference board is *the* iteration.
 *
 * Pure, and deliberately so: every case below came from board 1391 as it
 * actually is, and each one is a table entry rather than a live call.
 *
 * "Take the active sprint" is not a well-defined instruction on that board. Two
 * teams share it, so every iteration exists there twice with identical dates
 * and ordinals — true across all 730 of its closed sprints. Without a team the
 * banner would show whichever name the API happened to return first.
 */

export interface Sprint {
  id: number;
  name: string;
  /** Null is ordinary, not malformed: board 1391's future sprints are undated. */
  startsOn: string | null;
  endsOn: string | null;
}

/** A sprint with both dates known, which is the only kind that can be an iteration. */
export interface DatedSprint extends Sprint {
  startsOn: string;
  endsOn: string;
}

/**
 * The configured team's current sprint, or null.
 *
 * Null is a normal answer with three distinct causes — no active sprint, none
 * belonging to this team, or one that carries no dates — and the caller treats
 * all three the same way: fall back to the cache, then to an estimate. FR-425.
 */
export const selectSprint = (sprints: Sprint[], teamName: string): DatedSprint | null => {
  const team = teamName.trim().toLowerCase();
  if (team === '') return null;

  const mine = sprints.filter((s) => {
    // Prefix, not substring: a team whose name appears inside another team's
    // sprint name would otherwise match it.
    if (!s.name.trim().toLowerCase().startsWith(team)) return false;
    // FR-425: a sprint missing either date tells us nothing about when the
    // iteration runs, so it is no result rather than a partial one.
    return s.startsOn !== null && s.endsOn !== null;
  }) as DatedSprint[];

  if (mine.length === 0) return null;

  // Lowest id wins. The answer must not depend on response ordering (FR-424),
  // and id is the only field guaranteed unique and stable.
  return mine.reduce((best, s) => (s.id < best.id ? s : best));
};
