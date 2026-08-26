import './App.css';

/**
 * Top navigation rather than the reference dashboard's left sidebar: six
 * columns at a readable width already exceed a 1440px display, and a 250px
 * rail would make the board scroll horizontally before a single card exists.
 * Reasoning recorded in docs/design/visual-language.md.
 */
export const App = () => (
  <div className="app">
    <header className="app-header">
      <span className="wordmark">Quick Kanban Wall</span>
      <nav className="nav" aria-label="Views">
        <a className="nav-item nav-item--active" href="#board" aria-current="page">
          Board
        </a>
      </nav>
    </header>
    <main className="app-main" id="board" />
  </div>
);
