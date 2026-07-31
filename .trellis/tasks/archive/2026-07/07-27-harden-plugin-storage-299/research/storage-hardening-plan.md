# Plugin Storage Hardening Research Plan (#299)

## Scope And Snapshot

This research covers GitHub Issue #299, the confirmed SQLite/permission audit,
the current storage/secret/SQLite transport and SDK contracts, the committed
`PERMISSION_REVOKED` event work present in this worktree, and plugin lifecycle
paths. It does not modify product code.

Important worktree condition: #300 caller-identity work is currently present as
uncommitted/partial code under `packages/utils/transport/**`. The #299 design
must consume its public `isAuthoritativePluginContext()` contract after #300 is
complete; it must not duplicate key validation or treat `verified` as proof.

Primary sources:

- GitHub #299: <https://github.com/talex-touch/tuff/issues/299>
- Prior audit: `.trellis/tasks/07-27-audit-plugin-privileged-security/research/sqlite-permission.md`
- Installed direct dependency: `apps/core-app/package.json:98` uses
  `@libsql/client@^0.17.4`; the lock resolves `@libsql/client@0.17.4` and
  transitive `libsql@0.5.29`.
- Exact `libsql@0.5.29` authorizer source:
  <https://github.com/tursodatabase/libsql-js/blob/v0.5.29/src/auth.rs>
- Exact `libsql@0.5.29` API docs:
  <https://github.com/tursodatabase/libsql-js/blob/v0.5.29/docs/api.md>
- SQLite authorizer: <https://www.sqlite.org/c3ref/set_authorizer.html>
- SQLite runtime limits: <https://www.sqlite.org/c3ref/limit.html>
- SQLite limit categories: <https://www.sqlite.org/c3ref/c_limit_attached.html>
- SQLite interrupt: <https://www.sqlite.org/c3ref/interrupt.html>
- SQLite file-size controls: <https://www.sqlite.org/pragma.html#pragma_max_page_count>

## 1. Current Handler, Permission, And Client Data Flow

### Renderer SQLite lane

```text
plugin renderer
  -> usePluginSqlite()
     packages/utils/plugin/sdk/sqlite.ts:33-143
  -> createPluginTuffTransport(channel).send(PluginEvents.sqlite.*)
     payload includes caller-supplied pluginName + SQL + params
     packages/utils/plugin/sdk/sqlite.ts:52-56,84-88,124-127
  -> PluginEvents.sqlite execute/query/transaction
     packages/utils/transport/events/index.ts:2167-2184
  -> TuffMainTransport constructs HandlerContext
  -> plugin-storage-transport-service resolves plugin
     context.plugin.name first, payload.pluginName fallback
     apps/core-app/src/main/modules/plugin/services/
       plugin-storage-transport-service.ts:50-68
  -> sdkapi >= 260215 check
     plugin-storage-transport-service.ts:162-168
  -> permissionModule.checkPermission(plugin.name,
       'storage:sqlite:query', plugin.sdkapi)
     plugin-storage-transport-service.ts:170-185
  -> PermissionGuard wildcard maps storage:sqlite:* -> storage.sqlite
     apps/core-app/src/main/modules/permission/permission-guard.ts:90-94,
       153-207,276-310
  -> one cached @libsql/client Client per plugin name
     plugin-storage-transport-service.ts:149-160
  -> client.execute(raw SQL, normalized params)
     execute: 641-677; query: 680-745; transaction: 747-818
  -> SDK either returns normalized data or throws a new message-only Error
     packages/utils/plugin/sdk/sqlite.ts:58-72,90-105,129-141
```

The request types still expose `pluginName?` as payload input and responses only
carry `error?: string`: `packages/utils/transport/events/types/plugin.ts:702-741`.

### Renderer and main-local Secret lanes

Renderer calls `usePluginSecret()` and sends `pluginName` plus key/value:
`packages/utils/plugin/sdk/secret.ts:10-31`. The transport events are registered
at `packages/utils/transport/events/index.ts:2073-2097`.

The main handler uses the same `resolveTouchPlugin()` payload fallback, then
checks API name `storage:plugin:secret`, which maps to manifest permission
`storage.plugin` through `permission-guard.ts:90-93`. Secret keys become
`plugin.<pluginName>.<key>` at
`plugin-storage-transport-service.ts:188-194`, and values are stored in the
single app-global encrypted JSON store with purpose `plugin-secret`:

