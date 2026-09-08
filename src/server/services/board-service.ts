import type { Board } from '../../shared/types.js';
import type { BoardRepository } from '../repositories/board-repository.js';

export class BoardService {
  constructor(
    private readonly board: BoardRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(): Promise<Board> {
    return { columns: await this.board.readBoard(this.now()) };
  }
}
