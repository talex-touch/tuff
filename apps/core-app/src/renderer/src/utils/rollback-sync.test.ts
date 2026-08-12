/**
 * The agent-tools pill wrote the persisted flag and then called the main-process sync with `void`,
 * discarding both the result and any rejection. A failed sync left the pill reading `on` and
 * `aria-pressed="true"` across restarts while the tool gateway was shut, so every tool call the
 * model attempted failed (#835).
 *
 * These drive the policy directly: HomePage.vue has no mounting harness, and the rollback only
 * runs on a path that is awkward to reach by hand.
 */
import { describe, expect, it, vi } from 'vitest'

import { createRollbackSync } from './rollback-sync'

describe('createRollbackSync', () => {
  it('同步成功时不回滚,也不报错', async () => {
    const rollback = vi.fn()
    const onError = vi.fn()
    const run = createRollbackSync<boolean>({ sync: async () => undefined, rollback, onError })

    await run(true, false)

    expect(rollback).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('同步失败时回滚到写入前观察到的值', async () => {
    const rollback = vi.fn()
    const run = createRollbackSync<boolean>({
      sync: async () => {
        throw new Error('gateway port in use')
      },
      rollback,
      onError: vi.fn()
    })

    await run(true, false)

    expect(rollback).toHaveBeenCalledWith(false)
  })

  it('回滚用的是传入的旧值,而不是把新值取反', async () => {
    const rollback = vi.fn()
    const run = createRollbackSync<string>({
      sync: async () => {
        throw new Error('refused')
      },
      rollback,
      onError: vi.fn()
    })

    await run('next', 'observed-before')

    expect(rollback).toHaveBeenCalledWith('observed-before')
  })

  it('失败一定会上报,调用方才能记录原因', async () => {
    const failure = new Error('handler not registered')
    const onError = vi.fn()
    const run = createRollbackSync<boolean>({
      sync: async () => {
        throw failure
      },
      rollback: vi.fn(),
      onError
    })

    await run(true, false)

    expect(onError).toHaveBeenCalledWith(failure)
  })

  it('调用方永远拿不到 rejection —— 它是绑在事件处理器上的', async () => {
    const run = createRollbackSync<boolean>({
      sync: async () => {
        throw new Error('refused')
      },
      rollback: vi.fn(),
      onError: vi.fn()
    })

    await expect(run(true, false)).resolves.toBeUndefined()
  })

  it('较慢的失败不会覆盖之后已经成功的那次切换', async () => {
    const rollback = vi.fn()
    let failSlow: (() => void) | undefined
    let call = 0
    const run = createRollbackSync<boolean>({
      sync: () => {
        call += 1
        if (call === 1) {
          return new Promise((_resolve, reject) => {
            failSlow = () => reject(new Error('slow refusal'))
          })
        }
        return Promise.resolve(undefined)
      },
      rollback,
      onError: vi.fn()
    })

    const slow = run(true, false)
    await run(false, true)
    failSlow?.()
    await slow

    // The later toggle owns the state; the stale failure must not undo it.
    expect(rollback).not.toHaveBeenCalled()
  })

  it('被取代的失败仍然会上报(否则日志里会凭空少一次故障)', async () => {
    const onError = vi.fn()
    let failSlow: (() => void) | undefined
    let call = 0
    const run = createRollbackSync<boolean>({
      sync: () => {
        call += 1
        if (call === 1) {
          return new Promise((_resolve, reject) => {
            failSlow = () => reject(new Error('slow refusal'))
          })
        }
        return Promise.resolve(undefined)
      },
      rollback: vi.fn(),
      onError
    })

    const slow = run(true, false)
    await run(false, true)
    failSlow?.()
    await slow

    expect(onError).toHaveBeenCalledTimes(1)
  })
})
