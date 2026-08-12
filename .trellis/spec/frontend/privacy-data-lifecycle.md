# Privacy Data Lifecycle

> Executable contracts for typed privacy transport and portable encrypted Secret backup/restore.

---

## Scenario: Forced Main-Owned Auth Credential Persistence

### Scope / Trigger

- Trigger: changing `AuthModule` login-token persistence, legacy `auth.useSecureStorage` settings, or the `nexus-auth-session` sensitive-data inventory entry.
- `auth.token` has one persistent path: CoreApp's local-secret secure store. The renderer never reads, writes, diagnoses, or configures this path; `auth.requiresReauthenticationOnNextStartup` is a main-owned, non-sensitive fail-closed marker rather than a user setting or protection override.

### Contracts

- The deployed backend is `local-secret`: a locally generated random secret in `config/local-secret.v1.key` derives AES-256-GCM protection for the `auth.token` envelope in `secure-store.json`.
- This is not OS Keychain, Credential Locker, libsecret, Electron `safeStorage`, a hardware key, or an OS root key. The local secret and token are never portable or ordinary-exportable.
- `AuthModule` removes legacy `useSecureStorage`, `secureStorageUserOverridden`, `secureStorageReminderShown`, and `secureStorageUnavailable` fields at startup. Historical `false` and override values cannot select an unprotected or alternate persistence path. It only persists the non-sensitive `auth.requiresReauthenticationOnNextStartup` marker in ordinary app settings; no token, key, or user-controllable protection state enters that store. The shared renderer setting default, renderer Storage projections, and sync snapshots omit the marker, while generic renderer/sync writes preserve the current main-owned value.
- Before each protected auth-token write, `AuthModule` durably persists `auth.requiresReauthenticationOnNextStartup: true`. It writes no new token if this marker cannot be persisted; only a successful encrypted token write followed by durable marker clearing permits future restoration. A marker-write, secure-store creation/write, envelope validation/decryption, read, health-check, or marker-clear failure leaves the current authenticated process memory-only and never uses an ordinary settings/JSON/log/sync fallback.
- At cold start, a true marker prevents any token read or restore. Main best-effort deletes `auth.token` from the protected store and clears the marker only after that deletion succeeds; a failed cleanup preserves the marker. Logout and auth-unauthorized cleanup clear in-memory state, persist the marker before protected-token deletion, and clear it only after that deletion succeeds. Main diagnostics use stable state/reason projections and do not include token values, local-secret material, paths, or native errors.

### Tests Required

- Auth-module tests cover removal of every legacy override field, healthy protected cold-start restore, unavailable/unreadable protected cold starts, marker persistence before token writes, a failed write plus incomplete protected-token cleanup followed by a blocked restart, marker-write/marker-clear failures, and logout deletion with marker retention on deletion failure.
- `docs/engineering/sensitive-data-inventory.json` records the exact local-secret AES-256-GCM backend, non-portability, and memory-only failure lifecycle; `corepack pnpm privacy:inventory:verify` must pass.

---

## Scenario: Portable Encrypted Secret Backup And Atomic Restore

### 1. Scope / Trigger

- Trigger: adding or changing Privacy SDK operations, portable Secret catalog entries, encrypted Secret backup envelopes, restore preview/apply, or secure-store batch mutation.
- This contract covers the shared DTO boundary and the main-owned crypto/storage implementation. Ordinary category export, retention owners, lifecycle scheduling, plugin uninstall disposition, and Settings UI remain separate contracts.

### 2. Signatures

```ts
createPrivacySdk(transport: ITuffTransport): PrivacySdk
normalizePrivacyRequest(value: unknown): PrivacyRequest
normalizePrivacyResult(operation: PrivacyOperation, value: unknown): PrivacyResult

createPortableSecretBackup(entries, password, options?): Promise<string>
openPortableSecretBackup(envelope, password): Promise<{ entries: PortableSecretBackupEntry[] }>
previewPortableSecretRestore(rootPath, envelope, password): Promise<SecretRestorePreview>
applyPortableSecretRestore(
  rootPath,
  envelope,
  password,
  conflictPolicy,
  planFingerprint,
): Promise<SecretRestoreResult>

getSecureStoreBatchSnapshot(rootPath, entries): Promise<{
  revision: string
  existing: readonly boolean[]
}>
applySecureStoreBatch(rootPath, entries, {
  conflictPolicy: "skip" | "overwrite"
  expectedRevision?: string
}): Promise<SecureStoreBatchResult>
```

The public envelope has exactly these fields:

```json
{
  "format": "talex.touch.secret-backup",
  "version": 1,
  "createdAt": "ISO timestamp",
  "kdf": { "name": "scrypt", "N": 32768, "r": 8, "p": 1, "salt": "base64" },
  "cipher": { "name": "AES-256-GCM", "iv": "base64", "tag": "base64" },
  "payload": "base64"
}
```

### 3. Contracts

