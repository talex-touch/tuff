import { makeWidgetId } from '@talex-touch/utils/plugin/widget'
import { createIntelligenceClient } from '@talex-touch/tuff-intelligence/client'
import type { IntelligenceImageTranslateE2eResult } from '@talex-touch/tuff-intelligence/client'
import { AccountEvents } from '@talex-touch/utils/transport/events'
import {
  applyProviderPresentation,
  DEFAULT_ENABLED_PROVIDER_IDS,
  detectLanguage,
  getEnabledProviderIds,
  getTranslationProviderLabel,
  NO_INPUT_OCR_MESSAGE,
  NO_INPUT_SCREENSHOT_MESSAGE,
  NO_INPUT_TEXT_MESSAGE,
  normalizeCallFailureMessage,
  PERMISSION_DENIED_MESSAGE,
  resolveTargetLanguage,
} from '@talex-touch/utils/plugin'
import { GoogleProvider, TuffIntelligenceProvider } from './providers'
import { parseImageDataUrl, toImageDataUrl } from './utils'
const { plugin, clipboard, logger, permission, TuffItemBuilder, touchChannel } = globalThis as any

const PLUGIN_NAME = 'touch-translation'
const WIDGET_ITEM_ID = 'translation-widget'
const IMAGE_TRANSLATION_ITEM_ID = 'image-translation-widget'
const IMAGE_TRANSLATION_TARGET_LANG = 'zh'
const DETACHED_PAYLOAD_STATE_KEY = 'detachedPayload'
const SUPPORTED_TRANSLATION_FEATURES = new Set(['touch-translate', 'screenshot-translate'])
const TUFF_INTELLIGENCE_PROVIDER_ID = 'tuffintelligence'

interface ProviderState {
  id: string
  name: string
  status: 'pending' | 'success' | 'error'
  translatedText?: string
  from?: string
  to?: string
  provider?: string
  model?: string
  traceId?: string
  phonetic?: string
  transliteration?: string
  pronunciations?: Array<{
    label?: string
    text?: string
    audioUrl?: string
  }>
  meanings?: Array<{
    partOfSpeech?: string
    terms?: string[]
    definitions?: string[]
  }>
  error?: string
}

interface WidgetState {
  requestId: string
  requestSeq: number
  query: string
  detectedLang: string
  targetLang: string
  providers: ProviderState[]
  error?: string | null
  updatedAt: number
}

interface ImageTranslationWidgetPayload {
  mode: 'image-translation'
  requestId: string
  status: 'complete' | 'error'
  sourceImageDataUrl: string
  translatedImageDataUrl?: string
  sourceText?: string
  targetText?: string
  provider?: string
  model?: string
  traceId?: string
  error?: string
  updatedAt: number
}

const latestRequestSeqByFeature = new Map<string, number>()
const debounceTimersByFeature = new Map<string, NodeJS.Timeout>()
const abortControllersByFeature = new Map<string, AbortController>()
const lastQueryByFeature = new Map<string, string>()
const widgetStateByFeature = new Map<string, WidgetState>()

let networkPermissionState: boolean | null = null
let aiPermissionState: boolean | null = null

const providers = new Map([
  [TUFF_INTELLIGENCE_PROVIDER_ID, applyProviderPresentation(new TuffIntelligenceProvider())],
  ['google', applyProviderPresentation(new GoogleProvider())],
])

async function ensureNetworkPermission(): Promise<boolean> {
  if (!permission) {
    return true
  }
  if (networkPermissionState === true) {
    return true
  }
  if (networkPermissionState === false) {
    return false
  }

  const hasNetwork = await permission.check('network.internet')
  if (hasNetwork) {
    networkPermissionState = true
    return true
  }

  const granted = await permission.request('network.internet', '需要网络权限以访问翻译服务')
  networkPermissionState = Boolean(granted)
  return networkPermissionState
}

