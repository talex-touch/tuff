# Implementation plan: documentation source-of-truth convergence

## 1. Inventory

1. Record `task.py list` output and parse every active `task.json` plus PRD acceptance counts.
2. Separate archive candidates, retained tasks, and concurrent ownership exceptions.
3. Verify each candidate's evidence directly; produce the exact child-first move list before any archive operation.
4. Compare current roadmap/navigation priority claims with `docs/plan-prd/TODO.md`.

## 2. Migrate root search-index plan

1. Create a new child under `.trellis/tasks/07-13-search-crossplatform-audit` with a descriptive search-index split slug.
2. Write converged PRD/design/implementation artifacts and real manifests from root `todo.md`.
3. Verify every flag name, write site, worker limitation, silent-data-loss warning, flag-on app test, and rollback step survived.
4. Validate the child and parent/child links.
5. Remove root `todo.md` only after the replacement is complete.

## 3. Archive proven completions

1. Present or record the reviewed candidate list.
2. Run `python3 ./.trellis/scripts/task.py archive <child> --no-commit` for completed children first.
3. Recompute active state, then archive eligible parents with the same flag.
4. Stop if a move modifies an unrelated active child or creates an unexpected staged path.

## 4. Normalize retained state

1. Add one assignee and concrete next-action/blocker/evidence metadata to retained tasks in scope.
2. Leave all other task fields and acceptance state unchanged.
3. Skip the concurrent bilingual task and OTA parent file; record them as ownership exceptions.
4. Rewrite `docs/plan-prd/TODO.md` from truthful retained state and remove competing global-order claims only where owned by this batch.

## 5. Focused validation

```bash
python3 ./.trellis/scripts/task.py list

for task in .trellis/tasks/*
do
  test -f "$task/task.json" || continue
  python3 ./.trellis/scripts/task.py validate "$task"
done

mise run ai-docs:dev
git diff --check
git diff --name-only "$(git merge-base HEAD master)"..HEAD
```

Also run a read-only metadata audit that reports retained tasks missing an assignee or any of `nextAction`, `blocker`, and `evidence`, with the two concurrent-owned paths handled as explicit exceptions. Do not run formatters, project-wide lint, or product suites.

## 6. PR and rollback evidence

1. Commit only Batch A owned paths.
2. Push the dedicated branch and open a PR against the planning branch if it is still stacked, otherwise `master`.
3. Include planning PR dependency, archive source/destination map, replacement search task path, commands/output, and explicit concurrent exclusions.
4. Do not merge the PR.
