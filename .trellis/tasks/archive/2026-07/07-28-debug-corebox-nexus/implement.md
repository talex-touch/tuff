# Implementation Plan: CoreBox and Nexus debugging program

The parent is coordination-only and is not started. Execute and archive each child
independently.

## 1. Baseline gate

- [x] Fetch `origin/master`; record commit and environment in
      `research/audit-baseline.md`.
- [x] Confirm product-owned paths are unchanged from the selected execution checkout,
      or move the runtime pass to an isolated latest-default-branch worktree.
- [x] Refresh the open/closed Issue inventory for CoreBox, Nexus, search, tests, auth,
      release, and tooling.

## 2. CoreBox child

- [x] Review and approve `07-28-debug-corebox-end-to-end` artifacts.
- [x] Start only that child task.
- [x] Run its static, focused/full test, typecheck, build, and isolated runtime matrix.
- [x] Persist a redacted report and candidate ledger; classify every observation.
- [x] Quality-check and archive the child without product-code fixes.

## 3. Nexus child

- [x] Re-fetch the baseline and review `07-28-debug-nexus-end-to-end` artifacts.
- [x] Start only that child task after CoreBox processes and temporary ports are clean.
- [x] Run its static, focused/full test, route, typecheck, build, local API/browser,
      and approved public-read-only matrix.
- [x] Persist a redacted report and candidate ledger; classify every observation.
- [x] Quality-check and archive the child without production writes or product fixes.

## 4. Integration and deduplication

- [x] Review both reports against open/closed Issues, Trellis tasks, living audits, and
      commits newer than the baseline.
- [x] Group symptoms by root cause and one acceptance boundary per proposed Issue.
- [x] Exclude environment-only, unsupported-platform, speculative, and duplicate
      observations.
- [x] Create complete local Issue body drafts and a deduplication table.

## 5. External-write gate

- [x] Present the exact title, severity, labels, duplicate result, and full body for
      every proposed Issue.
- [x] Pause until the user explicitly approves the final publication list.
- [x] Keep all publication mutations blocked until approval; draft validation may run
      before approval.
- [x] Create Issues one by one, verify returned URLs and remote bodies, and stop on any
      mismatch.
- [x] Summarize new Issue URLs plus known-Issue links for findings not republished.

## Validation

```bash
git diff --check -- .trellis/tasks/07-28-debug-corebox-nexus \
  .trellis/tasks/07-28-debug-corebox-end-to-end \
  .trellis/tasks/07-28-debug-nexus-end-to-end \
  .trellis/tasks/07-28-publish-corebox-nexus-issues
python3 ./.trellis/scripts/task.py validate 07-28-debug-corebox-end-to-end
python3 ./.trellis/scripts/task.py validate 07-28-debug-nexus-end-to-end
python3 ./.trellis/scripts/task.py validate 07-28-publish-corebox-nexus-issues
```
