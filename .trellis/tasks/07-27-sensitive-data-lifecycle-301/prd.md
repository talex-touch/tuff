# 实现敏感数据生命周期控制 #301

## Goal

为本地敏感数据提供统一、可配置、可审计的保留、预览、导出、删除、远程处理披露、密码加密 Secret 备份恢复，以及插件卸载数据处置语义。

## Confirmed Product Decisions

### Default retention

- Clipboard history defaults to 90 days.
- Clipboard records explicitly marked favorite/pinned/important are exempt from automatic retention cleanup and remain until the user unpins or deletes them.
- OCR and screenshot temporary data defaults to 24 hours.
- Search query/completion/usage detail defaults to 30 days.
- Intelligence audit metadata and non-pinned Context conversation data defaults to 30 days.
- Explicit AI Memory follows its own TTL or user deletion and is not deleted by audit retention.
- Raw provider request/response payloads are not additionally persisted by this lifecycle feature.
- Supported retention periods are user-configurable in Settings; policy normalization is main-owned and bounded.

### Plugin lifecycle

- Disable preserves persistent plugin data while closing active resources.
- Permission revoke immediately invalidates authority and clears capability-owned temporary resources, but does not silently delete persistent data.
- Uninstall requires explicit confirmation, offers export before deletion, then awaits removal of plugin code, data/cache/temp files, SQLite databases, plugin records, and Secret entries.
- Export or deletion failure must not report successful uninstall.

### Export, backup, and restore

- Ordinary export uses a documented versioned format and excludes Secret plaintext.
- Secret/API-key backup is supported only as a separate password-encrypted, authenticated envelope.
- Restore authenticates and validates the complete envelope before an atomic secure-store mutation; conflicts require an explicit skip/overwrite decision.
- Passwords, plaintext secrets, derived keys, and decrypted values never enter logs, telemetry, ordinary persistence, or long-lived renderer state.

### Remote processing disclosure

- AI, OCR, translation, audio, and other remote-provider data categories are disclosed in Settings rather than through a first-use or per-call blocking prompt.
- Disclosure identifies the provider/destination class, purpose, possible transmitted data categories, related capabilities, and local retention behavior.
- Tuff does not claim to control remote provider retention; the user can disable the provider/capability and clear local records.

## Requirements

### R1. Main-owned lifecycle policy

- Define one versioned policy with fixed category IDs and bounded values.
- Persist normalized settings through the existing main storage owner.
- A single main-owned coordinator schedules and executes cleanup by delegating to existing domain owners; renderer code never selects tables, SQL, paths, or Secret keys.
- Cleanup is cancellable, idempotent, low priority, bounded, and observes database write scheduling/retry contracts.

### R2. Domain owner behavior

- Clipboard cleanup excludes favorite/pinned/important records and awaits associated image/orphan cleanup.
- OCR/screenshot intermediate files use registered temp namespaces with the configured retention; completed work deletes eagerly and scheduled cleanup is the fallback.
- Search retention applies to query/completion/usage/contextual detail and caches, not file/app/search index source-of-truth rows.
- Intelligence audit cleanup does not delete quota/provider/prompt configuration. Context cleanup deletes inactive session aggregates as one owner transaction. Memory remains separately governed.
- Logs/telemetry queues retain only bounded redacted metadata and obey their configured lifecycle.

### R3. Typed privacy SDK

- Add shared discriminated request/result types and typed events/domain SDK for policy get/update, summary, cleanup preview/run, category export/delete, provider disclosure, Secret backup preview/write, and Secret restore preview/apply.
- Every boundary validates exact DTOs, size/count limits, operation state, and stable error codes.
- Main owns file dialogs and bounded streaming I/O; export content and Secret plaintext never cross renderer transport.

### R4. User controls

- `/setting/storage` exposes an un-nested full-width Privacy & Data area visible to all users.
- Users can inspect category size/count/retention, change supported retention periods, preview and execute clear/delete, export selected data, and run encrypted Secret backup/restore.
- Destructive actions use semantic controls, explicit impact summaries, keyboard/focus-safe confirmation, pending/disabled states, and bilingual message-catalog text.
- Provider settings show the fixed remote-processing disclosure without credentials, full request content, or unsafe endpoint detail.

### R5. Plugin uninstall disposition

- Uninstall UI offers an export step before final confirmation.
- Main closes runtime/resources before export/delete, preserves installation if required export fails, and reports stable aggregate cleanup failures.
- Successful uninstall proves the exact plugin generation has no remaining data directory, SQLite owner, Secret prefix, cache/temp namespace, or plugin data row.

### R6. Portable encrypted Secret backup

- Use a versioned JSON envelope with random salt and nonce, Node `scrypt` with bounded parameters, and AES-256-GCM authenticated encryption; no new dependency.
- Bind canonical non-secret header fields as AAD and enforce file, entry, key/value, and KDF limits before expensive work or allocation.
- Export only allowlisted portable credentials. Device identity, session tokens, machine seeds, and sync keys are never portable.
- Restore verifies authentication, schema, portable catalog, duplicates, limits, and conflict plan before atomic commit with rollback.

### R7. Privacy evidence

- Synthetic canary tests prove raw clipboard, OCR, query, prompt/response, SQL parameters, path, password, Secret, and native errors do not enter transport, UI error payloads, telemetry, or ordinary logs.
- Documentation provides a data inventory covering collection, storage, use, network transfer, retention, deletion, export, backup, and restore.

## Acceptance Criteria

- [x] The documented inventory covers Clipboard, OCR/screenshots, search detail/index/cache, Intelligence audit/Context/Memory, plugin data/SQLite/Secret, logs/telemetry, and remote providers.
- [x] Default and configurable retention policies match the confirmed product decisions; cutoff boundaries and invalid settings are tested.
- [x] Automatic clipboard cleanup retains favorite/pinned/important records and removes eligible rows plus associated files deterministically.
- [x] OCR/screenshot temp artifacts are removed after 24 hours by default and cleanup remains owner-bound.
- [x] Search detail and Intelligence audit/Context retention remove only eligible data and preserve index/config/quota/Memory contracts.
- [x] Settings exposes summary, retention, preview, export, clear/delete, encrypted Secret backup/restore, and remote-provider disclosure with bilingual accessible UI.
- [x] Secret backup round-trip, wrong password, header/ciphertext/tag tampering, unknown version, duplicate/forbidden key, oversized input, conflict, rollback, and redaction tests pass.
- [x] Disable/revoke/uninstall semantics match the approved contract; uninstall export/delete failures never report success.
- [x] Telemetry/logging canary tests find no raw sensitive values in public/remote projections.
- [x] Focused tests, temporary-libSQL integration, CoreApp Node/Web typechecks, scoped lint, production build, controlled Electron smoke, and `git diff --check` pass.
- [x] Independent review reports no open P0/P1/P2 privacy, deletion, backup, authority, or redaction finding.

## Out Of Scope

- Deleting data already retained by third-party providers; Settings discloses that provider policy is external.
- Cloud synchronization of plaintext Secret values.
- Legal/compliance certification or jurisdiction-specific retention promises.
- A new database engine, storage framework, or generic renderer filesystem API.
- Automatic deletion of persistent plugin data on disable or permission revoke.
