import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import {
  useIntelligence,
  useIntelligenceSdk,
  useIntelligenceStats,
} from '../renderer/hooks'

interface FakeInvokeResult<T = unknown> {
  result: T
  usage: Record<string, never>
  model: string
  latency: number
  traceId: string
  provider: string
}

type FakeSdkMethod = Mock

interface FakeIntelligenceSdk {
  invoke: FakeSdkMethod
  testProvider: FakeSdkMethod
  testCapability: FakeSdkMethod
  getCapabilityTestMeta: FakeSdkMethod
  chatLangChain: FakeSdkMethod
  ttsSpeak: FakeSdkMethod
  text: {
    classify: FakeSdkMethod
  }
  embedding: {
    generate: FakeSdkMethod
  }
  code: {
    generate: FakeSdkMethod
    explain: FakeSdkMethod
    review: FakeSdkMethod
    refactor: FakeSdkMethod
    debug: FakeSdkMethod
  }
  intent: {
    detect: FakeSdkMethod
  }
  sentiment: {
    analyze: FakeSdkMethod
  }
  content: {
    extract: FakeSdkMethod
  }
  keywords: {
    extract: FakeSdkMethod
  }
  vision: {
    ocr: FakeSdkMethod
  }
  image: {
    translateE2e: FakeSdkMethod
    edit: FakeSdkMethod
  }
  audio: {
    tts: FakeSdkMethod
    stt: FakeSdkMethod
    transcribe: FakeSdkMethod
  }
  workflow: {
    execute: FakeSdkMethod
  }
}

const mocks = vi.hoisted(() => ({
  sdk: undefined as FakeIntelligenceSdk | undefined,
  useIntelligenceSdk: vi.fn(() => {
    if (!mocks.sdk) {
      throw new Error('fake intelligence sdk was not installed')
    }
    return mocks.sdk
  }),
}))

vi.mock('../renderer/hooks/use-intelligence-sdk', () => ({
  useIntelligenceSdk: mocks.useIntelligenceSdk,
}))

const ok = <T>(result: T): FakeInvokeResult<T> => ({
  result,
  usage: {},
  model: 'test-model',
  latency: 7,
  traceId: 'trace-1',
  provider: 'test-provider',
})

const createFakeSdk = (): FakeIntelligenceSdk => ({
  invoke: vi.fn(async (_capabilityId: string, payload: unknown) => ok(payload)),
  testProvider: vi.fn(),
  testCapability: vi.fn(),
  getCapabilityTestMeta: vi.fn(),
  chatLangChain: vi.fn(),
  ttsSpeak: vi.fn(async payload => ({
    audio: 'data:audio/mp3;base64,AAAA',
    format: 'mp3',
    provider: 'test-provider',
    model: 'test-model',
    traceId: 'tts-legacy-trace',
    cacheHit: false,
    payload,
  })),
  text: {
    classify: vi.fn(async payload => ok({ predictions: [{ category: payload.categories[0], confidence: 0.93 }] })),
  },
  embedding: {
    generate: vi.fn(),
  },
  code: {
    generate: vi.fn(),
    explain: vi.fn(),
    review: vi.fn(),
    refactor: vi.fn(),
    debug: vi.fn(),
  },
  intent: {
    detect: vi.fn(async payload => ok({ intent: payload.possibleIntents?.[0] ?? 'unknown', confidence: 0.82, entities: [] })),
  },
  sentiment: {
    analyze: vi.fn(async payload => ok({ sentiment: payload.text.includes('rough') ? 'negative' : 'neutral', score: -0.5, confidence: 0.77 })),
  },
  content: {
    extract: vi.fn(async payload => ok({ entities: { people: payload.text.includes('Ada') ? [{ value: 'Ada', confidence: 0.91 }] : [] } })),
  },
  keywords: {
    extract: vi.fn(async payload => ok({ keywords: payload.text.split(' ').map((term: string) => ({ term, relevance: 0.5 })) })),
  },
  vision: {
    ocr: vi.fn(),
  },
  image: {
    translateE2e: vi.fn(async payload => ok({ translatedImageBase64: `${payload.imageBase64}-translated` })),
    edit: vi.fn(async payload => ok({ image: { base64: 'edited-image' }, revisedPrompt: payload.prompt })),
  },
  audio: {
    tts: vi.fn(async payload => ok({ audio: `spoken:${payload.text}`, format: payload.format ?? 'mp3' })),
    stt: vi.fn(async payload => ok({ text: `heard:${payload.audio}`, confidence: 0.88 })),
    transcribe: vi.fn(async payload => ok({ text: `transcribed:${payload.audio}`, language: payload.language ?? 'en', duration: 3 })),
  },
  workflow: {
    execute: vi.fn(async payload => ok({ workflowId: 'workflow-1', payload })),
  },
})

