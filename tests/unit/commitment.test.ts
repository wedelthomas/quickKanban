import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * BH-535, FR-547: commitment ignores Jira sprint membership entirely,
 * reading only this board's own columns.
 *
 * Proved structurally, the same way slice 5 proved JiraPort carries no
 * sprint field at all (iteration.steps.ts's `issueShape` check) — the
 * strongest guarantee is that the query has nowhere to put a sprint
 * condition, not a behavioural test that could pass by accident.
 */
describe('commitment reads only this board’s columns', () => {
  const service = readFileSync('src/server/services/commitment-service.ts', 'utf8');

  it('never mentions a sprint anywhere in its source', () => {
    expect(service.toLowerCase()).not.toMatch(/sprint/);
  });

  it('scopes its query by column key alone', () => {
    expect(service).toMatch(/col\.key = ANY\(\$1\)/);
  });
});
