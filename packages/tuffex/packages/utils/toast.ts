import { reactive } from 'vue'
import { getZIndex, nextZIndex } from './z-index-manager'

export type TxToastVariant = 'default' | 'info' | 'success' | 'warning' | 'danger'

export interface TxToastAction {
  /** Button label. Keep it to one or two words — it sits next to the copy. */
  label: string
  onClick?: (id: string) => void
  /** Close the toast after `onClick` returns. Defaults to `true`. */
  dismiss?: boolean
}

export interface TxToastItem {
  id: string
  title?: string
  description?: string
  variant?: TxToastVariant
  duration?: number
  action?: TxToastAction
  createdAt: number
}

export interface TxToastOptions {
  id?: string
  title?: string
  description?: string
  variant?: TxToastVariant
  duration?: number
  action?: TxToastAction
}

const DEFAULT_DURATION = 2600

export const toastStore = reactive({
  items: [] as TxToastItem[],
  zIndex: getZIndex(),
})

function generateId() {
  return `tx-toast-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

interface DismissTimer {
  /** `null` while paused — the toast is on screen but not counting down. */
  handle: ReturnType<typeof globalThis.setTimeout> | null
  /** Milliseconds still owed. Recomputed from the clock each time we pause. */
  remaining: number
  /** Epoch ms the toast is due to close; only meaningful while `handle` is set. */
  dueAt: number
}

const dismissTimers = new Map<string, DismissTimer>()

/**
 * A reader hovering the stack has stopped to read it, so the countdown stops
 * with them. This is host state, not per-toast state: `TxToastHost` pauses on
 * pointer/focus entry and resumes on exit, and toasts raised while paused wait
 * for the reader to leave before starting their own clock.
 */
let paused = false

function startTimer(id: string, timer: DismissTimer): void {
  timer.dueAt = Date.now() + timer.remaining
  timer.handle = globalThis.setTimeout(() => {
    dismissToast(id)
  }, timer.remaining)
}

function stopTimer(timer: DismissTimer): void {
  if (timer.handle !== null) {
    globalThis.clearTimeout(timer.handle)
    timer.handle = null
  }
}

function clearDismissTimer(id: string): void {
  const timer = dismissTimers.get(id)
  if (timer !== undefined) {
    stopTimer(timer)
    dismissTimers.delete(id)
  }
}

export function toast(options: TxToastOptions): string {
  toastStore.zIndex = nextZIndex()
  const id = options.id ?? generateId()
  const duration = options.duration ?? DEFAULT_DURATION

  const existingIndex = toastStore.items.findIndex(t => t.id === id)
  if (existingIndex !== -1) {
    clearDismissTimer(id)
    toastStore.items.splice(existingIndex, 1)
  }

  const item: TxToastItem = {
    id,
    title: options.title,
    description: options.description,
    variant: options.variant ?? 'default',
    duration,
    action: options.action,
    createdAt: Date.now(),
  }

  toastStore.items.push(item)

  if (duration > 0) {
    const timer: DismissTimer = { handle: null, remaining: duration, dueAt: 0 }
    dismissTimers.set(id, timer)
    if (!paused)
      startTimer(id, timer)
  }

  return id
}

export function dismissToast(id: string): void {
  clearDismissTimer(id)
  const index = toastStore.items.findIndex(t => t.id === id)
  if (index !== -1) {
    toastStore.items.splice(index, 1)
  }
}

export function clearToasts(): void {
  dismissTimers.forEach(timer => stopTimer(timer))
  dismissTimers.clear()
  paused = false
  toastStore.items.splice(0, toastStore.items.length)
}

/**
 * Hold every auto-dismiss countdown where it is. Idempotent, so a host can call
 * it from overlapping pointer and focus handlers without double-charging the
 * remaining time.
 */
export function pauseToasts(): void {
  if (paused)
    return
  paused = true

  const now = Date.now()
  dismissTimers.forEach((timer) => {
    if (timer.handle === null)
      return
    timer.remaining = Math.max(0, timer.dueAt - now)
    stopTimer(timer)
  })
}

/** Resume every paused countdown from the time it had left, not from the top. */
export function resumeToasts(): void {
  if (!paused)
    return
  paused = false

  dismissTimers.forEach((timer, id) => {
    if (timer.handle !== null)
      return
    startTimer(id, timer)
  })
}

/** Whether countdowns are currently held. Exposed for hosts and tests. */
export function toastsPaused(): boolean {
  return paused
}