- get: `plugin-storage-transport-service.ts:278-303`
- health: `plugin-storage-transport-service.ts:306-320`
- set: `plugin-storage-transport-service.ts:322-356`
- delete: `plugin-storage-transport-service.ts:358-392`
- encrypted store read/write:
  `apps/core-app/src/main/utils/secure-store.ts:106-140,400-453`

Main-process plugin Prelude code receives a locally constructed Secret facade.
It calls `transport.invoke()` with `{ name, uniqueKey, verified }` created in
`apps/core-app/src/main/modules/plugin/plugin.ts:1652-1689`. #300 must replace
this self-asserted context with current activation lookup before #299 hard-cuts
the Secret handlers.

The only current repository consumer found is `touch-translation`. It calls
Secret get/set/delete/health in
`plugins/touch-translation/src/composables/useTranslationProvider.ts:67-97`
and `ProviderConfigModal.vue:25,82-99`; its manifest declares `storage.plugin`
at `plugins/touch-translation/manifest.json:29-45`. No official plugin currently
uses `usePluginSqlite()`.

### Permission and revocation lane

`PermissionModule` persists revoke/revokeAll first, then synchronously emits a
frozen `PermissionRevokedEvent`, then broadcasts the renderer projection:

- mutation handlers: `apps/core-app/src/main/modules/permission/index.ts:142-152,194-204`
- publish ordering: `apps/core-app/src/main/modules/permission/index.ts:258-280`
- event fields: `apps/core-app/src/main/core/eventbus/touch-event.ts:574-585`
- ordering tests: `apps/core-app/src/main/modules/permission/index.test.ts:56-175`

The event contains canonical grant IDs (`storage.sqlite`, `storage.plugin`), not
API mapping strings (`storage:sqlite:query`, `storage:plugin:secret`). There is
currently no storage consumer: the only production references are the event
definition and emitter.

### Client ownership and lifecycle

`PluginModule` owns `Map<string, Client>` keyed only by plugin name at
`apps/core-app/src/main/modules/plugin/plugin-module.ts:1477-1486`, injects it
into the transport service at `plugin-module.ts:1839-1848`, and closes all
clients only during whole-module destruction at `plugin-module.ts:1597-1619`.

Single-plugin lifecycle paths do not know about this map:

- disable: `plugin-module.ts:838-850`
- reload: `plugin-module.ts:853-903`
- unload: `plugin-module.ts:1061-1105`
- uninstall: `plugin-module.ts:1119-1157`
- disk-change reload/remove: `plugin-module.ts:1368-1400,1444-1450`
- plugin key revocation during `TouchPlugin.disable()`:
  `apps/core-app/src/main/modules/plugin/plugin.ts:1389-1475`
- auto-crash changes status but does not run disable/resource cleanup:
  `plugin.ts:1138-1183`

Uninstall computes the plugin data root from `dirname(getConfigPath())`, unloads
the plugin, and removes that directory at `plugin-module.ts:1127-1148`; it does
not first close the plugin's SQLite client. Secret values are outside this data
root in the global secure store and are not purged.

## 2. Currently Reachable Defects

### F1: Privileged actor can still be selected from payload

`resolveTouchPlugin()` accepts `payload.pluginName` whenever context lacks a
plugin (`plugin-storage-transport-service.ts:50-68`). A missing or structurally
forged context can therefore select any installed plugin object. Even when
permission checks are fixed, checking permission for the payload-selected
plugin is not caller authentication.

The in-progress #300 runtime brand exists at
`packages/utils/transport/security/plugin-identity.ts:8-81`, but the current
permission guard still authorizes `context.plugin?.verified === true` at
`apps/core-app/src/main/modules/permission/channel-guard.ts:97-106`. #299 must
wait for or consume #300's completed verifier contract.

### F2: Permission runtime unavailable is fail-open

- SQLite returns no error when `getPermissionModule()` is null:
  `plugin-storage-transport-service.ts:170-185`.
- Secret returns `{ success: true }` in the same condition:
  `plugin-storage-transport-service.ts:196-216`.
