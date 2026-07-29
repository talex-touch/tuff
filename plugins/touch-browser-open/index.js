const { plugin, clipboard, http, logger, TuffItemBuilder, features, platform: hostPlatform } = globalThis

const PLUGIN_NAME = 'touch-browser-open'
const SOURCE_ID = 'plugin-features'
const BROWSER_FEATURE_ID = 'browser-open'
const WEB_SEARCH_FEATURE_ID = 'web-search'
const SEARCH_ENGINE_FEATURE_PREFIX = 'search-engine-'
const SEARCH_SETTINGS_FILE = 'search-settings.json'
const RECENT_FILE = 'recent-browsers.json'
const ICON = { type: 'class', value: 'i-ri-global-line' }
const SEARCH_ICON = { type: 'class', value: 'i-ri-search-line' }
const RECENT_MAX_ITEMS = 20
const RECENT_SHOW_LIMIT = 5
const RECENT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SUGGEST_LIMIT = 6
const SUGGEST_TEXT_LIMIT = 128
const URL_BYTE_LIMIT = 2048
const ACTION_IDS = new Set(['copy-url', 'default-open', 'search-web', 'open-browser'])

const SEARCH_ENGINES = [
  {
    id: 'google',
    name: 'Google',
    featureName: 'Google 搜索引擎',
    keywords: ['google', 'g', '谷歌', 'google 搜索', '谷歌搜索'],
    commands: ['google', 'g', '谷歌'],
    searchUrl: query => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    suggestUrl: query =>
      `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`,
    suggestions: payload => (Array.isArray(payload?.[1]) ? payload[1] : []),
  },
  {
    id: 'bing',
    name: 'Bing',
    featureName: 'Bing 搜索引擎',
    keywords: ['bing', '必应', 'bing 搜索', '必应搜索'],
    commands: ['bing', '必应'],
    searchUrl: query => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
    suggestUrl: query => `https://www.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`,
    suggestions: payload => (Array.isArray(payload?.[1]) ? payload[1] : []),
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    featureName: 'DuckDuckGo 搜索引擎',
    keywords: ['duckduckgo', 'ddg', 'duck', 'duckduckgo 搜索'],
    commands: ['duckduckgo', 'ddg', 'duck'],
    searchUrl: query => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    suggestUrl: query => `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`,
    suggestions: payload => (Array.isArray(payload) ? payload.map(item => item?.phrase) : []),
  },
]

const SEARCH_ENGINE_BY_ID = new Map(SEARCH_ENGINES.map(engine => [engine.id, engine]))
const SEARCH_COMMAND_TO_ENGINE = new Map()
for (const engine of SEARCH_ENGINES) {
  for (const command of engine.commands) SEARCH_COMMAND_TO_ENGINE.set(command.toLowerCase(), engine.id)
}

let requestSequence = 0
let activeSearch = null
let browsersByToken = new Map()

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeSearchText(value) {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function getQueryText(query) {
  return typeof query === 'string' ? query : (query?.text ?? '')
}

function utf8Length(value) {
  return new TextEncoder().encode(value).byteLength
}

function containsControlCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1F || code === 0x7F)
      return true
  }
  return false
}

function normalizeUrlInput(value) {
  let input = normalizeText(value)
  if (!input || containsControlCharacter(input) || utf8Length(input) > URL_BYTE_LIMIT)
    return null
  if (!/^https?:\/\//i.test(input)) {
    if (!/^www\./i.test(input) && !/^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(input))
      return null
    input = `https://${input.replace(/^\/+/, '')}`
  }
  try {
    const parsed = new URL(input)
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      || parsed.username
      || parsed.password
      || !parsed.hostname
    ) {
      return null
    }
    const normalized = parsed.toString()
    return utf8Length(normalized) <= URL_BYTE_LIMIT ? normalized : null
  }
  catch {
    return null
  }
}

function truncateText(value, maximum = 80) {
  const text = normalizeText(value)
  return text.length <= maximum ? text : `${text.slice(0, maximum - 3)}...`
}

function currentPlatform() {
  return typeof hostPlatform?.platform === 'string' ? hostPlatform.platform : 'unsupported'
}

