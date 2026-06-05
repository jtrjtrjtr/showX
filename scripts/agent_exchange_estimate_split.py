#!/usr/bin/env python3
"""Pre-emptive 700-line task split advisory.

Reads YAML frontmatter from a task spec, checks estimated_size_lines.
If >= 700, prints subtask split suggestion based on target_files clustering.
This is a HEURISTIC — Architect decides whether to actually split.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

THRESHOLD = 700


def parse_frontmatter(text: str) -> dict[str, object]:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not m:
        return {}
    fm: dict[str, object] = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.strip().startswith("-"):
            k, _, v = line.partition(":")
            fm[k.strip()] = v.strip().strip('"')
    files = re.findall(r'^  - "([^"]+)"', m.group(1), re.MULTILINE)
    fm["target_files"] = files
    return fm


def suggest_split(fm: dict[str, object]) -> list[str]:
    files: list[str] = fm.get("target_files", [])  # type: ignore[assignment]
    groups: dict[str, list[str]] = {}
    for f in files:
        parts = f.split("/", 3)
        key = "/".join(parts[:3]) if len(parts) >= 3 else parts[0]
        groups.setdefault(key, []).append(f)
    suggestions = []
    for k, fs in groups.items():
        suggestions.append(f"  - subtask: {k} ({len(fs)} file(s))")
    return suggestions


def main(path: str) -> int:
    text = Path(path).read_text()
    fm = parse_frontmatter(text)
    est = int(str(fm.get("estimated_size_lines", "0")) or "0")
    task_id = fm.get("id", "?")
    if est < THRESHOLD:
        print(f"OK: {task_id} estimated {est} lines (< {THRESHOLD})")
        return 0
    print(f"WARN: {task_id} estimated {est} lines (>= {THRESHOLD}); consider splitting:")
    for s in suggest_split(fm):
        print(s)
    return 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: agent_exchange_estimate_split.py <task-spec-path>", file=sys.stderr)
        raise SystemExit(64)
    raise SystemExit(main(sys.argv[1]))