- Secret health has no caller or permission guard at all:
  `plugin-storage-transport-service.ts:306-320`.

This is reachable during incomplete initialization, teardown, or degraded
permission runtime. It violates #299 even if normal startup order initializes
PermissionModule first.

### F3: Raw SQL escapes the per-plugin database path

The fixed default path at `plugin-storage-transport-service.ts:155-159` only
chooses the initial database. Raw caller SQL reaches `client.execute()` at
`662-666`, `717-721`, and `789-797`. The prior audit dynamically proved
`ATTACH DATABASE` can read/write another database.

Other file/capability statements that require explicit policy include
`DETACH`, `VACUUM ... INTO`, `PRAGMA`, `load_extension`, virtual tables, trigger
creation, and transaction control. A substring blacklist is bypass-prone and
also incorrectly matches comments/string literals.

### F4: Statement boundary is ambiguous

Dynamic probe against the installed `@libsql/client@0.17.4` showed:

- `execute('SELECT 1; SELECT 2')` succeeds but executes only the first statement.
- `execute("SELECT 1; ATTACH DATABASE ...")` also silently ignores the tail.
- a standalone `ATTACH DATABASE` succeeds.

Therefore libSQL's prepare behavior does not provide a deterministic
single-statement contract. The host must reject extra executable statements,
including comment/quoted-literal edge cases, before classification.

### F5: No query, result, transaction, or disk bounds

- SQL and params have no byte/count limits: service lines `98-127,641-666`.
- Query materializes all rows and then normalizes them:
  service lines `717-735`.
- Transactions accept an unbounded array and loop it:
  service lines `747-817`.
- There is no result-byte, open-client, queue, global concurrency, database,
  WAL, or journal quota.
- Raw libSQL errors are returned through `toErrorMessage()` and logged at
  service lines `673-675,736-741,810-815`; stable public codes are absent and
  native messages can expose schema/path details.

### F6: Transactions can interleave across requests

The client cache provides one client per plugin name, but there is no per-plugin
scheduler. The transaction handler manually issues `BEGIN IMMEDIATE`, awaits
between each statement, and later commits (`plugin-storage-transport-service.ts:
784-806`). Another request can run on the same cached connection between those
awaits and become part of the wrong transaction or alter its state. This is both
an integrity defect and a cross-request isolation failure.

### F7: Client survives revoke, disable, reload, unload, and uninstall

Only whole-module destroy closes clients (`plugin-module.ts:1597-1619`). A
client keyed by plugin name can therefore be reused by a new plugin instance or
activation after reload. Revocation has no consumer. Uninstall can attempt to
remove the open database directory, which is especially failure-prone on
Windows, then leave the stale client in the map.

### F8: Path placement is lexical, not canonical

`TouchPlugin.getDataPath()` is derived as
`<appRoot>/modules/plugins/<name>/data` at `plugin.ts:1079-1085`, but SQLite
opening only calls `path.join`, `ensureDirSync`, and `createClient` at service
lines `149-159`. It does not validate the canonical app plugin root, reject a
symlinked plugin data directory/database file, or verify the opened file remains
inside the owner root. `resolveSafePath()` is lexical only
(`packages/utils/common/utils/safe-path.ts:53-90`) and is insufficient for this
database boundary by itself.

### F9: Stable SDK errors are lost

SQLite responses only define `error?: string`
(`packages/utils/transport/events/types/plugin.ts:708-741`). The SDK constructs
a new plain Error from that text at `packages/utils/plugin/sdk/sqlite.ts:
58-64,90-96,129-135`, dropping any future machine-readable code. Secret set and
delete similarly expose only optional error text, while Secret get conflates
missing value, denied access, unavailable backend, malformed key, and decrypt
failure as `null`.

### F10: Secret store mutations can lose updates and crash-corrupt globally

Each `setSecureStoreValue()` performs an unlocked read-modify-write at
`apps/core-app/src/main/utils/secure-store.ts:428-453`; the write is a direct
`fs.writeFile` at `130-140`, not temp-file + fsync/rename. Concurrent plugin
secret writes (the translation plugin intentionally uses `Promise.all` at
`useTranslationProvider.ts:83-97`) can overwrite one another. A partial write
can corrupt the single store shared by plugin and host secrets.

