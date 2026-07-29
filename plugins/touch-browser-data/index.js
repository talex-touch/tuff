const { plugin, clipboard, logger, TuffItemBuilder, permission, openUrl } = globalThis

const PLUGIN_NAME = 'touch-browser-data'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'emoji', value: '🌐' }
const ACTION_ID = 'browser-data'
const BOOKMARK_PROVIDER_ID = 'touch-browser-data.browser-bookmarks'
const HISTORY_PROVIDER_ID = 'touch-browser-data.browser-history'
const BOOKMARK_SOURCE_ID = 'browser-bookmarks'
const HISTORY_SOURCE_ID = 'browser-history'
const NETWORK_PERMISSION_ID = 'network.internet'
const BROWSER_DATA_SOURCES = [
  {
    id: BOOKMARK_SOURCE_ID,
    capabilityId: 'bookmarks',
    providerId: BOOKMARK_PROVIDER_ID,
    sourceType: 'browser-bookmark',
    label: '浏览器书签',
    diagnosticLabel: '书签',
  },
  {
    id: HISTORY_SOURCE_ID,
    capabilityId: 'history',
    providerId: HISTORY_PROVIDER_ID,
    sourceType: 'browser-history',
    label: '浏览器历史',
    diagnosticLabel: '历史',
  },
]
const PREFIXES = [
  'browser-data',
  'browser',
  'bookmarks',
  'history',
  'chrome',
  'edge',
  'brave',
  'arc',
  '浏览器',
  '书签',
  '历史',
]
const SUPPORTED_BROWSERS = ['chrome', 'edge', 'brave', 'arc']
const MAX_BOOKMARK_RESULTS = 30
const MAX_HISTORY_RESULTS = 20

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  return typeof query === 'string' ? query : (query?.text ?? '')
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

function normalizeSourceIds(sourceIds) {
  const requested = Array.isArray(sourceIds)
    ? new Set(sourceIds.map(sourceId => normalizeText(sourceId)).filter(Boolean))
    : null
  return BROWSER_DATA_SOURCES.filter(source => !requested || requested.has(source.id)).map(source => source.id)
}

function parseQuery(query) {
  const raw = normalizeText(getQueryText(query)).replace(/\s+/g, ' ')
  if (!raw)
    return { browser: '', keyword: '' }
  const lower = raw.toLowerCase()
  for (const prefix of PREFIXES) {
    const candidate = prefix.toLowerCase()
    if (lower === candidate) {
      return {
        browser: SUPPORTED_BROWSERS.includes(candidate) ? candidate : '',
        keyword: '',
      }
    }
    if (lower.startsWith(`${candidate} `) || lower.startsWith(`${candidate}:`)) {
      const offset = prefix.length + (lower.startsWith(`${candidate}:`) ? 1 : 0)
      return {
        browser: SUPPORTED_BROWSERS.includes(candidate) ? candidate : '',
        keyword: raw.slice(offset).trim(),
      }
    }
  }
  return { browser: '', keyword: raw }
}

