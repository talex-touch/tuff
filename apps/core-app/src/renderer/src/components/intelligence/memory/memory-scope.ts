import type { MemoryItem } from '@talex-touch/tuff-intelligence'

export type MemoryType = MemoryItem['type']
export type MemoryScope = MemoryItem['scope']

/**
 * What a memory's scope alone decides about it ever reaching a reply.
 *
 * - `effective`: `global`; any conversation may receive it.
 * - `source-session-only`: `session` with a source session; only that session may receive it.
 * - `inactive`: never received. A `session` memory without a source session has no session to
 *   match, and `workspace` / `project` stay fail-closed in main until those scopes carry a stable
 *   `scopeRef`.
 */
export type MemoryScopeEffect = 'effective' | 'source-session-only' | 'inactive'

/**
 * Mirrors main's injection rule, which the renderer cannot import.
 *
 * Source of truth: `listUsableMemories` in
 * `apps/core-app/src/main/modules/ai/intelligence-context-hygiene.ts:1143-1166`
 * (`scope = 'global' OR (scope = 'session' AND source_session_id = ?)`), rechecked per item by
 * `getMemoryContextExclusionReason` in the same file. When main changes which scopes it injects,
 * change this function and `memory-scope.test.ts` with it.
 *
 * Scope only: enabled state, TTL and privacy level gate injection too, and each caller reports
 * those on its own. An unknown scope is treated as `inactive`, the way main treats it.
 */
export function memoryScopeEffect(
  memory: Pick<MemoryItem, 'scope' | 'sourceSessionId'>
): MemoryScopeEffect {
  if (memory.scope === 'global') return 'effective'
  if (memory.scope === 'session') {
    return memory.sourceSessionId ? 'source-session-only' : 'inactive'
  }
  return 'inactive'
}

export const MEMORY_TYPES: readonly MemoryType[] = [
  'preference',
  'project',
  'task',
  'knowledge',
  'temporary'
]

/** `global` first: it is the default, and the only scope a hand-made memory is ever used in. */
export const MEMORY_SCOPES: readonly MemoryScope[] = ['global', 'session', 'project', 'workspace']

/**
 * A memory created by hand carries no source session, so `global` is the one scope main will
 * inject it under. The old default, `session`, produced memories no reply could ever use.
 */
export const DEFAULT_MEMORY_SCOPE: MemoryScope = 'global'

/** `temporary` means nothing without a TTL, and the editor sets none. */
export const DEFAULT_MEMORY_TYPE: MemoryType = 'preference'
