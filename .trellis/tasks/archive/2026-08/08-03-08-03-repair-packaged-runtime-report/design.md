# Design

## Build and seed boundary

The official plugin registry remains the sole source for release targets. Package evidence invokes:

```text
buildOfficialPluginPackages
-> syncOfficialPluginBundledRuntimes
-> bundle builtin preludes
-> CoreApp build
-> electron-builder --dir
-> afterPack verification
```

A raw Builder invocation is not upgraded into a second orchestration path. Missing seed evidence is repaired by using the canonical `build-target.js --dir` entry, and generated projections remain derived artifacts.

## Search worker path boundary

`electron-vite` emits the worker at `<main-output>/search-index-worker.js`. The client may be bundled into `<main-output>/chunks/<hash>.js`, so `__dirname` is not a stable sibling directory.

The resolver checks a small ordered set:

```text
__dirname/search-index-worker.js
__dirname/../search-index-worker.js
cwd/out/main/search-index-worker.js
resources/app.asar/out/main/search-index-worker.js
resources/out/main/search-index-worker.js
```

The first existing regular file wins. A missing worker throws with the complete checked candidate list before constructing `Worker`; no silent fallback or disabled indexing mode is allowed.

## Runtime acceptance

An isolated packaged profile is seeded only with onboarding state. Acceptance waits for startup health, then checks logs and packaged resources before exercising CoreBox input/search through CDP. It distinguishes:

- control-plane readiness from Pi child spawn;
- CoreBox input acceptance from actual indexed-result delivery;
- document visibility from native BrowserWindow visibility;
- source build success from afterPack/package integrity.

## Evidence model

The report stores measurement rows with `stage`, `metric`, `before`, `after`, `unit`, `method`, and `strength` (`measured`, `test`, `inspection`, or `public-source`). Stages are:

1. Baseline audit.
2. Pi runtime lazy activation.
3. Hidden-renderer RAF ownership.
4. Native visibility handshake.
5. Packaged-runtime closure.
6. Final end-to-end verification.

Numeric deltas are shown only for comparable observations. Contract-only outcomes use explicit state transitions rather than fabricated numbers. Competitor information is public-feature positioning, not a local resource benchmark, unless a matching local measurement is actually collected.

## Report page

A self-contained HTML page owns its CSS and small progressive-enhancement script. It contains:

- executive summary and headline deltas;
- sticky stage navigation;
- stage cards with before/after rails, actions, files, checks, and caveats;
- measurement and packaging integrity tables;
- competitor capability matrix with source links and evidence labels;
- remaining-risk register and reproducibility commands.

The page must remain readable without JavaScript and support desktop and narrow mobile layouts.

## Runtime performance remediation

Continuous renderer work uses an explicit `active -> scheduled -> draw -> scheduled` owner. The kept-alive settings header combines route activation and document visibility, uses a timer to cap work at 30 Hz, and owns at most one RAF. Performance telemetry uses the same capped scheduling shape while retaining native CoreBox activity as the authoritative stop signal.

Optional renderer ownership changes to lazy-by-default: CoreBox is created by the first show request and destroyed after 60 seconds hidden; DivisionBox always creates on demand and never refills an empty pool; MetaOverlay creates on first show and disposes its WebContentsView on hide without clearing its action registry. Teardown remains main-process owned.

The database fix is connection-bounded at both write layers. Runtime evidence showed that a 146-app mdls pass left 148 primary-database descriptors open because reconcile applied every changed record through a separate search-writer transaction; building hundreds of Drizzle queries for one `db.batch()` also retained native statement state longer than the intended FD window. App metadata now reuses one LibSQL transaction per 50-row chunk, while the production index adapter submits reconcile upserts and deletes in at most two provider-level writer calls. This bounds transaction creation without one unbounded WAL lock, dependency patches, or forced GC.

The remaining non-database FD spike was watcher-owned: Chokidar 4 removed bundled FSEvents and recursively opened native watchers for every file, producing 400+ descriptors immediately on this profile. CoreApp keeps Chokidar 4 as the Windows/Linux backend and selects a Chokidar 3.6 package alias only on macOS, where its default native FSEvents backend watches each directory tree through a shared stream while preserving the existing depth filters and `awaitWriteFinish` behavior.

## Final validation evidence

- The kept-alive settings route produced 49 WebGL clears in 2 seconds while visible (24.5 Hz) and zero while hidden. The same-machine 5 × 1-second visible CPU median moved from 77.0% to 59.7%; the existing shader output was visually checked in the packaged renderer.
- A fresh packaged profile settled at five processes with no optional CoreBox, DivisionBox, or MetaOverlay renderer. CoreBox created on first show, returned real Safari and Calculator results, survived a 20-query 25 ms race without stale output, and was destroyed 60 seconds after immediate hide.
- MetaOverlay completed three show → action → hide cycles. Each lazy renderer became visible in 400–500 ms, each action returned success, and every hide returned the manager to invisible while preserving the next cycle.
- The natural metadata pass reconciled 146 apps in 22 ms. After startup, search stress, the natural mdls tick, and idle cleanup, the primary database held 11 numeric descriptors and the full process held 167 numeric descriptors, below the existing 256 warning threshold without forced GC.
- The canonical macOS arm64 package loaded the macOS FSEvents alias without module-resolution errors; application directory roots used four watcher descriptors instead of the prior per-file 400+ spike. Windows and Linux retain Chokidar 4.

Visible settings CPU and steady RSS remain optimization targets rather than closure claims. The macOS Chokidar 3 alias is deliberate compatibility debt and should be revisited when the primary watcher exposes a native FSEvents backend again.

