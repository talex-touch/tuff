import type { TuffItem } from '@talex-touch/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoreBoxContextActionsOpenRequest, toContextActionQuery } from '@talex-touch/utils'

const mocks = vi.hoisted(() => ({
  capabilityStatus: vi.fn((capabilityId: string) => ({
    capabilityId,
    available: true,
    providerIds: ['test-provider']
  })),
  pluginSearch: vi.fn(),
  codeReview: vi.fn(),
  summarize: vi.fn(),
  rewrite: vi.fn(),
  translate: vi.fn(),
  ocr: vi.fn(),
  caption: vi.fn(),
  openExternal: vi.fn(),
  shellOpenExternal: vi.fn(),
  clipboardWriteText: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getLocale: () => 'zh-CN' },
  clipboard: {
    writeText: mocks.clipboardWriteText
  },
  shell: {
    openExternal: mocks.shellOpenExternal
  }
}))

vi.mock('../../../../utils/external-url-policy', () => ({
  openValidatedExternalUrl: mocks.openExternal
}))

import { normalizeIntelligenceError } from '../../../ai/intelligence-error-normalizer'
import {
  registerBoxToolAiCapabilityPort,
  resetBoxToolAiCapabilityPort
} from '../../ports/ai-capability-port'
import {
  registerBoxToolPluginHostPort,
  resetBoxToolPluginHostPort
} from '../../ports/plugin-host-port'
import { CONTEXT_ACTION_IDS, ContextActionsProvider } from './context-actions-provider'

const signal = new AbortController().signal
const capturedAt = 1_752_486_400_000

function pluginFeatureItem(pluginName: string, featureId: string): TuffItem {
  return {
    id: `${pluginName}/${featureId}`,
    source: { type: 'plugin', id: 'plugin-features', name: 'Plugin Features' },
    kind: 'feature',
    render: {
      mode: 'default',
      basic: {
        title: featureId,
        subtitle: pluginName,
        icon: { type: 'class', value: 'i-ri-plug-line' }
      }
    },
    actions: [{ id: 'trigger-feature', type: 'execute', primary: true }],
    meta: {
      pluginName,
      featureId,
      extension: { acceptedInputTypes: ['text'] }
    }
  }
}

function textQuery(sessionId = 'text-session') {
  return toContextActionQuery(
    createCoreBoxContextActionsOpenRequest(sessionId, {
      type: 'text',
      source: 'selected-text',
      content: 'function run() { return true }',
      capturedAt,
      available: true,
      diagnostic: { supportLevel: 'best_effort' }
    })
  )
}

function imageQuery(sessionId = 'image-session') {
  return toContextActionQuery(
    createCoreBoxContextActionsOpenRequest(sessionId, {
      type: 'image',
      source: 'clipboard-image',
      content: 'data:image/png;base64,aW1hZ2U=',
      mimeType: 'image/png',
      capturedAt,
      available: true,
      diagnostic: { supportLevel: 'supported' }
    })
  )
}

function unavailableQuery() {
  return toContextActionQuery(
    createCoreBoxContextActionsOpenRequest('empty-session', {
      type: 'text',
      source: 'selected-text',
      content: '',
      capturedAt,
      available: false,
      diagnostic: {
        supportLevel: 'unsupported',
        issueCode: 'PLATFORM_UNSUPPORTED',
        issueMessage: 'Selection capture unavailable'
      }
    })
  )
}

