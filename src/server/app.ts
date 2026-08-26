import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import type pg from 'pg';
import { fileURLToPath, URL } from 'node:url';
import { existsSync } from 'node:fs';
import { DomainError, databaseUnavailable } from './errors.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerBoardRoutes } from './routes/board.js';
import { BoardService } from './services/board-service.js';
import { CardService } from './services/card-service.js';
import { registerCardRoutes } from './routes/cards.js';
import { registerTagRoutes } from './routes/tags.js';
import { TagRepository } from './repositories/tag-repository.js';
import { EventRepository } from './repositories/event-repository.js';
import { SettingsRepository } from './repositories/settings-repository.js';
import { JiraLinkRepository } from './repositories/jira-link-repository.js';
import { SyncRunRepository } from './repositories/sync-run-repository.js';
import { SyncService } from './sync/sync-service.js';
import { SyncLock } from './sync/sync-lock.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerSettingsRoutes } from './routes/settings.js';
import type { JiraPort } from './jira/jira-port.js';
import { CardRepository } from './repositories/card-repository.js';
import { BoardRepository } from './repositories/board-repository.js';

export interface AppOptions {
  pool: pg.Pool;
  /** Absolute path to the built SPA. Omitted in tests, which never need it. */
  webRoot?: string;
  logger?: boolean;
  /**
   * How this app reaches Jira. Null means Jira is not configured, which is a
   * supported state. Tests pass a fake; nothing in the standard suite is ever
   * given the real adapter.
   */
  jira?: JiraPort | null;
  /** Exposed so the scheduler can share the lock the routes use. */
  lock?: SyncLock;
  /** Called when the poll interval changes, so the scheduler can re-arm. */
  onIntervalChanged?: () => void;
}

/**
 * Builds the Fastify instance. Kept separate from `index.ts` so tests can start
 * an app against their own pool without going near process startup, migrations
 * or the loopback binding.
 */
export const buildApp = ({
  pool,
  webRoot,
  logger = true,
  jira = null,
  lock = new SyncLock(),
  onIntervalChanged = () => {},
}: AppOptions): FastifyInstance => {
  // Typed separately: inlining a `false | object` union makes TypeScript
  // resolve Fastify's HTTP/2 overload instead of the HTTP/1 one.
  const loggerOption: FastifyServerOptions['logger'] = logger
    ? {
        level: process.env.LOG_LEVEL ?? 'info',
        // No credential ever reaches a log line: only the fields named here
        // are serialised, and none of them can carry one.
        serializers: {
          req: (req) => ({ method: req.method, url: req.url, id: req.id }),
        },
      }
    : false;

  const app = Fastify({
    logger: loggerOption,
    genReqId: () => crypto.randomUUID(),
  });

  app.setErrorHandler((error, request, reply) => {
    const domain =
      error instanceof DomainError
        ? error
        : isConnectionFailure(error)
          ? databaseUnavailable()
          : null;

    if (!domain) {
      // A framework error that already knows it is the caller's fault must not
      // be reported as a server fault: a 400 dressed up as a 500 sends whoever
      // debugs it next looking in the wrong place entirely.
      // Fastify 5.12 types this parameter as `unknown`, so narrow it once here
      // rather than asserting at each use.
      const framework = error as { statusCode?: number; message?: string };
      const status = framework.statusCode ?? 500;
      const clientFault = status >= 400 && status < 500;

      request.log.error({ err: error }, clientFault ? 'rejected request' : 'unhandled error');

      return reply
        .status(status)
        .type('application/problem+json')
        .send({
          type: 'about:blank',
          title: clientFault ? 'The request could not be accepted' : 'Something went wrong',
          status,
          code: clientFault ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
          detail:
            clientFault && framework.message
              ? framework.message
              : 'The request could not be completed.',
        });
    }

    return reply.status(domain.status).type('application/problem+json').send({
      type: 'about:blank',
      title: domain.title,
      status: domain.status,
      code: domain.code,
      detail: domain.message,
    });
  });

  registerHealthRoutes(app, pool);
  const cardRepository = new CardRepository(pool);
  registerBoardRoutes(app, new BoardService(new BoardRepository(pool)));
  registerCardRoutes(app, new CardService(cardRepository), new EventRepository(pool));

  const settings = new SettingsRepository(pool);
  const runs = new SyncRunRepository(pool);
  const sync = jira
    ? new SyncService(pool, jira, cardRepository, new JiraLinkRepository(pool), runs, settings)
    : null;
  registerSyncRoutes(app, { sync, lock, runs });
  registerSettingsRoutes(app, settings, onIntervalChanged);
  registerTagRoutes(app, new TagRepository(pool));

  if (webRoot && existsSync(webRoot)) {
    app.register(fastifyStatic, { root: webRoot });
    // The SPA owns its routing; anything not under /api falls through to it.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) {
        return reply.status(404).type('application/problem+json').send({
          type: 'about:blank',
          title: 'Not found',
          status: 404,
          code: 'CARD_NOT_FOUND',
          detail: `No route matches ${request.url}.`,
        });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
};

/**
 * `pg` surfaces an unreachable server as a plain Error with one of these
 * codes. Mapping them here means every route gets the revert-worthy 503
 * without each one remembering to catch.
 */
const isConnectionFailure = (error: unknown): boolean => {
  const code = (error as { code?: string })?.code;
  return (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === '57P01'
  );
};

export const defaultWebRoot = (): string =>
  fileURLToPath(new URL('../web', import.meta.url));
