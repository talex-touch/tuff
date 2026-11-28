---
name: tuffex-ui-craft
description: >-
  End-to-end interactive workflow for creating, modifying, and visually polishing
  TuffEx components and Nexus docs/gallery UI in talex-touch. Trigger when the
  user mentions "细微调整 UI", "深度优化 UI", "精调 UI", subtle/deep UI polish,
  creating or refining TuffEx components, previewing UI changes live in Nexus
  for iterative feedback, or landing and releasing TuffEx UI changes. When
  triggered by general phrasing like "细微调整 UI" or "深度优化 UI", ask the
  user to confirm activating this workflow before starting the live preview loop.
---

# TuffEx UI Craft Loop

Standard interactive workflow for creating, modifying, and polishing TuffEx components (`packages/tuffex`) and their Nexus showcase/docs (`apps/nexus`) — from isolated setup and live side-by-side preview to iterative feedback, full audits, PR landing, and release.

## Activation Gate

- When the user asks for **"细微调整 UI"**, **"深度优化 UI"**, **"精调 UI"**, or similar open-ended UI polish without explicitly invoking this skill, **briefly confirm with the user whether to activate `tuffex-ui-craft`** (isolated branch/worktree → live Nexus preview in the side browser pane → multi-round visual feedback → audits → commit/PR/release) before spinning up the dev server.
- If the user already explicitly invoked this skill or directly asked to launch local preview, proceed straight to Phase 0.

## Phase 0 · Pre-Flight & Isolation

1. **Isolate or reuse the right workspace**:
   - For **new** UI polish work starting clean, branch from `origin/master` on a `task/<type>/<slug>` branch (`feat`, `fix`, `docs`, `perf`). Never develop or commit directly on `master` or `stage`.
   - If the main checkout has unrelated concurrent work, create a dedicated `git worktree` from `origin/master` instead of touching that working tree.
   - If the user is asking to preview or continue **their own active UI branch or uncommitted changes**, run the live preview directly against that branch/checkout so their edits are what gets rendered.
2. **Read the owning frontend specs before editing**:
   - `docs/engineering/specs/frontend/tuffex-design-rules.md` (type scale, `--tx-*` tokens, inset rings, concentric radii, hover motion)
   - `docs/engineering/specs/frontend/tuffex-docs-sync.md` (wrapper blast radius, bilingual `.en.mdc`/`.zh.mdc`, gallery specimens, dev-server traps)
   - `docs/engineering/specs/frontend/nexus-docs-structure.md` (canonical page sections & Apple-style copy)
3. **Respect shared-machine discipline**:
   - Run heavy jobs (`vitest`, `vue-tsc`, `gulp`, `nuxt dev`) with `nice -n 10`.
   - Never start Electron or touch Vite port `5173` while the user's `pnpm core:dev` is running.

## Phase 1 · Start Live Preview First

Always get a live visual feedback surface up **before** heavy visual tuning so the user can inspect every change directly in the browser pane.

1. **Launch Nexus in live TuffEx source mode** (instant HMR on `packages/tuffex/packages/components/src/` without waiting for a 25s dist rebuild; `apps/nexus/build/tuffex-dev-mode.ts` reads `NUXT_TUFFEX_SOURCE`) on a dedicated localhost port (e.g. `3218`) as a background daemon:
   ```bash
   NUXT_TUFFEX_SOURCE=true nice -n 10 pnpm --dir apps/nexus exec nuxt dev --port 3218 --host 127.0.0.1
   ```
2. **Open the live page in the built-in browser pane** via the `browser` subagent (typically `/en/docs/dev/components/base-suite` for Basics Suite work or `/en/docs/dev/components/<slug>` for a single component).
   - Keep that browser subagent idle and reuse it via `send_message` across feedback rounds; never kill it mid-session.
   - Do not probe localhost with `curl`/`lsof`/`ps` to bypass browser verification.

## Phase 2 · Iterative Feedback & Polish Loop

Repeat this tight cycle for every piece of user feedback (screenshot, motion feel, contrast, alignment, missing coverage, interaction bug):

1. **Diagnose root cause, not surface symptoms**:
   - Inspect the real component SFC, tokens, state transitions, and computed styles before editing.
   - Check known repo/component traps in [pitfalls-and-gates.md](./references/pitfalls-and-gates.md) (`TxButton` `.fake-background`, Carbon icon safelist, `flush: 'sync'` watcher races, constant-speed reading motion, concentric radii).
