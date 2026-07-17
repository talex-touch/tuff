# Design: Nexus sync batch ingest consistency

## Current Failure

`pushSyncItemsV1()` performs two reads and two writes per item, then updates quota in the API route. D1 commits each standalone statement. A large request can exhaust the invocation query limit after earlier items have committed, and a failure between oplog insert, item upsert, and quota update leaves contradictory state.

## Decision

### 1. Validate, normalize, then bulk preload

Validate every item before writes. Deduplicate item ids and operation sequences, serialize those scalar keys into bounded JSON chunks, and preload existing `sync_items_v1` and `sync_oplog_v1` rows with `json_each(?)` queries issued as one read batch. Build lookup maps in memory.

### 2. Preserve conflict ordering

Use the existing `isNewerUpdate()` predicate unchanged for normal conflict reporting. The SQL write guard repeats the same predicate so a concurrent update between preload and commit cannot create an oplog row for an item that no longer wins.

### 3. Serialize bounded write chunks

Normalize accepted candidates into JSON rows and cap each bound JSON parameter at 512 KiB. Each chunk generates two fixed-size prepared statements:

1. Conditional bulk `INSERT OR IGNORE` into `sync_oplog_v1`.
2. Bulk upsert into `sync_items_v1`, restricted to rows whose exact oplog identity exists.

The SQL text and bound parameter count remain constant regardless of item count. A request-level query budget guard rejects payloads whose planned statements would approach D1's paid-plan 1,000-query invocation limit.

### 4. One atomic D1 batch

All write-chunk statements, an authoritative quota recomputation/limit guard, and the sync-session cursor update execute in one `db.batch()` call. D1 documents `batch()` as a SQL transaction: one failed statement rolls back the sequence.

Quota is recomputed from non-deleted materialized rows inside that transaction. Assigning `NULL` to NOT NULL quota columns on a limit breach aborts and rolls back the batch; the preflight quota check supplies normal quota errors for expected cases.

### 5. Route ownership

`pushSyncItemsV1()` owns item/oplog/quota/session atomicity. The push route must stop applying a second post-commit quota delta. `applyQuotaDelta()` remains for blob upload, which is outside this task.

## Compatibility

- Idempotency key remains `(user_id, device_id, op_seq)`.
- Conflict response remains `{ item_id, server_updated_at, server_device_id }`.
- Timestamp/device tie-breaking is unchanged.
- Tombstones retain the prior stored payload-size behavior.
- Pull/handshake schemas and public response types do not change.

## Rollback

Revert the source and route changes. No schema migration is required. Because the new implementation writes existing tables with existing columns, rollback does not require data conversion.

## External Evidence Boundary

Local Miniflare exercises the D1 API and transactional rollback without touching shared data. The configured `tuff-nexus-dev` remote database is shared external state; isolated preview writes require explicit confirmation before execution.