function platformFlags() {
  const current = currentPlatform()
  const state = enabled => ({ enable: enabled, arch: [], os: [] })
  return {
    win: state(current === 'win32'),
    darwin: state(current === 'darwin'),
    linux: state(current === 'linux'),
  }
}

function normalizeSearchSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const enabled = Array.isArray(source.enabledEngines)
    ? source.enabledEngines.filter(id => SEARCH_ENGINE_BY_ID.has(id))
    : SEARCH_ENGINES.map(engine => engine.id)
  const enabledEngines = [...new Set(enabled)]
  if (enabledEngines.length === 0)
    enabledEngines.push('google')
  const defaultEngine = enabledEngines.includes(source.defaultEngine) ? source.defaultEngine : enabledEngines[0]
  return { defaultEngine, enabledEngines }
}

async function loadSearchSettings() {
  try {
    return normalizeSearchSettings(await plugin.storage.getFile(SEARCH_SETTINGS_FILE))
  }
  catch {
    return normalizeSearchSettings(null)
  }
}

function parseSearchQuery(input, settings) {
  const text = normalizeSearchText(input)
  const [first = '', ...rest] = text.split(' ')
  const selected = SEARCH_COMMAND_TO_ENGINE.get(first.toLowerCase())
  const engineId = selected || settings.defaultEngine
  return {
    engine: SEARCH_ENGINE_BY_ID.get(engineId) || SEARCH_ENGINE_BY_ID.get('google'),
    query: selected ? normalizeSearchText(rest.join(' ')) : text,
  }
}

function engineFromFeature(featureId) {
  if (!normalizeText(featureId).startsWith(SEARCH_ENGINE_FEATURE_PREFIX))
    return null
  return SEARCH_ENGINE_BY_ID.get(featureId.slice(SEARCH_ENGINE_FEATURE_PREFIX.length)) || null
}

function extractEngineQuery(engine, input) {
  const text = normalizeSearchText(input)
  const lower = text.toLowerCase()
  const tokens = [...new Set([engine.featureName, ...engine.keywords, ...engine.commands])].sort(
    (left, right) => right.length - left.length,
  )
  for (const token of tokens) {
    const normalized = token.toLowerCase()
    if (lower === normalized)
      return ''
    if (lower.startsWith(`${normalized} `))
      return normalizeSearchText(text.slice(token.length))
  }
  return text
}

function buildSearchUrl(engine, query) {
  const text = normalizeSearchText(query)
  return text ? engine.searchUrl(text) : null
}

function uniqueSuggestions(values) {
  const output = []
  const seen = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    const text = normalizeSearchText(value)
    const key = text.toLowerCase()
    if (!text || utf8Length(text) > SUGGEST_TEXT_LIMIT || seen.has(key))
      continue
    seen.add(key)
    output.push(text)
    if (output.length >= SUGGEST_LIMIT)
      break
  }
  return output
}

function buildInfoItem(id, featureId, title, subtitle, icon = ICON) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(icon)
    .setMeta({ pluginName: PLUGIN_NAME, featureId })
    .build()
}

function buildActionItem({ id, featureId, title, subtitle, actionId, payload, icon = ICON }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(icon)
    .setMeta({ pluginName: PLUGIN_NAME, featureId, defaultAction: actionId })
    .createAndAddAction(actionId, 'plugin', title, payload)
    .build()
}

async function publishItems(items, sequence) {
  if (sequence !== requestSequence)
    return false
  await plugin.feature.clearItems()
  if (sequence !== requestSequence)
    return false
  await plugin.feature.pushItems(items)
  return true
}

function nextRequest() {
  requestSequence += 1
  return requestSequence
}

function parseRecentBrowsers(raw) {
  const now = Date.now()
  const threshold = now - RECENT_TTL_MS
  const items = Array.isArray(raw?.items) ? raw.items : []
  const output = []
  const seen = new Set()
  for (const item of items) {
    const id = normalizeText(item?.id)
    const name = normalizeText(item?.name)
    const lastUsedAt = Number(item?.lastUsedAt)
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(id) || !name || name.length > 64)
      continue
    if (!Number.isFinite(lastUsedAt) || lastUsedAt < threshold || seen.has(id))
      continue
    seen.add(id)
    output.push({ id, name, lastUsedAt: Math.trunc(lastUsedAt) })
  }
  return output.sort((left, right) => right.lastUsedAt - left.lastUsedAt).slice(0, RECENT_MAX_ITEMS)
}

