# Implementation Plan — Sensitive Data Lifecycle #301

## RED 1 — Shared Contracts And Backup Crypto

- [x] Add exact typed privacy policy/category/action/export/backup/restore request/result tests in `packages/utils`.
- [x] Add Secret envelope vectors for round-trip, wrong password, tampered AAD/header/ciphertext/tag, invalid base64, unknown version/algorithm, hostile KDF parameters, duplicate/forbidden entries, oversized file/value/count, and zeroization-safe error projection.
- [x] Add typed event/domain SDK tests proving renderer requests cannot include SQL, path, Secret prefix/value, arbitrary provider endpoint, or raw data payload.

## GREEN 1

- [x] Implement shared privacy contracts and domain SDK.
- [x] Implement main-only versioned scrypt + AES-256-GCM Secret backup crypto using captured Node crypto functions and bounded exact parsing.
- [x] Add portable Secret catalog and secure-store atomic batch snapshot/restore with rollback.

### RED/GREEN 1 Evidence — 2026-07-29

- `pnpm -C packages/utils exec vitest run __tests__/privacy-sdk.test.ts` — 8 tests passed.
- `pnpm -C apps/core-app exec vitest run src/main/modules/privacy/portable-secret-backup.test.ts src/main/utils/secure-store.test.ts` — 29 tests passed.
- `pnpm -C apps/core-app run typecheck:node` — passed.
- `pnpm -C apps/core-app run typecheck:web` — passed.
- Scoped CoreApp and packages/utils ESLint with `--max-warnings 0` — passed.
- `git diff --check` — passed.
- Independent `trellis-check` closed two P1 and three P2 findings; no open P0/P1/P2 remains in the GREEN 1 slice.
- Executable contract recorded in `.trellis/spec/frontend/privacy-data-lifecycle.md` and linked from the frontend spec index.

## RED/GREEN 2 — Retention Owners

RED/GREEN 2 is executed as four independently reviewed TDD slices because the categories have different databases, owners, cutoff units, protection authority, and filesystem semantics. Each RED must fail for the intended missing owner contract before its GREEN begins.

### RED 2A — Clipboard And OCR/Screenshot Temp

- [x] Clipboard tests prove the 90-day strict boundary, favorite/pinned/host-important exemption, associated image cleanup, cancellation, pagination, idempotence, and cleanup failure recovery.
- [x] Temp/OCR/screenshot tests prove the 24-hour strict boundary, terminal-job cleanup, eager release fallback, namespace ownership, and no OCR/image payload in summaries.

### GREEN 2A

- [x] Add owner-bound Clipboard retention and awaited image/orphan reconciliation.
- [x] Add bounded cancellable TempFileService namespace cleanup and OCR/screenshot owner methods; align strict cutoff semantics.

### RED 2B — Search Detail

- [x] Search tests prove 30-day completion/usage/query/context/aggregate/cache cleanup while preserving File/App/search index, static embeddings, configuration, and pinned results.

### GREEN 2B

- [x] Add a fixed Search detail retention adapter over primary/auxiliary owners with scheduler/retry, pagination, cancellation, and cache invalidation.

### RED 2C — Intelligence And Diagnostics

- [x] Intelligence tests prove 30-day audit and inactive Context session cleanup while preserving active/pinned sessions, Memory, quota, provider config, prompts/templates, and metadata-only audit contracts.
- [x] Diagnostics tests use synthetic canaries and prove no content enters public/remote projections while fixed owner queues/logs obey bounded retention.

### GREEN 2C

- [x] Add owner-controlled Context archive/expire/pin authority and aggregate cleanup; sanitize Intelligence audit ingress before persistence.
- [x] Add fixed diagnostics owner cleanup and sanitize analytics/telemetry ingress before durable or remote projection.

### RED 2D — Policy And Coordinator

- [x] Policy/coordinator tests prove normalized defaults and bounds, strict cutoffs, one daily cancellable admission gate, immediate cleanup only after shortening is durably saved, and no detached owner work.

### GREEN 2D

- [x] Add normalized policy settings and register one cancellable daily coordinator task plus immediate post-policy-shortening cleanup.
- [x] Route every DB page through scheduler/retry and add only journaled indexes proven by owner query plans; do not delete data inside migration.

