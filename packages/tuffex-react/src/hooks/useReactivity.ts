import type { EffectScope } from '@vue/reactivity'
import { effect, effectScope, stop } from '@vue/reactivity'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

export interface ReadableSignal<T> {
  readonly value: T
}

/**
 * Subscribe a React component to any `@vue/reactivity` Ref / ShallowRef / ComputedRef
 * via `useSyncExternalStore` + `effect`. Concurrent-mode & SSR safe.
 */
export function useSignal<T>(signal: ReadableSignal<T>): T {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let initialized = false
      const runner = effect(
        () => {
          void signal.value
          if (initialized)
            onStoreChange()
        },
        {
          scheduler: () => {
            onStoreChange()
          },
        },
      )
      initialized = true
      return () => {
        stop(runner)
      }
    },
    [signal],
  )

  const getSnapshot = useCallback(() => signal.value, [signal])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Derive a reactive value from one or more `@vue/reactivity` signals in React.
 */
export function useComputed<T>(getter: () => T): T {
  const getterRef = useRef(getter)
  getterRef.current = getter

  const snapshotRef = useRef<T>(undefined as unknown as T)
  const hasSnapshotRef = useRef(false)
  if (!hasSnapshotRef.current) {
    snapshotRef.current = getter()
    hasSnapshotRef.current = true
  }

  const subscribe = useCallback((onStoreChange: () => void) => {
    const runner = effect(
      () => {
        snapshotRef.current = getterRef.current()
      },
      {
        scheduler: () => {
          const next = getterRef.current()
          if (!Object.is(snapshotRef.current, next)) {
            snapshotRef.current = next
            onStoreChange()
          }
        },
      },
    )
    return () => {
      stop(runner)
    }
  }, [])

  const getSnapshot = useCallback(() => snapshotRef.current, [])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Create a `@vue/reactivity` `effectScope()` whose reactive primitives live for
 * the component's lifetime and are automatically disposed on unmount.
 */
export function useReactiveScope<T>(factory: () => T): T {
  const scopeRef = useRef<EffectScope | null>(null)
  const valueRef = useRef<T | null>(null)
  const factoryRef = useRef(factory)
  factoryRef.current = factory

  if (scopeRef.current === null) {
    const scope = effectScope(true)
    scopeRef.current = scope
    valueRef.current = scope.run(() => factoryRef.current()) as T
  }

  useEffect(() => {
    if (scopeRef.current === null) {
      const scope = effectScope(true)
      scopeRef.current = scope
      valueRef.current = scope.run(() => factoryRef.current()) as T
    }
    return () => {
      scopeRef.current?.stop()
      scopeRef.current = null
    }
  }, [])

  return valueRef.current as T
}
