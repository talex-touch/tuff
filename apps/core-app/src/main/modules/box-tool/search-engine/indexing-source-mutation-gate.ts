import { isIndexMaintenanceIdle, waitForIndexMaintenanceIdle } from './search-activity'
import { IndexMaintenanceDeferredError, indexMaintenanceContext } from './index-maintenance-context'

export const INDEXING_SOURCE_MUTATION_LEASE_INVALID = 'INDEXING_SOURCE_MUTATION_LEASE_INVALID'

export function isIndexingSourceMutationLeaseInvalidError(
  error: unknown,
  sourceId: string
): boolean {
  return (
    error instanceof Error &&
    error.message === `${INDEXING_SOURCE_MUTATION_LEASE_INVALID}:${sourceId}`
  )
}

export interface IndexingSourceMutationLease {
  sourceId: string
  epoch: number
  exclusive: boolean
  id: string
}

interface SourceGateState {
  epoch: number
  active: number
  nextLeaseId: number
  activeLeaseIds: Map<string, number>
  idleWaiters: Set<() => void>
  queueTail: Promise<void>
}

export class IndexingSourceMutationGate {
  private readonly states = new Map<string, SourceGateState>()

  async run<T>(
    sourceId: string,
    operation: (lease: IndexingSourceMutationLease) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    const state = this.getState(sourceId)
    const ticket = this.enqueue(state)
    try {
      if (signal) {
        await new Promise<void>((resolve, reject) => {
          const abort = (): void => {
            signal.removeEventListener('abort', abort)
            reject(signal.reason)
          }
          signal.addEventListener('abort', abort, { once: true })
          void ticket.previous.then(() => {
            signal.removeEventListener('abort', abort)
            resolve()
          })
          if (signal.aborted) abort()
        })
      } else {
        await ticket.previous
      }
      signal?.throwIfAborted()
    } catch (error) {
      void ticket.previous.then(ticket.release)
      throw error
    }

    state.active += 1
    const leaseId = `${sourceId}:${state.epoch}:${state.nextLeaseId++}`
    state.activeLeaseIds.set(leaseId, 0)
    const lease: IndexingSourceMutationLease = {
      sourceId,
      epoch: state.epoch,
      exclusive: false,
      id: leaseId
    }

    try {
      return await operation(lease)
    } finally {
      state.activeLeaseIds.delete(leaseId)
      this.releaseActive(state)
      if (state.active === 0) {
        ticket.release()
      } else {
        void this.waitForIdle(state).then(ticket.release)
      }
    }
  }

  /** Waiting and a late foreground deferral both happen outside the source lease. */
  async runWhenIdle<T>(
    sourceId: string,
    operation: (lease: IndexingSourceMutationLease) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    while (true) {
      await waitForIndexMaintenanceIdle(signal)
      try {
        const result = await this.run<{ deferred: true } | { deferred: false; value: T }>(
          sourceId,
          async (lease) => {
            if (!isIndexMaintenanceIdle()) return { deferred: true }
            return {
              deferred: false,
              value: await indexMaintenanceContext.run(true, async () => await operation(lease))
            }
          },
          signal
        )
        if (!result.deferred) return result.value
      } catch (error) {
        if (!(error instanceof IndexMaintenanceDeferredError)) throw error
      }
    }
  }

  recordCommittedRecords(sourceId: string, leaseId: string, count: number): void {
    const state = this.getState(sourceId)
    const previous = state.activeLeaseIds.get(leaseId)
    if (previous === undefined)
      throw new Error(`${INDEXING_SOURCE_MUTATION_LEASE_INVALID}:${sourceId}`)
    state.activeLeaseIds.set(leaseId, previous + count)
  }

  getCommittedRecordCount(sourceId: string, leaseId: string): number {
    const count = this.getState(sourceId).activeLeaseIds.get(leaseId)
    if (count === undefined)
      throw new Error(`${INDEXING_SOURCE_MUTATION_LEASE_INVALID}:${sourceId}`)
    return count
  }

  async runWithinLease<T>(
    sourceId: string,
    leaseId: string,
    operation: (lease: IndexingSourceMutationLease) => Promise<T>
  ): Promise<T> {
    const state = this.getState(sourceId)
    if (!state.activeLeaseIds.has(leaseId)) {
      throw new Error(`${INDEXING_SOURCE_MUTATION_LEASE_INVALID}:${sourceId}`)
    }

    state.active += 1
    try {
      return await operation({ sourceId, epoch: state.epoch, exclusive: false, id: leaseId })
    } finally {
      this.releaseActive(state)
    }
  }

  async runExclusive<T>(
    sourceId: string,
    operation: (lease: IndexingSourceMutationLease) => Promise<T>,
    timeoutMs = 10_000
  ): Promise<T> {
    const state = this.getState(sourceId)
    const ticket = this.enqueue(state)
    try {
      await this.waitForQueue(ticket.previous, sourceId, timeoutMs)
    } catch (error) {
      void ticket.previous.then(ticket.release)
      throw error
    }

    state.epoch += 1
    const leaseId = `${sourceId}:${state.epoch}:exclusive`
    state.active += 1
    state.activeLeaseIds.set(leaseId, 0)
    try {
      return await operation({ sourceId, epoch: state.epoch, exclusive: true, id: leaseId })
    } finally {
      state.activeLeaseIds.delete(leaseId)
      this.releaseActive(state)
      if (state.active === 0) ticket.release()
      else void this.waitForIdle(state).then(ticket.release)
    }
  }

  getEpoch(sourceId: string): number {
    return this.states.get(sourceId)?.epoch ?? 0
  }

  private getState(sourceId: string): SourceGateState {
    const existing = this.states.get(sourceId)
    if (existing) return existing

    const created: SourceGateState = {
      epoch: 0,
      active: 0,
      nextLeaseId: 1,
      activeLeaseIds: new Map(),
      idleWaiters: new Set(),
      queueTail: Promise.resolve()
    }
    this.states.set(sourceId, created)
    return created
  }

  private enqueue(state: SourceGateState): { previous: Promise<void>; release: () => void } {
    const previous = state.queueTail
    let release!: () => void
    state.queueTail = new Promise<void>((resolve) => {
      release = resolve
    })
    return { previous, release }
  }

  private releaseActive(state: SourceGateState): void {
    state.active -= 1
    if (state.active !== 0) return
    for (const resolve of [...state.idleWaiters]) resolve()
  }

  private async waitForIdle(state: SourceGateState): Promise<void> {
    if (state.active === 0) return
    await new Promise<void>((resolve) => {
      const waiter = (): void => {
        state.idleWaiters.delete(waiter)
        resolve()
      }
      state.idleWaiters.add(waiter)
    })
  }

  private async waitForQueue(
    previous: Promise<void>,
    sourceId: string,
    timeoutMs: number
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(
        () => {
          if (settled) return
          settled = true
          reject(new Error(`INDEXING_SOURCE_SWITCH_TIMEOUT:${sourceId}`))
        },
        Math.max(1, timeoutMs)
      )
      void previous.then(() => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve()
      })
    })
  }
}
