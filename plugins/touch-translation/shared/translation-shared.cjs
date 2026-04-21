const NO_INPUT_TEXT_MESSAGE = '无输入：请输入要翻译的文本'
const NO_INPUT_SCREENSHOT_MESSAGE = '无输入：请先截取图片或输入文本后再翻译'
const NO_INPUT_OCR_MESSAGE = '无输入：截图中未识别到可翻译文本，请更换区域后重试'
const PERMISSION_DENIED_MESSAGE = '权限被拒绝：请在插件设置中授予所需权限后重试'
const CALL_FAILED_MESSAGE = '调用失败：翻译服务暂不可用，请稍后重试'

const TRANSLATION_PROVIDER_ORDER = [
  'tuffintelligence',
  'google',
  'deepl',
  'bing',
  'custom',
  'baidu',
  'tencent',
  'mymemory',
]

const DEFAULT_ENABLED_PROVIDER_IDS = ['tuffintelligence', 'google']

const TRANSLATION_PROVIDER_LABELS = {
  tuffintelligence: 'Tuff Intelligence',
  google: 'Google',
  deepl: 'DeepL',
  bing: 'Bing',
  custom: 'Custom AI',
  baidu: 'Baidu',
  tencent: 'Tencent',
  mymemory: 'MyMemory',
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function detectLanguage(text) {
  const normalized = normalizeText(text)
  return /[\u4E00-\u9FFF]/.test(normalized) ? 'zh' : 'en'
}

function normalizeLanguageCode(input) {
  const value = normalizeText(input).toLowerCase()
  if (['zh', 'zh-cn', 'zh-hans', 'zh-hant'].includes(value)) {
    return 'zh'
  }
  if (['en', 'en-us', 'en-gb'].includes(value)) {
    return 'en'
  }
  return ''
}

function resolveTargetLanguage(input) {
  const normalized = normalizeLanguageCode(input) || detectLanguage(input)
  return normalized === 'zh' ? 'en' : 'zh'
}

function getTranslationProviderLabel(providerId) {
  return TRANSLATION_PROVIDER_LABELS[providerId] || providerId
}

function getProviderOrderIndex(providerId) {
  const index = TRANSLATION_PROVIDER_ORDER.indexOf(providerId)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function isDefaultEnabledProvider(providerId) {
  return DEFAULT_ENABLED_PROVIDER_IDS.includes(providerId)
}

function getEnabledProviderIds(rawConfig, options = {}) {
  const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
  const supportedIds = Array.isArray(options.supportedIds) && options.supportedIds.length
    ? options.supportedIds
    : TRANSLATION_PROVIDER_ORDER
  const supportedSet = new Set(supportedIds)
  const orderedIds = [...TRANSLATION_PROVIDER_ORDER, ...supportedIds.filter(id => !TRANSLATION_PROVIDER_ORDER.includes(id))]

  const enabledIds = []
  for (const providerId of orderedIds) {
    if (!supportedSet.has(providerId)) {
      continue
    }
    const entry = config[providerId]
    if (entry && typeof entry === 'object' && entry.enabled === true) {
      enabledIds.push(providerId)
    }
  }

  if (enabledIds.length > 0) {
    return enabledIds
  }

  const fallbackIds = Array.isArray(options.fallbackIds) && options.fallbackIds.length
    ? options.fallbackIds
    : DEFAULT_ENABLED_PROVIDER_IDS

  return fallbackIds.filter(providerId => supportedSet.has(providerId))
}

function normalizeCallFailureMessage(rawMessage) {
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : ''
  return message ? `${CALL_FAILED_MESSAGE}（${message}）` : CALL_FAILED_MESSAGE
}

function normalizeTranslationErrorMessage(rawMessage) {
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : ''
  if (!message) {
    return CALL_FAILED_MESSAGE
  }

  const lowerMessage = message.toLowerCase()
  if (
    lowerMessage.includes('permission')
    || lowerMessage.includes('权限')
    || lowerMessage.includes('denied')
    || lowerMessage.includes('forbidden')
    || lowerMessage.includes('unauthorized')
    || lowerMessage.includes('network.internet')
    || lowerMessage.includes('intelligence.basic')
  ) {
    return PERMISSION_DENIED_MESSAGE
  }

  if (message.startsWith('无输入')) {
    return NO_INPUT_TEXT_MESSAGE
  }

  return normalizeCallFailureMessage(message)
}

function applyProviderPresentation(provider) {
  if (!provider || typeof provider !== 'object' || typeof provider.id !== 'string') {
    return provider
  }

  provider.name = getTranslationProviderLabel(provider.id)
  return provider
}

module.exports = {
  CALL_FAILED_MESSAGE,
  DEFAULT_ENABLED_PROVIDER_IDS,
  NO_INPUT_OCR_MESSAGE,
  NO_INPUT_SCREENSHOT_MESSAGE,
  NO_INPUT_TEXT_MESSAGE,
  PERMISSION_DENIED_MESSAGE,
  TRANSLATION_PROVIDER_LABELS,
  TRANSLATION_PROVIDER_ORDER,
  applyProviderPresentation,
  detectLanguage,
  getEnabledProviderIds,
  getProviderOrderIndex,
  getTranslationProviderLabel,
  isDefaultEnabledProvider,
  normalizeCallFailureMessage,
  normalizeTranslationErrorMessage,
  resolveTargetLanguage,
}