- Privacy requests and results are exact DTOs. Reject accessors, proxies, sparse arrays, prototypes, extra keys, duplicate category/provider entries, unknown operations, unstable error codes, and fields that can carry SQL, paths, Secret names/values, credentials, provider endpoints, prompts, responses, or raw data.
- The Privacy SDK validates both outbound requests and inbound main-process results. TypeScript types do not replace runtime result validation.
- Main captures direct Node crypto functions before work begins. Backup uses asynchronous `scrypt` with fixed `N=32768`, `r=8`, `p=1`, a random 16-byte salt, a 32-byte key, and bounded `maxmem`; encryption uses AES-256-GCM with a random 12-byte IV and 16-byte tag.
- Canonical UTF-8 JSON of immutable non-secret header fields is authenticated as AAD. The tag is carried beside the AAD and authenticates the AAD plus ciphertext.
- Reject non-canonical base64, malformed UTF-8, unpaired password surrogates, unsupported versions/algorithms, hostile KDF parameters, and oversized file/payload/entry/value/password inputs before expensive crypto or unbounded allocation.
- Only exact entries in `PORTABLE_SECRET_CATALOG_V1` are portable. Device identity, session tokens, sync keys, machine seeds, unknown plugin Secrets, and caller-selected secure-store keys/prefixes are forbidden.
- Restore authenticates the complete envelope, validates the decrypted payload/catalog/duplicates/limits, and computes conflicts before mutation. `skip` and `overwrite` are explicit decisions.
- Preview returns policy-bound plan fingerprints. Apply recomputes the plan against the current secure-store revision and rechecks that revision inside the secure-store mutation queue. Any intervening mutation fails closed without writing.
- A secure-store batch validates every entry before queue admission, applies one in-memory candidate, and persists once through the existing atomic temp-file rename path. Failed persistence keeps prior encrypted bytes usable and never reports success.
- Password, derived key, root key, plaintext and decrypted buffers are zeroed where possible. JS strings cannot be reliably zeroed, so plaintext values never enter renderer transport, ordinary persistence, logs, telemetry, or native error messages.

### 4. Validation & Error Matrix

| Condition                                                                                     | Required result                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Unknown Privacy operation, extra field, Proxy/accessor, sparse array, malformed main response | Reject at the shared DTO boundary before owner work or UI use             |
| Password under 12 Unicode code points, over byte limit, or malformed Unicode                  | `PRIVACY_SECRET_BACKUP_PASSWORD_INVALID`                                  |
| Oversized file/payload/count/key/value or hostile KDF allocation                              | `PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED` or fixed KDF error before `scrypt` |
| Unknown envelope version or algorithm                                                         | Stable unsupported-version/KDF/envelope code; no fallback                 |
| Header, IV, ciphertext, or tag tampered; wrong password                                       | `PRIVACY_SECRET_BACKUP_AUTH_FAILED`; no native crypto detail              |
| Duplicate or non-catalogued entry                                                             | Stable duplicate/forbidden code; no secure-store mutation                 |
| Invalid conflict policy or stale/mismatched plan fingerprint                                  | `PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID`                             |
| Secure-store changes after plan recomputation but before queued apply                         | Revision conflict; no partial write                                       |
| Atomic rename or persistence fails                                                            | Stable write failure; prior encrypted store remains readable              |
| `skip` conflict                                                                               | Leave current value unchanged and report it as skipped                    |
| `overwrite` conflict                                                                          | Replace only the catalogued key and report it as overwritten              |

### 5. Good/Base/Bad Cases

- Good: a catalogued provider credential is encrypted, opened with the correct password, previewed, then restored with the exact policy-bound fingerprint in one atomic batch.
- Base: restore with `skip` imports new entries and leaves existing values untouched.
- Bad: accept a renderer-selected secure-store key, decrypt before envelope/KDF limits, trust a typed but malformed main response, or preview conflicts and later overwrite against an unbound store snapshot.

### 6. Tests Required

- Shared SDK tests cover exact request and result validation, sensitive-field rejection, duplicate/limit handling, operation-result mismatches, stable errors, and detached clone-safe outputs.
- Crypto vectors cover round-trip, wrong password, header/AAD/ciphertext/tag tampering, canonical base64, malformed UTF-8, unknown version/algorithm, hostile KDF parameters, duplicate/forbidden entries, and every file/value/count/password bound.
- Restore tests cover `skip`, `overwrite`, invalid policy, plan-fingerprint policy binding, stale plan rejection, mutation between recompute and queued apply, store unavailability, atomic rename failure, and prior-value readability.
- Secure-store tests cover exact batch validation, proxy/prototype-key denial, conflict counts, concurrent serialization, revision checks, atomic persistence, and root/derived/plaintext cleanup paths.
- Required focused gates are Privacy SDK Vitest, portable backup plus secure-store Vitest, CoreApp Node/Web typechecks, scoped ESLint with zero warnings, and `git diff --check`.

### 7. Wrong vs Correct

#### Wrong

```ts
const preview = await inspectConflicts(entries)
await Promise.all(entries.map(entry => setSecureStoreValue(root, entry.key, entry.value)))
```

This trusts caller-selected keys, permits TOCTOU overwrite, and can leave a partially restored store.

#### Correct

```ts
const preview = await previewPortableSecretRestore(root, envelope, password)
await applyPortableSecretRestore(root, envelope, password, 'overwrite', preview.planFingerprints.overwrite)
```

The main process authenticates the envelope, resolves only catalogued keys, binds the choice to the store revision, and commits one queued atomic batch.

---

## Scenario: Owner-Bound Retention Cleanup

### 1. Scope / Trigger

- Trigger: changing retention policy normalization, Clipboard/OCR/Search/Intelligence/Diagnostics cleanup, Temp namespaces, lifecycle indexes, or domain ingress that feeds retained audit/telemetry data.
- Retention owners are fixed domain adapters. A coordinator may invoke them, but cannot select a table, SQL statement, database file, Temp namespace, log path, Secret key, or protected-record rule.

