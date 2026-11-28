/**
 * R6 Lightweight 12ms Frame-Budgeted Demo Mount Scheduler.
 *
 * Replaces Nexus's 2000ms serial idle prefetch/activation queue.
 * Demo chunks download immediately in parallel via 1-hop dynamic import, while
 * Vue component mounting is budgeted to <= 12ms per frame using
 * `scheduler.yield()` (when available) or `requestAnimationFrame` so visible
 * demos appear promptly without producing >50ms Long Tasks.
 */

import { hasWindow } from '@talex-touch/utils/env'

interface ScheduledTask {
  id: number
  run: () => void
  cancelled: boolean
}

const FRAME_BUDGET_MS = 12
let nextTaskId = 1
const queue: ScheduledTask[] = []
let flushScheduled = false
let rafId: number | null = null

interface SchedulerWithYield {
  yield?: () => Promise<void>
}

function getSchedulerYield(): (() => Promise<void>) | null {
  if (typeof globalThis === 'undefined')
    return null
  const sched = (globalThis as { scheduler?: SchedulerWithYield }).scheduler
  return typeof sched?.yield === 'function' ? () => sched.yield!() : null
}

async function flushQueue() {
  flushScheduled = false
  rafId = null

  const yieldToMain = getSchedulerYield()
  let frameStart = typeof performance !== 'undefined' ? performance.now() : Date.now()

  while (queue.length > 0) {
    const task = queue.shift()
    if (!task || task.cancelled)
      continue

    try {
      task.run()
    }
    catch (error) {
      if (import.meta.dev)
        console.warn('[demo-mount-scheduler] mount callback failed:', error)
    }

    if (queue.length === 0)
      break

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - frameStart >= FRAME_BUDGET_MS) {
      if (yieldToMain) {
        await yieldToMain()
        frameStart = typeof performance !== 'undefined' ? performance.now() : Date.now()
        continue
      }
      scheduleFlush()
      return
    }
  }
}

function scheduleFlush() {
  if (flushScheduled)
    return
  flushScheduled = true

  if (hasWindow() && typeof window.requestAnimationFrame === 'function') {
    rafId = window.requestAnimationFrame(() => {
      void flushQueue()
    })
    return
  }

  setTimeout(() => {
    void flushQueue()
  }, 0)
}

/**
 * Enqueues a demo mount callback within the 12ms per-frame mount budget.
 * Returns a cancellation function for unmount / route switch cleanup.
 */
export function scheduleDemoMount(run: () => void, options?: { immediate?: boolean }): () => void {
  if (!import.meta.client) {
    return () => {}
  }

  if (options?.immediate) {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled)
        run()
    })
    return () => {
      cancelled = true
    }
  }

  const task: ScheduledTask = {
    id: nextTaskId++,
    run,
    cancelled: false,
  }
  queue.push(task)
  scheduleFlush()

  return () => {
    task.cancelled = true
  }
}

/**
 * Clears any pending queued demo mounts (called atomically on route change).
 */
export function resetDemoMountQueue(): void {
  for (const task of queue)
    task.cancelled = true
  queue.length = 0
  if (rafId !== null && hasWindow()) {
    window.cancelAnimationFrame(rafId)
    rafId = null
  }
  flushScheduled = false
}
