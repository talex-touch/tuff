import { enterPerfContext } from '../utils/perf-context'

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

  async runAppTask<T>(task: () => Promise<T>, label: string = 'app-task'): Promise<T> {
    this.activeCount += 1
    const current = this.activeLabels.get(label) ?? 0
    this.activeLabels.set(label, current + 1)
    const disposeContext = enterPerfContext(`AppTask:${label}`, {
      activeCount: this.activeCount,
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
        waiters.forEach(resolve => resolve())
      }
    }
  }

  async waitForIdle(): Promise<void> {
    if (!this.isActive()) {
      return
    }
    await new Promise<void>(resolve => this.waiters.push(resolve))
  }
}

export const appTaskGate = AppTaskGate.getInstance()
