import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageList } from '@talex-touch/utils'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { OmniPanelGlobalKeyEvent, OmniPanelGlobalKeyListener } from '../omni-panel'

const mocks = vi.hoisted(() => ({
  getMainConfig: vi.fn(),
  subscribeMainConfig: vi.fn(),
  registerGlobalKeyListener: vi.fn(),
  disposeGlobalKeyListener: vi.fn(),
  unsubscribeSettings: vi.fn()
}))

vi.mock('../omni-panel', () => ({
  omniPanelModule: {
    registerGlobalKeyListener: mocks.registerGlobalKeyListener
  }
}))

vi.mock('../storage', () => ({
  getMainConfig: mocks.getMainConfig,
  subscribeMainConfig: mocks.subscribeMainConfig
}))

import { CommandVoiceGestureController } from './command-gesture'

const primaryModifier: OmniPanelGlobalKeyEvent = {
  key: 'primary-modifier',
  keycode: 55
}

function setting(enabled: boolean): AppSetting {
  return {
    assistant: { enabled },
    floatingBall: { enabled },
    voiceWake: { enabled }
  } as AppSetting
}

describe('command voice gesture', () => {
  let settingsListener: ((value: AppSetting) => void) | undefined
  let globalKeyListener: OmniPanelGlobalKeyListener | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    settingsListener = undefined
    globalKeyListener = undefined

    mocks.getMainConfig.mockReturnValue(setting(false))
    mocks.subscribeMainConfig.mockImplementation(
      (_key: string, callback: (value: AppSetting) => void) => {
        settingsListener = callback
        return mocks.unsubscribeSettings
      }
    )
    mocks.registerGlobalKeyListener.mockImplementation((listener: OmniPanelGlobalKeyListener) => {
      globalKeyListener = listener
      return mocks.disposeGlobalKeyListener
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not register a global listener when the required settings are disabled', () => {
    const sink = vi.fn()
    const controller = new CommandVoiceGestureController(sink)

    controller.register()

    expect(mocks.getMainConfig).toHaveBeenCalledWith(StorageList.APP_SETTING)
    expect(mocks.subscribeMainConfig).toHaveBeenCalledWith(
      StorageList.APP_SETTING,
      expect.any(Function)
    )
    expect(mocks.registerGlobalKeyListener).not.toHaveBeenCalled()

    controller.unregister()
  })

  it('registers a listener when assistant, floating ball, and voice wake are enabled', () => {
    mocks.getMainConfig.mockReturnValue(setting(true))
    const controller = new CommandVoiceGestureController(vi.fn())

    controller.register()

    expect(mocks.registerGlobalKeyListener).toHaveBeenCalledTimes(1)
    expect(globalKeyListener).toEqual({
      onKeyDown: expect.any(Function),
      onKeyUp: expect.any(Function)
    })

    controller.unregister()
  })

  it('alternates tap gestures between toggle start and stop', () => {
    mocks.getMainConfig.mockReturnValue(setting(true))
    const sink = vi.fn()
    const controller = new CommandVoiceGestureController(sink)
    controller.register()

    globalKeyListener?.onKeyDown?.(primaryModifier)
    globalKeyListener?.onKeyUp?.(primaryModifier)
    globalKeyListener?.onKeyDown?.(primaryModifier)
    globalKeyListener?.onKeyUp?.(primaryModifier)

    expect(sink.mock.calls).toEqual([
      [{ action: 'start', mode: 'toggle', source: 'command' }],
      [{ action: 'stop', mode: 'toggle', source: 'command' }]
    ])

    controller.unregister()
  })

  it('starts a hold only after the threshold and stops it on keyup', () => {
    mocks.getMainConfig.mockReturnValue(setting(true))
    const sink = vi.fn()
    const controller = new CommandVoiceGestureController(sink)
    controller.register()

    globalKeyListener?.onKeyDown?.(primaryModifier)
    vi.advanceTimersByTime(319)
    expect(sink).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(sink).toHaveBeenCalledWith({ action: 'start', mode: 'hold', source: 'command' })

    globalKeyListener?.onKeyUp?.(primaryModifier)
    expect(sink).toHaveBeenLastCalledWith({ action: 'stop', mode: 'hold', source: 'command' })
    expect(sink).toHaveBeenCalledTimes(2)

    controller.unregister()
  })

  it('ignores repeated keydown while the modifier is held', () => {
    mocks.getMainConfig.mockReturnValue(setting(true))
    const sink = vi.fn()
    const controller = new CommandVoiceGestureController(sink)
    controller.register()

    globalKeyListener?.onKeyDown?.(primaryModifier)
    vi.advanceTimersByTime(200)
    globalKeyListener?.onKeyDown?.(primaryModifier)
    vi.advanceTimersByTime(120)

    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledWith({ action: 'start', mode: 'hold', source: 'command' })

    globalKeyListener?.onKeyUp?.(primaryModifier)
    expect(sink).toHaveBeenLastCalledWith({ action: 'stop', mode: 'hold', source: 'command' })

    controller.unregister()
  })

  it('stops an active gesture and disposes the listener when unregistered', () => {
    mocks.getMainConfig.mockReturnValue(setting(true))
    const sink = vi.fn()
    const controller = new CommandVoiceGestureController(sink)
    controller.register()

    globalKeyListener?.onKeyDown?.(primaryModifier)
    globalKeyListener?.onKeyUp?.(primaryModifier)
    controller.unregister()
    controller.unregister()

    expect(sink.mock.calls).toEqual([
      [{ action: 'start', mode: 'toggle', source: 'command' }],
      [{ action: 'stop', mode: 'toggle', source: 'command' }]
    ])
    expect(mocks.disposeGlobalKeyListener).toHaveBeenCalledTimes(1)
    expect(mocks.unsubscribeSettings).toHaveBeenCalledTimes(1)
  })

  it('stops an active gesture and disposes the listener when settings are disabled', () => {
    mocks.getMainConfig.mockReturnValue(setting(true))
    const sink = vi.fn()
    const controller = new CommandVoiceGestureController(sink)
    controller.register()

    globalKeyListener?.onKeyDown?.(primaryModifier)
    globalKeyListener?.onKeyUp?.(primaryModifier)
    settingsListener?.(setting(false))

    expect(sink.mock.calls).toEqual([
      [{ action: 'start', mode: 'toggle', source: 'command' }],
      [{ action: 'stop', mode: 'toggle', source: 'command' }]
    ])
    expect(mocks.disposeGlobalKeyListener).toHaveBeenCalledTimes(1)

    globalKeyListener?.onKeyDown?.(primaryModifier)
    globalKeyListener?.onKeyUp?.(primaryModifier)
    expect(sink).toHaveBeenCalledTimes(2)

    controller.unregister()
  })
})