function resetMocksAndPorts() {
  vi.clearAllMocks()
  mocks.capabilityStatus.mockImplementation((capabilityId: string) => ({
    capabilityId,
    available: true,
    providerIds: ['test-provider']
  }))
  mocks.pluginSearch.mockResolvedValue({ items: [] })
  mocks.codeReview.mockResolvedValue({
    result: {
      summary: 'Review completed',
      score: 92,
      issues: [{ severity: 'warning', type: 'bug', line: 1, message: 'Check branch' }],
      improvements: ['Add a regression test']
    }
  })
  mocks.summarize.mockResolvedValue({ result: 'Summary output' })
  mocks.rewrite.mockResolvedValue({ result: 'Rewritten output' })
  mocks.translate.mockResolvedValue({ result: '翻译结果' })
  mocks.ocr.mockResolvedValue({ result: { text: 'Hello image' } })
  mocks.caption.mockResolvedValue({ result: { caption: 'A sample image' } })
  mocks.openExternal.mockResolvedValue({
    allowed: true,
    url: 'https://www.google.com/search?q=test'
  })
  registerBoxToolAiCapabilityPort({
    intelligence: {
      code: { review: mocks.codeReview },
      text: {
        summarize: mocks.summarize,
        rewrite: mocks.rewrite,
        translate: mocks.translate
      },
      vision: {
        ocr: mocks.ocr,
        caption: mocks.caption
      },
      embedding: {
        generate: vi.fn(),
        generateLocalImage: vi.fn()
      },
      rag: {
        rerank: vi.fn()
      }
    },
    normalizeIntelligenceError,
    resolveCapabilityStatus: mocks.capabilityStatus,
    searchConversations: async () => [],
    isLocalEmbeddingReady: () => false,
    isLocalEmbeddingImageReady: () => false,
    getLocalEmbeddingModelKey: () => 'test-local-embedding-model',
    runWithEmbeddingPriority: (_priority, run) => run(),
    onUsageLimitsChanged: () => () => {},
    readUsageLimitInfo: () => null
  })
  registerBoxToolPluginHostPort({
    hasPluginManager: () => true,
    setActivePlugin: vi.fn(),
    getPluginProviderDetail: vi.fn(() => null),
    installDevPluginFromPath: vi.fn(),
    canInstallTpexPlugin: () => false,
    installTpexPluginFromPath: vi.fn(),
    handleActiveFeatureInput: vi.fn(async () => false),
    searchPluginFeatures: mocks.pluginSearch,
    getDefaultSearchProviders: () => ({}),
    usePluginInjections: vi.fn(() => null),
    resolvePluginViewSecurityProfile: vi.fn(() => ({
      candidateProfile: 'trusted-plugin-view' as const,
      effectiveProfile: 'trusted-plugin-view' as const,
      reason: 'trusted-candidate' as const
    })),
    buildPluginViewWebPreferences: vi.fn(() => ({})),
    createPluginViewNavigationPolicy: vi.fn(async () => ({})),
    installPluginViewNavigationPolicy: vi.fn(),
    registerPluginWebContents: vi.fn(() => 'token'),
    unregisterPluginWebContents: vi.fn(() => true),
    closePluginWebContents: vi.fn()
  })
}

beforeEach(() => {
  resetMocksAndPorts()
})

afterEach(() => {
  resetBoxToolAiCapabilityPort()
  resetBoxToolPluginHostPort()
})

