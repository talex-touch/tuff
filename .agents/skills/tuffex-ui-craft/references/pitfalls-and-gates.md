# TuffEx UI Craft — Pitfalls & Gate Commands

Hard-won engineering traps and verified copy-paste commands for TuffEx + Nexus UI work.

## 1. Visual, Token & Motion Traps

| Area | Pitfall | Correct Pattern |
| --- | --- | --- |
| **`TxButton` surfaces** | Setting CSS `background` directly on `<TxButton>` is painted over by `.fake-background::before` (`opacity: 0.75 !important`), washing out contrast and hover states. | Drive button fills through `--fake-color`, `--fake-opacity`, `--fake-index`, and `--tx-button-border-color`, or use standard `variant` (`primary` / `secondary` / `ghost`). |
| **Icon classes in TuffEx** | `.tuff-icon__class i` intentionally fills `background-color: currentColor` for plugin icons; any icon class UnoCSS does not generate renders as a solid square. Nexus only installs `carbon`, `cib`, `logos`, `twemoji` (never `ri`). | Do not default TuffEx components to un-safelisted `i-carbon-*` classes when a built-in SVG exists. For components that require class icons, export a constant list and spread into `apps/nexus/uno.config.ts` `safelist` + `configDeps`. Always verify Carbon names against `@iconify-json/carbon/icons.json`. |
| **Concentric radii & alignment** | Mixing `999px` pill badges inside a `14px` container alongside `6px`/`8px` controls looks disjointed; `align-items: baseline` on flex rows containing `inline-flex` icon+title wrappers misaligns icon/title/description. | Use concentric radii (`14px` outer → `8px` interactive pills/buttons → `6px` count/version tags). Use `align-items: center` with matched `line-height` across icon, title, and description. |
| **Teleported overlays in Nexus** | `--docs-*` tokens live on `.docs-root`, not `<body>`. Teleported modals, drawers, and popovers lose `--docs-*`. Also `.docs-prose` uses `content-visibility: auto` (layout containment), breaking non-teleported `position: fixed`. | Always teleport overlays and style teleported content strictly with `--tx-*` tokens. Use crisp non-bouncy `ease-out` entrances (`power3.out` / `power2.in`). |
| **Trackpad / wheel scrolling (`TxPicker`)** | Feeding continuous trackpad deltas (`deltaMode === 0`) through a sluggish spring causes visible lag; carrying stale velocity into snap settle causes overshoot. | Apply continuous pixel wheel deltas synchronously (0ms lag) with rubber-band overscroll; zero residual velocity before engaging the snap spring on idle. |
| **Sync watcher race (`modelValue` + `columns`)** | A `watch(columns, { flush: 'sync' })` normalizing from stale `localValue` instead of `props.modelValue` triggers an infinite ping-pong loop when a parent updates both simultaneously (e.g. clicking `Now` in `TxDatePicker`). | Always normalize from the latest `props.modelValue` inside sync column watchers, and keep static columns referentially stable when bounds do not change. |
| **Reading text scroll (`TxText`)** | Eased `cubic-bezier` scrolling feels uneven when reading, and `v-if`/`v-else` swapping truncated `…` for the scrolling track causes a jarring jump and harsh clip edge. | Use strict constant `linear` speed (`~40 px/s` auto/loop, `~48 px/s` hover), pixel-lock the track's rest offset to `displayText`, cross-fade `opacity` smoothly, and mask only actively overflowing edges. |
| **TuffEx size budgets (`audit:size`)** | Per-component compiled JS limit is `48.0 KiB`; page CSS budgets are tight (`button`, `form`, `admin list`, `chat`). | Move pure logic/grid builders into `src/utils.ts` before an SFC approaches `48 KiB`. Prefer compact GPU `opacity`/`transform` layers over verbose keyframes; if a budget bump is genuinely needed, document exact measured before/after provenance in `audit-package-size.mjs`. |
| **Nexus SFC budget (`sfc-size-budget`)** | SFCs above `3000` lines cannot hold inline `<style>` (Vite dev descriptor misalignment); hard ceiling is `4500` lines. | Split suite sections into `apps/nexus/app/components/docs/gallery/` SFCs and keep styles in sibling `.css` files. |
| **Live Nexus dev server fragility** | Running `pnpm typecheck` / `nuxt prepare` in `apps/nexus`, or running `gulp` without disabling `verify-deps`, wipes `.nuxt/dist` or runs `pnpm install` under the live server, causing 503/500 outages. | While `nuxt dev` is running, run only direct entries below and always disable `verify-deps` on `gulp` builds. |

