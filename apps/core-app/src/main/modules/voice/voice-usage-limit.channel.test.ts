/**
 * A12 for voice, through the voice module's own channel registration and the real SDK: with the
 * daily request limit used up, recognition and speech are refused by the SDK's usage gate, and each
 * voice channel answers the app's own renderer with the code and the reason — which limit, when it
 * resets — while a plugin gets the code alone. Before this, dictate, retry and speak answered the
 * one public sentence, and the live stream carried the bare code with no reset time.
 *
 * The limit lives in the real quota manager on a migrated libSQL file and the day's usage in the
 * real ledger table (`usage-limit-refusal.test-harness`); recognition goes through the real
 * buffered STT provider. Only native audio capture, Electron and the app-delivery side are stood
 * in for — the isolated app has no microphone to drive.
 */
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { StreamContext } from '@talex-touch/utils/transport/types'
import type { UsageLimitRefusalFixture } from '../ai/usage-ledger/usage-limit-refusal.test-harness'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { voiceApiEvents } from '@talex-touch/utils/transport/sdk/domains/voice'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../ai/intelligence-test-harness'
import * as nativeAudio from '@talex-touch/tuff-native/audio'
import { intelligenceCapabilityRegistry } from '../ai/intelligence-capability-registry'
import {
  closeUsageLimitRefusalDatabase,
  openUsageLimitRefusalDatabase,
  reachDailyRequestLimit
} from '../ai/usage-ledger/usage-limit-refusal.test-harness'
import { setUsageLimits } from '../ai/usage-ledger/usage-limits'
import { createBufferedSttVoiceProvider } from './buffered-stt-provider'
import { VoiceModule } from './voice-module'
import { getConfiguredAsrProvider } from './voice-provider-runtime'

let fixture: UsageLimitRefusalFixture | undefined

vi.mock('../database', () => ({
  databaseModule: {
    getDb: () => fixture?.db
  }
}))

// No permission runtime: a plugin call is let through (voice is not fail-closed), which is what
// lets the plugin half of each channel reach the SDK at all.
vi.mock('../permission/permission-module-ref', () => ({
  getPermissionModule: vi.fn(() => null)
}))

vi.mock('@talex-touch/tuff-native/audio', () => ({
  getNativeAudioSupport: vi.fn(() => ({ supported: true, platform: 'darwin' })),
  startCapture: vi.fn(async () => ({ sessionId: 'capture-1' })),
  pollCapture: vi.fn(),
  snapshotCapture: vi.fn(),
  stopCapture: vi.fn(),
  cancelCapture: vi.fn(),
  playAudio: vi.fn(),
  drainCapture: vi.fn(),
  typeText: vi.fn(() => ({ ok: true })),
  isAccessibilityTrusted: vi.fn(() => true)
}))

vi.mock('../clipboard', () => ({
  clipboardModule: { applyVoiceText: vi.fn() }
}))

vi.mock('../system/active-app', () => ({
  activeAppService: { getActiveApp: vi.fn(async () => null) }
}))

vi.mock('./voice-provider-runtime', () => ({
  getConfiguredAsrProvider: vi.fn(),
  getRecognitionStatus: vi.fn(() => ({})),
  getVoiceRecognitionLocation: vi.fn(() => 'cloud')
}))

vi.mock('./voice-insights-store', () => ({
  voiceInsightsStore: {
    recordSuccess: vi.fn(async () => undefined),
    recordPolishPass: vi.fn(async () => undefined),
    getInsights: vi.fn(),
    clearInsights: vi.fn()
  }
}))

vi.mock('./voice-recognition-store', () => ({
  voiceRecognitionStore: {
    initialize: vi.fn(),
    record: vi.fn(async () => undefined),
    list: vi.fn(async () => []),
    clear: vi.fn(async () => undefined)
  },
  subscribeVoiceRecognitionRecordMutations: vi.fn(() => () => undefined)
}))

vi.mock('./global-dictation', () => ({
  globalDictationController: { register: vi.fn(), unregister: vi.fn() }
}))

vi.mock('./command-gesture', () => ({
  CommandVoiceGestureController: class {
    register = vi.fn()
    unregister = vi.fn()
  },
  registerPlatformVoiceGesture: vi.fn()
}))

vi.mock('../assistant/module', () => ({
  assistantModule: { handleVoiceCommandGesture: vi.fn(), isVoiceCommandActive: vi.fn() }
}))

