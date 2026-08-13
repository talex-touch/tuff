import type { App, InjectionKey } from 'vue'
import { getCurrentInstance, inject } from 'vue'
import { hasDocument, hasWindow } from './env'

export interface TxZIndexContext {
  seed: number
  current: number
}

export interface TxZIndexOverrides {
  /** Override next allocation logic. */
  next?: (ctx: TxZIndexContext) => number
  /** Override get logic for full external integration. */
  get?: (ctx: TxZIndexContext) => number
}

export interface TxZIndexSeedSource {
  /** Returns latest seed from external system (store/host/CSS var, etc.). */
  getSeed: () => number | undefined | null
  /**
   * Subscribe seed changes.
   * Return unsubscribe function.
   */
  subscribe?: (listener: () => void) => () => void
}

export type TxZIndexEvent =
  | { type: 'next'; seed: number; current: number; prev: number }
  | { type: 'refresh'; seed: number; current: number; prev: number; reason?: string }
  | { type: 'reset'; seed: number; current: number; prev: number; reason?: string }
  | { type: 'configure'; seed: number; current: number; prev: number }

export const DEFAULT_Z_INDEX_SEED = 2000

type ZIndexListener = (e: TxZIndexEvent) => void

interface ZIndexState {
  seed: number
  current: number
  overrides: TxZIndexOverrides | null
  seedSource: TxZIndexSeedSource | null
  seedSourceUnsubscribe: (() => void) | null
  listeners: Set<ZIndexListener>
}

export interface TxZIndexAllocator {
  configure: (options: {
    seed?: number
    overrides?: TxZIndexOverrides
    seedSource?: TxZIndexSeedSource | null
  }) => void
  onEvent: (listener: ZIndexListener) => () => void
  get: () => number
  next: () => number
  refresh: (seed?: number, reason?: string) => number
  reset: (seed?: number, reason?: string) => number
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function parseCssZIndex(value: string): number | null {
  const raw = value.trim()
  if (!raw)
    return null
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n))
    return null
  return n
}

function resolveSeedFromCssVar(): number | null {
  if (!hasWindow() || !hasDocument())
    return null
  if (typeof getComputedStyle !== 'function')
    return null

  const raw = getComputedStyle(document.documentElement).getPropertyValue('--tx-index-popper')
  const n = parseCssZIndex(raw)
  if (n == null)
    return null
  return Math.max(DEFAULT_Z_INDEX_SEED, n)
}

/**
 * Builds an allocator with its own counter.
 *
 * The state used to live at module scope. In a Node SSR process that module is
 * instantiated once and shared by every request, so one request's overlay
 * allocation shifted the z-index every later request rendered, and the value a
 * cold client computed never matched (#956).
 */
