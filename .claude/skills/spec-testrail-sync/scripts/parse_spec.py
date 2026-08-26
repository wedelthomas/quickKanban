#!/usr/bin/env python3
"""Parse an SDD spec.md and extract its User Stories and Acceptance Scenarios
into a JSON structure consumable by the sdd-testrail-sync skill.

Output schema (JSON on stdout):

    {
      "spec_path": "specs/001-boss-event-consumer/spec.md",
      "feature_title": "BOSS Event Consumer Logic",
      "jira_ref": "CRM-13228",
      "user_stories": [
        {
          "number": 1,
          "title": "Process Client CREATE Events",
          "priority": "P1",
          "story_description": "<multiline paragraph after the heading>",
          "why_priority": "<text>",
          "independent_test": "<text>",
          "repos_affected": ["boss-integration-app-boss-eventconsumer"],
          "scenarios": [
            {
              "key": "us1-s1",
              "number": 1,
              "text": "<full scenario text>",
              "given": "<Given clause>",
              "when": "<When clause>",
              "then": "<Then clause>",
              "hash": "<sha256 hex>"
            }, ...
          ]
        }, ...
      ]
    }

Exit 0 on success, non-zero on parse error. All regexes are deliberately
tolerant of variations seen across authors (e.g. trailing whitespace, em-dash
vs hyphen in headings).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path


FEATURE_TITLE_RE = re.compile(r"^#\s+Feature Specification:\s*(.+?)\s*$", re.MULTILINE)
JIRA_REF_RE = re.compile(r"\*\*JIRA\*\*:\s*\[([A-Z]+-\d+)", re.MULTILINE)

# "### User Story 1 - Process Client CREATE Events (Priority: P1)"
USER_STORY_HEADER_RE = re.compile(
    r"^###\s+User Story\s+(\d+)\s*[-–—]\s*(.+?)\s+\(Priority:\s*(P\d+)\)\s*$",
    re.MULTILINE,
)

WHY_PRIORITY_RE = re.compile(r"\*\*Why this priority\*\*:\s*(.+?)(?=\n\n|\*\*[A-Z])", re.DOTALL)
INDEPENDENT_TEST_RE = re.compile(r"\*\*Independent Test\*\*:\s*(.+?)(?=\n\n|\*\*[A-Z])", re.DOTALL)
REPOS_AFFECTED_RE = re.compile(r"\*\*Repos Affected\*\*:\s*(.+?)(?=\n\n|\*\*[A-Z]|\n---)", re.DOTALL)
ACCEPTANCE_MARKER_RE = re.compile(r"^\*\*Acceptance Scenarios\*\*:\s*$", re.MULTILINE)

# A numbered scenario line (may span multiple lines via continuation).
# We capture "N. <rest>" then grab until the next numbered item or blank
# line followed by a non-list marker.
SCENARIO_LINE_RE = re.compile(r"^(\d+)\.\s+(.*?)$", re.MULTILINE)

# Split Given/When/Then from a scenario body. Bold markers are the separator.
GWT_RE = re.compile(
    r"\*\*Given\*\*\s*(?P<given>.+?)\s*,\s*\*\*When\*\*\s*(?P<when>.+?)\s*,\s*\*\*Then\*\*\s*(?P<then>.+)$",
    re.DOTALL,
)


def _section_after(heading_idx: int, body: str) -> tuple[int, int]:
    """Return (start, end) of a User Story section starting at heading_idx.

    End is the position of the next ``### `` heading, ``## `` heading,
    or the end of file, whichever comes first.
    """
    newline_after_heading = body.find("\n", heading_idx)
    start = newline_after_heading + 1 if newline_after_heading != -1 else heading_idx

    next_h3 = body.find("\n### ", start)
    next_h2 = body.find("\n## ", start)
    candidates = [p for p in (next_h3, next_h2) if p != -1]
    end = min(candidates) if candidates else len(body)
    return start, end


def _clean(text: str) -> str:
    """Collapse whitespace but preserve intra-word punctuation."""
    return re.sub(r"\s+", " ", text).strip()


def _parse_scenarios(block: str) -> list[dict]:
    """Parse the block of text that follows '**Acceptance Scenarios**:'
    up to the next section break. Handle multi-line scenarios.
    """
    marker = ACCEPTANCE_MARKER_RE.search(block)
    if not marker:
        return []

    after = block[marker.end() :]
    # Stop the acceptance block at the first '---', '### ', or two consecutive
    # blank lines followed by a non-numbered line.
    stoppers = [after.find(s) for s in ("\n---", "\n### ", "\n\n**Edge Cases")]
    stoppers = [s for s in stoppers if s != -1]
    end = min(stoppers) if stoppers else len(after)
    region = after[:end]

    # Split into items by numbered list markers at start-of-line.
    items: list[str] = []
    current: list[str] = []
    for line in region.splitlines():
        if re.match(r"^\d+\.\s", line):
            if current:
                items.append("\n".join(current).strip())
                current = []
            current.append(line)
        elif line.strip() == "":
            if current:
                current.append("")  # preserve paragraph break within a scenario
        else:
            if current:
                current.append(line)
    if current:
        items.append("\n".join(current).strip())

    scenarios: list[dict] = []
    for raw in items:
        # Strip the leading "N. "
        m = SCENARIO_LINE_RE.match(raw)
        if not m:
            continue
        n = int(m.group(1))
        body = _clean(raw[m.start(2) - m.start() :])

        gwt = GWT_RE.search(body)
        given = _clean(gwt.group("given")) if gwt else ""
        when = _clean(gwt.group("when")) if gwt else ""
        then = _clean(gwt.group("then")) if gwt else ""

        # Hash the canonical form: strip bold markers, collapse whitespace.
        canonical = re.sub(r"\*\*", "", body)
        canonical = _clean(canonical)
        h = hashlib.sha256(canonical.encode("utf-8")).hexdigest()

        scenarios.append(
            {
                "number": n,
                "text": body,
                "given": given,
                "when": when,
                "then": then,
                "hash": h,
            }
        )
    return scenarios


def _parse_repos(block: str) -> list[str]:
    m = REPOS_AFFECTED_RE.search(block)
    if not m:
        return []
    raw = m.group(1)
    # Extract backtick-quoted repo names, fall back to comma-split.
    repos = re.findall(r"`([^`]+)`", raw)
    if repos:
        return [r.strip() for r in repos]
    return [p.strip() for p in raw.split(",") if p.strip()]


VERIFICATION_HEADING_RE = re.compile(r"^##\s+Verification\b.*$", re.MULTILINE)


def has_verification_table(text: str) -> bool:
    """True if this spec uses the new BH-###/TEST-### format (the
    bdd-tdd-workflow capability's spec-template.md addition). Detection is
    per-spec, not global -- a project may have both old- and new-format
    specs side by side; each is parsed by its own matching path below.
    Old-format specs are parsed by _parse_legacy_spec, whose body is an
    exact, unmodified copy of this module's parse_spec before this change
    -- byte-identical behavior for every spec that doesn't use the new
    section."""
    return bool(VERIFICATION_HEADING_RE.search(text))


def parse_spec(spec_path: Path) -> dict:
    text = spec_path.read_text(encoding="utf-8")
    if has_verification_table(text):
        return parse_bh_test_spec(spec_path, text)
    return _parse_legacy_spec(spec_path)


BEHAVIOR_PATHWAYS_HEADING_RE = re.compile(r"^##\s+Behavior Pathways\b.*$", re.MULTILINE)

BH_HEADER_RE = re.compile(
    r"^-\s+\*\*(BH-\d+)\*\*\s*(?:\(satisfies\s+(?P<fr>FR-\d+(?:,\s*FR-\d+)*)\))?\s*:\s*(?P<rest>.+)$",
    re.MULTILINE,
)

VERIFICATION_ROW_RE = re.compile(
    r"^\|\s*(TEST-\d+)\s*\|\s*(.+?)\s*\|\s*(BH-\d+)\s*\|\s*$",
    re.MULTILINE,
)


def _section_text(text: str, heading_re: "re.Pattern[str]") -> str:
    """Text between a `## Heading` match and the next `## ` heading (or EOF)."""
    m = heading_re.search(text)
    if not m:
        return ""
    start = text.find("\n", m.end())
    start = start + 1 if start != -1 else m.end()
    next_h2 = text.find("\n## ", start)
    end = next_h2 if next_h2 != -1 else len(text)
    return text[start:end]


def _parse_behavior_pathways(text: str) -> list[dict]:
    section = _section_text(text, BEHAVIOR_PATHWAYS_HEADING_RE)
    pathways: list[dict] = []
    headers = list(BH_HEADER_RE.finditer(section))
    for i, m in enumerate(headers):
        bh_id = m.group(1)
        fr_list = m.group("fr")
        rest = m.group("rest").strip()

        entry = {
            "id": bh_id,
            "satisfies": [fr.strip() for fr in fr_list.split(",")] if fr_list else [],
            "no_behavior": False,
            "reason": None,
            "name": "",
            "given": "",
            "when": "",
            "then": "",
        }

        if rest.lower().startswith("no-behavior"):
            entry["no_behavior"] = True
            reason_m = re.search(r"no-behavior\s*[-–—]+\s*(.+)$", rest, re.IGNORECASE)
            entry["reason"] = reason_m.group(1).strip() if reason_m else rest
            pathways.append(entry)
            continue

        entry["name"] = rest
        block_start = m.end()
        block_end = headers[i + 1].start() if i + 1 < len(headers) else len(section)
        block = section[block_start:block_end]

        # DOTALL + a lookahead stop at the next Given/When/Then marker (or
        # end of block) so a clause that wraps onto a continuation line
        # -- e.g. "**Then** the system rejects the request and explains\n
        # that shipped orders can't be cancelled this way" -- is captured
        # in full, not truncated at the first newline.
        given_m = re.search(r"\*\*Given\*\*\s+(.+?)(?=\n\s*-\s*\*\*When\*\*|\n\s*-\s*\*\*Then\*\*|\Z)", block, re.DOTALL)
        when_m = re.search(r"\*\*When\*\*\s+(.+?)(?=\n\s*-\s*\*\*Then\*\*|\Z)", block, re.DOTALL)
        then_m = re.search(r"\*\*Then\*\*\s+(.+)", block, re.DOTALL)
        entry["given"] = _clean(given_m.group(1)) if given_m else ""
        entry["when"] = _clean(when_m.group(1)) if when_m else ""
        entry["then"] = _clean(then_m.group(1)) if then_m else ""
        pathways.append(entry)
    return pathways


def _parse_verification_table(text: str) -> list[dict]:
    section = _section_text(text, VERIFICATION_HEADING_RE)
    return [
        {"id": m.group(1), "name": m.group(2).strip(), "pins": m.group(3)}
        for m in VERIFICATION_ROW_RE.finditer(section)
    ]


def parse_bh_test_spec(spec_path: Path, text: str) -> dict:
    feature_match = FEATURE_TITLE_RE.search(text)
    feature_title = feature_match.group(1).strip() if feature_match else spec_path.stem
    jira_match = JIRA_REF_RE.search(text)
    jira_ref = jira_match.group(1) if jira_match else None

    return {
        "spec_path": str(spec_path),
        "feature_title": feature_title,
        "jira_ref": jira_ref,
        "format": "bh_test",
        "behavior_pathways": _parse_behavior_pathways(text),
        "verification": _parse_verification_table(text),
    }


def _parse_legacy_spec(spec_path: Path) -> dict:
    text = spec_path.read_text(encoding="utf-8")

    feature_match = FEATURE_TITLE_RE.search(text)
    feature_title = feature_match.group(1).strip() if feature_match else spec_path.stem

    jira_match = JIRA_REF_RE.search(text)
    jira_ref = jira_match.group(1) if jira_match else None

    user_stories: list[dict] = []
    for m in USER_STORY_HEADER_RE.finditer(text):
        num = int(m.group(1))
        title = m.group(2).strip()
        priority = m.group(3).strip()

        start, end = _section_after(m.start(), text)
        block = text[start:end]

        # Paragraph between the heading and the first bolded meta line.
        desc_match = re.match(r"\s*(.+?)(?=\n\*\*[A-Z])", block, re.DOTALL)
        story_description = _clean(desc_match.group(1)) if desc_match else ""

        why = WHY_PRIORITY_RE.search(block)
        indep = INDEPENDENT_TEST_RE.search(block)

        scenarios = _parse_scenarios(block)
        for s in scenarios:
            s["key"] = f"us{num}-s{s['number']}"

        user_stories.append(
            {
                "number": num,
                "title": title,
                "priority": priority,
                "story_description": story_description,
                "why_priority": _clean(why.group(1)) if why else "",
                "independent_test": _clean(indep.group(1)) if indep else "",
                "repos_affected": _parse_repos(block),
                "scenarios": scenarios,
            }
        )

    return {
        "spec_path": str(spec_path),
        "feature_title": feature_title,
        "jira_ref": jira_ref,
        "user_stories": user_stories,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Parse an SDD spec.md into JSON.")
    ap.add_argument("spec", type=Path, help="Path to spec.md")
    ap.add_argument(
        "--indent",
        type=int,
        default=2,
        help="JSON indent (default 2). Use 0 for compact.",
    )
    args = ap.parse_args()

    if not args.spec.exists():
        print(f"error: spec not found: {args.spec}", file=sys.stderr)
        return 2

    result = parse_spec(args.spec)
    indent = args.indent if args.indent > 0 else None
    json.dump(result, sys.stdout, indent=indent, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
