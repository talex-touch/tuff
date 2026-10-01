/**
 * Prelude for touch-browser-open.
 *
 * Three families of *root-search* features are registered dynamically so a single Enter is enough:
 * - `browser-direct-*`  one per browser in the host inventory (plus the system default) — matches a
 *   URL typed by the user or one carried by the query inputs, and opens it in that browser with a
 *   token re-issued at execution time.
 * - `search-open-*`     one per enabled search engine — matches any plain text that is neither a URL
 *   nor a path nor an engine/hot keyword, and opens the engine's `{query}` template directly.
 * - `hot-*`             one per enabled hot/quick entry — matches its keyword and opens its URL.
 *
 * The explicit push features (`browser-open`, `web-search`, `search-engine-*`) keep their existing
 * flows: enter the feature, then pick an action. Only the SDK surface is used — no Node, no shell,
 * no raw IPC.
 */

const {
  plugin,
  clipboard,
  http,
  logger,
  TuffItemBuilder,
  features,
  platform: hostPlatform,
} = globalThis

const PLUGIN_NAME = 'touch-browser-open'
const SOURCE_ID = 'plugin-features'
const BROWSER_FEATURE_ID = 'browser-open'
const WEB_SEARCH_FEATURE_ID = 'web-search'
const SEARCH_ENGINE_FEATURE_PREFIX = 'search-engine-'
const SEARCH_OPEN_FEATURE_PREFIX = 'search-open-'
const HOT_OPEN_FEATURE_PREFIX = 'hot-'
const BROWSER_DIRECT_FEATURE_PREFIX = 'browser-direct-'
const DEFAULT_BROWSER_FEATURE_SUFFIX = 'default'

const SEARCH_SETTINGS_FILE = 'search-settings.json'
const RECENT_FILE = 'recent-browsers.json'
const SETTINGS_SYNC_MESSAGE = 'browser-open:sync-settings'

const ICON = { type: 'class', value: 'i-ri-global-line' }
const SEARCH_ICON = { type: 'class', value: 'i-ri-search-line' }
const RECENT_MAX_ITEMS = 20
const RECENT_SHOW_LIMIT = 5
const RECENT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SUGGEST_LIMIT = 6
const SUGGEST_TEXT_LIMIT = 128
const URL_BYTE_LIMIT = 2048
const QUERY_TEXT_LIMIT = 512
const MAX_ENGINES = 16
const MAX_HOT_ENTRIES = 24
const MAX_FEATURE_KEYWORDS = 8
const ACTION_IDS = new Set(['copy-url', 'default-open', 'search-web', 'open-browser'])

/**
 * Command-match scores are `1000 + priority` in `plugin-features-adapter`, so these only order the
 * direct features among themselves and above fuzzy name matches of ordinary features.
 */
const BROWSER_DEFAULT_PRIORITY = 42
const BROWSER_DIRECT_PRIORITY = 40
const HOT_OPEN_PRIORITY = 30
const SEARCH_OPEN_PRIORITY = 20
const DEFAULT_SEARCH_OPEN_PRIORITY = 80
const SEARCH_MODE_PRIORITY = 8

const BUILTIN_ENGINES = [
  {
    id: 'google',
    name: 'Google',
    featureName: 'Google 搜索引擎',
    keyword: 'google',
    keywords: ['google', 'g', '谷歌', 'google 搜索', '谷歌搜索'],
    commands: ['google', 'g', '谷歌'],
    urlTemplate: 'https://www.google.com/search?q={query}',
    suggestUrl: query =>
      `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`,
    suggestions: payload => (Array.isArray(payload?.[1]) ? payload[1] : []),
  },
  {
    id: 'bing',
    name: 'Bing',
    featureName: 'Bing 搜索引擎',
    keyword: 'bing',
    keywords: ['bing', '必应', 'bing 搜索', '必应搜索'],
    commands: ['bing', '必应'],
    urlTemplate: 'https://www.bing.com/search?q={query}',
    suggestUrl: query => `https://www.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`,
    suggestions: payload => (Array.isArray(payload?.[1]) ? payload[1] : []),
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    featureName: 'DuckDuckGo 搜索引擎',
    keyword: 'duckduckgo',
    keywords: ['duckduckgo', 'ddg', '鸭子', 'duckduckgo 搜索'],
    commands: ['duckduckgo', 'ddg'],
    urlTemplate: 'https://duckduckgo.com/?q={query}',
    suggestUrl: query => `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}`,
    suggestions: payload =>
      Array.isArray(payload) ? payload.map(entry => entry?.phrase).filter(Boolean) : [],
  },
  {
    id: 'baidu',
    name: '百度',
    featureName: '百度搜索引擎',
    keyword: '百度',
    keywords: ['baidu', '百度', 'baidu 搜索', '百度搜索'],
    commands: ['baidu', '百度'],
    urlTemplate: 'https://www.baidu.com/s?wd={query}',
  },
]