### F11: Secret retention has no uninstall policy

Plugin values use a deterministic `plugin.<name>.` prefix, but secure-store has
only single-key get/set/delete. Disable/unload/uninstall never purge the prefix.
Uninstall removes the plugin data directory but leaves encrypted plugin secrets
in the app-global store indefinitely.

### F12: Crash state does not tear resources down

After more than ten runtime errors, `TouchPlugin.handleRuntimeError()` sets
`PluginStatus.CRASHED` and clears lifecycle only (`plugin.ts:1169-1183`). It
does not revoke the key, close SQLite, or notify a storage owner. A per-call
status/current-activation check limits new access, but deterministic resource
cleanup needs an explicit lifecycle callback/event.

## 3. Minimum Safe Design

### 3.1 Guard ordering and actor resolution

Every SQLite and Secret handler, including Secret health, must use one shared
guard in this order:

```text
1. isAuthoritativePluginContext(context.plugin) from #300
2. context identity name/instance/generation matches the current manager plugin
3. plugin status/current activation is runnable
4. SDK version gate (SQLite >= 260215)
5. withPermission(... requireVerifiedPlugin + failClosedForPlugin)
6. payload pluginName absent or equal to authoritative name (compat check only)
7. input/path/SQL/resource policy
8. execute through instance/generation-bound resource owner
```

Recommended guard options:

```ts
{
  permissionId: 'storage:sqlite:query', // maps to storage.sqlite
  requireVerifiedPlugin: true,
  failClosedForPlugin: true,
  unavailableCode: 'PLUGIN_STORAGE_PERMISSION_UNAVAILABLE',
  deniedCode: 'PLUGIN_STORAGE_PERMISSION_DENIED',
  sdkMismatchCode: 'PLUGIN_STORAGE_SDKAPI_MISMATCH'
}
```

Secret uses `storage:plugin:secret`, which maps to `storage.plugin`. The
`requireVerifiedPlugin` implementation must be #300's runtime-brand verifier,
not `verified === true`. The handler must never fall back to payload pluginName.
First-party calls remain possible only through an explicit host-only handler or
an authoritative `local-host` plugin context; public plugin events must not turn
missing plugin context into host authority.

### 3.2 SQL tokenizer and statement classifier

The stable installed stack does not expose a sufficient native policy API, so a
host-owned lexical tokenizer/classifier is required for the first hard cut.

Tokenizer requirements:

- scan UTF-8 SQL with explicit states for normal text, `'string'`, `"identifier"`,
  backtick identifier, `[identifier]`, `--` line comments, and `/* */` comments;
- handle doubled quote escapes; reject unterminated strings/comments;
- count executable statements using semicolons outside quoted/comment states;
- allow one optional terminal semicolon only; reject a non-comment token after it;
- emit normalized keyword/identifier/punctuation tokens without retaining SQL in
  logs or errors;
- enforce byte length before tokenization.

Conservative initial classifier:

- query lane: allow a single top-level `SELECT`; reject mutating `WITH` until a
  real CTE grammar is implemented;
- execute/transaction lane: allow `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`,
  `CREATE INDEX`, `DROP TABLE`, `DROP INDEX`, and narrowly tested `ALTER TABLE`;
- always deny `ATTACH`, `DETACH`, `PRAGMA`, `VACUUM`, transaction/savepoint
  control, `load_extension`, `CREATE TRIGGER`, `CREATE VIEW`, and
  `CREATE VIRTUAL TABLE`;
- reject `RETURNING` on execute/transaction until result bounding is defined;
- host-generated `BEGIN/COMMIT/ROLLBACK` and quota PRAGMAs bypass plugin policy
  through a private trusted method, never by a boolean flag in request data.

This intentionally trades some SQL compatibility for a reviewable security
boundary. Add CTE, trigger, view, FTS, or virtual-table support only with focused
grammar/policy tests.

### 3.3 Native libSQL feasibility (verified, not assumed)

`@libsql/client@0.17.4` public `Client` exposes execute/batch/transaction/
executeMultiple/close but no authorizer, interrupt, or `sqlite3_limit`. Its
`Config.timeout` is documented as lock wait/busy timeout, not query time. The
local implementation holds its underlying `Database` in a JavaScript private
field and executes result-producing statements via `.all()`, so private access
is neither available nor acceptable.

