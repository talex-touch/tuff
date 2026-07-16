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
- Cross-platform package command resolver: `resolvePnpmBuildInvocation(packageName, { platform?, comSpec? }): { executable: string; args: string[] }`.
- Single seed sync: `syncOfficialPluginBundledRuntime(pluginName, options?): SyncResult`.
- All-seed sync: `syncOfficialPluginBundledRuntimes(options?): SyncResult[]`.
- Packaged verifier: `verifyPackagedOfficialPluginSeeds(context): void`.
- Runtime bootstrap: `installBundledOfficialPluginSeeds({ seedRoot, runtimePluginRoot }): OfficialPluginSeedResult[]`; it is synchronous by contract.

### 3. Contracts

- Exporter staging must exclude top-level `out`, `build`, and case-insensitive `*.tpex` entries from source payload collection.
- Release order is CLI core, unplugin exporter, CLI entrypoint, TuffEx, every `OFFICIAL_PLUGIN_BUILD_TARGETS` package, every seed projection, plugin prelude bundling, CoreApp build/package, then after-pack seed verification. A clean checkout cannot assume any workspace `dist` output exists.
- `electron-vite build` or direct `electron-builder --dir` only packages the existing resource projection; it does not rebuild/synchronize canonical official plugin code. After any official plugin source/build change, release/evidence flow must run canonical plugin build + `syncOfficialPluginBundledRuntimes` before packaging.
- `apps/core-app` directly owns compatible `electron-builder` and `electron-builder-squirrel-windows` dev dependencies because `build-target.js` executes its package-local binary; do not rely on undeclared/transitive workspace hoisting.
- Release CI sets `ELECTRON_BUILDER_CACHE` to a `${{ github.workspace }}/..` sibling, never inside `${{ github.workspace }}`: downloaded CommonJS helper `.js` files must remain outside the root `type: module` package boundary.
- `electron-builder.yml` owns one top-level, filesystem-safe `executableName` for every platform; Linux must not derive it from the scoped CoreApp package name.
- Beta runtime, installer filename, and updater metadata versions remain the exact package `-beta.N` version on every platform; the preview no-publish policy must not rewrite Windows to `SNAPSHOT.N`.
- Nexus owns one asset per platform/architecture pair; GitHub backfill ranks platform defaults instead of preserving an arbitrary last-linked duplicate (`AppImage > deb > snap`, `dmg > zip`, versioned setup executable on Windows).
- CoreApp lint ignores `resources/bundled-plugins/**`; these are synchronized immutable release payloads, and quality checks run against their canonical plugin sources instead of generated/minified projections.
- A successful projection result contains `pluginName`, `packageName`, `canonicalBuildRoot`, `bundledPluginRoot`, `canonicalVersion`, `synced: true`, and `skipped: false`.
- Packaged startup must finish seed validation/install into `<runtime-root>/modules/plugins` before `ModuleManager` construction; replacement preserves `data`/`logs` and never downgrades an identity-matching newer local runtime.

### 4. Validation & Error Matrix

