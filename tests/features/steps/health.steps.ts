import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';

Given('the application is running', async function (this: BoardWorld) {
  assert.ok(this.app, 'app should have been started by the Before hook');
});

Given('the data store is unreachable', async function (this: BoardWorld) {
  // Genuinely close the pool rather than stubbing a client: the behaviour under
  // test is what happens when the real dependency is gone.
  await this.pool.end();
});

When('the health check is called', async function (this: BoardWorld) {
  await this.request('GET', '/api/health');
});

Then('the health check reports unhealthy', function (this: BoardWorld) {
  assert.equal(this.response.status, 503);
  const body = this.response.body as { status: string };
  assert.equal(body.status, 'degraded');
});

Then(
  'the response names the data store as the failing dependency',
  function (this: BoardWorld) {
    const body = this.response.body as { database: string };
    assert.equal(body.database, 'unreachable');
  },
);

Then('the health check reports ok', function (this: BoardWorld) {
  assert.equal(this.response.status, 200);
  const body = this.response.body as { status: string; database: string };
  assert.equal(body.status, 'ok');
  assert.equal(body.database, 'ok');
});
