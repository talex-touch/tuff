const { plugin, clipboard, logger, TuffItemBuilder, permission, features } = globalThis
const { execFile, spawn } = require('node:child_process')
const os = require('node:os')
const fetchImpl = globalThis.fetch

const PLUGIN_NAME = 'touch-browser-open'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'browser-open'
const WEB_SEARCH_FEATURE_ID = 'web-search'
const SEARCH_ENGINE_FEATURE_PREFIX = 'search-engine-'
const SEARCH_SETTINGS_FILE = 'search-settings.json'
const RECENT_FILE = 'recent-browsers.json'
const RECENT_MAX_ITEMS = 20
const RECENT_SHOW_LIMIT = 5
const RECENT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SUGGEST_TIMEOUT_MS = 2500
const SUGGEST_LIMIT = 6

const SEARCH_ENGINES = [
  {
    id: 'google',
    name: 'Google',
    featureName: 'Google 搜索引擎',
    icon: { type: 'file', value: 'assets/search-engines/google.svg' },
    keywords: ['google', 'g', '谷歌', 'google 搜索', 'Google 搜索引擎', '谷歌搜索', '谷歌 搜索'],
    commands: ['google', 'g', '谷歌'],
    buildSearchUrl: query => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    buildSuggestUrl: query => `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`,
    parseSuggestions(payload) {
      return Array.isArray(payload?.[1]) ? payload[1] : []
    },
  },
  {
    id: 'bing',
    name: 'Bing',
    featureName: 'Bing 搜索引擎',
    icon: { type: 'file', value: 'assets/search-engines/bing.svg' },
    keywords: ['bing', '必应', 'bing 搜索', 'Bing 搜索引擎', '必应搜索', '必应 搜索'],
    commands: ['bing', '必应'],
    buildSearchUrl: query => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
    buildSuggestUrl: query => `https://www.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`,
    parseSuggestions(payload) {
      return Array.isArray(payload?.[1]) ? payload[1] : []
    },
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    featureName: 'DuckDuckGo 搜索引擎',
    icon: { type: 'file', value: 'assets/search-engines/duckduckgo.svg' },
    keywords: ['duckduckgo', 'ddg', 'duck', 'DuckDuckGo 搜索引擎', 'duckduckgo 搜索', 'ddg 搜索'],
    commands: ['duckduckgo', 'ddg', 'duck'],
    buildSearchUrl: query => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    buildSuggestUrl: query => `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`,
    parseSuggestions(payload) {
      if (!Array.isArray(payload))
        return []
      return payload.map(item => item?.phrase)
    },
  },
]

const SEARCH_ENGINE_IDS = SEARCH_ENGINES.map(engine => engine.id)
const DEFAULT_SEARCH_SETTINGS = {
  defaultEngine: 'google',
  enabledEngines: SEARCH_ENGINE_IDS,
}
const SEARCH_ENGINE_BY_ID = new Map(SEARCH_ENGINES.map(engine => [engine.id, engine]))
const SEARCH_COMMAND_TO_ENGINE = new Map()
SEARCH_ENGINES.forEach((engine) => {
  engine.commands.forEach(command => SEARCH_COMMAND_TO_ENGINE.set(command.toLowerCase(), engine.id))
})

let dynamicSearchFeaturesInitialized = false
let networkPermissionGranted = null
let latestFeatureRequestSeq = 0
let activeSearchMode = null
let unsubscribeSearchInput = null
let activeSearchRequestController = null

function getRuntimePlatform() {
  const platform = typeof os?.platform === 'function' ? os.platform() : ''
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux')
    return platform
  return 'unsupported'
}

const CURRENT_PLATFORM = getRuntimePlatform()

const MAC_BROWSER_CANDIDATES = [
  { id: 'safari', name: 'Safari', target: 'Safari' },
  { id: 'chrome', name: 'Chrome', target: 'Google Chrome' },
  { id: 'edge', name: 'Edge', target: 'Microsoft Edge' },
  { id: 'firefox', name: 'Firefox', target: 'Firefox' },
  { id: 'brave', name: 'Brave', target: 'Brave Browser' },
  { id: 'opera', name: 'Opera', target: 'Opera' },
]

const SUPPORTED_PLATFORM_FLAGS = {
  win32: CURRENT_PLATFORM === 'win32',
  darwin: CURRENT_PLATFORM === 'darwin',
  linux: CURRENT_PLATFORM === 'linux',
}

