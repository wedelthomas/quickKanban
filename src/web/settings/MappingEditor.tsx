import { useEffect, useState } from 'react';
import type { Column } from '../../shared/types.js';

export interface Mapping {
  columnId: number;
  columnName: string;
  statusName: string | null;
}

/**
 * Which Jira status each column stands for.
 *
 * Statuses come from Jira rather than a text field: a mistyped status name is
 * otherwise invisible until the first drag is refused, long after the person
 * who typed it has moved on (FR-202). "No status" is a first-class choice —
 * a column mapped to nothing simply never pushes, which is how Blocked ships.
 *
 * The mapping is saved by the settings dialog's own Save, not by a button of
 * its own: two Save buttons on one screen leave the user guessing which one
 * commits what.
 */
export const MappingEditor = ({
  columns,
  mappings,
  onChange,
}: {
  columns: Column[];
  mappings: Mapping[] | null;
  onChange: (columnId: number, statusName: string | null) => void;
}) => {
  const [statuses, setStatuses] = useState<string[] | null>(null);

  useEffect(() => {
    // Failing quietly on purpose: without Jira configured there are no statuses
    // to offer, but the existing mapping is still worth showing and editing.
    void (async () => {
      try {
        const response = await fetch('/api/jira/statuses');
        if (!response.ok) return;
        const body = (await response.json()) as { statuses: string[] };
        setStatuses(body.statuses);
      } catch {
        setStatuses(null);
      }
    })();
  }, []);

  if (!mappings) return <p className="field-note">Loading the column mapping…</p>;

  // Anything already mapped stays selectable even if Jira no longer reports it,
  // so opening this screen never silently drops a mapping the user chose.
  const options = Array.from(
    new Set([...(statuses ?? []), ...mappings.flatMap((m) => (m.statusName ? [m.statusName] : []))]),
  ).sort();

  return (
    <section className="mapping-editor" data-testid="mapping-editor">
      <h3 className="field-label">Column to Jira status</h3>
      {statuses === null && (
        <p className="field-note">
          Jira is not reachable, so only the statuses already in use are offered.
        </p>
      )}
      {columns.map((column) => (
        <label className="field field--row" key={column.id}>
          <span className="field-label">{column.name}</span>
          <select
            className="input"
            data-testid={`mapping-${column.key}`}
            value={mappings.find((m) => m.columnId === column.id)?.statusName ?? ''}
            onChange={(e) => onChange(column.id, e.target.value === '' ? null : e.target.value)}
          >
            <option value="">No status — never pushed to Jira</option>
            {options.map((status) => (
              <option value={status} key={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      ))}
    </section>
  );
};