async function loadRecentBrowsers() {
  try {
    return parseRecentBrowsers(await plugin.storage.getFile(RECENT_FILE))
  }
  catch {
    return []
  }
}

async function saveRecentBrowser(browser) {
  const recent = await loadRecentBrowsers()
  const next = [
    { id: browser.id, name: browser.name, lastUsedAt: Date.now() },
    ...recent.filter(item => item.id !== browser.id),
  ].slice(0, RECENT_MAX_ITEMS)
  await plugin.storage.setFile(RECENT_FILE, { items: next, updatedAt: Date.now() })
}

function stableFailure(error, fallback) {
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    return { status: 'blocked', reason: 'permission-denied' }
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    return { status: 'blocked', reason: 'permission-unavailable' }
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED')
    return { status: 'cancelled', reason: 'cancelled' }
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT')
    return { status: 'failed', reason: 'timeout' }
  return { status: 'failed', reason: fallback }
}

function external(result, success = false) {
  return {
    externalAction: true,
    success,
    status: result.status,
    ...(result.reason ? { reason: result.reason } : {}),
  }
}

async function listBrowsers() {
  if (!plugin.browser || typeof plugin.browser.list !== 'function')
    throw Object.assign(new Error('browser capability unavailable'), { code: 'CAPABILITY_UNAVAILABLE' })
  const result = await plugin.browser.list()
  if (result?.status !== 'available' || !Array.isArray(result.browsers))
    return result
  const next = new Map()
  const browsers = []
  for (const browser of result.browsers.slice(0, 16)) {
    if (
      typeof browser?.id !== 'string'
      || typeof browser?.name !== 'string'
      || typeof browser?.token !== 'string'
      || !/^bo_[\w-]{32}$/.test(browser.token)
    ) {
      continue
    }
    const display = { id: browser.id, name: browser.name, token: browser.token }
    browsers.push(display)
    next.set(browser.token, display)
  }
  browsersByToken = next
  return { ...result, browsers }
}

async function handleBrowserFeature(featureId, query) {
  const sequence = nextRequest()
  const input = getQueryText(query)
  const url = normalizeUrlInput(input)
  if (!url) {
    await publishItems(
      [
        buildInfoItem(
          `${featureId}-input`,
          featureId,
          normalizeText(input) ? 'URL 格式不正确' : '请输入 URL',
          '支持 example.com 或 https://example.com',
        ),
      ],
      sequence,
    )
    return true
  }

  let result
  try {
    result = await listBrowsers()
  }
  catch (error) {
    const failure = stableFailure(error, 'browser-list-failed')
    await publishItems(
      [
        buildInfoItem(`${featureId}-blocked`, featureId, '浏览器打开不可用', failure.reason),
        buildActionItem({
          id: `${featureId}-copy`,
          featureId,
          title: '复制 URL',
          subtitle: truncateText(url),
          actionId: 'copy-url',
          payload: { url },
        }),
      ],
      sequence,
    )
    return true
  }

  if (result?.status !== 'available') {
    await publishItems(
      [buildInfoItem(`${featureId}-blocked`, featureId, '浏览器打开不可用', result?.reason || 'browser-list-failed')],
      sequence,
    )
    return true
  }

  const recent = await loadRecentBrowsers()
  const availableById = new Map(result.browsers.map(browser => [browser.id, browser]))
  const recentBrowsers = recent
    .map(item => availableById.get(item.id))
    .filter(Boolean)
    .slice(0, RECENT_SHOW_LIMIT)
  const items = [
    buildInfoItem(`${featureId}-quick`, featureId, '快捷动作', '默认浏览器或复制 URL'),
    buildActionItem({
      id: `${featureId}-default`,
      featureId,
      title: '默认浏览器打开',
      subtitle: truncateText(url),
      actionId: 'default-open',
      payload: { url },
    }),
    buildActionItem({
      id: `${featureId}-copy`,
      featureId,
      title: '复制 URL',
      subtitle: truncateText(url),
      actionId: 'copy-url',
      payload: { url },
    }),
  ]

  if (result.browsers.length > 0) {
    items.push(buildInfoItem(`${featureId}-available`, featureId, '可用浏览器', '短期令牌，单次使用'))
    result.browsers.forEach((browser, index) => {
      items.push(
        buildActionItem({
          id: `${featureId}-browser-${index}`,
          featureId,
          title: `用 ${browser.name} 打开`,
          subtitle: truncateText(url),
          actionId: 'open-browser',
          payload: { url, browserToken: browser.token },
        }),
      )
    })
  }
  if (recentBrowsers.length > 0) {
    items.push(buildInfoItem(`${featureId}-recent`, featureId, '最近浏览器', '已重新签发短期令牌'))
    recentBrowsers.forEach((browser, index) => {
      items.push(
        buildActionItem({
          id: `${featureId}-recent-${index}`,
          featureId,
          title: `最近 · ${browser.name}`,
          subtitle: truncateText(url),
          actionId: 'open-browser',
          payload: { url, browserToken: browser.token },
        }),
      )
    })
  }
  await publishItems(items, sequence)
  return true
}