### 2. Signatures

```ts
interface PrivacyDataOwner {
  readonly categories: readonly PrivacyDataCategory[]
  inspect(request, signal): Promise<PrivacyOwnerInspectionResult>
  previewDelete(request, signal): Promise<PrivacyOwnerPreviewResult>
  delete(request, signal): Promise<PrivacyOwnerDeleteResult>
  applyRetention(policy, nowMs, signal): Promise<readonly PrivacyOwnerDeleteResult[]>
}

TempFileService.registerNamespace({ namespace, retentionMs, automaticCleanup? }): void
TempFileService.createFile({ namespace, ext?, text?, buffer?, base64?, prefix? }): Promise<TempFileCreateResult>
TempFileService.inspectNamespace(namespace, options): Promise<TempNamespaceInspection>
TempFileService.cleanupNamespace(namespace, options): Promise<TempNamespaceCleanupResult>
```

Migration `0034_privacy_retention_indexes` owns `clipboard_history.retention_protected`, `intelligence_context_sessions.is_pinned`, and the fixed owner query indexes.

### 3. Contracts

- Compute one `cutoffMs = nowMs - retentionMs` per operation. Only `stored < cutoff` is eligible; equality survives. Convert millisecond, second, and epoch-day storage units inside the owning adapter.
- Owner results count owner roots/items, not child rows removed by cascade. They contain bounded counts/bytes/codes only, never Clipboard/OCR/query/prompt/response content, SQL, paths, endpoints, native errors, or arbitrary metadata.
- Every database mutation page uses keyset order, a bounded limit, `dbWriteScheduler` background priority, `dropPolicy: none`, and `withSqliteRetry`. Cancellation stops before the next page; committed pages remain observable and idempotent.
- Clipboard retention protects `is_favorite` and host-owned `retention_protected`; arbitrary metadata cannot grant authority. Root deletion commits before awaited owner-contained image cleanup and bounded orphan reconciliation.
- OCR retention deletes terminal job roots only; pending/processing jobs and user-owned source paths survive. OCR/screenshot files use registered `ocr/intermediate` and `native/screenshots` namespaces with a 24-hour fallback. Eager release accepts only files canonically owned by those namespaces.
- Search retention owns query completion, contextual behavior, usage detail/aggregates, time/trend detail, recommendation cache, and in-memory detail caches. It never opens `search-index.db` or removes File/App rows, static embeddings, index/task state, configuration, or `pinned_items`.
- Intelligence audit retention removes detail rows and prevents pending rows below the retention floor from being reinserted. Context cleanup deletes only archived/expired, unpinned session roots; active sessions, Memory/tombstones, quota/usage aggregates, provider config, prompts/templates, workflows, and knowledge remain.
- Diagnostics cleanup composes fixed DB/telemetry/log owners. Core log deletion is restricted to the canonical captured root, known rotated CoreApp names, and crash dumps; symlinks, foreign roots, plugin logs, download logs, and workflow roots are not authority.
- Temp create/inspect/cleanup requires prior trusted namespace registration. Plugin Temp access derives an activation-scoped namespace from authoritative plugin identity; plugin payloads cannot select another owner's namespace or retention.
- Temp extensions are empty or one optional leading dot plus 1-16 ASCII alphanumeric characters; validate them before directory creation. Retention collection captures namespace-root and file `dev`/`ino` plus file size/mtime/ctime. Cleanup revalidates both identities, renames the candidate to a random same-directory recovery name, verifies the moved inode, and only then unlinks it. A raced replacement is restored with a no-clobber hard link when possible; otherwise its hidden `.recovery` remains an explicit failed residual and is never collected as ordinary Temp data.
- Domain ingress persists/transmits metadata-only Intelligence audit, analytics, and telemetry failure projections. Stable codes replace prompts, messages, endpoints, paths, stacks, and native errors. Sentry search aggregation never receives query text, and feature telemetry drops display `sourceName`; final event sanitization remains defense in depth.

### 4. Validation & Error Matrix

| Condition                                                             | Required result                                                                          |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Timestamp equals cutoff                                               | Retain                                                                                   |
| Invalid category, non-finite limits/time, Proxy/accessor owner/policy | Reject or normalize fail-closed before owner work                                        |
| Cancellation after one committed page                                 | Return cancelled/partial counts; start no later page; invalidate affected caches         |
| SQLite busy recovers/exhausts                                         | Retry through shared policy, or return retryable database failure without native detail  |
| Favorite/host-important Clipboard or active/pinned Context            | Preserve and count as protected                                                          |
| OCR pending/processing job or user source path                        | Preserve                                                                                 |
| Search detail cleanup                                                 | Preserve pins, File/App/index/static embedding/config rows byte-for-byte                 |
| Unregistered/traversal/symlinked/replaced Temp namespace              | Reject before create/read/delete outside canonical owner root                            |
| Empty or simple Temp extension                                        | Use `.tmp` or bounded alphanumeric suffix                                                |
| Temp extension contains separators/traversal                          | `TEMP_FILE_EXTENSION_INVALID` before namespace filesystem work                           |
| Temp root/file identity changes after collection                      | Preserve replacement; return failed item/residual; never unlink by stale path            |
| Diagnostics foreign filename/root/symlink                             | Ignore or stable resource failure; never unlink it                                       |
| Domain metadata contains sensitive canary                             | Drop/project to stable code before persistence, queueing, remote send, or normal logging |
| Migration statement fails                                             | Roll back schema/journal/data atomically; no cleanup runs inside migration               |

