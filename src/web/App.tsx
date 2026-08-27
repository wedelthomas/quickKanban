import { Board } from './board/Board.js';
import './App.css';

/**
 * A left rail rather than the top bar this started with.
 *
 * The rail carries identity, views and the filter, patterned on the ABS Team
 * Reports dashboard. The original objection — that six readable columns already
 * exceed a 1440px display, so a permanent rail pushes the board into horizontal
 * scrolling — is answered by making it collapsible rather than by avoiding it.
 * Recorded in docs/design/visual-language.md.
 */
export const App = () => (
  <div className="app">
    <Board />
  </div>
);
