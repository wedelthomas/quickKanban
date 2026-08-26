import type { Card } from '../../shared/types.js';
import type { CreateCardInput } from '../../domain/validation.js';
import type { CardRepository } from '../repositories/card-repository.js';

export class CardService {
  constructor(
    private readonly cards: CardRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: CreateCardInput): Promise<Card> {
    return this.cards.create(input, this.now());
  }
}
