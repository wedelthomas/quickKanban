import type { Card } from '../../shared/types.js';
import type {
  CreateCardInput,
  MoveCardInput,
  UpdateCardInput,
} from '../../domain/validation.js';
import type { CardRepository } from '../repositories/card-repository.js';
import { cardNotFound, deleteForbiddenNonLocal, editForbiddenJiraOwned } from '../errors.js';

export class CardService {
  constructor(
    private readonly cards: CardRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: CreateCardInput): Promise<Card> {
    return this.cards.create(input, this.now());
  }

  async update(id: string, input: UpdateCardInput): Promise<Card> {
    const result = await this.cards.update(id, input, this.now());
    if (result === 'not-found') throw cardNotFound(id);
    // The title comes from Jira and changes there, not here (FR-121). The
    // card's own fields — priority, due date, tags — remain the user's.
    if (result === 'jira-owned') throw editForbiddenJiraOwned('The title');
    return result;
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
