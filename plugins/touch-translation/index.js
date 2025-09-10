const {
  clipboard,
  http,
  logger,
  search,
  pushItems,
  clearItems,
  URLSearchParams,
  TuffItemBuilder,
  $box,
  storage,
} = globalThis

const crypto = require('node:crypto')

/**
 * Creates an MD5 hash of the given string.
 * @param {string} string The string to hash.
 * @returns {string} The MD5 hash.
 */
function md5(string) {
  return crypto.createHash('md5').update(string).digest('hex')
}

/**
 * @param {string} text
 * @returns {string}
 */
function detectLanguage(text) {
  const chineseRegex = /[\u4E00-\u9FFF]/
  return chineseRegex.test(text) ? 'zh' : 'en'
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
    const response = await http.get(`https://api.fanyi.baidu.com/api/trans/vip/translate?${params.toString()}`, {
      signal,
    })

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
    const response = await http.post(
      `https://${host}`,
      payload,
      {
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
      },
    )

    const data = response.data
    if (data.Response.Error) {
      throw new Error(`Tencent API Error: ${data.Response.Error.Message} (code: ${data.Response.Error.Code})`)
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
    const response = await http.get(`https://api.mymemory.translated.net/get?${params.toString()}`, {
      signal,
    })

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
function createTranslationSearchItem(originalText, translationResult, featureId) {
  const { text: translatedText, from, to, service } = translationResult

  const serviceName = service.charAt(0).toUpperCase() + service.slice(1)

  return new TuffItemBuilder(`translation-${originalText}-${service}`)
    .setSource('plugin', 'plugin-features')
    .setTitle(translatedText)
    .setSubtitle(`${serviceName}: ${from} → ${to}`)
    .setIcon({ type: 'remix', value: 'translate' })
    .createAndAddAction('copy-translation', 'copy', '复制', translatedText)
    .addTag('Translation', 'blue')
    .setMeta({
      featureId,
      defaultAction: 'copy',
      pluginType: 'translation',
      originalText,
      translatedText,
      fromLang: from,
      toLang: to,
      serviceName: service,
    })
    .build()
}

/**
 * @param {string} textToTranslate
 * @param {string} featureId
 * @param {AbortSignal} signal
 */
async function translateAndPushResults(textToTranslate, featureId, signal) {
  search.updateQuery(textToTranslate)
  clearItems()

  const detectedLang = detectLanguage(textToTranslate)
  const targetLang = detectedLang === 'zh' ? 'en' : 'zh'

  const { storage } = globalThis
  const providersConfig = storage.getItem('providers_config')

  if (!providersConfig) {
    logger.warn('No providers config found. Falling back to Google Translate.')
    // Fallback to old behavior if no config is found
    const result = await translateWithGoogle(textToTranslate, 'auto', targetLang, signal)
    const searchItem = createTranslationSearchItem(textToTranslate, result, featureId)
    pushItems([searchItem])
    return
  }

  const enabledProviders = Object.entries(providersConfig)
    .filter(([_id, config]) => config.enabled)
    .map(([id, config]) => ({ id, ...config }))

  if (enabledProviders.length === 0) {
    logger.info('No enabled providers.')
    const infoItem = new TuffItemBuilder('no-providers-info')
      .setTitle('No enabled translation providers')
      .setSubtitle('Please enable at least one provider in the plugin settings.')
      .build()
    pushItems([infoItem])
    return
  }

  const translationPromises = enabledProviders.map((provider) => {
    switch (provider.id) {
      case 'google':
        return translateWithGoogle(textToTranslate, 'auto', targetLang, signal)
      case 'deepl':
        return translateWithDeepL(textToTranslate, 'auto', targetLang, provider.config?.apiKey, signal)
      case 'bing':
        if (!provider.config?.apiKey) {
          return Promise.resolve({
            text: '[Bing] API Key not set',
            from: 'plugin',
            to: 'config',
            service: 'bing',
            error: 'API Key is missing.',
          })
        }
        return translateWithBing(
          textToTranslate,
          'auto',
          targetLang,
          provider.config.apiKey,
          provider.config.region,
          signal,
        )
      case 'baidu':
        if (!provider.config?.appId || !provider.config?.appKey) {
          return Promise.resolve({
            text: '[Baidu] App ID or Key not set',
            from: 'plugin',
            to: 'config',
            service: 'baidu',
            error: 'App ID or App Key is missing.',
          })
        }
        return translateWithBaidu(
          textToTranslate,
          'auto',
          targetLang,
          provider.config.appId,
          provider.config.appKey,
          signal,
        )
      case 'tencent':
        if (!provider.config?.secretId || !provider.config?.secretKey) {
          return Promise.resolve({
            text: '[Tencent] Secret ID or Key not set',
            from: 'plugin',
            to: 'config',
            service: 'tencent',
            error: 'Secret ID or Secret Key is missing.',
          })
        }
        return translateWithTencent(
          textToTranslate,
          'auto',
          targetLang,
          provider.config.secretId,
          provider.config.secretKey,
          signal,
        )
      case 'caiyun':
        return translateWithCaiyun(
          textToTranslate,
          'auto',
          targetLang,
          provider.config?.token,
          signal,
        )
      case 'custom':
        if (!provider.config) {
          return Promise.resolve({
            text: '[Custom] Not configured',
            from: 'plugin',
            to: 'config',
            service: 'custom',
            error: 'Configuration is missing.',
          })
        }
        return translateWithCustom(
          textToTranslate,
          'auto',
          targetLang,
          provider.config,
          signal,
        )
      case 'mymemory':
        return translateWithMyMemory(textToTranslate, 'auto', targetLang, signal)
      default:
        logger.warn(`Provider ${provider.id} is not supported in backend yet.`)
        return Promise.resolve(null)
    }
  })

  const results = await Promise.allSettled(translationPromises)

  const searchItems = results
    .filter(result => result.status === 'fulfilled' && result.value)
    .map(result => createTranslationSearchItem(textToTranslate, result.value, featureId))

  if (searchItems.length > 0) {
    pushItems(searchItems)
  }
  else {
    const errorItem = new TuffItemBuilder('translation-error')
      .setTitle('All translations failed')
      .setSubtitle('Check logs for more details.')
      .build()
    pushItems([errorItem])
  }
}

const pluginLifecycle = {
  /**
   * @param {string} featureId
   * @param {string} query
   * @param {any} feature
   * @param {AbortSignal} signal
   * @returns {Promise<void>}
   */
  async onFeatureTriggered(featureId, query, feature, signal) {
    try {
      if (featureId === 'touch-translate' && query && query.trim()) {
        logger.info('===', storage.getAllItems())
        await translateAndPushResults(query.trim(), featureId, signal)
      }
    }
    catch (error) {
      logger.error('Error processing translation feature:', error)
    }
  },

  /**
   * @param {import('@talex-touch/utils').TuffItem} item
   */
  async onItemAction(item) {
    if (item.meta?.defaultAction === 'copy') {
      // Find the action with type 'copy' from the actions array
      const copyAction = item.actions.find(action => action.type === 'copy')
      if (copyAction && copyAction.payload) {
        clipboard.writeText(copyAction.payload)
        logger.log('Copied to clipboard:', copyAction.payload)

        $box.hide()
      }
      else {
        logger.warn('No copy action or payload found for item:', item)
      }
    }
  },
}

module.exports = pluginLifecycle
