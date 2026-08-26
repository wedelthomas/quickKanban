# scripts/render-lib.sh
#
# Vendored composing template resolver. SOURCE ONLY — never executed directly.
# Provenance: github/spec-kit @ v0.12.8, scripts/bash/common.sh ::
#   resolve_template_content (fetched 2026-07-09). Kept as a pinned copy on
#   purpose: the preset overlays composition into 0.5.0-init'd projects whose
#   own common.sh has NO composing resolver. Re-verify against upstream on
#   every pin bump (docs/composition-migration.md §12).
#
# Local modifications vs upstream (only these):
#   1. Both `command -v python3` guards -> sdd_have_py (python3|python|py).
#   2. Both env-prefixed `python3 -c` calls -> `sdd_py -c`, with the env
#      assignments made explicit via `export` INSIDE the $( ) subshell.
#      sdd_py is a shell function; exporting inside the command-substitution
#      subshell makes the vars reach the python child unambiguously and does
#      not leak to the parent shell.
#   3. Generalized to also compose `.claude/commands/*.md`, not just
#      `.specify/templates/*.md` — the manifest schema already had
#      `type: "command"` entries (see preset.yml), they just weren't
#      resolved with a strategy before. `resolve_template_content` and the
#      new `resolve_command_content` are now thin wrappers around a shared
#      `_sdd_resolve_content` that takes the base dir and manifest `type`
#      as parameters. See docs/superpowers/specs/2026-07-28-multirepo-preset-architecture-design.md §4a.
#   4. Generalized a third time to compose `.github/agents/*.agent.md`
#      (Copilot CLI's equivalent of Claude's commands) via
#      `resolve_agent_content` — same shared `_sdd_resolve_content`, kind
#      `"agent"`. See docs/superpowers/specs/2026-08-06-copilot-composition-parity-design.md.
# Requires sdd_py (from _portable.sh) in scope.

# True (0) if some Python (python3 | python | py) is resolvable.
sdd_have_py() {
    command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 || command -v py >/dev/null 2>&1
}

resolve_template_content() {
    _sdd_resolve_content "$1" "$2" "template"
}

resolve_command_content() {
    _sdd_resolve_content "$1" "$2" "command"
}

resolve_agent_content() {
    _sdd_resolve_content "$1" "$2" "agent"
}

