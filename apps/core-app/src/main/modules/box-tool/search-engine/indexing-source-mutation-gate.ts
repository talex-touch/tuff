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
  activeLeaseIds: Set<string>
  idleWaiters: Set<() => void>
  queueTail: Promise<void>
}

export class IndexingSourceMutationGate {
  private readonly states = new Map<string, SourceGateState>()

  async run<T>(
    sourceId: string,
    operation: (lease: IndexingSourceMutationLease) => Promise<T>
  ): Promise<T> {
    const state = this.getState(sourceId)
    const ticket = this.enqueue(state)
    await ticket.previous

    state.active += 1
    const leaseId = `${sourceId}:${state.epoch}:${state.nextLeaseId++}`
    state.activeLeaseIds.add(leaseId)
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

  async runWithinLease<T>(
    sourceId: string,
    leaseId: string,
    operation: (lease: IndexingSourceMutationLease) => Promise<T>
  ): Promise<T> {
    const state = this.getState(sourceId)
    if (!state.activeLeaseIds.has(leaseId)) {
      throw new Error(`INDEXING_SOURCE_MUTATION_LEASE_INVALID:${sourceId}`)
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

    try {
      state.epoch += 1
      const leaseId = `${sourceId}:${state.epoch}:exclusive`
      return await operation({ sourceId, epoch: state.epoch, exclusive: true, id: leaseId })
    } finally {
      ticket.release()
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
      activeLeaseIds: new Set(),
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
