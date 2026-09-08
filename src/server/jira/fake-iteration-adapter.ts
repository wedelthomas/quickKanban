import type { Sprint } from '../../domain/sprint-selection.js';
import type { IterationPort } from './iteration-port.js';
import { JiraError, type JiraFailureKind } from './jira-port.js';

/**
 * The standard suite's iteration source.
 *
 * Exists so that no automated test contacts live Jira (FR-442, NFR-25) — a
 * property tests/ops/no-live-services.test.ts asserts rather than assumes.
 *
 * Defaults to the shape board 4200 really has: two active sprints, one per team
 * sharing the board, with identical dates. Anything that works against a single
 * tidy sprint but not against this has not been tested against reality.
 */
export class FakeIterationAdapter implements IterationPort {
  private sprints: Sprint[] = [
    {
      id: 24501,
      name: 'Anchor Team 2026 S18',
      startsOn: '2026-08-24',
      endsOn: '2026-09-07',
    },
    { id: 24502, name: 'Signal 2026 S18', startsOn: '2026-08-24', endsOn: '2026-09-07' },
  ];

  private failure: JiraFailureKind | null = null;

  /** Calls made, so a test can prove resolution did not run twice. */
  calls = 0;

  setSprints(sprints: Sprint[]): void {
    this.sprints = sprints;
  }

  /** Board 4200's real future-sprint shape: named, but carrying no dates. */
  setUndatedSprint(): void {
    this.sprints = [
      {
        id: 25000,
        name: 'Anchor Team Ronin - Automation',
        startsOn: null,
        endsOn: null,
      },
    ];
  }

  setNoActiveSprints(): void {
    this.sprints = [];
  }

  fail(kind: JiraFailureKind | null): void {
    this.failure = kind;
  }

  async listActiveSprints(_boardId: number): Promise<Sprint[]> {
    this.calls += 1;
    if (this.failure)
      throw new JiraError(this.failure, `fake iteration source: ${this.failure}`);
    return this.sprints;
  }
}
