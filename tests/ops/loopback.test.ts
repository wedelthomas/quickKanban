import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { networkInterfaces } from 'node:os';
import { compose, waitForHealthy } from './helpers.js';

/**
 * TEST-022 (BH-022). Running without authentication is only defensible
 * because the port is unreachable from the network. This test is what keeps
 * that claim true — if the binding ever widens, the no-login decision has to
 * be reopened rather than silently invalidated.
 */
describe('network exposure', () => {
  beforeAll(async () => {
    await compose('down', '-v');
    await compose('up', '-d', '--build');
    await waitForHealthy();
  }, 300_000);

  afterAll(async () => {
    await compose('down', '-v');
  }, 120_000);

  it('serves the board on loopback with no authentication challenge', async () => {
    const res = await fetch('http://127.0.0.1:3000/api/board');
    expect(res.status).toBe(200);
    expect(res.headers.get('www-authenticate')).toBeNull();
  });

  it('refuses connections on every non-loopback address', async () => {
    const external = Object.values(networkInterfaces())
      .flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
      .map((i) => i!.address);

    if (external.length === 0) {
      throw new Error(
        'No non-loopback IPv4 address on this host, so the negative case cannot be proven. ' +
          'Re-run on a networked machine rather than treating this as a pass.',
      );
    }

    for (const address of external) {
      await expect(
        fetch(`http://${address}:3000/api/board`, {
          signal: AbortSignal.timeout(3_000),
        }),
        `${address}:3000 must not be reachable`,
      ).rejects.toThrow();
    }
  });

  it('does not publish the database port to the host', async () => {
    const ps = await compose('ps', '--format', 'json');
    const db = ps
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as {
            Service: string;
            Publishers?: { PublishedPort: number }[];
          },
      )
      .find((s) => s.Service === 'db');

    const published = (db?.Publishers ?? []).filter((p) => p.PublishedPort > 0);
    expect(published).toEqual([]);
  });
});
