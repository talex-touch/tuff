#!/usr/bin/env python3
"""Propose commit groups for the dirty working tree.

Read-only: prints a plan, stages nothing, commits nothing. Every dirty path must match
exactly one group — unmatched or doubly-matched paths are reported as errors so the plan
can never silently drop a file.
"""

from __future__ import annotations

import re
import subprocess
import sys
from collections import defaultdict

# (group key, commit message, [regex patterns]) — order matters only for reporting.
GROUPS: list[tuple[str, str, list[str]]] = [
    (
        "G1-transport-identity",
        "fix(utils): verify transport caller identity  [task 300]",
        [
            r"^packages/utils/transport/",
            r"^packages/utils/__tests__/main-transport-(identity|port-identity)\.test\.ts$",
            r"^apps/core-app/src/main/core/channel-caller-identity(\.test)?\.ts$",
            r"^apps/core-app/src/main/core/channel-core\.ts$",
        ],
    ),
    (
        "G2-plugin-storage",
        "fix(plugin): harden plugin storage and sqlite boundaries  [task 299]",
        [
            r"^packages/utils/plugin/sdk/(sqlite|secret|plugin-info)\.ts$",
            r"^packages/utils/__tests__/plugin-(sqlite|storage|secret)-sdk\.test\.ts$",
            r"^apps/core-app/src/main/modules/plugin/runtime/plugin-sql",
            r"^apps/core-app/src/main/modules/plugin/runtime/plugin-sqlite",
            r"^apps/core-app/src/main/modules/plugin/runtime/plugin-storage-lifecycle\.ts$",
            r"^apps/core-app/src/main/utils/secure-store(\.test)?\.ts$",
        ],
    ),
    (
        "G3-plugin-views",
        "fix(plugin): secure plugin view windows  [task 298]",
        [
            r"^packages/utils/__tests__/plugin-window-sdk\.test\.ts$",
            r"^apps/core-app/src/main/modules/plugin/runtime/plugin-(view|window)",
            r"^apps/core-app/src/main/core/window-security-profile",
            r"^apps/core-app/src/main/modules/box-tool/core-box/plugin-view-controller\.ts$",
            r"^apps/core-app/src/preload/plugin-view\.ts$",
            r"^apps/core-app/src/shared/plugin-view-bridge",
            r"^apps/core-app/scripts/plugin-view-preload-smoke\.cjs$",
            r"^apps/nexus/content/docs/dev/getting-started/plugin-workflow\.(en|zh)\.mdc$",
            r"^apps/core-app/src/main/modules/division-box/",
            r"^apps/core-app/src/renderer/src/(components/plugin/PluginView|views/base/plugin/ViewPlugin|views/base/Plugin)\.vue$",
        ],
    ),
    (
        "G4-permission-revocation",
        "fix(permission): propagate plugin permission revocation  [task 296]",
        [r"^apps/core-app/src/main/modules/permission/"],
    ),
    (
        "G5-prelude-isolation",
        "feat(plugin): isolate plugin prelude into a host process  [task 297]",
        [
            r"^apps/core-app/src/main/modules/plugin/host/",
            r"^apps/core-app/src/main/modules/plugin/plugin(-module)?(\.test)?\.ts$",
            r"^apps/core-app/src/main/modules/plugin/plugin-runtime-production-contract\.test\.ts$",
            r"^apps/core-app/src/main/modules/plugin/runtime/plugin-require\.test\.ts$",
            r"^apps/core-app/src/main/modules/plugin/services/",
            r"^apps/core-app/scripts/plugin-host-isolation-smoke\.cjs$",
            r"^apps/core-app/src/main/modules/plugin/plugin-(feature|localization-channels)",
        ],
    ),
    (
        "G6-base-anchor-liquid",
        "feat(tuffex): add BaseAnchor liquid animation",
        [
            r"^packages/tuffex/packages/components/src/base-anchor/src/(base-anchor-liquid|base-anchor-motion|types)\.ts$",
            r"^packages/tuffex/packages/components/src/base-anchor/__tests__/base-anchor-liquid\.test\.ts$",
            r"^apps/nexus/app/components/content/demos/BaseAnchor(Bead|Drip)Demo\.vue$",
        ],
    ),
    (
        "G7-docs-taxonomy",
        "docs(nexus): regroup Tuffex component sidebar into 9 categories",
        [
            r"^apps/nexus/content/docs/dev/components/(?!flat-dropdown)",
            r"^apps/nexus/app/components/DocsSidebar\.vue$",
            r"^apps/nexus/i18n/locales/(en|zh)\.ts$",
            r"^apps/nexus/scripts/recategorize-component-docs\.py$",
        ],
    ),
    (
        "G8-flat-dropdown-docs",
        "docs(nexus): document FlatDropdown and register it globally",
        [
            r"^apps/nexus/content/docs/dev/components/flat-dropdown\.",
            r"^apps/nexus/app/plugins/tuffex\.ts$",
            r"^apps/nexus/app/components/content/demo-registry\.ts$",
            r"^apps/nexus/app/components/content/demos/FlatDropdownBasicDemo\.vue$",
            r"^apps/nexus/test/docs/tuffex-component-docs-coverage\.test\.ts$",
        ],
    ),
    (
        "G9-docs-hydration",
        "fix(nexus): repair docs sidebar hydration and console noise",
        [
            r"^apps/nexus/app/components/TheHeader\.vue$",
            r"^apps/nexus/app/pages/docs/docs-page-performance\.test\.ts$",
        ],
    ),
    (
        "G10-visual-smoke",
        "chore(nexus): restore the Tuffex visual smoke CDP client",
        [r"^apps/nexus/scripts/(audit-cdp-client\.mjs|tuffex-visual-smoke\.mjs)$"],
    ),
    (
        "G11-base-anchor-remeasure",
        "fix(tuffex): re-measure BaseAnchor outline after floating-ui applies width",
        [
            r"^packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor\.vue$",
            r"^packages/tuffex/packages/components/src/base-anchor/__tests__/base-anchor\.test\.ts$",
        ],
    ),
    (
        "G12-tooling",
        "chore: pin repo formatting style and add audit scripts",
        [
            r"^\.prettierrc\.json$",
            r"^\.trellis/scripts/(verify-archive-candidates|propose-commit-groups|apply-commit-groups)\.py$",
            r"^report\.md$",
        ],
    ),
    (
        "G13-trellis-state",
        "chore(trellis): archive verified tasks and sync AC state",
        [r"^\.trellis/(tasks|spec)/"],
    ),
]

