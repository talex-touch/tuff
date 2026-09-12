# Design — Nexus dev: HMR silent for app/components/content

## Hypotheses (to be eliminated in order)

1. **Nuxt Content's watcher wrapper.** `watchComponents()` in `@nuxt/content` sets `nuxt.options.vite.server.watch.ignored = (file) => file.startsWith(contentDir) || (file !== componentsTemplatePath && isIgnored(file))`. `contentDir = join(rootDir, 'content')` = `apps/nexus/content`. `file.startsWith('/…/apps/nexus/content')` is a prefix test, so `/…/apps/nexus/content/**` matches, but `/…/apps/nexus/app/components/content/**` does not. The in-process probe confirmed `false` for the demo paths. However the probe called the function that ended up on `nuxt.options` after `ready`; the Vite builder passes `ignored: [isIgnored, /node_modules/]` (its own closure) into `server.watch`, and merges `nuxt.options.vite` on top. Chokidar receives an array whose second element could be the Content function. Need to dump the effective `server.watcher.options.ignored` from the running Vite server.

2. **Nuxt's `components:dirs` handling.** Content registers `app/components/content` as a components dir with `pathPrefix: false`, and `nuxt.config.ts` lists it under `components.dirs[].ignore`. Nuxt's components module keeps its own chokidar (`builder:watch` → `components:dirs` scan). If the Content-registered dir is scanned and the config's `ignore` globs make Nuxt treat the files as ignored components, an `add`/`change` event might be handled by the components module and not forwarded. Check by logging `builder:watch` events in a tiny local module.

3. **Nuxt Content `builder:watch` hook.** Content's hook on `builder:watch` early-returns for `change` events and only handles `add`/`unlink` under component dirs — harmless.

4. **Vite module graph.** The demo modules are imported through `demo-registry.ts` by dynamic `import()`. If the client's module graph holds them (they were loaded — the browser fetched `SelectSelectDemo.vue`), `handleHotUpdate` should find importers. A `change` on `TuffDemoWrapper.vue` is a plain component import from the MDC renderer — same as `DocHero.vue`, which works. So the difference is the directory, not the import shape → points to hypotheses 1/2.

5. **`nuxt.options.ignore` `**/-*.*` pattern** — irrelevant (no leading dash).

## Probe plan

- Local Nuxt module (`modules/watch-probe.ts`, dev-only, behind `NEXUS_WATCH_PROBE=1`) that hooks `builder:watch` and `vite:serverCreated` and logs `server.watcher.options.ignored` plus every event path.
- Touch a demo file and a sibling; compare which watcher sees which.

## Fix candidates (in preference order)

- If Content's function is the culprit through `merge` semantics: override `vite.server.watch.ignored` in `nuxt.config.ts` (`hooks['vite:extendConfig']`) with a function that ignores `rootDir/content/` (with trailing separator) and defers to `isIgnored` otherwise.
- If the Nuxt components module swallows the events: move demos out of a Content-registered components dir (`app/components/content/demos` → `app/demos`) and update the registry paths; `components:extend` filtering becomes unnecessary for demos.
- Last resort: patch script under `scripts/patch-*.mjs` (there is precedent: `patch-nuxt-content-serialize.mjs`), documented in the task and spec.

## Guard

`build/nexus-dev-watcher.test.ts`: `loadNuxt({ dev: true, ready: true })` then assert that the effective `vite.server.watch.ignored` chain returns `false` for `app/components/content/demos/X.vue` and `true` for `content/docs/x.mdc`, and, once the root cause is known, the specific condition that was broken.