const DEFAULT_HOT_ENTRIES = [
  {
    id: 'weibo-hot',
    name: '微博热搜',
    keyword: '微博',
    url: 'https://s.weibo.com/top/summary',
    enabled: true,
  },
]

/**
 * A bare host is only treated as a URL when its last label is not a common file/document extension,
 * so a file name typed in CoreBox never turns into a "open in browser" row.
 */
const NON_URL_EXTENSIONS = [
  'md',
  'markdown',
  'txt',
  'text',
  'json',
  'jsonc',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'vue',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'php',
  'sh',
  'zsh',
  'bash',
  'fish',
  'bat',
  'ps1',
  'sql',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'xml',
  'yml',
  'yaml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'log',
  'lock',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'ico',
  'pdf',
  'zip',
  'tar',
  'gz',
  '7z',
  'rar',
  'mp3',
  'wav',
  'flac',
  'mp4',
  'mov',
  'avi',
  'mkv',
  'csv',
  'tsv',
  'xls',
  'xlsx',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'dmg',
  'exe',
  'apk',
]

const REGEX_LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?'
const REGEX_SCHEME = '[Hh][Tt][Tt][Pp][Ss]?:\\/\\/'
const REGEX_EXT_EXCLUSION = `(?:${NON_URL_EXTENSIONS.map(entry => asciiFold(entry)).join('|')})`
const REGEX_BARE_HOST
  = `${REGEX_LABEL}(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\\.`
    + `(?!${REGEX_EXT_EXCLUSION}(?:[/?#]|$))[A-Za-z]{2,}`
const REGEX_URL_BODY
  = `(?:${REGEX_SCHEME}[^\\s]+|${REGEX_BARE_HOST}(?::\\d{1,5})?(?:[/?#][^\\s]*)?)`
const REGEX_URL_LIKE = `^\\s*${REGEX_URL_BODY}\\s*$`

let requestSequence = 0
let browsersByToken = new Map()
let directBrowserIds = new Map()
let directSearchIds = new Set()
let hotEntriesByFeatureId = new Map()
let engineById = new Map()
let engineByCommand = new Map()

rebuildEngineIndex(BUILTIN_ENGINES)

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, match => `\\${match}`)
}

/**
 * `isCommandMatch` compiles manifest patterns with `new RegExp(pattern)` and no flags, so a
 * case-insensitive alternative has to be spelled out for ASCII letters.
 */
function asciiFold(value) {
  let output = ''
  for (const character of value) {
    if (character >= 'a' && character <= 'z')
      output += `[${character}${character.toUpperCase()}]`
    else if (character >= 'A' && character <= 'Z')
      output += `[${character.toLowerCase()}${character}]`
    else
      output += escapeRegExp(character)
  }
  return output
}

function toRegExpAlternation(values) {
  const unique = []
  const seen = new Set()
  for (const value of values) {
    const text = normalizeSearchText(value)
    const key = text.toLowerCase()
    if (!text || text.length > 64 || seen.has(key))
      continue
    seen.add(key)
    unique.push(asciiFold(text))
    if (unique.length >= 48)
      break
  }
  return unique.join('|')
}

function sanitizeFeatureIdPart(value) {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28)
  return normalized || 'entry'
}

function buildTemplateUrl(template, text) {
  const rawTemplate = normalizeText(template)
  const query = normalizeSearchText(text)
  if (!rawTemplate || !query)
    return null
  const parts = rawTemplate.split('{query}')
  if (parts.length < 2)
    return null
  return normalizeUrlInput(parts.join(encodeURIComponent(query)))
}