Transitive `libsql@0.5.29` has direct `Database.authorizer()` and
`Database/Statement.interrupt()`, but:

- it is not a declared direct app dependency;
- its exact stable authorizer is experimental and table-map-only;
- it denies all functions, PRAGMAs, ATTACH/DETACH, virtual tables, transaction
  control, recursive actions, and unknown actions;
- dynamic verification showed a table allowlist permits basic SELECT/INSERT but
  rejects `count(*)`, `BEGIN IMMEDIATE`, and `CREATE INDEX`;
- it exposes no `sqlite3_limit()` binding.

Therefore the v0.5.29 authorizer is useful evidence/defense but is not a drop-in
policy for the existing SDK. The richer rule-based authorizer and native query
timeouts merged only into `libsql` 0.6 prereleases; npm `latest` remains 0.5.29.
A security fix should not silently move to the prerelease line.

Dynamic verification of `libsql/promise@0.5.29` established:

- a recursive read query was interrupted from a 25ms timer with
  `SQLITE_INTERRUPT`;
- `Statement.iterate()` yielded 1001 rows incrementally in about 3ms and can be
  stopped/interrupted without materializing the full result;
- mutation `Statement.run()` is synchronous; a long recursive INSERT blocked
  the event loop, so an in-process timer could not call interrupt.

Consequences:

- `Promise.race()` around the current client is only a response deadline; it
  does not stop CPU, memory, or disk work and must not be called a hard timeout.
- Switching only to `libsql/promise` can hard-bound incremental reads, but not
  all writes on v0.5.29.
- A true all-statement deadline requires either a separately evaluated 0.6
  stable release with native per-query timeout, or a worker/utility-process DB
  executor that the host can terminate and recreate on timeout.
- Until that exists, #299 may ship admission/resource gates but must keep the
  timeout acceptance item open, or fail closed/feature-flag SQLite for untrusted
  plugins. Do not close #299 using `Promise.race` evidence.

### 3.4 Canonical database root

Use one host-computed global root and a fixed filename; never accept a database
path/name from plugin payload:

```text
declared base = <appRoot>/modules/plugins
canonical base = realpath(declared base)
owner root = <canonical base>/<authoritative plugin name>/data
db path = <owner root>/plugin-sdk.sqlite
```

Opening algorithm:

1. Validate authoritative plugin name with `isSafePathSegment`.
2. Create the expected owner directory from host metadata.
3. Resolve `realpath(owner root)` and require strict descendant relationship to
   canonical base (path-component comparison, platform-correct case handling).
4. `lstat` every existing owner/db component; reject a symlinked DB file and any
   owner root resolving outside canonical base.
5. For an existing DB, require `realpath(db)` to be a direct child of owner root.
6. Open fixed path, then repeat lstat/realpath verification and close/delete the
   client record on mismatch.
7. Store canonical root/path in the client record; never recompute from payload.

Node path checks cannot completely remove TOCTOU when the database API accepts a
path instead of an already-open file descriptor. #297 process/filesystem
isolation remains the stronger boundary against a plugin with direct host fs
access. The checks above still satisfy ordinary traversal/symlink containment
and prevent accidental cross-root opening.

### 3.5 Resource owner and initial quotas

Replace `Map<string, Client>` with a small `PluginSqliteRuntime` owner keyed by
`pluginInstanceId`, with name + activation generation + canonical path in every
record. Conditional close/delete must compare record token/generation so stale
cleanup cannot remove a replacement.

Proposed initial limits (constants, not plugin-configurable):

