/**
 * Runs a sync shortly after startup, then once per configured interval
 * (FR-126, FR-128).
 *
 * Chains a fresh timer after each run rather than using setInterval, for two
 * reasons: the interval is re-read every time, so a settings change takes
 * effect without a restart; and a slow sync cannot overlap the next tick the
 * way a fixed interval would eventually cause.
 *
 * The startup sync is delayed slightly rather than fired immediately, so a
 * container that is still finishing migrations does not race its own first
 * request.
 */
export class Scheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly runSync: () => Promise<unknown>,
    /** Read fresh each tick, so changing it in settings takes effect. */
    private readonly intervalSeconds: () => number | Promise<number>,
    private readonly options: { startupDelayMs?: number } = {},
  ) {}

  start(): void {
    this.stopped = false;
    this.schedule(this.options.startupDelayMs ?? 5_000);
  }

  /**
   * Re-arms the pending timer against the current interval.
   *
   * Without this, shortening the interval from five minutes to one would still
   * wait out the five: the pending timer was armed before the change. Called
   * by the settings route so a cadence change takes effect when the user makes
   * it, not one sync later.
   */
  reschedule(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    void this.armFromSettings();
  }

  private async armFromSettings(): Promise<void> {
    const seconds = await this.intervalSeconds();
    this.schedule(Math.max(seconds, 1) * 1000);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    try {
      await this.runSync();
    } catch {
      // A failed sync must not stop the schedule. One bad response would
      // otherwise leave the board never updating again, which is a far worse
      // outcome than the failure itself — and the failure is already recorded
      // in sync_runs for the user to see.
    }
    if (this.stopped) return;
    const seconds = await this.intervalSeconds();
    this.schedule(Math.max(seconds, 1) * 1000);
  }
}
