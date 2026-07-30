# Design — Sensitive Data Lifecycle #301

## Architecture

```text
Settings Privacy UI
  -> typed Privacy SDK
  -> main PrivacyLifecycleService
      -> Clipboard owner
      -> OCR/Screenshot temp owner
      -> Search detail owner
      -> Intelligence audit/Context owner
      -> Analytics/Log owner
      -> Plugin data owner
      -> Portable Secret backup owner
```

`PrivacyLifecycleService` is an orchestrator, not a second storage implementation. Every data class remains owned by its existing service and schema. The coordinator owns policy normalization, schedule state, operation admission, preview/result aggregation, and stable public errors.

## Policy Contract

```ts
type PrivacyRetentionCategory =
  | 'clipboard-history'
  | 'ocr-screenshot-temp'
  | 'search-history'
  | 'intelligence-audit'
  | 'intelligence-context'
  | 'diagnostics'

interface PrivacyRetentionPolicyV1 {
  version: 1
  categories: Record<PrivacyRetentionCategory, {
    enabled: boolean
    retentionMs: number | null
  }>
}
```

Defaults are 90 days Clipboard, 24 hours OCR/screenshot temp, and 30 days search, Intelligence audit/Context, and diagnostics. `null` means user-selected permanent retention where supported. Main normalizes integer values against a fixed minimum/maximum and fixed selectable periods. Clipboard favorite/pinned/important is an owner-level exemption, not a client-selected category.

Policy lives in the existing app settings/storage owner. Saving a shorter policy schedules one bounded cleanup after durable persistence; extending retention never attempts to restore deleted data.

## Owner Interface

```ts
interface PrivacyDataOwner {
  readonly categories: readonly PrivacyDataCategory[]
  inspect(request, signal): Promise<PrivacyCategorySummary>
  previewDelete(request, signal): Promise<PrivacyDeletePreview>
  delete(request, signal): Promise<PrivacyDeleteResult>
  export(request, writer, signal): Promise<PrivacyExportResult>
  applyRetention(policy, now, signal): Promise<PrivacyCleanupResult>
}
```

Construction snapshots direct methods and rejects accessors/proxies. All operations serialize per owner, use AbortSignal, cap rows/bytes/duration, and return counts plus stable codes only. Native messages, SQL, paths, prompts, query text, and Secret names/values are excluded.

## Domain Contracts

### Clipboard

The existing `clipboard_history.isFavorite` is the canonical pinned exemption. A bounded metadata projection may mark an item important only through one host-defined boolean/tag contract; arbitrary plugin metadata cannot create retention authority. Cleanup selects eligible rows by cutoff and exemption before limits. Associated images are collected and deleted through the Clipboard image owner; orphan reconciliation makes retry idempotent.

### OCR and screenshots

Intermediate bytes use fixed TempFileService namespaces with configurable retention, default 24 hours. Successful/failed operations delete eagerly. Database OCR job/result cleanup uses the same cutoff and never returns OCR text to lifecycle UI.

### Search

Retention covers query completion, raw usage/query/context detail, contextual behavior, and recommendation/query caches. It does not remove File/App producer rows, search index documents, embeddings tied to current source records, user-pinned recommendations, or configuration. Query-related logs retain hash/length only.

### Intelligence

Audit cleanup removes only audit/usage records. Context cleanup removes eligible inactive sessions as an aggregate so FK-owned turns/checkpoints/snapshots/package logs remain consistent. Active sessions, explicit Memory, quota, provider configuration, prompts/templates, and capability registry are preserved. No lifecycle table stores provider payloads.

### Plugins

- disable: close runtime/resource owner, retain durable data;
- revoke: invalidate permission authority, dispose dependent resources/temp artifacts, retain durable data;
- uninstall: close admission/runtime, optionally export, delete Secret/data/cache/SQLite/plugin row, then remove code. Every stage is awaited. Failure leaves a stable stopped/installed or retryable state and never reports success.

## Typed Transport