export function createZIndexAllocator(): TxZIndexAllocator {
  const state: ZIndexState = {
    seed: DEFAULT_Z_INDEX_SEED,
    current: DEFAULT_Z_INDEX_SEED,
    overrides: null,
    seedSource: null,
    seedSourceUnsubscribe: null,
    listeners: new Set(),
  }

  function emitEvent(e: TxZIndexEvent): void {
    state.listeners.forEach((listener) => {
      try {
        listener(e)
      }
      catch {
        // ignore listener errors
      }
    })
  }

  function resolveSeed(inputSeed?: number): number {
    if (isFiniteNumber(inputSeed))
      return inputSeed

    const fromSource = state.seedSource?.getSeed?.()
    if (isFiniteNumber(fromSource))
      return fromSource

    return resolveSeedFromCssVar() ?? DEFAULT_Z_INDEX_SEED
  }

  function refresh(seed?: number, reason?: string): number {
    const prev = state.current
    const resolvedSeed = resolveSeed(seed)

    state.seed = resolvedSeed
    state.current = Math.max(state.current, resolvedSeed)

    emitEvent({ type: 'refresh', seed: state.seed, current: state.current, prev, reason })
    return state.current
  }

  function reset(seed?: number, reason?: string): number {
    const prev = state.current
    const resolvedSeed = resolveSeed(seed)

    state.seed = resolvedSeed
    state.current = resolvedSeed

    emitEvent({ type: 'reset', seed: state.seed, current: state.current, prev, reason })
    return state.current
  }

  function configure(options: {
    seed?: number
    overrides?: TxZIndexOverrides
    seedSource?: TxZIndexSeedSource | null
  }): void {
    const prev = state.current

    const hasOverrides = Object.prototype.hasOwnProperty.call(options, 'overrides')
    const hasSeedSource = Object.prototype.hasOwnProperty.call(options, 'seedSource')
    const hasSeed = Object.prototype.hasOwnProperty.call(options, 'seed')

    if (hasOverrides) {
      state.overrides = options.overrides ?? null
    }

    if (hasSeedSource) {
      state.seedSourceUnsubscribe?.()
      state.seedSourceUnsubscribe = null
      state.seedSource = options.seedSource ?? null

      const src = state.seedSource
      if (src?.subscribe) {
        state.seedSourceUnsubscribe = src.subscribe(() => {
          refresh(undefined, 'seedSource')
        })
      }
    }

    if (hasSeed) {
      refresh(options.seed, 'configure')
    }
    else if (hasSeedSource && state.seedSource) {
      refresh(undefined, 'configure')
    }

    emitEvent({ type: 'configure', seed: state.seed, current: state.current, prev })
  }

  function onEvent(listener: ZIndexListener): () => void {
    state.listeners.add(listener)
    return () => state.listeners.delete(listener)
  }

  function get(): number {
    const ctx: TxZIndexContext = { seed: state.seed, current: state.current }
    const overridden = state.overrides?.get?.(ctx)
    if (isFiniteNumber(overridden))
      return overridden
    return state.current
  }

  function next(): number {
    const prev = state.current
    const ctx: TxZIndexContext = { seed: state.seed, current: state.current }
    const overridden = state.overrides?.next?.(ctx)

    const value = isFiniteNumber(overridden) ? overridden : state.current + 1
    state.current = value

    emitEvent({ type: 'next', seed: state.seed, current: state.current, prev })
    return state.current
  }

  return { configure, onEvent, get, next, refresh, reset }
}

export const TX_Z_INDEX_ALLOCATOR_KEY: InjectionKey<TxZIndexAllocator>
  = Symbol('tx-z-index-allocator')

/**
 * Allocator for callers with no Vue app in scope: the module-level functions
 * below, tests, and external consumers of the published API.
 */
const fallbackAllocator = createZIndexAllocator()

/**
 * Gives one app its own allocator. Vue SSR builds an app per request, so this
 * is what makes the counter request-scoped on the server.
 */
export function provideZIndexAllocator(
  app: App,
  allocator: TxZIndexAllocator = createZIndexAllocator(),
): TxZIndexAllocator {
  app.provide(TX_Z_INDEX_ALLOCATOR_KEY, allocator)
  return allocator
}

/**
 * Resolves the app-scoped allocator, falling back to the module-level one when
 * no app provided it — so a component still works when mounted outside
 * `app.use(Tuffex)`.
 *
 * Call this in `setup` and keep the result: `inject` is only valid there, while
 * allocation typically happens later from a watcher or event handler.
 */
export function useZIndexAllocator(): TxZIndexAllocator {
  if (!getCurrentInstance())
    return fallbackAllocator
  return inject(TX_Z_INDEX_ALLOCATOR_KEY, fallbackAllocator)
}

export function configureZIndex(options: {
  seed?: number
  overrides?: TxZIndexOverrides
  seedSource?: TxZIndexSeedSource | null
}): void {
  fallbackAllocator.configure(options)
}

export function onZIndexEvent(listener: ZIndexListener): () => void {
  return fallbackAllocator.onEvent(listener)
}

export function getZIndex(): number {
  return fallbackAllocator.get()
}

export function nextZIndex(): number {
  return fallbackAllocator.next()
}

export function refreshZIndex(seed?: number, reason?: string): number {
  return fallbackAllocator.refresh(seed, reason)
}

export function resetZIndex(seed?: number, reason?: string): number {
  return fallbackAllocator.reset(seed, reason)
}