## 2. Verified Gate Commands

### TuffEx Package Gates (run from `packages/tuffex`)

```bash
# 1. Targeted unit tests + ESLint (must run inside packages/tuffex for Vue TS parser)
nice -n 10 pnpm exec vitest run packages/components/src/<comp>/__tests__/
nice -n 10 pnpm exec eslint --max-warnings=0 packages/components/src/<comp>/

# 2. Typecheck
nice -n 10 pnpm exec vue-tsc --noEmit

# 3. Full dist build (verify-deps disabled to protect live Nexus dev server)
npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false \
  nice -n 10 node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts

# 4. Surface audits (add `audit:changelog` when bumping package.json version)
nice -n 10 pnpm run audit:exports \
  && nice -n 10 pnpm run audit:readme \
  && nice -n 10 pnpm run audit:types \
  && nice -n 10 pnpm run audit:size \
  && nice -n 10 pnpm run audit:colors \
  && nice -n 10 pnpm run audit:vocab
```

### Nexus Docs & Gallery Gates (run from `apps/nexus`, safe alongside live `nuxt dev`)

```bash
# 1. Docs & icon integrity gates
node build/check-demo-registry-orphans.mjs \
  && node build/check-mdc-fences.mjs \
  && node build/check-doc-translation-parity.mjs \
  && node build/check-icon-collections.mjs \
  && python3 scripts/recategorize-component-docs.py

# 2. Carbon icon name validation on touched Vue files
node -e '
const fs=require("fs");
const d=JSON.parse(fs.readFileSync(require.resolve("@iconify-json/carbon/icons.json"),"utf8"));
let bad=0;
for (const f of process.argv.slice(1))
  for (const m of fs.readFileSync(f,"utf8").matchAll(/i-carbon-([a-z0-9-]+)/g))
    if (!d.icons[m[1]] && !(d.aliases||{})[m[1]]) { bad++; console.log(f+": "+m[0]); }
process.exit(bad ? 1 : 0);
' app/components/docs/gallery/GalleryBaseSuite.vue

# 3. Guard & gallery tests (resolve versioned vitest entry directly)
VITEST_BIN=$(ls -d ../../node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs | head -n 1)
nice -n 10 node "$VITEST_BIN" run \
  app/components/docs/gallery/base-suite-coverage.test.ts \
  app/components/docs/docs-locale-links.test.ts \
  app/utils/docs-suites.test.ts \
  test/guards/sfc-size-budget.test.ts \
  test/guards/component-auto-import.test.ts \
  test/guards/i18n-key-existence.test.ts

# 4. Direct vue-tsc & ESLint without touching .nuxt/
VUE_TSC_BIN=$(ls -d ../../node_modules/.pnpm/vue-tsc@*/node_modules/vue-tsc/bin/vue-tsc.js | head -n 1)
nice -n 10 node "$VUE_TSC_BIN" --noEmit -p .nuxt/tsconfig.app.json

ESLINT_BIN=$(ls -d ../../node_modules/.pnpm/eslint@*/node_modules/eslint/bin/eslint.js | head -n 1)
nice -n 10 node "$ESLINT_BIN" --max-warnings=0 <touched-files>
```

### Branch Policy & Hygiene (run from repo root)

```bash
git diff --check
pnpm check branch-policy
```
