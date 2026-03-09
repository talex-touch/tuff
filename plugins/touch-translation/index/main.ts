import { makeWidgetId } from '@talex-touch/utils/plugin/widget'
import { createIntelligenceClient } from '@talex-touch/tuff-intelligence'
import { GoogleProvider, TuffIntelligenceProvider } from './providers'
import { detectLanguage } from './utils'

const { plugin, clipboard, logger, permission, TuffItemBuilder } = globalThis as any

const PLUGIN_NAME = 'touch-translation'
const WIDGET_ITEM_ID = 'translation-widget'
const SUPPORTED_TRANSLATION_FEATURES = new Set(['touch-translate', 'screenshot-translate'])
const NO_INPUT_TEXT_MESSAGE = '无输入：请输入要翻译的文本'
const NO_INPUT_SCREENSHOT_MESSAGE = '无输入：请先截取图片或输入文本后再翻译'
const NO_INPUT_OCR_MESSAGE = '无输入：截图中未识别到可翻译文本，请更换区域后重试'
const PERMISSION_DENIED_MESSAGE = '权限被拒绝：请在插件设置中授予所需权限后重试'
const CALL_FAILED_MESSAGE = '调用失败：翻译服务暂不可用，请稍后重试'

interface ProviderState {
  id: string
  name: string
  status: 'pending' | 'success' | 'error'
  translatedText?: string
  from?: string
  to?: string
  provider?: string
  model?: string
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

const latestRequestSeqByFeature = new Map<string, number>()
const debounceTimersByFeature = new Map<string, NodeJS.Timeout>()
const abortControllersByFeature = new Map<string, AbortController>()
const lastQueryByFeature = new Map<string, string>()
const widgetStateByFeature = new Map<string, WidgetState>()

let networkPermissionState: boolean | null = null
let aiPermissionState: boolean | null = null

const providers = new Map([
  ['tuffintelligence', new TuffIntelligenceProvider()],
  ['google', new GoogleProvider()],
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

function normalizeCallFailureMessage(rawMessage: unknown): string {
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : ''
  return message ? `${CALL_FAILED_MESSAGE}（${message}）` : CALL_FAILED_MESSAGE
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

function formatProviderName(providerId: string): string {
  const map: Record<string, string> = {
    tuffintelligence: 'Tuff Intelligence',
    google: 'Google',
  }
  return map[providerId] || providerId
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
      name: formatProviderName(id),
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
  plugin.search.updateQuery(textToTranslate)
  plugin.feature.clearItems()

  const detectedLang = detectLanguage(textToTranslate)
  const targetLang = detectedLang === 'zh' ? 'en' : 'zh'
  const requestId = `translation-${Date.now()}-${nextSeq}`

  const providersConfig = await plugin.storage.getFile('providers_config')
  const enabledProviders = providersConfig
    ? Object.entries(providersConfig)
        .filter(([_id, config]: [string, any]) => config.enabled)
        .map(([id]: [string, any]) => id)
    : ['tuffintelligence']

  const providersToShow = enabledProviders.length > 0 ? enabledProviders : ['tuffintelligence']
  const state = createWidgetState(
    featureId,
    textToTranslate,
    detectedLang,
    targetLang,
    providersToShow,
    requestId,
    nextSeq,
  )

  const ok = await ensureNetworkPermission()
  if (!ok) {
    state.error = PERMISSION_DENIED_MESSAGE
    upsertWidgetItem(featureId)
    return
  }

  upsertWidgetItem(featureId)

  await Promise.allSettled(
    providersToShow.map(async (providerId) => {
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

const pluginLifecycle = {
  async onFeatureTriggered(featureId: string, query: any, _feature: any, signal: AbortSignal) {
    try {
      if (SUPPORTED_TRANSLATION_FEATURES.has(featureId)) {
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
          startTranslationRequest(textToTranslate, featureId, controller.signal, nextSeq).catch((e) => {
            logger.error('Error starting translation request:', e)
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

module.exports = pluginLifecycle