async function ensureAiPermission(): Promise<boolean> {
  if (!permission) {
    return true
  }
  if (aiPermissionState === true) {
    return true
  }
  if (aiPermissionState === false) {
    return false
  }

  const hasAi = await permission.check('intelligence.basic')
  if (hasAi) {
    aiPermissionState = true
    return true
  }

  const granted = await permission.request('intelligence.basic', '需要 AI 权限以使用智能翻译')
  aiPermissionState = Boolean(granted)
  return aiPermissionState
}

function extractQueryText(query: unknown): string {
  if (typeof query === 'string') {
    return query
  }
  if (query && typeof query === 'object' && typeof (query as any).text === 'string') {
    return (query as any).text
  }
  return ''
}

function extractImageDataUrl(query: unknown): string | null {
  if (!query || typeof query !== 'object') {
    return null
  }
  const inputs = Array.isArray((query as any).inputs) ? (query as any).inputs : []
  const imageInput = inputs.find(
    (input: any) =>
      input?.type === 'image'
      && typeof input?.content === 'string'
      && input.content.startsWith('data:image/')
  )
  return imageInput?.content || null
}

async function resolveTextToTranslate(
  featureId: string,
  query: unknown,
): Promise<{ text: string, error?: string }> {
  const textQuery = extractQueryText(query).trim()
  if (textQuery) {
    return { text: textQuery }
  }

  if (featureId !== 'screenshot-translate') {
    return { text: '', error: NO_INPUT_TEXT_MESSAGE }
  }

  const imageDataUrl = extractImageDataUrl(query)
  if (!imageDataUrl) {
    return { text: '', error: NO_INPUT_SCREENSHOT_MESSAGE }
  }

  const hasAiPermission = await ensureAiPermission()
  if (!hasAiPermission) {
    return { text: '', error: PERMISSION_DENIED_MESSAGE }
  }

  try {
    const aiClient = createIntelligenceClient()
    const response = await aiClient.invoke<{ text?: string }>('vision.ocr', {
      source: {
        type: 'data-url',
        dataUrl: imageDataUrl,
      },
      language: 'zh-CN',
      includeLayout: false,
      includeKeywords: false,
    })
    const ocrText = response?.result?.text?.trim() || ''
    if (!ocrText) {
      return { text: '', error: NO_INPUT_OCR_MESSAGE }
    }
    return { text: ocrText }
  }
  catch (error) {
    return { text: '', error: normalizeCallFailureMessage(error instanceof Error ? error.message : '') }
  }
}

function resolveWidgetStatus(state: WidgetState): 'idle' | 'running' | 'complete' | 'error' {
  if (!state.query) {
    return 'idle'
  }
  if (state.error) {
    return 'error'
  }
  const hasPending = state.providers.some(provider => provider.status === 'pending')
  return hasPending ? 'running' : 'complete'
}

function buildWidgetPayload(state: WidgetState) {
  return {
    requestId: state.requestId,
    query: state.query,
    detectedLang: state.detectedLang,
    targetLang: state.targetLang,
    status: resolveWidgetStatus(state),
    providers: state.providers,
    error: state.error || undefined,
    updatedAt: Date.now(),
  }
}

function buildWidgetItem(featureId: string, state: WidgetState) {
  const status = resolveWidgetStatus(state)
  const statusLabel = status === 'idle'
    ? '等待输入'
    : status === 'running'
      ? '翻译中'
      : status === 'complete'
        ? '翻译完成'
        : '翻译失败'

  return new TuffItemBuilder(WIDGET_ITEM_ID)
    .setSource('plugin', 'plugin-features', PLUGIN_NAME)
    .setTitle(state.query ? `翻译：${state.query}` : '翻译')
    .setSubtitle(statusLabel)
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .setCustomRender('vue', makeWidgetId(PLUGIN_NAME, featureId), buildWidgetPayload(state))
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      pluginType: 'translation',
      keepCoreBoxOpen: true,
    })
    .build()
}

