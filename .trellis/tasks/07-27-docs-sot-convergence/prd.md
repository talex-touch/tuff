# Converge documentation source of truth

## Goal

Make `docs/plan-prd/TODO.md` and the active Trellis tree agree on current work while preserving the complete search-index split safety contract in a newly owned child task.

## Confirmed facts

- `docs/plan-prd/TODO.md` declares itself the sole global execution-order source but still reflects a 2026-07-16 stabilization snapshot.
- Root `todo.md` is an unowned implementation plan for issue #295. It explicitly states that `DB_SEARCH_SPLIT_ENABLED` / `TUFF_DB_SEARCH_SPLIT_ENABLED` defaults off and that enabling it before all remaining writers migrate causes silent data loss.
- A prior convergence task established `task.json.meta.nextAction`, `meta.blocker`, and `meta.evidence` as the retained-task contract and archived completed children before parents.
- `.trellis/tasks/07-27-bilingual-whats-changed/` and `.trellis/tasks/07-17-unify-ota-update-flow/task.json` are concurrently owned and are immutable for this batch.

## Requirements

### R1 - One global ordering source

- Update `docs/plan-prd/TODO.md` from the live task tree and current evidence instead of copying a stale count, branch, HEAD, or dirty-worktree snapshot.
- Keep roadmap, task PRDs, and historical change records as local scope or evidence; they must link to `TODO.md` rather than define a competing global order.
- Do not hard-code an active task count that can drift immediately.

### R2 - Root `todo.md` migration

- Create one new implementation child task for the remaining search-index split write-path migration and link it to the existing search/cross-platform audit parent.
- Move the root plan into the new task's converged PRD/design/implementation artifacts before deleting root `todo.md`.
- Preserve every named write-path, worker API limitation, exact default-off flag, silent-data-loss failure mode, flag-on app-run test, and rollback instruction.
- The new task must remain blocked from enabling the flag until all 2d/2e writers and first-launch behavior pass exact flag-on app evidence.

### R3 - Truthful archive classification

A task may be archived only when:

1. `task.json.status` is `completed`; or
2. every acceptance criterion is checked and the task contains concrete completion evidence.

- Build and review the exact candidate list before moving directories.
- Archive children before parents with `task.py archive --no-commit` so this batch owns one scoped commit and does not absorb unrelated work.
- Do not archive a task merely because its branch merged, its work appears old, or its owner is inactive.
- Preserve parent progress semantics and record every moved path in the PR.

### R4 - Retained active-task metadata

- Every retained active task has exactly one assignee and non-empty `meta.nextAction`, `meta.blocker`, and `meta.evidence`.
- Metadata describes the next executable step and exact blocker; it does not duplicate a global priority list.
- Existing task PRD acceptance state and parent/child links remain authoritative.
- Do not edit the concurrent bilingual task or OTA parent `task.json`; report either as an explicit ownership exception rather than staging it.

### R5 - Scope and safety

- This batch changes documentation and Trellis state only; no production source, release artifact, generated output, or runtime database is touched.
- Never enable the search split flag or claim flag-on acceptance from typecheck alone.
- Do not run formatters, project-wide lint, or product test suites.

## Acceptance Criteria

- [x] `docs/plan-prd/TODO.md` is the sole global execution-order source and contains no stale repository-state snapshot.
- [x] Root `todo.md` is removed only after a linked search-index child task preserves the full default-off, silent-data-loss, migration, app-test, and rollback contract.
- [x] Every archived task satisfies the classification rule, children move before parents, and the PR lists all moves.
- [x] Every retained task in scope has one assignee and non-empty next-action, blocker, and evidence metadata.
- [x] Parent/child links remain bidirectionally consistent and all context manifests validate.
- [x] The bilingual task and OTA parent `task.json` have no diff, stage, revert, or metadata change.
- [x] Focused Trellis/context/document checks and `git diff --check` pass.
- [x] A dedicated PR is open with its branch, commit, archive inventory, validation output, and dependency on the planning PR.

## Out of Scope

- Implementing or enabling the search-index split.
- Reordering unrelated product roadmap details beyond the truthful global TODO projection.
- Editing production code, release notes, root READMEs, or quality-gate scripts.
- Guessing completion when evidence is missing.
