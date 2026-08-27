import { useCallback, useState } from 'react';

/** Every screen that can sit over the board. */
export type DialogName =
  | 'create'
  | 'help'
  | 'settings'
  | 'summary'
  | 'archive'
  | 'conflicts';

/**
 * Which dialog, if any, owns the screen.
 *
 * One piece of state rather than six booleans, because the six were never
 * independent: opening any of them means the board's keyboard shortcuts must
 * stand down, and that condition was an ever-growing `a || b || c || …` that
 * silently fell out of date every time a screen was added. `suspended` is now
 * derived from the same value that decides what is rendered, so the two cannot
 * disagree.
 *
 * The card editor is deliberately NOT here: it carries the card being edited,
 * so its state is the card itself rather than a name.
 */
export const useDialogs = () => {
  const [open, setOpen] = useState<DialogName | null>(null);

  const show = useCallback((name: DialogName) => setOpen(name), []);
  const hide = useCallback(() => setOpen(null), []);
  const isOpen = useCallback((name: DialogName) => open === name, [open]);

  return { open, show, hide, isOpen, anyOpen: open !== null };
};
