import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { BoardWorld } from './world.js';
import { columnIdFor } from './columns.js';
import { COLUMN_KEYS, type ColumnKey } from '../../../src/shared/types.js';

interface Mapping {
  columnId: number;
  columnName: string;
  statusName: string | null;
}

// Was `COLUMN_KEYS.indexOf(key) + 1`, which assumed id equals board position.
// It never did after slice 5: Iteration Items sits second and is id 7.
const columnId = (key: string): number => columnIdFor(key);

const currentMappings = async (world: BoardWorld): Promise<Mapping[]> => {
  await world.request('GET', '/api/settings/mappings');
  return (world.response.body as { mappings: Mapping[] }).mappings;
};

const putMapping = async (
  world: BoardWorld,
  key: string,
  status: string | null,
): Promise<void> => {
  // Every column, every time: the endpoint replaces the whole set, so a
  // partial payload would erase the columns it left out. GET already returns
  // all six, unmapped ones carrying null.
  const mappings = await currentMappings(world);
  const next = mappings.map(({ columnId: id, statusName }) => ({
    columnId: id,
    statusName: id === columnId(key) ? status : statusName,
  }));
  await world.request('PUT', '/api/settings/mappings', { mappings: next });
  assert.equal(world.response.status, 200, 'the mapping should have been accepted');
};

When(
  'the {string} column is mapped to {string}',
  async function (this: BoardWorld, key: string, status: string) {
    await putMapping(this, key, status);
  },
);

When(
  "the {string} column's mapping is removed",
  async function (this: BoardWorld, key: string) {
    await putMapping(this, key, null);
  },
);

// Read back through the API, which reads the database — the mapping is not
// held anywhere else, so surviving this read is what persistence means here.
When('the mapping is read back', async function (this: BoardWorld) {
  await currentMappings(this);
});

Then(
  'the {string} column maps to {string}',
  async function (this: BoardWorld, key: string, status: string) {
    const mappings = await currentMappings(this);
    assert.equal(mappings.find((m) => m.columnId === columnId(key))?.statusName, status);
  },
);

Then(
  'the {string} column maps to nothing',
  async function (this: BoardWorld, key: string) {
    const mappings = await currentMappings(this);
    const mapping = mappings.find((m) => m.columnId === columnId(key));
    assert.ok(
      mapping === undefined || mapping.statusName === null,
      `expected ${key} to be unmapped, found ${mapping?.statusName}`,
    );
  },
);

Given('Jira reports the statuses {string}', function (this: BoardWorld, csv: string) {
  this.jira.setStatuses(csv.split(',').map((s) => s.trim()));
});

When('the offered statuses are read', async function (this: BoardWorld) {
  await this.request('GET', '/api/jira/statuses');
});

Then('{string} is among them', function (this: BoardWorld, status: string) {
  const { statuses } = this.response.body as { statuses: string[] };
  assert.ok(statuses.includes(status), `expected ${status} among ${statuses.join(', ')}`);
});

Then('{string} is not among them', function (this: BoardWorld, status: string) {
  const { statuses } = this.response.body as { statuses: string[] };
  assert.ok(!statuses.includes(status), `${status} should not have been offered`);
});
