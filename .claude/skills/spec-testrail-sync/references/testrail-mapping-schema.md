# TestRail Mapping File Schema

One file per SDD spec, stored at `specs/<epic>/testrail-mapping.json`. The
file is the source of truth for which spec scenario produced which TestRail
case, and the content hash that was in effect at the time of the last sync.

## File layout

```json
{
  "spec_path": "specs/001-boss-event-consumer/spec.md",
  "jira_ref": "CRM-13228",
  "project_id": 95,
  "suite_id": 24132,
  "last_synced_at": "2026-04-24T18:00:00Z",
  "last_synced_by": "spec-testrail-sync",
  "user_stories": {
    "us1": {
      "title": "Process Client CREATE Events",
      "priority": "P1",
      "section_id": 1993581,
      "section_name": "CRM-13228 - Orchestration | BOSS event consumer - Logic"
    },
    "us2": { "...": "..." }
  },
  "scenarios": {
    "us1-s1": {
      "case_id": 18790001,
      "hash": "f6c0248c91a583159ffcb522bbebb6584f266df2e0ef8f29cce08af7e6609aa5",
      "title_at_last_sync": "Process Client CREATE Events - S1: a new client is created in BOSS via ..."
    },
    "us1-s2": { "...": "..." }
  },
  "orphans": {
    "us9-s1": {
      "case_id": 18790012,
      "removed_at": "2026-04-24T18:00:00Z",
      "reason": "scenario removed from spec"
    }
  }
}
```

## Field semantics

### Top-level

| Field | Type | Required | Notes |
|---|---|---|---|
| `spec_path` | string | yes | Workspace-relative path to the source spec.md. |
| `jira_ref` | string | yes | JIRA ticket ID extracted from the spec header. Used for the TestRail `refs` field on new cases. |
| `project_id` | int | yes | TestRail project ID. Locked at first sync; do not change on re-run. |
| `suite_id` | int | yes | TestRail suite ID under `project_id`. Locked at first sync. |
| `last_synced_at` | ISO8601 string | yes | When this file was last written. For operator diagnostics only. |
| `last_synced_by` | string | yes | Plain identifier of the skill that wrote the file (e.g. `spec-testrail-sync`). Informational; the skill does not version this string and operators do not need to bump it. |
| `user_stories` | object | yes | Per-User-Story metadata. Keys: `us{N}`. |
| `scenarios` | object | yes | Per-scenario state. Keys: `us{N}-s{K}`. |
| `verification` | object | optional | Per-case state for the BH-###/TEST-### format. Keys: `TEST-###`. Present only for specs using that format; absent (not an empty object) for legacy-format specs — its presence is itself the signal of which format a given mapping file tracks. |
| `orphans` | object | optional | Scenarios previously synced but no longer present in the spec. Never auto-deleted. |

### `user_stories.us{N}`

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | User Story title as of last sync. Informational; does not affect identity. |
| `priority` | string | yes | `P1` / `P2` / `P3`. Used to derive TestRail `priority_id`. |
| `section_id` | int | yes | TestRail section where this story's cases live. Resolved at first sync (match-by-name or create-with-approval). |
| `section_name` | string | yes | Section name at resolution time. Informational. |

### `scenarios.us{N}-s{K}`

| Field | Type | Required | Notes |
|---|---|---|---|
| `case_id` | int | yes | TestRail case ID created for this scenario. Locked; subsequent updates target this ID. |
| `hash` | string (hex, 64) | yes | SHA256 of the canonical scenario text from the last sync. Drives drift detection. |
| `title_at_last_sync` | string | yes | Title pushed at last sync. If TestRail shows a different title now, operator-initiated change — skill must not overwrite without approval. |

### `verification.TEST-{N}`

| Field | Type | Required | Notes |
|---|---|---|---|
| `case_id` | int | yes | TestRail case ID created for this TEST-###. Locked; subsequent updates target this ID. |
| `pins` | string | yes | The `BH-###` this case verifies, as of last sync. If `spec.md`'s `Pins` column changes which `BH-###` a `TEST-###` points at, treat it as a content change (like a hash mismatch) — re-sync the case body from the new target. |
| `hash` | string (hex, 64) | yes | SHA256 of the pinned `BH-###`'s canonical Given/When/Then text (same hashing approach as the legacy `scenarios` entries, over the new content shape). |
| `title_at_last_sync` | string | yes | Same semantics as `scenarios.us{N}-s{K}.title_at_last_sync`. |

Orphan handling for this key form reuses the existing `orphans` object unchanged — a `TEST-###` whose case gets removed from the spec moves to `orphans` exactly like a `us{N}-s{K}` scenario does today; no schema change needed there.

### `orphans.us{N}-s{K}`

Appended when a scenario key present in `scenarios` no longer appears in the parsed spec. The skill never removes entries from `scenarios` directly — it moves them to `orphans` so the TestRail case ID is preserved for human decision.

| Field | Type | Notes |
|---|---|---|
| `case_id` | int | Preserved from the original entry. |
| `removed_at` | ISO8601 string | First sync run in which the scenario was missing. |
| `reason` | string | Always `"scenario removed from spec"` for now. Reserved for future diagnostics. |

## Integrity rules

1. **`project_id` and `suite_id` are immutable.** If a user wants to move the spec to a different project/suite, that's a new file, not an edit.
2. **`case_id` is immutable per scenario key.** If the same key is deleted and later re-added, the skill creates a new case and writes a new mapping entry; the old `case_id` stays in `orphans`.
3. **Never delete `orphans` entries automatically.** Only a human command (or a future explicit skill flag) may prune them.
4. **Hash is over canonical text only.** The parser strips markdown bold markers and collapses whitespace before hashing, so cosmetic spec edits (e.g. reformatting bullets) do not trigger spurious TestRail updates.
5. **Write atomically.** Write to `.testrail-mapping.json.tmp`, fsync, then rename. Half-written files corrupt the next run.

## Example diff computation (pseudocode)

```
parsed = parse_spec(spec.md)
mapping = load_mapping(testrail-mapping.json) or new_mapping()

new_keys, updated_keys, unchanged_keys = [], [], []
for story in parsed.user_stories:
    for scenario in story.scenarios:
        key = scenario.key  # e.g. "us1-s1"
        if key not in mapping.scenarios:
            new_keys.append(key)
        elif mapping.scenarios[key].hash != scenario.hash:
            updated_keys.append(key)
        else:
            unchanged_keys.append(key)

orphan_keys = set(mapping.scenarios) - {s.key for st in parsed.user_stories for s in st.scenarios}
```

Present `new_keys`, `updated_keys`, `orphan_keys` to the user before any MCP call.
