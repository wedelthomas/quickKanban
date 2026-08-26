import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * FR-027 makes the movement history immutable. The cheapest way to guarantee
 * that is for no code path to exist that could break it, so this asserts the
 * absence of the capability rather than the behaviour of one.
 *
 * A behavioural test can only prove the paths it thinks to exercise. This
 * fails the moment someone adds an UPDATE to the repository, whether or not
 * anyone remembered to write a test for what they were adding.
 */
describe('the movement history is append-only by construction', () => {
  const source = readFileSync('src/server/repositories/event-repository.ts', 'utf8');

  it('contains no UPDATE against card_events', () => {
    expect(source).not.toMatch(/UPDATE\s+card_events/i);
  });

  it('contains no DELETE against card_events', () => {
    expect(source).not.toMatch(/DELETE\s+FROM\s+card_events/i);
  });

  it('contains no TRUNCATE against card_events', () => {
    expect(source).not.toMatch(/TRUNCATE[^\n]*card_events/i);
  });

  it('is the only place card_events is written', () => {
    // If another module starts writing the log, this guard stops being the
    // single point that has to stay honest — so fail and make it deliberate.
    const others = ['card-repository.ts', 'tag-repository.ts'].map((name) =>
      readFileSync(`src/server/repositories/${name}`, 'utf8'),
    );
    for (const other of others) {
      expect(other).not.toMatch(/INSERT\s+INTO\s+card_events/i);
    }
  });
});
