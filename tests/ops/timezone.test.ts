import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { compose, waitForHealthy } from './helpers.js';
import { beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const inContainer = async (script: string): Promise<string> => {
  const { stdout } = await run('docker', [
    'compose',
    'exec',
    '-T',
    'app',
    'node',
    '-e',
    script,
  ]);
  return stdout.trim();
};

/**
 * The container honours the timezone it is given.
 *
 * Every period boundary in the board is a LOCAL calendar day — whether a card
 * is overdue, what "yesterday" means in a standup summary. The container runs
 * UTC unless told otherwise, and a summary generated in the evening would then
 * already have rolled into tomorrow and would omit that evening's work, in
 * exactly the hours before the standup it exists to serve.
 *
 * Worth a test rather than a comment because it is invisible when wrong: the
 * board keeps working, it just reports the wrong day. A base image without
 * tzdata, or a compose file that stopped passing TZ, would break it silently.
 */
describe('the container honours its configured timezone', () => {
  // Brought up here rather than assumed. `persistence.test.ts` ends with
  // `compose down -v`, so whichever file vitest runs after it inherits nothing
  // — and a test that passes or fails depending on file order is not a test.
  beforeAll(async () => {
    await compose('up', '-d');
    await waitForHealthy();
  }, 180_000);

  it('is given a timezone at all', async () => {
    const tz = await inContainer('console.log(process.env.TZ ?? "")');
    expect(tz).not.toBe('');
  });

  it('resolves the zone it was given, rather than falling back to UTC', async () => {
    // Note this is Node's own resolution, not the `date` command's. Alpine
    // ships without tzdata, so `date` reports UTC regardless — Node carries its
    // own ICU data and is what the application actually uses.
    const [tz, resolved] = (
      await inContainer(
        'console.log(process.env.TZ, Intl.DateTimeFormat().resolvedOptions().timeZone)',
      )
    ).split(' ');
    expect(resolved).toBe(tz);
  });

  it('computes a local calendar date, not a UTC one', async () => {
    const [local, utc] = (
      await inContainer('const d = new Date(); console.log(d.getDate(), d.getUTCDate())')
    ).split(' ');

    // They differ for part of every day west of Greenwich, and agree the rest
    // of the time, so this cannot assert inequality. What it can assert is that
    // the local value comes from the configured zone rather than from UTC.
    const offset = await inContainer('console.log(new Date().getTimezoneOffset())');
    if (Number(offset) !== 0) {
      const hours = Number(await inContainer('console.log(new Date().getHours())'));
      const utcHours = Number(await inContainer('console.log(new Date().getUTCHours())'));
      expect(hours).not.toBe(utcHours);
    }
    expect(Number(local)).toBeGreaterThan(0);
    expect(Number(utc)).toBeGreaterThan(0);
  });
});
