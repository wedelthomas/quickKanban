import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compose, getBoard, waitForHealthy } from './helpers.js';

/**
 * TEST-020 (BH-020) and TEST-024 (BH-024).
 *
 * Starts from genuinely nothing — no containers, no volume — so the schema
 * creation being asserted is a real first-ever creation rather than a
 * re-run against a database that already happened to have tables.
 */
describe('first start against empty storage', () => {
  beforeAll(async () => {
    await compose('down', '-v');
    await compose('up', '-d', '--build');
    await waitForHealthy();
  }, 300_000);

  afterAll(async () => {
    await compose('down', '-v');
  }, 120_000);

  it('brings both containers to healthy from one documented command (BH-024)', async () => {
    const ps = await compose('ps', '--format', 'json');
    const services = ps
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { Service: string; State: string });

    expect(services.map((s) => s.Service).sort()).toEqual(['app', 'db']);
    for (const service of services) {
      expect(service.State, `${service.Service} should be running`).toBe('running');
    }
  });

  it('creates the schema automatically and loads six empty columns (BH-020)', async () => {
    const board = await getBoard();

    expect(board.columns).toHaveLength(6);
    expect(board.columns.map((c) => c.key)).toEqual([
      'backlog',
      'in_progress',
      'blocked',
      'test',
      'po_review',
      'done',
    ]);
    expect(board.columns.flatMap((c) => c.cards)).toEqual([]);
  });
});