describe('ContextActionsProvider matching', () => {
  it('builds required text actions and delegates curated plugins to PluginFeaturesAdapter', async () => {
    mocks.pluginSearch.mockResolvedValue({
      items: [
        pluginFeatureItem('touch-translation', 'touch-translate'),
        pluginFeatureItem('touch-snippets', 'snippets-save'),
        pluginFeatureItem('touch-dev-utils', 'dev-utils'),
        pluginFeatureItem('unrelated-plugin', 'unrelated-feature')
      ]
    })
    const provider = new ContextActionsProvider()

    const result = await provider.onSearch(textQuery(), signal)
    const ids = result.items.map((item) => item.id)

    expect(ids).toContain('context-actions:text-session:context')
    expect(ids).toContain(`context-actions:text-session:${CONTEXT_ACTION_IDS.QuickReview}`)
    expect(ids).toContain(`context-actions:text-session:${CONTEXT_ACTION_IDS.Summarize}`)
    expect(ids).toContain(`context-actions:text-session:${CONTEXT_ACTION_IDS.Polish}`)
    expect(ids).toContain(`context-actions:text-session:${CONTEXT_ACTION_IDS.Rewrite}`)
    expect(ids).toContain(`context-actions:text-session:${CONTEXT_ACTION_IDS.WebSearch}`)
    expect(ids).toContain('touch-translation/touch-translate')
    expect(ids).toContain('touch-snippets/snippets-save')
    expect(ids).toContain('touch-dev-utils/dev-utils')
    expect(ids).not.toContain('unrelated-plugin/unrelated-feature')
    expect(result.items.find((item) => item.id === 'touch-snippets/snippets-save')?.source.id).toBe(
      'plugin-features'
    )
  })

  it('shows typed unavailable reasons instead of silently dropping capabilities and plugins', async () => {
    mocks.capabilityStatus.mockImplementation((capabilityId: string) => ({
      capabilityId,
      available: capabilityId !== 'code.review',
      providerIds: []
    }))
    mocks.pluginSearch.mockResolvedValue({ items: [] })
    const provider = new ContextActionsProvider()

    const result = await provider.onSearch(textQuery(), signal)
    const quickReview = result.items.find((item) =>
      item.id.endsWith(CONTEXT_ACTION_IDS.QuickReview)
    )
    const snippet = result.items.find((item) => item.id.includes('touch-snippets:snippets-save'))

    expect(quickReview?.actions).toEqual([])
    expect(quickReview?.meta?.extension?.unavailableReason).toMatchObject({
      code: 'capability-unavailable',
      recoverable: true
    })
    expect(snippet?.actions).toEqual([])
    expect(snippet?.meta?.extension?.unavailableReason).toMatchObject({
      code: 'plugin-unavailable'
    })
  })

  it('matches only OCR, image-text translation, and AI explanation for image context', async () => {
    const provider = new ContextActionsProvider()

    const result = await provider.onSearch(imageQuery(), signal)
    const ids = result.items.map((item) => item.id)

    expect(ids).toEqual(
      expect.arrayContaining([
        'context-actions:image-session:context',
        `context-actions:image-session:${CONTEXT_ACTION_IDS.Ocr}`,
        `context-actions:image-session:${CONTEXT_ACTION_IDS.TranslateImageText}`,
        `context-actions:image-session:${CONTEXT_ACTION_IDS.ExplainImage}`
      ])
    )
    expect(ids.some((id) => id.includes(CONTEXT_ACTION_IDS.QuickReview))).toBe(false)
    expect(mocks.pluginSearch).not.toHaveBeenCalled()
  })
  it('matches image actions for regular queries containing an image input', async () => {
    const provider = new ContextActionsProvider()
    const query = {
      text: '',
      inputs: [
        {
          type: 'image',
          content: 'data:image/png;base64,aW1hZ2U='
        }
      ]
    } as unknown as Parameters<typeof provider.onSearch>[0]

    const result = await provider.onSearch(query, signal)
    const ids = result.items.map((item) => item.id)

    expect(ids).toEqual(
      expect.arrayContaining([
        `context-actions:corebox-image-action:${CONTEXT_ACTION_IDS.Ocr}`,
        `context-actions:corebox-image-action:${CONTEXT_ACTION_IDS.TranslateImageText}`,
        `context-actions:corebox-image-action:${CONTEXT_ACTION_IDS.ExplainImage}`
      ])
    )
  })

  it('filters image actions by query text when user types in search box', async () => {
    const provider = new ContextActionsProvider()
    const query = {
      text: 'ocr',
      inputs: [
        {
          type: 'image',
          content: 'data:image/png;base64,aW1hZ2U='
        }
      ]
    } as unknown as Parameters<typeof provider.onSearch>[0]

    const result = await provider.onSearch(query, signal)
    const ids = result.items.map((item) => item.id)

    expect(ids).toContain(`context-actions:corebox-image-action:${CONTEXT_ACTION_IDS.Ocr}`)
    expect(ids).not.toContain(
      `context-actions:corebox-image-action:${CONTEXT_ACTION_IDS.ExplainImage}`
    )
  })

  it('renders one diagnostic item and never matches actions for unavailable context', async () => {
    const provider = new ContextActionsProvider()

    const result = await provider.onSearch(unavailableQuery(), signal)

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.meta?.extension?.contextActionSummary).toMatchObject({
      inputType: 'text',
      issueCode: 'PLATFORM_UNSUPPORTED'
    })
    expect(mocks.pluginSearch).not.toHaveBeenCalled()
    expect(mocks.capabilityStatus).not.toHaveBeenCalled()
  })
})

