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

const state: ZIndexState = {
  seed: DEFAULT_Z_INDEX_SEED,
  current: DEFAULT_Z_INDEX_SEED,
  overrides: null,
  seedSource: null,
  seedSourceUnsubscribe: null,
  listeners: new Set(),
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function emitEvent(e: TxZIndexEvent) {
  state.listeners.forEach((listener) => {
    try {
      listener(e)
    }
    catch {
      // ignore listener errors
    }
  })
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

function resolveSeed(inputSeed?: number): number {
  if (isFiniteNumber(inputSeed))
    return inputSeed

  const fromSource = state.seedSource?.getSeed?.()
  if (isFiniteNumber(fromSource))
    return fromSource

  return resolveSeedFromCssVar() ?? DEFAULT_Z_INDEX_SEED
}

export function configureZIndex(options: {
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
        refreshZIndex(undefined, 'seedSource')
      })
    }
  }

  if (hasSeed) {
    refreshZIndex(options.seed, 'configure')
  }
  else if (hasSeedSource && state.seedSource) {
    refreshZIndex(undefined, 'configure')
  }

  emitEvent({ type: 'configure', seed: state.seed, current: state.current, prev })
}

export function onZIndexEvent(listener: (e: TxZIndexEvent) => void): () => void {
  state.listeners.add(listener)
  return () => state.listeners.delete(listener)
}

export function getZIndex(): number {
  const ctx: TxZIndexContext = { seed: state.seed, current: state.current }
  const overridden = state.overrides?.get?.(ctx)
  if (isFiniteNumber(overridden))
    return overridden
  return state.current
}

export function nextZIndex(): number {
  const prev = state.current
  const ctx: TxZIndexContext = { seed: state.seed, current: state.current }
  const overridden = state.overrides?.next?.(ctx)

  const next = isFiniteNumber(overridden) ? overridden : state.current + 1
  state.current = next

  emitEvent({ type: 'next', seed: state.seed, current: state.current, prev })
  return state.current
}

export function refreshZIndex(seed?: number, reason?: string): number {
  const prev = state.current
  const resolvedSeed = resolveSeed(seed)

  state.seed = resolvedSeed
  state.current = Math.max(state.current, resolvedSeed)

  emitEvent({ type: 'refresh', seed: state.seed, current: state.current, prev, reason })
  return state.current
}

export function resetZIndex(seed?: number, reason?: string): number {
  const prev = state.current
  const resolvedSeed = resolveSeed(seed)

  state.seed = resolvedSeed
  state.current = resolvedSeed

  emitEvent({ type: 'reset', seed: state.seed, current: state.current, prev, reason })
  return state.current
}