const WIN_BROWSER_CANDIDATES = [
  {
    id: 'edge',
    name: 'Edge',
    target: 'msedge.exe',
    paths: [
      '$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe',
      '${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
  },
  {
    id: 'chrome',
    name: 'Chrome',
    target: 'chrome.exe',
    paths: [
      '$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe',
      '${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe',
      '$env:LocalAppData\\Google\\Chrome\\Application\\chrome.exe',
    ],
  },
  {
    id: 'firefox',
    name: 'Firefox',
    target: 'firefox.exe',
    paths: [
      '$env:ProgramFiles\\Mozilla Firefox\\firefox.exe',
      '${env:ProgramFiles(x86)}\\Mozilla Firefox\\firefox.exe',
    ],
  },
  {
    id: 'brave',
    name: 'Brave',
    target: 'brave.exe',
    paths: [
      '$env:ProgramFiles\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      '${env:ProgramFiles(x86)}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      '$env:LocalAppData\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ],
  },
  {
    id: 'opera',
    name: 'Opera',
    target: 'opera.exe',
    paths: [
      '$env:LocalAppData\\Programs\\Opera\\opera.exe',
      '$env:ProgramFiles\\Opera\\opera.exe',
      '${env:ProgramFiles(x86)}\\Opera\\opera.exe',
    ],
  },
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function truncateText(value, max = 72) {
  const text = normalizeText(value)
  if (!text)
    return ''
  if (text.length <= max)
    return text
  return `${text.slice(0, max - 1)}…`
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
}

function normalizeSearchText(value) {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function uniqNormalizedTexts(values, limit = SUGGEST_LIMIT) {
  const seen = new Set()
  const result = []
  for (const value of values || []) {
    const text = normalizeSearchText(value)
    const key = text.toLowerCase()
    if (!text || seen.has(key))
      continue
    seen.add(key)
    result.push(text)
    if (result.length >= limit)
      break
  }
  return result
}

function getSearchEngine(engineId) {
  return SEARCH_ENGINE_BY_ID.get(engineId) || SEARCH_ENGINE_BY_ID.get(DEFAULT_SEARCH_SETTINGS.defaultEngine)
}

function normalizeSearchSettings(raw) {
  const payload = raw && typeof raw === 'object' ? raw : {}
  const enabled = Array.isArray(payload.enabledEngines)
    ? payload.enabledEngines.filter(id => SEARCH_ENGINE_BY_ID.has(id))
    : DEFAULT_SEARCH_SETTINGS.enabledEngines
  const enabledEngines = enabled.length > 0 ? Array.from(new Set(enabled)) : DEFAULT_SEARCH_SETTINGS.enabledEngines
  const defaultEngine = enabledEngines.includes(payload.defaultEngine)
    ? payload.defaultEngine
    : enabledEngines[0] || DEFAULT_SEARCH_SETTINGS.defaultEngine

  return {
    defaultEngine,
    enabledEngines,
  }
}

async function loadSearchSettings() {
  if (!plugin?.storage?.getFile)
    return normalizeSearchSettings(null)

  try {
    return normalizeSearchSettings(await plugin.storage.getFile(SEARCH_SETTINGS_FILE))
  }
  catch {
    return normalizeSearchSettings(null)
  }
}

function resolveEnabledSearchEngines(settings) {
  const normalized = normalizeSearchSettings(settings)
  return normalized.enabledEngines
    .map(id => SEARCH_ENGINE_BY_ID.get(id))
    .filter(Boolean)
}

function parseSearchQuery(input, settings = DEFAULT_SEARCH_SETTINGS) {
  const rawText = normalizeSearchText(input)
  if (!rawText)
    return { engine: getSearchEngine(settings.defaultEngine), query: '', explicit: false }

  const [firstToken = '', ...rest] = rawText.split(' ')
  const command = firstToken.toLowerCase()
  const explicitEngineId = SEARCH_COMMAND_TO_ENGINE.get(command)
  if (explicitEngineId) {
    return {
      engine: getSearchEngine(explicitEngineId),
      query: normalizeSearchText(rest.join(' ')),
      explicit: true,
      command: firstToken,
    }
  }

  return {
    engine: getSearchEngine(settings.defaultEngine),
    query: rawText,
    explicit: false,
  }
}

function buildSearchUrl(engineId, query) {
  const engine = getSearchEngine(engineId)
  const text = normalizeSearchText(query)
  if (!engine || !text)
    return null
  return engine.buildSearchUrl(text)
}

function parseEngineSuggestions(engineId, payload) {
  const engine = getSearchEngine(engineId)
  if (!engine)
    return []
  return uniqNormalizedTexts(engine.parseSuggestions(payload), SUGGEST_LIMIT)
}

function getSearchEngineFeatureKeywords(engine) {
  return engine.keywords.filter(keyword => normalizeSearchText(keyword).length > 1)
}

function getSearchEngineFeatureCommandTokens(engine) {
  const tokens = [engine.featureName, ...engine.keywords.filter(keyword => /搜索|引擎/i.test(keyword))]
  return uniqNormalizedTexts(tokens, tokens.length)
}

function buildSearchEngineFeatures(settings = DEFAULT_SEARCH_SETTINGS) {
  return resolveEnabledSearchEngines(settings).map(engine => ({
    id: `${SEARCH_ENGINE_FEATURE_PREFIX}${engine.id}`,
    name: engine.featureName,
    desc: `进入 ${engine.name} 搜索模式`,
    icon: engine.icon,
    keywords: getSearchEngineFeatureKeywords(engine),
    push: true,
    priority: 8,
    acceptedInputTypes: ['text'],
    platform: SUPPORTED_PLATFORM_FLAGS,
    commands: [
      {
        type: 'contain',
        value: getSearchEngineFeatureCommandTokens(engine),
      },
    ],
  }))
}

function resolveEngineFromFeatureId(featureId) {
  const id = normalizeText(featureId)
  if (!id.startsWith(SEARCH_ENGINE_FEATURE_PREFIX))
    return null
  return getSearchEngine(id.slice(SEARCH_ENGINE_FEATURE_PREFIX.length))
}

function resolveActiveSearchMode(featureId) {
  const engine = resolveEngineFromFeatureId(featureId)
  if (engine)
    return { featureId: `${SEARCH_ENGINE_FEATURE_PREFIX}${engine.id}`, engine }

  if (featureId === WEB_SEARCH_FEATURE_ID) {
    return {
      featureId: WEB_SEARCH_FEATURE_ID,
      engine: activeSearchMode?.engine || getSearchEngine(DEFAULT_SEARCH_SETTINGS.defaultEngine),
    }
  }

  return null
}

function stopSearchInputSession() {
  if (typeof unsubscribeSearchInput === 'function') {
    unsubscribeSearchInput()
  }
  unsubscribeSearchInput = null
  activeSearchMode = null
  abortActiveSearchRequest()
}

function startSearchInputSession(featureId, engine) {
  activeSearchMode = { featureId, engine }
  if (unsubscribeSearchInput || typeof plugin?.feature?.onInputChange !== 'function')
    return

  unsubscribeSearchInput = plugin.feature.onInputChange((input) => {
    const mode = activeSearchMode
    if (!mode)
      return
    void enterSearchEngineMode(mode.engine, input, undefined, {
      featureId: mode.featureId,
      preserveInput: true,
    })
  })
}

function extractEngineModeQuery(engine, input) {
  const text = normalizeSearchText(input)
  if (!engine || !text)
    return ''

  const lower = text.toLowerCase()
  const tokens = Array.from(new Set([engine.featureName, ...engine.keywords, ...engine.commands]))
    .map(token => normalizeSearchText(token))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)

  for (const token of tokens) {
    const normalizedToken = token.toLowerCase()
    if (lower === normalizedToken)
      return ''
    if (lower.startsWith(`${normalizedToken} `))
      return normalizeSearchText(text.slice(token.length))
  }

  return text
}

function isLikelyUrlInput(text) {
  const value = normalizeText(text)
  if (!value)
    return false
  if (/^https?:\/\//i.test(value))
    return true
  if (/^www\./i.test(value))
    return true
  return /^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(value)
}

function normalizeUrlInput(rawInput) {
  let value = normalizeText(rawInput)
  if (!value)
    return null

  if (!/^https?:\/\//i.test(value)) {
    if (!isLikelyUrlInput(value))
      return null
    value = `https://${value.replace(/^\/+/, '')}`
  }

  try {
    const parsed = new URL(value)
    const protocol = parsed.protocol.toLowerCase()
    if (protocol !== 'http:' && protocol !== 'https:')
      return null
    return parsed.toString()
  }
  catch {
    return null
  }
}

async function ensurePermission(permissionId, reason) {
  if (!permission)
    return true
  const hasPermission = await permission.check(permissionId)
  if (hasPermission)
    return true
  const granted = await permission.request(permissionId, reason)
  return Boolean(granted)
}

async function ensureNetworkPermission() {
  if (networkPermissionGranted !== null)
    return networkPermissionGranted
  networkPermissionGranted = await ensurePermission('network.internet', '需要网络权限以获取搜索建议')
  return networkPermissionGranted
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8', timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
        return
      }
      resolve(stdout)
    })
  })
}