async function loadSuggestions(engine, query) {
  if (!http || typeof http.get !== 'function')
    throw Object.assign(new Error('http capability unavailable'), { code: 'CAPABILITY_UNAVAILABLE' })
  const response = await http.get(engine.suggestUrl(query), {
    responseType: 'json',
    timeoutMs: 2500,
    headers: { accept: 'application/json,text/javascript' },
  })
  if (!response || response.ok !== true || response.status < 200 || response.status >= 300)
    throw new Error('suggestion-request-failed')
  return uniqueSuggestions(engine.suggestions(response.data))
}

function buildSearchItems(featureId, engine, query, suggestions, warning) {
  const text = normalizeSearchText(query)
  if (!text) {
    return [buildInfoItem(`${featureId}-empty`, featureId, `${engine.name} 搜索`, '继续输入搜索词', SEARCH_ICON)]
  }
  const items = []
  const directUrl = buildSearchUrl(engine, text)
  items.push(
    buildActionItem({
      id: `${featureId}-direct`,
      featureId,
      title: `${engine.name} 搜索：${truncateText(text, 48)}`,
      subtitle: truncateText(directUrl),
      actionId: 'search-web',
      payload: { url: directUrl },
      icon: SEARCH_ICON,
    }),
  )
  suggestions
    .filter(suggestion => suggestion.toLowerCase() !== text.toLowerCase())
    .forEach((suggestion, index) => {
      items.push(
        buildActionItem({
          id: `${featureId}-suggestion-${index}`,
          featureId,
          title: suggestion,
          subtitle: `${engine.name} 搜索建议`,
          actionId: 'search-web',
          payload: { url: buildSearchUrl(engine, suggestion) },
          icon: SEARCH_ICON,
        }),
      )
    })
  if (warning)
    items.push(buildInfoItem(`${featureId}-warning`, featureId, '搜索建议不可用', warning, SEARCH_ICON))
  return items
}

async function handleSearchFeature(featureId, engine, query, signal) {
  const sequence = nextRequest()
  const text = normalizeSearchText(query)
  activeSearch = { featureId, engine }
  await publishItems(buildSearchItems(featureId, engine, text, [], ''), sequence)
  if (!text || signal?.aborted)
    return true
  try {
    const suggestions = await loadSuggestions(engine, text)
    if (!signal?.aborted)
      await publishItems(buildSearchItems(featureId, engine, text, suggestions, ''), sequence)
  }
  catch (error) {
    if (!signal?.aborted) {
      const failure = stableFailure(error, 'suggestions-unavailable')
      await publishItems(buildSearchItems(featureId, engine, text, [], failure.reason), sequence)
    }
  }
  return true
}