describe('ContextActionsProvider execution', () => {
  it('executes QuickReview through TuffIntelligence, renders the result, and copies it by item action', async () => {
    const provider = new ContextActionsProvider()
    const query = textQuery('review-session')
    const initial = await provider.onSearch(query, signal)
    const action = initial.items.find((item) => item.id.endsWith(CONTEXT_ACTION_IDS.QuickReview))
    expect(action).toBeTruthy()

    await expect(provider.onExecute({ item: action!, searchResult: initial })).resolves.toBeNull()
    expect(mocks.codeReview).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'function run() { return true }',
        focusAreas: ['bugs', 'security', 'best-practices']
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          // Stable usage-ledger caller of every context action (AC-B5).
          caller: 'core.corebox.context-action',
          entry: 'context-actions',
          actionId: CONTEXT_ACTION_IDS.QuickReview,
          inputType: 'text'
        })
      })
    )

    const completed = await provider.onSearch(query, signal)
    const resultItem = completed.items.find(
      (item) => item.id === 'context-actions:review-session:result'
    )
    expect(resultItem?.meta?.extension?.status).toBe('success')

    await provider.onExecute({ item: resultItem!, actionId: 'copy-result' })
    expect(mocks.clipboardWriteText).toHaveBeenCalledWith(
      expect.stringContaining('Review completed')
    )
  })

  it('executes image text translation as OCR followed by text.translate', async () => {
    const provider = new ContextActionsProvider()
    const query = imageQuery('image-translate-session')
    const initial = await provider.onSearch(query, signal)
    const action = initial.items.find((item) =>
      item.id.endsWith(CONTEXT_ACTION_IDS.TranslateImageText)
    )

    await provider.onExecute({ item: action!, searchResult: initial })

    expect(mocks.ocr).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { type: 'base64', base64: 'aW1hZ2U=' }
      }),
      expect.any(Object)
    )
    expect(mocks.translate).toHaveBeenCalledWith(
      { text: 'Hello image', sourceLang: 'auto', targetLang: 'zh' },
      expect.any(Object)
    )
    const completed = await provider.onSearch(query, signal)
    expect(
      completed.items.find((item) => item.id === 'context-actions:image-translate-session:result')
        ?.meta?.extension?.status
    ).toBe('success')
  })

  it('opens web search through the validated system opener and renders success', async () => {
    const provider = new ContextActionsProvider()
    const query = textQuery('web-search-session')
    const initial = await provider.onSearch(query, signal)
    const action = initial.items.find((item) => item.id.endsWith(CONTEXT_ACTION_IDS.WebSearch))

    await provider.onExecute({ item: action!, searchResult: initial })

    expect(mocks.openExternal).toHaveBeenCalledWith(
      'https://www.google.com/search?q=function%20run()%20%7B%20return%20true%20%7D',
      { opener: mocks.shellOpenExternal }
    )
    const completed = await provider.onSearch(query, signal)
    expect(
      completed.items.find((item) => item.id === 'context-actions:web-search-session:result')?.meta
        ?.extension?.status
    ).toBe('success')
  })
})
