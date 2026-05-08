import { afterEach, describe, expect, it, vi } from 'vitest'
import { tryUseChannel, type TouchChannel } from '../renderer/hooks/use-channel'

describe('use-channel', () => {
  const previousTouchChannel = (globalThis as { touchChannel?: TouchChannel }).touchChannel
  const previousDollarTouchChannel = (globalThis as { $touchChannel?: TouchChannel }).$touchChannel
  const previousDollarChannel = (globalThis as { $channel?: TouchChannel }).$channel

  afterEach(() => {
    const globalObj = globalThis as {
      touchChannel?: TouchChannel
      $touchChannel?: TouchChannel
      $channel?: TouchChannel
    }

    if (previousTouchChannel) globalObj.touchChannel = previousTouchChannel
    else delete globalObj.touchChannel

    if (previousDollarTouchChannel) globalObj.$touchChannel = previousDollarTouchChannel
    else delete globalObj.$touchChannel

    if (previousDollarChannel) globalObj.$channel = previousDollarChannel
    else delete globalObj.$channel

    vi.restoreAllMocks()
  })

  it('resolves a global channel outside Vue setup without triggering inject warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const channel: TouchChannel = {
      send: vi.fn()
    }

    ;(globalThis as { touchChannel?: TouchChannel }).touchChannel = channel

    expect(tryUseChannel()).toBe(channel)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
