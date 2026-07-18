# Quality Guidelines

> Frontend quality standards, forbidden patterns, and verification expectations.

---

## Overview

Quality in this repo means matching the owning surface, preserving trust boundaries, and proving the exact behavior changed. A focused test can close a narrow code contract, but it cannot replace packaged Electron evidence, real-profile migration evidence, or production/preview Nexus evidence when a roadmap item explicitly requires those artifacts.

---

## Forbidden Patterns

- Raw `ipcMain`, `ipcRenderer`, raw channels, or ad-hoc preload exposure in CoreApp.
- New browser-native clipboard fallback in plugins, such as `navigator.clipboard`, when plugin clipboard SDK permission gates should be used.
- Plugin shell/network/fs/clipboard/window/AI mutations after permission SDK failure, missing SDK, or user denial.
- Plaintext provider secrets, API keys, tokens, prompts, responses, recovery codes, or sensitive paths in ordinary JSON, localStorage, logs, analytics, or sync payloads.
- New `div/span @click` for normal controls when native `button`, `input`, `select`, tabs, menus, or TuffEx primitives can express the control.
- Nexus SSR output that depends on `window`, `document`, localStorage, random values, current time, or unhydrated user state.
- Mock, dry-run, local-only, or isolated evidence marked as production completion.
- Mixing unrelated CoreApp, Nexus, plugin, package, and docs changes in one slice.

---

## Required Patterns

- Use TuffEx for new primitives and semantic interactive controls.
- Use typed transport/domain SDKs instead of raw channels.
- Fail closed with an explicit reason when a permission, SDK, host capability, provider, or platform dependency is unavailable.
- Keep user-facing text in the owning message catalog or localized manifest path.
- Preserve existing class/event contracts during semantic UI migrations.
- Normalize untrusted or cross-layer payloads at the boundary.
- Keep generated chunks, local profiles, raw logs, and exploratory evidence out of source changes unless an evidence README explicitly lists them as curated artifacts.

---

## Testing Requirements

Choose the smallest meaningful verification for the slice:

- TuffEx component primitives: component-local Vitest tests plus focused lint/type checks when relevant.
- CoreApp renderer UI: nearest Vitest tests and `pnpm -C "apps/core-app" run typecheck:web` when the change touches renderer types.
- CoreApp main/transport/SDK surfaces: focused main/module tests and `pnpm -C "apps/core-app" run typecheck:node` when applicable.
- Plugins: plugin-local tests/build/lint when scripts exist, plus manifest validation for manifest changes.
- Nexus: focused route/component/build guard tests, `pnpm -C "apps/nexus" run typecheck`, and production preview evidence when the TODO requires it.
- Always run `git diff --check` before reporting completion.

Package-level recommended commands are listed in:

- `apps/core-app/AGENTS.md`
- `apps/nexus/AGENTS.md`
- `plugins/AGENTS.md`

---

## Evidence Boundaries

- R2 AI Stable visible evidence is governed by `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/README.md` and its strict verifier.
- A visible-evidence claim about the current CoreApp version must run the strict verifier with `--requireCurrentVersion`; a historical 13/13 manifest may still prove its dated artifact snapshot, but it must not be relabeled as current packaged evidence when `baselineVersion` differs from `apps/core-app/package.json`.
- R3 Search / Indexing Runtime evidence is governed by `docs/plan-prd/TODO-R3.md` and `docs/engineering/reports/r3-indexing-runtime-2026-06-25/README.md`.
- Nexus performance and production conclusions are governed by `docs/plan-prd/TODO-nexus.md`.
- Governance production evidence must distinguish `live`, `d1`, `r2`, `local-only`, `memory`, and `open`.
- Isolated/controlled evidence can prove wiring, guardrails, or artifact collectors. It must not be rewritten as real-profile or production proof.

---

## Code Review Checklist

Reviewers should check:

- Does the change stay inside the owning package and task slice?
- Are interactive elements semantic, focusable, and keyboard accessible?
- Are plugin and host trust boundaries fail-closed?
- Are shared payloads typed in the owning package and normalized at runtime?
- Are secrets, paths, prompt/response content, and provider credentials kept out of ordinary logs/state/storage?
- Are i18n strings in the correct catalog or localized manifest path?
- Are tests focused on the changed behavior, and is any required evidence stronger than the test?
- Does `git diff --check` pass?

---

## Common Mistakes

- Treating "typecheck passed" as proof of user-visible Electron behavior.
- Treating local-only Nexus smoke as deployed Cloudflare production evidence.
- Pairing a verifier JSON from one run with screenshots or DOM from another run.
- Fixing a semantic control by adding ARIA to a `div` when a native button is available.
- Updating a shared payload in one package without updating SDK mirror tests.

