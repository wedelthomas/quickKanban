import { useCallback, useEffect, useState } from 'react';

/**
 * Whose board this is, for the page heading.
 *
 * Its own tiny hook rather than a general settings hook, because the board only
 * needs this one value and fetching the whole settings document on every board
 * load to read one string would be the wrong trade. Empty means "use the
 * product name", so a board that has never been configured looks unchanged.
 */
export const useAuthor = (): { author: string; reloadAuthor: () => void } => {
  const [author, setAuthor] = useState('');

  const reloadAuthor = useCallback(() => {
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { author?: string } | null) => setAuthor(body?.author ?? ''))
      // A heading is not worth surfacing an error for: the fallback is a
      // correct, complete page rather than a degraded one.
      .catch(() => setAuthor(''));
  }, []);

  useEffect(reloadAuthor, [reloadAuthor]);

  return { author, reloadAuthor };
};
