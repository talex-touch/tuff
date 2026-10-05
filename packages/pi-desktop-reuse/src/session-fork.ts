// SPDX-License-Identifier: LGPL-3.0-only
// Attribution: PI-Desktop contributors; original notices retained where provided.
// Derived from vastsa/PI-Desktop @ 3b036cc7810e18b3ef7689a2b93385125a8d0a3f
// crates/host-core/src/sessions.rs: collect_tool_call_ids, clone_records_for_fork,
// clone_compaction_for_fork. Tuff adaptation uses meta.parts and local-only authority,
// remaps known identity references, and deliberately never rewrites ordinary message text.

export interface ForkMessageRecord {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'complete' | 'streaming' | 'failed'
  meta?: Record<string, unknown>
}

export interface ForkClone<T extends ForkMessageRecord> {
  messages: T[]
  messageIds: Map<string, string>
  toolCallIds: Map<string, string>
  turnIds: Map<string, string>
}

interface ForkPartReferences {
  type?: unknown
  id?: unknown
  callId?: unknown
  toolCallId?: unknown
}

const PUBLIC_META_KEYS = [
  'provider', 'model', 'promptTokens', 'completionTokens', 'totalTokens', 'latencyMs',
  'compactions', 'reasoningRequested', 'reasoningApplied', 'reasoningStatus', 'usageSource',
  'turnId', 'traceId', 'outcome', 'errorCode', 'leadNote', 'parts',
  'compactionId', 'checkpointId', 'snapshotId', 'modelSystem'
] as const

const IDENTITY_KEYS: Record<string, true> = {
  messageId: true, beforeMessageId: true, afterMessageId: true,
  firstKeptMessageId: true, throughMessageId: true,
  callId: true, toolCallId: true, parentToolCallId: true,
  turnId: true, compactionId: true, checkpointId: true, snapshotId: true
}


/** Public content only; native pointers, queue, paths and approval/revert authority are local. */
export function portableMessageMeta(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined
  const meta: Record<string, unknown> = {}
  for (const key of PUBLIC_META_KEYS) if (value[key] !== undefined) meta[key] = value[key]
  return Object.keys(meta).length ? meta : undefined
}

export function cloneMessagesForFork<T extends ForkMessageRecord>(
  records: readonly T[], mintId: () => string
): ForkClone<T> {
  const messageIds = new Map<string, string>()
  const toolCallIds = new Map<string, string>()
  const turnIds = new Map<string, string>()
  const otherIds = new Map<string, string>()
  for (const record of records) {
    messageIds.set(record.id, mintId())
    const turn = record.meta?.turnId
    if (typeof turn === 'string' && !turnIds.has(turn)) turnIds.set(turn, mintId())
    for (const key of ['compactionId', 'checkpointId', 'snapshotId']) {
      const id = record.meta?.[key]
      if (typeof id === 'string' && !otherIds.has(id)) otherIds.set(id, mintId())
    }
    for (const part of Array.isArray(record.meta?.parts) ? record.meta.parts : []) {
      if (part === null || typeof part !== 'object' || Array.isArray(part)) continue
      // Main passed parsed JSON; the structural fields remain unknown until each check below.
      const fields = part as ForkPartReferences
      for (const key of (fields.type === 'tool-call' ? ['id', 'callId', 'toolCallId'] : ['callId', 'toolCallId']) as Array<keyof ForkPartReferences>) {
        const id = fields[key]
        if (typeof id === 'string' && !toolCallIds.has(id)) toolCallIds.set(id, mintId())
      }
    }
  }
  const identity = new Map([...messageIds, ...toolCallIds, ...turnIds, ...otherIds])
  const remap = (value: unknown, depth = 0): unknown => {
    if (depth > 16) throw new Error('WORKSPACE_FORK_ANCHOR_INVALID')
    if (Array.isArray(value)) return value.map((item) => remap(item, depth + 1))
    if (value === null || typeof value !== 'object') return value
    // A JSON object, not a domain assertion: every value below still has type unknown.
    const fields = value as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(fields)) {
      if (key === 'reversible' || key === 'rollbackAllowed') { next[key] = false; continue }
      if (key === 'snapshotRef' || key === 'rollbackToken' || key === 'requestId' || key === 'runId' || key === 'nativeEntryId') continue
      if ((IDENTITY_KEYS[key] || (key === 'id' && fields.type === 'tool-call')) && typeof item === 'string') {
        const mapped = identity.get(item)
        if (mapped) next[key] = mapped
      } else next[key] = remap(item, depth + 1)
    }
    return next
  }
  const messages = records.map((record) => ({
    ...record,
    id: messageIds.get(record.id)!,
    meta: remap(portableMessageMeta(record.meta)) as Record<string, unknown> | undefined
  }))
  return { messages, messageIds, toolCallIds, turnIds }
}
