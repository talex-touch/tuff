# Design: documentation source-of-truth convergence

## 1. Authority model

| Information | Authority | Other documents may do |
| --- | --- | --- |
| Global execution order | `docs/plan-prd/TODO.md` | Link to it; describe task-local order only |
| Task status/owner/blocker | Active Trellis `task.json` | Summarize without copying volatile counts |
| Task acceptance | Task `prd.md` plus evidence | Point to evidence; never infer from age |
| Historical completion | Archived task and CHANGES/report | Record immutable result, not current priority |
| Search split implementation | New linked child task | Preserve full root plan and fail-closed warning |

`TODO.md` is regenerated conceptually from current task facts, not from stale narrative snapshots.

## 2. Search-index plan migration

The migration is lossless and ordered:

1. Create the new search-index implementation task under `.trellis/tasks/07-13-search-crossplatform-audit` using Trellis parent linking.
2. Split root `todo.md` into requirements (safety invariants), design (writer/data boundaries), and implementation (2d/2e sites and app-run acceptance).
3. Compare the new artifacts against root `todo.md` for all path anchors, flag names, warning language, and test/rollback steps.
4. Validate the new task and parent/child symmetry.
5. Delete root `todo.md` only after steps 1-4 pass.

The new task name is chosen at execution time through `task.py create` so its date prefix reflects the actual run. The parent is the existing search/cross-platform audit, not this documentation parent.

## 3. Archive classifier

Build a machine-readable inventory with task path, status, checked/total acceptance count, evidence path, parent, and children. Classification is conservative:

- `completed`: archive candidate;
- fully checked plus concrete evidence: archive candidate after review;
- any unchecked criterion, missing evidence, concurrent work, or explicit blocker: retain.

Moves run child-first and use `--no-commit`. After each wave, rerun `task.py list` and parent-link validation before continuing.

## 4. Retained metadata

Use the existing schema only:

```json
{
  "nextAction": "one concrete executable step",
  "blocker": "none or the exact unmet condition",
  "evidence": "the PRD/report/check output that defines completion"
}
```

`assignee` remains the single owner. Do not add a parallel owner registry. Metadata changes must preserve unrelated fields byte-for-byte where practical.

## 5. Concurrent ownership exceptions

The validation inventory may read, but this batch must not edit or stage:

- `.trellis/tasks/07-27-bilingual-whats-changed/`
- `.trellis/tasks/07-17-unify-ota-update-flow/task.json`

If either lacks metadata during this batch, record the exception in the PR and let its owning terminal converge it. Do not bypass ownership to make a global check green.

## 6. Rollback

- Before archive moves, save the exact source/destination map in PR evidence.
- A rollback restores each directory from `.trellis/tasks/archive/YYYY-MM/` to its original path, restores its prior status/completed date, and recomputes parent links.
- If root `todo.md` deletion is reverted, also revert the new child-task migration to avoid two authoritative copies.
- Do not use destructive git reset or worktree cleanup; revert only the Batch A commit.
