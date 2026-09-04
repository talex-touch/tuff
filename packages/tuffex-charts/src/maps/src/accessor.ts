import type { MapAccessor, MapStyle } from './types'

/** Resolves a row accessor: key of `T` or `(row) => V`. */
export function resolveAccessor<T, V>(row: T, accessor: MapAccessor<T, V>): V {
  return typeof accessor === 'function' ? accessor(row) : (row[accessor] as V)
}

/** Resolves a per-datum style: constant or `(row) => V`. */
export function resolveStyle<T, V>(row: T, style: MapStyle<T, V>): V {
  return typeof style === 'function' ? (style as (r: T) => V)(row) : style
}