- Unsupported plugin name -> `syncOfficialPluginBundledRuntime` throws.
- Missing canonical `dist/build`, `package.json`, or built `manifest.json` -> sync returns `reason: 'missing-canonical-build'`; release orchestration must throw.
- Built manifest name differs from registry plugin name -> throw canonical-build mismatch.
- Built manifest version differs from canonical package version -> throw canonical-build mismatch.
- Any prerequisite or plugin package build exits non-zero -> stop immediately; do not sync or package CoreApp.
- Missing TuffEx `dist/es/base.css` or component CSS before `touch-translation` build -> Vite resolution failure; build `@talex-touch/tuffex` before official plugin targets.
- Windows direct `execFileSync('pnpm.cmd', args)` under Node 24 -> fail with `spawnSync pnpm.cmd EINVAL`; resolve it through `ComSpec`/`cmd.exe /d /s /c pnpm.cmd` and preserve argument ordering.
- Missing `apps/core-app/node_modules/.bin/electron-builder` after a frozen install -> release packaging must fail before artifact claims; restore the direct CoreApp dependencies and lockfile rather than bypassing the lookup.
- Builder helper cache inside the repository -> Node 24 treats downloaded CommonJS `icon-tool.js` as ESM and rejects `require`; relocate the cache, do not patch downloaded files.
- Missing explicit Linux executable name with scoped package metadata -> AppImage rejects the derived `@talex-touchcore-app`; set the shared Builder `executableName`, do not un-scope the workspace package.
- Windows Builder `extraMetadata.version` rewritten from `beta.N` to `SNAPSHOT.N` -> published installer and `latest.yml` disagree with the release tag; package with the canonical beta version and fail the Windows artifact gate on any mismatch.
- Multiple GitHub Linux formats linked to one Nexus platform/architecture pair -> last-write order can leave Debian selected; backfill must rank AppImage above Debian rather than short-circuiting on the current exact filename.
- Missing packaged seed, version mismatch, nested `dist`, or nested `.tpex` -> `afterPack` throws and packaging fails.
- Missing/empty/invalid runtime seed set -> runtime installer throws before mutating any plugin.
- Older, corrupt, wrong-identity, or same-version/different-signature local runtime -> staged clean replacement with rollback.
- Same-version canonical build differs from `apps/core-app/resources/bundled-plugins/<plugin>` -> treat the resource projection as stale even if after-pack version checks pass; synchronize content before packaging. Runtime same-version signature repair only helps when the packaged seed itself is current.
- Identity-matching newer local runtime -> return `newer-local` without mutation.

### 5. Good / Base / Bad Cases

- Good: repeated builds keep only the current archive outside `dist/build`; packaged Resources contain two clean official seeds; a fresh profile discovers both during initial plugin loading.
- Base: a clean checkout builds CLI core, the unplugin exporter, the CLI entrypoint, TuffEx, and both official plugins; exporter `dist/vite.js` precedes the CLI build, TuffEx CSS precedes `touch-translation`, the CoreApp-local Builder binary exists, its helper cache stays outside the repository package boundary, every platform packages the explicit `tuff` executable with the canonical version, and Nexus selects the preferred format for each platform/architecture pair.
- Bad: copying the whole canonical `dist` directory, seeding after plugin discovery starts, or overwriting newer local runtime/data is prohibited.

### 6. Tests Required

- Both exporter implementations: seed a stale top-level `.tpex`, build, then assert absence from `dist/out`, `dist/build`, and `manifest._files`.
- Build orchestration: assert the exact CLI core -> exporter -> CLI entrypoint -> TuffEx -> official target order, and assert a failed build prevents later builds.
- Package command resolution: assert POSIX invokes `pnpm` directly and Windows invokes the configured `ComSpec` with `/d /s /c pnpm.cmd --filter <package> run build`.
- Release preflight: `pnpm -C apps/core-app exec electron-builder --version` must pass after a frozen install, then a package smoke must produce a real platform artifact.
- Workflow cache preflight: actionlint passes and `ELECTRON_BUILDER_CACHE` resolves to a sibling of `github.workspace`, not inside it.
- Linux package-name preflight: the unpacked executable is `tuff`, and a prepackaged AppImage build passes Builder's critical-path name validation before invoking the host-specific AppImage tool.
- Windows release artifact preflight: the setup filename and `latest.yml` version exactly equal `apps/core-app/package.json`.
- Nexus backfill preflight: a dry run against a release containing both AppImage and Debian candidates plans AppImage for the Linux/x64 pair.
- Lint preflight: run CoreApp lint with a cold/no-cache path and assert bundled plugin payloads are ignored while maintained CoreApp source remains covered.
- Seed projection and after-pack: assert clean stale-file removal, canonical version propagation, packaged resource presence, and fail-closed missing/mismatch/artifact behavior.
- Runtime bootstrap: assert immediate synchronous return, pre-mutation validation, clean install/update, data/log preservation, wrong-identity repair, and newer-local no-downgrade.
- Content freshness: compare canonical `dist/build` files with the bundled resource projection (excluding the resource-only package metadata where applicable), then verify a previously installed same-version/different-signature runtime is refreshed on startup.
- Release smoke: package CoreApp, inspect actual Resources, then launch a fresh isolated profile and assert both seeds are discovered during initial plugin loading.

