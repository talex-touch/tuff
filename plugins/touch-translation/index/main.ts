import { makeWidgetId } from '@talex-touch/utils/plugin/widget'
import { GoogleProvider, TuffIntelligenceProvider } from './providers'
import { detectLanguage } from './utils'

const { plugin, clipboard, logger, permission, TuffItemBuilder } = globalThis as any

const PLUGIN_NAME = 'touch-translation'
const WIDGET_ITEM_ID = 'translation-widget'

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
    state.error = '请在插件设置中授予网络权限以使用翻译功能'
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
            error: result.error,
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
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        updateProviderState(featureId, providerId, {
          status: 'error',
          error: errorMsg,
        })
      }
    }),
  )
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId: string, query: any, _feature: any, signal: AbortSignal) {
    try {
      const queryText = typeof query === 'string' ? query : query?.text

      if (featureId === 'touch-translate') {
        const textToTranslate = queryText?.trim() ?? ''
        if (!textToTranslate) {
          lastQueryByFeature.delete(featureId)
          ensureIdleWidget(featureId)
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
