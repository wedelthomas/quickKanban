/**
 * Tags belong to a shared, board-wide vocabulary (FR-008). Normalising here —
 * rather than at each call site — is what stops "Ops", "ops " and "ops" from
 * becoming three tags over six months, which would quietly break slice 4's
 * tag filter by making it return nothing.
 *
 * Order of first appearance is preserved so the card reads the way the user
 * typed it.
 */
export const normalizeTags = (tags: readonly string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
};
