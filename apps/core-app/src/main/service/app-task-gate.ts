import { enterPerfContext } from '../utils/perf-context'

/**
 * Bound for deferred one-shot startup work that waits on this gate.
 *
 * `waitForIdle()` with no argument waits forever, and an app-index scan can hold
 * the gate for minutes. For work that only ever runs once -- starting a watcher,
 * hydrating a cache -- an unbounded wait does not merely delay it, it can mean
 * the feature never initializes at all. Such callers should wait up to this
 * bound and then proceed regardless: the gate is a courtesy, not a correctness
 * requirement.
 *
 * Repeatable work on a hot path wants the opposite (a much shorter bound and a
 * skip on timeout, since there will be another chance) -- see
 * `CLIPBOARD_APP_TASK_WAIT_MS`.
 */
export const APP_TASK_GATE_STARTUP_WAIT_MS = 10_000

type Waiter = () => void

class AppTaskGate {
  private static instance: AppTaskGate | null = null
  private activeCount = 0
  private waiters: Waiter[] = []
  private activeLabels = new Map<string, number>()

  static getInstance(): AppTaskGate {
    if (!AppTaskGate.instance) {
      AppTaskGate.instance = new AppTaskGate()
    }
    return AppTaskGate.instance
  }

  isActive(): boolean {
    return this.activeCount > 0
  }

  getSnapshot(): { activeCount: number; activeLabels: Record<string, number> } {
    return {
      activeCount: this.activeCount,
      activeLabels: Object.fromEntries(this.activeLabels.entries())
    }
  }

  async runAppTask<T>(task: () => Promise<T>, label: string = 'app-task'): Promise<T> {
    this.activeCount += 1
    const current = this.activeLabels.get(label) ?? 0
    this.activeLabels.set(label, current + 1)
    const disposeContext = enterPerfContext(`AppTask:${label}`, {
      activeCount: this.activeCount
    })
    try {
      return await task()
    } finally {
      this.activeCount = Math.max(0, this.activeCount - 1)
      const nextCount = Math.max(0, (this.activeLabels.get(label) ?? 1) - 1)
      if (nextCount === 0) {
        this.activeLabels.delete(label)
      } else {
        this.activeLabels.set(label, nextCount)
      }
      disposeContext()
      if (this.activeCount === 0 && this.waiters.length > 0) {
        const waiters = this.waiters
        this.waiters = []
        waiters.forEach((resolve) => resolve())
      }
    }
  }

  async waitForIdle(timeoutMs?: number): Promise<boolean> {
    if (!this.isActive()) {
      return true
    }

    const normalizedTimeout =
      typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0

    return await new Promise<boolean>((resolve) => {
      let settled = false
      let timer: NodeJS.Timeout | null = null

      const cleanup = (): void => {
        const index = this.waiters.indexOf(waiter)
        if (index >= 0) {
          this.waiters.splice(index, 1)
        }
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
      }

      const waiter = (): void => {
        if (settled) return
        settled = true
        cleanup()
        resolve(true)
      }

      this.waiters.push(waiter)

      if (normalizedTimeout > 0) {
        timer = setTimeout(() => {
          if (settled) return
          settled = true
          cleanup()
          resolve(false)
        }, normalizedTimeout)
      }
    })
  }
}

export const appTaskGate = AppTaskGate.getInstance()