describe('renderer intelligence hook exports', () => {
  beforeEach(() => {
    mocks.sdk = createFakeSdk()
    mocks.useIntelligenceSdk.mockClear()
  })

  it('keeps intelligence composables available from the renderer hooks barrel', () => {
    expect(typeof useIntelligenceSdk).toBe('function')
    expect(typeof useIntelligence).toBe('function')
    expect(typeof useIntelligenceStats).toBe('function')
  })

  it('exposes current domain namespaces while preserving legacy compatibility aliases', () => {
    const intelligence = useIntelligence()

    expect(typeof intelligence.intent.detect).toBe('function')
    expect(typeof intelligence.sentiment.analyze).toBe('function')
    expect(typeof intelligence.content.extract).toBe('function')
    expect(typeof intelligence.keywords.extract).toBe('function')
    expect(typeof intelligence.image.translateE2e).toBe('function')
    expect(typeof intelligence.image.edit).toBe('function')
    expect(typeof intelligence.audio.tts).toBe('function')
    expect(typeof intelligence.audio.stt).toBe('function')
    expect(typeof intelligence.audio.transcribe).toBe('function')
    expect(typeof intelligence.workflow.execute).toBe('function')

    expect(typeof intelligence.analysis.classify).toBe('function')
    expect(typeof intelligence.analysis.detectIntent).toBe('function')
    expect(typeof intelligence.analysis.analyzeSentiment).toBe('function')
    expect(typeof intelligence.analysis.extractContent).toBe('function')
    expect(typeof intelligence.analysis.extractKeywords).toBe('function')
    expect(typeof intelligence.vision.ocr).toBe('function')
    expect(typeof intelligence.vision.caption).toBe('function')
    expect(typeof intelligence.vision.analyze).toBe('function')
    expect(typeof intelligence.vision.generate).toBe('function')
    expect(typeof intelligence.audio.ttsSpeak).toBe('function')
  })

  it('dispatches representative current wrappers to matching typed SDK domain methods', async () => {
    const intelligence = useIntelligence()
    const sdk = mocks.sdk!
    const options = { preferredProviderId: 'provider-a', modelPreference: ['model-a'] }

    const classifyPayload = { text: 'urgent launch blocker', categories: ['incident', 'question'] }
    await expect(intelligence.text.classify(classifyPayload, options)).resolves.toMatchObject({
      result: { predictions: [{ category: 'incident', confidence: 0.93 }] },
    })
    expect(sdk.text.classify).toHaveBeenCalledWith(classifyPayload, options)

    const intentPayload = { text: 'please deploy now', possibleIntents: ['deploy', 'rollback'] }
    await expect(intelligence.intent.detect(intentPayload, options)).resolves.toMatchObject({
      result: { intent: 'deploy', confidence: 0.82, entities: [] },
    })
    expect(sdk.intent.detect).toHaveBeenCalledWith(intentPayload, options)

    const translatePayload = { imageBase64: 'base64-image', targetLang: 'ja' }
    await expect(intelligence.image.translateE2e(translatePayload, options)).resolves.toMatchObject({
      result: { translatedImageBase64: 'base64-image-translated' },
    })
    expect(sdk.image.translateE2e).toHaveBeenCalledWith(translatePayload, options)

    const editPayload = { source: { type: 'base64' as const, base64: 'base64-image' }, prompt: 'remove glare' }
    await expect(intelligence.image.edit(editPayload, options)).resolves.toMatchObject({
      result: { image: { base64: 'edited-image' }, revisedPrompt: 'remove glare' },
    })
    expect(sdk.image.edit).toHaveBeenCalledWith(editPayload, options)

    const ttsPayload = { text: 'ship it', format: 'mp3' as const }
    await expect(intelligence.audio.tts(ttsPayload, options)).resolves.toMatchObject({
      result: { audio: 'spoken:ship it', format: 'mp3' },
    })
    expect(sdk.audio.tts).toHaveBeenCalledWith(ttsPayload, options)

    const sttPayload = { audio: 'audio-bytes', format: 'wav' }
    await expect(intelligence.audio.stt(sttPayload, options)).resolves.toMatchObject({
      result: { text: 'heard:audio-bytes', confidence: 0.88 },
    })
    expect(sdk.audio.stt).toHaveBeenCalledWith(sttPayload, options)

    const transcribePayload = { audio: 'meeting-audio', language: 'zh', task: 'transcribe' as const }
    await expect(intelligence.audio.transcribe(transcribePayload, options)).resolves.toMatchObject({
      result: { text: 'transcribed:meeting-audio', language: 'zh', duration: 3 },
    })
    expect(sdk.audio.transcribe).toHaveBeenCalledWith(transcribePayload, options)

    const workflowPayload = { workflowId: 'workflow-1', input: { selectedText: 'draft' } }
    await expect(intelligence.workflow.execute(workflowPayload, options)).resolves.toMatchObject({
      result: { workflowId: 'workflow-1', payload: workflowPayload },
    })
    expect(sdk.workflow.execute).toHaveBeenCalledWith(workflowPayload, options)

    expect(sdk.invoke).not.toHaveBeenCalled()
  })

  it('keeps legacy analysis aliases mapped to the current typed SDK domain methods', async () => {
    const intelligence = useIntelligence()
    const sdk = mocks.sdk!
    const options = { preferredProviderId: 'provider-a' }

    const classificationPayload = { text: 'billing outage', categories: ['billing'] }
    const intentPayload = { text: 'open settings' }
    const sentimentPayload = { text: 'this is rough' }
    const contentPayload = { text: 'Meet Ada on Friday' }
    const keywordsPayload = { text: 'typed transport intelligence sdk' }

    await intelligence.analysis.classify(classificationPayload, options)
    await intelligence.analysis.detectIntent(intentPayload, options)
    await intelligence.analysis.analyzeSentiment(sentimentPayload, options)
    await intelligence.analysis.extractContent(contentPayload, options)
    await intelligence.analysis.extractKeywords(keywordsPayload, options)

    expect(sdk.text.classify).toHaveBeenCalledWith(classificationPayload, options)
    expect(sdk.intent.detect).toHaveBeenCalledWith(intentPayload, options)
    expect(sdk.sentiment.analyze).toHaveBeenCalledWith(sentimentPayload, options)
    expect(sdk.content.extract).toHaveBeenCalledWith(contentPayload, options)
    expect(sdk.keywords.extract).toHaveBeenCalledWith(keywordsPayload, options)
  })

  it('records wrapper failures in lastError and clears loading after rejection', async () => {
    const intelligence = useIntelligence()
    const rejection = new Error('image edit provider failed')
    mocks.sdk!.image.edit.mockRejectedValueOnce(rejection)

    const request = intelligence.image.edit({
      source: { type: 'base64', base64: 'base64-image' },
      prompt: 'replace background',
    })

    expect(intelligence.isLoading.value).toBe(true)
    await expect(request).rejects.toThrow('image edit provider failed')
    expect(intelligence.lastError.value).toBe('image edit provider failed')
    expect(intelligence.isLoading.value).toBe(false)
  })
})