### 5. Good/Base/Bad Cases

- Good: an old unprotected Clipboard root is removed in one scheduled page, FK children cascade, caches evict, and the owned image unlink is awaited without returning its path.
- Base: a 30-day Search run removes stale completion/usage/cache rows while a pinned result and its source index remain available.
- Bad: one coordinator executes caller-selected SQL, uses `OFFSET` while deleting, treats `<= cutoff` as expired, deletes a Context child table directly, recursively removes a caller-selected log directory, accepts `ext: '../../../../escape'`, or unlinks a Temp path without comparing the collected inode.

### 6. Tests Required

- Real migrated temporary libSQL tests cover primary/auxiliary routing, strict boundaries, more than two pages, cancellation, retry exhaustion, FK cascades, migration rollback, and `EXPLAIN QUERY PLAN` index use.
- Real Temp filesystem tests cover registration, extension traversal rejection before filesystem work, canonical containment, symlinks, namespace/file replacement, recovery residuals, eager release, strict mtime, paging, cancellation, and idempotence.
- Clipboard tests preserve favorite/host-important rows and prove arbitrary metadata has no protection authority.
- Search tests preserve producer/index/static embedding/config/pin rows and invalidate detail caches on every committed-exit path.
- Intelligence tests preserve active/pinned Context, Memory, quota/config/prompt/workflow/knowledge and prevent old pending audit reinsertion.
- Diagnostics and canary tests serialize DB, queue, Sentry/Nexus, logger, owner-result, and transport projections and assert raw sensitive values are absent.
- Required gates are focused owner/domain tests, complete migration-chain tests, Node/Web typechecks, scoped lint/format, and `git diff --check`.

### 7. Wrong vs Correct

#### Wrong

```ts
await db.execute(`DELETE FROM ${request.table} WHERE timestamp <= ?`, [cutoff])
```

#### Correct

```ts
await owner.applyRetention(normalizedPolicy, operationNowMs, signal)
// The fixed owner pages `stored < cutoff` through scheduler/retry and preserves protected roots.
// Temp deletion additionally revalidates captured root/file identities before unlink.
```

---

## Scenario: Main-Owned Privacy Lifecycle Transport And Export

### 1. Scope / Trigger

- Trigger: changing `PrivacyLifecycleService`, Privacy typed handlers/SDK, ordinary category export, encrypted Secret file backup/restore, provider disclosure, production owner wiring, or daily maintenance startup/shutdown.
- Renderer callers select fixed category/action IDs and provide transient passwords. Main owns authority, dialogs, paths, file handles, owner registry, operation admission, and public error projection.

### 2. Signatures

```ts
createPrivacyLifecycleService(options): PrivacyLifecycleService
registerPrivacyTransportHandlers(transport, service): () => void
createPrivacyCategoryExporter(options): PrivacyCategoryExporter
createPrivacySecretService(options): PrivacySecretService
createPrivacyProviderDisclosureService(source): PrivacyProviderDisclosureService
privacyLifecycleModule: PrivacyLifecycleModule

const PRIVACY_SETTINGS_DATA_CATEGORIES = [
  'clipboard-history',
  'ocr-screenshot-temp',
  'search-history',
  'intelligence-audit',
  'intelligence-context',
  'diagnostics',
] as const

privacySdk.category.previewDelete(categories): Promise<{
  ok: true
  data: { categories: PrivacyDeleteCategoryImpact[]; bounded: boolean; previewId: string }
}>
privacySdk.category.delete(
  categories,
  'delete-selected-data',
  previewId,
): Promise<PrivacyCategoryDeleteResult>
```

Ordinary export format is `talex.touch.privacy-export/v1`. Secret files use the separate `talex.touch.secret-backup` envelope from the first scenario.

### 3. Contracts