vi.mock('./speech-model-service', () => ({
  getSpeechModelProgress: vi.fn(),
  installSpeechModel: vi.fn(),
  installedSpeechModels: vi.fn(async () => []),
  projectSpeechCatalogApiError: vi.fn(),
  speechModelCatalogView: vi.fn(),
  uninstallSpeechModel: vi.fn()
}))

vi.mock('../abstract-base-module', () => ({
  BaseModule: class {
    constructor(_key: symbol) {}
  }
}))

type InvokeHandler = (payload: unknown, context: HandlerContext) => Promise<unknown>
type StreamHandler = (payload: unknown, context: StreamContext<unknown>) => Promise<void>

/** The voice channels, registered by the module's own channel code. */
function registerVoiceChannels() {
  const handlers = new Map<string, InvokeHandler>()
  const streams = new Map<string, StreamHandler>()
  const module = new VoiceModule() as unknown as {
    transport: unknown
    registerChannels: () => void
  }
  module.transport = {
    on: (event: { toEventName: () => string }, handler: InvokeHandler) => {
      handlers.set(event.toEventName(), handler)
      return () => handlers.delete(event.toEventName())
    },
    onStream: (event: { toEventName: () => string }, handler: StreamHandler) => {
      streams.set(event.toEventName(), handler)
      return () => streams.delete(event.toEventName())
    }
  }
  module.registerChannels()
  const invoke = (event: { toEventName: () => string }) => {
    const handler = handlers.get(event.toEventName())
    if (!handler) throw new Error(`${event.toEventName()} was not registered`)
    return handler
  }
  const stream = (event: { toEventName: () => string }) => {
    const handler = streams.get(event.toEventName())
    if (!handler) throw new Error(`${event.toEventName()} was not registered`)
    return handler
  }
  return { invoke, stream }
}

/** A live dictation stream's context: records what the channel emits, stops on request. */
function createStreamContext(plugin?: HandlerContext['plugin']) {
  const cancel = new AbortController()
  const stop = new AbortController()
  const errors: Array<Error & { code?: string }> = []
  const context = {
    emit: vi.fn(),
    error: (error: Error) => errors.push(error),
    end: vi.fn(),
    isCancelled: () => cancel.signal.aborted,
    signal: cancel.signal,
    stopSignal: stop.signal,
    streamId: 'usage-limit-stream',
    ...(plugin ? { plugin } : {})
  } as unknown as StreamContext<unknown>
  return { context, errors, stop: () => stop.abort() }
}

/** 16-bit mono PCM at a constant amplitude: speech, as far as the capture pump can tell. */
function pcm(samples = 3_200): Buffer {
  const buffer = Buffer.alloc(samples * 2)
  for (let index = 0; index < samples; index += 1) buffer.writeInt16LE(8_000, index * 2)
  return buffer
}

const HOST = {} as HandlerContext
const PLUGIN = {
  plugin: createTrustedTestPluginContext({
    name: 'voice-usage-limit-plugin',
    pluginInstanceId: 'voice-usage-limit-instance',
    uniqueKey: 'voice-usage-limit-key'
  })
} as HandlerContext

/** 2026-10-04 10:00 in Shanghai: the limit resets at the next local midnight. */
const NOW = Date.parse('2026-10-04T02:00:00.000Z')
const RESETS_AT_ISO = '2026-10-04T16:00:00.000Z'
const REASON = `The usage limit you set is reached (requestsPerDay: 1 / 1); it resets at 2026-10-05 00:00 local time (${RESETS_AT_ISO}).`
const originalTimeZone = process.env.TZ

const pollCapture = vi.mocked(nativeAudio.pollCapture)
const stopCapture = vi.mocked(nativeAudio.stopCapture)
const drainCapture = vi.mocked(
  (nativeAudio as unknown as { drainCapture: typeof nativeAudio.stopCapture }).drainCapture
)
const resolveAsrProvider = vi.mocked(getConfiguredAsrProvider)

beforeAll(async () => {
  process.env.TZ = 'Asia/Shanghai'
  fixture = await openUsageLimitRefusalDatabase()
}, 60_000)

