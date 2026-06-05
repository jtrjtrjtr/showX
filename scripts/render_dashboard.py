#!/usr/bin/env python3
"""Render docs/agent_exchange/TASK_DASHBOARD.md from state.json + scope + bundles."""
from __future__ import annotations
import json
from pathlib import Path
from datetime import datetime, timezone

REPO_ROOT = Path(__file__).resolve().parents[1]
AE = REPO_ROOT / "docs" / "agent_exchange"


def load_json(p: Path) -> dict:
    if not p.exists():
        return {}
    return json.loads(p.read_text())


def render() -> str:
    state = load_json(AE / "state.json")
    scope = load_json(AE / "claude_runner_scope.json")
    tasks: list[dict] = state.get("tasks", [])

    counts: dict[str, int] = {}
    for t in tasks:
        s = t["status"]
        counts[s] = counts.get(s, 0) + 1

    open_bundle = next(
        (
            b
            for b in state.get("bundles", [])
            if b.get("status") in ("planning", "in_progress", "review")
        ),
        None,
    )

    lines: list[str] = []
    lines.append("# ShowX Task Dashboard")
    lines.append("")
    lines.append(f"_Last rendered: {datetime.now(timezone.utc).isoformat(timespec='seconds')}_")
    lines.append("")
    lines.append("## Status counts")
    lines.append("")
    lines.append("| Status | Count |")
    lines.append("|---|---|")
    for status in [
        "queued",
        "in_progress",
        "done",
        "reviewing",
        "changes_requested",
        "blocked",
        "accepted",
    ]:
        lines.append(f"| {status} | {counts.get(status, 0)} |")
    lines.append("")

    lines.append("## Open bundle")
    lines.append("")
    if open_bundle:
        lines.append(
            f"- **{open_bundle.get('bundle_id')}** — {open_bundle.get('title')} ({open_bundle.get('status')})"
        )
        lines.append(f"- Tasks: {', '.join(open_bundle.get('tasks', []))}")
    else:
        lines.append(f"- Active bundle from scope: **{scope.get('bundle_id', '—')}**")
    lines.append("")

    lines.append("## Forge bandwidth")
    lines.append("")
    lines.append(f"- enabled: {scope.get('enabled', False)}")
    lines.append(f"- bundle: {scope.get('bundle_id', '—')}")
    allowed = ", ".join(scope.get("allowed_task_ids", [])) or "—"
    lines.append(f"- allowed_task_ids: {allowed}")
    lines.append("")

    lines.append("## Tasks")
    lines.append("")
    lines.append("| ID | Status | Title |")
    lines.append("|---|---|---|")
    for t in sorted(tasks, key=lambda x: x.get("id", "")):
        lines.append(f"| {t.get('id', '')} | {t.get('status', '')} | {t.get('title', '')} |")
    lines.append("")

    return "\n".join(lines)


def main() -> int:
    out = AE / "TASK_DASHBOARD.md"
    out.write_text(render())
    print(f"Dashboard written to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
