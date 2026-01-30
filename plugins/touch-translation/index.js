const {
  plugin,
  clipboard,
  http,
  channel,
  logger,
  URLSearchParams,
  TuffItemBuilder,
  permission,
} = globalThis

const crypto = require('node:crypto')
const { createIntelligenceClient } = require('@talex-touch/utils/intelligence')
const { makeWidgetId } = require('@talex-touch/utils/plugin/widget')

const PLUGIN_NAME = 'touch-translation'
const WIDGET_ITEM_ID = 'translation-widget'

const latestRequestSeqByFeature = new Map()

const debounceTimersByFeature = new Map()
const abortControllersByFeature = new Map()
const lastQueryByFeature = new Map()
const widgetStateByFeature = new Map()

let networkPermissionState = null

async function ensureNetworkPermission() {
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

async function startTranslationRequest(textToTranslate, featureId, signal, nextSeq) {
  plugin.search.updateQuery(textToTranslate)
  plugin.feature.clearItems()

  const detectedLang = detectLanguage(textToTranslate)
  const targetLang = detectedLang === 'zh' ? 'en' : 'zh'
  const requestId = `translation-${Date.now()}-${nextSeq}`

  const providersConfig = await plugin.storage.getFile('providers_config')
  const enabledProviders = providersConfig
    ? Object.entries(providersConfig)
        .filter(([_id, config]) => config.enabled)
        .map(([id, config]) => ({ id, ...config }))
    : [{ id: 'tuffintelligence', enabled: true }]

  const providersToShow = enabledProviders.length > 0 ? enabledProviders : [{ id: 'tuffintelligence', enabled: true }]
  const state = createWidgetState(
    featureId,
    textToTranslate,
    detectedLang,
    targetLang,
    providersToShow,
    requestId,
    nextSeq
  )

  const ok = await ensureNetworkPermission()
  if (!ok) {
    state.error = '请在插件设置中授予网络权限以使用翻译功能'
    upsertWidgetItem(featureId)
    return
  }

  upsertWidgetItem(featureId)
  Promise.resolve().then(() => translateAndUpsertResults(textToTranslate, featureId, signal, nextSeq, providersToShow, detectedLang, targetLang))
}

/**
 * Creates an MD5 hash of the given string.
 * @param {string} string The string to hash.
 * @returns {string} The MD5 hash.
 */
function md5(string) {
  return crypto.createHash('md5').update(string).digest('hex')
}

function upsertFeatureItem(item) {
  try {
    plugin.feature.updateItem(item.id, item)
    return
  }
  catch (error) {
    // ignore and fallback to pushItems
  }

  plugin.feature.pushItems([item])
}

function formatProviderName(providerId) {
  const map = {
    tuffintelligence: 'Tuff Intelligence',
    google: 'Google',
    deepl: 'DeepL',
    bing: 'Bing',
    baidu: 'Baidu',
    tencent: 'Tencent',
    caiyun: 'Caiyun',
    custom: 'Custom',
    mymemory: 'MyMemory',
  }
  return map[providerId] || providerId
}

function resolveWidgetStatus(state) {
  if (!state.query) {
    return 'idle'
  }
  if (state.error) {
    return 'error'
  }
  const hasPending = state.providers.some(provider => provider.status === 'pending')
  return hasPending ? 'running' : 'complete'
}

function buildWidgetPayload(state) {
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

function buildWidgetItem(featureId, state) {
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

function upsertWidgetItem(featureId) {
  const state = widgetStateByFeature.get(featureId)
  if (!state) {
    return
  }
  state.updatedAt = Date.now()
  upsertFeatureItem(buildWidgetItem(featureId, state))
}

function ensureIdleWidget(featureId) {
  const state = {
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

function createWidgetState(featureId, textToTranslate, detectedLang, targetLang, providersToShow, requestId, requestSeq) {
  const state = {
    requestId,
    requestSeq,
    query: textToTranslate,
    detectedLang,
    targetLang,
    providers: providersToShow.map(provider => ({
      id: provider.id,
      name: formatProviderName(provider.id),
      status: 'pending',
    })),
    error: null,
    updatedAt: Date.now(),
  }

  widgetStateByFeature.set(featureId, state)
  return state
}

function updateProviderState(featureId, providerId, patch) {
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

/**
 * @param {string} originalText
 * @param {string} featureId
 * @param {string} service
 * @param {string} from
 * @param {string} to
 * @returns {import('@talex-touch/utils').TuffItem}
 */
/**
 * Runs translation asynchronously and upserts final results.
 * @param {string} textToTranslate
 * @param {string} featureId
 * @param {AbortSignal} signal
 * @param {number} requestSeq
 */
async function translateAndUpsertResults(textToTranslate, featureId, signal, requestSeq, providersToUse, detectedLang, targetLang) {
  try {
    if (signal?.aborted) {
      return
    }

    if (latestRequestSeqByFeature.get(featureId) !== requestSeq) {
      return
    }

    const state = widgetStateByFeature.get(featureId)
    if (!state || state.requestSeq !== requestSeq) {
      return
    }

    const runProvider = async (provider) => {
      if (signal?.aborted)
        return
      if (latestRequestSeqByFeature.get(featureId) !== requestSeq)
        return

      let result = null
      switch (provider.id) {
        case 'tuffintelligence':
          result = await translateWithTuffIntelligence(textToTranslate, detectedLang, targetLang)
          break
        case 'google':
          result = await translateWithGoogle(textToTranslate, 'auto', targetLang, signal)
          break
        case 'deepl':
          result = await translateWithDeepL(
            textToTranslate,
            'auto',
            targetLang,
            provider.config?.apiKey,
            signal,
          )
          break
        case 'bing':
          result = await translateWithBing(
            textToTranslate,
            'auto',
            targetLang,
            provider.config?.apiKey,
            provider.config?.region,
            signal,
          )
          break
        case 'baidu':
          result = await translateWithBaidu(
            textToTranslate,
            'auto',
            targetLang,
            provider.config?.appId,
            provider.config?.appKey,
            signal,
          )
          break
        case 'tencent':
          result = await translateWithTencent(
            textToTranslate,
            'auto',
            targetLang,
            provider.config?.secretId,
            provider.config?.secretKey,
            signal,
          )
          break
        case 'caiyun':
          result = await translateWithCaiyun(
            textToTranslate,
            'auto',
            targetLang,
            provider.config?.token,
            signal,
          )
          break
        case 'custom':
          result = await translateWithCustom(textToTranslate, 'auto', targetLang, provider.config, signal)
          break
        case 'mymemory':
          result = await translateWithMyMemory(textToTranslate, 'auto', targetLang, signal)
          break
        default:
          return
      }

      if (signal?.aborted)
        return
      if (latestRequestSeqByFeature.get(featureId) !== requestSeq)
        return

      if (!result || result.error) {
        const errorMessage = result?.error || 'translation failed'
        updateProviderState(featureId, provider.id, {
          status: 'error',
          error: errorMessage,
        })
        return
      }

      updateProviderState(featureId, provider.id, {
        status: 'success',
        translatedText: result.text,
        from: result.from || detectedLang,
        to: result.to || targetLang,
        provider: result.provider,
        model: result.model,
      })
    }

    await Promise.allSettled(providersToUse.map(runProvider))
  }
  catch (error) {
    if (!signal?.aborted) {
      logger.error('Error processing translation feature (async):', error)
    }
    const state = widgetStateByFeature.get(featureId)
    if (state) {
      state.error = error instanceof Error ? error.message : 'translation failed'
      upsertWidgetItem(featureId)
    }
  }
}

function detectLanguage(text) {
  const chineseRegex = /[\u4E00-\u9FFF]/
  return chineseRegex.test(text) ? 'zh' : 'en'
}

async function translateWithTuffIntelligence(text, from = 'auto', to = 'zh') {
  try {
    const client = createIntelligenceClient()

    const payload = {
      text,
      targetLang: to,
    }

    if (from && from !== 'auto') {
      payload.sourceLang = from
    }

    const response = await client.invoke('text.translate', payload)
    const translatedText = response?.result
    if (typeof translatedText !== 'string') {
      throw new TypeError('Invalid intelligence translate result')
    }

    return {
      text: translatedText.trim() || text,
      from,
      to,
      service: 'tuffintelligence',
      provider: response?.provider,
      model: response?.model,
    }
  }
  catch (error) {
    logger.error('TuffIntelligence Translate error:', error)
    return {
      text: `[TuffIntelligence Failed] ${text}`,
      from,
      to,
      service: 'tuffintelligence',
      error: error.message,
    }
  }
}

/**
 * @param {string} text
 * @param {string} from
 * @param {string} to
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function translateWithGoogle(text, from = 'auto', to = 'zh', signal) {
  try {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: from,
      tl: to,
      dt: 't',
      q: text,
    })

    const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`

    const response = await http.get(url, {
      signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    })

    const data = response.data || response

    if (!data || !Array.isArray(data) || !data[0]) {
      throw new Error('Invalid Google Translate API response format')
    }

    let translatedText = ''
    if (Array.isArray(data[0])) {
      translatedText = data[0].map(item => (item && item[0] ? item[0] : '')).join('')
    }
    else {
      translatedText = data[0] || text
    }

    const detectedLang = data[2] || from

    return {
      text: translatedText.trim() || text,
      from: detectedLang,
      to,
      service: 'google',
    }
  }
  catch (error) {
    logger.error('Google Translate error:', error)
    return {
      text: `[Translation Failed] ${text}`,
      from,
      to,
      service: 'google',
      error: error.message,
    }
  }
}

/**
 * @param {string} text
 * @param {string} from
 * @param {string} to
 * @param {string} apiKey
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function translateWithDeepL(text, from = 'auto', to = 'zh', apiKey, signal) {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers.Authorization = `DeepL-Auth-Key ${apiKey}`
  }

  try {
    const response = await http.post(
      'https://api-free.deepl.com/v2/translate',
      {
        text: [text],
        source_lang: from === 'auto' ? undefined : from.toUpperCase(),
        target_lang: to.toUpperCase(),
      },
      {
        signal,
        headers,
      },
    )

    const data = response.data
    if (!data || !data.translations || data.translations.length === 0) {
      throw new Error('Invalid DeepL API response format')
    }

    return {
      text: data.translations[0].text,
      from: data.translations[0].detected_source_language,
      to,
      service: 'deepl',
    }
  }
  catch (error) {
    logger.error('DeepL Translate error:', error)
    return {
      text: `[Translation Failed] ${text}`,
      from,
      to,
      service: 'deepl',
      error: error.message,
    }
  }
}

/**
 * @param {string} text
 * @param {string} from
 * @param {string} to
 * @param {string} apiKey
 * @param {string} region
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function translateWithBing(text, from = 'auto', to = 'zh', apiKey, region, signal) {
  if (!apiKey) {
    return {
      text: '[Bing API Key Not Configured]',
      from,
      to,
      service: 'bing',
      error: 'API Key is missing.',
    }
  }

  const params = new URLSearchParams({
    'api-version': '3.0',
    to,
  })

  if (from !== 'auto') {
    params.append('from', from)
  }

  try {
    const response = await http.post(
      `https://api.cognitive.microsofttranslator.com/translate?${params.toString()}`,
      [{ text }],
      {
        signal,
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Ocp-Apim-Subscription-Region': region,
          'Content-Type': 'application/json',
        },
      },
    )

    const data = response.data
    const translation = data[0]?.translations[0]

    if (!translation) {
      throw new Error('Invalid Bing API response format')
    }

    return {
      text: translation.text,
      from: data[0]?.detectedLanguage?.language || from,
      to,
      service: 'bing',
    }
  }
  catch (error) {
    logger.error('Bing Translate error:', error)
    return {
      text: `[Translation Failed] ${text}`,
      from,
      to,
      service: 'bing',
      error: error.message,
    }
  }
}

/**
 * @param {string} text
 * @param {string} from
 * @param {string} to
 * @param {string} appId
 * @param {string} appKey
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function translateWithBaidu(text, from = 'auto', to = 'zh', appId, appKey, signal) {
  if (!appId || !appKey) {
    return {
      text: '[Baidu API Key Not Configured]',
      from,
      to,
      service: 'baidu',
      error: 'App ID or App Key is missing.',
    }
  }

  const salt = Date.now()
  const sign = md5(appId + text + salt + appKey)
  const params = new URLSearchParams({
    q: text,
    from,
    to,
    appid: appId,
    salt,
    sign,
  })

  try {
    const response = await http.get(
      `https://api.fanyi.baidu.com/api/trans/vip/translate?${params.toString()}`,
      {
        signal,
      },
    )

    const data = response.data
    if (data.error_code) {
      throw new Error(`Baidu API Error: ${data.error_msg} (code: ${data.error_code})`)
    }

    const translation = data.trans_result[0]
    return {
      text: translation.dst,
      from: translation.from,
      to: translation.to,
      service: 'baidu',
    }
  }
  catch (error) {
    logger.error('Baidu Translate error:', error)
    return {
      text: `[Translation Failed] ${text}`,
      from,
      to,
      service: 'baidu',
      error: error.message,
    }
  }
}

/**
 * @param {string} text
 * @param {string} from
 * @param {string} to
 * @param {string} secretId
 * @param {string} secretKey
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function translateWithTencent(text, from = 'auto', to = 'zh', secretId, secretKey, signal) {
  if (!secretId || !secretKey) {
    return {
      text: '[Tencent API Key Not Configured]',
      from,
      to,
      service: 'tencent',
      error: 'Secret ID or Secret Key is missing.',
    }
  }

  const host = 'tmt.tencentcloudapi.com'
  const service = 'tmt'
  const version = '2018-03-21'
  const action = 'TextTranslate'
  const region = 'ap-guangzhou'
  const timestamp = Math.floor(Date.now() / 1000)

  const payload = JSON.stringify({
    SourceText: text,
    Source: from,
    Target: to,
    ProjectId: 0,
  })

  // 1. Create canonical request
  const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex')
  const httpRequestMethod = 'POST'
  const canonicalURI = '/'
  const canonicalQueryString = ''
  const canonicalHeaders = `content-type:application/json\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const canonicalRequest = `${httpRequestMethod}\n${canonicalURI}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`

  // 2. Create string to sign
  const algorithm = 'TC3-HMAC-SHA256'
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`

  // 3. Calculate signature
  const secretDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest()
  const secretService = crypto.createHmac('sha256', secretDate).update(service).digest()
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest()
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  // 4. Construct Authorization header
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  try {
    const response = await http.post(`https://${host}`, payload, {
      signal,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Version': version,
        'X-TC-Region': region,
      },
    })

    const data = response.data
    if (data.Response.Error) {
      throw new Error(
        `Tencent API Error: ${data.Response.Error.Message} (code: ${data.Response.Error.Code})`,
      )
    }

    return {
      text: data.Response.TargetText,
      from: data.Response.Source,
      to: data.Response.Target,
      service: 'tencent',
    }
  }
  catch (error) {
    logger.error('Tencent Translate error:', error)
    return {
      text: `[Translation Failed] ${text}`,
      from,
      to,
      service: 'tencent',
      error: error.message,
    }
  }
}

/**
 * @param {string} text
 * @param {string} from
 * @param {string} to
 * @param {string} token
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function translateWithCaiyun(text, from = 'auto', to = 'zh', token, signal) {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['x-authorization'] = `token ${token}`
  }

  const source = [text]
  const transType = from === 'auto' ? 'auto' : `${from}2${to}` // e.g., 'en2zh'

  try {
    const response = await http.post(
      'http://api.interpreter.caiyunai.com/v1/translator',
      {
        source,
        trans_type: transType,
        request_id: 'touch_plugin',
        detect: from === 'auto',
      },
      {
        signal,
        headers,
      },
    )

    const data = response.data
    if (data.message) {
      throw new Error(`Caiyun API Error: ${data.message}`)
    }

    return {
      text: data.target[0],
      from,
      to,
      service: 'caiyun',
    }
  }
  catch (error) {
    logger.error('Caiyun Translate error:', error)
    return {
      text: `[Translation Failed] ${text}`,
      from,
      to,
      service: 'caiyun',
      error: error.message,
    }
  }
}

/**
 * @param {string} text
 * @param {string} from
 * @param {string} to
 * @param {any} config
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function translateWithCustom(text, from = 'auto', to = 'zh', config, signal) {
  if (!config || !config.url) {
    return {
      text: '[Custom] URL not configured',
      from,
      to,
      service: 'custom',
      error: 'URL is missing in Custom provider config.',
    }
  }

  try {
    // Replace placeholders in URL, headers, and body
    const url = config.url
      .replace('{{text}}', encodeURIComponent(text))
      .replace('{{from}}', from)
      .replace('{{to}}', to)

    const headers = JSON.parse(
      JSON.stringify(config.headers || {})
        .replace('{{text}}', text)
        .replace('{{from}}', from)
        .replace('{{to}}', to),
    )

    const body = JSON.parse(
      JSON.stringify(config.body || {})
        .replace('{{text}}', text)
        .replace('{{from}}', from)
        .replace('{{to}}', to),
    )

    const response = await http.post(url, body, { signal, headers })

    const data = response.data
    // User needs to specify the path to the translated text in the config
    const resultPath = config.responsePath || 'text'
    const translatedText = resultPath.split('.').reduce((o, i) => (o ? o[i] : undefined), data)

    if (!translatedText) {
      throw new Error('Invalid or missing translated text in Custom AI response.')
    }

    return {
      text: translatedText,
      from,
      to,
      service: 'custom',
    }
  }
  catch (error) {
    logger.error('Custom Translate error:', error)
    return {
      text: `[Translation Failed] ${text}`,
      from,
      to,
      service: 'custom',
      error: error.message,
    }
  }
}

/**
 * @param {string} text
 * @param {string} from
 * @param {string} to
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function translateWithMyMemory(text, from = 'auto', to = 'zh', signal) {
  const langPair = `${from}|${to}`
  const params = new URLSearchParams({
    q: text,
    langpair: langPair,
  })

  try {
    const response = await http.get(
      `https://api.mymemory.translated.net/get?${params.toString()}`,
      {
        signal,
      },
    )

    const data = response.data
    if (data.responseStatus !== 200) {
      throw new Error(`MyMemory API Error: ${data.responseDetails}`)
    }

    return {
      text: data.responseData.translatedText,
      from,
      to,
      service: 'mymemory',
    }
  }
  catch (error) {
    logger.error('MyMemory Translate error:', error)
    return {
      text: `[Translation Failed] ${text}`,
      from,
      to,
      service: 'mymemory',
      error: error.message,
    }
  }
}

/**
 * @param {string} originalText
 * @param {any} translationResult
 * @returns {import('@talex-touch/utils').TuffItem}
 */
/**
 * @param {string} textToTranslate
 * @param {string} featureId
 * @param {AbortSignal} signal
 */
const pluginLifecycle = {
  /**
   * @param {string} featureId
   * @param {string} query
   * @param {any} feature
   * @param {AbortSignal} signal
   * @returns {Promise<void>}
   */
  async onFeatureTriggered(featureId, query, _feature, signal) {
    try {
      // 兼容新版本：query 可能是字符串或 TuffQuery 对象
      const queryText = typeof query === 'string' ? query : query?.text

      if (featureId === 'touch-translate') {
        const textToTranslate = queryText?.trim() || ''

        if (!textToTranslate) {
          lastQueryByFeature.delete(featureId)
          ensureIdleWidget(featureId)
          return true
        }

        // Check if query is the same as last query - if so, skip to avoid duplicate searches
        const lastQuery = lastQueryByFeature.get(featureId)
        if (lastQuery === textToTranslate) {
          // Same query, don't trigger new search
          return true
        }

        // Update last query
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
            logger.error('Error starting translation request (debounced):', e)
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

  async onItemAction(item) {
    if (item.meta?.defaultAction === 'copy') {
      const copyAction = item.actions.find(action => action.type === 'copy')
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