function parseJsonSafe(text) {
  const content = normalizeText(text)
  if (!content)
    return null

  try {
    return JSON.parse(content)
  }
  catch {}

  const lines = content.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index])
    }
    catch {}
  }

  return null
}

async function runPowerShell(script) {
  const commands = ['powershell.exe', 'powershell']
  let lastError = null

  for (const command of commands) {
    try {
      return await execFileAsync(command, [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script,
      ])
    }
    catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('PowerShell 不可用')
}

function buildWindowsOpenScript(action, payload = {}) {
  if (action === 'default-open') {
    const url = String(payload.url || '').replace(/'/g, `''`)
    return [
      '$ErrorActionPreference = "Stop"',
      'try {',
      `  Start-Process -FilePath '${url}' | Out-Null`,
      '  [pscustomobject]@{ success = $true; message = "ok" } | ConvertTo-Json -Compress',
      '} catch {',
      '  [pscustomobject]@{ success = $false; message = $_.Exception.Message } | ConvertTo-Json -Compress',
      '}',
    ].join('\n')
  }

  if (action === 'open-browser') {
    const url = String(payload.url || '').replace(/'/g, `''`)
    const target = String(payload.target || '').replace(/'/g, `''`)
    return [
      '$ErrorActionPreference = "Stop"',
      'try {',
      `  Start-Process -FilePath '${target}' -ArgumentList '${url}' | Out-Null`,
      '  [pscustomobject]@{ success = $true; message = "ok" } | ConvertTo-Json -Compress',
      '} catch {',
      '  [pscustomobject]@{ success = $false; message = $_.Exception.Message } | ConvertTo-Json -Compress',
      '}',
    ].join('\n')
  }

  return ''
}

function buildWindowsDetectScript() {
  const rows = WIN_BROWSER_CANDIDATES.map((item) => {
    const paths = item.paths.map(path => `'${path.replace(/'/g, `''`)}'`).join(', ')
    return `@{ id='${item.id}'; name='${item.name.replace(/'/g, `''`)}'; target='${item.target.replace(/'/g, `''`)}'; paths=@(${paths}) }`
  }).join(',\n  ')

  return [
    '$ErrorActionPreference = "SilentlyContinue"',
    '$items = @(',
    `  ${rows}`,
    ')',
    '$result = @()',
    'foreach ($item in $items) {',
    '  $resolvedPath = $null',
    '  foreach ($p in $item.paths) {',
    '    $expanded = $ExecutionContext.InvokeCommand.ExpandString($p)',
    '    if (Test-Path $expanded) { $resolvedPath = $expanded; break }',
    '  }',
    '  if (-not $resolvedPath) {',
    '    $cmd = Get-Command $item.target -ErrorAction SilentlyContinue | Select-Object -First 1',
    '    if ($cmd) { $resolvedPath = $item.target }',
    '  }',
    '  if ($resolvedPath) {',
    '    $result += [pscustomobject]@{ id = $item.id; name = $item.name; target = $resolvedPath }',
    '  }',
    '}',
    '$result | ConvertTo-Json -Compress',
  ].join('\n')
}

async function detectBrowsersMac() {
  const result = []
  for (const candidate of MAC_BROWSER_CANDIDATES) {
    try {
      await execFileAsync('open', ['-Ra', candidate.target])
      result.push(candidate)
    }
    catch {}
  }
  return result
}

async function detectBrowsersWin() {
  const output = await runPowerShell(buildWindowsDetectScript())
  const parsed = parseJsonSafe(output)
  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
  return rows
    .map((row) => {
      const id = normalizeText(row.id)
      const name = normalizeText(row.name)
      const target = normalizeText(row.target)
      if (!id || !name || !target)
        return null
      return { id, name, target }
    })
    .filter(Boolean)
}

async function detectBrowsers() {
  if (CURRENT_PLATFORM === 'darwin')
    return detectBrowsersMac()
  if (CURRENT_PLATFORM === 'win32')
    return detectBrowsersWin()
  return []
}

function cleanupRecentBrowsers(items, now = Date.now()) {
  const threshold = now - RECENT_TTL_MS
  return items
    .filter(item => item.lastUsedAt >= threshold)
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, RECENT_MAX_ITEMS)
}

function parseRecentBrowsers(raw) {
  if (!raw)
    return []

  let payload = raw
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw)
    }
    catch {
      return []
    }
  }

  const items = Array.isArray(payload?.items) ? payload.items : []
  return items
    .map((item) => {
      const id = normalizeText(item.id)
      const name = normalizeText(item.name)
      const target = normalizeText(item.target)
      const lastUsedAt = Number(item.lastUsedAt)
      if (!id || !name || !target)
        return null
      return {
        id,
        name,
        target,
        lastUsedAt: Number.isFinite(lastUsedAt) ? lastUsedAt : 0,
      }
    })
    .filter(Boolean)
}

