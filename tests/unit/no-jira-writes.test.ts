import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * FR-209 and BH-204: the only thing this application ever writes to Jira is an
 * issue transition.
 *
 * This guard was stricter in slice 2, where it asserted the adapter contained
 * no write verb at all. Slice 3 legitimately adds one, so the guard narrows
 * rather than disappears: still asserted by the absence of capability, but the
 * capability is now "transitions only" instead of "nothing".
 */
describe('the Jira adapter writes only transitions', () => {
  const adapter = readFileSync('src/server/jira/jira-adapter.ts', 'utf8');

  it.each(['PUT', 'PATCH', 'DELETE'])('issues no %s request', (verb) => {
    expect(adapter).not.toMatch(new RegExp(`method:\\s*['"\`]${verb}`, 'i'));
  });

  it('makes exactly one POST, and it lives inside transitionIssue', () => {
    // A second POST anywhere would mean this application had grown a way to
    // change something in Jira that nobody decided to allow.
    const posts = adapter.match(/method:\s*'POST'/g) ?? [];
    expect(posts).toHaveLength(1);

    // And that one POST must be in the transition method, targeting the
    // transitions endpoint — asserted structurally rather than by matching the
    // exact formatting of the call.
    const start = adapter.indexOf('async transitionIssue');
    const end = adapter.indexOf('async listStatuses');
    expect(start).toBeGreaterThan(-1);
    const body = adapter.slice(start, end > start ? end : undefined);
    expect(body).toMatch(/method:\s*'POST'/);
    expect(body).toMatch(/\/transitions`/);
  });

  it('sends only a transition id, so no other field can change', () => {
    expect(adapter).toMatch(
      /body: JSON\.stringify\(\{ transition: \{ id: transitionId \} \}\)/,
    );
    // If a fields payload ever appears here, a status change could quietly
    // carry an edit to something else.
    expect(adapter).not.toMatch(/body: JSON\.stringify\(\{[^}]*fields/);
  });

  it('exposes exactly the four operations the port declares', () => {
    const port = readFileSync('src/server/jira/jira-port.ts', 'utf8');
    const body = /export interface JiraPort \{([\s\S]*?)\n\}/.exec(port)?.[1] ?? '';
    const methods = [...body.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1]);
    expect(methods.sort()).toEqual([
      'getTransitions',
      'listStatuses',
      'searchIssues',
      'transitionIssue',
    ]);
  });

  it('is the only module that talks to Jira over HTTP', () => {
    for (const file of [
      'sync/sync-service.ts',
      'sync/transition-service.ts',
      'routes/sync.ts',
    ]) {
      expect(readFileSync(`src/server/${file}`, 'utf8')).not.toMatch(/fetch\s*\(/);
    }
  });
});

/**
 * TEST-415 (BH-415), FR-417.
 *
 * Slice 5 reads two more things from Jira — the blocked field, and sprints for
 * the iteration — and writes neither. The guarantee is the same shape as above:
 * asserted by the absence of the capability rather than by a rule saying not to.
 */
describe('slice 5 adds reads to Jira and no writes', () => {
  const jiraAdapter = readFileSync('src/server/jira/jira-adapter.ts', 'utf8');
  const iterationAdapter = readFileSync('src/server/jira/iteration-adapter.ts', 'utf8');
  const port = readFileSync('src/server/jira/jira-port.ts', 'utf8');
  const iterationPort = readFileSync('src/server/jira/iteration-port.ts', 'utf8');

  it('never sends the blocked field in a request body', () => {
    // The field name is configuration, so it can only appear where a request is
    // BUILT. It legitimately appears in the query string of a read (`fields=`);
    // what must never happen is it reaching a body.
    const bodies = jiraAdapter.match(/body:\s*JSON\.stringify\(([^)]*)\)/g) ?? [];
    for (const body of bodies) {
      expect(body).not.toMatch(/blocked/i);
      expect(body).not.toMatch(/customfield/i);
    }
  });

  it('the iteration adapter issues only GET requests', () => {
    const methods = iterationAdapter.match(/method:\s*'(\w+)'/g) ?? [];
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) expect(method).toMatch(/'GET'/);
  });

  it('the iteration port cannot express a write at all', () => {
    // One method, and it reads. An interface with nowhere to put a write is a
    // stronger guarantee than a rule against writing.
    expect(iterationPort).toContain('listActiveSprints');
    expect(iterationPort).not.toMatch(
      /\b(update|set|write|create|delete|transition)\w*\(/i,
    );
  });

  it('the Jira port still exposes exactly one write', () => {
    // transitionIssue, and nothing that could send a blocked value or a sprint.
    expect(port).toContain('transitionIssue(');
    expect(port).not.toMatch(/setBlocked|updateBlocked|writeBlocked|setSprint/i);
  });
});

/**
 * BH-514, FR-517. Slice 6 reads story points from Jira and never writes them
 * back — the same shape as the blocked field and sprints above: asserted by
 * the absence of the capability.
 */
describe('slice 6 reads story points and never writes them', () => {
  const jiraAdapter = readFileSync('src/server/jira/jira-adapter.ts', 'utf8');
  const port = readFileSync('src/server/jira/jira-port.ts', 'utf8');

  it('never sends a story-points value in a request body', () => {
    const bodies = jiraAdapter.match(/body:\s*JSON\.stringify\(([^)]*)\)/g) ?? [];
    for (const body of bodies) {
      expect(body).not.toMatch(/points/i);
      expect(body).not.toMatch(/customfield/i);
    }
  });

  it('the Jira port has nowhere to put a points write', () => {
    expect(port).not.toMatch(/setPoints|updatePoints|writePoints|storyPoints\(/i);
  });
});