function selectedAction(item, context) {
  const actionId = normalizeText(context?.actionId || item?.meta?.defaultAction)
  if (!ACTION_IDS.has(actionId) || !Array.isArray(item?.actions))
    return null
  const action = item.actions.find(candidate => candidate?.id === actionId)
  const payload = action?.payload
  if (!payload || typeof payload !== 'object')
    return null
  const keys = Object.keys(payload)
  const url = normalizeUrlInput(payload.url)
  if (!url)
    return null
  if (actionId === 'open-browser') {
    if (
      keys.length !== 2
      || !keys.includes('url')
      || !keys.includes('browserToken')
      || typeof payload.browserToken !== 'string'
      || !/^bo_[\w-]{32}$/.test(payload.browserToken)
    ) {
      return null
    }
    return { actionId, url, browserToken: payload.browserToken }
  }
  if (keys.length !== 1 || keys[0] !== 'url')
    return null
  return { actionId, url }
}

async function registerSearchFeatures() {
  if (!features || typeof features.addFeature !== 'function')
    return
  const settings = await loadSearchSettings()
  for (const engineId of settings.enabledEngines) {
    const engine = SEARCH_ENGINE_BY_ID.get(engineId)
    if (!engine)
      continue
    const feature = {
      id: `${SEARCH_ENGINE_FEATURE_PREFIX}${engine.id}`,
      name: engine.featureName,
      desc: `进入 ${engine.name} 搜索模式`,
      icon: SEARCH_ICON,
      keywords: engine.keywords.filter(keyword => keyword.length > 1),
      push: true,
      priority: 8,
      acceptedInputTypes: ['text'],
      platform: platformFlags(),
      commands: [{ type: 'contain', value: [engine.featureName, `${engine.name} 搜索`] }],
    }
    try {
      const current = typeof features.getFeature === 'function' ? await features.getFeature(feature.id) : null
      if (!current)
        await features.addFeature(feature)
    }
    catch {
      // A duplicate feature remains owned by the same plugin activation.
    }
  }
}

const pluginLifecycle = {
  async onInit() {
    await registerSearchFeatures()
  },

  async onFeatureTriggered(featureId, query, _feature, signal) {
    const engine = engineFromFeature(featureId)
    if (engine)
      return handleSearchFeature(featureId, engine, extractEngineQuery(engine, getQueryText(query)), signal)
    if (featureId === WEB_SEARCH_FEATURE_ID) {
      const settings = await loadSearchSettings()
      const parsed = parseSearchQuery(getQueryText(query), settings)
      return handleSearchFeature(featureId, parsed.engine, parsed.query, signal)
    }
    activeSearch = null
    if (featureId !== BROWSER_FEATURE_ID)
      return false
    return handleBrowserFeature(featureId, query)
  },

  async onInputChanged(input, signal) {
    if (!activeSearch)
      return false
    return handleSearchFeature(activeSearch.featureId, activeSearch.engine, getQueryText(input), signal)
  },

  async onItemAction(item, context = {}) {
    const selected = selectedAction(item, context)
    if (!selected)
      return external({ status: 'blocked', reason: 'invalid-action' })
    try {
      if (selected.actionId === 'copy-url') {
        if (!clipboard || typeof clipboard.writeText !== 'function')
          return external({ status: 'blocked', reason: 'capability-unavailable' })
        await clipboard.writeText(selected.url)
        return external({ status: 'completed' }, true)
      }
      if (!plugin.browser || typeof plugin.browser.open !== 'function')
        return external({ status: 'blocked', reason: 'capability-unavailable' })
      const browser = selected.browserToken ? browsersByToken.get(selected.browserToken) : null
      const result = await plugin.browser.open(selected.url, selected.browserToken)
      if (result?.status !== 'completed')
        return external({ status: result?.status || 'failed', reason: result?.reason || 'open-failed' })
      if (browser)
        await saveRecentBrowser(browser)
      activeSearch = null
      return external({ status: 'completed' }, true)
    }
    catch (error) {
      const failure = stableFailure(error, 'browser-open-failed')
      logger?.error?.(`[touch-browser-open] ${failure.reason}`)
      return external(failure)
    }
  },

  async onDestroy() {
    requestSequence += 1
    activeSearch = null
    browsersByToken.clear()
  },
}

module.exports = pluginLifecycle