### RED/GREEN 2A-2C Evidence — 2026-07-30

- Privacy owners, policy, migration, Secret backup, and Temp retention: `72/72` tests passed.
- Existing Clipboard/OCR/screenshot/Assistant/Search/Intelligence/Storage/Analytics/Sentry/Common regressions: `235/235` tests passed.
- Shared Privacy SDK: `8/8` tests passed.
- Real migration-chain test applies journal entries through `0033`, inserts synthetic rows, then applies `0034`; rows survive, rollback is atomic, and retention query plans use the new indexes.
- CoreApp Node/Web typechecks, scoped ESLint/Prettier, and `git diff --check` passed.
- Independent `trellis-check` fixed eight P1 and four P2 findings; no open P0/P1/P2 remains in RED/GREEN 2A-2C.
- Policy normalization and durable main-storage adaptation are complete.

### RED/GREEN 2D Evidence — 2026-07-30

- Coordinator focused tests: `18/18` passed; owner/policy/migration coordinator regression: `65/65` passed.
- Concurrent policy updates, partial registration rollback, linked-signal listener cleanup, cancellation partial evidence, shutdown drain, and stale Polling callback denial are covered.
- Node typecheck, scoped ESLint/Prettier, and `git diff --check` passed.
- Independent `trellis-check` fixed four P1 and two P2 findings; no open P0/P1/P2 remains in RED/GREEN 2D.

## RED 3 — Main Service And Typed Transport

- [x] Service tests cover hostile dependencies/options, exact category authority, summary/preview/delete/export consistency, operation serialization, cancellation, timeout, partial batch evidence, and redacted aggregate failure.
- [x] Export tests prove main-owned dialog/path, bounded incremental output, cancellation/temp cleanup, atomic rename, versioned format, and no Secret plaintext.
- [x] Provider disclosure tests cover local/remote/Nexus/custom categories and reject credential/request leakage.

## GREEN 3

- [x] Implement `PrivacyLifecycleService`, owner registry, typed handlers, and production module wiring.
- [x] Implement ordinary category export and provider disclosure projection.
- [x] Keep native errors in OperationalErrorService and return stable public results/report IDs.

### RED/GREEN 3 Evidence — 2026-07-30

- RED: focused suites failed only while lifecycle service/coordinator, export, disclosure, Secret file service, typed handlers, and production module wiring were absent.
- CoreApp Privacy, Temp retention, and secure-store: `145/145` tests passed across 21 files.
- Shared Privacy SDK exact request/result validation: `8/8` passed.
- Production wiring proves auxiliary Clipboard/OCR/Diagnostics routing, primary Search/Intelligence routing, actual `innerRoot/logs` ownership, one awaited daily task, and handler disposal before service drain.
- Ordinary export uses a main-owned save dialog, same-directory exclusive temp handle, bounded writes with backpressure, identity rechecks, file/directory sync, no-overwrite atomic finalization, and `talex.touch.privacy-export/v1`.
- Secret backup/restore uses main-owned dialogs and bounded file handles; restore IDs are expiring, conflict-plan bound, non-replayable, and expose neither paths nor plaintext.
- Provider disclosure covers local/remote/Nexus/custom destinations without endpoint query, credential, prompt, request, or payload leakage.
- CoreApp Node/Web typechecks, CoreApp/utils scoped ESLint, scoped Prettier, `plugins:validate`, `build:vite`, and `git diff --check` passed.
- Final independent `trellis-check` fixed four P1 and four P2 findings and reports no open P0/P1/P2 in RED/GREEN 3.

## RED 4 — Plugin Data Disposition

- [x] Add uninstall ordering tests: stop admission -> runtime/resource exit -> optional export -> SQLite close -> Secret purge -> data/cache/temp/plugin row -> code removal.
- [x] Prove export, close, Secret, directory, DB-row, and code-delete failure cannot report success or discard retry ownership.
- [x] Prove disable retains durable data and revoke clears only authority/resources/temp artifacts.
- [x] Prove successful uninstall leaves no exact-plugin data owner, Secret prefix, SQLite client/file, cache/temp namespace, or plugin row.

## GREEN 4

- [x] Extend typed uninstall contract with explicit data disposition/export plan.
- [x] Integrate lifecycle coordinator with existing PluginModule teardown and secure-store owners.
- [x] Add export-before-delete flow and deterministic stopped/retryable failure state.

