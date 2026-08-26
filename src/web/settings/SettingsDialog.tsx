import { useEffect, useState } from 'react';
import type { Settings } from '../../shared/types.js';

/**
 * The query and the cadence — the two things the user changes.
 *
 * There is deliberately no field here for a Jira credential, and there must
 * never be one. Anything the interface can display, it can leak; the token
 * lives in the environment and the board only ever tells you whether it is
 * present.
 */
export const SettingsDialog = ({ onClose }: { onClose: () => void }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s: Settings) => setSettings(s))
      .catch(() => setError('Settings could not be loaded.'));
  }, []);

  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!settings) return;
    const seconds = settings.syncIntervalSeconds;
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 3600) {
      setError('Sync every must be between 60 and 3600 seconds.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
        setError(problem?.detail ?? 'Those settings could not be saved.');
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <form className="dialog" role="dialog" aria-label="Settings" onSubmit={save}>
        <h2 className="help-title">Settings</h2>

        <label className="field">
          <span className="field-label">Jira query</span>
          <input
            className="input"
            value={settings?.jiraJql ?? ''}
            disabled={!settings}
            onChange={(e) => settings && setSettings({ ...settings, jiraJql: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="field-label">Sync every (seconds)</span>
          <input
            className="input"
            type="number"
            // Deliberately no min/max: the browser would block submission with
            // its own tooltip, which is silent to the rest of the interface and
            // inconsistent with how every other error here is shown. Validated
            // below instead, against the same bounds the server enforces.
            value={settings?.syncIntervalSeconds ?? ''}
            disabled={!settings}
            onChange={(e) =>
              settings &&
              setSettings({ ...settings, syncIntervalSeconds: Number(e.target.value) })
            }
          />
        </label>

        <p className="field-note" data-testid="credentials-note">
          Jira credentials are read from the environment and are never shown,
          stored or editable here.
        </p>

        {error && (
          <p className="field-error" role="alert" data-testid="settings-error">
            {error}
          </p>
        )}

        <div className="dialog-actions">
          <span className="dialog-actions-spacer" />
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={saving || !settings}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
};
