import { describe, expect, it } from 'vitest'
import { DbWriteScheduler } from './db-write-scheduler'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

    const runBusy = () =>
      scheduler.schedule(
        'analytics.snapshots',
        async () => {
          throw busyError
        },
        {
          priority: 'best_effort',
          maxBusyFailures: 2,
          circuitOpenMs: 1200
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
})
