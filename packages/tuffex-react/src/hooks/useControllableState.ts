import { useCallback, useRef, useState } from 'react'

export interface UseControllableStateOptions<T> {
  value?: T
  defaultValue: T
  onChange?: (value: T) => void
}

/**
 * Supports both controlled (`value` provided) and uncontrolled (`defaultValue`)
 * React component patterns with a single setter.
 */
export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: UseControllableStateOptions<T>): [T, (next: T | ((prev: T) => T)) => void] {
  const isControlled = value !== undefined
  const [uncontrolled, setUncontrolled] = useState<T>(defaultValue)
  const current = isControlled ? value : uncontrolled

  const currentRef = useRef(current)
  currentRef.current = current
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === 'function'
        ? (next as (prev: T) => T)(currentRef.current)
        : next
      if (!isControlled)
        setUncontrolled(resolved)
      if (!Object.is(resolved, currentRef.current))
        onChangeRef.current?.(resolved)
    },
    [isControlled],
  )

  return [current, setValue]
}