- Shared `normalizePrivacyRequest()` and `normalizePrivacyResult(operation, value)` validate exact DTOs on both transport directions. Raw channel strings, renderer paths/tables/SQL/Secret keys/endpoints, and plugin callers are forbidden.
- Retention cleanup preview and permanent category deletion preview are distinct typed operations. `cleanup.preview` applies configured cutoffs; `category.delete-preview` asks each fixed owner for bounded all-record impact. Main returns an opaque five-minute `previewId`; `category.delete` atomically consumes it once and requires the same ordered category list plus the exact confirmation literal. Missing, expired, replayed, or category-mismatched IDs fail before policy load or owner deletion.
- `PRIVACY_SETTINGS_DATA_CATEGORIES` is exactly the six production owner-backed categories. Explicit Memory remains under the Intelligence Memory delete/tombstone API; plugin data remains under generation-bound uninstall disposition. They may remain internal `PrivacyDataCategory` owner IDs for export/inventory code, but summary/export/delete transport requests from Settings must reject them.
- One service admission gate serializes policy, inspect, preview, cleanup, delete, export, disclosure, and Secret operations. Each cleanup snapshots one `nowMs`; timeout, caller cancellation, and destroy abort linked work and await admitted operations.
- Saving a shorter policy persists first, then cleans only shortened categories. Cleanup failure cannot undo or misreport a durably saved policy; it produces local OperationalError evidence with stable public codes.
- Ordinary export opens the save dialog in main, validates fixed owner projections, writes bounded records through an exclusive same-directory temporary handle with backpressure, syncs file and directory, and finalizes without overwriting a changed target. Cancellation/failure removes temporary state.
- Plugin ordinary export may include fixed KV/config/ordinary files, but it excludes every log directory/file, SQLite/SQLite3/DB plus WAL/SHM/journal artifact, cache, and Temp entry. SQLite requires a separate explicit product flow; logs are never ordinary uninstall export.
- Export projections are category/kind allowlists. Secret, password, credential, token, path, SQL, endpoint, prompt/request/response, native error, stack, image/audio bytes, and arbitrary payload fields fail closed. Secret plaintext is never part of ordinary export.
- Secret backup/restore dialogs and bounded file handles stay in main. Backup writes only portable catalog entries. Restore authenticates and validates before preview, returns an opaque expiring restore ID, binds conflict policy and store revision, rejects replay/stale identity, and performs one atomic secure-store batch.
- Passwords and decrypted values are operation-local and never enter renderer result data, ordinary state, logs, telemetry, report context, or error text. Public Secret results expose counts, cancellation, stable codes, and format/version only.
- Provider disclosure projects fixed destination class, data categories, capabilities, and local retention categories. Custom endpoints become a generic safe label; credentials, query strings, request bodies, account tokens, and provider-native errors are absent. Provider connection tests return fixed success/unknown-failure text; provider-controlled model names and native error messages do not cross to renderer.
- Production wiring routes Clipboard/OCR/Diagnostics to the auxiliary database, Search to primary+auxiliary detail owners, Intelligence to primary, and diagnostics files to captured `innerRoot/logs`. It registers after storage/database owners and disposes handlers before awaiting coordinator/service teardown.
- One daily coalesced maintenance callback returns the real scheduled-cleanup Promise. No detached owner work or second coordinator path is allowed.

### 4. Validation & Error Matrix

| Condition                                                                        | Required result                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Plugin/forged context or malformed request/result                                | `PRIVACY_REQUEST_INVALID` before service/owner/dialog work                          |
| Unknown/unowned or independently governed Memory/plugin-data category            | Reject before service/owner work; use the independent typed lifecycle               |
| Category delete preview ID is missing, expired, replayed, or category-mismatched | `PRIVACY_REQUEST_INVALID` before policy load/delete; never trust confirmation alone |
| Timeout/caller abort/destroy                                                     | Abort linked work, clean temp/plan state, drain admission, return cancellation code |
| Export owner emits forbidden/oversized/partial data                              | Fail export, remove temp, preserve target                                           |
| Target identity changes or exists at finalization                                | Fail closed; never overwrite the replacement                                        |
| Backup/restore file is symlinked, replaced, oversized, or non-regular            | Reject before crypto/commit and expose no path                                      |
| Restore ID expired/replayed/policy-mismatched/store-revision changed             | Stable invalid/conflict result; no mutation                                         |
| Wrong password or envelope tampering                                             | One redacted authentication failure class                                           |
| Provider contains custom endpoint/key/request fields                             | Return only generic safe disclosure projection                                      |
| Module init fails after partial registration                                     | Dispose handlers/coordinator/service and reject startup                             |

### 5. Good/Base/Bad Cases

- Good: a host renderer requests selected Search metadata export; main writes a bounded atomic v1 file and returns only item/byte counts plus cancellation/report metadata.
- Base: a host renderer previews exact Clipboard categories, receives a main-issued opaque ID, and consumes it once with the exact categories and confirmation literal.
- Base: Secret restore preview reports new/conflicting entry counts, then one matching opaque restore ID applies explicit `skip` or `overwrite`.
- Bad: return a chosen path to renderer, accept plugin transport because context is structurally plain, publish Memory/plugin-data as central categories without production owners, export plugin logs/SQLite, trust a confirmation literal without a live preview ID, or expose a provider-controlled model/error string.

### 6. Tests Required

- Service tests cover hostile dependencies/options, exact category authority, one-now cleanup, serialization, timeout/cancel/destroy, partial owner failures, policy-shortening durability, redacted OperationalError reports, and missing/mismatch/replay/expiry preview IDs before owner work.
- Transport tests cover every typed event, host-only authority, request/result normalization, separate `cleanup.preview` and `category.delete-preview` routes, main-issued preview admission, independent Memory/plugin-data rejection, handler disposal, and no raw event duplicates.
- Export tests use real temporary files plus injected failures for backpressure, limits, cancellation, target replacement, symlink, sync, finalization, temp cleanup, and forbidden canaries.
- Secret file tests cover dialog cancellation, bounded regular-handle reads/writes, identity replacement, timeout/destroy, opaque plan TTL/replay/conflict, atomic restore, and no plaintext/path result.
- Production wiring tests assert the registry covers exactly `PRIVACY_SETTINGS_DATA_CATEGORIES`, uses exact database clients and `innerRoot/logs`, and preserves one module singleton/task with awaited teardown.
- Provider tests cover local/remote/Nexus/custom shapes, credential/endpoint/query/request leakage, provider-controlled model names, and unknown native error canaries.
- Plugin ordinary export tests seed logs and SQLite/WAL artifacts with canaries and prove no record contains their names or bytes.
- Required gates: all Privacy/Temp/secure-store tests, utils SDK tests, Node/Web typechecks, scoped lint/format, production Vite build, and `git diff --check`.

