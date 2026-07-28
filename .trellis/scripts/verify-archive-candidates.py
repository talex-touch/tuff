#!/usr/bin/env python3
"""Independently re-verify the archive candidates listed in report.md appendix 3.

The report itself flags that some of its data came from parallel sub-agents and was
never re-checked line by line. Archiving a task is a state mutation, so every claim is
re-derived here from the repository before anything is changed.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

TASKS = Path(__file__).resolve().parent.parent / "tasks"
REPO = Path(__file__).resolve().parent.parent.parent

# task dir -> list of (label, kind, argument) evidence checks
CANDIDATES: dict[str, list[tuple[str, str, str]]] = {
    # --- Group A: claimed already done ---
    "07-26-release-v2-4-13-stable": [
        ("tag v2.4.13 exists", "tag", "v2.4.13"),
        ("tag on origin", "remote_tag", "v2.4.13"),
    ],
    "07-26-release-v2-4-13-beta-23": [
        ("tag v2.4.13-beta.23 exists", "tag", "v2.4.13-beta.23"),
        ("tag on origin", "remote_tag", "v2.4.13-beta.23"),
    ],
    "07-26-batch-commit-project-changes": [
        ("commit 3414a9be8 reachable", "commit", "3414a9be8"),
    ],
    "07-21-07-20-align-published-release-gates": [
        ("tag v2.4.13-beta.19 exists", "tag", "v2.4.13-beta.19"),
    ],
    "07-17-unify-ota-provider-security": [
        ("commit 3175ba33a reachable", "commit", "3175ba33a"),
    ],
    "07-17-persist-ota-lifecycle": [
        ("migration 0028 present", "glob", "apps/core-app/**/0028*"),
    ],
    "07-17-unify-ota-install-recovery": [
        ("quit-intent.ts present", "glob", "apps/core-app/**/quit-intent.ts"),
    ],
    "07-17-ota-ui-release-acceptance": [
        ("SettingHeader.vue present", "glob", "apps/core-app/**/SettingHeader.vue"),
    ],
    # --- Group B: delivery in repo, ACs never ticked ---
    "07-17-widget-sandbox-completion": [
        ("widget-sandbox-policy.ts present", "glob", "**/widget-sandbox-policy.ts"),
        ("commit a0c628289 reachable", "commit", "a0c628289"),
    ],
    "07-13-catalog-service-mvp": [
        ("commit cd8dbc7b7 reachable", "commit", "cd8dbc7b7"),
    ],
    "07-26-install-launch-v2-4-13-beta-23": [
        ("installed app present", "path", "/Applications/Tuff.app"),
        ("backup dir non-empty", "nonempty_dir", "~/Applications/Tuff-backups"),
    ],
    # --- Group D: deliberately downgraded to backlog ---
    "07-27-expose-plugin-search-sdk": [
        ("design.md removed", "absent", ".trellis/tasks/07-27-expose-plugin-search-sdk/design.md"),
    ],
}


def sh(*args: str) -> tuple[int, str]:
    p = subprocess.run(args, cwd=REPO, capture_output=True, text=True)
    return p.returncode, (p.stdout + p.stderr).strip()


def check(kind: str, arg: str) -> bool:
    if kind == "tag":
        code, out = sh("git", "tag", "-l", arg)
        return code == 0 and out.strip() == arg
    if kind == "remote_tag":
        code, out = sh("git", "ls-remote", "--tags", "origin", f"refs/tags/{arg}")
        return code == 0 and arg in out
    if kind == "commit":
        code, _ = sh("git", "merge-base", "--is-ancestor", arg, "HEAD")
        return code == 0
    if kind == "glob":
        return any(REPO.glob(arg))
    if kind == "path":
        return Path(arg).expanduser().exists()
    if kind == "nonempty_dir":
        d = Path(arg).expanduser()
        return d.is_dir() and any(d.iterdir())
    if kind == "absent":
        return not (REPO / arg).exists()
    raise SystemExit(f"unknown check kind: {kind}")


def ac_counts(task_dir: Path) -> tuple[int, int]:
    prd = task_dir / "prd.md"
    if not prd.exists():
        return (0, 0)
    text = prd.read_text(encoding="utf-8", errors="ignore")
    done = len(re.findall(r"^\s*[-*]\s*\[x\]", text, re.M | re.I))
    todo = len(re.findall(r"^\s*[-*]\s*\[ \]", text, re.M))
    return (done, done + todo)


def main() -> int:
    print(f"{'task':<45} {'status':<12} {'AC':<8} evidence")
    print("-" * 100)
    verdicts: dict[str, bool] = {}

    for name, checks in CANDIDATES.items():
        d = TASKS / name
        if not d.exists():
            print(f"{name:<45} {'MISSING DIR':<12}")
            verdicts[name] = False
            continue

        status = json.loads((d / "task.json").read_text(encoding="utf-8")).get("status", "?")
        done, total = ac_counts(d)

        results = [(label, check(kind, arg)) for label, kind, arg in checks]
        all_ok = all(ok for _, ok in results)
        verdicts[name] = all_ok
        detail = "  ".join(f"{'OK' if ok else 'FAIL'}:{label}" for label, ok in results)
        print(f"{name:<45} {status:<12} {f'{done}/{total}':<8} {detail}")

    print()
    ready = [n for n, ok in verdicts.items() if ok]
    blocked = [n for n, ok in verdicts.items() if not ok]
    print(f"evidence fully confirmed ({len(ready)}): {ready}")
    print(f"evidence incomplete   ({len(blocked)}): {blocked}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
