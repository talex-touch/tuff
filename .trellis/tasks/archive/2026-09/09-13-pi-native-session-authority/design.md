# Design: Pi native session authority for Home

## Schema and Store

Migration 0047 adds nullable `conversation_id` to `local_ai_cli_sessions` plus a unique SQLite index over non-null values. It intentionally has no foreign key: Pi emits and binds the native id before the first settled Home turn creates its conversation row. Local and sync conversation deletion explicitly delete the pointer in the same scheduled transaction. Drizzle mirrors the column/index, and sidebar list queries exclude conversation-bound pointers to prevent duplicate conversation/session rows.

The session store adds lookup and binding by conversation id. Tuple identity remains authoritative; one conversation cannot bind two pointers. Binding writes through `scheduleDbWrite` and never mutates provider transcript files.

## Typed Home Boundary

`IntelligenceHomeSurfaceMetadata` adds `conversationId` and `projectId`. `useHomeConversation` receives a live context getter from HomePage so the id allocated immediately before send reaches that turn. Main accepts native continuation only when the surface is Home and no plugin caller is present.

## Invocation State Machine

1. Resolve canonical cwd from Project or the stable Local AI workspace.
2. Lookup conversation pointer.
3. Existing pointer: verify provider/project/root/state, acquire the Home-conversation guard and shared native tuple lease, locate the exact native JSONL, and compare its current head to `expected_head_id` before using `--session <nativeId>` with only the newest user turn.
4. No pointer: acquire the Home-conversation guard, generate a UUID, use `--session-id <nativeId>`, then acquire the native tuple lease before binding the pointer. Send either the first turn or a one-time legacy transcript seed.
5. Observe the Pi version-3 `session` record before output. Validate exact id and persist/touch the pointer before subsequent chunks cross the provider boundary.
6. After success, require the appended JSONL entries to form one linear parent chain containing exactly one user message and at least one assistant message; update `expected_head_id`. Pre-existing head drift or a same-parent sibling marks the pointer conflict.
7. Release both guards on normal EOF, cancellation, spawn failure, parser failure, or consumer early return.

`runCliChat` gains optional `cwd` and ordered per-line observation; existing subprocess termination remains the single lifecycle owner.

## Compatibility

Home messages remain the UI/sync record. The native transcript is authoritative for model context only. A device that first receives a synced conversation has no local pointer, so its first local Pi turn performs one explicit seed into a new device-local native session. This is the only replay path.
