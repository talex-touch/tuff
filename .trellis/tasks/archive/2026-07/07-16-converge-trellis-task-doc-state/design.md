# Design: Trellis task and documentation convergence

## Classification

A task is an archive candidate when either:

1. `task.json.status` is `completed`; or
2. every PRD acceptance checkbox is checked and the task contains completion evidence.

Exceptions stay active only when the work is uncommitted/currently concurrent or the PRD explicitly names an unresolved blocker. Such exceptions receive explicit metadata instead of being silently relabeled complete.

## Archive Order

Archive completed children before their parent. Run every archive with `--no-commit`. Parent history retains archived child names, while active children are never detached accidentally.

## Retained Task Contract

Use existing `task.json.meta` for:

```json
{
  "nextAction": "one concrete next step",
  "blocker": "none or the exact blocking condition",
  "evidence": "the PRD/report/checklist location that defines completion"
}
```

`assignee` remains the single owner field. Do not create a second owner registry.

## Documentation Ownership

- `docs/plan-prd/TODO.md`: sole global execution order.
- Task PRDs/meta: task-local scope, next action, blocker, acceptance evidence.
- `docs/INDEX.md` and planning README: navigation and current phase pointer only.
- CHANGES/reports: completed evidence, not live priority.
- Dated handoffs remain historical and must link to `TODO.md` for current ordering.

## Safety

- Archive only after presenting the exact candidate list for confirmation because archiving moves directories.
- Always pass `--no-commit`.
- Do not touch production source or unrelated task implementation files.
- Recompute the task tree after every archive wave before editing retained metadata.

## Rollback

Because no commit is created, rollback is a directory move from `.trellis/tasks/archive/YYYY-MM/<task>` back to `.trellis/tasks/<task>` plus restoring the archived task's prior status. Avoid needing this by classifying and confirming candidates before the move.
