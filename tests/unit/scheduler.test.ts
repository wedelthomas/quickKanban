import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scheduler } from '../../src/server/sync/scheduler.js';

/**
 * Covers BH-114. Uses fake timers rather than real waiting: a test that
 * genuinely sleeps five minutes to prove a five-minute interval is a test
 * nobody runs.
 */
describe('Scheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs shortly after start without waiting a full interval', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler(run, () => 300, { startupDelayMs: 1000 });
    scheduler.start();

    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('syncs once per elapsed interval thereafter', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler(run, () => 300, { startupDelayMs: 0 });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(run).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  it('re-reads the interval each tick, so a settings change takes effect', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    let interval = 300;
    const scheduler = new Scheduler(run, () => interval, { startupDelayMs: 0 });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    // The next timer is already armed at 300s, so shortening the interval
    // alone would still wait out the old one. reschedule() re-arms it.
    interval = 60;
    scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('a lengthened interval also takes effect immediately on reschedule', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    let interval = 60;
    const scheduler = new Scheduler(run, () => interval, { startupDelayMs: 0 });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);

    interval = 3600;
    scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run, 'the old 60s timer must have been cleared').toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('keeps running after a failed sync', async () => {
    // A sync that throws must not silently stop the schedule — that turns one
    // bad response into a board that never updates again.
    const run = vi.fn().mockRejectedValue(new Error('Jira unreachable'));
    const scheduler = new Scheduler(run, () => 60, { startupDelayMs: 0 });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('stops cleanly', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler(run, () => 60, { startupDelayMs: 0 });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(600_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
