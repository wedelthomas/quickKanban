import { useCallback, useEffect, useState } from 'react';
import type { Board, Card } from '../../shared/types.js';
import { applyMove } from './apply-move.js';
import type { CreateCardInput } from '../../domain/validation.js';

export interface ProblemResponse {
  code: string;
  title: string;
  detail: string;
}

export class ApiError extends Error {
  constructor(readonly problem: ProblemResponse) {
    super(problem.detail);
    this.name = 'ApiError';
  }
}

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    // Only declare a JSON body when there is one. Sending this header on a
    // bodiless DELETE makes the server reject the request for having an empty
    // JSON body.
    headers: init?.body
      ? { 'content-type': 'application/json', ...init.headers }
      : init?.headers,
  });
  if (!response.ok) {
    // The client switches on `code`, never on `detail` — see contracts/api.md.
    const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
    throw new ApiError(
      problem ?? {
        code: 'VALIDATION_FAILED',
        title: 'Request failed',
        detail: 'Unknown error.',
      },
    );
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
};

export const useBoard = () => {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBoard(await request<Board>('/api/board'));
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.problem.detail : 'The board could not be loaded.',
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Creating refetches rather than splicing the new card in locally. The server
   * decides the card's position, and guessing it here would put the interface
   * and the database one renumbering apart.
   */
  const createCard = useCallback(
    async (input: Partial<CreateCardInput>): Promise<Card> => {
      const card = await request<Card>('/api/cards', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
      return card;
    },
    [refresh],
  );

  /**
   * Applies the move immediately, then reconciles. On failure the board goes
   * back to exactly what it was and the reason is named — a move that silently
   * failed would leave the board confidently wrong, which is the one outcome
   * this product cannot afford.
   */
  const moveCard = useCallback(
    async (cardId: string, toColumnId: number, toIndex: number): Promise<void> => {
      setMoveError(null);
      const snapshot = board;
      if (!snapshot) return;

      const optimistic = applyMove(snapshot, cardId, toColumnId, toIndex);
      if (!optimistic) return; // nothing would change; don't call the server

      setBoard(optimistic);
      try {
        const result = await request<{ card: Card; moved: boolean }>(
          `/api/cards/${cardId}/move`,
          { method: 'POST', body: JSON.stringify({ toColumnId, toIndex }) },
        );
        // Reconcile against the authoritative position rather than assuming the
        // optimistic guess was right.
        const shown = optimistic.columns
          .flatMap((c) => c.cards)
          .find((c) => c.id === cardId);
        if (
          shown &&
          (shown.columnId !== result.card.columnId ||
            shown.position !== result.card.position)
        ) {
          await refresh();
        }
      } catch (e) {
        setBoard(snapshot);
        setMoveError(
          e instanceof ApiError ? e.problem.detail : 'The move could not be saved.',
        );
      }
    },
    [board, refresh],
  );

  const updateCard = useCallback(
    async (cardId: string, patch: Partial<CreateCardInput>): Promise<void> => {
      await request<Card>(`/api/cards/${cardId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await refresh();
    },
    [refresh],
  );

  const deleteCard = useCallback(
    async (cardId: string): Promise<void> => {
      await request<void>(`/api/cards/${cardId}`, { method: 'DELETE' });
      await refresh();
    },
    [refresh],
  );

  return {
    board,
    error,
    moveError,
    dismissMoveError: () => setMoveError(null),
    refresh,
    createCard,
    moveCard,
    updateCard,
    deleteCard,
  };
};
