import { createFailedItem, createPendingItem, createSuccessItem } from './item-builder'
import { GoogleProvider, TuffIntelligenceProvider } from './providers'
import { detectLanguage } from './utils'

const { plugin, clipboard, logger, permission } = globalThis as any

const latestRequestSeqByFeature = new Map<string, number>()
const debounceTimersByFeature = new Map<string, NodeJS.Timeout>()
const abortControllersByFeature = new Map<string, AbortController>()
const lastQueryByFeature = new Map<string, string>()

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

function upsertFeatureItem(item: any) {
  try {
    plugin.feature.updateItem(item.id, item)
  } catch {
    plugin.feature.pushItems([item])
  }
}

async function startTranslationRequest(
  textToTranslate: string,
  featureId: string,
  signal: AbortSignal,
  nextSeq: number
) {
  const ok = await ensureNetworkPermission()
  if (!ok) {
    const errorItem = {
      id: 'permission-denied',
      title: '需要网络权限',
      subtitle: '请在插件设置中授予网络权限以使用翻译功能',
      icon: { type: 'file', value: 'assets/logo.svg' },
    }
    plugin.feature.pushItems([errorItem])
    return
  }

  plugin.search.updateQuery(textToTranslate)
  plugin.feature.clearItems()

  const detectedLang = detectLanguage(textToTranslate)
  const targetLang = detectedLang === 'zh' ? 'en' : 'zh'

  const providersConfig = await plugin.storage.getFile('providers_config')
  const enabledProviders = providersConfig
    ? Object.entries(providersConfig)
        .filter(([_id, config]: [string, any]) => config.enabled)
        .map(([id]: [string, any]) => id)
    : ['tuffintelligence']

  const providersToShow = enabledProviders.length > 0 ? enabledProviders : ['tuffintelligence']
  const pendingItems = providersToShow.map((id) =>
    createPendingItem(textToTranslate, featureId, id, detectedLang, targetLang)
  )
  plugin.feature.pushItems(pendingItems)

  const runProvider = async (providerId: string) => {
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

      if (result.error) {
        upsertFeatureItem(createFailedItem(textToTranslate, providerId, featureId, detectedLang, targetLang, result.error))
      } else {
        upsertFeatureItem(createSuccessItem(textToTranslate, result, featureId))
      }
    } catch (error) {
      if (!signal?.aborted) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        upsertFeatureItem(createFailedItem(textToTranslate, providerId, featureId, detectedLang, targetLang, errorMsg))
      }
    }
  }

  await Promise.allSettled(providersToShow.map(runProvider))
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId: string, query: any, _feature: any, signal: AbortSignal) {
    try {
      const queryText = typeof query === 'string' ? query : query?.text

      if (featureId === 'touch-translate' && queryText && queryText.trim()) {
        const textToTranslate = queryText.trim()

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
          } else {
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
    } catch (error) {
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
      } else {
        logger.warn('No copy action or payload found for item:', item)
      }
    }
  },
}

module.exports = pluginLifecycle
