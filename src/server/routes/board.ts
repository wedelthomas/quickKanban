import type { FastifyInstance } from 'fastify';
import type { BoardService } from '../services/board-service.js';

export const registerBoardRoutes = (app: FastifyInstance, board: BoardService): void => {
  app.get('/api/board', async () => board.read());
};
