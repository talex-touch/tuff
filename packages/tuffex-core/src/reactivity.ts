import type {
  ComputedGetter,
  ComputedRef,
  EffectScope,
  MaybeRef,
  MaybeRefOrGetter,
  ReactiveEffectRunner,
  Ref,
  ShallowRef,
  WritableComputedOptions,
  WritableComputedRef,
} from '@vue/reactivity'
import {
  computed,
  effect,
  effectScope,
  isReactive,
  isReadonly,
  isRef,
  markRaw,
  onScopeDispose,
  reactive,
  readonly,
  ref,
  shallowReactive,
  shallowReadonly,
  shallowRef,
  stop,
  toRaw,
  toRef,
  toRefs,
  toValue,
  triggerRef,
  unref,
} from '@vue/reactivity'

export {
  computed,
  effect,
  effectScope,
  isReactive,
  isReadonly,
  isRef,
  markRaw,
  onScopeDispose,
  reactive,
  readonly,
  ref,
  shallowReactive,
  shallowReadonly,
  shallowRef,
  stop,
  toRaw,
  toRef,
  toRefs,
  toValue,
  triggerRef,
  unref,
}

export type {
  ComputedGetter,
  ComputedRef,
  EffectScope,
  MaybeRef,
  MaybeRefOrGetter,
  ReactiveEffectRunner,
  Ref,
  ShallowRef,
  WritableComputedOptions,
  WritableComputedRef,
}

export interface Signal<T> {
  readonly value: T
  get: () => T
  set: (next: T | ((prev: T) => T)) => void
  peek: () => T
  subscribe: (listener: (value: T, prev: T) => void) => () => void
  readonly ref: ShallowRef<T>
}

export interface WatchSignalOptions {
  immediate?: boolean
  equals?: (a: unknown, b: unknown) => boolean
}

/**
 * Lightweight signal wrapper over `@vue/reactivity` `shallowRef` + `effect`.
 * Works identically inside Vue, React (`useSyncExternalStore`), Web Components, or plain JS.
 */
export function createSignal<T>(initialValue: T): Signal<T> {
  const inner = shallowRef<T>(initialValue)

  const get = (): T => inner.value
  const peek = (): T => toRaw(inner.value)
  const set = (next: T | ((prev: T) => T)): void => {
    const resolved = typeof next === 'function'
      ? (next as (prev: T) => T)(inner.value)
      : next
    if (!Object.is(inner.value, resolved))
      inner.value = resolved
  }

  const subscribe = (listener: (value: T, prev: T) => void): (() => void) => {
    return watchSignal(() => inner.value, (value, prev) => {
      listener(value, prev as T)
    })
  }

  return {
    get value() {
      return inner.value
    },
    get,
    set,
    peek,
    subscribe,
    ref: inner,
  }
}

/**
 * Framework-agnostic reactive watcher built purely on `@vue/reactivity` `effect`.
 * Replaces Vue runtime `watch()` inside headless controllers and machines.
 */
export function watchSignal<T>(
  source: () => T,
  callback: (value: T, oldValue: T | undefined) => void,
  options: WatchSignalOptions = {},
): () => void {
  const equals = options.equals ?? Object.is
  let initialized = false
  let oldValue: T | undefined

  const runner = effect(
    () => {
      const value = source()
      if (!initialized) {
        oldValue = value
        initialized = true
      }
      return value
    },
    {
      scheduler() {
        const nextValue = runner()
        if (!equals(nextValue, oldValue)) {
          const prev = oldValue
          oldValue = nextValue
          callback(nextValue, prev)
        }
      },
    },
  )

  if (options.immediate)
    callback(oldValue as T, undefined)

  const dispose = () => {
    stop(runner)
  }

  onScopeDispose(dispose, true)
  return dispose
}