### 7. Wrong vs Correct

#### Wrong

```ts
const preview = await privacySdk.category.previewDelete(selectedCategories)
await privacySdk.category.delete(selectedCategories, 'delete-selected-data')
```

#### Correct

```ts
const preview = await privacySdk.category.previewDelete(selectedCategories)
if (!preview.ok) return preview
return privacySdk.category.delete(selectedCategories, 'delete-selected-data', preview.data.previewId)
// Main consumes the short-lived category-bound ID once before owner work.
```

---

## Scenario: Main-Owned Provider Credential Lifecycle And Executable Inventory

### 1. Scope / Trigger

- Trigger: changing Intelligence Provider configuration, Provider test/model fetch, `StorageList.IntelligenceConfig`, the legacy `intelligence/providers` row, Plugin Secret fields, official Translation `providers_config`, portable catalog membership, or the sensitive-data inventory.
- Ordinary metadata may remain in app/plugin config. Credential values belong to the main-owned secure store and may enter a renderer only as an operation-local password/credential input or an authorized Plugin Secret runtime result.

### 2. Signatures

```ts
initializeProviderCredentialLifecycle(): Promise<void>
resolveProviderCredential(provider): string | undefined
saveProviderCredentialConfig({ provider, credential }): Promise<ProviderStoredConfig>
deleteProviderCredentialConfig({ providerId }): Promise<{ deleted: boolean }>

migrateTranslationProviderCredentials(dependencies): Promise<{
  config: Record<string, unknown>
  migrated: number
}>

secret.setMany(entries): Promise<PluginStorageSecretMutationResponse>
redactProviderConfigDocument(value): Record<string, unknown>
```

The typed credential mutation is exactly `preserve`, `set(value)`, or `clear`. Persisted Provider DTOs contain no `apiKey`; they expose only `authRef` and `hasCredential`.

### 3. Contracts

- Intelligence initialization completes credential migration before creating or loading Provider runtime instances. Runtime config, Provider test, and model fetch resolve saved credentials in main by Provider ID; Nexus auth continues to use the main-owned login token path.
- For each legacy ordinary config surface: validate the complete Provider list, snapshot prior secure values, apply one atomic secure-store batch, durably persist the sanitized document, then publish the new in-memory credential cache. Secure failure leaves ordinary config unchanged. Config failure restores every prior secure value. Rollback failure emits only a stable local code, clears the runtime credential cache, and fails startup/action closed.
- Migration and save/delete operations are single-flight/serialized. Durable config writes use the current storage revision. A stale writer cannot overwrite a newer Provider document; replacement/deletion restores the prior secure value when metadata persistence fails. Any failed compensation clears cached credentials because persisted secure/config state is no longer provable.
- Generic Storage IPC projects Intelligence config through `redactProviderConfigDocument()` and rejects any incoming Provider object with an own `apiKey` field. Renderer state never uses `apiKey` as a persisted availability flag.
- The Provider settings credential field is local transient state. Blur submits the typed main action; success immediately clears the input and updates only `authRef`/`hasCredential`. Explicitly editing the field to empty means `clear`; an untouched empty field means preserve.
- Official Translation legacy migration runs in the main Plugin Storage handler. A non-blank secure value is authoritative and is never overwritten by its legacy mirror; remaining fixed legacy fields are written atomically before saving sanitized `providers_config`. Config failure restores prior Secret values. Concurrent reads share one migration Promise, and restart retries are idempotent.
- If Translation migration cannot commit but compensation succeeds, the legacy file remains unchanged. `getFile` still returns a sanitized projection, while authorized `secret.get` may resolve a legacy field main-side as a temporary compatibility fallback. Rollback failure marks that activation fatal: Secret fallback and further migration stay fail-closed until a new activation/restart. No legacy credential is returned through ordinary Plugin Storage.
- New multi-field Plugin Secret changes use typed `set-secret-batch`; main validates authoritative activation identity, permission, count, exact keys, duplicate keys, and every value before one secure-store mutation.
- `PORTABLE_SECRET_CATALOG_V1` contains only fixed product-approved credentials. Nexus/session/account tokens, sync keys, machine seeds, device identity, dynamic custom Provider keys, unknown Plugin Secrets, and caller-selected secure-store names are non-portable.
- `docs/engineering/sensitive-data-inventory.json` is the executable source for sensitive owners, physical storage, writers/readers, export, deletion, retention, renderer exposure, portability, migration status, and evidence. Any affected code change updates the inventory and passes `corepack pnpm privacy:inventory:verify`.
- The isolated Electron Privacy lifecycle smoke uses synthetic fixtures, a temporary user-data root, fake Provider and dialog owners, built production handlers/services, no real network/provider/account data, and a hard timeout. Passing evidence must cover at least typed policy/summary, export dialog ownership, Secret backup/restore, provider disclosure redaction, and cleanup/delete lifecycle.

### 4. Validation & Error Matrix

