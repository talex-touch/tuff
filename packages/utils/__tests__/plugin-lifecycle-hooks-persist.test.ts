/**
 * Three defects in one file, all in the same registration block:
 *
 * - #858 the signal listener ran `delete sdk.__hooks[type]`, so every lifecycle hook was
 *   one-shot. The second activate signal found no hooks and silently did nothing.
 * - #860 the listener was attached whenever `hooks.length === 0` and the unsubscribe function was
 *   thrown away. Combined with the delete above, each re-registration attached *another* listener
 *   for the same signal and none could be detached.
 * - #859 the JSDoc promised `if return false, the plugin will not be activated`, which the
 *   protocol cannot deliver - see the last test.
 *
 * #860 is caused by #858: fix the delete and the array never empties, so the old guard stops
 * misfiring. The guard is still replaced by an explicit registry, because "a listener is attached"
 * and "the hook array is non-empty" agreeing was an accident, not a design.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { injectHook, LifecycleHooks } from '../plugin/sdk/hooks/life-cycle'

const mocks = vi.hoisted(() => ({
  /** eventName -> listeners attached through transport.on */
  listeners: new Map<string, ((data: unknown) => unknown)[]>(),
  dispose: vi.fn(),
  sdk: { hooks: {}, __hooks: {} } as Record<string, unknown>,
}))

vi.mock('../plugin/sdk/channel', () => ({
  ensureRendererChannel: () => ({ send: vi.fn(), regChannel: vi.fn() }),
}))

vi.mock('../plugin/sdk/touch-sdk', () => ({
  useTouchSDK: () => mocks.sdk,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: () => ({
    on: (event: { toEventName: () => string }, handler: (data: unknown) => unknown) => {
      const name = event.toEventName()
      mocks.listeners.set(name, [...(mocks.listeners.get(name) ?? []), handler])
      return mocks.dispose
    },
    send: vi.fn(),
  }),
}))

/** Delivers one lifecycle signal to every listener attached for that type. */
function signal(type: LifecycleHooks, data: unknown = { at: 1 }): unknown[] {
  const name = eventNameFor(type)
  return (mocks.listeners.get(name) ?? []).map(listener => listener(data))
}

function eventNameFor(type: LifecycleHooks): string {
  return [...mocks.listeners.keys()].find(key => key.includes(SIGNAL_FRAGMENT[type])) ?? ''
}

const SIGNAL_FRAGMENT: Record<LifecycleHooks, string> = {
  [LifecycleHooks.ENABLE]: 'enabled',
  [LifecycleHooks.DISABLE]: 'disabled',
  [LifecycleHooks.ACTIVE]: 'active',
  [LifecycleHooks.INACTIVE]: 'inactive',
  [LifecycleHooks.CRASH]: 'crash',
}

function listenerCount(type: LifecycleHooks): number {
  return (mocks.listeners.get(eventNameFor(type)) ?? []).length
}

describe('lifecycle hooks survive the first signal', () => {
  beforeEach(() => {
    mocks.listeners.clear()
    mocks.dispose.mockClear()
    mocks.sdk = { hooks: {}, __hooks: {} }
  })

  it('第一次信号就会触发(否则下面几条会掩盖"从来不触发")', () => {
    const hook = vi.fn()
    injectHook(LifecycleHooks.ACTIVE, hook)

    signal(LifecycleHooks.ACTIVE)

    expect(hook).toHaveBeenCalledTimes(1)
  })

  it('第二、第三次信号同样触发,钩子不再是一次性的 (#858)', () => {
    const hook = vi.fn()
    injectHook(LifecycleHooks.ACTIVE, hook)

    signal(LifecycleHooks.ACTIVE)
    signal(LifecycleHooks.ACTIVE)
    signal(LifecycleHooks.ACTIVE)

    expect(hook).toHaveBeenCalledTimes(3)
  })

  it('信号送达后钩子数组仍在,没有被删掉 (#858)', () => {
    injectHook(LifecycleHooks.ACTIVE, vi.fn())

    signal(LifecycleHooks.ACTIVE)

    expect((mocks.sdk.__hooks as Record<string, unknown[]>)[LifecycleHooks.ACTIVE]).toHaveLength(1)
  })

  it('同一类型反复注册只挂一个 transport listener (#860)', () => {
    injectHook(LifecycleHooks.ACTIVE, vi.fn())
    signal(LifecycleHooks.ACTIVE)
    injectHook(LifecycleHooks.ACTIVE, vi.fn())
    signal(LifecycleHooks.ACTIVE)
    injectHook(LifecycleHooks.ACTIVE, vi.fn())

    expect(listenerCount(LifecycleHooks.ACTIVE)).toBe(1)
  })

  it('注册两次后两个钩子都会被调用(否则上一条会被"只留一个钩子"蒙混过去)', () => {
    const first = vi.fn()
    const second = vi.fn()
    injectHook(LifecycleHooks.ACTIVE, first)
    injectHook(LifecycleHooks.ACTIVE, second)

    signal(LifecycleHooks.ACTIVE)

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  // The invariant the registry buys, stated directly. With #858 fixed the hook array never
  // empties on its own, so `hooks.length === 0` happens to behave identically on every path -
  // it is equivalent by coincidence, not by design. This is the case where they diverge.
  it('钩子数组被清空后再注册,仍然只有一个 listener (#860)', () => {
    injectHook(LifecycleHooks.ACTIVE, vi.fn())
    ;(mocks.sdk.__hooks as Record<string, unknown[]>)[LifecycleHooks.ACTIVE] = []
    injectHook(LifecycleHooks.ACTIVE, vi.fn())

    expect(listenerCount(LifecycleHooks.ACTIVE)).toBe(1)
  })

  it('不同生命周期类型各自有自己的 listener,不会被合并成一个', () => {
    injectHook(LifecycleHooks.ACTIVE, vi.fn())
    injectHook(LifecycleHooks.INACTIVE, vi.fn())

    expect(listenerCount(LifecycleHooks.ACTIVE)).toBe(1)
    expect(listenerCount(LifecycleHooks.INACTIVE)).toBe(1)
  })

  it('某个钩子抛错不影响其它钩子,也不打断信号', () => {
    const healthy = vi.fn()
    injectHook(LifecycleHooks.ACTIVE, () => {
      throw new Error('hook blew up')
    })
    injectHook(LifecycleHooks.ACTIVE, healthy)

    expect(() => signal(LifecycleHooks.ACTIVE)).not.toThrow()
    expect(healthy).toHaveBeenCalledTimes(1)
  })

  // Pins the corrected contract from #859, not a permanent ban on the feature: the main process
  // sends active/inactive through broadcastPlugin, typed TuffEvent<TReq, void> with no reply
  // channel, and sets PluginStatus.ACTIVE before signalling. There is nothing for a veto to
  // reach. Implementing one means changing the signal and the main-side gate - and this test.
  it('钩子返回 false 不构成否决,回复仍是 true (#859)', () => {
    injectHook(LifecycleHooks.ACTIVE, () => false as unknown as void)

    expect(signal(LifecycleHooks.ACTIVE)).toEqual([true])
  })
})