---

## Scenario: Official Plugin Release Seed Integrity

### 1. Scope / Trigger

- Apply this contract when changing Tuff plugin exporter staging, canonical official plugin builds, CoreApp packaged plugin seeds, runtime bootstrap, or release orchestration.
- Canonical source and version ownership stays under `plugins/<plugin>/`; `apps/core-app/resources/bundled-plugins/<plugin>/` is generated package input and Electron `Resources/bundled-plugins/<plugin>/` is immutable release payload.

### 2. Signatures

- Exporter internal classifier: `isGeneratedPackageOutputEntry(entryName: string): boolean`.
- Official build registry: `OFFICIAL_PLUGIN_BUILD_TARGETS: ReadonlyArray<{ packageName: string; pluginName: string }>`.
- Build orchestration: `buildOfficialPluginPackages(options?): string[]` returns the exact successful package build order.
- Single seed sync: `syncOfficialPluginBundledRuntime(pluginName, options?): SyncResult`.
- All-seed sync: `syncOfficialPluginBundledRuntimes(options?): SyncResult[]`.
- Packaged verifier: `verifyPackagedOfficialPluginSeeds(context): void`.
- Runtime bootstrap: `installBundledOfficialPluginSeeds({ seedRoot, runtimePluginRoot }): OfficialPluginSeedResult[]`; it is synchronous by contract.

### 3. Contracts

- Exporter staging must exclude top-level `out`, `build`, and case-insensitive `*.tpex` entries from source payload collection.
- Release order is CLI core, CLI entrypoint, every `OFFICIAL_PLUGIN_BUILD_TARGETS` package, every seed projection, plugin prelude bundling, CoreApp build/package, then after-pack seed verification.
- `electron-vite build` or direct `electron-builder --dir` only packages the existing resource projection; it does not rebuild/synchronize canonical official plugin code. After any official plugin source/build change, release/evidence flow must run canonical plugin build + `syncOfficialPluginBundledRuntimes` before packaging.
- A successful projection result contains `pluginName`, `packageName`, `canonicalBuildRoot`, `bundledPluginRoot`, `canonicalVersion`, `synced: true`, and `skipped: false`.
- Packaged startup must finish seed validation/install into `<runtime-root>/modules/plugins` before `ModuleManager` construction; replacement preserves `data`/`logs` and never downgrades an identity-matching newer local runtime.

### 4. Validation & Error Matrix

- Unsupported plugin name -> `syncOfficialPluginBundledRuntime` throws.
- Missing canonical `dist/build`, `package.json`, or built `manifest.json` -> sync returns `reason: 'missing-canonical-build'`; release orchestration must throw.
- Built manifest name differs from registry plugin name -> throw canonical-build mismatch.
- Built manifest version differs from canonical package version -> throw canonical-build mismatch.
- Any prerequisite or plugin package build exits non-zero -> stop immediately; do not sync or package CoreApp.
- Missing packaged seed, version mismatch, nested `dist`, or nested `.tpex` -> `afterPack` throws and packaging fails.
- Missing/empty/invalid runtime seed set -> runtime installer throws before mutating any plugin.
- Older, corrupt, wrong-identity, or same-version/different-signature local runtime -> staged clean replacement with rollback.
- Same-version canonical build differs from `apps/core-app/resources/bundled-plugins/<plugin>` -> treat the resource projection as stale even if after-pack version checks pass; synchronize content before packaging. Runtime same-version signature repair only helps when the packaged seed itself is current.
- Identity-matching newer local runtime -> return `newer-local` without mutation.

### 5. Good / Base / Bad Cases

- Good: repeated builds keep only the current archive outside `dist/build`; packaged Resources contain two clean official seeds; a fresh profile discovers both during initial plugin loading.
- Base: a clean checkout builds CLI prerequisites and both official plugins, projects them, packages/verifies them, then installs them before module startup.
- Bad: copying the whole canonical `dist` directory, seeding after plugin discovery starts, or overwriting newer local runtime/data is prohibited.

### 6. Tests Required

- Both exporter implementations: seed a stale top-level `.tpex`, build, then assert absence from `dist/out`, `dist/build`, and `manifest._files`.
- Build orchestration: assert prerequisite/plugin order and assert a failed build prevents later builds.
- Seed projection and after-pack: assert clean stale-file removal, canonical version propagation, packaged resource presence, and fail-closed missing/mismatch/artifact behavior.
- Runtime bootstrap: assert immediate synchronous return, pre-mutation validation, clean install/update, data/log preservation, wrong-identity repair, and newer-local no-downgrade.
- Content freshness: compare canonical `dist/build` files with the bundled resource projection (excluding the resource-only package metadata where applicable), then verify a previously installed same-version/different-signature runtime is refreshed on startup.
- Release smoke: package CoreApp, inspect actual Resources, then launch a fresh isolated profile and assert both seeds are discovered during initial plugin loading.