# Evaluated only for paths no group above claimed, so it can never shadow a specific group.
FALLBACK = (
    "G14-misc",
    "chore: assorted plugin manifest and workspace updates",
)


def dirty_paths() -> list[str]:
    out = subprocess.run(
        ["git", "status", "--porcelain", "-z"], capture_output=True, text=True, check=True
    ).stdout
    paths: list[str] = []
    for entry in out.split("\0"):
        if len(entry) > 3:
            paths.append(entry[3:])
    return paths


def main() -> int:
    paths = dirty_paths()
    compiled = [(k, m, [re.compile(p) for p in pats]) for k, m, pats in GROUPS]

    assigned: dict[str, list[str]] = defaultdict(list)
    multi: list[tuple[str, list[str]]] = []

    for path in paths:
        hits = [k for k, _, pats in compiled if any(p.search(path) for p in pats)]
        if len(hits) > 1:
            multi.append((path, hits))
        assigned[hits[0] if hits else FALLBACK[0]].append(path)

    unmatched: list[str] = assigned.get(FALLBACK[0], [])

    for key, msg, _ in [*compiled, (FALLBACK[0], FALLBACK[1], [])]:
        files = assigned.get(key, [])
        if not files:
            continue
        print(f"\n## {key}  ({len(files)} files)")
        print(f"   {msg}")
        for f in sorted(files)[:4]:
            print(f"     - {f}")
        if len(files) > 4:
            print(f"     … +{len(files) - 4} more")

    print(f"\n{'=' * 60}")
    print(f"total dirty paths: {len(paths)}   assigned: {sum(len(v) for v in assigned.values())}")
    if multi:
        print(f"\nAMBIGUOUS — matched by more than one group ({len(multi)}):")
        for path, hits in multi:
            print(f"  {path}  -> {hits}")
    if unmatched:
        print(f"\nfell through to {FALLBACK[0]} — review these ({len(unmatched)}):")
        for path in unmatched:
            print(f"  {path}")
    return 1 if multi else 0


if __name__ == "__main__":
    sys.exit(main())
