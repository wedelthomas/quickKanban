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
const COLLAPSE_KEY = 'kanban.filterRailCollapsed';

const readCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === 'true';
  } catch {
    // Private browsing, or storage disabled. An unusable preference is not a
    // reason to fail to render a board.
    return false;
  }
};

export const useFilter = () => {
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);

  /**
   * Whether the rail is shut, which DOES persist — unlike the filter itself.
   *
   * Not a violation of FR-310: that requirement is about which cards are
   * hidden, and this remembers only how wide a panel is. A rail that re-opened
   * on every reload would be a nuisance; a filter that survived one would be a
   * board the user could mistake for a lost one.
   */
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  const toggleCollapsed = useCallback((): void => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        // Preference lost, panel still works.
      }
      return next;
    });
  }, []);

  const expand = useCallback((): void => {
    setCollapsed(false);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, 'false');
    } catch {
      // As above.
    }
  }, []);

  const update = useCallback(
    <K extends keyof Filter>(key: K, value: Filter[K]): void =>
      setFilter((current) => ({ ...current, [key]: value })),
    [],
  );

  const clear = useCallback((): void => setFilter(EMPTY_FILTER), []);

  return {
    filter,
    update,
    clear,
    active: isActive(filter),
    collapsed,
    toggleCollapsed,
    expand,
  };
};
