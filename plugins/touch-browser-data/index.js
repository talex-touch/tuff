const { plugin, logger, TuffItemBuilder, permission, openUrl } = globalThis
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')

const PLUGIN_NAME = 'touch-browser-data'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'emoji', value: '🌐' }
const ACTION_ID = 'browser-data'
const MAX_RESULTS = 30
const MAX_PROFILES_PER_BROWSER = 8
const SUPPORTED_BROWSERS = ['chrome', 'edge', 'brave', 'arc']
const PREFIXES = ['browser-data', 'browser', 'bookmarks', 'chrome', 'edge', 'brave', 'arc', '浏览器', '书签']
const BROWSER_LABELS = {
  chrome: 'Chrome',
  edge: 'Edge',
  brave: 'Brave',
  arc: 'Arc',
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function truncateText(value, max = 96) {
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

function normalizeUrl(value) {
  const text = normalizeText(value)
  if (!text)
    return ''
  try {
    const url = new URL(text)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return ''
    return url.toString()
  }
  catch {
    return ''
  }
}

function parseQuery(rawQuery) {
  const raw = normalizeText(getQueryText(rawQuery)).replace(/\s+/g, ' ')
  if (!raw)
    return { browser: '', keyword: '' }

  const lower = raw.toLowerCase()
  for (const prefix of PREFIXES) {
    const prefixLower = prefix.toLowerCase()
    if (lower === prefixLower)
      return { browser: SUPPORTED_BROWSERS.includes(prefixLower) ? prefixLower : '', keyword: '' }
    if (lower.startsWith(`${prefixLower} `)) {
      return {
        browser: SUPPORTED_BROWSERS.includes(prefixLower) ? prefixLower : '',
        keyword: raw.slice(prefix.length).trim(),
      }
    }
    if (lower.startsWith(`${prefixLower}:`)) {
      return {
        browser: SUPPORTED_BROWSERS.includes(prefixLower) ? prefixLower : '',
        keyword: raw.slice(prefix.length + 1).trim(),
      }
    }
  }

  return { browser: '', keyword: raw }
}

function browserDefinitions(platform = process.platform, homeDir = os.homedir(), env = process.env) {
  if (platform === 'darwin') {
    const appSupport = path.join(homeDir, 'Library', 'Application Support')
    return [
      { id: 'chrome', name: 'Chrome', root: path.join(appSupport, 'Google', 'Chrome') },
      { id: 'edge', name: 'Edge', root: path.join(appSupport, 'Microsoft Edge') },
      { id: 'brave', name: 'Brave', root: path.join(appSupport, 'BraveSoftware', 'Brave-Browser') },
      { id: 'arc', name: 'Arc', root: path.join(appSupport, 'Arc', 'User Data') },
    ]
  }

  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local')
    return [
      { id: 'chrome', name: 'Chrome', root: path.join(localAppData, 'Google', 'Chrome', 'User Data') },
      { id: 'edge', name: 'Edge', root: path.join(localAppData, 'Microsoft', 'Edge', 'User Data') },
      { id: 'brave', name: 'Brave', root: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data') },
      { id: 'arc', name: 'Arc', root: path.join(localAppData, 'Packages', 'TheBrowserCompany.Arc_ttt1ap7aakyb4', 'LocalCache', 'Local', 'Arc', 'User Data') },
    ]
  }

  if (platform === 'linux') {
    const configHome = env.XDG_CONFIG_HOME || path.join(homeDir, '.config')
    return [
      { id: 'chrome', name: 'Chrome', root: path.join(configHome, 'google-chrome') },
      { id: 'edge', name: 'Edge', root: path.join(configHome, 'microsoft-edge') },
      { id: 'brave', name: 'Brave', root: path.join(configHome, 'BraveSoftware', 'Brave-Browser') },
    ]
  }

  return []
}

function buildBrowserSourceDiagnostics(platform, definitions, browserFilter = '') {
  const byId = new Map((Array.isArray(definitions) ? definitions : []).map(definition => [definition.id, definition]))
  const ids = browserFilter ? [browserFilter] : SUPPORTED_BROWSERS
  return ids.map((id) => {
    const definition = byId.get(id)
    if (definition) {
      return {
        browserId: definition.id,
        browserName: definition.name,
        root: definition.root,
        status: 'supported',
        profileCount: 0,
        reason: '',
        lastError: '',
      }
    }

    return {
      browserId: id,
      browserName: BROWSER_LABELS[id] || id,
      root: '',
      status: 'unsupported',
      profileCount: 0,
      reason: `${BROWSER_LABELS[id] || id} bookmarks are unsupported on ${platform}`,
      lastError: '',
    }
  })
}

function getAvailableBrowserNames(platform = process.platform) {
  return browserDefinitions(platform).map(definition => definition.name)
}

function isProfileDirectoryName(name) {
  return name === 'Default' || name === 'Guest Profile' || /^Profile \d+$/i.test(name)
}

function discoverBookmarkFiles(definition, fsImpl = fs) {
  if (!definition?.root)
    return []
  if (!fsImpl.existsSync(definition.root))
    return []

  const candidates = []
  const directPath = path.join(definition.root, 'Bookmarks')
  if (fsImpl.existsSync(directPath)) {
    candidates.push({
      browserId: definition.id,
      browserName: definition.name,
      profile: 'Default',
      path: directPath,
    })
  }

  let entries = []
  try {
    entries = fsImpl.readdirSync(definition.root, { withFileTypes: true })
  }
  catch {
    return candidates
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !isProfileDirectoryName(entry.name))
      continue
    const bookmarkPath = path.join(definition.root, entry.name, 'Bookmarks')
    if (!fsImpl.existsSync(bookmarkPath))
      continue
    candidates.push({
      browserId: definition.id,
      browserName: definition.name,
      profile: entry.name,
      path: bookmarkPath,
    })
    if (candidates.length >= MAX_PROFILES_PER_BROWSER)
      break
  }

  const seen = new Set()
  return candidates.filter((item) => {
    if (seen.has(item.path))
      return false
    seen.add(item.path)
    return true
  })
}

function readJsonFile(filePath, fsImpl = fs) {
  const raw = fsImpl.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

function collectBookmarkNodes(node, context, result = []) {
  if (!node || typeof node !== 'object')
    return result

  if (node.type === 'url') {
    const url = normalizeUrl(node.url)
    if (url) {
      const title = normalizeText(node.name) || url
      result.push({
        id: `${context.browserId}:${context.profile}:${url}`,
        browserId: context.browserId,
        browserName: context.browserName,
        profile: context.profile,
        title,
        url,
        folder: context.folder.join(' / '),
        dateAdded: normalizeText(node.date_added),
      })
    }
    return result
  }

  const nextFolder = node.name ? [...context.folder, normalizeText(node.name)] : context.folder
  const children = Array.isArray(node.children) ? node.children : []
  children.forEach(child => collectBookmarkNodes(child, { ...context, folder: nextFolder }, result))
  return result
}

function parseChromiumBookmarks(payload, source) {
  const roots = payload?.roots && typeof payload.roots === 'object' ? payload.roots : {}
  const result = []
  Object.values(roots).forEach((root) => {
    collectBookmarkNodes(root, {
      browserId: source.browserId,
      browserName: source.browserName,
      profile: source.profile,
      folder: [],
    }, result)
  })
  return result
}

function scanBrowserBookmarks(options = {}) {
  const platform = options.platform || process.platform
  const homeDir = options.homeDir || os.homedir()
  const env = options.env || process.env
  const fsImpl = options.fs || fs
  const browserFilter = normalizeText(options.browserFilter).toLowerCase()
  const definitions = (options.definitions || browserDefinitions(platform, homeDir, env))
    .filter(definition => !browserFilter || definition.id === browserFilter)
  const items = []
  const diagnostics = buildBrowserSourceDiagnostics(platform, definitions, browserFilter)
  const diagnosticsById = new Map(diagnostics.map(item => [item.browserId, item]))

  for (const definition of definitions) {
    const files = discoverBookmarkFiles(definition, fsImpl)
    const diagnostic = diagnosticsById.get(definition.id)
    if (diagnostic) {
      diagnostic.status = files.length ? 'available' : 'not-found'
      diagnostic.profileCount = files.length
      diagnostic.reason = files.length ? '' : 'Bookmarks file not found'
      diagnostic.lastError = ''
    }

    for (const file of files) {
      try {
        const payload = readJsonFile(file.path, fsImpl)
        items.push(...parseChromiumBookmarks(payload, file))
      }
      catch (error) {
        const message = error?.message || 'read-failed'
        if (diagnostic) {
          diagnostic.status = 'read-failed'
          diagnostic.reason = message
          diagnostic.lastError = message
          diagnostic.failedProfile = file.profile
        }
      }
    }
  }

  return { items: dedupeBookmarks(items), diagnostics }
}

function dedupeBookmarks(bookmarks) {
  const byUrl = new Map()
  for (const bookmark of Array.isArray(bookmarks) ? bookmarks : []) {
    const existing = byUrl.get(bookmark.url)
    if (!existing) {
      byUrl.set(bookmark.url, bookmark)
      continue
    }
    byUrl.set(bookmark.url, {
      ...existing,
      title: existing.title || bookmark.title,
      folder: existing.folder || bookmark.folder,
      browserName: existing.browserName || bookmark.browserName,
      profile: existing.profile || bookmark.profile,
    })
  }
  return Array.from(byUrl.values())
}

function scoreBookmark(bookmark, keyword) {
  const lower = keyword.toLowerCase()
  if (!lower)
    return 10
  const title = bookmark.title.toLowerCase()
  const url = bookmark.url.toLowerCase()
  const folder = bookmark.folder.toLowerCase()
  const browser = bookmark.browserName.toLowerCase()
  if (title === lower)
    return 100
  if (title.startsWith(lower))
    return 85
  if (url.includes(lower))
    return 70
  if (folder.includes(lower))
    return 55
  if (browser.includes(lower))
    return 45
  if (`${title} ${url} ${folder} ${browser}`.includes(lower))
    return 35
  return 0
}

function searchBookmarks(bookmarks, keyword, limit = MAX_RESULTS) {
  return (Array.isArray(bookmarks) ? bookmarks : [])
    .map((bookmark, index) => ({
      ...bookmark,
      score: scoreBookmark(bookmark, normalizeText(keyword)),
      index,
    }))
    .filter(bookmark => bookmark.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
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

function buildInfoItem({ id, featureId, title, subtitle }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({ pluginName: PLUGIN_NAME, featureId })
    .build()
}

function buildBookmarkItem(featureId, bookmark, index) {
  return new TuffItemBuilder(`${featureId}-bookmark-${index}`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(`${bookmark.browserName} · ${bookmark.title}`)
    .setSubtitle(`${truncateText(bookmark.url, 72)} · ${bookmark.profile}${bookmark.folder ? ` · ${bookmark.folder}` : ''}`)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: ACTION_ID,
      actionId: 'open-url',
      payload: {
        url: bookmark.url,
        title: bookmark.title,
      },
    })
    .createAndAddAction('copy-url', 'copy', '复制 URL', bookmark.url)
    .build()
}

function buildDiagnosticsItem(featureId, diagnostics, itemCount) {
  const available = diagnostics.filter(item => item.status === 'available')
  const failed = diagnostics.filter(item => item.status === 'read-failed')
  const unsupported = diagnostics.filter(item => item.status === 'unsupported')
  const summary = available.length
    ? `${itemCount} 条书签 · ${available.map(item => `${item.browserName} ${item.profileCount}`).join(' / ')}`
    : [
        failed.length ? `${failed.map(item => `${item.browserName} 读取失败`).join(' / ')}` : '',
        unsupported.length ? `${unsupported.map(item => `${item.browserName} 不支持`).join(' / ')}` : '',
        '未发现可读取的浏览器书签文件',
      ].filter(Boolean).join(' · ')
  return buildInfoItem({
    id: `${featureId}-diagnostics`,
    featureId,
    title: '扫描状态',
    subtitle: summary,
  })
}

function buildResultItems(featureId, query, scanResult) {
  const parsed = parseQuery(query)
  const items = Array.isArray(scanResult?.items) ? scanResult.items : []
  const diagnostics = Array.isArray(scanResult?.diagnostics) ? scanResult.diagnostics : []
  const matched = searchBookmarks(items, parsed.keyword)
  const resultItems = []
  const availableBrowserNames = diagnostics
    .filter(item => item.status !== 'unsupported')
    .map(item => item.browserName)
  const availabilityText = availableBrowserNames.length
    ? `当前平台只读 ${availableBrowserNames.join(' / ')} 的 Bookmarks JSON`
    : '当前平台暂无支持的浏览器书签源'

  if (!matched.length) {
    resultItems.push(buildInfoItem({
      id: `${featureId}-empty`,
      featureId,
      title: parsed.keyword ? '没有匹配的浏览器书签' : '未发现浏览器书签',
      subtitle: parsed.keyword ? '尝试输入标题、URL、文件夹或浏览器名称' : availabilityText,
    }))
  }
  else {
    matched.forEach((bookmark, index) => resultItems.push(buildBookmarkItem(featureId, bookmark, index)))
  }

  resultItems.push(buildDiagnosticsItem(featureId, diagnostics, items.length))
  return resultItems
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const canRead = await ensurePermission('fs.read', '需要只读扫描浏览器 Bookmarks JSON 文件')
      if (!canRead) {
        plugin.feature.clearItems()
        plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-permission`,
            featureId,
            title: '缺少文件读取权限',
            subtitle: '授权 fs.read 后才能只读扫描浏览器书签',
          }),
        ])
        return true
      }

      const parsed = parseQuery(query)
      const scanResult = scanBrowserBookmarks({ browserFilter: parsed.browser })
      plugin.feature.clearItems()
      plugin.feature.pushItems(buildResultItems(featureId, query, scanResult))
      return true
    }
    catch (error) {
      logger?.error?.('[touch-browser-data] Failed to process feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-error`,
          featureId,
          title: '浏览器数据加载失败',
          subtitle: truncateText(error?.message || '未知错误', 120),
        }),
      ])
      return true
    }
  },

  async onItemAction(item) {
    if (item?.meta?.defaultAction !== ACTION_ID)
      return

    const payload = item.meta?.payload || {}
    const url = normalizeUrl(payload.url)
    if (!url)
      return

    try {
      if (item.meta?.actionId === 'open-url') {
        if (typeof openUrl !== 'function') {
          return {
            externalAction: true,
            success: false,
            message: '当前环境不支持打开外链',
          }
        }
        openUrl(url)
        return { externalAction: true }
      }
    }
    catch (error) {
      logger?.error?.('[touch-browser-data] Action failed', error)
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
    browserDefinitions,
    buildBrowserSourceDiagnostics,
    buildResultItems,
    collectBookmarkNodes,
    dedupeBookmarks,
    discoverBookmarkFiles,
    getAvailableBrowserNames,
    parseChromiumBookmarks,
    parseQuery,
    scanBrowserBookmarks,
    searchBookmarks,
  },
}
