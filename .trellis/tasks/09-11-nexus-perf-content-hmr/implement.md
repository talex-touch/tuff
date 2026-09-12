# Implement — Nexus dev: HMR silent for app/components/content

Work in `apps/nexus/`. Run after `09-11-nexus-perf-dev-source` lands so the probe uses the final dev config.

## 1. Probe

- [ ] `modules/watch-probe.ts` (dev-only, `NEXUS_WATCH_PROBE=1`): log `vite:serverCreated` watcher `options.ignored` (each entry's type/source) and every `builder:watch` event.
- [ ] Start `NEXUS_WATCH_PROBE=1 pnpm dev:pure`, open `/en/docs/dev/components/button`, edit `app/components/content/demos/ButtonSizesDemo.vue` and `app/components/docs/DocHero.vue`; capture which watcher emits for which.
- [ ] Write findings to `research/root-cause.md`.

## 2. Fix

- [ ] Apply the fix matching the root cause (see `design.md` candidates). Keep `content/**` ignored for Vite.
- [ ] Remove or keep the probe module behind its env flag (keep: it is cheap and documents the mechanism).

## 3. Guard

- [ ] `build/nexus-dev-watcher.test.ts` per `design.md`; confirm it fails with the fix reverted.

## 4. Verification

- [ ] Same browser probe as the baseline: template edit in `ButtonSizesDemo.vue` → `hmr update` line + DOM change without reload; same for `TuffDemoWrapper.vue`.
- [ ] `pnpm run test`.
- [ ] Record before/after in `research/results.md`.
