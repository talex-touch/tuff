import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'

const mocks = vi.hoisted(() => ({
  getMainConfig: vi.fn(),
  subscribeMainConfig: vi.fn(),
  unsubscribeSettings: vi.fn()
}))

vi.mock('../omni-panel', () => ({
  omniPanelModule: { registerGlobalKeyListener: vi.fn() }
}))

vi.mock('../storage', () => ({
  getMainConfig: mocks.getMainConfig,
  subscribeMainConfig: mocks.subscribeMainConfig
}))

import { CommandVoiceGestureController } from './command-gesture'

type VoiceGestureRegistrar = NonNullable<
  ConstructorParameters<typeof CommandVoiceGestureController>[2]
>
type VoiceGestureListener = Parameters<VoiceGestureRegistrar>[0]
type VoiceGestureSink = ConstructorParameters<typeof CommandVoiceGestureController>[0]
type VoiceSessionActiveReader = NonNullable<
  ConstructorParameters<typeof CommandVoiceGestureController>[1]
>

function setting(enabled: boolean): AppSetting {
  return {
    assistant: { enabled },
    floatingBall: { enabled },
    voiceWake: { enabled }
  } as AppSetting
}

describe('command voice gesture', () => {
  let settingsListener: ((value: AppSetting) => void) | undefined
  let globalKeyListener: VoiceGestureListener | undefined
  let registrar: VoiceGestureRegistrar

  function createController(
    sink: VoiceGestureSink,
    isVoiceSessionActive: VoiceSessionActiveReader = () => false
  ): CommandVoiceGestureController {
    return new CommandVoiceGestureController(sink, isVoiceSessionActive, registrar)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    settingsListener = undefined
    globalKeyListener = undefined
    registrar = (listener) => {
      globalKeyListener = listener
      return vi.fn()
    }
    mocks.getMainConfig.mockReturnValue(setting(false))
    mocks.subscribeMainConfig.mockImplementation(
      (_key: string, callback: (value: AppSetting) => void) => {
        settingsListener = callback
        return mocks.unsubscribeSettings
      }
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing while disabled, then responds after settings enable the gesture', () => {
    const sink = vi.fn()
    const controller = createController(sink)
    controller.register()

    expect(globalKeyListener).toBeUndefined()
    settingsListener?.(setting(true))
    globalKeyListener?.onKeyDown?.({})
    globalKeyListener?.onKeyUp?.({})

    expect(sink).toHaveBeenCalledWith({ action: 'start', mode: 'toggle', source: 'command' })
    controller.unregister()
  })

  it('uses the actual voice session state when toggling taps', () => {
    mocks.getMainConfig.mockReturnValue(setting(true))
    const sink = vi.fn()
    let voiceSessionActive = false
    const controller = createController(sink, () => voiceSessionActive)
    controller.register()

    globalKeyListener?.onKeyDown?.({})
    globalKeyListener?.onKeyUp?.({})
    voiceSessionActive = true
    globalKeyListener?.onKeyDown?.({})
    globalKeyListener?.onKeyUp?.({})
    voiceSessionActive = false
    globalKeyListener?.onKeyDown?.({})
    globalKeyListener?.onKeyUp?.({})

    expect(sink.mock.calls).toEqual([
      [{ action: 'start', mode: 'toggle', source: 'command' }],
      [{ action: 'stop', mode: 'toggle', source: 'command' }],
      [{ action: 'start', mode: 'toggle', source: 'command' }]
    ])
    controller.unregister()
  })

  it('does not toggle when another key participates before release', () => {
    mocks.getMainConfig.mockReturnValue(setting(true))
    const sink = vi.fn()
    const controller = createController(sink)
    controller.register()

    globalKeyListener?.onKeyDown?.({})
    globalKeyListener?.onOtherKeyDown?.()
    globalKeyListener?.onKeyUp?.({})
    vi.advanceTimersByTime(320)

    expect(sink).not.toHaveBeenCalled()
    controller.unregister()
  })

  it('starts push-to-talk at the threshold and stops on release', () => {
    mocks.getMainConfig.mockReturnValue(setting(true))
    const sink = vi.fn()
    const controller = createController(sink)
    controller.register()

    globalKeyListener?.onKeyDown?.({})
    vi.advanceTimersByTime(319)
    expect(sink).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(sink).toHaveBeenCalledWith({ action: 'start', mode: 'hold', source: 'command' })

    globalKeyListener?.onKeyUp?.({})
    expect(sink).toHaveBeenLastCalledWith({ action: 'stop', mode: 'hold', source: 'command' })
    controller.unregister()
  })

  it('stops a hold once when reset arrives and does not restart after reset', () => {
    mocks.getMainConfig.mockReturnValue(setting(true))
    const sink = vi.fn()
    const controller = createController(sink)
    controller.register()

    globalKeyListener?.onKeyDown?.({})
    vi.advanceTimersByTime(320)
    globalKeyListener?.onReset?.()
    globalKeyListener?.onKeyUp?.({})
    vi.advanceTimersByTime(320)

    expect(sink.mock.calls).toEqual([
      [{ action: 'start', mode: 'hold', source: 'command' }],
      [{ action: 'stop', mode: 'hold', source: 'command' }]
    ])
    controller.unregister()
  })

  it('ignores callbacks retained by a disposed registrar after a fresh listener replaces it', () => {
    mocks.getMainConfig.mockReturnValue(setting(true))
    const sink = vi.fn()
    const listeners: VoiceGestureListener[] = []
    registrar = (listener) => {
      listeners.push(listener)
      return vi.fn()
    }
    const controller = createController(sink)

    controller.register()
    const disposedListener = listeners[0]
    controller.unregister()
    controller.register()
    const currentListener = listeners[1]
    if (!disposedListener || !currentListener) throw new Error('gesture listeners not registered')

    disposedListener.onKeyDown?.({})
    disposedListener.onKeyUp?.({})
    expect(sink).not.toHaveBeenCalled()

    currentListener.onKeyDown?.({})
    currentListener.onKeyUp?.({})
    expect(sink).toHaveBeenCalledWith({ action: 'start', mode: 'toggle', source: 'command' })
    controller.unregister()
  })
})
