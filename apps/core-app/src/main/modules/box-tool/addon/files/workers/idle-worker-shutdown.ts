export interface IdleWorkerShutdownControllerOptions {
  timeoutMs: number
  shouldShutdown: () => boolean
  shutdown: () => void
}

export class IdleWorkerShutdownController {
  private timer: ReturnType<typeof setTimeout> | null = null
  // A metrics request can defer retirement, but must not start a fresh idle window.
  private deadlineAt: number | null = null

  constructor(private readonly options: IdleWorkerShutdownControllerOptions) {}

  schedule(): void {
    if (this.timer || this.options.timeoutMs <= 0) {
      return
    }
    this.deadlineAt ??= Date.now() + this.options.timeoutMs

    this.timer = setTimeout(
      () => {
        this.timer = null
        if (this.options.shouldShutdown()) {
          this.deadlineAt = null
          this.options.shutdown()
        }
      },
      Math.max(0, this.deadlineAt - Date.now())
    )

    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref()
    }
  }

  cancel(): void {
    this.deadlineAt = null
    if (!this.timer) {
      return
    }

    clearTimeout(this.timer)
    this.timer = null
  }
}

export const FILE_WORKER_IDLE_SHUTDOWN_MS = 60_000
