type Waiter = () => void

class AppTaskGate {
  private static instance: AppTaskGate | null = null
  private activeCount = 0
  private waiters: Waiter[] = []

  static getInstance(): AppTaskGate {
    if (!AppTaskGate.instance) {
      AppTaskGate.instance = new AppTaskGate()
    }
    return AppTaskGate.instance
  }

  isActive(): boolean {
    return this.activeCount > 0
  }

  async runAppTask<T>(task: () => Promise<T>): Promise<T> {
    this.activeCount += 1
    try {
      return await task()
    } finally {
      this.activeCount = Math.max(0, this.activeCount - 1)
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
