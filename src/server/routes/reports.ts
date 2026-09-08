import type { FastifyInstance } from 'fastify';
import type { ReportService } from '../services/report-service.js';

/**
 * The reporting surface (Slice 6). Read-only, computed on every request
 * (research.md R-2) — nothing here is cached or precomputed.
 */
export const registerReportRoutes = (app: FastifyInstance, reports: ReportService): void => {
  app.get<{ Params: { ordinalName: string } }>(
    '/api/iterations/:ordinalName/report',
    async (request) => reports.iterationReport(request.params.ordinalName),
  );
};
