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
 * @param {string} originalText
 * @param {any} translationResult
 * @returns {import('@talex-touch/utils').TuffItem}
 */
function createTranslationSearchItem(originalText, translationResult, featureId) {
  const { text: translatedText, from, to, service } = translationResult

  return new TuffItemBuilder(`translation-${originalText}`)
    .setSource('plugin', 'plugin-features')
    .setTitle(translatedText)
    .setSubtitle(`Google Translate: ${from} → ${to}`)
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

  try {
    const result = await translateWithGoogle(textToTranslate, 'auto', targetLang, signal)
    const searchItem = createTranslationSearchItem(textToTranslate, result, featureId)

    pushItems([searchItem])

    return [searchItem]
  }
  catch (error) {
    logger.error('Translation failed:', error)

    const errorItem = new TuffItemBuilder('translation-error')
      .setSource('plugin', 'plugin-features')
      .setTitle('Translation Failed')
      .setSubtitle(error.message)
      .setIcon('remix:error-warning')
      .addTag('Error', 'red')
      .setMeta({
        pluginType: 'translation-error',
        originalText: textToTranslate,
        error: error.message,
      })
      .build()

    pushItems([errorItem])
    return [errorItem]
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
