import type { BandAccessor, NumericAccessor, StringAccessor } from './types'

export function resolveNumber<T>(d: T, index: number, accessor: NumericAccessor<T>): number {
  if (typeof accessor === 'function')
    return accessor(d, index)
  return Number(d[accessor])
}

export function resolveString<T>(d: T, index: number, accessor: StringAccessor<T>): string {
  if (typeof accessor === 'function')
    return accessor(d, index)
  return String(d[accessor])
}

export function resolveBand<T>(d: T, index: number, accessor: BandAccessor<T>): string | number {
  if (typeof accessor === 'function')
    return accessor(d, index)
  const value = d[accessor]
  return typeof value === 'number' ? value : String(value)
}
