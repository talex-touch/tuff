#!/usr/bin/env python3
"""Stage and commit the groups computed by propose-commit-groups.py, one commit per group.

Stops at the first failure (e.g. a pre-commit lint hook rejecting someone's WIP) instead of
forcing through, and never touches the fallback group. Pass --dry-run to preview.
"""

from __future__ import annotations

import importlib.util
import re
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent

spec = importlib.util.spec_from_file_location("propose", HERE / "propose-commit-groups.py")
propose = importlib.util.module_from_spec(spec)
spec.loader.exec_module(propose)

# base-anchor liquid work and the outline re-measure fix are interleaved in the same two
# files, so they cannot be split by path — commit them together, ahead of the docs regroup.
MERGE_INTO: dict[str, str] = {"G11-base-anchor-remeasure": "G6-base-anchor-liquid"}
MERGED_MESSAGE = {
    "G6-base-anchor-liquid": "feat(tuffex): add BaseAnchor liquid animation and re-measure outline after layout",
}
# Also interleaved: these docs carry both liquid content and the category regroup.
MOVE_PATHS: list[tuple[str, str]] = [
    (r"^apps/nexus/content/docs/dev/components/base-anchor\.(en|zh)\.mdc$", "G6-base-anchor-liquid"),
]
ORDER = [
    "G1-transport-identity",
    "G2-plugin-storage",
    "G3-plugin-views",
    "G4-permission-revocation",
    "G5-prelude-isolation",
    "G6-base-anchor-liquid",
    "G7-docs-taxonomy",
    "G8-flat-dropdown-docs",
    "G9-docs-hydration",
    "G10-visual-smoke",
    "G12-tooling",
    "G13-trellis-state",
]


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, check=check)


def build() -> tuple[dict[str, list[str]], dict[str, str]]:
    compiled = [(k, m, [re.compile(p) for p in pats]) for k, m, pats in propose.GROUPS]
    messages = {k: m for k, m, _ in propose.GROUPS}
    moves = [(re.compile(p), g) for p, g in MOVE_PATHS]

    groups: dict[str, list[str]] = defaultdict(list)
    for path in propose.dirty_paths():
        target = next((g for rx, g in moves if rx.search(path)), None)
        if target is None:
            hits = [k for k, _, pats in compiled if any(p.search(path) for p in pats)]
            target = hits[0] if hits else propose.FALLBACK[0]
        groups[MERGE_INTO.get(target, target)].append(path)

    messages.update(MERGED_MESSAGE)
    return groups, messages


def main() -> int:
    dry = "--dry-run" in sys.argv
    groups, messages = build()

    for key in ORDER:
        files = sorted(groups.get(key, []))
        if not files:
            print(f"-- {key}: nothing to commit")
            continue

        msg = messages[key]
        print(f"\n== {key}  ({len(files)} files)\n   {msg}")
        if dry:
            continue

        # `git reset` can exit non-zero merely for reporting unstaged changes, and may
        # transiently hit an index.lock left by the pre-commit hook.
        git("reset", check=False)
        add = subprocess.run(
            ["git", "add", "-A", "--pathspec-from-file=-"],
            cwd=REPO, input="\n".join(files), capture_output=True, text=True,
        )
        if add.returncode != 0:
            print(f"   STAGE FAILED: {add.stderr.strip()}")
            return 1

        if not git("diff", "--cached", "--quiet", check=False).returncode:
            print("   nothing staged (already committed?) — skipping")
            continue

        # The pre-commit hook runs its own `git add`, so index.lock can be briefly held.
        for attempt in range(5):
            commit = subprocess.run(
                ["git", "commit", "-m", msg], cwd=REPO, capture_output=True, text=True
            )
            if commit.returncode == 0 or "index.lock" not in (commit.stdout + commit.stderr):
                break
            print(f"   index.lock busy, retrying ({attempt + 1}/5)…")
            time.sleep(3)

        if commit.returncode != 0:
            print("   COMMIT FAILED — stopping so the failure can be inspected:")
            print((commit.stdout + commit.stderr)[-2500:])
            return 1
        print(f"   -> {git('rev-parse', '--short', 'HEAD').stdout.strip()}")

    left = sorted(groups.get(propose.FALLBACK[0], []))
    print(f"\nleft uncommitted on purpose ({len(left)}): {propose.FALLBACK[0]}")
    for f in left:
        print(f"  {f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