async function loadRecentBrowsers() {
  try {
    const raw = await plugin.storage.getFile(RECENT_FILE)
    return cleanupRecentBrowsers(parseRecentBrowsers(raw))
  }
  catch {
    return []
  }
}

async function saveRecentBrowsers(items) {
  const cleaned = cleanupRecentBrowsers(items)
  await plugin.storage.setFile(RECENT_FILE, {
    items: cleaned,
    updatedAt: Date.now(),
  })
}

function mergeRecentBrowsers(availableBrowsers, recentBrowsers) {
  const index = new Map(availableBrowsers.map(item => [item.id, item]))
  return recentBrowsers
    .map((item) => {
      const candidate = index.get(item.id)
      if (!candidate)
        return null
      return {
        ...candidate,
        lastUsedAt: item.lastUsedAt,
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, RECENT_SHOW_LIMIT)
}

function touchRecentBrowser(recentBrowsers, browser, now = Date.now()) {
  const filtered = recentBrowsers.filter(item => item.id !== browser.id)
  filtered.unshift({
    id: browser.id,
    name: browser.name,
    target: browser.target,
    lastUsedAt: now,
  })
  return cleanupRecentBrowsers(filtered, now)
}

function resolveGroupOrder({ quickActions, recommendedItems, recentItems, tips }) {
  const order = []
  if (quickActions.length)
    order.push('quick')
  if (recommendedItems.length)
    order.push('recommended')
  if (recentItems.length)
    order.push('recent')
  if (tips.length)
    order.push('tips')
  return order
}

function buildInfoItem({ id, featureId, title, subtitle, icon = ICON }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(icon)
    .setMeta({ pluginName: PLUGIN_NAME, featureId })
    .build()
}

function buildSectionHeader(featureId, sectionId, title, subtitle) {
  return buildInfoItem({
    id: `${featureId}-section-${sectionId}`,
    featureId,
    title,
    subtitle,
  })
}

function buildActionItem({ id, featureId, title, subtitle, actionId, payload, icon = ICON }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(icon)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: ACTION_ID,
      actionId,
      payload,
    })
    .build()
}

