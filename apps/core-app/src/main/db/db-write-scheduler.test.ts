import { describe, expect, it, vi } from 'vitest'
import { DbWriteScheduler } from './db-write-scheduler'
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

  it('lane 选项当前仅被接受存储，不改变任何执行行为（Phase 3 激活）', async () => {
    const scheduler = new DbWriteScheduler()
    const order: string[] = []

    const primaryGate = createGate()
    const primary = scheduler.schedule(
      'scheduler-test.lane-primary',
      async () => {
        order.push('primary:start')
        await primaryGate.wait
        order.push('primary:end')
        return 'primary'
      },
      { lane: 'primary' }
    )

    // Aux 任务仍与 primary 任务共用同一队列/单写循环：在 Phase 3 之前，
    // 传 lane 不得产生并行执行或任何排序差异。
    const aux = scheduler.schedule(
      'scheduler-test.lane-aux',
      async () => {
        order.push('aux')
        return 'aux'
      },
      { lane: 'aux' }
    )

    await sleep(20)
    expect(order).toEqual(['primary:start'])

    primaryGate.release()
    await expect(primary).resolves.toBe('primary')
    await expect(aux).resolves.toBe('aux')
    expect(order).toEqual(['primary:start', 'primary:end', 'aux'])
  })
})