### RED/GREEN 4 Evidence — 2026-07-30

- RED was captured before production wiring: the strict generation-bound uninstall DTO, coordinator ordering/failure/retry barriers, main-owned ordinary export, lifecycle admission, and residual verification tests failed while those contracts and owners were absent.
- Shared uninstall/privacy SDK suites passed `28/28`; coordinator and real PluginModule suites passed `49/49`; plugin ordinary/privacy export suites passed `16/16`.
- #296 permission regressions passed `34/34`; #299 CoreApp storage/lifecycle regressions passed `149/149`; associated utils regressions passed `43/43`; #297 V2 host/lifecycle regressions passed `381/381`.
- Node/Web typechecks, CoreApp/utils scoped ESLint, scoped Prettier, `plugins:validate` (`24/24`), production `build:vite`, `plugin-sqlite-worker.js`/`plugin-host.js` artifact checks, and the existing Electron plugin-host isolation smoke passed. The repository has no dedicated controlled privacy-lifecycle Electron smoke script; the validation entry remains a placeholder.
- Final ownership review closed a cross-generation SQLite residual gap: after current-generation admission is bound, uninstall closes the plugin-wide SQLite owner and verifies `hasPlugin(name) === false` before deletion can proceed.
- Successful Store reporting is gated on complete local residual verification. Export cancellation/failure performs non-destructive teardown only; cleanup failures retain exact stopped retry ownership and block enable/load/reload/update/install admission.
- Transport results expose only stable aggregate stage/status/code/retryability fields. Main owns paths, tables, SQL, Secret catalog filtering, deletion roots, and dialogs; renderer input cannot select those authorities.

## RED 5 — Settings UX

- [x] Component tests cover retention defaults/options, protected-item text, category summary, preview-vs-delete confirmation, export cancellation, backup/restore validation/conflicts, loading/disabled state, focus restoration, keyboard operation, and `aria-live` result.
- [x] i18n parity tests reject new hardcoded user-visible copy.
- [x] Provider disclosure tests prove no credential, full endpoint query, prompt, response, image, audio, or file content is rendered.
- [x] Plugin uninstall UI tests cover export choice, encrypted Secret backup, cancel, and failure recovery.

## GREEN 5

- [x] Add Privacy & Data controls to `/setting/storage` using existing TuffEx semantic controls and full-width sections.
- [x] Add bilingual catalog copy and safe provider disclosure.
- [x] Keep passwords in component-local ephemeral refs and clear them on completion/unmount.
- [x] Update uninstall confirmation to offer ordinary export and encrypted Secret backup before final deletion.

### RED/GREEN 5 Evidence — 2026-07-30

- Privacy & Data is mounted once in the full-width `/setting/storage` page and the Storage route remains visible outside Advanced mode. The UI covers exact policy presets, summaries, protected-item guidance, separate retention/manual-delete previews, cleanup, export, permanent deletion, encrypted Secret backup/restore, and safe provider disclosure.
- Destructive UI is fail-closed: manual delete requires exact current-category impact coverage, stale/incomplete previews are rejected, bounded impact is disclosed, pending actions are disabled, and modal dialogs provide initial focus, Tab containment, Escape handling, accessible names/descriptions, `aria-live` status, and valid focus restoration.
- Passwords use the shared bounded 12-code-point well-formed-Unicode validator. Backup clears both password refs when the request starts; restore clears the preview password and requires re-entry for apply; cancel, failure, identity change, late completion, and unmount clear renderer authority.
- Plugin uninstall now sends the exact generation-bound v1 disposition DTO with optional ordinary export and encrypted portable-Secret backup. It clears transient passwords, requires fresh final-impact confirmation for retries, ignores stale-generation/late completions, and keeps cancelled or failed uninstall states installed, stopped, and explicitly retryable when allowed.
- The main-owned Secret file flow writes bounded authenticated envelopes through exclusive same-directory temporary files and atomic finalization without returning paths. Restore plans retain only expiring main-side file identity/digest, secure-store revision, counts, and conflict fingerprints; apply consumes the plan before I/O, reopens the exact file, rechecks identity/digest/revision, reauthenticates/replans, performs one revision-bound atomic secure-store mutation, and wipes transient byte buffers.
- Focused renderer/integration/i18n/plugin UI suites passed `33/33`; the complete Privacy main suite passed `133/133`; plugin disposition/PluginModule/UI regressions passed `67/67`; secure-store/temp retention regressions passed `21/21`; shared privacy/uninstall SDK suites passed `29/29`.
- CoreApp Node/Web typechecks, strict scoped CoreApp/utils ESLint, i18n parity, `plugins:validate` (`24/24`), production `build:vite`, artifact presence checks, `git diff --check`, controlled plugin-host isolation smoke, and controlled Privacy lifecycle smoke passed. The Privacy smoke uses only an isolated generated profile and fake provider/dialog owners.