function buildSearchActionItem({ id, featureId, engine, query, title, subtitle, suggestion = false }) {
  return applyCompletion(buildActionItem({
    id,
    featureId,
    title,
    subtitle,
    icon: engine.icon,
    actionId: 'search-web',
    payload: {
      engineId: engine.id,
      query,
      suggestion,
      url: buildSearchUrl(engine.id, query),
    },
  }), query)
}

function buildSearchItems(featureId, engine, query, suggestions = [], options = {}) {
  const items = []
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) {
    items.push(buildInfoItem({
      id: `${featureId}-search-empty`,
      featureId,
      title: `${engine.name} 搜索`,
      subtitle: '继续输入关键词以获取搜索建议',
      icon: engine.icon,
    }))
    return items
  }

  items.push(buildSearchActionItem({
    id: `${featureId}-search-direct`,
    featureId,
    engine,
    query: normalizedQuery,
    title: `${engine.name} 搜索：${truncateText(normalizedQuery, 48)}`,
    subtitle: truncateText(buildSearchUrl(engine.id, normalizedQuery), 88),
  }))

  uniqNormalizedTexts(suggestions).forEach((suggestion, index) => {
    if (suggestion.toLowerCase() === normalizedQuery.toLowerCase())
      return
    items.push(buildSearchActionItem({
      id: `${featureId}-suggestion-${index}`,
      featureId,
      engine,
      query: suggestion,
      title: suggestion,
      subtitle: `${engine.name} 搜索建议`,
      suggestion: true,
    }))
  })

  if (options.warning) {
    items.push(buildInfoItem({
      id: `${featureId}-suggestion-warning`,
      featureId,
      title: '搜索建议不可用',
      subtitle: truncateText(options.warning, 96),
      icon: engine.icon,
    }))
  }

  return items
}

function beginFeatureRequest() {
  latestFeatureRequestSeq += 1
  return latestFeatureRequestSeq
}

function isCurrentFeatureRequest(requestSeq, signal) {
  return requestSeq === latestFeatureRequestSeq && !signal?.aborted
}

async function pushFeatureItems(items, requestSeq) {
  if (typeof requestSeq === 'number' && requestSeq !== latestFeatureRequestSeq)
    return false
  plugin.feature.clearItems()
  await plugin.feature.pushItems(items)
  return true
}

function abortActiveSearchRequest() {
  if (!activeSearchRequestController)
    return
  activeSearchRequestController.abort()
  activeSearchRequestController = null
}

