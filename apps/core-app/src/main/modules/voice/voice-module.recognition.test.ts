import type { ModuleInitContext } from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { voiceApiEvents } from '@talex-touch/utils/transport/sdk/domains/voice'

interface StreamTestContext {
  plugin?: unknown
  signal: AbortSignal
  isCancelled: () => boolean
  emit: (event: unknown) => void
  end: () => void
  error: (error: Error) => void
}

type VoiceStreamHandler = (payload: unknown, context: StreamTestContext) => unknown

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, VoiceStreamHandler>(),
  on: vi.fn(),
  onStream: vi.fn(),
  transcribeFile: vi.fn(),
  getRecognitionStatus: vi.fn(),
  dispose: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn()
}))

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))
vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: vi.fn(() => ({
    transport: {
      on: mocks.on,
      onStream: mocks.onStream
    }
  }))
}))
vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))
vi.mock('../abstract-base-module', () => ({
  BaseModule: class {
    constructor(_key: symbol) {}
  }
}))
vi.mock('../permission/channel-guard', () => ({
  withPermission: vi.fn(
    (_options: unknown, callback: (payload: unknown, context: unknown) => unknown) => callback
  )
}))
vi.mock('../../utils/safe-handler', () => ({
  withPermissionSafeApi: vi.fn(
    (_options: unknown, callback: (payload: unknown, context: unknown) => unknown) => callback
  )
}))
vi.mock('./global-dictation', () => ({
  globalDictationController: { register: mocks.register, unregister: mocks.unregister }
}))
vi.mock('./voice-service', () => ({
  voiceService: {
    dictate: vi.fn(),
    transcribeUpload: vi.fn(),
    transcribeFile: mocks.transcribeFile,
    dispose: mocks.dispose,
    discardRecovery: vi.fn(),
    getRecoveryStatus: vi.fn(),
    retryLastFailure: vi.fn(),
    speak: vi.fn(),
    streamDictation: vi.fn()
  }
}))
vi.mock('./voice-provider-runtime', () => ({
  getRecognitionStatus: mocks.getRecognitionStatus
}))
vi.mock('./voice-insights-store', () => ({
  voiceInsightsStore: { getInsights: vi.fn(), clearInsights: vi.fn() }
}))
vi.mock('../assistant/module', () => ({
  assistantModule: { handleVoiceCommandGesture: vi.fn(), isVoiceCommandActive: vi.fn() }
}))
vi.mock('./command-gesture', () => ({
  CommandVoiceGestureController: class {
    register = mocks.register
    unregister = mocks.unregister
  },
  registerPlatformVoiceGesture: vi.fn()
}))

import { VoiceModule } from './voice-module'

function registerModule(): VoiceModule {
  mocks.on.mockImplementation(
    (event: { toEventName: () => string }, handler: VoiceStreamHandler) => {
      mocks.handlers.set(event.toEventName(), handler)
      return vi.fn()
    }
  )
  mocks.onStream.mockImplementation(
    (event: { toEventName: () => string }, handler: VoiceStreamHandler) => {
      mocks.handlers.set(event.toEventName(), handler)
      return vi.fn()
    }
  )
  const module = new VoiceModule()
  void module.onInit({} as ModuleInitContext<TalexEvents>)
  return module
}

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      if (attempt === 19) throw error
      await Promise.resolve()
    }
  }
}

describe('VoiceModule file transcription streams', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('keeps cancellation scoped to its sender and suppresses only that sender’s late result', async () => {
    const firstGate = Promise.withResolvers<void>()
    const secondGate = Promise.withResolvers<void>()
    mocks.transcribeFile
      .mockImplementationOnce(async function* () {
        yield { type: 'selected', name: 'first.m4a' }
        await firstGate.promise
        yield { type: 'result', text: 'first late result' }
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'selected', name: 'second.m4a' }
        await secondGate.promise
        yield { type: 'result', text: 'second result' }
      })
    const module = registerModule()
    const handler = mocks.handlers.get(voiceApiEvents.transcribeFile.toEventName())
    if (!handler) throw new Error('Missing file transcription stream handler')

    let firstCancelled = false
    const first = {
      signal: new AbortController().signal,
      isCancelled: () => firstCancelled,
      emit: vi.fn(),
      end: vi.fn(),
      error: vi.fn()
    }
    const second = {
      signal: new AbortController().signal,
      isCancelled: () => false,
      emit: vi.fn(),
      end: vi.fn(),
      error: vi.fn()
    }
    const firstTask = handler(undefined, first)
    const secondTask = handler(undefined, second)

    await eventually(() => {
      expect(first.emit).toHaveBeenCalledWith({ type: 'selected', name: 'first.m4a' })
      expect(second.emit).toHaveBeenCalledWith({ type: 'selected', name: 'second.m4a' })
    })
    firstCancelled = true
    firstGate.resolve()
    secondGate.resolve()
    await Promise.all([firstTask, secondTask])

    expect(first.emit).toHaveBeenCalledTimes(1)
    expect(second.emit).toHaveBeenCalledWith({ type: 'result', text: 'second result' })
    expect(second.end).toHaveBeenCalledOnce()
    await module.onDestroy()
  })

  it('rejects plugin file transcription before invoking the main-owned file picker', async () => {
    const module = registerModule()
    const handler = mocks.handlers.get(voiceApiEvents.transcribeFile.toEventName())
    if (!handler) throw new Error('Missing file transcription stream handler')
    const context = {
      plugin: { name: 'untrusted-plugin' },
      signal: new AbortController().signal,
      isCancelled: () => false,
      emit: vi.fn(),
      end: vi.fn(),
      error: vi.fn()
    }

    await handler(undefined, context)

    expect(mocks.transcribeFile).not.toHaveBeenCalled()
    expect(context.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'VOICE_RECOGNITION_HOST_ONLY' })
    )
    await module.onDestroy()
  })
})
