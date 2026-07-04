# Worktree Triage - 2026-07-04

> Scope: read-only classification of the current dirty worktree. No cleanup or deletion has been performed.

## Snapshot

- Branch: `master`
- Tracked modifications: `66`
- Untracked files: `340`
- `git diff --check`: passed for tracked diffs at triage time

## Tracked Diff Buckets

| Bucket | Count | Notes |
| --- | ---: | --- |
| `apps/core-app` | 34 | R3 indexing/runtime, assistant, intelligence, renderer audit UI, language catalogs, database/migration wiring. Treat as multiple slices. |
| `docs/plan-prd` | 11 | TODO/Roadmap/R8-R9/R3/R2 documentation state updates. Keep paired with the code/evidence slice that changed the fact. |
| `apps/nexus` | 9 | Nexus performance/runtime guard changes. Keep separate from CoreApp/R3 changes. |
| `packages/utils` | 4 | Transport/intelligence/shared SDK type changes. Review with the CoreApp or tuff-intelligence consumer slice. |
| `packages/tuff-intelligence` | 3 | Intelligence SDK mirror changes. Pair with matching utils/CoreApp intelligence changes. |
| `packages/tuffex` | 2 | UI semantic component work. Keep separate from CoreApp/Nexus unless explicitly consuming the new primitive. |
| `docs/INDEX.md`, `docs/engineering`, `AGENTS.md` | 3 | Navigation / process docs. Keep with corresponding docs hygiene or Trellis setup slice. |

## Untracked Buckets

| Bucket | Count | Likely class | Handling |
| --- | ---: | --- | --- |
| `apps/core-app` | 110 | Mostly generated chunks, packaged/probe helpers, new R3 scripts/migrations/tests, and local shell profiles. | Do not bulk add. Split generated output from source/test scripts before any commit. |
| `docs/engineering` | 73 | R3 curated evidence/report artifacts. | Check report README references before adding. Raw/log/user-data should stay ignored. |
| `.agents/skills` | 46 | Project-local Trellis skills. | Treat as Trellis tooling setup, not product code. |
| `.opencode/skills` | 43 | Opencode tooling setup. | Keep separate from product changes. |
| `.trellis/scripts` | 28 | Trellis helper scripts. | Keep with Trellis bootstrap/setup only. |
| `.trellis/spec` | 10 | Trellis project specs. | Current bootstrap slice. |
| `.trellis/workspace` | 3 | Workspace index/journal/notes. | Session/process metadata; avoid mixing with product commits unless intended. |
| `apps/nexus` | 2 | New Nexus build/runtime evidence helpers. | Keep with Nexus performance slice. |
| `.trellis/tasks`, `.trellis/agents`, `.trellis/workflow.md`, `.trellis/config.yaml`, `.trellis/.version`, `.trellis/.template-hashes.json`, `.trellis/.gitignore` | mixed | Trellis setup. | Keep as a dedicated Trellis setup commit/slice. |

## Recommended Commit / Review Slices

1. Trellis setup: `.trellis/`, `.agents/`, `.opencode/`, and `AGENTS.md` only after deciding which tool directories should be tracked.
2. R3 indexing/runtime: CoreApp R3 source, R3 scripts/migrations/tests, and curated R3 evidence references.
3. R9 intelligence/context: CoreApp intelligence, `packages/utils`, `packages/tuff-intelligence`, audit UI, and matching docs.
4. Nexus performance: `apps/nexus` and `TODO-nexus.md` only.
5. TuffEx/UI semantic debt: `packages/tuffex`, related UI reports, and focused tests.
6. Generated CoreApp chunks/local profiles: inspect before adding; likely ignore or remove outside this automated pass.

## Guardrails

- Do not run broad cleanup or deletion without explicit approval.
- Do not use focused tests or isolated artifacts to close production/real-profile evidence gates.
- Do not mix CoreApp, Nexus, plugin, packages, and docs changes unless the task explicitly owns the cross-layer contract.
- Before committing any bucket, rerun the closest tests and `git diff --check`.
