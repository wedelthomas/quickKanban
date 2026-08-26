import { useEffect } from 'react';
import { isTyping, matchShortcut, type ShortcutMatch } from './shortcuts.js';

/**
 * Binds the registry to the document. Handlers are supplied by the board, so
 * this hook knows which keys mean what and nothing about what the board does
 * with them.
 */
export const useShortcuts = (handle: (match: ShortcutMatch) => void): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const match = matchShortcut(event);
      if (!match) return;
      if (isTyping(event.target) && match.action !== 'close') return;

      // Only claim the key once it is known to be ours and usable here.
      event.preventDefault();
      handle(match);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handle]);
};