beforeEach(async () => {
  process.env.TZ = 'Asia/Shanghai'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  intelligenceCapabilityRegistry.clear()
  for (const capability of [
    { id: 'audio.stt', type: IntelligenceCapabilityType.STT },
    { id: 'audio.tts', type: IntelligenceCapabilityType.TTS }
  ]) {
    intelligenceCapabilityRegistry.register({
      ...capability,
      name: capability.id,
      description: 'voice usage limit channel test',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
  }
  // The buffered route Nexus recognition takes: the real adapter over the real SDK's `audio.stt`.
  resolveAsrProvider.mockReturnValue({
    model: 'nexus-asr-test',
    location: 'cloud',
    mode: 'buffered',
    provider: createBufferedSttVoiceProvider({ providerId: 'nexus-test', model: 'nexus-asr-test' })
  } as unknown as ReturnType<typeof getConfiguredAsrProvider>)
  drainCapture.mockReturnValue({ pcm: pcm(), sampleRate: 16_000, channels: 1 } as never)
  stopCapture.mockReturnValue({
    audio: pcm(16_000),
    format: 'wav',
    sampleRate: 16_000,
    channels: 1,
    durationMs: 1_000,
    stoppedReason: 'silence'
  } as never)
  await reachDailyRequestLimit(fixture!, NOW)
})

afterEach(async () => {
  vi.useRealTimers()
  await setUsageLimits({})
})

afterAll(async () => {
  intelligenceCapabilityRegistry.clear()
  await closeUsageLimitRefusalDatabase(fixture)
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
}, 60_000)

describe('voice channels under the global usage limit', () => {
  it('voice:api:speak names the limit and its reset to the app, the code to a plugin', async () => {
    const speak = registerVoiceChannels().invoke(voiceApiEvents.speak)

    await expect(speak({ text: 'read this aloud', play: false }, HOST)).resolves.toEqual({
      ok: false,
      error: `[USAGE_LIMIT_REACHED:audio.tts] ${REASON}`,
      code: 'USAGE_LIMIT_REACHED'
    })
    await expect(speak({ text: 'read this aloud', play: false }, PLUGIN)).resolves.toEqual({
      ok: false,
      error: 'USAGE_LIMIT_REACHED'
    })
  })

  it('voice:api:dictate names the limit and its reset to the app, the code to a plugin', async () => {
    pollCapture.mockReturnValue({
      active: false,
      durationMs: 1_000,
      stoppedReason: 'silence'
    } as never)
    const dictate = registerVoiceChannels().invoke(voiceApiEvents.dictate)

    await expect(dictate({ maxDurationMs: 1_000 }, HOST)).resolves.toEqual({
      ok: false,
      error: `[USAGE_LIMIT_REACHED:audio.stt] ${REASON}`,
      code: 'USAGE_LIMIT_REACHED'
    })
    await expect(dictate({ maxDurationMs: 1_000 }, PLUGIN)).resolves.toEqual({
      ok: false,
      error: 'USAGE_LIMIT_REACHED'
    })
  })

  it('the live stream carries the reset time to the app, and the retry it offers is refused the same way', async () => {
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null } as never)
    const channels = registerVoiceChannels()
    const asrStream = channels.stream(voiceApiEvents.asrStream)

    const live = createStreamContext()
    const running = asrStream({}, live.context)
    await vi.waitFor(() => expect(drainCapture).toHaveBeenCalled(), { timeout: 5_000 })
    live.stop()
    await running

    expect(live.errors).toHaveLength(1)
    // VoicePanel and the Home dictation notice read the reset time out of this sentence.
    expect(live.errors[0]?.message).toBe(
      `[USAGE_LIMIT_REACHED] Usage limit reached: requestsPerDay; resets at ${RESETS_AT_ISO}`
    )
    expect(live.errors[0]?.code).toBe('USAGE_LIMIT_REACHED')

    // The failed session kept its audio for a retry (VoicePanel's 重试): refused again, and named.
    const retry = channels.invoke(voiceApiEvents.retryLastFailure)
    await expect(retry({}, HOST)).resolves.toEqual({
      ok: false,
      error: `[USAGE_LIMIT_REACHED] ${REASON}`,
      code: 'USAGE_LIMIT_REACHED'
    })
  })

  it('a plugin stream gets the code alone', async () => {
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null } as never)
    const asrStream = registerVoiceChannels().stream(voiceApiEvents.asrStream)

    const live = createStreamContext(PLUGIN.plugin)
    const running = asrStream({}, live.context)
    await vi.waitFor(() => expect(drainCapture).toHaveBeenCalled(), { timeout: 5_000 })
    live.stop()
    await running

    expect(live.errors.map((error) => [error.message, error.code])).toEqual([
      ['USAGE_LIMIT_REACHED', 'USAGE_LIMIT_REACHED']
    ])
  })
})