_sdd_resolve_content() {
    local template_name="$1"
    local repo_root="$2"
    local kind="$3"
    local base
    case "$kind" in
        template) base="$repo_root/.specify/templates" ;;
        command)  base="$repo_root/.claude/commands" ;;
        agent)    base="$repo_root/.github/agents" ;;
        *) echo "Error: unknown kind '$kind'" >&2; return 1 ;;
    esac
    local conv_subdir="${kind}s"  # templates -> "templates", command -> "commands"

    # Collect all layers (highest priority first)
    local -a layer_paths=()
    local -a layer_strategies=()

    # Priority 1: Project overrides (always "replace")
    local override="$base/overrides/${template_name}.md"
    if [ -f "$override" ]; then
        layer_paths+=("$override")
        layer_strategies+=("replace")
    fi

    # Priority 2: Installed presets (sorted by priority from .registry)
    local presets_dir="$repo_root/.specify/presets"
    if [ -d "$presets_dir" ]; then
        local registry_file="$presets_dir/.registry"
        local sorted_presets=""
        if [ -f "$registry_file" ] && sdd_have_py; then
            if sorted_presets=$(export SPECKIT_REGISTRY="$registry_file"; sdd_py -c "
import json, sys, os
try:
    with open(os.environ['SPECKIT_REGISTRY']) as f:
        data = json.load(f)
    presets = data.get('presets', {})
    for pid, meta in sorted(presets.items(), key=lambda x: x[1].get('priority', 10) if isinstance(x[1], dict) else 10):
        if isinstance(meta, dict) and meta.get('enabled', True) is not False:
            print(pid)
except Exception:
    sys.exit(1)
" 2>/dev/null); then
                if [ -n "$sorted_presets" ]; then
                    local yaml_warned=false
                    while IFS= read -r preset_id; do
                        # Read strategy and file path from preset manifest
                        local strategy="replace"
                        local manifest_file=""
                        local manifest="$presets_dir/$preset_id/preset.yml"
                        if [ -f "$manifest" ] && sdd_have_py; then
                            # Requires PyYAML; falls back to replace/convention if unavailable
                            local result
                            local py_stderr
                            py_stderr=$(mktemp)
                            result=$(export SPECKIT_MANIFEST="$manifest" SPECKIT_TMPL="$template_name" SPECKIT_KIND="$kind"; sdd_py -c "
import sys, os
try:
    import yaml
except ImportError:
    print('yaml_missing', file=sys.stderr)
    print('replace\t')
    sys.exit(0)
try:
    with open(os.environ['SPECKIT_MANIFEST']) as f:
        data = yaml.safe_load(f)
    for t in data.get('provides', {}).get('templates', []):
        if t.get('name') == os.environ['SPECKIT_TMPL'] and t.get('type', 'template') == os.environ['SPECKIT_KIND']:
            print(t.get('strategy', 'replace') + '\t' + t.get('file', ''))
            sys.exit(0)
    print('replace\t')
except Exception:
    print('replace\t')
" 2>"$py_stderr")
                            local parse_status=$?
                            if [ $parse_status -eq 0 ] && [ -n "$result" ]; then
                                IFS=$'\t' read -r strategy manifest_file <<< "$result"
                                strategy=$(printf '%s' "$strategy" | tr '[:upper:]' '[:lower:]')
                            fi
                            if [ "$yaml_warned" = false ] && grep -q 'yaml_missing' "$py_stderr" 2>/dev/null; then
                                echo "Warning: PyYAML not available; composition strategies may be ignored" >&2
                                yaml_warned=true
                            fi
                            rm -f "$py_stderr"
                        fi
                        # Try manifest file path first, then convention path
                        local candidate=""
                        if [ -n "$manifest_file" ]; then
                            # Reject absolute paths and parent traversal
                            case "$manifest_file" in
                                /*|*../*|../*) manifest_file="" ;;
                            esac
                        fi
                        if [ -n "$manifest_file" ]; then
                            local mf="$presets_dir/$preset_id/$manifest_file"
                            [ -f "$mf" ] && candidate="$mf"
                        fi
                        if [ -z "$candidate" ]; then
                            local cf="$presets_dir/$preset_id/$conv_subdir/${template_name}.md"
                            [ -f "$cf" ] && candidate="$cf"
                        fi
                        if [ -n "$candidate" ]; then
                            layer_paths+=("$candidate")
                            layer_strategies+=("$strategy")
                        fi
                    done <<< "$sorted_presets"
                fi
            else
                # python failed — fall back to unordered directory scan (replace only)
                for preset in "$presets_dir"/*/; do
                    [ -d "$preset" ] || continue
                    local candidate="$preset/$conv_subdir/${template_name}.md"
                    if [ -f "$candidate" ]; then
                        layer_paths+=("$candidate")
                        layer_strategies+=("replace")
                    fi
                done
            fi
        else
            # No python or registry — fall back to unordered directory scan (replace only)
            for preset in "$presets_dir"/*/; do
                [ -d "$preset" ] || continue
                local candidate="$preset/$conv_subdir/${template_name}.md"
                if [ -f "$candidate" ]; then
                    layer_paths+=("$candidate")
                    layer_strategies+=("replace")
                fi
            done
        fi
    fi

    # Priority 3: Extension-provided templates (always "replace")
    local ext_dir="$repo_root/.specify/extensions"
    if [ -d "$ext_dir" ]; then
        for ext in "$ext_dir"/*/; do
            [ -d "$ext" ] || continue
            case "$(basename "$ext")" in .*) continue;; esac
            local candidate="$ext/$conv_subdir/${template_name}.md"
            if [ -f "$candidate" ]; then
                layer_paths+=("$candidate")
                layer_strategies+=("replace")
            fi
        done
    fi

    # Priority 4: Core templates (always "replace")
    local core="$base/${template_name}.md"
    if [ -f "$core" ]; then
        layer_paths+=("$core")
        layer_strategies+=("replace")
    fi

    local count=${#layer_paths[@]}
    [ "$count" -eq 0 ] && return 1

    # Check if any layer uses a non-replace strategy
    local has_composition=false
    for s in "${layer_strategies[@]}"; do
        [ "$s" != "replace" ] && has_composition=true && break
    done

    # If the top (highest-priority) layer is replace, it wins entirely —
    # lower layers are irrelevant regardless of their strategies.
    if [ "${layer_strategies[0]}" = "replace" ]; then
        cat "${layer_paths[0]}"
        return 0
    fi

    if [ "$has_composition" = false ]; then
        cat "${layer_paths[0]}"
        return 0
    fi

    # Find the effective base: scan from highest priority (index 0) downward
    # to find the nearest replace layer. Only compose layers above that base.
    local base_idx=-1
    local i
    for (( i=0; i<count; i++ )); do
        if [ "${layer_strategies[$i]}" = "replace" ]; then
            base_idx=$i
            break
        fi
    done

    if [ $base_idx -lt 0 ]; then
        return 1  # no base layer found
    fi

    # Read the base content; compose layers above the base (higher priority)
    local content
    content=$(cat "${layer_paths[$base_idx]}"; printf x)
    content="${content%x}"

    for (( i=base_idx-1; i>=0; i-- )); do
        local path="${layer_paths[$i]}"
        local strat="${layer_strategies[$i]}"
        local layer_content
        # Preserve trailing newlines
        layer_content=$(cat "$path"; printf x)
        layer_content="${layer_content%x}"

        case "$strat" in
            replace) content="$layer_content" ;;
            prepend) content="$(printf '%s\n\n%s' "$layer_content" "$content")" ;;
            append)  content="$(printf '%s\n\n%s' "$content" "$layer_content")" ;;
            wrap)
                case "$layer_content" in
                    *'{CORE_TEMPLATE}'*) ;;
                    *) echo "Error: wrap strategy missing {CORE_TEMPLATE} placeholder" >&2; return 1 ;;
                esac
                while [[ "$layer_content" == *'{CORE_TEMPLATE}'* ]]; do
                    local before="${layer_content%%\{CORE_TEMPLATE\}*}"
                    local after="${layer_content#*\{CORE_TEMPLATE\}}"
                    layer_content="${before}${content}${after}"
                done
                content="$layer_content"
                ;;
            *) echo "Error: unknown strategy '$strat'" >&2; return 1 ;;
        esac
    done

    printf '%s' "$content"
    return 0
}
