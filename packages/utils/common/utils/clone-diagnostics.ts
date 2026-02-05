export interface CloneIssue {
  path: string
  reason: string
  type: string
}

const DEFAULT_MAX_DEPTH = 4
const MAX_INSPECT_ITEMS = 50

function getValueType(value: unknown): string {
  return Object.prototype.toString.call(value)
}

export function isCloneError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('could not be cloned')
    || message.includes('DataCloneError')
    || message.includes('Cannot clone')
}

export function summarizeClonePayload(payload: unknown): Record<string, unknown> {
  const summary: Record<string, unknown> = { valueType: typeof payload }
  if (payload === null) {
    summary.value = null
    return summary
  }
  if (typeof payload !== 'object') {
    summary.value = payload
    return summary
  }
  summary.objectType = getValueType(payload)
  if (Array.isArray(payload)) {
    summary.length = payload.length
    return summary
  }
  try {
    const keys = Object.keys(payload as Record<string, unknown>)
    summary.keys = keys.slice(0, 20)
    summary.keysCount = keys.length
  } catch (error) {
    summary.keysError = error instanceof Error ? error.message : String(error)
  }
  return summary
}

export function findCloneIssue(
  payload: unknown,
  options?: { maxDepth?: number }
): CloneIssue | null {
  if (typeof structuredClone !== 'function') return null

  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH
  const seen = new WeakSet<object>()

  const inspect = (value: unknown, path: string, depth: number): CloneIssue | null => {
    try {
      structuredClone(value)
      return null
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (depth >= maxDepth) {
        return { path, reason: 'max_depth', type: getValueType(value) }
      }
      if (value && typeof value === 'object') {
        if (seen.has(value)) {
          return { path, reason: 'circular_ref', type: getValueType(value) }
        }
        seen.add(value)
        if (Array.isArray(value)) {
          const limit = Math.min(value.length, MAX_INSPECT_ITEMS)
          for (let i = 0; i < limit; i += 1) {
            const result = inspect(value[i], `${path}[${i}]`, depth + 1)
            if (result) return result
          }
          if (value.length > limit) {
            return { path, reason: 'array_truncated', type: getValueType(value) }
          }
        } else {
          let entries: [string, unknown][]
          try {
            entries = Object.entries(value as Record<string, unknown>)
          } catch (entryError) {
            const entryReason = entryError instanceof Error ? entryError.message : String(entryError)
            return { path, reason: entryReason, type: getValueType(value) }
          }
          const limit = Math.min(entries.length, MAX_INSPECT_ITEMS)
          for (let i = 0; i < limit; i += 1) {
            const entry = entries[i]
            if (!entry)
              continue
            const [key, entryValue] = entry
            const result = inspect(entryValue, `${path}.${key}`, depth + 1)
            if (result) return result
          }
          if (entries.length > limit) {
            return { path, reason: 'keys_truncated', type: getValueType(value) }
          }
        }
      }
      return { path, reason, type: getValueType(value) }
    }
  }

  return inspect(payload, 'payload', 0)
}