| Resource | Initial bound | Enforced at |
|---|---:|---|
| SQL UTF-8 length | 64 KiB/statement | before tokenize/prepare |
| bind params | 256 values, 1 MiB aggregate | before normalize/execute |
| statements/transaction | 64 | before acquiring DB slot |
| query rows | 1,000 (+1 sentinel) | incremental iterator or host wrapper |
| serialized result | 4 MiB | incremental byte accounting |
| per-plugin active operations | 1 | resource owner scheduler |
| per-plugin queued operations | 8 | reject overflow |
| global active operations | 4 | shared scheduler |
| open plugin clients | 16 | close LRU idle clients or reject |
| queue wait | 500 ms | before execution |
| read operation target | 2 s | hard only with interruptible executor |
| transaction/write target | 5 s | hard only with killable/native executor |
| main DB file | 64 MiB/plugin | host `max_page_count` based on actual page size |
| retained journal/WAL | 16 MiB/plugin | host `journal_size_limit`; checkpoint after writes |
| aggregate plugin SQLite | 512 MiB/profile | canonical-root accounting before/after writes |

Notes:

- Per-plugin serialization fixes transaction interleaving and makes timeout/
  close ownership deterministic.
- With the current client, wrap permitted SELECT in an outer `LIMIT 1001` only
  after exact single-statement validation; this bounds returned rows but not CPU
  complexity or a single huge cell. Incremental `libsql/promise` iteration is
  preferable because it can stop at row/byte limits.
- Input param bytes and DB quota reduce giant-cell exposure. Result-byte checks
  performed after `@libsql/client.execute()` are not hard memory limits because
  the full result is already materialized.
- Read actual `page_size`, set `max_page_count = floor(64 MiB/page_size)`, then
  verify the returned value. Reject an existing DB already over quota.
- `journal_size_limit` bounds retained size after commit/checkpoint, not peak
  transaction growth. Statement/input/concurrency limits plus post-write
  checkpoint/accounting are still needed.
- Global 512 MiB accounting is a policy gate unless allocation is reserved
  atomically. The design should name that limitation rather than claim a hard
  filesystem quota.

### 3.6 Stable error contract

Add `PLUGIN_STORAGE_ERROR_CODES` and a `PluginStorageErrorCode` union beside the
event response types in `packages/utils/transport/events/types/plugin.ts`.
Responses and thrown transport errors should carry `code`, while public messages
remain generic and never include SQL, params, secret values, canonical paths, or
native error text.

Minimum code set:

```text
PLUGIN_STORAGE_CALLER_UNVERIFIED
PLUGIN_STORAGE_PERMISSION_UNAVAILABLE
PLUGIN_STORAGE_PERMISSION_DENIED
PLUGIN_STORAGE_SDKAPI_MISMATCH
PLUGIN_STORAGE_PLUGIN_UNAVAILABLE
PLUGIN_SQLITE_PATH_OUTSIDE_ROOT
PLUGIN_SQLITE_SYMLINK_DENIED
PLUGIN_SQLITE_SQL_INVALID
PLUGIN_SQLITE_SQL_TOO_LARGE
PLUGIN_SQLITE_STATEMENT_DENIED
PLUGIN_SQLITE_STATEMENT_LIMIT
PLUGIN_SQLITE_PARAMS_TOO_LARGE
PLUGIN_SQLITE_ROW_LIMIT
PLUGIN_SQLITE_RESULT_TOO_LARGE
PLUGIN_SQLITE_CONCURRENCY_LIMIT
PLUGIN_SQLITE_TIMEOUT
PLUGIN_SQLITE_DISK_QUOTA
PLUGIN_SQLITE_UNAVAILABLE
PLUGIN_SECRET_KEY_INVALID
PLUGIN_SECRET_UNAVAILABLE
```

The SQLite SDK should throw a typed `PluginStorageError` preserving `code`.
Secret set/delete responses should add `code?`. Secret get compatibility can be
preserved by using thrown errors for guard/backend failures while retaining
`null` only for a legitimately missing key. Avoid changing `get()` to an
envelope unless an SDK-versioned migration is accepted.

## 4. Revocation And Lifecycle Teardown

### Permission revoke consumer

`PluginModule` should subscribe to `TalexEvents.PERMISSION_REVOKED` alongside
the current grant listener and remove both listeners during onDestroy.

Synchronous event handling should immediately mark matching resource records as
revoked before attempting asynchronous cleanup:

- `event.all || permissionIds.includes('storage.sqlite')`: invalidate queued/new
  operations, interrupt if the chosen runtime safely supports it, close client,
  and conditionally delete the matching instance/generation record. Retain DB.
