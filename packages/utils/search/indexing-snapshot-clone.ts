export function cloneIndexingSnapshotValue<TValue>(value: TValue): TValue {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      // Fall through to the recursive fallback for non-structured-cloneable adapter payloads.
    }
  }

  return cloneIndexingSnapshotFallback(value, new WeakMap()) as TValue
}

function cloneIndexingSnapshotFallback(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (!value || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return seen.get(value)
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = []
    seen.set(value, clone)
    for (const item of value) {
      clone.push(cloneIndexingSnapshotFallback(item, seen))
    }
    return clone
  }

  if (value instanceof Date) {
    return new Date(value.getTime())
  }

  if (value instanceof RegExp) {
    const clone = new RegExp(value.source, value.flags)
    clone.lastIndex = value.lastIndex
    return clone
  }

  if (value instanceof URL) {
    return new URL(value.href)
  }

  if (value instanceof Error) {
    return cloneIndexingSnapshotError(value, seen)
  }

  if (value instanceof ArrayBuffer) {
    const clone = value.slice(0)
    seen.set(value, clone)
    return clone
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    const buffer = cloneIndexingSnapshotFallback(view.buffer, seen) as ArrayBuffer
    if (value instanceof DataView) {
      return new DataView(buffer, view.byteOffset, view.byteLength)
    }

    const typedArray = value as ArrayBufferView & { length: number }
    const TypedArrayConstructor = value.constructor as new (
      buffer: ArrayBuffer,
      byteOffset: number,
      length?: number
    ) => unknown

    return new TypedArrayConstructor(buffer, view.byteOffset, typedArray.length)
  }

  if (value instanceof Map) {
    const clone = new Map<unknown, unknown>()
    seen.set(value, clone)
    for (const [key, item] of value.entries()) {
      clone.set(
        cloneIndexingSnapshotFallback(key, seen),
        cloneIndexingSnapshotFallback(item, seen)
      )
    }
    return clone
  }

  if (value instanceof Set) {
    const clone = new Set<unknown>()
    seen.set(value, clone)
    for (const item of value.values()) {
      clone.add(cloneIndexingSnapshotFallback(item, seen))
    }
    return clone
  }

  const prototype = Object.getPrototypeOf(value)
  const clone = prototype === null ? Object.create(null) : {}
  seen.set(value, clone)

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    ;(clone as Record<string, unknown>)[key] = cloneIndexingSnapshotFallback(item, seen)
  }

  return clone
}

function cloneIndexingSnapshotError(error: Error, seen: WeakMap<object, unknown>): Error {
  const clone = createIndexingSnapshotErrorClone(error)
  seen.set(error, clone)
  clone.name = error.name
  if (typeof error.stack === 'string') {
    clone.stack = error.stack
  }
  if ('cause' in error) {
    ;(clone as Error & { cause?: unknown }).cause = cloneIndexingSnapshotFallback(error.cause, seen)
  }
  if (error instanceof AggregateError) {
    ;(clone as AggregateError & { errors: unknown[] }).errors = error.errors.map((item) =>
      cloneIndexingSnapshotFallback(item, seen)
    )
  }

  for (const [key, item] of Object.entries(error as unknown as Record<string, unknown>)) {
    ;(clone as unknown as Record<string, unknown>)[key] = cloneIndexingSnapshotFallback(item, seen)
  }

  return clone
}

function createIndexingSnapshotErrorClone(error: Error): Error {
  if (error instanceof AggregateError) return new AggregateError([], error.message)
  if (error instanceof EvalError) return new EvalError(error.message)
  if (error instanceof RangeError) return new RangeError(error.message)
  if (error instanceof ReferenceError) return new ReferenceError(error.message)
  if (error instanceof SyntaxError) return new SyntaxError(error.message)
  if (error instanceof TypeError) return new TypeError(error.message)
  if (error instanceof URIError) return new URIError(error.message)
  return new Error(error.message)
}
