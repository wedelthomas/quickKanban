import { useEffect, useState } from 'react';
import type { Column, Settings } from '../../shared/types.js';
import { MappingEditor, type Mapping } from './MappingEditor.js';

/**
 * The query and the cadence — the two things the user changes.
 *
 * There is deliberately no field here for a Jira credential, and there must
 * never be one. Anything the interface can display, it can leak; the token
 * lives in the environment and the board only ever tells you whether it is
 * present.
 */
export const SettingsDialog = ({
  columns,
  onClose,
}: {
  columns: Column[];
  onClose: () => void;
}) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mappings, setMappings] = useState<Mapping[] | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s: Settings) => setSettings(s))
      .catch(() => setError('Settings could not be loaded.'));

    fetch('/api/settings/mappings')
      .then((r) => r.json())
      .then((body: { mappings: Mapping[] }) => setMappings(body.mappings))
      .catch(() => setError('The column mapping could not be loaded.'));
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
        const problem = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        setError(problem?.detail ?? 'Those settings could not be saved.');
        return;
      }

      if (mappings) {
        const mappingResponse = await fetch('/api/settings/mappings', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mappings: mappings.map(({ columnId, statusName }) => ({
              columnId,
              statusName,
            })),
          }),
        });
        if (!mappingResponse.ok) {
          const problem = (await mappingResponse.json().catch(() => null)) as {
            detail?: string;
          } | null;
          setError(problem?.detail ?? 'The column mapping could not be saved.');
          return;
        }
      }

      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <form
        className="dialog dialog--wide"
        role="dialog"
        aria-label="Settings"
        onSubmit={save}
      >
        <h2 className="help-title">Settings</h2>

        {/* Three columns, collapsing to fewer as the window narrows. Grouped by
            what the reader is deciding: what the board IS, what it reads from
            Jira, and how it understands time. The column mapping joins the
            third because it is six rows tall and was most of the scroll. */}
        <div className="settings-columns">
          <div className="settings-column">
            <label className="field">
              <span className="field-label">Author</span>
              <input
                className="input"
                value={settings?.author ?? ''}
                disabled={!settings}
                placeholder="QUICK KANBAN"
                onChange={(e) =>
                  settings && setSettings({ ...settings, author: e.target.value })
                }
              />
              <span className="field-note">
                Shown as the board heading. Leave empty to use the product name.
              </span>
            </label>
            <fieldset className="field">
              <legend className="field-label">Jira</legend>
              <label className="field">
                <span className="field-label">Jira query</span>
                <input
                  className="input"
                  value={settings?.jiraJql ?? ''}
                  disabled={!settings}
                  onChange={(e) =>
                    settings && setSettings({ ...settings, jiraJql: e.target.value })
                  }
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
                    setSettings({
                      ...settings,
                      syncIntervalSeconds: Number(e.target.value),
                    })
                  }
                />
              </label>
            </fieldset>

            <fieldset className="field">
              <legend className="field-label">Jira fields</legend>
              <div className="field-row">
                {(
                  [
                    ['jiraFieldBlocked', 'Blocked'],
                    ['jiraFieldSprint', 'Sprint'],
                    ['jiraFieldStoryPoints', 'Story points'],
                  ] as const
                ).map(([key, label]) => (
                  <label className="field" key={key}>
                    <span className="field-label">{label}</span>
                    <input
                      className="input"
                      data-testid={`field-${key}`}
                      value={settings?.[key] ?? ''}
                      disabled={!settings}
                      onChange={(e) =>
                        settings && setSettings({ ...settings, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <span className="field-note">
                Identifiers this Jira issues, so an administration change is a settings
                edit rather than a release. There is no credential here and nowhere to put
                one.
              </span>
            </fieldset>
          </div>

          <div className="settings-column">
            <fieldset className="field">
              <legend className="field-label">Iteration</legend>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Reference board</span>
                  <input
                    className="input"
                    type="number"
                    value={settings?.iterationBoardId ?? ''}
                    disabled={!settings}
                    onChange={(e) =>
                      settings &&
                      setSettings({
                        ...settings,
                        iterationBoardId: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Team</span>
                  <input
                    className="input"
                    value={settings?.iterationTeamName ?? ''}
                    disabled={!settings}
                    onChange={(e) =>
                      settings &&
                      setSettings({ ...settings, iterationTeamName: e.target.value })
                    }
                  />
                </label>
              </div>
              <span className="field-note">
                That board carries one active sprint per team sharing it, so the team name
                decides which iteration is yours.
              </span>
            </fieldset>

            <fieldset className="field">
              <legend className="field-label">Working week</legend>
              <div className="field-row">
                {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map(
                  (day) => (
                    <label className="filter-toggle" key={day}>
                      <input
                        type="checkbox"
                        data-testid={`working-day-${day}`}
                        checked={settings?.workingDays.includes(day) ?? false}
                        disabled={!settings}
                        onChange={(e) => {
                          if (!settings) return;
                          const days = e.target.checked
                            ? [...settings.workingDays, day]
                            : settings.workingDays.filter((d) => d !== day);
                          setSettings({ ...settings, workingDays: days });
                        }}
                      />
                      {day}
                    </label>
                  ),
                )}
              </div>
              <span className="field-note">
                Used for the iteration's remaining-days count. The hours below are
                recorded for the elapsed-time reporting that arrives next.
              </span>
            </fieldset>
          </div>

          <div className="settings-column">
            <MappingEditor
              columns={columns}
              mappings={mappings}
              onChange={(columnId, statusName) =>
                setMappings((current) => {
                  const rest = (current ?? []).filter((m) => m.columnId !== columnId);
                  const existing = (current ?? []).find((m) => m.columnId === columnId);
                  const name = columns.find((c) => c.id === columnId)?.name ?? '';
                  return [
                    ...rest,
                    { columnId, columnName: existing?.columnName ?? name, statusName },
                  ].sort((a, b) => a.columnId - b.columnId);
                })
              }
            />
          </div>
        </div>

        <p className="field-note" data-testid="credentials-note">
          Jira credentials are read from the environment and are never shown, stored or
          editable here.
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
          <button
            type="submit"
            className="button button--primary"
            disabled={saving || !settings}
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
};