2. **Check blast radius** (every time a component is added or its props/DOM/behavior changes):
   - Wrapper components: `rg -l "\.\./\.\./<comp>'" packages/tuffex/packages/components/src --glob '*.vue'`
   - Component docs: update **both** `apps/nexus/content/docs/dev/components/<comp>.en.mdc` and `.zh.mdc` in matching section order.
   - Suite gallery & routing: ensure the component appears in its suite category (e.g. `apps/nexus/app/components/docs/gallery/GalleryBaseSuite.vue`, `SUITE_CATEGORY_KEYS` & `STATIC_COMPONENT_SUITE_MAP` in `apps/nexus/app/utils/docs-suites.ts`, and `apps/nexus/scripts/recategorize-component-docs.py`).
3. **Implement minimal, clean fix + regression test**:
   - Pair every bug fix or motion invariant with a focused Vitest test under `packages/tuffex/packages/components/src/<comp>/__tests__/` (or Nexus coverage/guard test).
   - Keep component SFC bundles under `48.0 KiB` (extract pure helpers into `src/utils.ts` when needed) and keep Nexus SFCs under the `4500`-line ceiling (external `.css` above `3000` lines).
4. **Live-verify in the browser pane before replying**:
   - Reload the active tab via the existing `browser` subagent.
   - Verify concrete runtime evidence (DOM state, bounding-box alignment, frame/velocity samples, interactive clicks/popovers, zero console/page/HTTP errors).
   - Read the host-verified screenshot from `BROWSER_HOST_FACTS.latest_screenshot` with `read_file` to visually inspect light/dark clarity, spacing, and alignment before handing back to the user.

## Phase 3 · Full Build, Audits & Local Gates

Once the user is satisfied with the live preview, run the full verification pass before any commit/PR. Exact copy-paste commands live in [pitfalls-and-gates.md](./references/pitfalls-and-gates.md).

1. **TuffEx package gates** (mirrors `.github/workflows/package-tuffex-ci.yml`):
   - Targeted + affected `vitest run`
   - `eslint --max-warnings=0` (run from `packages/tuffex`)
   - `vue-tsc --noEmit`
   - Full `dist/` rebuild via `gulp` with `npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false` (avoids triggering `pnpm install` under the live dev server)
   - Surface audits: `audit:exports`, `audit:readme`, `audit:types`, `audit:size`, `audit:colors`, `audit:vocab` (and `audit:changelog` if bumping version)
2. **Nexus docs & gallery gates** (safe while `nuxt dev` is running — never invoke `pnpm typecheck` or `nuxt prepare` under a live dev server):
   - `check-demo-registry-orphans.mjs`, `check-mdc-fences.mjs`, `check-doc-translation-parity.mjs`, `check-icon-collections.mjs`, `scripts/recategorize-component-docs.py`
   - Carbon icon name check against `@iconify-json/carbon/icons.json`
   - Guard & coverage Vitest suites (`sfc-size-budget`, `component-auto-import`, `i18n-key-existence`, `docs-locale-links`, `docs-suites`, `base-suite-coverage`)
   - Direct `vue-tsc --noEmit -p .nuxt/tsconfig.app.json` + `eslint --max-warnings=0` on touched files
   - `git diff --check`

## Phase 4 · Commit, PR & Release

> **Hard Gate**: Commit, push, PR creation, merge, version bump, and release ALL require **explicit user authorization**. Present a concise summary of changed files and verification results first, then wait for confirmation.

1. **Commit & PR to `master`** (policy in `docs/engineering/specs/guides/branch-and-release.md`):
   - Run `pnpm check branch-policy` (`I3` must be OK on `task/<type>/<slug>`).
   - Commit with Conventional Commits (`feat(tuffex): ...`, `fix(tuffex): ...`, `docs(nexus): ...`), keeping TuffEx source, tests, built surface consistency, and bilingual Nexus docs together.
   - Push branch and open a PR into `master`; wait for required CI (`package-tuffex-ci.yml` + Nexus checks) to pass before merging.
2. **Publishing `@talex-touch/tuffex` to npm** (automated by `.github/workflows/package-tuffex-publish.yml`):
   - TuffEx versions independently of `core-app`. When the user requests a TuffEx package release:
     1. Bump `version` in `packages/tuffex/package.json`.
     2. Add the matching version section to `packages/tuffex/CHANGELOG.md` and pass `pnpm -C packages/tuffex audit:changelog`.
     3. Land via PR into `master`. On push to `master`, `Tuffex Package Publish` automatically runs tests, lint, typecheck, build, all audits, waits for `@talex-touch/utils`, and publishes `@talex-touch/tuffex` to npm.
3. **Optional `core-app` Beta / Stable Release** (only when explicitly requested):
   - Follow `docs/engineering/specs/guides/branch-and-release.md` verbatim (`stage` catch-up `--ff-only` before `-beta.` tag; on `master`, push version commit before stable `vX.Y.Z` tag).

## Phase 5 · Cleanup

- Keep the local Nexus preview running until the user confirms visual review is finished; then stop the dev daemon.
- Delete temporary `task/` branches and worktrees only after the PR is merged and no active work depends on them.