function normalizeEngineEntry(raw, builtin) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const id = normalizeText(source.id || builtin?.id)
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(id))
    return null
  const name = normalizeSearchText(source.name || builtin?.name || id)
  if (!name || name.length > 32 || containsControlCharacter(name))
    return null
  const keyword = normalizeSearchText(source.keyword || builtin?.keyword || id)
  if (!keyword || keyword.length > 32 || containsControlCharacter(keyword))
    return null
  const urlTemplate = normalizeText(source.urlTemplate || builtin?.urlTemplate)
  if (!urlTemplate || urlTemplate.length > 512 || containsControlCharacter(urlTemplate))
    return null
  if (!urlTemplate.includes('{query}'))
    return null
  const enabled = typeof source.enabled === 'boolean' ? source.enabled : Boolean(builtin)
  return {
    id,
    name,
    featureName: builtin?.featureName || `${name} 搜索引擎`,
    keyword,
    keywords: (builtin?.keywords || [name, keyword]).slice(0, MAX_FEATURE_KEYWORDS),
    commands: (builtin?.commands || [keyword]).slice(0, MAX_FEATURE_KEYWORDS),
    urlTemplate,
    suggestUrl: builtin?.suggestUrl,
    suggestions: builtin?.suggestions,
    enabled,
    builtin: Boolean(builtin),
  }
}

function normalizeHotEntry(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const id = normalizeText(source.id)
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(id))
    return null
  const name = normalizeSearchText(source.name)
  if (!name || name.length > 32 || containsControlCharacter(name))
    return null
  const keyword = normalizeSearchText(source.keyword)
  if (!keyword || keyword.length > 32 || containsControlCharacter(keyword))
    return null
  const url = normalizeUrlInput(source.url)
  if (!url)
    return null
  return {
    id,
    name,
    keyword,
    url,
    enabled: source.enabled !== false,
  }
}

/**
 * Settings are stored in the user-editable shape the settings surface writes, so a hand-edited or
 * older file degrades into defaults instead of breaking registration.
 */
function normalizeSearchSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const builtins = new Map(BUILTIN_ENGINES.map(engine => [engine.id, engine]))
  const entries = []
  const seen = new Set()

  const rawEngines = Array.isArray(source.engines) ? source.engines : []
  for (const entry of rawEngines.slice(0, MAX_ENGINES)) {
    const builtin = builtins.get(normalizeText(entry?.id)) || null
    const normalized = normalizeEngineEntry(entry, builtin)
    if (!normalized || seen.has(normalized.id))
      continue
    seen.add(normalized.id)
    entries.push(normalized)
  }

  for (const builtin of BUILTIN_ENGINES) {
    if (seen.has(builtin.id))
      continue
    const legacyEnabled = Array.isArray(source.enabledEngines)
      ? source.enabledEngines.includes(builtin.id)
      : true
    const normalized = normalizeEngineEntry({ id: builtin.id, enabled: legacyEnabled }, builtin)
    if (!normalized)
      continue
    seen.add(normalized.id)
    entries.push(normalized)
  }

  if (entries.length === 0) {
    for (const builtin of BUILTIN_ENGINES) {
      const normalized = normalizeEngineEntry({ id: builtin.id, enabled: true }, builtin)
      if (normalized)
        entries.push(normalized)
    }
  }

  const enabledEngines = entries.filter(engine => engine.enabled)
  const requestedDefault = normalizeText(source.defaultEngine)
  const defaultEngine
    = enabledEngines.find(engine => engine.id === requestedDefault)?.id
      || enabledEngines[0]?.id
      || entries[0]?.id
      || ''

  const hotEntries = []
  const seenHot = new Set()
  const rawHot = Array.isArray(source.hotEntries) ? source.hotEntries : DEFAULT_HOT_ENTRIES
  for (const entry of rawHot.slice(0, MAX_HOT_ENTRIES)) {
    const normalized = normalizeHotEntry(entry)
    if (!normalized || seenHot.has(normalized.id))
      continue
    seenHot.add(normalized.id)
    hotEntries.push(normalized)
  }

  return {
    version: 1,
    defaultEngine,
    engines: entries.map(engine => ({
      id: engine.id,
      name: engine.name,
      keyword: engine.keyword,
      urlTemplate: engine.urlTemplate,
      enabled: engine.enabled,
      builtin: engine.builtin,
    })),
    hotEntries: hotEntries.map(entry => ({
      id: entry.id,
      name: entry.name,
      keyword: entry.keyword,
      url: entry.url,
      enabled: entry.enabled,
    })),
  }
}

