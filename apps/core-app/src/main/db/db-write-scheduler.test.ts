import { describe, expect, it, vi } from 'vitest'
import { DbWriteScheduler, dbWriteScheduler } from './db-write-scheduler'
import type { MainDatabase } from './db-write'
import { scheduleAuxWrite } from './db-write'
import { setSqliteRetryExhaustedListener } from './sqlite-retry'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sqliteBusyError(): Error {
  return Object.assign(new Error('database is locked'), {
    code: 'SQLITE_BUSY',
    rawCode: 5
  })
}

function createGate(): { wait: Promise<void>; release: () => void } {
  let release: (() => void) | null = null
  const wait = new Promise<void>((resolve) => {
    release = () => resolve()
  })

  return {
    wait,
    release: () => {
      release?.()
    }
  }
}

describe('DbWriteScheduler QoS', () => {
  it('在同等条件下优先执行更高优先级任务', async () => {
    const scheduler = new DbWriteScheduler()
    const order: string[] = []

    const firstGate = createGate()

    const first = scheduler.schedule(
      'background.task.first',
      async () => {
        order.push('background:first:start')
        await firstGate.wait
        order.push('background:first:end')
      },
      { priority: 'background' }
    )

    const second = scheduler.schedule(
      'background.task.second',
      async () => {
        order.push('background:second')
      },
      { priority: 'background' }
    )

    const critical = scheduler.schedule(
      'search-index.task.critical',
      async () => {
        order.push('critical')
      },
      { priority: 'critical' }
    )

    await sleep(20)
    firstGate.release()

    await Promise.all([first, second, critical])
    expect(order.indexOf('critical')).toBeLessThan(order.indexOf('background:second'))
  })

  it('best_effort 任务在超出等待预算时可被丢弃', async () => {
    const scheduler = new DbWriteScheduler()

    const firstGate = createGate()

    const first = scheduler.schedule(
      'search-index.task.block',
      async () => {
        await firstGate.wait
      },
      { priority: 'critical' }
    )

    let executed = false
    const staleTask = scheduler.schedule(
      'analytics.snapshots',
      async () => {
        executed = true
      },
      {
        priority: 'best_effort',
        dropPolicy: 'drop',
        maxQueueWaitMs: 30
      }
    )

    await sleep(90)
    firstGate.release()

    await expect(staleTask).rejects.toThrow('dropped')
    expect(executed).toBe(false)
    await first
  })

  it('best_effort 标签连续 SQLITE_BUSY 后触发熔断并自动恢复', async () => {
    const scheduler = new DbWriteScheduler()
    const busyError = new Error('SQLITE_BUSY: database is locked')

    // busyRetries: 0 keeps the scheduler's own busy-retry out of the way:
    // this test pins the circuit path (immediate busy failure → breaker).
    const runBusy = () =>
      scheduler.schedule(
        'analytics.snapshots',
        async () => {
          throw busyError
        },
        {
          priority: 'best_effort',
          maxBusyFailures: 2,
          circuitOpenMs: 1200,
          busyRetries: 0
        }
      )

    await expect(runBusy()).rejects.toThrow('SQLITE_BUSY')
    await expect(runBusy()).rejects.toThrow('SQLITE_BUSY')

    let circuitBlockedRun = false
    await expect(
      scheduler.schedule(
        'analytics.snapshots',
        async () => {
          circuitBlockedRun = true
          return 1
        },
        {
          priority: 'best_effort',
          maxBusyFailures: 2,
          circuitOpenMs: 1200
        }
      )
    ).rejects.toThrow('circuit breaker')
    expect(circuitBlockedRun).toBe(false)

    await sleep(1250)
    await expect(
      scheduler.schedule('analytics.snapshots', async () => 1, {
        priority: 'best_effort',
        maxBusyFailures: 2,
        circuitOpenMs: 1200
      })
    ).resolves.toBe(1)
  })

  it('可重建的文件缓存写入默认会在 SQLITE_BUSY 后熔断', async () => {
    const scheduler = new DbWriteScheduler()
    const busyError = new Error('SQLITE_BUSY: database is locked')

    for (const label of [
      'file-index.extensions.upsert',
      'file-icon.persist',
      'file-opener.icon.persist'
    ]) {
      // busyRetries: 0 isolates the default circuit policy under test from the
      // scheduler-owned busy backoff (which would otherwise retry for seconds).
      await expect(
        scheduler.schedule(
          label,
          async () => {
            throw busyError
          },
          { busyRetries: 0 }
        )
      ).rejects.toThrow('SQLITE_BUSY')
      await expect(
        scheduler.schedule(
          label,
          async () => {
            throw busyError
          },
          { busyRetries: 0 }
        )
      ).rejects.toThrow('SQLITE_BUSY')

      let executed = false
      await expect(
        scheduler.schedule(label, async () => {
          executed = true
        })
      ).rejects.toThrow('circuit breaker')
      expect(executed).toBe(false)
    }
  })
})

