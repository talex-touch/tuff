# Archived Context Continuation Technical Design

## Boundary

```text
CoreBox continue intent
  -> IntelligenceContextExecutionService (owner/actor validation)
  -> ContextHygieneService.resolveSession()
       active + fresh -> reuse requested session
       archived/expired/idle -> create fresh session + session_start checkpoint
       missing -> create fresh session + unavailable continuation metadata
  -> resolve safe continuation summary
       validated latest CompressionSnapshot
       or secret-free legacy session summary
       or excluded/unavailable metadata
  -> build new ContextPackage
       current input + at most one continuation summary
       no old raw turns / old MemoryItem
  -> shared invoke/stream assembler
  -> metadata-only IntelligenceContextExecutionSummary
  -> touch-intelligence widget boundary reason
```

## Typed Contracts

Add a canonical metadata-only continuation contract in `packages/utils/types/intelligence.ts` and mirror it through `packages/tuff-intelligence` re-exports:

```ts
type ContextContinuationReason =
  | 'archived-session-continuation'
  | 'expired-session-continuation'
  | 'idle-session-continuation'
  | 'continuation-session-missing'

type ContextContinuationStatus = 'included' | 'excluded' | 'unavailable'

interface ContextContinuationSummary {
  sourceSessionId?: string
  reason: ContextContinuationReason
  status: ContextContinuationStatus
  summarySourceType?: 'compression_snapshot' | 'session_summary'
  summarySourceId?: string
  degradedReason?: string
}
```

`PrepareContextTurnResult.continuation` and `IntelligenceContextExecutionSummary.continuation` expose this object. It never contains summary text, turns, memories, paths, or provider payloads.

## Session Resolution

- Validate requested session owner and `contextActorId` before any continuation.
- Reuse only `status='active'` sessions inside the idle window.
- For archived/expired/idle sessions, call `createSession()` without the requested id. Persist `continuedFromSessionId` and continuation reason in new-session/checkpoint metadata.
- A missing requested session also receives a generated id and `continuation-session-missing`; it executes current input without inherited context.
- Do not mutate the source session.

## Summary Resolution

1. Read the latest CompressionSnapshot for the source session.
2. Apply existing snapshot policy/revalidation. If safe, render and include it with source snapshot/session metadata.
3. If no snapshot exists, accept only a non-empty legacy session summary that does not match secret policy.
4. If a candidate exists but is blocked, return `excluded`; if no candidate exists/read fails, return `unavailable`.
5. Package assembly adds at most one continuation `summary` item. Recent turns and memories are queried only for the new session, so source raw history cannot leak.

## UI Projection

`touch-intelligence` sanitizes `context.continuation` into the widget payload and never forwards raw package items. The widget maps machine reasons to concise Chinese boundary explanations while preserving the existing new/continue/stateless controls.

## Compatibility And Rollback

- Active-session continuation behavior is unchanged.
- No database migration or schema change.
- Existing callers that ignore optional `continuation` remain compatible.
- Rollback is code-only: remove the optional projection and revert inactive-session carryover; persisted source sessions remain untouched.

## Evidence Boundary

Focused tests prove session-id safety, policy filtering, package content, typed projection, and widget payload. They do not prove real-profile history migration or packaged Electron behavior; those levels remain open unless separately collected.