function resolveEngines(settings) {
  const builtins = new Map(BUILTIN_ENGINES.map(engine => [engine.id, engine]))
  const resolved = []
  for (const entry of settings.engines) {
    const normalized = normalizeEngineEntry(entry, builtins.get(entry.id) || null)
    if (normalized)
      resolved.push(normalized)
  }
  return resolved
}

function rebuildEngineIndex(engines) {
  const next = new Map()
  const commands = new Map()
  for (const engine of engines) {
    next.set(engine.id, engine)
    for (const command of engine.commands)
      commands.set(normalizeText(command).toLowerCase(), engine.id)
  }
  engineById = next
  engineByCommand = commands
}

async function loadSearchSettings() {
  const stored = await plugin.storage.getFile(SEARCH_SETTINGS_FILE)
  const settings = normalizeSearchSettings(stored)
  if (!stored || stored.version !== settings.version)
    await plugin.storage.setFile(SEARCH_SETTINGS_FILE, settings)
  return settings
}

function engineFromFeature(featureId) {
  if (!normalizeText(featureId).startsWith(SEARCH_ENGINE_FEATURE_PREFIX))
    return null
  return engineById.get(featureId.slice(SEARCH_ENGINE_FEATURE_PREFIX.length)) || null
}

function engineFromDirectFeature(featureId) {
  if (!normalizeText(featureId).startsWith(SEARCH_OPEN_FEATURE_PREFIX))
    return null
  return engineById.get(featureId.slice(SEARCH_OPEN_FEATURE_PREFIX.length)) || null
}

function parseSearchQuery(input, settings) {
  const text = normalizeSearchText(input)
  const [first = '', ...rest] = text.split(' ')
  const selected = engineByCommand.get(first.toLowerCase())
  const engineId = selected || settings.defaultEngine
  const engine = engineById.get(engineId) || engineById.get('google') || BUILTIN_ENGINES[0]
  return {
    engine,
    query: selected ? normalizeSearchText(rest.join(' ')) : text,
  }
}

function extractEngineQuery(engine, input) {
  const text = normalizeSearchText(input)
  const lower = text.toLowerCase()
  const tokens = [...new Set([engine.featureName, ...engine.keywords, ...engine.commands])].sort(
    (left, right) => right.length - left.length,
  )
  for (const token of tokens) {
    const normalized = normalizeText(token).toLowerCase()
    if (!normalized)
      continue
    if (lower === normalized)
      return ''
    if (lower.startsWith(`${normalized} `))
      return normalizeSearchText(text.slice(normalized.length))
  }
  return text
}

