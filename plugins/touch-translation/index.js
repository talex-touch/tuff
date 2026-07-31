const { plugin, clipboard, logger, TuffItemBuilder, manifest: pluginManifest } = globalThis

const PLUGIN_NAME = 'touch-translation'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'class', value: 'i-ri-translate-2' }
const COPY_ACTION_ID = 'copy-translation'
const MAX_INPUT_LENGTH = 32 * 1024
const MAX_RESULT_LENGTH = 32 * 1024
const MAX_PROVIDERS = 3
const SUPPORTED_FEATURES = new Set(['touch-translate', 'multi-source-translate', 'screenshot-translate'])

const requestSequence = new Map()
let activeRequest = null
const approvedCopies = new Map()
let publishQueue = Promise.resolve()
let runtimeGeneration = 1
const activationGeneration = Number.isSafeInteger(pluginManifest?.activationGeneration)
  ? pluginManifest.activationGeneration
  : 0
const textEncoder = new TextEncoder()

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function truncateText(value, maximumBytes) {
  const text = normalizeText(value)
  if (textEncoder.encode(text).byteLength <= maximumBytes) return text

  const suffix = '…'
  const budget = maximumBytes - textEncoder.encode(suffix).byteLength
  let output = ''
  let size = 0
  for (const character of text) {
    const characterBytes = textEncoder.encode(character).byteLength
    if (size + characterBytes > budget) break
    output += character
    size += characterBytes
  }
  return `${output}${suffix}`
}

function queryText(query) {
  if (typeof query === 'string') return query
  return query && typeof query === 'object' && typeof query.text === 'string' ? query.text : ''
}

function queryImage(query) {
  if (!query || typeof query !== 'object' || !Array.isArray(query.inputs)) return ''
  const input = query.inputs.find(
    candidate =>
      candidate &&
      candidate.type === 'image' &&
      typeof candidate.content === 'string' &&
      candidate.content.startsWith('data:image/'),
  )
  return input ? input.content : ''
}

function detectLanguage(text) {
  return /[\u3400-\u9FFF]/u.test(text) ? 'zh' : 'auto'
}

function targetLanguage(sourceLanguage) {
  return sourceLanguage === 'zh' ? 'en' : 'zh'
}

function stableFailureCode(error) {
  if (!error || typeof error !== 'object') return 'TRANSLATION_FAILED'
  const descriptor = Object.getOwnPropertyDescriptor(error, 'code')
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
    ? descriptor.value
    : 'TRANSLATION_FAILED'
}

function failureKind(error) {
  const code = stableFailureCode(error)
  if (code.includes('PERMISSION'))
    return { title: '翻译权限未授予', subtitle: '请在插件权限设置中授予 intelligence.basic' }
  if (code.includes('CANCEL')) return { title: '翻译已取消', subtitle: '请求已安全停止' }
  return { title: '翻译失败', subtitle: '翻译服务暂不可用，请稍后重试' }
}

function infoItem(id, featureId, title, subtitle) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({ pluginName: PLUGIN_NAME, featureId })
    .build()
}

function resultItem(featureId, requestId, index, sourceText, result) {
  const translatedText = truncateText(result.result, MAX_RESULT_LENGTH)
  const providerName = truncateText(result.provider || 'host', 96)
  const modelName = truncateText(result.model || 'default', 96)
  return new TuffItemBuilder(`${featureId}-translation-${index}`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(translatedText || '翻译结果为空')
    .setSubtitle(`${providerName} · ${modelName} · 原文：${truncateText(sourceText, 160)}`)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: COPY_ACTION_ID,
    })
    .createAndAddAction(COPY_ACTION_ID, 'plugin', '复制译文', {
      requestId,
      text: translatedText,
    })
    .build()
}

function isCurrent(featureId, requestId, generation) {
  return (
    runtimeGeneration === generation && activeRequest?.featureId === featureId && activeRequest?.requestId === requestId
  )
}

function publish(featureId, requestId, generation, items, signal) {
  const task = publishQueue
    .catch(() => undefined)
    .then(async () => {
      if (!isCurrent(featureId, requestId, generation) || signal?.aborted) return false
      await plugin.feature.clearItems()
      if (!isCurrent(featureId, requestId, generation) || signal?.aborted) return false
      await plugin.feature.pushItems(items)
      return true
    })
  publishQueue = task.then(
    () => undefined,
    () => undefined,
  )
  return task
}

async function publicProviders() {
  const listed = await plugin.translation.listProviders()
  if (!Array.isArray(listed)) return []
  return listed
    .filter(
      provider =>
        provider &&
        typeof provider.providerId === 'string' &&
        provider.available === true &&
        Array.isArray(provider.capabilities) &&
        provider.capabilities.includes('text.translate'),
    )
    .slice(0, 32)
}

async function selectedProviders(featureId) {
  const available = await publicProviders()
  return available.slice(0, featureId === 'multi-source-translate' ? MAX_PROVIDERS : 1)
}

async function resolveInput(featureId, query, requestId) {
  const directText = truncateText(queryText(query), MAX_INPUT_LENGTH)
  if (directText) return directText
  if (featureId !== 'screenshot-translate') return ''

  const image = queryImage(query)
  if (!image) return ''
  const ocr = await plugin.translation.ocr(
    {
      source: { type: 'data-url', dataUrl: image },
      language: 'zh-CN',
      includeLayout: false,
      includeKeywords: false,
    },
    { metadata: { entry: featureId, featureId, requestId, capabilityId: 'vision.ocr' } },
  )
  return truncateText(ocr && ocr.result && ocr.result.text, MAX_INPUT_LENGTH)
}

