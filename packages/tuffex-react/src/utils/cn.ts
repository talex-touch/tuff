import type { MutableRefObject, Ref } from 'react'

export type ClassInput = string | false | null | undefined | Record<string, boolean | undefined>

export function cn(...inputs: ClassInput[]): string {
  const result: string[] = []
  for (const input of inputs) {
    if (!input)
      continue
    if (typeof input === 'string') {
      const trimmed = input.trim()
      if (trimmed)
        result.push(trimmed)
    }
    else {
      for (const [key, active] of Object.entries(input)) {
        if (active)
          result.push(key)
      }
    }
  }
  return result.join(' ')
}

export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): (node: T | null) => void {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref)
        continue
      if (typeof ref === 'function')
        ref(node)
      else
        (ref as MutableRefObject<T | null>).current = node
    }
  }
}

export function toCssUnit(value: string | number | undefined, fallback = ''): string {
  if (value === undefined || value === null)
    return fallback
  if (typeof value === 'number')
    return Number.isFinite(value) ? `${value}px` : fallback
  return value
}
