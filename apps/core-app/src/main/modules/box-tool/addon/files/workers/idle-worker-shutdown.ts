export interface IdleWorkerShutdownControllerOptions {
  timeoutMs: number
  shouldShutdown: () => boolean
  shutdown: () => void
}

export class IdleWorkerShutdownController {
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: IdleWorkerShutdownControllerOptions) {}

  schedule(): void {
    if (this.timer || this.options.timeoutMs <= 0) {
      return
    }

    this.timer = setTimeout(() => {
      this.timer = null
      if (this.options.shouldShutdown()) {
        this.options.shutdown()
      }
    }, this.options.timeoutMs)

    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref()
    }
  }

  cancel(): void {
    if (!this.timer) {
      return
    }

    clearTimeout(this.timer)
    this.timer = null
  }
}

export const FILE_WORKER_IDLE_SHUTDOWN_MS = 60_000
