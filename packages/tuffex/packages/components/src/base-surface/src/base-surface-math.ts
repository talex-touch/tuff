export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

export function createSurfaceValueResolver(attrs: Record<string, unknown>) {
  function readAttr(keys: string[]) {
    for (const key of keys) {
      const value = attrs[key]
      if (value != null) {
        return value
      }
    }
    return undefined
  }

  function toFinite(value: unknown, fallback: number, attrKeys: string[] = []) {
    const direct = toNumber(value)
    if (direct != null) {
      return direct
    }
    const fromAttr = toNumber(readAttr(attrKeys))
    if (fromAttr != null) {
      return fromAttr
    }
    return fallback
  }

  function toEnum<T extends string>(value: unknown, allow: readonly T[], fallback: T, attrKeys: string[] = []) {
    if (typeof value === 'string' && allow.includes(value as T)) {
      return value as T
    }
    const fromAttr = readAttr(attrKeys)
    if (typeof fromAttr === 'string' && allow.includes(fromAttr as T)) {
      return fromAttr as T
    }
    return fallback
  }

  return {
    toFinite,
    toEnum,
  }
}

export function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t
}

export function smoothstep01(value: number) {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

export function normalizeAngleDeg(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180
}

export function easeOutQuad(value: number) {
  const t = clamp(value, 0, 1)
  return 1 - (1 - t) * (1 - t)
}
