import { appTaskGate } from '../../../../../service/app-task-gate'
import { pollingService } from '@talex-touch/utils/common/utils/polling'

export interface AppIndexMaintenanceServiceOptions {
  runFullSyncIfDue: () => Promise<void>
}

/** Coordinates serialized app-index maintenance and owns its polling registration. */
export class AppIndexMaintenanceService {
  private taskQueue: Promise<void> = Promise.resolve()
  private readonly tasks = new Map<string, Promise<unknown>>()
  private fullSyncRegistered = false

  constructor(private readonly options: AppIndexMaintenanceServiceOptions) {}

  public run<T>(taskKey: string, task: () => Promise<T>): Promise<T> {
    const existing = this.tasks.get(taskKey)
    if (existing) return existing as Promise<T>

    const label = `AppProvider.${taskKey}`
    const start = () => appTaskGate.runAppTask(task, label)
    const pending = this.taskQueue.then(start, start)
    const tracked = pending.finally(() => {
      if (this.tasks.get(taskKey) === tracked) this.tasks.delete(taskKey)
    })
    this.tasks.set(taskKey, tracked)
    this.taskQueue = tracked.then(
      () => undefined,
      () => undefined
    )
    return tracked
  }

  public registerFullSync(intervalMs: number): boolean {
    if (this.fullSyncRegistered) return false
    this.fullSyncRegistered = true
    pollingService.register(
      'app_provider_full_sync',
      async () => await this.options.runFullSyncIfDue(),
      {
        interval: intervalMs,
        unit: 'milliseconds',
        lane: 'maintenance',
        backpressure: 'latest_wins',
        dedupeKey: 'app_provider_full_sync',
        maxInFlight: 1
      }
    )
    return true
  }

  public refreshFullSync(intervalMs: number, enabled: boolean): void {
    pollingService.unregister('app_provider_full_sync')
    this.fullSyncRegistered = false
    if (enabled) this.registerFullSync(intervalMs)
  }

  public isFullSyncRegistered(): boolean {
    return this.fullSyncRegistered
  }
}
