import type { Board } from '../../shared/types.js';
import type { CardRepository } from '../repositories/card-repository.js';

export class BoardService {
  constructor(
    private readonly cards: CardRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(): Promise<Board> {
    return { columns: await this.cards.readBoard(this.now()) };
  }
}
