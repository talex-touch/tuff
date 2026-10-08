# Baseline before the admin-kit changes

- Worktree: `/Users/talexdreamsoul/Workspace/Worktrees/talex-touch-admin-kit`, detached at `cfa1fd994` (head of `task/feat/tuffex-admin-primitives`, PR #2037).
- TuffEx dist built in the worktree first (`packages/tuffex`, gulp build with verify-deps off and `/tmp/pnpm-shim-primitives` on PATH): exit 0.
- Full Nexus suite, CI's command, run 2026-10-02 23:49 from `apps/nexus`:
  `./node_modules/.bin/vitest run` → **255 files passed, 1902 tests passed, 0 failed** (16.4 s).