### 7. Wrong vs Correct

#### Wrong

```js
// Wrong: packages whichever generated seed happens to be in resources.
execFileSync("pnpm.cmd", ["--filter", packageName, "run", "build"]);
electronViteBuild();
electronBuilderDir();
startModuleManager();
```

#### Correct

```js
// Correct: canonical build and projection precede Electron packaging.
buildOfficialPluginPackages({
  projectRoot,
  workspaceRoot,
  runPackageBuild(packageName) {
    const { executable, args } = resolvePnpmBuildInvocation(packageName);
    execFileSync(executable, args);
  },
});
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

## Scenario: Opaque Intelligence Caller Aggregation

### Scope

- Trigger: Intelligence audit logs are folded into day/month usage rows for quota enforcement and analytics.
- Canonical plugin callers contain `:` (`plugin:<manifest id>`); caller ids are opaque values, not delimiter-encoded tuples.

### Contract

- Preserve caller ids byte-for-byte through grouping and DB upsert.
- Use structured bucket fields for caller, period type, and period; never recover them with `split(":")`.
- Every audit contributes to exactly one day and one month bucket.
- Distinct callers such as `plugin:acme` and `plugin:acme:beta` remain distinct.
- Aggregate requests, success/failure, prompt/completion/total tokens, cost, and weighted latency exactly.
- `system` keeps system caller type; existing non-system callers keep plugin caller type.

### Validation

- Pure aggregation tests cover one-colon and multi-colon callers, system, separate buckets, totals, and weighted latency.
- Focused diagnostics and lint must pass.
- Quota code must query the same opaque caller id/caller type written by aggregation.

### Wrong vs Correct

#### Wrong

```ts
const [caller, periodType, period] = key.split(":");
```

#### Correct

```ts
for (const { callerId, callerType, periodType, period, summary } of buckets) {
  // persist structured fields directly
}
```

## Scenario: Local Knowledge Context Budget Integrity

### Scope

- Trigger: changing local-knowledge search results, Context Builder packing, chunk token estimates, or retrieval metadata.
- The host-owned `tokenBudget` is a hard upper bound for complete indexed chunks, not a target that the first result may exceed.

### Contract

- Skip every candidate whose addition would make aggregate `tokenEstimate` exceed the normalized budget, including the first candidate.
- Continue scanning after an oversized candidate so later smaller hits remain eligible.
- Do not truncate chunk content during packing; chunk identity, citation, and indexed text stay aligned.
- If search is `ok` with hits but no complete chunk fits, return `degraded` with `degradedReason: "token-budget-exhausted"`, empty context/chunks/citations, and zero token estimate.
- A genuine zero-hit search remains an `ok` empty result. Preserve upstream unavailable/degraded reasons.
- Use the shared host-owned conservative estimator for ContextHygiene and local knowledge. Count contiguous ASCII runs as `ceil(codePoints / 4)`, each non-ASCII code point as at least one, and emoji more conservatively; do not reintroduce per-service UTF-16 `length / 4` copies.
- Re-evaluate persisted turn/chunk content when mapping rows and expose `max(storedEstimate, currentContentEstimate)`. This is a read-time budget guard, not a SQLite rewrite.
- Treat the result as tokenizer-independent budget governance only. Never document or bill it as an exact provider/model token count.
- Allow aggregate overflow only through an explicit normal `current_input` admission. Never derive the exception from `items.length`, because a privacy-blocked current turn would transfer it to the first optional summary/turn/memory/retrieval item.
- Normalize runtime token budgets before arithmetic: accept only finite numbers, floor and clamp them to at least 1, use the service's finite fallback for every other value, and never coerce numeric strings. ContextHygiene falls back to 1,600; local knowledge fails closed to 1.
- Apply the same normalizer to storage-degraded `IntelligenceContextExecutionSummary` and Provider options metadata; the fallback path must never reintroduce `NaN`, infinity, or string coercion.

### Validation

- Focused tests put an oversized hit before a smaller hit and assert only the fitting hit and citation are returned within budget.
- Focused tests make every hit oversized and assert the explicit empty degraded result without leaked chunk text.
- Pure estimator tests cover whitespace, ASCII boundaries, CJK, emoji/ZWJ sequences, and mixed text.
- Legacy-row regressions store a low CJK estimate, prove current content controls packing/package totals, and prove no update rewrites the historical row.
- A privacy regression excludes a secret current input, presents an oversized safe legacy summary as the first optional source, and asserts empty package content plus metadata-only privacy/budget exclusions. A companion case keeps an oversized normal current input while pruning the optional summary.
- Normalization regressions cover fractions, zero/negative, omitted/null/string, `NaN`, and both infinities; service tests assert finite persisted/returned budgets and fail-closed knowledge packing.
- Degraded-summary regressions force preparation failure and assert malformed budgets become finite 1,600 in both the returned summary and Provider invocation metadata; a valid fraction still floors.
- Existing dedupe, `maxChunks`, filtering, FTS failure, lint, and node type-check coverage must remain green.

### Wrong vs Correct

#### Wrong

```ts
if (nextEstimate > budget && selected.length > 0) continue
```

#### Correct

```ts
if (nextEstimate > budget) continue
```

## Scenario: Assistant Floating-Ball Display Restore

### Scope

- Trigger: changing Assistant floating-ball position persistence, initial bounds, display selection, or desktop work-area handling.
- Electron desktop coordinates may be negative when a display sits left of or above the primary display.

### Contract

- Only the canonical `{ x: -1, y: -1 }` pair means no saved position; every other finite pair is a persisted desktop coordinate.
- Resolve a persisted position with `screen.getDisplayNearestPoint(savedPoint)`, not the current cursor display.
- Resolve the unset/default position from `screen.getCursorScreenPoint()` and retain existing edge-padding/default-height placement.
- Clamp the complete floating-ball bounds into the resolved display work area so removed displays and layout changes recover visibly.
- Preserve size, opacity, debounced persistence, click behavior, and the existing settings schema.
- After successful module initialization, register one shared handler for `display-added`, `display-removed`, and `display-metrics-changed`; remove that exact handler during teardown.
- Display events must not create Assistant windows or overwrite the persisted position used to recover a temporarily disconnected display.
- Reapply bounds to a live floating ball. Reanchor only a visible Voice Panel, without show, focus, or `panelOpened` broadcast side effects.

### Validation

- Focused tests cover a negative saved coordinate while the cursor is on another display, canonical unset placement, and off-work-area clamping.
- Focused lifecycle tests assert all three listeners share handler identity, teardown removes them, and no live ball means no window creation.
- Focused recovery tests assert removed-display clamping without config persistence and visible/hidden Voice Panel behavior without focus/show/broadcast side effects.
- Main-process lint and node type-check must pass.
- Code/focused tests do not replace real multi-display/HiDPI or current-version packaged evidence.

### Wrong vs Correct

#### Wrong

```ts
const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
const x = saved.x >= 0 ? saved.x : defaultX
```

#### Correct

```ts
const hasSavedPosition = saved.x !== -1 || saved.y !== -1
const anchor = hasSavedPosition ? saved : screen.getCursorScreenPoint()
const display = screen.getDisplayNearestPoint(anchor)
```

## Scenario: Mode-Isolated Renderer Surface Loading

### Scope

- Trigger: changing `AppEntrance.vue` or another renderer entry shared by mutually exclusive Electron window modes.
- Static SFC imports enter the shared startup graph even when the active window mode can never render that surface.

### Contract

- Mode-exclusive Assistant surfaces use named `defineAsyncComponent(() => import(exactPath))` declarations; do not keep a static import of the same SFC.
- Preserve template branch order, component tags, startup mode logging, and the behavior inside each surface.
- Do not lazy-load latency-critical CoreBox/DivisionBox or unrelated window modes as part of an Assistant-only isolation change.
- Do not add a loading overlay, remote fetch, preload bridge, duplicate registry, or dependency solely to split the chunk.

### Validation

- A focused source contract rejects static imports for each exact mode-exclusive path and requires its named dynamic declaration.
- Run web type-check and targeted lint.
- Run the production renderer build and confirm distinct JavaScript chunks for each surface; a source assertion alone does not prove Rollup output.
- Chunk presence proves isolation wiring, not measured startup latency, packaged install-size reduction, or current-version visual evidence.

### Wrong vs Correct

#### Wrong

```ts
import VoicePanel from './views/assistant/VoicePanel.vue'
```

#### Correct

```ts
const VoicePanel = defineAsyncComponent(
  () => import('./views/assistant/VoicePanel.vue')
)
```

## Scenario: Context Execution Degraded Secret Fallback

### Scope

- Trigger: changing host-owned `contextInvoke` / `contextStream`, ContextHygiene preparation, storage-degraded fallbacks, or current-only Provider payloads.
- The availability fallback runs before durable privacy classification can be guaranteed, so it must enforce the same synchronous host secret policy itself.

### Contract

- Reuse the ContextHygiene classifier. Never copy its regex list into ContextExecution.
- Classify raw input before constructing a degraded current-only payload. Unsafe input throws stable `CONTEXT_CURRENT_INPUT_POLICY_BLOCKED` for invoke and stream.
- Do not call the Provider, append an assistant turn, or include raw secret content in errors, logs, summaries, audit metadata, or recovery detail.
- Safe input keeps the existing `context_prepare_failed` current-only fallback and caller/governance metadata.

### Validation

- Force preparation to fail before classification, then assert secret-bearing invoke and stream requests both reject and their Provider methods remain untouched.
- Assert the surfaced error is stable and contains no secret value; retain the safe degraded-fallback regression.

### Wrong vs Correct

#### Wrong

```ts
catch {
  return assembler.currentOnly(request)
}
```

#### Correct

```ts
catch {
  if (!isContextInputProviderSafe(request.input))
    throw new Error('CONTEXT_CURRENT_INPUT_POLICY_BLOCKED')
  return assembler.currentOnly(request)
}
```

## Scenario: Monotonic Context Privacy Classification

### Scope

- Trigger: changing `PrepareContextTurnInput.privacyLevel`, secret detection, turn persistence, redaction, or ContextPackage current-input admission.
- A caller privacy hint may make safe content more private; it must never downgrade content the host classifies as secret.

### Contract

- Run host secret detection before honoring the caller hint. Detected secret always resolves to `privacyLevel: "secret"` regardless of explicit `normal` or `private`.
- Redact secret content before SQLite writes and exclude it from ContextPackage with `secret-policy-blocked` metadata-only evidence.
- Never include the raw secret in turn results, package logs, metadata, errors, or audit data.
- Preserve explicit `private` for safe content, including canonical redaction and `private-policy-blocked` exclusion.
- Keep one shared classifier for normal persistence and degraded Provider fallback. It must recognize credential-like `Bearer` values (at least 16 standard token characters) and JSON-looking three-segment JWTs.
- Preserve bounded false-positive behavior: short placeholders such as `Bearer token` / `Bearer <token>` and generic dotted text such as `foo.bar.baz` remain safe.

### Validation

- Table-test explicit normal/private hints on secret-bearing input and assert secret classification, redacted persistence, exclusion, and raw-value absence across every serialized payload.
- Keep a safe explicit-private control so the fix cannot erase valid caller privacy intent.
- Credential classifier tests exercise realistic synthetic Bearer/JWT values through MemoryPolicy, turn persistence/package logging, and degraded invoke/stream; assert Provider isolation and raw-value absence.
- Pair every expanded credential pattern with explicit placeholder/non-secret controls.

### Wrong vs Correct

#### Wrong

```ts
const privacyLevel = input.privacyLevel ?? (containsSecret(input.input) ? 'secret' : 'normal')
```

#### Correct

```ts
const privacyLevel = containsSecret(input.input)
  ? 'secret'
  : (input.privacyLevel ?? 'normal')