- `event.all || permissionIds.includes('storage.plugin')`: invalidate queued
  Secret operations. There is no Secret client to close. Every subsequent call
  must run the fail-closed permission guard again. Retain values on revoke.

An operation already linearized before committed revocation may finish; new and
queued work must fail. Hard cancellation of an already running synchronous
libSQL write requires the killable executor described above.

### Disable, unload, reload, crash, uninstall

Use one idempotent storage teardown callback owned by PluginModule/resource
runtime and invoke it from every manager path before plugin removal:

| Lifecycle | SQLite client | SQLite file | Secret values |
|---|---|---|---|
| permission revoke | close/invalidate | retain | retain |
| disable | close/invalidate | retain | retain |
| reload/unload/update | close old generation | retain | retain |
| crash/auto-disable | close/invalidate | retain | retain |
| uninstall | close first | delete canonical owner data root | purge `plugin.<name>.` prefix |
| app/module destroy | close all + dispose listeners | retain | retain |

The manager currently lives in nested functions, so inject an
`onPluginStopping(plugin, reason)` callback when building it rather than letting
manager code reach into a private map. `unloadPlugin()` must await plugin disable
and storage teardown; its current fire-and-forget disable at
`plugin-module.ts:1075-1083` is too weak for deletion ordering.

Add an atomic `deleteSecureStoreValuesByPrefix()` operation in secure-store for
uninstall. It must share the same mutation lock and atomic temp-write/rename path
as set/delete so purging one plugin cannot lose host or other-plugin values.
Prefix deletion is only for host-derived canonical plugin names; never accept a
raw payload prefix.

Crash recovery on next startup/open should reject symlinks/out-of-root files,
validate quota, clean stale `-wal`/`-shm` through SQLite recovery/checkpoint (not
blind deletion), and create a fresh runtime record. Do not delete a retained DB
merely because the prior process crashed.

## 5. TDD File And Case Matrix

| File | RED cases |
|---|---|
| `apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.test.ts` (new focused handler test) | missing/unbranded/copied context denied; payload-only/cross-plugin name denied; permission runtime null denied; permission denied stable code; valid #300 test identity reaches callback; Secret health guarded; local-host identity works |
| `apps/core-app/src/main/modules/plugin/runtime/plugin-sql-policy.test.ts` (new) | empty/oversize/unterminated SQL; comments and quoted semicolons; second statement; ATTACH/DETACH; mixed-case/comment-obfuscated tokens; PRAGMA; VACUUM INTO; load_extension; transaction control; trigger/view/virtual table; query-vs-mutation lane mismatch; RETURNING; allowed CRUD/DDL fixtures |
| `apps/core-app/src/main/modules/plugin/runtime/plugin-sqlite-path.test.ts` (new) | traversal/absolute plugin identity rejected; canonical current root accepted; owner-root symlink escape; DB symlink escape; stale-generation replacement cleanup cannot delete current record; Windows path/case fixture |
| `apps/core-app/src/main/modules/plugin/runtime/plugin-sqlite-runtime.test.ts` (new, real temp DB) | confirmed ATTACH/VACUUM/PRAGMA denial; raw client never sees denied SQL; query 1000/1001 rows; 4 MiB boundary; SQL/param/statement bounds; per-plugin serialization; queue/global overflow; transaction rollback; max_page_count/SQLITE_FULL; WAL accounting; mapped errors contain no SQL/path |
| `apps/core-app/src/main/modules/plugin/runtime/plugin-sqlite-executor.test.ts` (required if hard timeout implemented) | recursive SELECT interrupted; long mutation terminated; timed-out executor/client is poisoned and replaced; no stale completion reply; timeout does not interrupt another generation/plugin; worker exit/restart cleanup |
| `apps/core-app/src/main/modules/plugin/plugin-module.test.ts` | subscribes/unsubscribes PERMISSION_REVOKED; revoke storage.sqlite closes only target; revoke storage.plugin invalidates Secret lane; revokeAll; disable/reload/unload/directory removal closes old generation; uninstall closes before remove and purges secret prefix; onDestroy closes all once |
| `apps/core-app/src/main/utils/secure-store.test.ts` | concurrent writes do not lose entries; atomic replacement survives injected write failure; prefix purge removes only target plugin; no plaintext/log leakage |
| `packages/utils/__tests__/plugin-sqlite-sdk.test.ts` | preserves stable error code for execute/query/transaction; limits do not alter success shape; payload pluginName remains compatibility-only |
| `packages/utils/__tests__/plugin-storage-sdk.test.ts` | Secret permission/backend errors reject with code; missing secret remains null; set/delete preserve code; health denial is surfaced |
| `apps/core-app/src/main/modules/permission/channel-guard.test.ts` / #300 identity tests | `verified:true`, copied identity, stale activation, and payload key fail; current branded identity passes; permission unavailable fails closed |
| `plugins/touch-translation/ProviderConfigModal.test.ts` and `translation-provider-secret.test.ts` | denied/unavailable Secret health and writes remain user-visible and no secret is copied back to plain config |