function buildImageTranslationItem(
  featureId: string,
  payload: ImageTranslationWidgetPayload,
) {
  const title = payload.status === 'complete' ? '图片翻译完成' : '图片翻译失败'
  const subtitle = payload.status === 'complete'
    ? '已生成译文图片'
    : payload.error || '无法完成图片翻译'

  return new TuffItemBuilder(IMAGE_TRANSLATION_ITEM_ID)
    .setSource('plugin', 'plugin-features', PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .setCustomRender('vue', makeWidgetId(PLUGIN_NAME, featureId), payload)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      pluginType: 'translation',
      keepCoreBoxOpen: true,
    })
    .build()
}

function buildDetachedFeatureUrl(item: any, query: string, pluginId: string): string {
  const params = new URLSearchParams({
    itemId: item.id,
    query,
    source: pluginId,
    providerSource: item.source?.id || 'plugin-features',
  })
  return `tuff://detached?${params.toString()}`
}

function buildDetachedPayload(item: any, query: string) {
  return {
    item: JSON.parse(JSON.stringify(item)),
    query,
  }
}

async function openImageTranslationDivisionBox(
  featureId: string,
  payload: ImageTranslationWidgetPayload,
): Promise<boolean> {
  const item = buildImageTranslationItem(featureId, payload)
  if (!plugin?.divisionBox?.open) {
    upsertFeatureItem(item)
    return false
  }

  const detachedPayload = buildDetachedPayload(item, '')
  const session = await plugin.divisionBox.open({
    url: buildDetachedFeatureUrl(item, '', PLUGIN_NAME),
    title: '图片翻译',
    icon: { type: 'file', value: 'assets/logo.svg' },
    size: 'expanded',
    keepAlive: true,
    pluginId: PLUGIN_NAME,
    header: { show: false },
    ui: { showInput: false, initialInput: '' },
    initialState: {
      [DETACHED_PAYLOAD_STATE_KEY]: detachedPayload,
    },
  })

  if (!session?.sessionId) {
    throw new Error('DivisionBox session was not created')
  }

  if (typeof plugin.divisionBox.updateState === 'function') {
    await plugin.divisionBox.updateState(session.sessionId, DETACHED_PAYLOAD_STATE_KEY, detachedPayload)
  }

  return true
}

async function presentImageTranslationResult(
  featureId: string,
  payload: ImageTranslationWidgetPayload,
): Promise<void> {
  try {
    const opened = await openImageTranslationDivisionBox(featureId, payload)
    if (!opened) {
      upsertFeatureItem(buildImageTranslationItem(featureId, payload))
    }
  }
  catch (error) {
    logger.warn('Failed to open image translation DivisionBox:', error)
    upsertFeatureItem(buildImageTranslationItem(featureId, payload))
  }
}

async function translateImageFromClipboardInput(
  featureId: string,
  query: unknown,
): Promise<boolean> {
  const imageDataUrl = extractImageDataUrl(query)
  if (!imageDataUrl) {
    return false
  }

  const parsed = parseImageDataUrl(imageDataUrl)
  if (!parsed) {
    return false
  }

  const requestId = `image-translation-${Date.now()}`
  const hasAiPermission = await ensureAiPermission()
  if (!hasAiPermission) {
    await presentImageTranslationResult(featureId, {
      mode: 'image-translation',
      requestId,
      status: 'error',
      sourceImageDataUrl: imageDataUrl,
      error: PERMISSION_DENIED_MESSAGE,
      updatedAt: Date.now(),
    })
    return true
  }

  try {
    const aiClient = createIntelligenceClient()
    const response = await aiClient.invoke<IntelligenceImageTranslateE2eResult>(
      'image.translate.e2e',
      {
        imageBase64: parsed.base64,
        imageMimeType: parsed.mime,
        targetLang: IMAGE_TRANSLATION_TARGET_LANG,
        metadata: {
          caller: PLUGIN_NAME,
          entry: featureId,
        },
      },
      {
        metadata: {
          caller: PLUGIN_NAME,
          entry: featureId,
        },
      },
    )

    const result = response?.result
    if (!result?.translatedImageBase64) {
      throw new Error('EMPTY_IMAGE_TRANSLATE_RESULT')
    }

    await presentImageTranslationResult(featureId, {
      mode: 'image-translation',
      requestId,
      status: 'complete',
      sourceImageDataUrl: imageDataUrl,
      translatedImageDataUrl: toImageDataUrl(result.translatedImageBase64, result.imageMimeType),
      sourceText: result.sourceText,
      targetText: result.targetText,
      provider: response.provider,
      model: response.model,
      traceId: response.traceId,
      updatedAt: Date.now(),
    })
  }
  catch (error) {
    const errorPayload: ImageTranslationWidgetPayload = {
      mode: 'image-translation',
      requestId,
      status: 'error',
      sourceImageDataUrl: imageDataUrl,
      error: normalizeCallFailureMessage(describeRuntimeError(error)),
      updatedAt: Date.now(),
    }
    await presentImageTranslationResult(featureId, errorPayload)
  }

  return true
}

function describeRuntimeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim() || error.name || 'Unknown error'
  }

  if (typeof error === 'string') {
    return error.trim() || 'Unknown error'
  }

  if (error && typeof error === 'object') {
    try {
      const serialized = JSON.stringify(error)
      if (serialized && serialized !== '{}') {
        return serialized
      }
    }
    catch {
      // Ignore JSON serialization errors and fall through to the default message.
    }
  }

  return 'Unknown error'
}

function upsertRequestErrorWidget(
  featureId: string,
  textToTranslate: string,
  nextSeq: number,
  error: unknown,
) {
  const normalizedQuery = textToTranslate.trim()
  const detectedLang = normalizedQuery ? detectLanguage(normalizedQuery) : ''
  const targetLang = detectedLang ? resolveTargetLanguage(detectedLang) : ''
  const existing = widgetStateByFeature.get(featureId)
  const state = existing ?? createWidgetState(
    featureId,
    normalizedQuery,
    detectedLang,
    targetLang,
    [],
    `translation-error-${Date.now()}-${nextSeq}`,
    nextSeq,
  )

  state.requestSeq = nextSeq
  state.requestId = state.requestId || `translation-error-${Date.now()}-${nextSeq}`
  state.query = normalizedQuery
  state.detectedLang = detectedLang
  state.targetLang = targetLang
  state.error = normalizeCallFailureMessage(describeRuntimeError(error))
  state.updatedAt = Date.now()

  widgetStateByFeature.set(featureId, state)
  upsertWidgetItem(featureId)
}

function upsertFeatureItem(item: any) {
  try {
    plugin.feature.updateItem(item.id, item)
  }
  catch {
    plugin.feature.pushItems([item])
  }
}

function upsertWidgetItem(featureId: string) {
  const state = widgetStateByFeature.get(featureId)
  if (!state) {
    return
  }
  state.updatedAt = Date.now()
  upsertFeatureItem(buildWidgetItem(featureId, state))
}

function ensureIdleWidget(featureId: string) {
  const state: WidgetState = {
    requestId: `idle-${Date.now()}`,
    requestSeq: latestRequestSeqByFeature.get(featureId) || 0,
    query: '',
    detectedLang: '',
    targetLang: '',
    providers: [],
    error: null,
    updatedAt: Date.now(),
  }

  widgetStateByFeature.set(featureId, state)
  upsertWidgetItem(featureId)
}

function createWidgetState(
  featureId: string,
  textToTranslate: string,
  detectedLang: string,
  targetLang: string,
  providersToShow: string[],
  requestId: string,
  requestSeq: number,
) {
  const state: WidgetState = {
    requestId,
    requestSeq,
    query: textToTranslate,
    detectedLang,
    targetLang,
    providers: providersToShow.map(id => ({
      id,
      name: getTranslationProviderLabel(id),
      status: 'pending',
    })),
    error: null,
    updatedAt: Date.now(),
  }

  widgetStateByFeature.set(featureId, state)
  return state
}