### 7. Wrong vs Correct

#### Wrong

```js
// Wrong: packages whichever generated seed happens to be in resources.
electronViteBuild();
electronBuilderDir();
startModuleManager();
```

#### Correct

```js
// Correct: canonical build and projection precede Electron packaging.
buildOfficialPluginPackages({ projectRoot, workspaceRoot });
const results = syncOfficialPluginBundledRuntimes({
  projectRoot,
  workspaceRoot,
});
if (results.some((result) => !result.synced))
  throw new Error("Official plugin seed sync failed");
electronViteBuild();
electronBuilderDir();
installBundledOfficialPluginSeeds({ seedRoot, runtimePluginRoot });
startModuleManager();
```

## Scenario: DeepAgent Usage Signal Integrity

### Scope

- Trigger: LangChain/DeepAgent returns a provider response used by `agent.run` or `workflow.execute`.
- The runtime must not replace available token usage with hardcoded zeroes.

### Contract

- Normalize OpenAI Responses `usage.input_tokens/output_tokens/total_tokens` and LangChain `AIMessage.usage_metadata` into `IntelligenceUsageInfo`.
- Prefer an explicit root aggregate; otherwise sum each assistant message once, including `kwargs` serialization shapes without double-counting mirrored fields.
- Reject non-finite/negative values and preserve the invariant `totalTokens >= promptTokens + completionTokens`.
- Adapter `run()` exposes usage with provider/model metadata.
- `agent.run` returns adapter usage; prompt/agent workflow step outputs retain it; workflow top-level usage sums prompt, agent, and stable model step outputs.
- Return explicit zero usage only when no step/provider reported usage.

### Validation

- Pure parser tests cover Responses, LangChain direct/kwargs, common response metadata aliases, mirrored fields, and malformed input.
- CoreApp orchestration tests cover agent propagation, mixed workflow aggregation, and the no-usage zero fallback.
- Package build must emit declarations successfully.

### Wrong vs Correct

#### Wrong

```ts
usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
```

#### Correct

```ts
usage: aggregateWorkflowUsage(run.outputs)
```

## Scenario: Electron Main Singleton Cycle Safety

### 1. Scope / Trigger

- Apply when an Electron main-process barrel exports both a service class/accessor and an eagerly constructed module singleton, and any dependency can reach that barrel again during module evaluation.

### 2. Signatures

- `getSentryService(): SentryServiceModule` returns the process singleton.
- `sentryModule: SentryServiceModule` is initialized only after the class and accessor declarations in `sentry-service.ts` have evaluated.
- `modules/sentry/module.ts` re-exports the initialized singleton; it does not construct a second instance.

### 3. Contracts

- Internal consumers continue importing `getSentryService` from the public `modules/sentry` barrel so Vitest mocks and the package boundary remain stable.
- The service implementation owns singleton creation after its class declaration. The barrel and compatibility module only re-export that binding.
- Controller extraction must not add a controller-to-facade import edge; inject facade-owned callbacks instead.

### 4. Validation & Error Matrix

- Singleton constructor runs before the class binding initializes -> production Electron throws `ReferenceError: Cannot access '<Service>' before initialization` during app load.
- Consumer bypasses the public barrel -> existing barrel mocks no longer isolate Electron-only dependencies in unit tests.
- Two files construct the singleton -> lifecycle registration, telemetry queues, and shutdown can diverge between instances.

### 5. Good / Base / Bad Cases

- Good: an isolated Electron profile reaches `TouchApp runtime initialized` and the owning module's initialized log without a TDZ error.
- Base: production build, focused module tests, and an Electron startup smoke all pass with one singleton instance.
- Bad: `module.ts` imports the class and executes `new Service()` while the service dependency graph can re-enter the barrel.

### 6. Tests Required

- Focused lifecycle tests keep mocking the public barrel and must pass without importing Electron runtime APIs.
- `typecheck:node` and the CoreApp main/preload/renderer production build must pass.
- Launch the built main process with an isolated `--user-data-dir`; assert the owning module initializes and logs contain no TDZ or `App threw an error during load` failure.

### 7. Wrong vs Correct

#### Wrong

```ts
// module.ts can execute during a cycle before Service is initialized.
import { Service, setService } from './service'
export const serviceModule = new Service()
setService(serviceModule)
```

#### Correct

```ts
// service.ts, after the class and accessor declarations.
export const serviceModule = getService()

// module.ts
export { serviceModule } from './service'
```
