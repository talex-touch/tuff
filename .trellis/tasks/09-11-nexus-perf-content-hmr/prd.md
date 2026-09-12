# Nexus dev: HMR silent for app/components/content

Child of `09-11-nexus-perf`. Baseline numbers are in the parent `prd.md`.

## Goal

An edit to any file under `apps/nexus/app/components/content/**` (demo wrapper, demos, code block renderer) reaches the running browser via HMR like edits to sibling directories do, so developers stop hard-reloading (1–1.2 s cold cache per reload) after every demo change.

## Observed behaviour (2026-09-11)

| Edited file | Server log | Browser |
|---|---|---|
| `packages/tuffex/.../button.vue` template | `hmr update` | updated in 50 ms |
| `app/components/docs/DocHero.vue` template | `hmr update` | updated in 83 ms |
| `app/pages/docs/[...slug].vue` template | `hmr update` | updated in 780 ms |
| `app/components/content/TuffDemoWrapper.vue` template | nothing | nothing in 30 s |
| `app/components/content/demos/ButtonSizesDemo.vue` template | nothing | nothing in 30 s |
| `touch` (mtime only) of a demo file | nothing | nothing |

Probed via `loadNuxt`: `isIgnored()` and `nuxt.options.vite.server.watch.ignored()` both return `false` for these paths, and `content/**` (the Nuxt Content source dir) is correctly ignored. The Nuxt Content module replaces `vite.server.watch.ignored` with its own function; the Vite builder wraps it again. Root cause is still open.

## Requirements

### R1 — Root cause identified and written down
The task's `research/` note must state which watcher (Vite chokidar, Nuxt's own `builder:watch` watcher, or a module hook) drops the events and why, with a reproducible probe.

### R2 — Fix lands in Nexus config or a local module
The fix must not patch `node_modules` at runtime (`postinstall` patch scripts exist in this repo, but a patch is the last resort and needs the parent task's review). Preferred order: nuxt.config option → local Nuxt module hook → upstream issue + patch.

### R3 — Guarded by a test
A vitest (or node script under `build/`) that boots Nuxt via `loadNuxt` and asserts the watcher configuration covers `app/components/content/demos` is added, so the regression is caught without a browser.

## Constraints

- Nuxt Content must keep ignoring `content/**` from the Vite watcher (it has its own chokidar for the collection).
- `components:extend` in `nuxt.config.ts` must keep demos out of auto-registration (`demo-client-boundary.test.ts`).

## Acceptance Criteria

- [ ] Editing `app/components/content/demos/ButtonSizesDemo.vue` while `/en/docs/dev/components/button` is open produces a `hmr update` server log line and the browser reflects the change without reload (measured with the same probe as the baseline).
- [ ] Editing `app/components/content/TuffDemoWrapper.vue` behaves the same.
- [ ] The new watcher test passes and fails when the fix is reverted.
- [ ] `pnpm -C apps/nexus run test` passes.
