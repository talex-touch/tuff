import {
  computed,
  effect,
  effectScope,
  isRef,
  stop,
  type EffectScope,
  type Ref,
  type ShallowRef,
} from '@vue/reactivity'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { Signal } from './reactivity'

export type ReactiveSource<T> = Ref<T> | ShallowRef<T> | Signal<T> | (() => T)

function readSource<T>(source: ReactiveSource<T>): T {
  if (typeof source === 'function')
    return (source as () => T)()
  if (isRef(source))
    return source.value
  return source.get()
}

/**
 * Subscribe a React 18/19 component to any `@vue/reactivity` `Ref`, `ShallowRef`,
 * `Signal`, or reactive getter via `useSyncExternalStore` + `effect`.
 */
export function useSignal<T>(source: ReactiveSource<T>): T {
  const sourceRef = useRef(source)
  sourceRef.current = source

  const subscribe = useMemo(() => {
    return (onStoreChange: () => void) => {
      const runner = effect(
        () => {
          readSource(sourceRef.current)
        },
        {
          scheduler() {
            onStoreChange()
          },
        },
      )
      return () => {
        stop(runner)
      }
    }
  }, [source])

  const getSnapshot = () => readSource(sourceRef.current)
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Memoized reactive computed derivation bridged into React via `useSyncExternalStore`.
 */
export function useComputed<T>(getter: () => T, deps: readonly unknown[] = []): T {
  const getterRef = useRef(getter)
  getterRef.current = getter

  const derived = useMemo(() => computed(() => getterRef.current()), deps)
  return useSignal(derived)
}

/**
 * Creates a `@vue/reactivity` `effectScope` tied to a React component's lifecycle,
 * automatically stopping every reactive effect and controller created inside `factory`
 * on unmount or when `deps` change.
 */
export function useReactiveScope<T>(
  factory: (scope: EffectScope) => T,
  deps: readonly unknown[] = [],
): T {
  const created = useMemo(() => {
    const scope = effectScope(true)
    const value = scope.run(() => factory(scope)) as T
    return { scope, value }
  }, deps)

  useEffect(() => {
    return () => {
      created.scope.stop()
    }
  }, [created])

  return created.value
}
