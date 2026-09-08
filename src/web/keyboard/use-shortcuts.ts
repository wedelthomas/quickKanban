import { useEffect } from 'react';
import { isTyping, matchShortcut, type ShortcutMatch } from './shortcuts.js';

/**
 * Binds the registry to the document. Handlers are supplied by the board, so
 * this hook knows which keys mean what and nothing about what the board does
 * with them.
 *
 * `suspended` is set while a dialog or overlay owns the screen. Without it the
 * board's shortcuts outrank the dialog's own controls: Enter on a focused Save
 * button was being claimed as "open the focused card" and swallowed, so the
 * form never submitted. Board shortcuts must not reach past a modal — Escape
 * excepted, because it means "get me out of here" everywhere.
 */
export const useShortcuts = (
  handle: (match: ShortcutMatch) => void,
  { suspended = false }: { suspended?: boolean } = {},
): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const match = matchShortcut(event);
      if (!match) return;
      if (suspended && match.action !== 'close') return;
      if (isTyping(event.target) && match.action !== 'close') return;

      // Only claim the key once it is known to be ours and usable here.
      event.preventDefault();
      handle(match);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handle, suspended]);
};
