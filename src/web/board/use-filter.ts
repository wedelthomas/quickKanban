import { useCallback, useState } from 'react';
import { EMPTY_FILTER, isActive, type Filter } from '../../domain/card-filter.js';

/**
 * The board's filter, held in component state and nowhere else.
 *
 * That is the whole mechanism behind FR-310: a filter must not survive a
 * reload, and state that lives only here dies on reload without anything
 * having to enforce it. Putting it in the URL or in settings would each
 * persist by default, and the requirement would then need active defending.
 */
export const useFilter = () => {
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);

  const update = useCallback(
    <K extends keyof Filter>(key: K, value: Filter[K]): void =>
      setFilter((current) => ({ ...current, [key]: value })),
    [],
  );

  const clear = useCallback((): void => setFilter(EMPTY_FILTER), []);

  return { filter, update, clear, active: isActive(filter) };
};
