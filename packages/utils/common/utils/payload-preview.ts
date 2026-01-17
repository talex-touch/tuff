export interface PayloadPreviewOptions {
  maxOutputChars?: number
  maxStringChars?: number
  maxDepth?: number
  maxKeys?: number
  maxArrayLength?: number
}

const DEFAULT_OPTIONS: Required<PayloadPreviewOptions> = {
  maxOutputChars: 800,
  maxStringChars: 200,
  maxDepth: 4,
  maxKeys: 30,
  maxArrayLength: 20
}

function truncate(value: string, maxChars: number): string {
  if (maxChars <= 0) return ''
  return value.length > maxChars ? `${value.slice(0, maxChars)}…` : value
}

function redactDataUrl(value: string, maxPrefixChars: number): string {
  if (!value.startsWith('data:')) return value
  const base64Index = value.indexOf(';base64,')
  if (base64Index === -1) return value

  const prefixEnd = base64Index + ';base64,'.length
  const prefix = value.slice(0, prefixEnd)
  const omittedChars = Math.max(0, value.length - prefixEnd)
  const safePrefix = truncate(prefix, Math.max(10, maxPrefixChars))
  return `${safePrefix}[base64 omitted ${omittedChars} chars]`
}

function isTypedArray(value: unknown): value is ArrayBufferView {
  return (
    typeof ArrayBuffer !== 'undefined'
    && typeof ArrayBuffer.isView === 'function'
    && ArrayBuffer.isView(value)
  )
}

function bufferLength(value: unknown): number | null {
  try {
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      return value.length
    }
  }
  catch {
    // ignore
  }
  return null
}

export function formatPayloadPreview(payload: unknown, options?: PayloadPreviewOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...(options ?? {}) }

  if (payload === null || payload === undefined) return String(payload)
  if (typeof payload === 'string') {
    const redacted = redactDataUrl(payload, opts.maxStringChars)
    return truncate(redacted, opts.maxOutputChars)
  }

  const seen = typeof WeakSet !== 'undefined' ? new WeakSet<object>() : null

  const simplify = (value: unknown, depth: number): unknown => {
    if (value === null || value === undefined) return value
    if (depth >= opts.maxDepth) return '[max-depth]'

    const valueType = typeof value
    if (valueType === 'string') {
      const redacted = redactDataUrl(value as string, opts.maxStringChars)
      return truncate(redacted, opts.maxStringChars)
    }
    if (valueType === 'number' || valueType === 'boolean') return value
    if (valueType === 'bigint') return `${value.toString()}n`
    if (valueType === 'symbol') return String(value)
    if (valueType === 'function') return '[function]'

    if (value instanceof Error) {
      return {
        name: value.name,
        message: truncate(value.message ?? '', opts.maxStringChars),
        stack: typeof value.stack === 'string' ? truncate(value.stack, opts.maxOutputChars) : undefined
      }
    }

    const bufLen = bufferLength(value)
    if (typeof bufLen === 'number') return `[buffer ${bufLen} bytes]`
    if (isTypedArray(value)) return `[typed-array ${value.byteLength} bytes]`
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      return `[array-buffer ${value.byteLength} bytes]`
    }

    if (Array.isArray(value)) {
      const items = value.slice(0, opts.maxArrayLength).map((item) => simplify(item, depth + 1))
      if (value.length > opts.maxArrayLength) {
        items.push(`[+${value.length - opts.maxArrayLength} more]`)
      }
      return items
    }

    if (valueType === 'object') {
      const obj = value as Record<string, unknown>
      if (seen) {
        if (seen.has(obj)) return '[circular]'
        seen.add(obj)
      }

      if (obj instanceof Map) {
        return {
          _type: 'Map',
          size: obj.size,
          entries: Array.from(obj.entries())
            .slice(0, opts.maxArrayLength)
            .map(([k, v]) => [simplify(k, depth + 1), simplify(v, depth + 1)])
        }
      }

      if (obj instanceof Set) {
        return {
          _type: 'Set',
          size: obj.size,
          values: Array.from(obj.values())
            .slice(0, opts.maxArrayLength)
            .map((v) => simplify(v, depth + 1))
        }
      }

      const keys = Object.keys(obj)
      const out: Record<string, unknown> = {}
      for (const key of keys.slice(0, opts.maxKeys)) {
        try {
          out[key] = simplify(obj[key], depth + 1)
        }
        catch {
          out[key] = '[throws]'
        }
      }
      if (keys.length > opts.maxKeys) {
        out._moreKeys = keys.length - opts.maxKeys
      }
      return out
    }

    try {
      return truncate(String(value), opts.maxStringChars)
    }
    catch {
      return '[unserializable]'
    }
  }

  try {
    const text = JSON.stringify(simplify(payload, 0))
    return truncate(text, opts.maxOutputChars)
  }
  catch {
    return '[unserializable]'
  }
}