function truncateText(value, maximum = 96) {
  const text = normalizeText(value)
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`
}

function sourceMeta(sourceId) {
  const source = BROWSER_DATA_SOURCES.find(candidate => candidate.id === sourceId)
  return source ? { searchProviderId: source.providerId } : {}
}

function scoreRecord(record, keyword) {
  const target = normalizeText(keyword).toLowerCase()
  if (!target)
    return 10
  const title = normalizeText(record.title).toLowerCase()
  const url = normalizeText(record.url).toLowerCase()
  const folder = normalizeText(record.folder).toLowerCase()
  const browser = normalizeText(record.browserName).toLowerCase()
  if (title === target)
    return 100
  if (title.startsWith(target))
    return 85
  if (url.includes(target))
    return 70
  if (folder.includes(target))
    return 55
  if (browser.includes(target))
    return 45
  return `${title} ${url} ${folder} ${browser}`.includes(target) ? 35 : 0
}

function dedupeRecords(records, source) {
  const byKey = new Map()
  for (const record of records) {
    const key = source === 'bookmarks' ? record.url : `${record.browser}:${record.profile}:${record.url}`
    const existing = byKey.get(key)
    if (!existing || Number(record.visitedAt) > Number(existing.visitedAt))
      byKey.set(key, record)
  }
  return Array.from(byKey.values())
}

function searchRecords(records, keyword, source) {
  const limit = source === 'bookmarks' ? MAX_BOOKMARK_RESULTS : MAX_HISTORY_RESULTS
  return dedupeRecords(records, source)
    .map((record, index) => ({
      ...record,
      score: scoreRecord(record, keyword),
      index,
    }))
    .filter(record => record.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score
        || (source === 'history' ? Number(right.visitedAt) - Number(left.visitedAt) : 0)
        || left.index - right.index,
    )
    .slice(0, limit)
}

async function ensurePermission(permissionId) {
  if (typeof permission?.check !== 'function')
    return { granted: false, reason: 'permission-sdk-unavailable' }
  try {
    if (await permission.check(permissionId))
      return { granted: true }
    return { granted: false, reason: 'permission-denied' }
  }
  catch {
    logger?.warn?.('[touch-browser-data] Permission check failed')
    return { granted: false, reason: 'permission-check-failed' }
  }
}

async function networkCapabilityState() {
  if (typeof permission?.check !== 'function')
    return { status: 'permission-missing', reason: 'permission-sdk-unavailable' }
  try {
    return (await permission.check(NETWORK_PERMISSION_ID))
      ? { status: 'available', reason: '' }
      : {
          status: 'permission-missing',
          reason: 'network-internet-permission-required',
        }
  }
  catch {
    return { status: 'permission-missing', reason: 'permission-check-failed' }
  }
}

function buildInfoItem({ id, featureId, title, subtitle, sourceId }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({ pluginName: PLUGIN_NAME, featureId, ...sourceMeta(sourceId) })
    .build()
}

function urlHost(url) {
  try {
    return new URL(url).host
  }
  catch {
    return ''
  }
}

function networkCapability(featureId, record, sourceType, state) {
  return {
    id: NETWORK_PERMISSION_ID,
    type: 'network',
    permission: NETWORK_PERMISSION_ID,
    status: state.status,
    ...(state.reason ? { reason: state.reason } : {}),
    audit: {
      pluginName: PLUGIN_NAME,
      featureId,
      actionId: 'open-url',
      operation: 'open-external-url',
      source: sourceType === 'browser-history' ? 'history-sqlite' : 'bookmarks-json',
      browserId: record.browser,
      browserName: record.browserName,
      urlHost: urlHost(record.url),
    },
  }
}

function buildRecordItem(featureId, record, index, state) {
  const history = record.source === 'history'
  const sourceId = history ? HISTORY_SOURCE_ID : BOOKMARK_SOURCE_ID
  const sourceType = history ? 'browser-history' : 'browser-bookmark'
  const label = history ? `${record.browserName} · 历史 · ${record.title}` : `${record.browserName} · ${record.title}`
  const suffix = state.status === 'available' ? '' : ' · 缺少 network.internet 权限'
  return new TuffItemBuilder(`${featureId}-${record.source}-${index}`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(label)
    .setSubtitle(`${truncateText(record.url, 72)}${history ? ' · 最近访问' : ''}${suffix}`)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      ...sourceMeta(sourceId),
      defaultAction: ACTION_ID,
    })
    .createAndAddAction('open-url', 'plugin', '打开网址', {
      url: record.url,
      title: record.title,
      sourceType,
      capability: networkCapability(featureId, record, sourceType, state),
    })
    .createAndAddAction('copy-url', 'plugin', '复制 URL', {
      url: record.url,
      sourceType,
    })
    .build()
}

function buildMaintenanceItems(featureId, query, sourceIds) {
  return BROWSER_DATA_SOURCES.filter(source => sourceIds.includes(source.id)).flatMap(source => [
    new TuffItemBuilder(`${featureId}-${source.id}-rebuild`)
      .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
      .setTitle(`重新扫描${source.label}`)
      .setSubtitle(`重新读取已授权的${source.label}`)
      .setIcon(ICON)
      .setMeta({
        pluginName: PLUGIN_NAME,
        featureId,
        ...sourceMeta(source.id),
        defaultAction: ACTION_ID,
      })
      .createAndAddAction('rebuild-browser-data', 'plugin', '重新扫描', {
        query: getQueryText(query),
        sourceIds: [source.id],
      })
      .build(),
    new TuffItemBuilder(`${featureId}-${source.id}-clear-results`)
      .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
      .setTitle(`清除当前${source.label}结果`)
      .setSubtitle('清除当前面板中的对应结果')
      .setIcon(ICON)
      .setMeta({
        pluginName: PLUGIN_NAME,
        featureId,
        ...sourceMeta(source.id),
        defaultAction: ACTION_ID,
      })
      .createAndAddAction('clear-browser-data-results', 'plugin', '清除结果', {
        sourceIds: [source.id],
      })
      .build(),
  ])
}

function diagnosticSubtitle(diagnostics, recordCount) {
  const available = diagnostics.filter(item => item.status === 'available' || item.status === 'partial')
  const failed = diagnostics.filter(item => item.status === 'failed')
  const unsupported = diagnostics.filter(item => item.status === 'unsupported')
  const parts = []
  if (available.length) {
    parts.push(
      `${recordCount} 条 · ${available.map(item => `${item.browserName || item.browser} ${item.profileCount} 个档案`).join(' / ')}`,
    )
  }
  if (failed.length)
    parts.push(`${failed.map(item => `${item.browserName || item.browser} ${item.code}`).join(' / ')}`)
  if (unsupported.length)
    parts.push(`${unsupported.map(item => `${item.browserName || item.browser} 不支持`).join(' / ')}`)
  if (!parts.length)
    parts.push('未发现可读取的数据')
  return parts.join(' · ')
}

function buildResultItems(featureId, query, scanResult, state) {
  const parsed = parseQuery(query)
  const items = []
  for (const source of scanResult.sourceIds) {
    const capabilityId = source === BOOKMARK_SOURCE_ID ? 'bookmarks' : 'history'
    const records = scanResult.records.filter(record => record.source === capabilityId)
    const diagnostics = scanResult.diagnostics.filter(item => item.source === capabilityId)
    const matches = searchRecords(records, parsed.keyword, capabilityId)
    if (matches.length) {
      matches.forEach((record, index) => items.push(buildRecordItem(featureId, record, index, state)))
    }
    else {
      items.push(
        buildInfoItem({
          id: `${featureId}-${source}-empty`,
          featureId,
          sourceId: source,
          title: parsed.keyword
            ? `没有匹配的${BROWSER_DATA_SOURCES.find(item => item.id === source).label}`
            : `未发现${BROWSER_DATA_SOURCES.find(item => item.id === source).label}`,
          subtitle: diagnosticSubtitle(diagnostics, records.length),
        }),
      )
    }
    items.push(
      buildInfoItem({
        id: `${featureId}-${source}-diagnostics`,
        featureId,
        sourceId: source,
        title: `${BROWSER_DATA_SOURCES.find(item => item.id === source).diagnosticLabel}扫描状态`,
        subtitle: diagnosticSubtitle(diagnostics, records.length),
      }),
    )
  }
  items.push(...buildMaintenanceItems(featureId, query, scanResult.sourceIds))
  return items
}

async function scanSource(source, browser) {
  const result = await plugin.browserData.scan([source.capabilityId], browser || undefined)
  if (result?.status !== 'completed')
    return null
  return {
    sourceId: source.id,
    records: Array.isArray(result.records) ? result.records : [],
    diagnostics: Array.isArray(result.diagnostics) ? result.diagnostics : [],
  }
}

async function scanBrowserData(query, sourceIds) {
  const parsed = parseQuery(query)
  const requested = normalizeSourceIds(sourceIds)
  const records = []
  const diagnostics = []
  const completedSourceIds = []
  for (const source of BROWSER_DATA_SOURCES.filter(candidate => requested.includes(candidate.id))) {
    if (source.capabilityId === 'history') {
      const indexPermission = await ensurePermission('fs.index')
      if (!indexPermission.granted)
        continue
    }
    const result = await scanSource(source, parsed.browser)
    if (!result)
      continue
    completedSourceIds.push(result.sourceId)
    records.push(...result.records)
    diagnostics.push(...result.diagnostics)
  }
  return { records, diagnostics, sourceIds: completedSourceIds }
}

async function clearSourceResults(sourceIds) {
  if (typeof plugin?.feature?.getItems !== 'function' || typeof plugin?.feature?.removeItem !== 'function')
    return false
  const normalizedSourceIds = normalizeSourceIds(sourceIds)
  const targetProviders = new Set(
    BROWSER_DATA_SOURCES
      .filter(source => normalizedSourceIds.includes(source.id))
      .map(source => source.providerId),
  )
  const items = await plugin.feature.getItems()
  const removals = []
  for (const item of items) {
    if (targetProviders.has(normalizeText(item?.meta?.searchProviderId)))
      removals.push(plugin.feature.removeItem(item.id))
  }
  await Promise.all(removals)
  return true
}

async function renderResults(featureId, query, sourceIds, replaceOnly = false) {
  const scanResult = await scanBrowserData(query, sourceIds)
  const state = await networkCapabilityState()
  if (replaceOnly)
    await clearSourceResults(sourceIds)
  else await plugin.feature.clearItems()
  if (scanResult.sourceIds.length)
    await plugin.feature.pushItems(buildResultItems(featureId, query, scanResult, state))
  return scanResult
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      await plugin.feature.clearItems()
      const permissionResult = await ensurePermission('fs.read')
      if (!permissionResult.granted) {
        await plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-permission`,
            featureId,
            title: '缺少文件读取权限',
            subtitle: '授权 fs.read 后才能读取浏览器数据',
          }),
        ])
        return true
      }
      await renderResults(featureId, query, [BOOKMARK_SOURCE_ID, HISTORY_SOURCE_ID])
      return true
    }
    catch {
      logger?.error?.('[touch-browser-data] Browser data scan failed')
      await plugin.feature.clearItems()
      await plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-error`,
          featureId,
          title: '浏览器数据加载失败',
          subtitle: '请确认权限与浏览器数据状态后重试',
        }),
      ])
      return true
    }
  },

  async onItemAction(item) {
    if (item?.meta?.defaultAction !== ACTION_ID)
      return
    const action = Array.isArray(item.actions) ? item.actions[0] : null
    const actionId = action?.id
    const payload = action?.payload || {}
    const featureId = normalizeText(item.meta?.featureId) || 'browser-data'
    try {
      if (actionId === 'rebuild-browser-data') {
        const sourceIds = normalizeSourceIds(payload.sourceIds)
        const permissionResult = await ensurePermission('fs.read')
        if (!permissionResult.granted) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: permissionResult.reason,
            message: '缺少 fs.read 权限',
          }
        }
        const result = await renderResults(featureId, payload.query, sourceIds, true)
        return {
          externalAction: true,
          status: result.sourceIds.length ? 'completed' : 'blocked',
          sourceIds: result.sourceIds,
          operation: 'rebuild',
        }
      }

      if (actionId === 'clear-browser-data-results') {
        const sourceIds = normalizeSourceIds(payload.sourceIds)
        const cleared = await clearSourceResults(sourceIds)
        return {
          externalAction: true,
          ...(cleared ? {} : { success: false }),
          status: cleared ? 'completed' : 'failed',
          sourceIds,
          operation: 'clear-results',
        }
      }

      const url = normalizeUrl(payload.url)
      if (!url)
        return
      if (actionId === 'open-url') {
        const permissionResult = await ensurePermission(NETWORK_PERMISSION_ID)
        if (!permissionResult.granted || typeof openUrl !== 'function') {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: permissionResult.reason || 'open-url-unavailable',
            message: '无法打开网址',
          }
        }
        await openUrl(url)
        return { externalAction: true, status: 'started' }
      }

      if (actionId === 'copy-url') {
        const permissionResult = await ensurePermission('clipboard.write')
        if (!permissionResult.granted || typeof clipboard?.writeText !== 'function') {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: permissionResult.reason || 'clipboard-unavailable',
            message: '无法复制网址',
          }
        }
        await clipboard.writeText(url)
        return { externalAction: true, status: 'completed' }
      }
    }
    catch {
      logger?.error?.('[touch-browser-data] Browser data action failed')
      return { externalAction: true, success: false, message: '执行失败' }
    }
  },
}

module.exports = pluginLifecycle
