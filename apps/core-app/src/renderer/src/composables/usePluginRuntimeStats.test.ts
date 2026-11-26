import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

const { getRuntimeStatsMock } = vi.hoisted(() => ({
  getRuntimeStatsMock: vi.fn()
}))

vi.mock('~/modules/sdk/plugin-sdk', () => ({
  pluginSDK: {
    getRuntimeStats: getRuntimeStatsMock
  }
}))

import { usePluginRuntimeStats } from './usePluginRuntimeStats'

function makeStats(requestCount: number) {
  return {
    startedAt: 1_000,
    uptimeMs: 5_000,
    requestCount,
    lastActiveAt: 6_000,
    workers: {
      threadCount: 1,
      uiProcessCount: 0,
      windowCount: 0,
      cachedViewCount: 0,
      divisionBoxViewCount: 0
    },
    usage: {
      memoryBytes: 1024,
      cpuPercent: 1.5
    }
  }
}

describe('usePluginRuntimeStats visibility gating', () => {
  let docTarget: EventTarget & { hidden: boolean }
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    getRuntimeStatsMock.mockReset()
    let seq = 0
    getRuntimeStatsMock.mockImplementation(async () => makeStats(++seq))

    docTarget = Object.assign(new EventTarget(), { hidden: false })
    addEventListenerSpy = vi.spyOn(docTarget, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(docTarget, 'removeEventListener')

    vi.stubGlobal('document', docTarget)
    vi.stubGlobal('window', {
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis)
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('pauses 1 Hz polling when document becomes hidden, resumes without duplicates when visible, and cleans up on release', async () => {
    const pluginName = ref('demo-plugin')
    const scope = effectScope()
    let result: ReturnType<typeof usePluginRuntimeStats> | undefined

    scope.run(() => {
      result = usePluginRuntimeStats(pluginName, { intervalMs: 1_000 })
    })

    await Promise.resolve()
    await nextTick()
    expect(getRuntimeStatsMock).toHaveBeenCalledTimes(1)
    expect(result?.stats.value?.requestCount).toBe(1)

    await vi.advanceTimersByTimeAsync(2_000)
    expect(getRuntimeStatsMock).toHaveBeenCalledTimes(3)

    // Hide document -> interval cleared, zero IPC calls while hidden.
    docTarget.hidden = true
    docTarget.dispatchEvent(new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(getRuntimeStatsMock).toHaveBeenCalledTimes(3)

    // Show document (duplicate visibility events must not create duplicate timers).
    docTarget.hidden = false
    docTarget.dispatchEvent(new Event('visibilitychange'))
    docTarget.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    expect(getRuntimeStatsMock).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(getRuntimeStatsMock).toHaveBeenCalledTimes(5)

    // Releasing plugin name drops refCount to 0 -> clears interval & removes visibility listener.
    pluginName.value = ''
    await nextTick()
    scope.stop()

    expect(vi.getTimerCount()).toBe(0)
    expect(addEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})