function updateProviderState(
  featureId: string,
  providerId: string,
  patch: Partial<ProviderState>,
) {
  const state = widgetStateByFeature.get(featureId)
  if (!state) {
    return
  }

  const provider = state.providers.find(item => item.id === providerId)
  if (!provider) {
    return
  }

  Object.assign(provider, patch)
  upsertWidgetItem(featureId)
}

async function startTranslationRequest(
  textToTranslate: string,
  featureId: string,
  signal: AbortSignal,
  nextSeq: number,
) {
  const detectedLang = detectLanguage(textToTranslate)
  const targetLang = resolveTargetLanguage(detectedLang)
  const requestId = `translation-${Date.now()}-${nextSeq}`

  const providersToShow = await resolveEnabledProviderIds()
  const state = createWidgetState(
    featureId,
    textToTranslate,
    detectedLang,
    targetLang,
    providersToShow,
    requestId,
    nextSeq,
  )

  const usesNetworkProviders = providersToShow.some(providerId => providerId !== 'tuffintelligence')
  if (usesNetworkProviders && !(await ensureNetworkPermission())) {
    state.error = PERMISSION_DENIED_MESSAGE
    upsertWidgetItem(featureId)
    return
  }

  upsertWidgetItem(featureId)

  await Promise.allSettled(
    providersToShow.map(async (providerId: string) => {
      if (signal?.aborted) {
        return
      }
      if (latestRequestSeqByFeature.get(featureId) !== nextSeq) {
        return
      }

      const provider = providers.get(providerId)
      if (!provider) {
        return
      }

      if (providerId === 'tuffintelligence') {
        const hasAiPermission = await ensureAiPermission()
        if (!hasAiPermission) {
          updateProviderState(featureId, providerId, {
            status: 'error',
            error: PERMISSION_DENIED_MESSAGE,
          })
          return
        }
      }

      try {
        const result = await provider.translate(textToTranslate, 'auto', targetLang, signal)
        if (signal?.aborted) {
          return
        }
        if (latestRequestSeqByFeature.get(featureId) !== nextSeq) {
          return
        }

        if (result?.error) {
          updateProviderState(featureId, providerId, {
            status: 'error',
            error: normalizeCallFailureMessage(result.error),
          })
          return
        }

        updateProviderState(featureId, providerId, {
          status: 'success',
          translatedText: result.text,
          from: result.from || detectedLang,
          to: result.to || targetLang,
          provider: result.provider,
          model: result.model,
          traceId: result.traceId,
          phonetic: result.phonetic,
          transliteration: result.transliteration,
          pronunciations: result.pronunciations,
          meanings: result.meanings,
        })
      }
      catch (error) {
        if (signal?.aborted) {
          return
        }
        updateProviderState(featureId, providerId, {
          status: 'error',
          error: normalizeCallFailureMessage(error instanceof Error ? error.message : ''),
        })
      }
    }),
  )
}

async function resolveEnabledProviderIds(): Promise<string[]> {
  const providersConfig = await plugin.storage.getFile('providers_config')
  const enabledProviderIds = getEnabledProviderIds(providersConfig, {
    supportedIds: Array.from(providers.keys()),
    fallbackIds: DEFAULT_ENABLED_PROVIDER_IDS,
  })
  return filterAuthorizedProviderIds(enabledProviderIds, {
    canUseTuffIntelligenceProvider,
  })
}

async function filterAuthorizedProviderIds(
  providerIds: string[],
  guards: {
    canUseTuffIntelligenceProvider: () => Promise<boolean>
  },
): Promise<string[]> {
  if (!providerIds.includes(TUFF_INTELLIGENCE_PROVIDER_ID)) {
    return providerIds
  }

  const canUseTuffIntelligence = await guards.canUseTuffIntelligenceProvider()
  if (canUseTuffIntelligence) {
    return providerIds
  }

  return providerIds.filter(providerId => providerId !== TUFF_INTELLIGENCE_PROVIDER_ID)
}