describe('DbWriteScheduler scheduler-native busy retry', () => {
  it('busy 任务退避期间不阻塞后续任务（无队头阻塞）', async () => {
    const scheduler = new DbWriteScheduler()
    const order: string[] = []
    let firstCalls = 0

    const first = scheduler.schedule(
      'scheduler-test.busy-then-ok',
      async () => {
        firstCalls += 1
        if (firstCalls <= 2) throw sqliteBusyError()
        order.push('first:success')
        return 'first'
      },
      { priority: 'background', busyRetries: 3, busyBaseDelayMs: 10, busyMaxDelayMs: 40 }
    )

    const second = scheduler.schedule(
      'scheduler-test.other',
      async () => {
        order.push('second:success')
        return 'second'
      },
      { priority: 'background' }
    )

    await expect(first).resolves.toBe('first')
    await expect(second).resolves.toBe('second')
    expect(firstCalls).toBe(3)
    expect(order.indexOf('second:success')).toBeLessThan(order.indexOf('first:success'))
  })

  it('busy 重试耗尽后以原始错误拒绝，exhausted 事件与熔断计数各触发一次', async () => {
    const scheduler = new DbWriteScheduler()
    const busyError = sqliteBusyError()
    const listener = vi.fn()
    const dispose = setSqliteRetryExhaustedListener(listener)
    let calls = 0

    try {
      await expect(
        scheduler.schedule(
          'scheduler-test.busy-exhaust',
          async () => {
            calls += 1
            throw busyError
          },
          { priority: 'best_effort', busyRetries: 2, busyBaseDelayMs: 5, busyMaxDelayMs: 20 }
        )
      ).rejects.toBe(busyError)
    } finally {
      dispose()
    }

    expect(calls).toBe(3)
    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0][0]).toMatchObject({
      label: 'scheduler-test.busy-exhaust',
      attempts: 3,
      code: 'SQLITE_BUSY',
      rawCode: 5
    })

    // Circuit accounting must fire once per schedule() call (final failure),
    // not once per retry attempt.
    const circuit = scheduler
      .getCircuitStates()
      .find((state) => state.label === 'scheduler-test.busy-exhaust')
    expect(circuit?.consecutiveBusyFailures).toBe(1)
    expect(scheduler.getDetailedStats().busyFailures).toBe(1)
  })

  it('可丢弃任务在退避期间超出等待预算后被丢弃，而不是无限重试', async () => {
    const scheduler = new DbWriteScheduler()
    let calls = 0

    const task = scheduler.schedule(
      'scheduler-test.busy-droppable',
      async () => {
        calls += 1
        throw sqliteBusyError()
      },
      {
        priority: 'best_effort',
        dropPolicy: 'drop',
        maxQueueWaitMs: 20,
        busyRetries: 6,
        busyBaseDelayMs: 40,
        busyMaxDelayMs: 80
      }
    )

    await expect(task).rejects.toThrow('dropped')
    expect(calls).toBe(1)
  })

  it('非 busy 错误立即拒绝且不重试', async () => {
    const scheduler = new DbWriteScheduler()
    const failure = new Error('constraint violation')
    let calls = 0

    await expect(
      scheduler.schedule('scheduler-test.non-busy-failure', async () => {
        calls += 1
        throw failure
      })
    ).rejects.toBe(failure)
    expect(calls).toBe(1)
  })

  it('busyRetries: 0 时 busy 失败立即拒绝（旧语义），且不触发 exhausted 事件', async () => {
    const scheduler = new DbWriteScheduler()
    const busyError = sqliteBusyError()
    const listener = vi.fn()
    const dispose = setSqliteRetryExhaustedListener(listener)
    let calls = 0

    try {
      await expect(
        scheduler.schedule(
          'scheduler-test.busy-no-retry',
          async () => {
            calls += 1
            throw busyError
          },
          { busyRetries: 0 }
        )
      ).rejects.toBe(busyError)
    } finally {
      dispose()
    }

    expect(calls).toBe(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('队列仅剩退避中的任务时由内部定时器唤醒，无需外部 kick', async () => {
    const scheduler = new DbWriteScheduler()
    let calls = 0
    const startedAt = Date.now()

    const result = await scheduler.schedule(
      'scheduler-test.busy-idle-wake',
      async () => {
        calls += 1
        if (calls === 1) throw sqliteBusyError()
        return 'ok'
      },
      { busyRetries: 2, busyBaseDelayMs: 15, busyMaxDelayMs: 60 }
    )

    expect(result).toBe('ok')
    expect(calls).toBe(2)
    // The retry only ran after the parked backoff elapsed (jittered ±20%).
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(10)
  })

  it('drain 在任务处于退避停靠时不提前完成', async () => {
    const scheduler = new DbWriteScheduler()
    let calls = 0

    const task = scheduler.schedule(
      'scheduler-test.busy-drain',
      async () => {
        calls += 1
        if (calls === 1) throw sqliteBusyError()
        return calls
      },
      { busyRetries: 2, busyBaseDelayMs: 15, busyMaxDelayMs: 60 }
    )

    await scheduler.drain()
    expect(calls).toBe(2)
    await expect(task).resolves.toBe(2)
  })

  it('任务上下文内的嵌套 schedule 仍直接执行（可重入性不变）', async () => {
    const scheduler = new DbWriteScheduler()
    const order: string[] = []

    const result = await scheduler.schedule('scheduler-test.outer', async () => {
      order.push('outer:start')
      const inner = await scheduler.schedule('scheduler-test.inner', async () => {
        order.push('inner')
        return 42
      })
      order.push('outer:end')
      return inner
    })

    expect(result).toBe(42)
    expect(order).toEqual(['outer:start', 'inner', 'outer:end'])
  })

})

// Phase 3 lane split: the pre-split test asserting "lane is accepted but
// changes no behavior" (aux queued behind primary) is superseded by this block.
describe('DbWriteScheduler per-file lanes', () => {
  it('primary 任务处于 busy 退避停靠时，aux 任务照常执行（无跨 lane 阻塞）', async () => {
    const scheduler = new DbWriteScheduler()
    const order: string[] = []
    let primaryCalls = 0

    // busyBaseDelayMs: 60 → first backoff is ≥48ms even with -20% jitter, so
    // the assertions below run while the primary task is still parked.
    const primary = scheduler.schedule(
      'lane-test.primary-busy',
      async () => {
        primaryCalls += 1
        if (primaryCalls === 1) throw sqliteBusyError()
        order.push('primary:success')
        return 'primary'
      },
      { lane: 'primary', busyRetries: 2, busyBaseDelayMs: 60, busyMaxDelayMs: 120 }
    )

    await sleep(10)
    // The primary task failed once and is parked in its lane (queued, not
    // executing, loop released).
    expect(primaryCalls).toBe(1)
    const parked = scheduler.getStats()
    expect(parked.lanes.primary.queued).toBe(1)
    expect(parked.lanes.primary.processing).toBe(false)

    const aux = scheduler.schedule(
      'lane-test.aux-during-backoff',
      async () => {
        order.push('aux:success')
        return 'aux'
      },
      { lane: 'aux' }
    )

    await expect(aux).resolves.toBe('aux')
    // Aux completed while the primary task was still parked for backoff.
    expect(order).toEqual(['aux:success'])
    expect(primaryCalls).toBe(1)

    await expect(primary).resolves.toBe('primary')
    expect(order).toEqual(['aux:success', 'primary:success'])
    expect(primaryCalls).toBe(2)
  })

  it('两条 lane 并发执行：aux 任务在 primary 任务执行期间完整运行（事件序证明交错）', async () => {
    const scheduler = new DbWriteScheduler()
    const order: string[] = []

    const primaryGate = createGate()
    const primary = scheduler.schedule(
      'lane-test.primary-hold',
      async () => {
        order.push('primary:start')
        await primaryGate.wait
        order.push('primary:end')
        return 'primary'
      },
      { lane: 'primary' }
    )

    const auxGate = createGate()
    const aux = scheduler.schedule(
      'lane-test.aux-interleaved',
      async () => {
        order.push('aux:start')
        await auxGate.wait
        order.push('aux:end')
        return 'aux'
      },
      { lane: 'aux' }
    )

    await sleep(20)
    // Both lanes picked up their task concurrently: aux started while the
    // primary task was (and still is) mid-execution.
    expect(order).toEqual(['primary:start', 'aux:start'])

    auxGate.release()
    await expect(aux).resolves.toBe('aux')
    expect(order).toEqual(['primary:start', 'aux:start', 'aux:end'])

    primaryGate.release()
    await expect(primary).resolves.toBe('primary')
    expect(order).toEqual(['primary:start', 'aux:start', 'aux:end', 'primary:end'])
  })

  it('drain 需等待两条 lane 全部清空（含 busy 退避停靠中的任务）', async () => {
    const scheduler = new DbWriteScheduler()
    let auxCalls = 0
    let primaryDone = false

    const aux = scheduler.schedule(
      'lane-test.aux-busy-drain',
      async () => {
        auxCalls += 1
        if (auxCalls === 1) throw sqliteBusyError()
        return auxCalls
      },
      { lane: 'aux', busyRetries: 2, busyBaseDelayMs: 15, busyMaxDelayMs: 60 }
    )
    const primary = scheduler.schedule(
      'lane-test.primary-quick',
      async () => {
        primaryDone = true
        return 'primary'
      },
      { lane: 'primary' }
    )

    await scheduler.drain()
    // Drain resolved only after the parked aux retry ran to completion.
    expect(auxCalls).toBe(2)
    expect(primaryDone).toBe(true)
    const stats = scheduler.getStats()
    expect(stats.queued).toBe(0)
    expect(stats.processing).toBe(false)
    expect(stats.lanes.primary.queued).toBe(0)
    expect(stats.lanes.aux.queued).toBe(0)
    await expect(aux).resolves.toBe(2)
    await expect(primary).resolves.toBe('primary')
  })

  it('latest_wins budgetKey 清扫仅丢弃同一 lane 内排队的任务', async () => {
    const scheduler = new DbWriteScheduler()

    // Hold both lanes so the budget-key tasks stay QUEUED (the sweep only
    // touches queued tasks, never the executing one).
    const primaryGate = createGate()
    const primaryHold = scheduler.schedule(
      'lane-test.primary-hold',
      async () => {
        await primaryGate.wait
      },
      { lane: 'primary' }
    )
    const auxGate = createGate()
    const auxHold = scheduler.schedule(
      'lane-test.aux-hold',
      async () => {
        await auxGate.wait
      },
      { lane: 'aux' }
    )

    const sharedBudget = {
      dropPolicy: 'latest_wins' as const,
      budgetKey: 'lane-test.shared-budget'
    }
    let staleRan = false
    const stalePrimary = scheduler.schedule(
      'lane-test.primary-stale',
      async () => {
        staleRan = true
        return 'stale'
      },
      { lane: 'primary', ...sharedBudget }
    )
    let auxSurvivorRan = false
    const auxSurvivor = scheduler.schedule(
      'lane-test.aux-survivor',
      async () => {
        auxSurvivorRan = true
        return 'aux'
      },
      { lane: 'aux', ...sharedBudget }
    )

    // Newest primary-lane task with the SAME budgetKey sweeps its own lane
    // only: the queued aux task must survive.
    const freshPrimary = scheduler.schedule('lane-test.primary-fresh', async () => 'fresh', {
      lane: 'primary',
      ...sharedBudget
    })

    await expect(stalePrimary).rejects.toThrow('latest_wins')
    expect(scheduler.getStats().lanes.aux.queued).toBe(1)

    auxGate.release()
    await expect(auxHold).resolves.toBeUndefined()
    await expect(auxSurvivor).resolves.toBe('aux')
    expect(auxSurvivorRan).toBe(true)
    expect(staleRan).toBe(false)

    primaryGate.release()
    await expect(primaryHold).resolves.toBeUndefined()
    await expect(freshPrimary).resolves.toBe('fresh')
  })

  it('getStats/getDetailedStats 聚合字段保持旧形状（sum/any/primary 优先），并提供 per-lane 细分', async () => {
    const scheduler = new DbWriteScheduler()

    const idleLane = {
      queued: 0,
      processing: false,
      currentTaskLabel: null,
      currentTaskPriority: null
    }
    const idle = scheduler.getStats()
    expect(idle).toEqual({
      queued: 0,
      processing: false,
      currentTaskLabel: null,
      currentTaskPriority: null,
      lanes: { primary: idleLane, aux: idleLane }
    })

    const primaryGate = createGate()
    const primaryHold = scheduler.schedule(
      'lane-test.stats-primary-hold',
      async () => {
        await primaryGate.wait
      },
      { lane: 'primary', priority: 'interactive' }
    )
    const auxGate = createGate()
    const auxHold = scheduler.schedule(
      'lane-test.stats-aux-hold',
      async () => {
        await auxGate.wait
      },
      { lane: 'aux', priority: 'background' }
    )
    const queuedPrimary = scheduler.schedule('lane-test.stats-primary-queued', async () => 'p2', {
      lane: 'primary'
    })
    const queuedAux = scheduler.schedule('lane-test.stats-aux-queued', async () => 'a2', {
      lane: 'aux'
    })

    const busy = scheduler.getStats()
    // Aggregates: queued = SUM across lanes, processing = ANY lane executing,
    // current task = the PRIMARY lane's while it has one.
    expect(busy.queued).toBe(2)
    expect(busy.processing).toBe(true)
    expect(busy.currentTaskLabel).toBe('lane-test.stats-primary-hold')
    expect(busy.currentTaskPriority).toBe('interactive')
    expect(busy.lanes.primary).toEqual({
      queued: 1,
      processing: true,
      currentTaskLabel: 'lane-test.stats-primary-hold',
      currentTaskPriority: 'interactive'
    })
    expect(busy.lanes.aux).toEqual({
      queued: 1,
      processing: true,
      currentTaskLabel: 'lane-test.stats-aux-hold',
      currentTaskPriority: 'background'
    })

    const detailed = scheduler.getDetailedStats()
    expect(detailed.queued).toBe(2)
    // Both queued tasks fall back to the default 'background' label policy.
    expect(detailed.queuedByPriority.background).toBe(2)
    expect(detailed.processing).toBe(true)
    expect(detailed.currentTaskLabel).toBe('lane-test.stats-primary-hold')
    expect(detailed.currentTaskPriority).toBe('interactive')
    expect(detailed.lanes).toEqual(busy.lanes)

    // Once the primary lane empties, the aggregate current task falls back to
    // the aux lane's.
    primaryGate.release()
    await primaryHold
    await expect(queuedPrimary).resolves.toBe('p2')
    await sleep(10)
    const auxOnly = scheduler.getStats()
    expect(auxOnly.lanes.primary.processing).toBe(false)
    expect(auxOnly.lanes.primary.queued).toBe(0)
    expect(auxOnly.processing).toBe(true)
    expect(auxOnly.currentTaskLabel).toBe('lane-test.stats-aux-hold')
    expect(auxOnly.currentTaskPriority).toBe('background')

    auxGate.release()
    await auxHold
    await expect(queuedAux).resolves.toBe('a2')
    await scheduler.drain()
    expect(scheduler.getStats().processing).toBe(false)
    expect(scheduler.getStats().queued).toBe(0)
  })

  it('scheduleAuxWrite 端到端：真实 aux 句柄进入 aux lane，不排在 primary 拥堵之后', async () => {
    // Uses the SINGLETON scheduler (scheduleAuxWrite routes through it); the
    // gate + final drain leave it empty for other suites.
    const auxDb = { id: 'fake-aux-db' } as unknown as MainDatabase

    const primaryGate = createGate()
    const primaryHold = dbWriteScheduler.schedule(
      'lane-test.singleton-primary-hold',
      async () => {
        await primaryGate.wait
      },
      { lane: 'primary' }
    )

    let receivedDb: MainDatabase | null = null
    const aux = scheduleAuxWrite(
      'lane-test.singleton-aux-write',
      async (db) => {
        receivedDb = db
        return 'aux-done'
      },
      { resolveDb: () => ({ db: auxDb, isAux: true }) }
    )

    // The aux write resolves while the primary lane is still blocked: proof it
    // was enqueued into (and executed by) the aux lane.
    await expect(aux).resolves.toBe('aux-done')
    expect(receivedDb).toBe(auxDb)
    expect(dbWriteScheduler.getStats().lanes.primary.processing).toBe(true)

    primaryGate.release()
    await primaryHold
    await dbWriteScheduler.drain()
  })
})
