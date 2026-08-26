import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * FR-118 and BH-109: nothing this slice does may write to Jira.
 *
 * Asserted by the absence of the capability rather than the behaviour of one.
 * A behavioural test proves only the paths someone thought to exercise; this
 * fails the moment a write appears, whether or not anyone remembered to test
 * what they were adding.
 */
describe('the Jira adapter cannot write', () => {
  const adapter = readFileSync('src/server/jira/jira-adapter.ts', 'utf8');

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('issues no %s request', (verb) => {
    expect(adapter).not.toMatch(new RegExp(`method:\\s*['"\`]${verb}`, 'i'));
    expect(adapter).not.toMatch(new RegExp(`['"\`]${verb}['"\`]`));
  });

  it('exposes only searchIssues on the port', () => {
    const port = readFileSync('src/server/jira/jira-port.ts', 'utf8');
    // Scoped to the interface body: the file also holds an error class whose
    // constructor would otherwise read as a port method.
    const body = /export interface JiraPort \{([\s\S]*?)\n\}/.exec(port)?.[1] ?? '';
    const methods = [...body.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1]);
    expect(methods).toEqual(['searchIssues']);
  });

  it('is the only module that talks to Jira over HTTP', () => {
    // If a second module starts calling out, this guard stops being the single
    // point that has to stay honest — so fail and make it a deliberate choice.
    for (const file of ['sync/sync-service.ts', 'routes/sync.ts']) {
      const source = readFileSync(`src/server/${file}`, 'utf8');
      expect(source).not.toMatch(/fetch\s*\(/);
    }
  });
});
