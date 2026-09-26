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
  dispose: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  getRecognitionStatus: vi.fn(),
  getSpeechModelProgress: vi.fn(),
  installSpeechModel: vi.fn(),
  projectSpeechCatalogApiError: vi.fn(),
  // A machine with nothing installed: the module's route adoption then has nothing to do, which is
  // what this suite is not about.
  installedSpeechModels: vi.fn<() => Promise<Array<{ id: string }>>>(async () => []),
  speechModelCatalogView: vi.fn(),
  uninstallSpeechModel: vi.fn(),
  ensureLocalAsrRoute: vi.fn(),
  ensureNexusAsrRoute: vi.fn()
}))

vi.mock('../ai/intelligence-config', () => ({
  ensureLocalAsrRoute: mocks.ensureLocalAsrRoute,
  ensureNexusAsrRoute: mocks.ensureNexusAsrRoute
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
  getRecognitionStatus: mocks.getRecognitionStatus,
  getVoiceRecognitionLocation: vi.fn(() => 'cloud')
}))
vi.mock('./speech-model-service', () => ({
  getSpeechModelProgress: mocks.getSpeechModelProgress,
  installSpeechModel: mocks.installSpeechModel,
  installedSpeechModels: mocks.installedSpeechModels,
  projectSpeechCatalogApiError: mocks.projectSpeechCatalogApiError,
  speechModelCatalogView: mocks.speechModelCatalogView,
  uninstallSpeechModel: mocks.uninstallSpeechModel
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

/** A transport context for a main-owned (non-plugin) caller, the shape these handlers receive. */
function hostContext(): StreamTestContext {
  return {
    signal: new AbortController().signal,
    isCancelled: () => false,
    emit: vi.fn(),
    end: vi.fn(),
    error: vi.fn()
  }
}

describe('VoiceModule speech model route adoption', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  /** Registers the module and waits out the launch adoption, so a case reads only its own calls. */
  async function registerModuleAfterAdoption(): Promise<VoiceModule> {
    const module = registerModule()
    await eventually(() => {
      expect(mocks.ensureLocalAsrRoute).toHaveBeenCalled()
    })
    mocks.ensureLocalAsrRoute.mockClear()
    return module
  }

  it('re-adopts the route with the downloaded model once the install resolves', async () => {
    const installGate = Promise.withResolvers<{
      id: string
      version: string
      bytes: number
      reused: number
      downloaded: number
    }>()
    mocks.installSpeechModel.mockReturnValue(installGate.promise)
    mocks.installedSpeechModels.mockImplementation(async () => [{ id: 'sense-voice-small' }])

    const module = await registerModuleAfterAdoption()
    const handler = mocks.handlers.get(voiceApiEvents.installSpeechModel.toEventName())
    if (!handler) throw new Error('Missing speech model install handler')

    const installTask = handler({ id: 'sense-voice-small', version: '1.0.0' }, hostContext())
    await eventually(() => {
      expect(mocks.installSpeechModel).toHaveBeenCalledWith('sense-voice-small', '1.0.0')
    })
    // The store has not changed yet, so there is nothing new to route.
    expect(mocks.ensureLocalAsrRoute).not.toHaveBeenCalled()

    installGate.resolve({
      id: 'sense-voice-small',
      version: '1.0.0',
      bytes: 1,
      reused: 0,
      downloaded: 1
    })
    await installTask

    expect(mocks.ensureLocalAsrRoute).toHaveBeenCalledWith(['sense-voice-small'])
    await module.onDestroy()
  })

  it('re-adopts the route once the removal resolves so the gone model is unbound', async () => {
    const removalGate = Promise.withResolvers<boolean>()
    mocks.uninstallSpeechModel.mockReturnValue(removalGate.promise)
    mocks.installedSpeechModels.mockImplementation(async () => [])

    const module = await registerModuleAfterAdoption()
    const handler = mocks.handlers.get(voiceApiEvents.uninstallSpeechModel.toEventName())
    if (!handler) throw new Error('Missing speech model removal handler')

    const removalTask = handler({ id: 'sense-voice-small', version: '1.0.0' }, hostContext())
    await eventually(() => {
      expect(mocks.uninstallSpeechModel).toHaveBeenCalledWith('sense-voice-small', '1.0.0')
    })
    expect(mocks.ensureLocalAsrRoute).not.toHaveBeenCalled()

    removalGate.resolve(true)
    await removalTask

    expect(mocks.ensureLocalAsrRoute).toHaveBeenCalledWith([])
    await module.onDestroy()
  })
})