| Condition                                                        | Required result                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Fresh install without credentials                                | No secure mutation and no ordinary config rewrite                                           |
| Valid legacy Provider/Translation credentials                    | One atomic secure write, then sanitized durable config, then runtime availability           |
| Secure-store batch fails                                         | Legacy ordinary file/row remains byte-usable; stable local failure only                     |
| Sanitized config persistence fails                               | Restore previous secure values and retain legacy config                                     |
| Provider/Translation rollback fails                              | Stable rollback code; clear/block runtime credential use for the current process/activation |
| Existing non-blank Translation Secret conflicts with legacy      | Keep secure value authoritative; sanitize legacy mirror without overwriting it              |
| Two concurrent startup reads or mutations                        | One migration or serialized revision-aware mutation; no partial state                       |
| Restart after completed migration                                | No repeat write; hydrate main runtime credential from secure store                          |
| Renderer Storage payload owns `apiKey`                           | Reject before cache/persistence; return no credential in projection/error                   |
| Provider replacement or deletion metadata write fails            | Restore previous credential and report action failure                                       |
| Translation migration is deferred                                | Sanitize `getFile`; authorized Secret SDK may use main-side legacy fallback                 |
| Catalog request names Nexus/session/sync/machine/custom identity | Reject as forbidden/non-portable                                                            |
| Inventory entry/evidence/lifecycle field missing                 | Verifier exits non-zero                                                                     |
| Smoke fixture touches real account/network/native user data      | Fail the harness before lifecycle action                                                    |

### 5. Good/Base/Bad Cases

- Good: startup finds a legacy OpenAI key, writes the allowlisted secure entry, commits a revision-bound config containing `hasCredential`, and injects the key only while constructing the main Provider runtime. A Translation legacy mirror is removed without replacing a newer secure value.
- Base: a fresh install has disabled Providers and no secure entries; initialization performs no writes.
- Bad: autosave `apiKey` on each keystroke, sanitize the only legacy copy after a failed Secret write, republish a credential cache after rollback failure, overwrite a non-blank secure Translation Secret from legacy config, expose a secure-store key to renderer, or add login/sync/machine material to the portable catalog.

### 6. Tests Required

- Provider tests cover fresh, legacy, secure failure, config failure plus rollback, rollback-failure cache clearing, restart idempotency, concurrent initialization, replacement, deletion, strict save DTO validation, renderer/config redaction, and sensitive canaries in errors/results.
- Translation tests cover fixed-field extraction, secure-value authority, one batch, secure failure, config failure plus rollback, activation-fatal rollback failure, restart, sanitized projection, main-side legacy fallback, duplicate batch denial, and renderer Secret-SDK-only loading.
- Storage/SDK tests cover typed provider save/delete, typed Plugin Secret batch, ordinary `apiKey` rejection, redacted get/getVersioned, runtime injection, and no raw Privacy/uninstall event duplicates.
- Inventory verification and scoped lint/typecheck/tests are mandatory. Production Electron smoke is an evidence level above mocked service tests; a smoke blocked by environment must be reported as blocked, never silently counted as passed.

### 7. Wrong vs Correct

#### Wrong

```ts
intelligenceSettings.updateProvider(id, { apiKey })
await Promise.all(secretFields.map(field => secret.set(field, config[field])))
await storage.setFile('providers_config', stripSecrets(config))
```

#### Correct

```ts
await intelligenceSdk.saveProviderConfig({
  provider: publicProvider,
  credential: { action: 'set', value: transientInput },
})

await secret.setMany(fixedCredentialEntries)
// Main migration/save owns atomic secure mutation, sanitized persistence, rollback,
// and fail-closed cache/activation state when compensation cannot be proved.
```

---

## Scenario: Generation-Bound Plugin Uninstall And Privacy Settings

### 1. Scope / Trigger

- Trigger: changing Plugin uninstall confirmation/disposition, Privacy controls under `/setting/storage`, renderer password state, provider disclosure presentation, or legacy storage cleanup actions that overlap fixed Privacy owners.
- The UI selects user intent only. Exact plugin generation, owner admission, dialogs, paths, deletion roots, secure-store names, and residual verification remain main-owned.

### 2. Signatures

```ts
type PluginApiUninstallRequest = {
  version: 1
  plugin: {
    name: string
    pluginInstanceId: string
    activationGeneration: number
  }
  confirmed: true
  disposition: {
    ordinaryExport: boolean
    secretBackup?: { password: string }
  }
}

createPrivacySdk(useTuffTransport()): PrivacySdk
pluginSDK.uninstall(request: PluginApiUninstallRequest): Promise<PluginApiUninstallResponse>
```

`PrivacyDataSection.vue` is mounted once directly under `/setting/storage`. It never uses raw `storage:cleanup:*` channels for Privacy-owned categories.

### 3. Contracts

