# Fix Nexus sync batch ingest consistency

## Goal

Make Nexus sync push safe and bounded for payloads larger than 1,000 items without changing the established `updated_at + device_id` last-writer-wins ordering.

## Requirements

- Validate the complete request before issuing any sync writes.
- Replace per-item oplog and item reads with bounded bulk preloads.
- Keep conflict ordering exactly equivalent: newer `updated_at` wins; equal timestamps use lexicographically greater `device_id`; an existing null device id yields to the candidate.
- Preserve idempotency by `(user_id, device_id, op_seq)` and first accepted operation for duplicate sequences.
- Write oplog rows, materialized items, authoritative quota usage, and push-session cursor in one D1 `batch()` transaction.
- Bound serialized statement parameters and total D1 query count before starting the write transaction.
- Do not leave an oplog row without its materialized item update, or item rows without matching quota accounting, when any write statement fails.
- Keep delete/tombstone payload-size behavior and response conflict shape compatible.
- Do not operate on the production D1 database. Remote verification, if approved, must use isolated records in the preview database and remove them afterward.

## Acceptance Criteria

- [x] A push containing more than 1,000 small items completes below the D1 paid-plan 1,000-query invocation limit.
- [x] Existing idempotency, conflict, update, delete/tombstone, handshake, and pull behavior remains green.
- [x] Duplicate `op_seq` values do not apply more than one operation.
- [x] A forced failure in any write statement rolls back oplog, item, quota, and session updates together.
- [x] Quota storage/object counters equal the live materialized rows after a successful push.
- [x] Focused Nexus tests, scoped ESLint, and Nexus type-check pass.
- [x] Local D1/Miniflare smoke covers >1,000 items and rollback behavior.
- [x] Preview D1 verification completed after explicit approval; isolated tables were removed and production D1 was never accessed.

## Out of Scope

- Telemetry batch ingestion.
- Changing sync encryption or payload schemas.
- Changing the public conflict precedence.
- Production database writes.
