import { AsyncLocalStorage } from 'node:async_hooks'

/** Main-process ownership of an idle-only slice; this is not sent to a worker realm. */
export const indexMaintenanceContext = new AsyncLocalStorage<boolean>()

/** No SQL ran: release admission/source ownership before waiting for foreground idle again. */
export class IndexMaintenanceDeferredError extends Error {
  constructor() {
    super('INDEX_MAINTENANCE_DEFERRED')
    this.name = 'IndexMaintenanceDeferredError'
  }
}

export interface IndexMaintenanceNotification {
  commitKey: string
  sourceId: string
  affectedItems: number
}

export interface IndexMaintenanceSlice {
  processed: number
  done: boolean
  deferred: boolean
  notifications: IndexMaintenanceNotification[]
}
