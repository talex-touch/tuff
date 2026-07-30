# Implementation Plan: CoreBox end-to-end debugging

## 1. Baseline and inventory

- [x] Fetch `origin/master`; record commit, host, Node/pnpm, CoreApp version, and
  product-path parity.
- [x] Read parent research, CoreApp AGENTS/specs, living search audit, CoreBox history,
  and relevant open/closed Issues.
- [x] Capture scoped pre-run `git status --short` and product/task-path diffs so
  unrelated user changes are never attributed to this task.
- [x] Build a file/event/data-flow inventory and candidate ledger before running the
  UI.

## 2. Focused RED-style diagnostics

Run the existing nearest contracts first and preserve exact output summaries:

```bash
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/box-tool/core-box \
  src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts \
  src/renderer/src/modules/box/adapter/hooks/useVisibility.test.ts \
  src/renderer/src/modules/box/adapter/hooks/useKeyboard.test.ts \
  src/renderer/src/modules/box/adapter/hooks/useActionPanel.test.ts \
  src/renderer/src/components/render/CoreBoxRender.test.ts
```

- [x] Run transport-focused tests needed to prove actual Set-based handler behavior.
- [x] Use task-local or `/tmp` diagnostic harnesses only; do not edit production tests.
- [x] Prove or reject duplicate handler registration and shortcut-order candidates.

## 3. Automated gates

```bash
corepack pnpm -C apps/core-app run typecheck:node
corepack pnpm -C apps/core-app run typecheck:web
corepack pnpm -C apps/core-app run build:vite
corepack pnpm -C apps/core-app test
corepack pnpm -C apps/core-app test
```

- [x] Map matching full-suite failures to #323.
- [x] For new or flaky signatures, rerun the narrow file twice and capture timing.
- [x] Do not increase timeouts, skip tests, or treat focused green tests as full-suite
  success.

## 4. Disposable runtime

- [x] Pause and ask the user to confirm that the macOS system clipboard has been
  manually replaced with non-sensitive synthetic text. Do not launch until confirmed;
  do not inspect, back up, clear, restore, or record clipboard content.
- [x] Create `/tmp/tuff-corebox-debug-<run>/{profile,home,evidence}` and synthetic
  search fixtures.
- [x] Produce a local unpacked app if no suitable current build exists:

```bash
corepack pnpm -C apps/core-app run build:unpack
```

- [x] Launch the unpacked app through a repository-owned CDP probe or supervised
  command with `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR`, synthetic `HOME`, and
  `TUFF_FILE_PROVIDER_BASE_WATCH_PATHS`.
- [x] Exercise onboarding, toggle/show/hide, focus/blur/pin, desktop bounds, keyboard
  and pointer navigation, ordinary/scoped search, loading/result/empty/degraded,
  rapid replacement/cancel, selection, item execution, available plugin/context
  activation, and teardown/relaunch.
- [x] Capture event/order counts, DOM/window snapshots, console/page errors, bounded
  logs, and screenshots without query/clipboard/user-path content.
- [x] Terminate supervised processes and remove the disposable profile.

## 5. Candidate closure

- [x] Reproduce each remaining candidate a second time or obtain complementary
  executable evidence.
- [x] Search GitHub open/closed Issues, Trellis tasks/audits, blame, and recent commits
  by acceptance boundary.
- [x] Write `research/report.md` and `research/candidates.md`.
- [x] Mark every candidate confirmed-new, known/duplicate, environment-only, or
  inconclusive; leave no raw observation unclassified.

## 6. Child validation

```bash
git diff --check -- .trellis/tasks/07-28-debug-corebox-end-to-end
python3 ./.trellis/scripts/task.py validate 07-28-debug-corebox-end-to-end
git status --short
```

Verify that scoped product/task diffs contain only this child's planned research,
unrelated worktree changes are unchanged, and no supervised process/profile remains.
