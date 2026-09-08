/**
 * One sync at a time (FR-129).
 *
 * A request arriving mid-sync **joins** the in-flight one rather than queueing
 * a second: the caller wanted current data, and the sync already running will
 * produce exactly that. Queueing would turn fifty impatient refreshes into
 * fifty sequential syncs.
 *
 * In-process, which is correct for one container. If this is ever scaled to
 * two, the unique index on sync_runs is what catches it.
 */
export class SyncLock {
  private inFlight: Promise<unknown> | null = null;

  get running(): boolean {
    return this.inFlight !== null;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.inFlight) return this.inFlight as Promise<T>;

    const promise = work().finally(() => {
      this.inFlight = null;
    });
    this.inFlight = promise;
    return promise;
  }
}