Real integration tests must use isolated temporary directories and the installed
native binding on supported CI platforms. They should assert effects (outside DB
not created/read, client closed before directory removal), not merely classifier
return values.

## 6. Compatibility And Rollout Risks

1. **SQL compatibility:** denying CTEs, PRAGMAs, triggers, views, virtual tables,
   RETURNING, and explicit transaction control can break unknown third-party
   plugins. No official plugin currently declares SQLite, so a conservative hard
   cut is preferable. Publish the allowed subset and version it before expansion.
2. **SDK version boundary:** SQLite exists from sdkapi 260215, while capability
   auth baseline is 260228 (`packages/utils/plugin/sdk-version.ts:11-14,31-41,
   107-110`). Decide explicitly whether 260215-260225 plugins are denied or
   migrated; do not silently bypass permission enforcement for them.
3. **Secret consumer behavior:** `touch-translation` currently treats failed
   set/delete as booleans and health failures as unavailable. Throwing typed
   errors from get/health needs its tests and UI paths updated without exposing
   secret material.
4. **Uninstall retention:** purging Secret values is a behavior change but is the
   least surprising privacy policy. Reinstall will not recover old credentials;
   document this in release notes. Disable/reload/revoke should retain values.
5. **Database retention:** close-on-disable/revoke changes connection warmness,
   not data. Reopen must be lazy and generation-bound.
6. **Native runtime/package:** adding direct `libsql` or a worker entry changes
   Electron native packaging on macOS/Windows/Linux. Validate ASAR/native module
   loading and worker path resolution. Do not rely on a transitive dependency.
7. **Timeout semantics:** current stable APIs cannot hard-stop synchronous writes.
   A response timeout without execution cancellation creates false security and
   stale writes. Keep the acceptance item open unless a killable/native timeout
   path passes recursive read and write tests on all target platforms.
8. **Disk quota migration:** existing DBs over the initial quota must fail with a
   stable code and offer host-side export/delete UX later; silently truncating or
   deleting is unsafe.
9. **Error compatibility:** adding `code?` is additive, but changing raw messages
   may affect plugins that string-match errors. Preserve broad message prefixes
   in the SDK while making code authoritative.
10. **Identity dependency:** #299's privileged hard cut must land after #300
    supplies authoritative identity on renderer, local invoke, MessagePort, and
    plugin-host lanes. Temporary use of `verified` would reintroduce #300.
11. **Isolation limit:** while Prelude still has direct host filesystem access
    (#297), transport SQLite containment does not sandbox malicious main-process
    code. #299 still removes the transport vulnerability and protects renderer/
    compromised-call paths, but must not claim full plugin filesystem isolation.

## Recommended Implementation Gate Order

1. Complete #300 verifier consumption and RED permission/caller tests.
2. Add stable errors, tokenizer/classifier, canonical path resolver, and resource
   owner with per-plugin serialization.
3. Add revoke/disable/unload/crash/uninstall teardown and atomic Secret mutation/
   prefix purge.
4. Add SQL/params/statement/open-client/disk admission bounds and result bounds.
5. Implement and cross-platform verify a killable/native timeout executor; until
   then keep hard timeout acceptance open or keep SQLite unavailable to
   untrusted plugins.
6. Run full focused Vitest, CoreApp node typecheck, scoped lint, packaging smoke,
   and `git diff --check`; verify logs/replies contain no SQL, params, paths,
   handles, keys, or returned data.
