export type PropCoerceKind
  = | 'string'
    | 'boolean'
    | 'number'
    | 'string-or-number'
    | 'boolean-or-string'
    | 'boolean-or-json'
    | 'json'
    | 'string-or-json'
    | 'any'
    | ((raw: unknown) => unknown)

export type PropSchema = Record<string, PropCoerceKind>

const NUMERIC_STRING_RE = /^-?\d+(?:\.\d+)?$/

/**
 * Coerce HTML attribute / JS property values into strict boolean.
 * - `""`, `"true"`, `"1"`, or matching attr name -> `true`
 * - `"false"`, `"0"` -> `false`
 * - `undefined` / `null` -> `undefined` (lets wrapped component default apply)
 */
export function coerceBoolean(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null)
    return undefined
  if (typeof raw === 'boolean')
    return raw
  if (typeof raw === 'number')
    return raw !== 0
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (normalized === 'false' || normalized === '0')
      return false
    return true
  }
  return Boolean(raw)
}

/**
 * Coerce HTML attribute / JS property values into finite number.
 */
export function coerceNumber(raw: unknown): number | undefined {
  if (raw === undefined || raw === null)
    return undefined
  if (typeof raw === 'number')
    return Number.isFinite(raw) ? raw : undefined
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed)
      return undefined
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/**
 * Coerce string or numeric value (keeps non-numeric strings like `'100%'` or `'medium'`).
 */
export function coerceStringOrNumber(raw: unknown): string | number | undefined {
  if (raw === undefined || raw === null)
    return undefined
  if (typeof raw === 'number')
    return Number.isFinite(raw) ? raw : undefined
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed && NUMERIC_STRING_RE.test(trimmed)) {
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed))
        return parsed
    }
    return raw
  }
  return String(raw)
}

/**
 * Coerce boolean or string unions (e.g. `DividerGradient = boolean | 'start' | 'end' | 'both'`).
 */
export function coerceBooleanOrString(raw: unknown): boolean | string | undefined {
  if (raw === undefined || raw === null)
    return undefined
  if (typeof raw === 'boolean')
    return raw
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (normalized === '' || normalized === 'true')
      return true
    if (normalized === 'false')
      return false
    return raw
  }
  return String(raw)
}

/**
 * Coerce JSON-serialized HTML attributes into objects or arrays.
 * Passes existing non-string JS values through unchanged.
 */
export function coerceJson<T = unknown>(raw: unknown): T | undefined {
  if (raw === undefined || raw === null)
    return undefined
  if (typeof raw !== 'string')
    return raw as T
  const trimmed = raw.trim()
  if (!trimmed)
    return undefined
  try {
    return JSON.parse(trimmed) as T
  }
  catch {
    return undefined
  }
}

/**
 * Coerce values that may be either a plain string or a JSON array/object
 * (e.g. `TxCollapse` `modelValue: string | string[]`, `TxStreamText` `content: string | StreamInline[]`).
 */
export function coerceStringOrJson(raw: unknown): unknown {
  if (raw === undefined || raw === null)
    return undefined
  if (typeof raw !== 'string')
    return raw
  const trimmed = raw.trim()
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      return JSON.parse(trimmed)
    }
    catch {
      return raw
    }
  }
  return raw
}

/**
 * Coerce values that may be either a boolean flag or a JSON object/array
 * (e.g. `TxForm` `persist: boolean | FormPersistOptions`, `TxScroll` `pullDownRefresh: boolean | object`).
 */
export function coerceBooleanOrJson(raw: unknown): unknown {
  if (raw === undefined || raw === null)
    return undefined
  if (typeof raw === 'boolean')
    return raw
  if (typeof raw !== 'string')
    return raw
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()
  if (lower === '' || lower === 'true' || lower === '1')
    return true
  if (lower === 'false' || lower === '0')
    return false
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed)
    }
    catch {
      return undefined
    }
  }
  return coerceBoolean(raw)
}

export function coercePropValue(kind: PropCoerceKind, raw: unknown): unknown {
  if (raw === undefined)
    return undefined
  if (typeof kind === 'function')
    return kind(raw)

  switch (kind) {
    case 'boolean':
      return coerceBoolean(raw)
    case 'number':
      return coerceNumber(raw)
    case 'string':
      return raw === null ? undefined : String(raw)
    case 'string-or-number':
      return coerceStringOrNumber(raw)
    case 'boolean-or-string':
      return coerceBooleanOrString(raw)
    case 'boolean-or-json':
      return coerceBooleanOrJson(raw)
    case 'json':
      return coerceJson(raw)
    case 'string-or-json':
      return coerceStringOrJson(raw)
    case 'any':
    default:
      return raw
  }
}

export function coercePropsBySchema(
  rawProps: Record<string, unknown>,
  schema: PropSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, kind] of Object.entries(schema)) {
    const raw = rawProps[key]
    if (raw === undefined)
      continue
    const coerced = coercePropValue(kind, raw)
    if (coerced !== undefined)
      result[key] = coerced
  }
  return result
}