function createSearchRequestSignal(parentSignal) {
  abortActiveSearchRequest()

  const controller = new AbortController()
  activeSearchRequestController = controller

  const abortFromParent = () => controller.abort()
  if (parentSignal?.aborted) {
    controller.abort()
  }
  else {
    parentSignal?.addEventListener?.('abort', abortFromParent, { once: true })
  }

  return {
    signal: controller.signal,
    release() {
      parentSignal?.removeEventListener?.('abort', abortFromParent)
      if (activeSearchRequestController === controller)
        activeSearchRequestController = null
    },
  }
}

function applyCompletion(item, completion) {
  if (item?.render && typeof completion === 'string')
    item.render.completion = completion
  return item
}

function openWithMac(url, browserTarget) {
  const args = browserTarget ? ['-a', browserTarget, url] : [url]
  const child = spawn('open', args, {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

async function openWithWindows(url, browserTarget) {
  const action = browserTarget ? 'open-browser' : 'default-open'
  const output = await runPowerShell(buildWindowsOpenScript(action, {
    url,
    target: browserTarget,
  }))
  const parsed = parseJsonSafe(output)
  if (parsed?.success === false)
    throw new Error(parsed.message || '打开链接失败')
}

async function executeOpenAction(url, browserTarget) {
  if (CURRENT_PLATFORM === 'darwin') {
    openWithMac(url, browserTarget)
    return
  }

  if (CURRENT_PLATFORM === 'win32') {
    await openWithWindows(url, browserTarget)
    return
  }

  if (CURRENT_PLATFORM === 'linux' && !browserTarget) {
    const child = spawn('xdg-open', [url], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    return
  }

  throw new Error('当前平台暂不支持浏览器打开')
}

async function tryCopyUrl(url) {
  if (!clipboard?.writeText)
    return false

  const canCopy = await ensurePermission('clipboard.write', '需要剪贴板写入权限以复制链接')
  if (!canCopy)
    return false

  clipboard.writeText(url)
  return true
}

async function fetchJsonWithTimeout(url, signal, timeoutMs = SUGGEST_TIMEOUT_MS) {
  if (typeof fetchImpl !== 'function')
    throw new Error('当前运行时不支持 fetch')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const abortFromParent = () => controller.abort()
  if (signal?.aborted)
    controller.abort()
  signal?.addEventListener?.('abort', abortFromParent, { once: true })

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/javascript,*/*;q=0.8',
      },
    })
    if (!response.ok)
      throw new Error(`建议请求失败：HTTP ${response.status}`)
    return await response.json()
  }
  finally {
    clearTimeout(timer)
    signal?.removeEventListener?.('abort', abortFromParent)
  }
}

async function loadSuggestions(engine, query, signal) {
  const text = normalizeSearchText(query)
  if (!engine || !text)
    return []

  const canUseNetwork = await ensureNetworkPermission()
  if (!canUseNetwork)
    throw new Error('缺少 network.internet 权限')

  const payload = await fetchJsonWithTimeout(engine.buildSuggestUrl(text), signal)
  return parseEngineSuggestions(engine.id, payload)
}

async function enterSearchEngineMode(engine, query, signal, options = {}) {
  const requestSeq = beginFeatureRequest()
  const text = normalizeSearchText(query)
  const featureId = options.featureId || `${SEARCH_ENGINE_FEATURE_PREFIX}${engine.id}`
  const request = createSearchRequestSignal(signal)

  try {
    if (!options.preserveInput) {
      await plugin.box?.showInput?.()
      await plugin.box?.allowInput?.()
      await plugin.box?.setInput?.(text)
    }

    await pushFeatureItems(buildSearchItems(featureId, engine, text), requestSeq)

    if (!text)
      return true

    try {
      const suggestions = await loadSuggestions(engine, text, request.signal)
      if (!isCurrentFeatureRequest(requestSeq, request.signal))
        return true
      await pushFeatureItems(buildSearchItems(featureId, engine, text, suggestions), requestSeq)
    }
    catch (error) {
      if (!isCurrentFeatureRequest(requestSeq, request.signal))
        return true
      await pushFeatureItems(buildSearchItems(featureId, engine, text, [], {
        warning: error?.message || '网络请求失败，仅保留直接搜索',
      }), requestSeq)
    }

    return true
  }
  finally {
    request.release()
  }
}

async function handleWebSearchFeature(featureId, query, signal) {
  const requestSeq = beginFeatureRequest()
  const settings = await loadSearchSettings()
  const parsed = parseSearchQuery(getQueryText(query), settings)
  const engine = parsed.engine
  const text = parsed.query
  const request = createSearchRequestSignal(signal)

  try {
    await pushFeatureItems(buildSearchItems(featureId, engine, text), requestSeq)

    if (!text)
      return true

    try {
      const suggestions = await loadSuggestions(engine, text, request.signal)
      if (!isCurrentFeatureRequest(requestSeq, request.signal))
        return true
      await pushFeatureItems(buildSearchItems(featureId, engine, text, suggestions), requestSeq)
    }
    catch (error) {
      if (!isCurrentFeatureRequest(requestSeq, request.signal))
        return true
      await pushFeatureItems(buildSearchItems(featureId, engine, text, [], {
        warning: error?.message || '网络请求失败，仅保留直接搜索',
      }), requestSeq)
    }

    return true
  }
  finally {
    request.release()
  }
}

async function registerSearchEngineFeatures() {
  if (dynamicSearchFeaturesInitialized)
    return 0

  dynamicSearchFeaturesInitialized = true
  if (!features?.addFeature)
    return 0

  const settings = await loadSearchSettings()
  let addedCount = 0
  buildSearchEngineFeatures(settings).forEach((feature) => {
    if (typeof features.getFeature === 'function' && features.getFeature(feature.id))
      return
    if (features.addFeature(feature))
      addedCount += 1
  })

  return addedCount
}

async function handleBrowserOpenFeature(featureId, query) {
  const requestSeq = beginFeatureRequest()

  try {
    const hasShell = await ensurePermission('system.shell', '需要系统命令权限以打开浏览器')
    if (!hasShell) {
      await pushFeatureItems([
        buildInfoItem({
          id: `${featureId}-no-permission`,
          featureId,
          title: '缺少 system.shell 权限',
          subtitle: '授予权限后可执行浏览器打开动作',
        }),
      ], requestSeq)
      return true
    }

    const input = getQueryText(query)
    const url = normalizeUrlInput(input)
    const hasInput = normalizeText(input).length > 0

    if (!url) {
      await pushFeatureItems([
        buildInfoItem({
          id: `${featureId}-input-tip`,
          featureId,
          title: hasInput ? 'URL 格式不正确' : '请输入 URL',
          subtitle: hasInput ? '示例：https://example.com' : '支持 example.com 或 https://example.com',
        }),
        buildInfoItem({
          id: `${featureId}-input-guide`,
          featureId,
          title: '快捷提示',
          subtitle: '可输入域名后回车，自动补全 https://',
        }),
      ], requestSeq)
      return true
    }

    const availableBrowsers = await detectBrowsers()
    const recentBrowsers = await loadRecentBrowsers()
    const recommendedItems = availableBrowsers.map((browser, index) =>
      buildActionItem({
        id: `${featureId}-browser-${browser.id}-${index}`,
        featureId,
        title: `用 ${browser.name} 打开`,
        subtitle: truncateText(url, 72),
        actionId: 'open-browser',
        payload: { url, browser },
      }),
    )

    const recentItems = mergeRecentBrowsers(availableBrowsers, recentBrowsers).map((browser, index) =>
      buildActionItem({
        id: `${featureId}-recent-${browser.id}-${index}`,
        featureId,
        title: `最近 · ${browser.name}`,
        subtitle: truncateText(url, 72),
        actionId: 'open-browser',
        payload: { url, browser },
      }),
    )

    const quickActions = [
      buildActionItem({
        id: `${featureId}-quick-default`,
        featureId,
        title: '默认浏览器打开',
        subtitle: truncateText(url, 72),
        actionId: 'default-open',
        payload: { url },
      }),
      buildActionItem({
        id: `${featureId}-quick-copy`,
        featureId,
        title: '复制 URL',
        subtitle: truncateText(url, 72),
        actionId: 'copy-url',
        payload: { url },
      }),
    ]

    const tips = [
      buildInfoItem({
        id: `${featureId}-tip`,
        featureId,
        title: '安全提示',
        subtitle: '请先确认域名可信再打开链接',
      }),
    ]

    if (recommendedItems.length === 0) {
      tips.unshift(buildInfoItem({
        id: `${featureId}-no-browser`,
        featureId,
        title: '未检测到可用浏览器',
        subtitle: '可先尝试默认浏览器打开',
      }))
    }

    const groupOrder = resolveGroupOrder({
      quickActions,
      recommendedItems,
      recentItems,
      tips,
    })

    const items = []
    groupOrder.forEach((groupId) => {
      if (groupId === 'quick') {
        items.push(buildSectionHeader(featureId, 'quick', '快捷动作', '默认打开 / 复制 URL'))
        items.push(...quickActions)
      }

      if (groupId === 'recommended') {
        items.push(buildSectionHeader(featureId, 'recommended', '推荐浏览器', '按当前系统可用浏览器展示'))
        items.push(...recommendedItems)
      }

      if (groupId === 'recent') {
        items.push(buildSectionHeader(featureId, 'recent', '最近浏览器', `最多 ${RECENT_SHOW_LIMIT} 条`))
        items.push(...recentItems)
      }

      if (groupId === 'tips') {
        items.push(buildSectionHeader(featureId, 'tips', '提示区', '权限 / 输入 / 安全'))
        items.push(...tips)
      }
    })

    await pushFeatureItems(items, requestSeq)
    return true
  }
  catch (error) {
    logger?.error?.('[touch-browser-open] Failed to handle feature', error)
    await pushFeatureItems([
      buildInfoItem({
        id: `${featureId}-error`,
        featureId,
        title: '浏览器打开失败',
        subtitle: truncateText(error?.message || '未知错误', 120),
      }),
    ], requestSeq)
    return true
  }
}

const pluginLifecycle = {
  async onInit() {
    const addedCount = await registerSearchEngineFeatures()
    if (addedCount > 0) {
      logger?.info?.(`[touch-browser-open] Registered ${addedCount} search engine features`)
    }
  },

  async onFeatureTriggered(featureId, query, _feature, signal) {
    const engine = resolveEngineFromFeatureId(featureId)
    if (engine) {
      if (!signal)
        return true
      const modeFeatureId = `${SEARCH_ENGINE_FEATURE_PREFIX}${engine.id}`
      const preserveInput = activeSearchMode?.featureId === modeFeatureId
      startSearchInputSession(modeFeatureId, engine)
      return enterSearchEngineMode(engine, extractEngineModeQuery(engine, getQueryText(query)), signal, {
        featureId: modeFeatureId,
        preserveInput,
      })
    }

    if (featureId === WEB_SEARCH_FEATURE_ID) {
      if (!signal)
        return true
      const settings = await loadSearchSettings()
      const parsed = parseSearchQuery(getQueryText(query), settings)
      const preserveInput = activeSearchMode?.featureId === featureId
      startSearchInputSession(featureId, parsed.engine)
      if (!preserveInput)
        return handleWebSearchFeature(featureId, query, signal)
      return enterSearchEngineMode(parsed.engine, parsed.query, signal, {
        featureId,
        preserveInput: true,
      })
    }

    stopSearchInputSession()

    if (featureId !== ACTION_ID)
      return false

    return handleBrowserOpenFeature(featureId, query)
  },

  async onItemAction(item) {
    if (item?.meta?.defaultAction !== ACTION_ID)
      return

    const actionId = item.meta?.actionId
    const payload = item.meta?.payload || {}
    const url = normalizeUrlInput(payload.url)
      || (actionId === 'search-web' ? buildSearchUrl(payload.engineId, payload.query) : null)
    if (!actionId || !url)
      return

    beginFeatureRequest()

    const hasShell = await ensurePermission('system.shell', '需要系统命令权限以打开浏览器')
    if (!hasShell)
      return

    try {
      if (actionId === 'copy-url') {
        const copied = await tryCopyUrl(url)
        if (!copied) {
          return {
            externalAction: true,
            success: false,
            message: '复制失败：缺少 clipboard.write 权限',
          }
        }
        return { externalAction: true }
      }

      if (actionId === 'default-open') {
        await executeOpenAction(url, null)
        return { externalAction: true }
      }

      if (actionId === 'search-web') {
        stopSearchInputSession()
        await executeOpenAction(url, null)
        plugin.box?.hide?.()
        return { externalAction: true }
      }

      if (actionId === 'open-browser') {
        const browser = payload.browser || {}
        const browserTarget = normalizeText(browser.target)
        const browserId = normalizeText(browser.id)
        const browserName = normalizeText(browser.name) || browserId

        if (!browserTarget)
          return

        await executeOpenAction(url, browserTarget)

        if (browserId) {
          const recent = await loadRecentBrowsers()
          const next = touchRecentBrowser(recent, {
            id: browserId,
            name: browserName,
            target: browserTarget,
          })
          await saveRecentBrowsers(next)
        }

        return { externalAction: true }
      }
    }
    catch (error) {
      logger?.error?.('[touch-browser-open] Action failed', error)
      return {
        externalAction: true,
        success: false,
        message: error?.message || '执行失败',
      }
    }
  },

}

module.exports = {
  ...pluginLifecycle,
  __test: {
    buildWindowsOpenScript,
    buildSearchEngineFeatures,
    buildSearchItems,
    buildSearchUrl,
    extractEngineModeQuery,
    isLikelyUrlInput,
    mergeRecentBrowsers,
    normalizeUrlInput,
    normalizeSearchSettings,
    parseEngineSuggestions,
    parseSearchQuery,
    parseRecentBrowsers,
    resolveGroupOrder,
    touchRecentBrowser,
  },
}
