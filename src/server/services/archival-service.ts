import type { FastifyBaseLogger } from 'fastify';
import { shouldArchive } from '../../domain/archival.js';
import type { ArchiveRepository } from '../repositories/archive-repository.js';
import type {
  ArchiveRunRepository,
  ArchiveRun,
} from '../repositories/archive-run-repository.js';
import type { SettingsRepository } from '../repositories/settings-repository.js';
import { archiveInProgress } from '../errors.js';

/**
 * Takes finished work off the board once it has sat in Done long enough.
 *
 * The only thing in this system that changes the board without a user or Jira
 * asking, which is why every pass is recorded and every archived card logged.
 *
 * Single-flight in process, and the `archive_runs` partial unique index says
 * the same thing in the database — so two app instances could not overlap
 * either.
 */
export class ArchivalService {
  private running = false;

  constructor(
    private readonly archive: ArchiveRepository,
    private readonly runs: ArchiveRunRepository,
    private readonly settings: SettingsRepository,
    private readonly log: FastifyBaseLogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get inProgress(): boolean {
    return this.running;
  }

  async runOnce(): Promise<ArchiveRun> {
    if (this.running) throw archiveInProgress();
    this.running = true;

    const runId = await this.runs.start();
    try {
      const { archiveWindowDays } = await this.settings.read();
      const candidates = await this.archive.candidates();
      const now = this.now();

      let archived = 0;
      let skippedConflicted = 0;

      for (const candidate of candidates) {
        const input = {
          arrivedInDoneAt: candidate.arrivedInDoneAt,
          createdAt: candidate.createdAt,
          windowDays: archiveWindowDays,
          now,
        };

        if (!shouldArchive({ ...input, conflicted: candidate.conflicted })) {
          // Counted only when the conflict is the REASON — a card conflicted
          // but still inside the window was never due, and counting it would
          // inflate a number whose whole job is to answer "was something due
          // that I refused". A count that is chronically non-zero for benign
          // reasons is one nobody reads.
          //
          // Asking the pure function twice rather than reading the flag here:
          // it is the thing that decides, and passing it a hardcoded `false`
          // (as this did) meant its own guard never ran in production while
          // four unit tests said it did.
          if (candidate.conflicted && shouldArchive({ ...input, conflicted: false })) {
            skippedConflicted += 1;
          }
          continue;
        }

        // False means the card stopped being eligible between selection and
        // now — the user dragged it out of Done. Not an error; the next pass
        // will reconsider it.
        if (await this.archive.archive(candidate.cardId)) {
          archived += 1;
          const arrived = candidate.arrivedInDoneAt ?? candidate.createdAt;
          this.log.info(
            {
              archived: {
                cardId: candidate.cardId,
                daysInDone: Math.floor((now.getTime() - arrived.getTime()) / 86_400_000),
              },
            },
            'Card archived',
          );
        }
      }

      return await this.runs.succeed(runId, {
        considered: candidates.length,
        archived,
        skippedConflicted,
      });
    } catch (error) {
      await this.runs.fail(runId);
      throw error;
    } finally {
      this.running = false;
    }
  }
}
