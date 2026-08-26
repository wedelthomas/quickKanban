import { SHORTCUTS } from './shortcuts.js';

export const HelpOverlay = ({ onClose }: { onClose: () => void }) => (
  <div className="dialog-backdrop" onClick={onClose}>
    <div
      className="dialog help"
      role="dialog"
      aria-label="Keyboard shortcuts"
      data-testid="shortcut-help"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 className="help-title">Keyboard shortcuts</h2>
      <dl className="help-list">
        {SHORTCUTS.map((shortcut) => (
          <div className="help-row" key={shortcut.label}>
            <dt>
              <kbd data-testid="shortcut-key">{shortcut.label}</kbd>
            </dt>
            <dd>{shortcut.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  </div>
);