## REFACTOR / DOCUMENTATION

- [x] Remove new raw-event duplicates and migrate touched storage actions to typed privacy SDK.
- [x] Remove plaintext provider credential persistence after successful secure-store migration.
- [x] Add one executable data-inventory document mapping collection, storage, network, retention, deletion, export, backup, and restore.
- [x] Update privacy/security specs with retention exemptions, backup envelope, uninstall barrier, and remote disclosure limitations.
- [x] Independent review finds no P0/P1/P2 privacy, authority, deletion, backup, or redaction finding.

### REFACTOR / DOCUMENTATION Evidence — 2026-07-30

- Main-owned Provider credential lifecycle now migrates both `StorageList.IntelligenceConfig` (`aisdk-config`) and the legacy `intelligence/providers` database row. It validates a dense unique Provider list before secure I/O, snapshots prior values, commits one secure-store batch before a revision-bound sanitized config write, rolls secure values back on config failure, serializes concurrent migration/save/delete, and hydrates runtime credentials main-side.
- Migration failure preserves the validated legacy config and main-only runtime usability while renderer Storage projections remain sanitized. The rejected initialization Promise keeps later mutations fail-closed for that process; restart retries migration idempotently. Provider replacement and deletion restore the prior secure value if sanitized metadata persistence fails.
- Renderer Provider config persists only `authRef`/`hasCredential`; `IntelligenceApiConfig.vue` keeps credential input local and transient, submits typed `saveProviderConfig`, clears it after success, and uses main-side resolution for saved-key tests/model fetch. Generic Intelligence Storage get/getVersioned redacts `apiKey`, and set/save rejects any Provider object owning that field.
- Portable allowlist adds only the four fixed built-in user API Provider IDs: `openai-default`, `anthropic-default`, `deepseek-default`, and `siliconflow-default`. Dynamic custom Providers remain locally secure but non-portable. Nexus login/session, sync payload keys, machine seeds, and device/account identity remain outside the portable catalog.
- Official Translation `providers_config` migration is main-owned and single-flight. Fixed legacy fields are written in one atomic Secret batch before sanitized config persistence; config failure restores prior Secret values. Deferred migration leaves the legacy file intact, returns a sanitized ordinary-storage projection, and permits only an authorized main-side Secret SDK fallback. New multi-field updates use exact typed `set-secret-batch` across renderer SDK and injected plugin feature util.
- Transport audit found no #301 raw Privacy duplicate: `PrivacyDataSection.vue` uses `createPrivacySdk()`, Plugin uninstall uses the typed `pluginSDK.uninstall()` contract, and `Storagable.vue` no longer exposes overlapping raw logs/Temp/Clipboard/OCR/analytics/usage/Intelligence cleanup actions. Unrelated file-index, download, and update maintenance remain on their existing storage-owner channels.
- Executable inventory: `docs/engineering/sensitive-data-inventory.json` contains 13 owner surfaces and 26 evidence references; `scripts/verify-sensitive-data-inventory.mjs` validates lifecycle fields, evidence, portability exclusions, credential redaction, typed transport, and source wiring. `corepack pnpm privacy:inventory:verify` passed with 3 portable classes and 10 non-portable classes.
- `.trellis/spec/frontend/privacy-data-lifecycle.md` now records executable Provider/Translation transaction ordering, failure/concurrency/restart behavior, renderer redaction, inventory synchronization, portable exclusions, and isolated Electron smoke contracts; the frontend spec index links those triggers.
- Independent closure review fixed one P1 (secure migration failure initially prevented prior runtime usability) and three P2 classes (legacy Provider validation was too weak; Plugin Secret batch was not exposed consistently/exactly across plugin runtimes; property-order-sensitive document comparison caused a redundant sanitized config write after restart). Post-fix review found no open P0/P1/P2 in the closure slice.
- Controlled smoke evidence level: **isolated production-built Electron main lifecycle smoke**. `smoke:privacy-lifecycle` sets a temporary Electron `userData`, uses generated fixtures plus fake owner/provider/dialog sources, registers all 13 canonical typed Privacy handlers, and passes policy, summary, cleanup preview/run, category delete preview/run, ordinary export, disclosure redaction, encrypted Secret backup/restore, secure value restoration, dialog ownership, hard timeout, and synthetic-canary non-leak assertions. It performs no real provider request and touches no production/user profile.
- Focused closure matrix passed: Core Privacy/Provider/Translation/Plugin/UI `197/197`, shared Privacy/uninstall SDK `29/29`, official Translation `2/2`, plus non-overlapping Intelligence runtime/config/SDK regressions `68/68`, Plugin Secret SDK `3/3`, Intelligence Provider credential SDK `4/4`, and injected Plugin Secret feature-util `1/1` (`304` distinct tests total). `plugins:validate` passed `24/24`.
- Final commands executed successfully:

```bash
corepack pnpm -C apps/core-app exec vitest run src/main/modules/privacy src/main/modules/ai/provider-credential-service.test.ts src/main/modules/plugin/services/translation-provider-credential-migration.test.ts src/main/modules/plugin/services/plugin-storage-transport-service.test.ts src/renderer/src/views/storage/PrivacyDataSection.test.ts src/renderer/src/views/storage/PrivacyDataSection.integration.test.ts src/renderer/src/views/storage/PrivacyDataSection.i18n.test.ts src/renderer/src/components/plugin/PluginInfo.uninstall-disposition.test.ts
corepack pnpm -C apps/core-app exec vitest run src/main/modules/ai/provider-runtime.test.ts src/main/modules/ai/intelligence-config.test.ts src/main/modules/ai/intelligence-sdk.test.ts
corepack pnpm -C packages/utils exec vitest run __tests__/privacy-sdk.test.ts __tests__/plugin-uninstall-sdk.test.ts __tests__/plugin-secret-sdk.test.ts __tests__/intelligence-provider-credential-sdk.test.ts
corepack pnpm -C plugins/touch-translation exec vitest run translation-provider-secret.test.ts
corepack pnpm -C apps/core-app exec vitest run src/main/modules/plugin/plugin.test.ts -t "exposes plugin secret API through the injected feature util"
corepack pnpm -C apps/core-app typecheck:node
corepack pnpm -C apps/core-app typecheck:web
corepack pnpm plugins:validate
corepack pnpm privacy:inventory:verify
corepack pnpm -C apps/core-app build:vite
corepack pnpm -C apps/core-app smoke:privacy-lifecycle
```

- Strict scoped CoreApp/packages-utils/Translation/verifier ESLint with zero warnings and `git diff --check` also passed. The production build emitted only the repository's existing dynamic/static import, browser-externalization, pure-annotation, and dependency `eval` warnings; no build failure or new closure warning remained.
- Residual blockers: none for this closure. By design, dynamic custom Provider credentials are not portable until a fixed product allowlist exists, and no real user-profile migration/destructive cleanup was run. Issue #301 remains open pending commit/evidence publication; no push, merge, or issue-close action was performed.

## Independent Closure Review — 2026-07-31

### Findings Fixed

