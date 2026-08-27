/** Whether a card that is sitting in Done should now leave the board. */
export interface ArchivalInput {
  /** When the card most recently arrived in Done, or null if it never moved there. */
  arrivedInDoneAt: Date | null;
  /** Fallback for a card created directly in Done, which has no arrival event. */
  createdAt: Date;
  windowDays: number;
  now: Date;
  /** An unresolved conflict freezes the card against archival too (FR-318a). */
  conflicted: boolean;
}

export const shouldArchive = (_input: ArchivalInput): boolean => {
  throw new Error('not implemented');
};