async function canUseTuffIntelligenceProvider(): Promise<boolean> {
  const token = await resolveTuffIntelligenceAuthToken()
  return token.length > 0
}

async function resolveTuffIntelligenceAuthToken(): Promise<string> {
  if (!touchChannel?.send) {
    return ''
  }

  try {
    const eventName = AccountEvents.auth.getToken.toEventName()
    const token = await touchChannel?.send?.(eventName)
    return typeof token === 'string' ? token.trim() : ''
  }
  catch {
    return ''
  }
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId: string, query: any, _feature: any, signal: AbortSignal) {
    try {
      if (SUPPORTED_TRANSLATION_FEATURES.has(featureId)) {
        if (featureId === 'screenshot-translate' && await translateImageFromClipboardInput(featureId, query)) {
          return true
        }

        const resolvedInput = await resolveTextToTranslate(featureId, query)
        const textToTranslate = resolvedInput.text.trim()
        if (!textToTranslate) {
          lastQueryByFeature.delete(featureId)
          ensureIdleWidget(featureId)
          if (resolvedInput.error) {
            const state = widgetStateByFeature.get(featureId)
            if (state) {
              state.error = resolvedInput.error
              upsertWidgetItem(featureId)
            }
          }
          return true
        }

        const lastQuery = lastQueryByFeature.get(featureId)
        if (lastQuery === textToTranslate) {
          return true
        }

        lastQueryByFeature.set(featureId, textToTranslate)

        const nextSeq = (latestRequestSeqByFeature.get(featureId) || 0) + 1
        latestRequestSeqByFeature.set(featureId, nextSeq)

        const detectedLang = detectLanguage(textToTranslate)
        const targetLang = resolveTargetLanguage(detectedLang)
        const providersToShow = await resolveEnabledProviderIds()
        widgetStateByFeature.set(
          featureId,
          createWidgetState(
            featureId,
            textToTranslate,
            detectedLang,
            targetLang,
            providersToShow,
            `translation-${Date.now()}-${nextSeq}`,
            nextSeq,
          ),
        )
        upsertWidgetItem(featureId)

        const prevTimer = debounceTimersByFeature.get(featureId)
        if (prevTimer) {
          clearTimeout(prevTimer)
        }

        const prevController = abortControllersByFeature.get(featureId)
        if (prevController) {
          prevController.abort()
        }

        const controller = new AbortController()
        abortControllersByFeature.set(featureId, controller)

        if (signal) {
          if (signal.aborted) {
            controller.abort()
          }
          else {
            signal.addEventListener('abort', () => controller.abort(), { once: true })
          }
        }

        const timer = setTimeout(() => {
          if (latestRequestSeqByFeature.get(featureId) !== nextSeq) {
            return
          }
          if (controller.signal.aborted) {
            return
          }
          startTranslationRequest(textToTranslate, featureId, controller.signal, nextSeq).catch((error) => {
            const message = describeRuntimeError(error)
            logger.error('Error starting translation request:', message, error)
            upsertRequestErrorWidget(featureId, textToTranslate, nextSeq, error)
          })
        }, 200)
        debounceTimersByFeature.set(featureId, timer)

        return true
      }
    }
    catch (error) {
      logger.error('Error processing translation feature:', error)
    }
  },

  async onItemAction(item: any) {
    if (item.meta?.defaultAction === 'copy') {
      const copyAction = item.actions.find((action: any) => action.type === 'copy')
      if (copyAction && copyAction.payload) {
        clipboard.writeText(copyAction.payload)
        logger.log('Copied to clipboard:', copyAction.payload)

        const isFeatureExecution = Boolean(item.meta?.featureId)
        if (!isFeatureExecution) {
          plugin.box.hide()
        }
      }
      else {
        logger.warn('No copy action or payload found for item:', item)
      }
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    canUseTuffIntelligenceProvider,
    filterAuthorizedProviderIds,
    resolveTuffIntelligenceAuthToken,
  },
}
