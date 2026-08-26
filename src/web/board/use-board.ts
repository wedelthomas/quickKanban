import { useCallback, useEffect, useState } from 'react';
import type { Board, Card } from '../../shared/types.js';
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
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    // The client switches on `code`, never on `detail` — see contracts/api.md.
    const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
    throw new ApiError(
      problem ?? { code: 'VALIDATION_FAILED', title: 'Request failed', detail: 'Unknown error.' },
    );
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
};

export const useBoard = () => {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBoard(await request<Board>('/api/board'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.problem.detail : 'The board could not be loaded.');
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

  return { board, error, refresh, createCard };
};