- **P1 — manual category delete trusted only a renderer confirmation literal.** `category.delete-preview` now returns a main-issued opaque `previewId`; `category.delete` requires the exact ordered categories, literal confirmation, unexpired ID, and one-time consumption before policy load or owner work. Missing, mismatched, replayed, and expired IDs return `PRIVACY_REQUEST_INVALID` without deletion.
- **P1 — Settings publicly required Memory/plugin-data while production registered only six owners.** This made the real page reject its incomplete default summary. `PRIVACY_SETTINGS_DATA_CATEGORIES` now equals the six production owner-backed categories. Shared request normalization, service admission, production wiring tests, and UI loops use that list. Memory remains under typed Intelligence delete/tombstone; plugin data remains under exact-generation uninstall disposition. Internal `PrivacyDataCategory = 'plugin-data'` remains available for main-owned uninstall export.
- **P1 — plugin ordinary uninstall export included logs and SQLite artifacts.** The ordinary exporter now rejects a `logs` area and excludes log directories/files, cache, Temp, and SQLite/SQLite3/DB plus WAL/SHM/journal artifacts at every traversal depth. Canary tests prove their names and bytes are absent. Production exports only ordinary data plus a separate config root.
- **P2 — provider connection-test results exposed provider-controlled model/native error text.** Remote success and unknown failure now return fixed public messages. A synthetic model/API-key/path canary test proves neither value reaches the result.
- **P2 — lifecycle deadline call sites drifted from the current two-argument admission/five-argument delete signatures.** Removed undeclared `deadlineMs` DTO projections and retained the admission-owned timeout `AbortSignal` as cancellation authority; Node typecheck and lifecycle regressions pass.

### Final Evidence

- Closure matrix: Core Privacy/Provider/Translation/Plugin/UI `212/212`; Intelligence runtime/config/SDK `70/70`; shared Privacy/uninstall/Secret/credential SDK `39/39`; Translation `2/2`; injected Plugin Secret feature-util `1/1`. Total distinct executed tests: `324/324`.
- Additional post-signature focused rerun: lifecycle/transport/Privacy UI `42/42`.
- CoreApp `typecheck:node` and `typecheck:web` passed. CoreApp and packages-utils scoped ESLint passed with zero warnings; scoped Prettier and `git diff --check` passed.
- `plugins:validate` passed `24/24`; `privacy:inventory:verify` passed with 13 entries, 3 portable classes, 10 non-portable classes, and 26 structurally verified references.
- Production `build:vite` passed and emitted `plugin-sqlite-worker.js`, `plugin-host.js`, and `privacy-lifecycle-smoke.js`. Output contained only existing dynamic/static import, browser externalization, pure-annotation, dependency `eval`, loader/Sass, and stale Browserslist warnings.
- Isolated production-built Electron Privacy smoke passed all 13 exact handlers plus policy, summary, cleanup preview/run, main-bound delete preview/run, ordinary export, provider redaction, encrypted backup/restore, dialog ownership, artifact cleanup, and isolated-profile cleanup.
- `Storagable.vue` still retains only file-index, download, and update maintenance actions; overlapping raw Privacy actions remain removed.
- `tuffex.md` was not read, edited, staged, or otherwise touched. No commit, push, issue-close, or real provider/user-profile destructive operation was performed.

### Evidence Reconciliation

- The earlier “no open P0/P1/P2” statement was stale because it did not compare `PRIVACY_DATA_CATEGORIES` against the production registry and did not adversarially inspect plugin file roots or provider-test fallback text. The findings above supersede that conclusion.
- The earlier `304`-test closure count is stale after suite growth and this review's canaries; the current non-overlapping closure count is `324`.
- The older RED/GREEN 4 note that Privacy smoke was a placeholder is historical; the later isolated production-built smoke exists and passed again in this review.
- Final status: no open P0/P1/P2 privacy, deletion, backup, authority, or redaction finding in the #301 closure slice. Residual product constraints remain intentional: dynamic custom Provider credentials are non-portable without a fixed allowlist, Memory bulk deletion stays in its own lifecycle, and plugin persistent data is deleted only through generation-bound uninstall.

## Validation

The exact final commands, test counts, smoke evidence level, build warnings, and residual-risk statement are recorded in the REFACTOR / DOCUMENTATION evidence above. All listed gates passed on the final working tree.

## Guardrails

- No new dependency for crypto, scheduling, validation, or storage.
- No renderer-selected filesystem path, table, SQL, Secret key/prefix, or raw provider endpoint.
- No raw sensitive payload in tests, logs, screenshots, Issue comments, or evidence; use synthetic canaries.
- No real provider request or production/user-profile destructive cleanup in tests/smoke.
- Database tests use temporary libSQL databases; Electron smoke uses an isolated profile and generated fixtures.
- Do not modify unrelated TuffEx/search/release tasks or the untracked `tuffex.md`.
- Do not commit/push/close #301 until all gates and independent review pass.
