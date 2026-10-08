# Multi-Session Collaboration Guide

Checklist for working while other Claude/agent sessions write this repo
concurrently. Rules of evidence live in the
[Evidence Boundaries](../frontend/quality-guidelines.md#evidence-boundaries) of the
quality guidelines; this is the pre-flight list.

## Before committing a shared file

- [ ] `git diff <file>` — are there hunks you didn't author (other session's
  uncommitted work)? If yes, do **not** `git add` the file wholesale.
- [ ] For line-additive files (lang JSONs, barrels): stage "HEAD + only my
  lines" via `git show HEAD:<path>` → re-apply your insertion → `git
  hash-object -w --stdin` → `git update-index --cacheinfo 100644,<blob>,<path>`.
  The working tree (and their lines) stays untouched.
- [ ] Never stash/checkout/restore to "clean up" — other sessions' work is in
  that tree. Verify against `git show HEAD:<path>` instead.

## Before driving a UI over CDP

- [ ] Prove the instance is yours: if you just launched it, check the wrapper
  log for `Port 5173 is already in use` — a healthy CDP port can belong to an
  instance the **user** is actively using (an earlier launch they adopted).
- [ ] If ownership is unclear, treat the window as the user's: read-only
  evaluation only; no navigation, no clicks, no state mutation.
- [ ] Restore anything you changed (`location.hash`, focus) the moment you
  discover the window isn't yours, and say so in the report.

## Before dispatching parallel implement agents

- [ ] Pin cross-agent contracts (transport event names, payload shapes) in a
  file **you** create first; both agents implement against it.
- [ ] Give each agent an explicit file-ownership boundary and list the other
  sessions' in-flight files as no-touch.
- [ ] Typecheck noise from other sessions' in-flight files is not yours to fix
  — scope your acceptance to "0 errors in my range", never repo-wide green.

## Isolating a task in a git worktree

When the shared checkout is dirty with other sessions' work, or its dev server on :3200 must not be interrupted, run the task in its own worktree. Each item below cost a debugging round in October 2026.

- [ ] Base it on the branch where the code you change actually lives, detached until commit time: `git worktree add --detach ~/Workspace/Worktrees/<name> origin/<base>`. In October 2026 the admin console existed only on `stage` (59 commits ahead of `master`), so a `master`-based worktree would have edited code that was already gone.
- [ ] Keep the Bash tool's default `PATH`. It already points at the mise **install** of Node 26.0.0 and at the global pnpm 11.24.0, independent of the working directory. Prepending `~/.local/share/mise/shims` is what breaks a worktree. While its `mise.toml` is untrusted, the shims fall back to the global Node 24, so native modules (`better-sqlite3`) get built for the wrong ABI and `nuxt dev` crashes on start. Once it is trusted (`mise trust <worktree>/mise.toml`), the shims insist on a mise-managed `pnpm@11.24.0` and fail if mise has to download it while GitHub rate-limits. Check with `node --version` and `pnpm --version` inside the worktree.
- [ ] Install only what the task needs, straight from the store, in about 20 s: `pnpm install --frozen-lockfile --prefer-offline --filter . --filter "@talex-touch/tuff-nexus..." --filter "@talex-touch/tuffex..."`.
- [ ] `pnpm <script>` and `pnpm exec` first check the installed state against the lockfile (pnpm 11 default; the repo sets nothing). When the state is current, the check passes even in a filtered worktree (measured: about 2 s, nothing installed). When it is stale, for example right after editing a `package.json`, they start a whole-workspace install, and an interrupted install wipes the root `node_modules/.bin`. For long or repeated commands (vitest, typecheck, builds), call the binaries directly, e.g. `apps/nexus/node_modules/.bin/vitest run`.
- [ ] If a native module fails to load after the Node fix, copy the main checkout's Node 26 build into the worktree's own `node_modules`. pnpm imports packages as APFS clones (link count 1), so this does not touch the store. Keep the original in `/tmp`.
- [ ] Nexus dev from a worktree: set `NUXT_TUFFEX_SOURCE=true` so dev does not need `packages/tuffex/dist`, and use your own port (3201, 3202, …) with the worktree's own `.wrangler` D1. Typecheck still resolves `@talex-touch/tuffex/*` types through `dist`, so build it once with `node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts`. The gulp build spawns `corepack pnpm`; for the corepack traps, see the gates section of `frontend/tuffex-docs-sync.md`.
- [ ] The pre-commit hook (`pnpm sync:core-pkg`, `check-bin-shims`, `pnpm lint:staged`) and the commit-msg hook (`pnpm exec commitlint`) run fine in a filtered worktree with the default `PATH`. Measured: 2 s, and `node_modules/.modules.yaml` was not touched. No full install is needed before committing.
- [ ] Do not commit, from the worktree, Trellis task directories that exist untracked in the shared checkout. When that branch lands and the shared checkout pulls, git refuses to overwrite the untracked copies.
