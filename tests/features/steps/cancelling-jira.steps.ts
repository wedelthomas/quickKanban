import { Given, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';

/**
 * Steps for cancelling's Jira half (US2). The action step itself — "the
 * card for issue X is cancelled with reason Y" — lives in
 * cancelling.steps.ts, since it already stores `this.lastCard` before
 * cancelling for exactly the reason both files need it.
 */

Given(
  'a cancellation status of {string} is configured',
  async function (this: BoardWorld, status: string) {
    const res = await this.request('PUT', '/api/settings', { cancellationStatus: status });
    assert.equal(res.status, 200, `could not configure the cancellation status: ${JSON.stringify(res.body)}`);
  },
);

Given('no cancellation status is configured', async function (this: BoardWorld) {
  // The default state — nothing to stage. Named for the scenario's own
  // clarity, the same way slice 5's "issue offers no transitions" step
  // exists purely to document intent at the call site.
});

Then(
  'the card for issue {string} is cancelled locally',
  async function (this: BoardWorld, _issueKey: string) {
    const { rows } = await this.pool.query<{ cancelled_at: Date | null }>(
      'SELECT cancelled_at FROM cards WHERE id = $1',
      [this.lastCard!.id],
    );
    assert.ok(rows[0]?.cancelled_at, 'the card should be marked cancelled');
  },
);

Then(
  'issue {string} was transitioned to {string}',
  async function (this: BoardWorld, issueKey: string, status: string) {
    const { rows } = await this.pool.query<{ status_name: string }>(
      'SELECT status_name FROM jira_links WHERE issue_key = $1',
      [issueKey],
    );
    assert.equal(rows[0]?.status_name, status);
  },
);

Then('the response says nothing was sent to Jira', function (this: BoardWorld) {
  const body = this.response.body as { jira?: { attempted: boolean } };
  assert.ok(body.jira === undefined || body.jira.attempted === false);
});

Then('the response reports the Jira refusal with its cause', function (this: BoardWorld) {
  const body = this.response.body as {
    jira?: { attempted: boolean; transitioned: boolean; message: string };
  };
  assert.equal(body.jira?.attempted, true);
  assert.equal(body.jira?.transitioned, false);
  assert.ok(body.jira?.message && body.jira.message.length > 0);
});

Then('the response reports the Jira failure', function (this: BoardWorld) {
  const body = this.response.body as {
    jira?: { attempted: boolean; transitioned: boolean; message: string };
  };
  assert.equal(body.jira?.attempted, true);
  assert.equal(body.jira?.transitioned, false);
  assert.ok(body.jira?.message && body.jira.message.length > 0);
});