async function translateWithProvider(featureId, requestId, text, provider) {
  const sourceLang = detectLanguage(text)
  const targetLang = targetLanguage(sourceLang)
  const defaultModel = typeof provider.defaultModel === 'string' ? provider.defaultModel : undefined
  return plugin.translation.translate(
    {
      text,
      ...(sourceLang === 'auto' ? {} : { sourceLang }),
      targetLang,
    },
    {
      preferredProviderId: provider.providerId,
      ...(defaultModel ? { modelPreference: [defaultModel] } : {}),
      metadata: {
        entry: featureId,
        featureId,
        requestId,
        capabilityId: 'text.translate',
        selectedProviderId: provider.providerId,
        ...(defaultModel ? { selectedModel: defaultModel } : {}),
      },
    },
  )
}

const lifecycle = {
  async onFeatureTriggered(featureId, query, _feature, signal) {
    if (!SUPPORTED_FEATURES.has(featureId)) return false

    const sequence = (requestSequence.get(featureId) || 0) + 1
    requestSequence.set(featureId, sequence)
    const generation = runtimeGeneration
    const requestId = `${featureId}-${activationGeneration}-${generation}-${sequence}`
    activeRequest = { featureId, requestId }
    approvedCopies.clear()

    try {
      if (signal?.aborted) return true
      await publish(
        featureId,
        requestId,
        generation,
        [infoItem(`${featureId}-pending`, featureId, '正在翻译', '正在通过受控智能服务处理')],
        signal,
      )

      const text = await resolveInput(featureId, query, requestId)
      if (!isCurrent(featureId, requestId, generation) || signal?.aborted) return true
      if (!text) {
        await publish(
          featureId,
          requestId,
          generation,
          [
            infoItem(
              `${featureId}-empty`,
              featureId,
              featureId === 'screenshot-translate' ? '未识别到图片文字' : '请输入要翻译的文本',
              '没有可翻译内容',
            ),
          ],
          signal,
        )
        return true
      }

      const providers = await selectedProviders(featureId)
      if (!isCurrent(featureId, requestId, generation) || signal?.aborted) return true
      if (providers.length === 0) {
        await publish(
          featureId,
          requestId,
          generation,
          [infoItem(`${featureId}-unavailable`, featureId, '翻译服务不可用', '没有可用的受控翻译模型')],
          signal,
        )
        return true
      }

      const settled = await Promise.allSettled(
        providers.map(provider => translateWithProvider(featureId, requestId, text, provider)),
      )
      if (!isCurrent(featureId, requestId, generation) || signal?.aborted) return true

      const items = []
      const copyTexts = []
      for (let index = 0; index < settled.length; index += 1) {
        const result = settled[index]
        if (result.status === 'fulfilled' && typeof result.value?.result === 'string') {
          const translatedText = truncateText(result.value.result, MAX_RESULT_LENGTH)
          items.push(
            resultItem(featureId, requestId, index, text, {
              ...result.value,
              result: translatedText,
            }),
          )
          if (translatedText) copyTexts.push(translatedText)
        }
      }
      if (items.length === 0) {
        const rejected = settled.find(result => result.status === 'rejected')
        const failure = failureKind(rejected && rejected.status === 'rejected' ? rejected.reason : null)
        items.push(infoItem(`${featureId}-failed`, featureId, failure.title, failure.subtitle))
      }
      const published = await publish(featureId, requestId, generation, items, signal)
      if (published && isCurrent(featureId, requestId, generation) && copyTexts.length > 0) {
        approvedCopies.set(featureId, { requestId, texts: new Set(copyTexts) })
      }
      return true
    } catch (error) {
      if (!isCurrent(featureId, requestId, generation) || signal?.aborted) return true
      const failure = failureKind(error)
      try {
        await publish(
          featureId,
          requestId,
          generation,
          [infoItem(`${featureId}-failed`, featureId, failure.title, failure.subtitle)],
          signal,
        )
      } catch {
        logger?.error?.('[touch-translation] Failed to publish translation state')
      }
      return true
    }
  },

  async onItemAction(item) {
    const featureId = normalizeText(item?.meta?.featureId)
    const currentRequestId = activeRequest?.featureId === featureId ? activeRequest.requestId : ''
    const actionId = normalizeText(item?.meta?.actionId || item?.meta?.defaultAction)
    if (!featureId || actionId !== COPY_ACTION_ID)
      return { externalAction: true, status: 'ignored', reason: 'action-unsupported' }

    const action = Array.isArray(item?.actions)
      ? item.actions.find(candidate => candidate && candidate.id === COPY_ACTION_ID)
      : null
    const payload = action && typeof action.payload === 'object' ? action.payload : null
    const requestId = normalizeText(payload?.requestId)
    const text = truncateText(payload?.text, MAX_RESULT_LENGTH)
    const approved = approvedCopies.get(featureId)
    if (!requestId || requestId !== currentRequestId || approved?.requestId !== requestId)
      return { externalAction: true, status: 'ignored', reason: 'stale-request' }
    if (!text || !approved.texts.has(text))
      return { externalAction: true, status: 'blocked', reason: 'invalid-payload' }

    try {
      await clipboard.writeText(text)
      return { externalAction: true, status: 'started' }
    } catch (error) {
      if (stableFailureCode(error).includes('PERMISSION')) {
        return {
          externalAction: true,
          success: false,
          status: 'blocked',
          reason: 'permission-denied',
        }
      }
      return {
        externalAction: true,
        success: false,
        status: 'failed',
        reason: 'clipboard-write-failed',
      }
    }
  },

  async onDestroy() {
    runtimeGeneration += 1
    activeRequest = null
    approvedCopies.clear()
    requestSequence.clear()
    return true
  },
}

module.exports = lifecycle
