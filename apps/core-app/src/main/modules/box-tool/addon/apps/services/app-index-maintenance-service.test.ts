import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  registerPolling: vi.fn(),
  runAppTask: vi.fn(),
  unregisterPolling: vi.fn()
}))

vi.mock('../../../../../service/app-task-gate', () => ({
  appTaskGate: {
    runAppTask: state.runAppTask
  }
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  pollingService: {
    register: state.registerPolling,
    unregister: state.unregisterPolling
  }
}))

import { AppIndexMaintenanceService } from './app-index-maintenance-service'

let registeredFullSyncTask: (() => Promise<void>) | null = null

function getRegisteredFullSyncTask(): () => Promise<void> {
  if (!registeredFullSyncTask) throw new Error('Expected full-sync polling task to be registered')
  return registeredFullSyncTask
}

describe('AppIndexMaintenanceService', () => {
  beforeEach(() => {
    registeredFullSyncTask = null
    state.registerPolling
      .mockReset()
      .mockImplementation((_taskId: string, task: () => Promise<void>) => {
        registeredFullSyncTask = task
      })
    state.unregisterPolling.mockReset()
    state.runAppTask
      .mockReset()
      .mockImplementation(async (task: () => Promise<unknown>) => await task())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('prevents a queued full-sync timer from starting work after stop', async () => {
    let fullSyncRuns = 0
    const maintenance = new AppIndexMaintenanceService({
      runFullSyncIfDue: async () => {
        fullSyncRuns += 1
      }
    })

    maintenance.registerFullSync(1)
    const queuedTick = getRegisteredFullSyncTask()

    await maintenance.stop()
    await queuedTick()

    expect(state.unregisterPolling).toHaveBeenCalledWith('app_provider_full_sync')
    expect(fullSyncRuns).toBe(0)
  })

  it('waits for active timer and queued maintenance work before stop resolves', async () => {
    const fullSyncStarted = Promise.withResolvers<void>()
    const finishFullSync = Promise.withResolvers<void>()
    const queuedWorkStarted = Promise.withResolvers<void>()
    const finishQueuedWork = Promise.withResolvers<void>()
    const maintenance = new AppIndexMaintenanceService({
      runFullSyncIfDue: async () => {
        fullSyncStarted.resolve()
        await finishFullSync.promise
      }
    })

    maintenance.registerFullSync(1)
    const activeTick = getRegisteredFullSyncTask()
    const tick = activeTick()
    await fullSyncStarted.promise

    const queuedWork = maintenance.run('metadata-sync', async () => {
      queuedWorkStarted.resolve()
      await finishQueuedWork.promise
    })
    await queuedWorkStarted.promise

    let stopSettled = false
    const stopping = maintenance.stop().then(() => {
      stopSettled = true
    })
    await Promise.resolve()

    finishQueuedWork.resolve()
    await queuedWork
    await Promise.resolve()

    expect(stopSettled).toBe(false)

    finishFullSync.resolve()
    await Promise.all([tick, stopping])

    expect(stopSettled).toBe(true)
  })
})
