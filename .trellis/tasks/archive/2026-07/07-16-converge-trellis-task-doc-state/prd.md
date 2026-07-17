# Converge Trellis task and documentation state

## Goal

Reduce the active Trellis tree to truthful, executable work and make `docs/plan-prd/TODO.md` the only global priority source.

## Requirements

- Audit every active `.trellis/tasks/*/task.json` and its PRD acceptance state.
- Archive tasks already marked completed, plus tasks whose complete acceptance checklist and evidence show the implementation is finished.
- Use `task.py archive --no-commit`; this task must not create git commits or include unrelated working-tree changes.
- Preserve genuinely open work, including the concurrently active file-filtering slice.
- Every retained task must have exactly one assignee plus machine-readable `meta.nextAction`, `meta.blocker`, and `meta.evidence` fields.
- Preserve parent/child progress semantics when archiving children and parents.
- Remove current-version, branch, HEAD, dirty-worktree, stale active-count, and competing global-priority claims from long-lived planning/navigation documents.
- Do not rewrite archived historical evidence or alter production code.

## Acceptance Criteria

- [x] The active task count drops from the audited 54-task baseline to only genuinely open work.
- [x] No active task has status `completed` or a fully checked acceptance list without an explicit blocker.
- [x] Every retained task has one assignee and non-empty next-action, blocker, and evidence metadata.
- [x] Completed tasks are archived with `--no-commit`; no git commit or push is created.
- [x] `TODO.md` is the only global ordering source, and navigation/roadmap documents point to it instead of declaring competing priorities.
- [x] Long-lived docs contain no live branch, temporary HEAD, dirty-worktree, or stale active-count claims.
- [x] Task tree, task metadata, local documentation links, and AI docs verification pass.

## Out of Scope

- Implementing any retained feature task.
- Editing the concurrent file-filtering production code.
- Archiving tasks whose acceptance criteria remain open.
- Creating commits or pushing branches.