```

## Scenario: Ollama NDJSON Stream Integrity

### Scope

- Trigger: changing `LocalProvider.chatStream()`, NetworkService stream chunk conversion, Ollama NDJSON framing, or terminal usage mapping.
- Node transport chunks and UTF-8 code points are independent boundaries; neither may be treated as a complete string or JSON frame.

### Contract

- Use one stateful UTF-8 decoder for the entire response. Convert Buffer/Uint8Array/string adapter chunks to bytes before decoder writes and flush it exactly once at EOF.
- Keep an independent newline buffer for Ollama NDJSON. Parse only complete lines during streaming, then process the final buffered line after decoder flush.
- A final `done: true` line without trailing newline emits any content delta followed by exactly one terminal chunk carrying Ollama prompt/completion/total usage.
- If Ollama omits `done`, emit one synthetic terminal chunk after all buffered text. Preserve the existing newline-terminated done and typed pre-output HTTP 404 compatibility fallback.
- Treat the first non-empty Ollama delta as the provider-internal compatibility commit point. Compatibility fallback requires `NetworkHttpStatusError.status === 404` before that point; arbitrary parser/provider messages containing `404`, post-delta 404s, and every other error propagate unchanged without fallback deltas or synthetic success.
- Do not claim built-in llama.cpp/GGUF management from this compatibility path; runtime binaries, model lifecycle UI, packaging, and device smoke need separate evidence.

### Validation

- Split synthetic Chinese and emoji bytes inside code points and split NDJSON at different boundaries; assert exact ordered text and no replacement character.
- End a usage-bearing done frame without `\n`; assert final delta, exact usage, and a single done chunk.
- Keep focused non-stream chat, model discovery, OCR, and 404 fallback coverage green.
- Cover all sides of fallback classification: typed pre-output HTTP 404 returns compatibility chunks; a generic error message containing `404` propagates unchanged; post-delta typed 404 returns the original error, never calls compatibility, and emits no second-backend/done chunk.

### Wrong vs Correct

#### Wrong

```ts
buffer += chunk.toString('utf8')
```

#### Correct

```ts
buffer += decoder.write(toStreamBuffer(chunk))
// EOF: buffer += decoder.end()
```

## Scenario: Network Stream Cooldown Settlement

### Scope

- Trigger: changing `NetworkService.requestStream()`, stream transport conversion, cooldown/retry policy, or an AI provider that consumes the returned body.
- A successful HTTP response object proves only that the stream opened; it does not prove the body completed.

### Contract

- Preserve fetch/open retry and HTTP status behavior. Do not retry a body failure after the stream has been handed to a consumer because visible bytes may already exist.
- Defer guard success until the Node readable emits normal `end`. Apply the configured `autoResetOnSuccess` only then.
- Record a readable `error` as exactly one guard failure and leave the same error observable to async iteration.
- Treat early `close` without `end` or `error` as consumer cancellation: record neither success nor failure, so prior guard state remains unchanged.
- Remove lifecycle listeners after the first terminal event and make policy settlement idempotent.

### Validation

- Prime one failure under `failureThreshold: 2`; opening an unconsumed stream must not reset it.
- After one prior failure, yield a body chunk and then error; the consumer receives the error and the next same-key request is blocked without another fetch.
- Fully consume a body and prove a later single failure does not activate threshold-two cooldown.
- Destroy a stream early and prove the next failure is executed, then the following request is blocked: cancellation added no failure and cleared none.
- Keep LocalProvider UTF-8/framing/fallback regressions green; downstream parser errors are provider failures, not transport body errors.

### Wrong vs Correct

#### Wrong

```ts
const result = await openStream();
guard.recordSuccess(key);
return result;
```

#### Correct

```ts
stream.once("end", settleSuccess);
stream.once("error", settleFailure);
stream.once("close", cleanupWithoutSettlement);
```