function buildSearchUrl(engine, query) {
  return buildTemplateUrl(engine?.urlTemplate, query)
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

function queryTextInputs(query) {
  const inputs = Array.isArray(query?.inputs) ? query.inputs : []
  return inputs.filter(input => input?.type === 'text' || input?.type === 'html')
}

/** The URL a direct browser feature should open: the typed text first, then the query's own inputs. */
function resolveQueryUrl(query) {
  const typed = normalizeUrlInput(getQueryText(query))
  if (typed)
    return typed
  for (const input of queryTextInputs(query)) {
    const candidate = normalizeUrlInput(input?.content)
    if (candidate)
      return candidate
  }
  return null
}

/** The text a direct search feature should search: the typed text first, then the query's own inputs. */
function resolveQueryText(query) {
  const typed = normalizeSearchText(getQueryText(query))
  if (typed)
    return typed.slice(0, QUERY_TEXT_LIMIT)
  for (const input of queryTextInputs(query)) {
    const content = normalizeSearchText(input?.content)
    if (content)
      return content.slice(0, QUERY_TEXT_LIMIT)
  }
  return ''
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

/**
 * A direct feature runs the navigation itself, so a run that did not happen is reported as a
 * structured refusal. Returning the legacy `false` would be read as "opened and exited" and count
 * as a success even when no browser ever opened.
 */
function triggerRefusal(status, reason) {
  return { accepted: false, success: false, status, reason }
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

function handleBrowserFeature(featureId, query) {
  return publishBrowserFeature(featureId, query)
}

async function publishBrowserFeature(featureId, query) {
  const sequence = nextRequest()
  const input = getQueryText(query)
  const url = resolveQueryUrl(query)
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
  if (!engine?.suggestUrl || typeof engine.suggestions !== 'function')
    return []
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

/** Opens a URL in the system default browser and returns the trigger outcome for the adapter. */
async function openInDefaultBrowser(url, fallbackReason) {
  if (!plugin.browser || typeof plugin.browser.open !== 'function')
    return triggerRefusal('blocked', 'capability-unavailable')
  try {
    const result = await plugin.browser.open(url)
    if (result?.status !== 'completed')
      return triggerRefusal(result?.status === 'blocked' ? 'blocked' : 'failed', result?.reason || 'open-failed')
    return false
  }
  catch (error) {
    const failure = stableFailure(error, fallbackReason)
    logger?.error?.(`[touch-browser-open] ${failure.reason}`)
    return triggerRefusal(failure.status, failure.reason)
  }
}

async function handleDirectBrowserFeature(featureId, query) {
  const url = resolveQueryUrl(query)
  if (!url)
    return triggerRefusal('blocked', 'missing-url')
  const targetBrowserId = directBrowserIds.get(featureId)
  if (!directBrowserIds.has(featureId))
    return triggerRefusal('blocked', 'unknown-browser')
  if (!targetBrowserId)
    return openInDefaultBrowser(url, 'browser-open-failed')
  if (!plugin.browser || typeof plugin.browser.open !== 'function')
    return triggerRefusal('blocked', 'capability-unavailable')
  try {
    // Tokens expire within 30s and are single-use, so the inventory is re-read here instead of
    // carrying a token from registration time.
    const result = await listBrowsers()
    if (result?.status !== 'available')
      return triggerRefusal('blocked', result?.reason || 'browser-list-failed')
    const browser = result.browsers.find(entry => entry.id === targetBrowserId)
    if (!browser)
      return triggerRefusal('blocked', 'browser-unavailable')
    const opened = await plugin.browser.open(url, browser.token)
    if (opened?.status !== 'completed')
      return triggerRefusal(opened?.status === 'blocked' ? 'blocked' : 'failed', opened?.reason || 'open-failed')
    await saveRecentBrowser({ id: browser.id, name: browser.name })
    return false
  }
  catch (error) {
    const failure = stableFailure(error, 'browser-open-failed')
    logger?.error?.(`[touch-browser-open] ${failure.reason}`)
    return triggerRefusal(failure.status, failure.reason)
  }
}

async function handleDirectSearchFeature(featureId, query) {
  // A feature that was disabled or replaced since registration must not still search: the ids are
  // rebuilt on every sync, so anything outside the current set is a stale trigger.
  if (!directSearchIds.has(featureId))
    return triggerRefusal('blocked', 'engine-unavailable')
  const engine = engineFromDirectFeature(featureId)
  if (!engine)
    return triggerRefusal('blocked', 'unknown-engine')
  const text = resolveQueryText(query)
  if (!text)
    return triggerRefusal('blocked', 'missing-query')
  const url = buildSearchUrl(engine, text)
  if (!url)
    return triggerRefusal('blocked', 'invalid-engine-template')
  return openInDefaultBrowser(url, 'search-open-failed')
}

async function handleDirectHotFeature(featureId) {
  const entry = hotEntriesByFeatureId.get(featureId)
  if (!entry)
    return triggerRefusal('blocked', 'unknown-entry')
  return openInDefaultBrowser(entry.url, 'hot-open-failed')
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

/** Specific hot entries and modes retain their title-match priority; plain words remain searchable. */
function buildDirectSearchPattern() {
  return `^(?!${REGEX_SCHEME}[^\\s]+\\s*$)`
    + `(?!${REGEX_LABEL}(?:\\.${REGEX_LABEL})+(?::\\d{1,5})?(?:[/?#][^\\s]*)?\\s*$)`
    + '(?![~/])(?![A-Za-z]:[\\\\/])[\\s\\S]+$'
}

function buildHotPattern(entry) {
  const alternation = toRegExpAlternation([entry.name, entry.keyword])
  return alternation ? `^\\s*(?:${alternation})\\s*$` : null
}

function buildDirectSearchFeature(engine, pattern, isDefault) {
  return {
    id: `${SEARCH_OPEN_FEATURE_PREFIX}${engine.id}`,
    name: `用 ${engine.name} 搜索`,
    desc: `直接使用 ${engine.name} 搜索当前输入`,
    icon: SEARCH_ICON,
    keywords: [engine.name, engine.keyword, ...engine.commands].slice(0, MAX_FEATURE_KEYWORDS),
    push: false,
    priority: isDefault ? DEFAULT_SEARCH_OPEN_PRIORITY : SEARCH_OPEN_PRIORITY,
    platform: platformFlags(),
    commands: [{ type: 'regex', value: pattern }],
  }
}

function buildHotFeature(entry, pattern) {
  return {
    id: `${HOT_OPEN_FEATURE_PREFIX}${entry.id}`,
    name: `打开${entry.name}`,
    desc: `直接打开 ${entry.name}`,
    icon: ICON,
    keywords: [entry.name, entry.keyword].slice(0, MAX_FEATURE_KEYWORDS),
    push: false,
    priority: HOT_OPEN_PRIORITY,
    platform: platformFlags(),
    commands: [{ type: 'regex', value: pattern }],
  }
}

function buildBrowserDirectFeature({ key, name, priority }) {
  return {
    id: `${BROWSER_DIRECT_FEATURE_PREFIX}${key}`,
    name: `用 ${name} 打开链接`,
    desc: `直接用 ${name} 打开链接`,
    icon: ICON,
    keywords: [name, '打开', '链接', 'browser'].slice(0, MAX_FEATURE_KEYWORDS),
    push: false,
    priority,
    platform: platformFlags(),
    commands: [{ type: 'regex', value: REGEX_URL_LIKE }],
  }
}

function buildSearchModeFeature(engine) {
  return {
    id: `${SEARCH_ENGINE_FEATURE_PREFIX}${engine.id}`,
    name: engine.featureName,
    desc: `进入 ${engine.name} 搜索模式`,
    icon: SEARCH_ICON,
    keywords: engine.keywords.filter(keyword => keyword.length > 1).slice(0, MAX_FEATURE_KEYWORDS),
    push: true,
    priority: SEARCH_MODE_PRIORITY,
    acceptedInputTypes: ['text'],
    platform: platformFlags(),
    commands: [{ type: 'contain', value: [engine.featureName, `${engine.name} 搜索`] }],
  }
}

function isManagedFeatureId(featureId) {
  return (
    featureId.startsWith(SEARCH_ENGINE_FEATURE_PREFIX)
    || featureId.startsWith(SEARCH_OPEN_FEATURE_PREFIX)
    || featureId.startsWith(HOT_OPEN_FEATURE_PREFIX)
    || featureId.startsWith(BROWSER_DIRECT_FEATURE_PREFIX)
  )
}

function featureSignature(feature) {
  return JSON.stringify({
    name: feature?.name ?? '',
    desc: feature?.desc ?? '',
    push: feature?.push ?? null,
    priority: feature?.priority ?? null,
    keywords: feature?.keywords ?? null,
    commands: feature?.commands ?? null,
    acceptedInputTypes: feature?.acceptedInputTypes ?? null,
    platform: feature?.platform ?? null,
  })
}

async function listRegisteredFeatures() {
  const listed = await features.getFeatures()
  return Array.isArray(listed) ? listed : []
}

async function reconcileFeatures(desired) {
  const registered = await listRegisteredFeatures()
  const byId = new Map()
  for (const feature of registered) {
    if (typeof feature?.id === 'string')
      byId.set(feature.id, feature)
  }

  for (const [id, existing] of byId) {
    if (!isManagedFeatureId(id))
      continue
    const wanted = desired.get(id)
    if (wanted && featureSignature(wanted) === featureSignature(existing))
      continue
    await features.removeFeature(id)
  }

  for (const [id, feature] of desired) {
    const existing = byId.get(id)
    if (existing && featureSignature(feature) === featureSignature(existing))
      continue
    const added = await features.addFeature(feature)
    if (added === false)
      throw new Error(`BROWSER_FEATURE_REGISTRATION_FAILED:${id}`)
  }
}

/**
 * Rebuilds every dynamic feature from the current settings and browser inventory: enabled engines
 * and entries are added, disabled or removed ones are dropped, and changed definitions are replaced.
 */
async function syncDynamicFeatures() {
  if (!features || typeof features.addFeature !== 'function' || typeof features.getFeatures !== 'function')
    throw new Error('BROWSER_FEATURE_REGISTRY_UNAVAILABLE')
  const settings = await loadSearchSettings()
  const engines = resolveEngines(settings)
  rebuildEngineIndex(engines.length > 0 ? engines : BUILTIN_ENGINES.map(engine => ({ ...engine, enabled: true })))

  const enabledEngines = engines.filter(engine => engine.enabled)
  const enabledHotEntries = settings.hotEntries.filter(entry => entry.enabled)
  const directPattern = buildDirectSearchPattern()

  const desired = new Map()
  for (const engine of enabledEngines)
    desired.set(`${SEARCH_ENGINE_FEATURE_PREFIX}${engine.id}`, buildSearchModeFeature(engine))
  directSearchIds = new Set()
  for (const engine of enabledEngines) {
    const featureId = `${SEARCH_OPEN_FEATURE_PREFIX}${engine.id}`
    directSearchIds.add(featureId)
    desired.set(featureId, buildDirectSearchFeature(engine, directPattern, engine.id === settings.defaultEngine))
  }

  hotEntriesByFeatureId = new Map()
  for (const entry of enabledHotEntries) {
    const pattern = buildHotPattern(entry)
    if (!pattern)
      continue
    const featureId = `${HOT_OPEN_FEATURE_PREFIX}${entry.id}`
    hotEntriesByFeatureId.set(featureId, entry)
    desired.set(featureId, buildHotFeature(entry, pattern))
  }

  directBrowserIds = new Map()
  let browsers = []
  try {
    const result = await listBrowsers()
    if (result?.status === 'available')
      browsers = result.browsers
  }
  catch {
    // Without the inventory only the default-browser row is registered; the token is fetched at
    // execution time anyway.
  }

  const defaultFeature = buildBrowserDirectFeature({
    key: DEFAULT_BROWSER_FEATURE_SUFFIX,
    name: '默认浏览器',
    priority: BROWSER_DEFAULT_PRIORITY,
  })
  directBrowserIds.set(defaultFeature.id, null)
  desired.set(defaultFeature.id, defaultFeature)

  for (const browser of browsers) {
    const key = sanitizeFeatureIdPart(browser.id)
    if (key === DEFAULT_BROWSER_FEATURE_SUFFIX)
      continue
    const feature = buildBrowserDirectFeature({
      key,
      name: browser.name,
      priority: BROWSER_DIRECT_PRIORITY,
    })
    directBrowserIds.set(feature.id, browser.id)
    desired.set(feature.id, feature)
  }

  await reconcileFeatures(desired)
}

const pluginLifecycle = {
  async onInit() {
    await syncDynamicFeatures()
  },

  async onMessage(key) {
    if (key === SETTINGS_SYNC_MESSAGE)
      await syncDynamicFeatures()
  },

  async onFeatureTriggered(featureId, query, _feature, signal) {
    if (featureId.startsWith(BROWSER_DIRECT_FEATURE_PREFIX))
      return handleDirectBrowserFeature(featureId, query)
    if (featureId.startsWith(SEARCH_OPEN_FEATURE_PREFIX))
      return handleDirectSearchFeature(featureId, query)
    if (featureId.startsWith(HOT_OPEN_FEATURE_PREFIX))
      return handleDirectHotFeature(featureId, query)
    const engine = engineFromFeature(featureId)
    if (engine)
      return handleSearchFeature(featureId, engine, extractEngineQuery(engine, getQueryText(query)), signal)
    if (featureId === WEB_SEARCH_FEATURE_ID) {
      const settings = await loadSearchSettings()
      const parsed = parseSearchQuery(getQueryText(query), settings)
      return handleSearchFeature(featureId, parsed.engine, parsed.query, signal)
    }
    if (featureId !== BROWSER_FEATURE_ID)
      return false
    return handleBrowserFeature(featureId, query)
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
    browsersByToken.clear()
    directBrowserIds.clear()
    directSearchIds.clear()
    hotEntriesByFeatureId.clear()
  },
}

module.exports = pluginLifecycle
