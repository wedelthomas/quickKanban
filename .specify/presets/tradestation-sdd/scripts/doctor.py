#!/usr/bin/env python3
"""SDD setup doctor — verify a developer's AI-tool + portal-telemetry setup.

Works for both Claude Code and GitHub Copilot CLI. The --tool flag selects which
tool's config the model/effort/superpowers checks (R1/R2/R3) read and how the
preset check (R6) is detected; when omitted it is auto-detected from the
project's install layout (.github/agents/ → copilot, .claude/commands/ → claude).

Usage:
  doctor.py [--json] [--tool claude|copilot] [--project PATH]   full report
  doctor.py --preflight [--tool ...] [--project PATH]  fast, throttled, advisory

Exit code: non-zero if any hard config check (R1,R2,R3,R5,R6,R8,R10,R11) fails.
--preflight always exits 0 (advisory; never blocks the workflow).
"""
import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
HOME = Path.home()
THROTTLE_HOURS_DEFAULT = 24

PASS, FAIL, WARN, INFO = "PASS", "FAIL", "WARN", "INFO"
HARD_IDS = ("R1", "R2", "R3", "R5", "R6", "R8", "R10", "R11")


def _read_json(path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return None


def _merged_settings(project):
    """Claude Code settings: project-local wins over project over user.

    Shallow (top-level-key) merge — a later file replaces a whole top-level
    key rather than deep-merging nested dicts. Sufficient for the keys we
    check; not full Claude Code merge fidelity.
    """
    merged = {}
    for p in (HOME / ".claude" / "settings.json",
              project / ".claude" / "settings.json",
              project / ".claude" / "settings.local.json"):
        data = _read_json(p)
        if isinstance(data, dict):
            merged.update(data)
    return merged


def _copilot_settings(project):
    """Copilot CLI settings — single global file at ~/.copilot/settings.json.

    Copilot has no project-local settings merge the way Claude Code does; the
    persisted user config (model, effortLevel) lives in one file.
    """
    data = _read_json(HOME / ".copilot" / "settings.json")
    return data if isinstance(data, dict) else {}


def _settings_for(tool, project):
    if tool == "copilot":
        return _copilot_settings(project)
    return _merged_settings(project)


def _copilot_has_superpowers():
    """True if a superpowers plugin/skill is installed for Copilot CLI.

    Copilot plugins expose their skills under ~/.copilot/skills/; a superpowers
    install lands a directory whose name contains 'superpowers'.
    """
    skills = HOME / ".copilot" / "skills"
    try:
        return any("superpower" in p.name.lower() for p in skills.iterdir())
    except OSError:
        return False


def _claude_command_count(project):
    """Count installed SDD command files in .claude/commands/.

    Counts our symlinks (target points into the preset) and — for the Windows
    fallback where install copies instead of symlinking — plain .md files.
    """
    cmd_dir = Path(project) / ".claude" / "commands"
    if not cmd_dir.is_dir():
        return 0
    n = 0
    for f in cmd_dir.glob("speckit.*.md"):
        try:
            if f.is_symlink():
                if "tradestation-sdd" in os.readlink(f):
                    n += 1
            elif f.is_file():
                n += 1
        except OSError:
            pass
    return n


def detect_tool(project):
    """Infer the AI tool from the project's install layout.

    Copilot installs SDD agents into .github/agents/; Claude Code symlinks
    commands into .claude/commands/. Defaults to 'claude' when neither (or
    both) is present, preserving the original Claude-only behavior.
    """
    project = Path(project)
    agents = project / ".github" / "agents"
    has_agents = agents.is_dir() and any(agents.glob("speckit.*.agent.md"))
    has_cmds = _claude_command_count(project) > 0
    if has_agents and not has_cmds:
        return "copilot"
    return "claude"


def _result(rid, label, status, detail, fix=None):
    return {"id": rid, "label": label, "status": status, "detail": detail, "fix": fix}


# Minimum Opus version per tool (major, minor). Copilot lags Claude Code's
# model rollout, so its floor is lower.
OPUS_MIN = {"claude": (4, 8), "copilot": (4, 6)}


def _opus_version(model):
    """Return (major, minor) for an explicit Opus model id, else None.

    Handles both separator styles — Claude Code's `claude-opus-4-8` and
    Copilot's `claude-opus-4.6`. The bare `opus[1m]` / `opus` alias carries no
    explicit version (the `1m` is a context-window marker, not a version) and
    returns None; callers handle that alias separately.
    """
    if not isinstance(model, str) or "opus" not in model.lower():
        return None
    m = re.search(r"opus[^0-9]*?(\d+)[.\-](\d+)", model.lower())
    return (int(m.group(1)), int(m.group(2))) if m else None


def check_model(s, tool="claude"):
    val = s.get("model")
    ver = _opus_version(val)
    if tool == "copilot":
        floor = OPUS_MIN["copilot"]
        if ver and ver >= floor:
            return _result("R1", "Model (Opus ≥ 4.6)", PASS, val)
        return _result("R1", "Model (Opus ≥ 4.6)", FAIL, repr(val) if val else "not set",
                       'Set "model" to claude-opus-4.6 or later in '
                       "~/.copilot/settings.json (or pick it with /model in Copilot CLI)")
    # Claude Code: the recommended `opus[1m]` alias tracks the latest Opus
    # (≥ 4.8); an explicitly pinned id must be Opus 4.8 or later.
    floor = OPUS_MIN["claude"]
    if val == "opus[1m]":
        return _result("R1", "Model (Opus ≥ 4.8)", PASS, "opus[1m]")
    if ver and ver >= floor:
        return _result("R1", "Model (Opus ≥ 4.8)", PASS, val)
    return _result("R1", "Model (Opus ≥ 4.8)", FAIL, repr(val) if val else "not set",
                   'Set "model": "opus[1m]" in ~/.claude/settings.json (Opus 4.8 or later)')


def check_effort(s, tool="claude"):
    val = s.get("effortLevel")
    if val == "high":
        return _result("R2", "Effort high", PASS, "high")
    settings_file = "~/.copilot/settings.json" if tool == "copilot" else "~/.claude/settings.json"
    extra = " (or run /effort high in Copilot CLI)" if tool == "copilot" else ""
    return _result("R2", "Effort high", FAIL, repr(val) if val else "not set",
                   f'Set "effortLevel": "high" in {settings_file}{extra}')


def check_superpowers(s, project=None, tool="claude"):
    if tool == "copilot":
        if _copilot_has_superpowers():
            return _result("R3", "Superpowers enabled", PASS, "plugin installed")
        return _result("R3", "Superpowers enabled", FAIL, "not installed",
                       "Install the superpowers plugin for Copilot CLI: "
                       "`copilot plugin install <source>` (browse with "
                       "`copilot plugin marketplace browse`) — it provides the "
                       "SDD discipline skills (TDD, debugging, brainstorming)")
    plugins = s.get("enabledPlugins")
    # `is True`: require the JSON boolean true, not a truthy value like "true"/1.
    ok = isinstance(plugins, dict) and plugins.get("superpowers@claude-plugins-official") is True
    if ok:
        return _result("R3", "Superpowers enabled", PASS, "enabled")
    return _result("R3", "Superpowers enabled", FAIL, "not enabled",
                   'Add "superpowers@claude-plugins-official": true to "enabledPlugins" '
                   "in ~/.claude/settings.json")


def _specify_available():
    """True if the `specify` CLI is resolvable on PATH.

    Uses shutil.which (PATHEXT-aware on Windows; no process spawn) instead of
    running `specify version`: that subcommand makes a GitHub API call, so under
    the old `subprocess.run(..., timeout=10)` a slow network could time out and
    false-report the CLI as missing. Presence on PATH is the right signal for
    "is spec-kit's CLI installed", and shutil.which is instant and cross-platform.
    """
    return shutil.which("specify") is not None


def _find_constitution(project):
    skip = {".git", "node_modules", ".next", ".venv", "__pycache__"}
    try:
        for p in Path(project).rglob("constitution.md"):
            if not any(part in skip for part in p.parts):
                return p
    except OSError:
        pass
    return None


def check_speckit(project, tool="claude"):
    has_cli = _specify_available()
    const = _find_constitution(project)
    if has_cli and const:
        return _result("R5", "Spec-Kit initialized", PASS, "specify CLI + constitution.md")
    missing = []
    if not has_cli:
        missing.append("specify CLI")
    if not const:
        missing.append("constitution.md")
    ai = "copilot" if tool == "copilot" else "claude"
    const_cmd = "speckit.constitution" if tool == "copilot" else "/speckit.constitution"
    return _result(
        "R5", "Spec-Kit initialized", FAIL, "missing: " + ", ".join(missing),
        "uv tool install specify-cli --from "
        "git+https://github.com/github/spec-kit.git@v0.12.8 "
        f"; then: specify init . --integration {ai} && {const_cmd}")


def check_preset(project, tool="claude"):
    project = Path(project)
    base = project / ".specify" / "presets" / "tradestation-sdd"
    registry = _read_json(project / ".specify" / "presets" / ".registry")
    has_dir = base.is_dir()
    has_reg = isinstance(registry, dict) and "tradestation-sdd" in (registry.get("presets") or {})
    clone_fix = ("git clone git@gitlab.com:tradestation/brokerage-services/ai-poc-projects/"
                 "spec-kit/sdd-preset.git ~/sdd-preset && bash ~/sdd-preset/install.sh .")

    if tool == "copilot":
        # Copilot installs SDD agents into .github/agents/ (no symlinks).
        agents_dir = project / ".github" / "agents"
        agents = len(list(agents_dir.glob("speckit.*.agent.md"))) if agents_dir.is_dir() else 0
        if has_dir and has_reg and agents >= 10:
            return _result("R6", "Preset installed", PASS, f"{agents} agent files")
        return _result(
            "R6", "Preset installed", FAIL,
            f"dir={has_dir} registry={has_reg} agents={agents}",
            clone_fix + " --ai copilot")

    links = _claude_command_count(project)
    if has_dir and has_reg and links >= 10:
        return _result("R6", "Preset installed", PASS, f"{links} command files")
    return _result(
        "R6", "Preset installed", FAIL,
        f"dir={has_dir} registry={has_reg} commands={links}",
        clone_fix)


def _load_pf():
    """Import the sibling post-feedback.py (hyphenated filename) so the doctor
    reuses one source of truth for the token path, portal base, and HTTP."""
    spec = importlib.util.spec_from_file_location(
        "sdd_post_feedback", str(SCRIPT_DIR / "post-feedback.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def check_telemetry(pf):
    """Check portal-telemetry auth. `pf` is the module returned by _load_pf()."""
    AUTH_FIX = ("bash .specify/presets/tradestation-sdd/scripts/"
                "post-feedback.sh --auth")
    if pf.telemetry_disabled():
        return _result("R7", "Portal telemetry", INFO, "SDD_TELEMETRY_DISABLE=1 (off)")
    base = pf.portal_base()
    token = pf.load_token(base)
    if not token:
        return _result("R7", "Portal telemetry", WARN, "not authenticated", AUTH_FIX)
    headers = {"Authorization": "Bearer " + token}
    try:
        status, body = pf._http_request("GET", base + "/api/telemetry/status", headers, None)
    except (urllib.error.URLError, OSError):
        return _result("R7", "Portal telemetry", WARN, "portal unreachable (will retry later)")
    if status == 401:
        return _result("R7", "Portal telemetry", WARN, "token expired", AUTH_FIX)
    if status != 200:
        return _result("R7", "Portal telemetry", WARN, f"unexpected status {status}")
    try:
        data = json.loads(body)
    except ValueError:
        data = {}
    email = data.get("userEmail") or "authenticated"
    count = data.get("submissionCount", 0)
    if count:
        last = data.get("lastSubmissionAt") or "unknown"
        return _result("R7", "Portal telemetry", PASS,
                       f"{email} — {count} submissions, last {last}")
    return _result(
        "R7", "Portal telemetry", PASS,
        f"{email} — authenticated; no telemetry sent yet "
        "(flows on first /speckit.feedback)")


def _resolve_python():
    """Mirror _portable.sh:sdd_py resolution (python3 -> python -> py -3) without
    spawning the bash function. Returns an argv prefix list, or None if none found."""
    for name in ("python3", "python"):
        found = shutil.which(name)
        if found:
            return [found]
    if shutil.which("py"):
        return ["py", "-3"]
    return None


def check_composition_deps():
    """R8 (blocking): the Python render-template.sh will use must import yaml.

    Composition silently degrades to replace-only without PyYAML; this converts
    that into a loud, actionable stop.
    """
    fix = ("Install PyYAML for the Python your shell uses: "
           "python3 -m pip install pyyaml (or py -3 -m pip install pyyaml on Windows)")
    py = _resolve_python()
    if py is None:
        return _result("R8", "Composition deps (PyYAML)", FAIL, "no python found", fix)
    try:
        r = subprocess.run(py + ["-c", "import yaml"], capture_output=True, timeout=10)
    except (OSError, subprocess.SubprocessError) as e:
        return _result("R8", "Composition deps (PyYAML)", FAIL, f"{py[0]}: {e}", fix)
    if r.returncode == 0:
        return _result("R8", "Composition deps (PyYAML)", PASS, f"{py[0]} + PyYAML")
    return _result("R8", "Composition deps (PyYAML)", FAIL, f"{py[0]}: PyYAML missing", fix)


AO_MANDATORY_MARKERS = (
    "security-first",
    "integration-anti-patterns",
    "data-protection",
    "quality-gates",
)


def check_ao_markers(project):
    """R10 (blocking): the fully-resolved constitution.md must retain every
    AO-mandated section, regardless of which preset(s) composed it or what
    strategy they used. A `replace`-strategy layer (any capability preset,
    or a team's bundle) that drops one fails this loudly at install/resolve
    time instead of silently shipping. See docs/superpowers/specs/
    2026-07-28-multirepo-preset-architecture-design.md §4b.
    """
    constitution = _find_constitution(project)
    if constitution is None:
        return _result(
            "R10", "AO governance markers", INFO,
            "no constitution.md found yet — nothing to check "
            "(run /speckit.constitution first)",
        )
    text = constitution.read_text(encoding="utf-8")
    missing = [
        marker for marker in AO_MANDATORY_MARKERS
        if f"<!-- AO-MANDATORY: {marker} -->" not in text
    ]
    if missing:
        return _result(
            "R10", "AO governance markers", FAIL,
            "missing required AO section(s): " + ", ".join(missing)
            + " — a replace-strategy layer likely dropped them; use "
            "append/wrap instead, or explicitly restate the section",
        )
    return _result("R10", "AO governance markers", PASS, "all AO-mandated sections present")


FEEDBACK_HOOK_COMMANDS = (
    "analyze", "checklist", "plan", "review", "constitution",
    "implement", "verify-spec", "specify", "tasks",
)  # deliberately excludes "doctor" (states outright it never auto-invokes
   # feedback -- a setup check, not a workflow phase) and "feedback" itself
   # (the target of every other hook, not itself hook-bearing).

FEEDBACK_MARKER = "feedback"


def check_feedback_markers(project):
    """R11 (blocking): every installed command/agent that should carry the
    mandatory feedback-trigger hook must retain its AO-MANDATORY marker,
    regardless of which preset(s) composed it or what strategy they used.
    Mirrors R10's philosophy (a replace-strategy layer that drops it fails
    loudly at install/resolve time) but scans two directories of files
    instead of one. See docs/superpowers/specs/
    2026-08-06-feedback-governance-design.md.
    """
    claude_dir = Path(project) / ".claude" / "commands"
    copilot_dir = Path(project) / ".github" / "agents"
    marker_str = f"<!-- AO-MANDATORY: {FEEDBACK_MARKER} -->"

    missing = []
    checked_any = False

    if claude_dir.is_dir():
        for name in FEEDBACK_HOOK_COMMANDS:
            f = claude_dir / f"speckit.{name}.md"
            if not f.is_file():
                continue
            checked_any = True
            if marker_str not in f.read_text(encoding="utf-8"):
                missing.append(f.name)

    if copilot_dir.is_dir():
        for name in FEEDBACK_HOOK_COMMANDS:
            f = copilot_dir / f"speckit.{name}.agent.md"
            if not f.is_file():
                continue
            checked_any = True
            if marker_str not in f.read_text(encoding="utf-8"):
                missing.append(f.name)

    if not checked_any:
        return _result(
            "R11", "Feedback governance markers", INFO,
            "no installed commands/agents found yet — nothing to check",
        )
    if missing:
        return _result(
            "R11", "Feedback governance markers", FAIL,
            "missing required feedback marker in: " + ", ".join(missing)
            + " — a replace-strategy layer likely dropped it; use "
            "append/wrap instead, or explicitly restate the section",
        )
    return _result("R11", "Feedback governance markers", PASS,
                    "all feedback-mandated commands/agents present")


def check_replace_conflicts(project):
    """R12 (advisory): warn when two or more installed capability presets
    both claim strategy: "replace" on the same target file.

    render-lib.sh's `replace` strategy is a whole-file substitution with no
    error on collision -- whichever preset resolves with the highest
    priority (generally, whichever was installed most recently) silently
    wins that file, discarding the other preset's content. `append` /
    `prepend` / `wrap` stack fine; only two-or-more `replace` claims on the
    same file are a real conflict. This scans each installed preset's own
    copy of preset.yml (add-preset.sh copies the whole preset directory
    into .specify/presets/<id>/, so no source-clone lookup is needed) --
    a structural, install-time signal rather than the after-the-fact
    missing-content symptom R10/R11 catch for specific mandated sections.
    """
    presets_dir = Path(project) / ".specify" / "presets"
    registry = _read_json(presets_dir / ".registry") or {}
    installed = registry.get("presets") or {}
    if not installed:
        return _result("R12", "Replace-strategy conflicts", INFO,
                       "no capability presets installed — nothing to check")

    try:
        import yaml
    except ImportError:
        return _result("R12", "Replace-strategy conflicts", INFO,
                       "PyYAML unavailable to this python3 — skipped")

    by_file = {}
    for pid in installed:
        manifest = presets_dir / pid / "preset.yml"
        if not manifest.is_file():
            continue
        try:
            data = yaml.safe_load(manifest.read_text(encoding="utf-8")) or {}
        except (OSError, yaml.YAMLError):
            continue
        for entries in (data.get("provides") or {}).values():
            if not isinstance(entries, list):
                continue
            for entry in entries:
                if isinstance(entry, dict) and entry.get("strategy") == "replace":
                    f = entry.get("file")
                    if f:
                        by_file.setdefault(f, set()).add(pid)

    conflicts = {f: ps for f, ps in by_file.items() if len(ps) > 1}
    if not conflicts:
        return _result("R12", "Replace-strategy conflicts", PASS,
                       "no two installed presets both replace the same file")
    detail = "; ".join(f"{f} <- {', '.join(sorted(ps))}"
                       for f, ps in sorted(conflicts.items()))
    return _result(
        "R12", "Replace-strategy conflicts", WARN, detail,
        "Whichever of these presets resolves with the higher priority "
        "(generally, whichever was installed most recently) silently wins "
        "that file's full content at compose time, discarding the "
        "other's. Review both presets' preset.yml and either drop one's "
        "replace claim (append/prepend/wrap it instead, if that's enough "
        "to express its content) or accept this precedence deliberately.",
    )


TARGET_CLI = (0, 12, 8)


def _speckit_cli_version():
    """Installed spec-kit CLI version as (maj,min,patch) from `uv tool list`, or None.
    Offline; mirrors _portable.sh:sdd_speckit_version (never runs `specify version`)."""
    if not shutil.which("uv"):
        return None
    try:
        out = subprocess.run(["uv", "tool", "list"], capture_output=True,
                             text=True, timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    m = re.search(r"^specify-cli\s+v?(\d+)\.(\d+)\.(\d+)", out, re.M | re.I)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def check_cli_version():
    """R9 (advisory, NON-BLOCKING): nudge toward the target CLI pin v0.12.8.

    Composition is CLI-independent, so an old CLI is never a hard failure — this
    only surfaces the opt-in migrate-cli.sh upgrade.
    """
    ver = _speckit_cli_version()
    if ver is None:
        return _result("R9", "CLI version (target v0.12.8)", INFO,
                       "could not determine (uv or specify-cli absent)")
    vs = ".".join(map(str, ver))
    if ver >= TARGET_CLI:
        return _result("R9", "CLI version (target v0.12.8)", PASS, vs)
    return _result("R9", "CLI version (target v0.12.8)", WARN, f"{vs} (below target)",
                   "Optional: bash scripts/migrate-cli.sh "
                   "(opt-in upgrade to v0.12.8; one-command rollback)")


def run_checks(project, pf=None, tool=None):
    tool = tool or detect_tool(project)
    s = _settings_for(tool, Path(project))
    pf = pf or _load_pf()
    return [
        check_model(s, tool),
        check_effort(s, tool),
        check_superpowers(s, project, tool),
        check_speckit(project, tool),
        check_preset(project, tool),
        check_composition_deps(),
        check_ao_markers(project),
        check_feedback_markers(project),
        check_replace_conflicts(project),
        check_cli_version(),
        check_telemetry(pf),
    ]


def summarize(checks):
    hard = [c for c in checks if c["id"] in HARD_IDS]
    passed = sum(1 for c in hard if c["status"] == PASS)
    warnings = sum(1 for c in checks if c["status"] == WARN)
    return {"hard_passed": passed, "hard_total": len(hard), "warnings": warnings}


def _has_hard_fail(checks):
    return any(c["id"] in HARD_IDS and c["status"] == FAIL for c in checks)


def render_human(checks):
    lines = []
    for c in checks:
        lines.append(f"[{c['status']:>4}] {c['id']} {c['label']}: {c['detail']}")
        if c["fix"] and c["status"] in (FAIL, WARN):
            lines.append(f"        fix: {c['fix']}")
    s = summarize(checks)
    lines += ["", f"{s['hard_passed']}/{s['hard_total']} passed, {s['warnings']} warning(s)."]
    return "\n".join(lines)


def _meta_path(project):
    return Path(project) / ".specify" / "presets" / "tradestation-sdd" / ".install-meta.json"


def _throttle_hours():
    raw = os.environ.get("SDD_DOCTOR_WINDOW_HOURS", "")
    return int(raw) if raw.isdigit() else THROTTLE_HOURS_DEFAULT


def _preflight_throttled(project):
    if os.environ.get("SDD_DOCTOR_DISABLE") == "1":
        return True
    meta = _read_json(_meta_path(project)) or {}
    try:
        last = float(meta.get("doctor_last_check", 0))
    except (TypeError, ValueError):
        last = 0
    return (time.time() - last) < _throttle_hours() * 3600


def _mark_preflight(project):
    p = _meta_path(project)
    meta = _read_json(p) or {}
    meta["doctor_last_check"] = int(time.time())
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(meta, indent=2))
    except OSError:
        pass


def render_failures_only(checks):
    bad = [c for c in checks if c["status"] in (FAIL, WARN)]
    if not bad:
        return ""
    lines = ["SDD setup issues (advisory — continuing):"]
    for c in bad:
        lines.append(f"  [{c['status']}] {c['id']} {c['label']}: {c['detail']}")
        if c["fix"]:
            lines.append(f"        fix: {c['fix']}")
    return "\n".join(lines)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--preflight", action="store_true")
    ap.add_argument("--project", default=".")
    ap.add_argument("--tool", choices=("claude", "copilot"), default=None,
                    help="AI tool context; auto-detected from install layout if omitted")
    args = ap.parse_args(argv[1:])
    project = Path(args.project).resolve()
    tool = args.tool or detect_tool(project)

    if args.preflight:
        if _preflight_throttled(project):
            return 0
        checks = run_checks(project, tool=tool)
        _mark_preflight(project)
        out = render_failures_only(checks)
        if out:
            print(out)
        return 0  # advisory: never blocks

    checks = run_checks(project, tool=tool)
    if args.json:
        tool_label = "copilot-cli" if tool == "copilot" else "claude-code"
        print(json.dumps({"tool": tool_label, "checks": checks, **summarize(checks)}, indent=2))
    else:
        print(render_human(checks))
    return 1 if _has_hard_fail(checks) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
