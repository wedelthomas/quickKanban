import type { Card } from '../../shared/types.js';
import type {
  CreateCardInput,
  MoveCardInput,
  UpdateCardInput,
} from '../../domain/validation.js';
import type { CardRepository } from '../repositories/card-repository.js';
import { cardNotFound, deleteForbiddenNonLocal } from '../errors.js';

export class CardService {
  constructor(
    private readonly cards: CardRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: CreateCardInput): Promise<Card> {
    return this.cards.create(input, this.now());
  }

  async update(id: string, input: UpdateCardInput): Promise<Card> {
    const card = await this.cards.update(id, input, this.now());
    if (!card) throw cardNotFound(id);
    return card;
  }

  async delete(id: string): Promise<void> {
    const outcome = await this.cards.softDelete(id);
    if (outcome === 'not-found') throw cardNotFound(id);
    if (outcome === 'not-local') throw deleteForbiddenNonLocal();
  }

  async move(id: string, input: MoveCardInput): Promise<{ card: Card; moved: boolean }> {
    const result = await this.cards.move(id, input, this.now());
    if (!result) throw cardNotFound(id);
    return { card: result.card, moved: result.moved };
  }
}
