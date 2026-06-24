# Full Repo Audit Lint - 2026-06-24

> Scope: follow up the previous full-repository expert audit and mark which baseline findings are fixed, partially fixed, or still open.

## Baseline

- Previous audit baseline commit: `be75f9e32` (`feat: refine nexus intelligence and select workflows`, 2026-06-22 01:44:32 +0800).
- Current HEAD inspected: `bd9509366` (`docs(ai): update r2 visible surface todo`).
- Current workspace state: includes uncommitted user changes. This report intentionally evaluates the working tree, not only committed `HEAD`.
- Previous HTML artifact was not present at `.workflow/.scratchpad/analyze-20260622000000/expert-audit-report.html`, so this lint report reconstructs the baseline from the last audit summary and current code evidence.

## Executive Summary

The repository has made meaningful progress since `be75f9e32`: provider registry coverage, credential redaction evidence, visible experience probes, plugin permission diagnostics, network recovery tests, and several CoreApp contract tests were added or expanded. However, the two original P1 risks are not fully closed. The Electron plugin window path still always falls back to the compatibility profile, and Nexus still lacks a machine-verifiable all-route security contract.

Status count:

| Status | Count |
| --- | ---: |
| Fixed | 0 |
| Partially fixed | 6 |
| Open | 2 |

## Severity-Ordered Findings

| Severity | ID | Baseline Finding | Current Status | Evidence | Next Gate |
| --- | --- | --- | --- | --- | --- |
| P1 | A1 | Electron compatibility plugin window keeps broad privileges and dynamic preload attack surface. | Open | `compat-plugin-view` still sets `webSecurity: false`, `nodeIntegration: true`, `contextIsolation: false`, `sandbox: false`, and `webviewTag: true`. `resolvePluginViewSecurityProfile` always returns `effectiveProfile: 'compat-plugin-view'` even when the candidate is trusted. Dynamic preload is still assembled in `/tmp` with plugin injection code and original preload content. | Make trusted plugin view actually effective for trusted markers; block legacy preload/webview by manifest policy or explicit allowlist; stop composing arbitrary preload code into a temp script. |
| P1 | A2 | Nexus control-plane API surface is large and lacks a route-wide security contract. | Partially fixed | Many dashboard/admin route tests now assert `requireAdmin` / `requireAuth`, and `apps/nexus/package.json` has `check:api-routes`. The only route-tree script found is `build/check-server-api-route-tree.mjs`, which is structural, not an auth/scope contract. | Add a route manifest contract that enumerates every `server/api/**` endpoint with auth mode, role/scope, mutability, rate-limit/cache/privacy class, and fail CI when a route is missing or weaker than expected. |
| P2 | A3 | High-risk plugin capabilities are permission-gated but policy is dispersed inside plugins. | Partially fixed | Official plugins now show fail-closed guards and tests for `permission-sdk-unavailable`, `permission-denied`, and request failures. Examples include `plugins/touch-browser-data/index.js`, `plugins/touch-workspace-scripts/index.js`, `plugins/touch-quick-actions/index.js`, plus package-level plugin tests. Policy logic is still repeated per plugin instead of centralized in SDK helpers. | Move request/check/fail-closed/audit result mapping into `@talex-touch/utils/plugin` or a plugin SDK facade; keep plugin code declarative and test one shared contract. |
| P2 | A4 | Provider credentials have secure-store direction, but temporary plain `apiKey` paths and dev fallback need observability/redaction closure. | Partially fixed | Provider registry tests assert DB provider rows do not contain `secretKey` or `apiKey`; dry-run evidence documents no raw API key in summaries. Still, legacy intelligence provider create/patch/test endpoints accept body-level `apiKey`, and `test.post.ts` allows an override API key for probe calls. Dev fallback secure-store constants still exist for non-production paths. | Keep override API keys out of persistent paths, add explicit redaction tests for every probe/model-discovery/invoke response and log path, and add production gate tests that reject missing master keys. |
| P2 | A5 | Large single files and stores create maintenance and review risk. | Open | Current largest files remain very large: `platformGovernanceStore.ts` is 8560 lines, `dashboard/admin/governance.vue` is 5895 lines, `plugin-module.ts` is 3983 lines, `tuffIntelligenceLabService.ts` is 3735 lines, and several tests exceed 3000 lines. | Split by stable responsibility boundaries: storage schema/mutations/report projection, admin page view model/widgets, plugin window/runtime/install boundaries. Add size trend check for new growth before making it a hard gate. |
| P2 | A6 | i18n and SSR boundaries still contain inline fallback text plus time/random render risks. | Partially fixed | Locale files have grown and new route locale entries exist. Production app code still contains many `t('key', '中文 fallback')` call sites across auth, pricing, dashboard, privacy, team, and device auth pages. SSR-sensitive `new Date()`, `Date.now()`, and `Math.random()` still appear in app components/pages; some are client-only visual demos, but others are page/composable logic. | Add a lint rule or script that blocks Chinese fallback in production paths except documented tests/demos, and classify `Date.now` / `Math.random` usage as client-only, SSR-safe, or forbidden. |
| P3 | A7 | Test volume is good, but contract-level tests are insufficient. | Partially fixed | Since the baseline, many focused tests were added: CoreApp module contract tests, plugin security-profile tests, provider registry model fetch tests, visible evidence probes, network recovery tests, and provider redaction tests. Missing contracts remain around all Nexus routes, Electron security profile enforcement, plugin permission helper behavior, and package script parity. | Promote high-risk invariants into contract tests that fail on new routes/profiles/capabilities without explicit policy. |
| P3 | A8 | Package scripts and quality gates are inconsistent across subpackages/plugins. | Partially fixed | Core packages such as `apps/core-app`, `apps/nexus`, `packages/intelligence-uikit`, `packages/tuffex`, and several plugins have test/lint/typecheck scripts. Many packages/plugins still lack one or more gates: `packages/tuff-business` has no test/lint/typecheck/build gate; several plugins lack lint/typecheck; root package has quality gates but no direct `test` script. | Define package class profiles (`app`, `library`, `plugin`, `test-harness`) and validate required scripts per class in CI. |