- Uninstall binds the exact loaded plugin name, instance ID, and activation generation before teardown, then re-resolves that identity before every incomplete stage and residual inspection. Identity drift, stale UI state, reload, or replacement fails closed before the next export, backup, deletion, or code removal.
- Production captures canonical data/code root `dev`/`ino` before admission. Persistent root deletion renames the exact directory to a random same-parent recovery path, verifies the moved identity, and only then recursively removes it. A mismatched replacement is never deleted or overwritten; its recovery path counts as a residual. Data-root deletion occurs after optional export, code remains last.
- Main ordering is admission stop, runtime/resource exit, optional ordinary export, optional encrypted portable-Secret backup, logger flush, plugin-wide SQLite close/verification, permission/authority invalidation, fixed Secret namespaces, Temp/cache/data/plugin row, code removal last, then exact residual verification.
- Export cancellation/failure and Secret backup failure are non-destructive. Post-barrier cleanup failure retains stopped installed retry ownership and blocks replacement admission; success is reported only after no exact plugin data, SQLite owner/file, Secret prefix, Temp/cache namespace, plugin row, or code remains.
- Disable preserves durable data and Secrets. Permission revoke invalidates authority and clears capability-owned resources/Temp only. Neither path reuses uninstall deletion semantics.
- The Settings Privacy section uses only the typed Privacy SDK for policy, summary, cleanup preview/run, category delete preview/run, export, disclosure, backup, and restore. It exposes only `PRIVACY_SETTINGS_DATA_CATEGORIES`, which exactly match production lifecycle owners. Memory remains under its typed delete/tombstone lifecycle and plugin data under generation-bound uninstall. Generic storage maintenance keeps only unrelated file-index, download, and update actions.
- Manual category deletion requires a complete current impact preview for exactly the selected categories plus the main-issued short-lived `previewId`; main consumes the ID once before policy load or owner work. Retention cleanup preview cannot authorize permanent deletion.
- Uninstall ordinary export excludes logs, cache, Temp, and SQLite/DB artifacts; reversible base64 file chunks do not make those surfaces safe. SQLite needs a separate explicit product choice.
- Renderer passwords are component-local transient refs. Backup clears password and confirmation at request start. Restore preview and apply require separate entry, and cancel, error, identity change, completion, late result, and unmount clear password plus opaque restore authority.
- Provider disclosure renders only the fixed safe projection. Custom endpoints, credentials, query strings, prompt/response, image/audio/file content, and native errors never enter DOM state.
- Destructive dialogs use semantic controls, an explicit impact summary, pending locks, initial focus, Tab containment, Escape cancellation, focus restoration, accessible names/descriptions, and `aria-live` status. All visible copy comes from parity-checked `en-US` and `zh-CN` catalogs.

### 4. Validation & Error Matrix

| Condition                                                           | Required result                                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Plugin instance/generation differs from the confirmation snapshot   | Stable stale-identity failure; no next export, backup, delete, or code removal         |
| Data/code root `dev`/`ino` differs from the admitted snapshot       | Stable stage failure; preserve replacement/recovery and retain retry ownership         |
| Optional export or encrypted backup is cancelled/fails              | Keep plugin stopped and installed; report cancellation/failure, never success          |
| SQLite/Secret/data/plugin-row/code/residual stage fails             | Await safe later cleanup, retain retry ownership, return stable aggregate stage/status |
| Disable or permission revoke                                        | Preserve durable plugin data and Secrets                                               |
| Category delete lacks exact current preview or valid main-issued ID | Keep confirmation blocked; reject before policy/owner work; consume valid IDs once     |
| Password is short, malformed, stale, or mismatched                  | Reject locally/main-side as appropriate; clear transient authority                     |
| Provider disclosure contains unsafe fields                          | Reject/project before renderer; render no unsafe value                                 |
| Dialog closes during pending operation                              | Keep operation state authoritative; prevent duplicate action and stale focus mutation  |
| Legacy Privacy-owned `storage:cleanup:*` channel is reintroduced    | Source-contract test fails                                                             |

### 5. Good/Base/Bad Cases

- Good: the user previews exact Clipboard deletion impact, confirms through the typed SDK, and the fixed owner deletes eligible roots while protected counts remain visible and no path/SQL reaches renderer. Plugin uninstall quarantines and verifies the admitted data/code inode before recursive removal.
- Base: the user uninstalls the current plugin generation with ordinary export selected; main exports, tears down, deletes, verifies residuals, then reports success.
- Bad: pass only a plugin name, check generation only once, recursively remove a path after a separate `realpath` check, reuse a retention preview for delete-all, keep a password in a store, call `sendRaw('storage:cleanup:clipboard')`, or remove plugin code before data/Secret/SQLite verification.

### 6. Tests Required

- Settings component tests cover defaults/options, summary refresh, protected-item guidance, separate cleanup/delete previews, export cancellation, backup/restore conflicts, password clearing, pending state, focus trap/restoration, keyboard operation, and `aria-live` output.
- Integration/source tests prove one direct storage-page mount, visibility outside Advanced mode, typed SDK ownership, and absence of overlapping raw logs/Temp/Clipboard/OCR/analytics/usage/Intelligence cleanup channels.
- i18n tests prove English/Chinese key parity and reject hardcoded visible copy.
- Plugin UI/transport/coordinator tests cover exact identity/generation at every stage, export/backup choices, cancellation, every ordered failure, retry ownership, disable/revoke distinction, code-last deletion, and residual verification. Production filesystem tests replace admitted data/code roots and prove both replacement and original recovery survive without deletion.
- Controlled Electron smoke uses an isolated generated profile and fake providers/dialogs; it proves every typed Privacy handler and removes all artifacts without touching a real provider or user profile.

### 7. Wrong vs Correct

#### Wrong

```ts
await transport.send('storage:cleanup:clipboard', { beforeDays: 30 })
await pluginSDK.uninstall({ name: plugin.name })
```

#### Correct

```ts
const impact = await privacySdk.category.previewDelete(['clipboard-history'])
if (impact.ok && isCurrentCompleteImpact(impact.data)) {
  await privacySdk.category.delete(['clipboard-history'], 'delete-selected-data', impact.data.previewId)
}

await pluginSDK.uninstall({
  version: 1,
  plugin: currentGenerationIdentity,
  confirmed: true,
  disposition: { ordinaryExport: true },
})
// Main rechecks generation before each stage and quarantines only the admitted root inode.
```
