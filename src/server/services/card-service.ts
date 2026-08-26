import type { Card } from '../../shared/types.js';
import type { CreateCardInput, MoveCardInput } from '../../domain/validation.js';
import type { CardRepository } from '../repositories/card-repository.js';
import { cardNotFound } from '../errors.js';

export class CardService {
  constructor(
    private readonly cards: CardRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: CreateCardInput): Promise<Card> {
    return this.cards.create(input, this.now());
  }

  async move(id: string, input: MoveCardInput): Promise<{ card: Card; moved: boolean }> {
    const result = await this.cards.move(id, input, this.now());
    if (!result) throw cardNotFound(id);
    return { card: result.card, moved: result.moved };
  }
}