## Detailed Notes

### A1. Electron Plugin Window Security

Current status is open. The current security base still defines a broad compatibility profile:

- `apps/core-app/src/main/core/window-security-profile.ts:35` to `43` sets `webSecurity: false`, `nodeIntegration: true`, `nodeIntegrationInSubFrames: true`, `contextIsolation: false`, `sandbox: false`, and `webviewTag: true`.
- `apps/core-app/src/main/modules/plugin/runtime/plugin-view-security-profile.ts:41` to `45` always returns `effectiveProfile: 'compat-plugin-view'`.
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts:1371` to `1428` still builds a temp preload script by concatenating plugin injection code, channel prelude code, and original preload content.

This means the new profile resolver currently works more like telemetry than enforcement. The candidate can be `trusted-plugin-view`, but the effective runtime remains compatibility mode. The hidden side effect is that future maintainers may believe the trusted profile is active because tests and logs mention it, while runtime privileges stay broad.

Recommended closure:

1. Make trusted candidates use `effectiveProfile: 'trusted-plugin-view'` once the marker and manifest conditions pass.
2. Treat legacy preload/webview as an explicit compatibility exception with a manifest flag, owner, and migration deadline.
3. Replace temp preload concatenation with a fixed preload that loads controlled bridge modules and refuses arbitrary plugin-provided preload unless compatibility mode is explicitly granted.

### A2. Nexus API Security Contract

Current status is partially fixed. There is clear improvement in endpoint-level tests and guards: provider registry, governance report, storage smoke, plugin publishing, release evidence, and intelligence routes now frequently assert `requireAdmin`, `requireAuth`, or scoped API key helpers. However, the repository still only exposes `check:api-routes` as `node build/check-server-api-route-tree.mjs`, and no all-route auth/scope contract was found.

Remaining risk:

- New `server/api/**` files can be added with no central declaration of auth mode.
- Public, authenticated, admin, and API-key scoped routes are not compared against a single expected policy table.
- Route ownership and mutation risk are hard to review because policy is embedded inside handler code and individual tests.

Recommended closure is a generated or hand-maintained route contract, checked in CI, with explicit exceptions for public endpoints.

### A3. Plugin Capability Gates

Current status is partially fixed. Official plugins now show better fail-closed behavior. Examples from the current tree include:

- `touch-browser-data` blocks browser bookmark scan, external URL open, and clipboard write when permission SDK is unavailable or denied.
- `touch-workspace-scripts` blocks shell execution behind permission and confirmation flow.
- `touch-quick-actions` reports capability diagnostics and blocks shell actions without permission.

The maintainability issue remains: the same `permission.check` / `permission.request` / error mapping pattern is copied across plugins. That increases drift risk. One plugin can accidentally treat display-time checks as execution-time grants, or fail open on SDK absence, without a central test catching it.

Recommended closure is a shared permission helper with canonical result reasons:

- `permission-sdk-unavailable`
- `permission-denied`
- `permission-request-failed`
- `permission-check-failed`

### A4. Provider Credential and Redaction

Current status is partially fixed. The strongest progress is in the provider registry path:

- `apps/nexus/test/api/dashboard/provider-registry/provider-registry.api.test.ts` asserts serialized provider rows do not contain `secretKey` or `apiKey`.
- `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/provider-migration-dry-run-2026-06-24.md` documents dry-run evidence for secret redaction and no raw API key in summary.
- `providerCredentialStore.ts`, `notificationCredentialStore.ts`, and `storageCredentialStore.ts` all point toward secure-store style encrypted credential handling with production master-key checks.

Remaining risk:

- `apps/nexus/server/api/dashboard/intelligence/providers.post.ts` still accepts `apiKey` in request body.
- `apps/nexus/server/api/dashboard/intelligence/providers/[id].patch.ts` still accepts `apiKey` update or clear semantics.
- `apps/nexus/server/api/dashboard/intelligence/providers/[id]/test.post.ts:21` to `26` accepts an override API key for testing.
- Dev fallback constants are still present for non-production credential stores.

These paths may be acceptable migration boundaries, but they need explicit tests proving they never log, serialize, sync, or include raw key material in response bodies.

### A5. Large Files and Stores

Current status is open. The largest current files by line count include:

| Lines | File |
| ---: | --- |
| 8560 | `apps/nexus/server/utils/platformGovernanceStore.ts` |
| 5895 | `apps/nexus/app/pages/dashboard/admin/governance.vue` |
| 4314 | `apps/core-app/src/main/modules/quick-ops/index.test.ts` |
| 4008 | `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` |
| 3993 | `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` |
| 3983 | `apps/core-app/src/main/modules/plugin/plugin-module.ts` |
| 3900 | `apps/nexus/server/utils/platformGovernanceStore.test.ts` |
| 3735 | `apps/nexus/server/utils/tuffIntelligenceLabService.ts` |

This is not a style-only problem. Files at this size hide side effects, make code review low-confidence, slow targeted test selection, and raise merge-conflict cost. The current uncommitted changes touch `platformGovernanceStore.ts`, which suggests active development is still accumulating inside the largest module.

Recommended closure is incremental extraction, not a broad rewrite:

1. Extract pure projection/report builders from `platformGovernanceStore.ts`.
2. Split D1/schema/mutation helpers from query/report aggregation.
3. Move admin governance page panels into feature components and composables.
4. Split plugin module by install/load/window/runtime lifecycle.

### A6. i18n and SSR Boundary

Current status is partially fixed. Locale route files and catalog coverage have expanded. But production code still has many inline Chinese fallback strings, especially in auth, pricing, device-auth, dashboard account/privacy/team, and provider/admin pages.

Remaining risk:

- Inline fallbacks bypass catalog completeness checks.
- Chinese fallback in production paths can leak into English UI when keys are missing.
- `new Date()`, `Date.now()`, and `Math.random()` are still used in app pages/components. Some are client-only effects or demos, but not all are clearly guarded as client-only.

Recommended closure:

- Add a script that fails on `t('...', '中文')` in production app paths, with allowlists for tests, docs demos, and migration files.
- Add an SSR nondeterminism audit for `Date.now()`, `new Date()`, and `Math.random()` in Vue templates, setup code, and composables.
- Convert true display fallbacks into catalog entries and use key-only production translation calls.

### A7. Contract Test Coverage

Current status is partially fixed. The repo gained many useful tests after the baseline:

- CoreApp assistant/module contract and visible evidence probes.
- Plugin view security profile tests.
- Provider registry API tests for credential handling and model fetch.
- Network lifecycle and sync recovery tests.
- Search semantic alias SDK tests.

The remaining gap is not raw test count. It is high-risk invariant coverage. The missing contract classes are:

- Every Nexus route declares and enforces auth/scope.
- Every Electron window profile maps to expected webPreferences.
- Every high-risk plugin capability uses shared fail-closed behavior.
- Every package class has required quality scripts.

### A8. Package Script Gate Parity

Current status is partially fixed. Current script scan shows significant inconsistency:

- Stronger: `apps/core-app`, `apps/nexus`, `packages/intelligence-uikit`, `packages/tuffex`, `plugins/touch-translation`.
- Weak or missing: `packages/tuff-business`, `packages/tuff-analyse`, `packages/tuff-core`, `packages/tuff-intelligence`, `packages/utils`, and many official plugins lack at least one of `test`, `lint`, or `typecheck`.
- Root package has `quality:pr` and `quality:release`, but no direct `test` script.

This is a future maintenance risk because quality expectations depend on local convention rather than a repo-wide rule.

Recommended closure:

1. Add a package metadata field or naming convention for package class.
2. Validate required scripts per class in a small CI script.
3. Start in warning mode, then graduate to blocking once current exceptions are documented.

## Suggested Priority Plan

1. Close A1 before expanding plugin UI capabilities. It is the highest blast-radius issue because compatibility windows combine broad Electron privileges with dynamic preload assembly.
2. Close A2 with a route security contract before adding more Nexus dashboard/admin APIs.
3. Turn A4 and A3 into shared helpers plus contract tests; this reduces security drift and code duplication at the same time.
4. Start A5 as a size trend control and extract only the most stable seams first.
5. Add non-blocking lint reports for A6 and A8, then make them blocking after the current backlog is triaged.

## Commands Used

```bash
git status --short --untracked-files=all
git log --oneline --decorate -20
git diff --stat be75f9e32
rg -n "compat-plugin-view|webSecurity:\s*false|nodeIntegration:\s*true|contextIsolation:\s*false|sandbox:\s*false|webviewTag:\s*true" "apps/core-app/src/main/core" "apps/core-app/src/main/modules"
rg -n "require(Admin|Auth)|defineEventHandler|check-server-api-route-tree|api-routes|route.*contract|auth.*contract" "apps/nexus/server" "apps/nexus/test" "apps/nexus/build" "apps/nexus/package.json"
rg -n "apiKey|secretKey|provider.*test|redact|secure-store|secureStore|payload_enc|payload_ref|localStorage" "apps/nexus/server/api/dashboard/intelligence" "apps/nexus/server/utils" "apps/nexus/test/api/dashboard/provider-registry" "docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18"
rg -n "permission|permissions|capability|capabilities|manifest-boundary|capability gate|hasPermission|requirePermission|allow scoped|scoped widget" "packages" "apps/core-app/src/main/modules/plugin" "plugins"
rg -n "t\([^\n]*,[^\n]*['\"][^'\"]*[\x{4e00}-\x{9fff}]|useI18nText\([^\n]*,[^\n]*['\"][^'\"]*[\x{4e00}-\x{9fff}]|Math\.random\(|new Date\(|Date\.now\(" "apps/nexus/app" "apps/nexus/i18n"
node --input-type=module -e '...line count scan...'
node --input-type=module -e '...package script scan...'
```

## Verification Not Run

No test suite was run for this report. This was an audit/lint synthesis pass over the current working tree. `git diff --check` was also not run because the working tree contains broad unrelated user changes and the report should not conflate unrelated whitespace findings with audit status.