Add shared privacy events and a domain SDK. Requests are exact discriminated unions with fixed category/action IDs. Main handlers own dialogs and stream exports directly to selected files. The renderer receives only summaries, progress, stable result codes, and a boolean indicating whether a dialog was cancelled.

No request accepts SQL, table, path, Secret prefix, provider endpoint, arbitrary retention milliseconds, or native owner ID.

## Export Format

Ordinary data export is `talex.touch.privacy-export/v1`, written incrementally by main. It contains selected categories, export time, policy version, bounded records, and no Secret plaintext, cache/index bytes, native paths, or provider remote data. Export cancellation removes the temporary file; finalization uses atomic rename.

## Secret Backup Envelope

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

- Password minimum: 12 Unicode code points and bounded UTF-8 bytes.
- KDF: Node async `scrypt`, 32-byte key, fixed bounded parameters and max memory.
- Cipher: AES-256-GCM, random 12-byte IV, 16-byte tag.
- AAD: canonical UTF-8 JSON of immutable non-secret header fields.
- Payload: exact bounded entries from a portable Secret catalog.
- Derived key/password/plaintext buffers are zeroed where possible and never logged.

Restore performs bounded parse, KDF, authentication, exact schema/catalog validation, duplicate/conflict planning, then one secure-store batch mutation. `skip` and `overwrite` are explicit. Failure restores the prior secure-store snapshot. Machine/session/sync identity keys are never catalogued as portable.

## Provider Disclosure

Settings derives disclosure from host provider/capability configuration through a safe projection:

```ts
{
  providerId,
  displayName,
  destinationClass: 'local' | 'remote' | 'nexus-managed',
  dataCategories: ('text'|'clipboard'|'image-ocr'|'audio'|'file-context'|'usage-metadata')[],
  capabilities: string[],
  localRetentionCategories: PrivacyRetentionCategory[]
}
```

Custom endpoints are represented as `custom remote endpoint` or a safe origin label only when existing settings already expose it; credentials, query strings, request bodies, and account tokens are absent. This is informational and does not add a call-time consent bypass.

## UI

Add a full-width Privacy & Data section at `/setting/storage`, visible outside Advanced mode:

- retention rows use selects/toggles with explicit defaults and exemption text;
- category summaries show counts/bytes/last cleanup;
- export/delete use category checkboxes and impact preview;
- encrypted Secret backup/restore uses transient password inputs with `autocomplete="new-password"`/`current-password`, confirmation, and no persisted model;
- provider disclosure uses an unframed list/table, not nested cards;
- destructive actions are semantic buttons with confirmation, pending/disabled state, focus restoration, and `aria-live` result status;
- all user copy is in `zh-CN` and `en-US` catalogs.

## Scheduling And Failure Semantics

A single PollingService task runs daily after storage initialization. Manual and scheduled operations share one admission gate. Deletes are paginated and use the DB write scheduler at low priority. Caller cancellation stops before the next batch. Completed batches remain observable and retry-safe.

Public results contain stable codes and report IDs. OperationalErrorService retains native detail locally. Cleanup, export, restore, and uninstall aggregate all stage failures without swallowing later cleanup.

## Migration

- Add only the indexed columns/schema required by the selected owner queries; use the next numbered journaled migration when DDL is needed.
- Existing favorite rows are retention-exempt immediately.
- Existing retention config is normalized to V1 defaults without deleting data during migration.
- Provider credentials currently stored outside secure-store migrate through a read-once/write-secure/remove-plaintext transaction; failed migration preserves the prior usable state and reports a stable local issue.
- First cleanup runs after startup, not inside the migration transaction.

## Security Review Targets

- renderer cannot select a path/table/key/provider credential;
- forged policy/category/backup envelopes fail before owner work;
- cleanup never deletes protected Clipboard/Memory/index/config records;
- uninstall cannot report success with residual Secret/data/SQLite state;
- backup crypto rejects tampering and resource-exhaustion parameters;
- canary values never enter public errors, transport, telemetry, or normal logs.
