const { plugin, clipboard, logger, TuffItemBuilder, permission, openUrl } = globalThis

const PLUGIN_NAME = 'touch-browser-bookmarks'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'class', value: 'i-ri-bookmark-line' }
const ACTION_ID = 'browser-bookmarks'
const NETWORK_PERMISSION_ID = 'network.internet'

const BOOKMARKS_FILE = 'bookmarks.json'
const RECENT_FILE = 'recent-urls.json'

const MAX_BOOKMARKS = 200
const MAX_RECENT = 60
const SHOW_BOOKMARKS = 20
const SHOW_RECENT = 8
const RECENT_TTL_MS = 30 * 24 * 60 * 60 * 1000

let triggerGeneration = 0
let destroyed = false

function isStaleGeneration(generation) {
  return destroyed || generation !== triggerGeneration
}

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

function toUnixTime(value, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0)
    return fallback
  return Math.trunc(num)
}

function parsePayload(raw) {
  if (!raw)
    return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    }
    catch {
      return null
    }
  }
  if (typeof raw === 'object')
    return raw
  return null
}

function guessTitleFromUrl(url) {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.host}${path}`
  }
  catch {
    return url
  }
}

function normalizeTagList(tags) {
  if (!Array.isArray(tags))
    return []
  const seen = new Set()
  const result = []
  tags.forEach((tag) => {
    const value = normalizeText(tag)
    if (!value)
      return
    const lower = value.toLowerCase()
    if (seen.has(lower))
      return
    seen.add(lower)
    result.push(value)
  })
  return result
}

function createBookmarkId() {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `bookmark-${Date.now()}-${suffix}`
}

function normalizeBookmarkRecord(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object')
    return null

  const url = normalizeUrlInput(raw.url)
  if (!url)
    return null

  const createdAt = toUnixTime(raw.createdAt, now)
  const updatedAt = toUnixTime(raw.updatedAt, createdAt)
  const title = normalizeText(raw.title) || guessTitleFromUrl(url)

  return {
    id: normalizeText(raw.id) || createBookmarkId(),
    title,
    url,
    tags: normalizeTagList(raw.tags),
    pinned: Boolean(raw.pinned),
    createdAt,
    updatedAt,
  }
}

function mergeBookmarkRecord(current, incoming) {
  const useIncoming = (!current.pinned && incoming.pinned)
    || (incoming.pinned === current.pinned && incoming.updatedAt >= current.updatedAt)

  const base = useIncoming ? incoming : current
  const extra = useIncoming ? current : incoming

  return {
    ...base,
    tags: normalizeTagList([...(base.tags || []), ...(extra.tags || [])]),
    pinned: base.pinned || extra.pinned,
    createdAt: Math.min(base.createdAt, extra.createdAt),
    updatedAt: Math.max(base.updatedAt, extra.updatedAt),
  }
}

function cleanupBookmarks(items, now = Date.now()) {
  const list = Array.isArray(items) ? items : []
  const byUrl = new Map()

  list.forEach((item) => {
    const normalized = normalizeBookmarkRecord(item, now)
    if (!normalized)
      return

    const existing = byUrl.get(normalized.url)
    if (!existing) {
      byUrl.set(normalized.url, normalized)
      return
    }

    byUrl.set(normalized.url, mergeBookmarkRecord(existing, normalized))
  })

  return Array.from(byUrl.values())
    .sort((left, right) => {
      if (left.pinned !== right.pinned)
        return left.pinned ? -1 : 1
      return right.updatedAt - left.updatedAt
    })
    .slice(0, MAX_BOOKMARKS)
}

function parseBookmarks(raw, now = Date.now()) {
  const payload = parsePayload(raw)
  const items = Array.isArray(payload?.items) ? payload.items : []
  return cleanupBookmarks(items, now)
}

function normalizeRecentRecord(raw) {
  if (!raw || typeof raw !== 'object')
    return null

  const url = normalizeUrlInput(raw.url)
  if (!url)
    return null

  const title = normalizeText(raw.title) || guessTitleFromUrl(url)
  const lastUsedAt = toUnixTime(raw.lastUsedAt, Date.now())

  return { url, title, lastUsedAt }
}

function cleanupRecent(items, now = Date.now()) {
  const list = Array.isArray(items) ? items : []
  const threshold = now - RECENT_TTL_MS
  const byUrl = new Map()

  list.forEach((item) => {
    const normalized = normalizeRecentRecord(item)
    if (!normalized)
      return
    if (normalized.lastUsedAt < threshold)
      return

    const existing = byUrl.get(normalized.url)
    if (!existing || normalized.lastUsedAt > existing.lastUsedAt)
      byUrl.set(normalized.url, normalized)
  })

  return Array.from(byUrl.values())
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, MAX_RECENT)
}

function parseRecent(raw, now = Date.now()) {
  const payload = parsePayload(raw)
  const items = Array.isArray(payload?.items) ? payload.items : []
  return cleanupRecent(items, now)
}

function filterBookmarks(bookmarks, keyword) {
  const list = Array.isArray(bookmarks) ? bookmarks : []
  const target = normalizeText(keyword).toLowerCase()
  if (!target)
    return list

  return list.filter((item) => {
    const tags = Array.isArray(item.tags) ? item.tags.join(' ') : ''
    return `${item.title} ${item.url} ${tags}`.toLowerCase().includes(target)
  })
}

function filterRecent(recentItems, keyword) {
  const list = Array.isArray(recentItems) ? recentItems : []
  const target = normalizeText(keyword).toLowerCase()
  if (!target)
    return list

  return list.filter(item => `${item.title} ${item.url}`.toLowerCase().includes(target))
}

function mergeRecentForDisplay(recentItems, bookmarkItems) {
  const bookmarks = Array.isArray(bookmarkItems) ? bookmarkItems : []
  const bookmarkUrlSet = new Set(bookmarks.map(item => item.url))
  return (Array.isArray(recentItems) ? recentItems : [])
    .filter(item => !bookmarkUrlSet.has(item.url))
    .slice(0, SHOW_RECENT)
}

function touchRecentUrl(items, url, title, now = Date.now()) {
  const normalizedUrl = normalizeUrlInput(url)
  if (!normalizedUrl)
    return cleanupRecent(items, now)

  const list = Array.isArray(items) ? [...items] : []
  const nextTitle = normalizeText(title) || guessTitleFromUrl(normalizedUrl)
  const existingIndex = list.findIndex(item => item.url === normalizedUrl)

  if (existingIndex >= 0)
    list.splice(existingIndex, 1)

  list.unshift({ url: normalizedUrl, title: nextTitle, lastUsedAt: now })
  return cleanupRecent(list, now)
}

function upsertBookmark(items, payload, now = Date.now()) {
  const normalizedUrl = normalizeUrlInput(payload?.url)
  if (!normalizedUrl)
    return cleanupBookmarks(items, now)

  const list = cleanupBookmarks(items, now)
  const title = normalizeText(payload?.title) || guessTitleFromUrl(normalizedUrl)
  const tags = normalizeTagList(payload?.tags)
  const index = list.findIndex(item => item.url === normalizedUrl)

  if (index >= 0) {
    const current = list[index]
    const next = {
      ...current,
      title,
      tags: normalizeTagList([...(current.tags || []), ...tags]),
      updatedAt: now,
      pinned: payload?.pinned === true ? true : current.pinned,
    }
    list[index] = next
    return cleanupBookmarks(list, now)
  }

  list.push({
    id: createBookmarkId(),
    title,
    url: normalizedUrl,
    tags,
    pinned: Boolean(payload?.pinned),
    createdAt: now,
    updatedAt: now,
  })

  return cleanupBookmarks(list, now)
}

function findBookmarkIndex(list, payload) {
  const targetId = normalizeText(payload?.id)
  if (targetId) {
    const byId = list.findIndex(item => item.id === targetId)
    if (byId >= 0)
      return byId
  }
  const targetUrl = normalizeUrlInput(payload?.url)
  if (targetUrl)
    return list.findIndex(item => item.url === targetUrl)
  return -1
}

function togglePinBookmark(items, payload, now = Date.now()) {
  const list = cleanupBookmarks(items, now)
  const index = findBookmarkIndex(list, payload)
  if (index < 0)
    return { found: false, items: list, pinned: false }

  const current = list[index]
  const nextPinned = typeof payload?.pinned === 'boolean' ? payload.pinned : !current.pinned
  list[index] = {
    ...current,
    pinned: nextPinned,
    updatedAt: now,
  }
  return {
    found: true,
    items: cleanupBookmarks(list, now),
    pinned: nextPinned,
  }
}

function removeBookmarkRecord(items, payload, now = Date.now()) {
  const list = cleanupBookmarks(items, now)
  const index = findBookmarkIndex(list, payload)
  if (index < 0)
    return { removed: false, items: list }

  list.splice(index, 1)
  return {
    removed: true,
    items: cleanupBookmarks(list, now),
  }
}

async function checkPermissionStatus(permissionId) {
  if (!permission?.check)
    return { granted: false, status: 'permission-missing', reason: 'permission-sdk-unavailable' }

  try {
    const granted = Boolean(await permission.check(permissionId))
    if (granted)
      return { granted: true, status: 'available', reason: '' }
    return {
      granted: false,
      status: 'permission-missing',
      reason: permissionId === NETWORK_PERMISSION_ID
        ? 'network-internet-permission-required'
        : 'permission-denied',
    }
  }
  catch {
    logger?.warn?.('[touch-browser-bookmarks] Failed to check permission')
    return { granted: false, status: 'permission-missing', reason: 'permission-check-failed' }
  }
}

async function resolveNetworkOpenCapabilityState() {
  return checkPermissionStatus(NETWORK_PERMISSION_ID)
}

async function ensureDataFiles() {
  try {
    const bookmarks = await plugin.storage.getFile(BOOKMARKS_FILE)
    if (!bookmarks)
      await plugin.storage.setFile(BOOKMARKS_FILE, { items: [], updatedAt: 0 })

    const recent = await plugin.storage.getFile(RECENT_FILE)
    if (!recent)
      await plugin.storage.setFile(RECENT_FILE, { items: [], updatedAt: 0 })
  }
  catch {
    logger?.warn?.('[touch-browser-bookmarks] Failed to ensure data files')
  }
}

async function loadBookmarks() {
  try {
    const raw = await plugin.storage.getFile(BOOKMARKS_FILE)
    return parseBookmarks(raw)
  }
  catch {
    return []
  }
}

async function saveBookmarks(items, now = Date.now()) {
  const cleaned = cleanupBookmarks(items, now)
  await plugin.storage.setFile(BOOKMARKS_FILE, {
    items: cleaned,
    updatedAt: now,
  })
}

async function loadRecent() {
  try {
    const raw = await plugin.storage.getFile(RECENT_FILE)
    return parseRecent(raw)
  }
  catch {
    return []
  }
}

async function saveRecent(items, now = Date.now()) {
  const cleaned = cleanupRecent(items, now)
  await plugin.storage.setFile(RECENT_FILE, {
    items: cleaned,
    updatedAt: now,
  })
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

function buildSectionHeader(featureId, sectionId, title, subtitle) {
  return buildInfoItem({
    id: `${featureId}-section-${sectionId}`,
    featureId,
    title,
    subtitle,
  })
}

function extractUrlHost(url) {
  try {
    return new URL(url).host
  }
  catch {
    return ''
  }
}

function buildNetworkOpenCapability({ featureId, source, url, status = 'available', reason = '' }) {
  return {
    id: NETWORK_PERMISSION_ID,
    type: 'network',
    permission: NETWORK_PERMISSION_ID,
    status,
    ...(reason ? { reason } : {}),
    audit: {
      pluginName: PLUGIN_NAME,
      featureId,
      actionId: 'open-url',
      operation: 'open-external-url',
      source,
      urlHost: extractUrlHost(url),
    },
  }
}

function formatNetworkCapabilitySuffix(capabilityState) {
  if (!capabilityState || capabilityState.status === 'available')
    return ''
  if (capabilityState.reason === 'permission-sdk-unavailable')
    return ' · 权限 SDK 不可用（缺少 network.internet 权限）'
  if (capabilityState.reason === 'permission-check-failed')
    return ' · 权限检查失败（缺少 network.internet 权限）'
  if (capabilityState.status === 'permission-missing')
    return ' · 缺少 network.internet 权限'
  return capabilityState.reason ? ` · ${capabilityState.reason}` : ''
}

function buildActionItem({
  id,
  featureId,
  title,
  subtitle,
  actionId,
  payload,
  capability,
  sourceType = 'manual-quicklink',
  extraActions = [],
}) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: ACTION_ID,
    })
    .createAndAddAction(actionId, 'plugin', title, {
      ...(payload || {}),
      sourceType,
      ...(capability ? { capability } : {}),
    })

  for (const extra of extraActions) {
    builder.createAndAddAction(extra.id, 'plugin', extra.title, {
      ...(extra.payload || {}),
      sourceType,
    })
  }

  return builder.build()
}

function buildBookmarkItems(featureId, bookmarks, networkCapabilityState) {
  return bookmarks.slice(0, SHOW_BOOKMARKS).map((item, index) => {
    const sourceType = item.pinned ? 'manual-pinned-quicklink' : 'manual-quicklink'
    return buildActionItem({
      id: `${featureId}-bookmark-${index}`,
      featureId,
      title: `手动收藏 · ${item.title}`,
      subtitle: `${truncateText(item.url)}${item.pinned ? ' · PINNED' : ''}${formatNetworkCapabilitySuffix(networkCapabilityState)}`,
      actionId: 'open-url',
      payload: {
        id: item.id,
        url: item.url,
        title: item.title,
        source: 'bookmark',
      },
      sourceType,
      capability: buildNetworkOpenCapability({
        featureId,
        source: 'bookmark',
        url: item.url,
        status: networkCapabilityState?.status,
        reason: networkCapabilityState?.reason,
      }),
      extraActions: [
        {
          id: 'toggle-pin-bookmark',
          title: item.pinned ? '取消置顶' : '置顶收藏',
          payload: { id: item.id, url: item.url, pinned: !item.pinned },
        },
        {
          id: 'copy-url',
          title: '复制 URL',
          payload: { url: item.url },
        },
        {
          id: 'remove-bookmark',
          title: '移除收藏',
          payload: { id: item.id, url: item.url },
        },
      ],
    })
  })
}

function buildRecentItems(featureId, recentItems, networkCapabilityState) {
  return recentItems.map((item, index) => buildActionItem({
    id: `${featureId}-recent-${index}`,
    featureId,
    title: `手动最近 · ${item.title}`,
    subtitle: `${truncateText(item.url)}${formatNetworkCapabilitySuffix(networkCapabilityState)}`,
    actionId: 'open-url',
    payload: {
      url: item.url,
      title: item.title,
      source: 'recent',
    },
    sourceType: 'manual-recent-quicklink',
    capability: buildNetworkOpenCapability({
      featureId,
      source: 'recent',
      url: item.url,
      status: networkCapabilityState?.status,
      reason: networkCapabilityState?.reason,
    }),
    extraActions: [
      {
        id: 'copy-url',
        title: '复制 URL',
        payload: { url: item.url },
      },
      {
        id: 'add-bookmark',
        title: '添加到收藏',
        payload: { url: item.url, title: item.title },
      },
    ],
  }))
}

function classifyHostCapabilityError(error, {
  fallbackReason,
  fallbackMessage,
  deniedMessage,
  unavailableMessage,
  cancelledMessage,
  timeoutMessage,
}) {
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
    return {
      status: 'blocked',
      reason: 'permission-denied',
      message: deniedMessage,
    }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
    return {
      status: 'blocked',
      reason: 'permission-unavailable',
      message: unavailableMessage,
    }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED') {
    return {
      status: 'cancelled',
      reason: 'cancelled',
      message: cancelledMessage,
    }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT' || code === 'PLUGIN_HOST_REQUEST_TIMEOUT') {
    return {
      status: 'failed',
      reason: 'timeout',
      message: timeoutMessage,
    }
  }
  return {
    status: 'blocked',
    reason: fallbackReason,
    message: fallbackMessage,
  }
}

async function tryCopyUrl(url) {
  if (!clipboard?.writeText) {
    return {
      copied: false,
      status: 'blocked',
      reason: 'clipboard-unavailable',
      message: '当前环境不支持写入剪贴板',
    }
  }

  try {
    await clipboard.writeText(url)
    return { copied: true }
  }
  catch (error) {
    const failure = classifyHostCapabilityError(error, {
      fallbackReason: 'clipboard-write-failed',
      fallbackMessage: '复制失败',
      deniedMessage: '复制失败：缺少 clipboard.write 权限',
      unavailableMessage: '复制失败：权限系统暂时不可用',
      cancelledMessage: '已取消复制',
      timeoutMessage: '复制超时，请重试',
    })
    return {
      copied: false,
      status: failure.status,
      reason: failure.reason,
      message: failure.message,
    }
  }
}

function resolveGroupOrder(groups) {
  const order = []
  if (groups.quick.length)
    order.push('quick')
  if (groups.bookmarks.length)
    order.push('bookmarks')
  if (groups.recent.length)
    order.push('recent')
  if (groups.tips.length)
    order.push('tips')
  return order
}

function resolveItemAction(item, context = {}) {
  const actions = Array.isArray(item?.actions) ? item.actions : []
  const requestedActionId = normalizeText(context?.actionId)
  if (requestedActionId)
    return actions.find(candidate => candidate?.id === requestedActionId) || null
  return actions[0] || null
}

const pluginLifecycle = {
  async onInit() {
    destroyed = false
    await ensureDataFiles()
  },

  async onFeatureTriggered(featureId, query) {
    destroyed = false
    const generation = ++triggerGeneration
    try {
      await ensureDataFiles()
      if (isStaleGeneration(generation))
        return true

      const input = normalizeText(getQueryText(query))
      const inputUrl = normalizeUrlInput(input)
      const keyword = inputUrl ? '' : input

      const bookmarks = await loadBookmarks()
      const recent = await loadRecent()
      const networkCapabilityState = await resolveNetworkOpenCapabilityState()
      if (isStaleGeneration(generation))
        return true

      const filteredBookmarks = inputUrl
        ? bookmarks.filter(item => item.url === inputUrl)
        : filterBookmarks(bookmarks, keyword)

      const filteredRecent = inputUrl
        ? recent.filter(item => item.url === inputUrl)
        : filterRecent(recent, keyword)

      const recentDisplay = mergeRecentForDisplay(filteredRecent, filteredBookmarks)

      const quick = []
      if (inputUrl) {
        quick.push(buildActionItem({
          id: `${featureId}-quick-open`,
          featureId,
          title: '默认浏览器打开',
          subtitle: `${truncateText(inputUrl)}${formatNetworkCapabilitySuffix(networkCapabilityState)}`,
          actionId: 'open-url',
          payload: { url: inputUrl, title: guessTitleFromUrl(inputUrl), source: 'quick' },
          sourceType: 'manual-quicklink',
          capability: buildNetworkOpenCapability({
            featureId,
            source: 'quick',
            url: inputUrl,
            status: networkCapabilityState.status,
            reason: networkCapabilityState.reason,
          }),
        }))
        quick.push(buildActionItem({
          id: `${featureId}-quick-add`,
          featureId,
          title: '添加到收藏',
          subtitle: truncateText(inputUrl),
          actionId: 'add-bookmark',
          payload: { url: inputUrl, title: guessTitleFromUrl(inputUrl) },
          sourceType: 'manual-quicklink',
        }))
        quick.push(buildActionItem({
          id: `${featureId}-quick-copy`,
          featureId,
          title: '复制 URL',
          subtitle: truncateText(inputUrl),
          actionId: 'copy-url',
          payload: { url: inputUrl },
          sourceType: 'manual-quicklink',
        }))
      }
      else {
        quick.push(buildInfoItem({
          id: `${featureId}-quick-tip`,
          featureId,
          title: '输入 URL 可快速收藏',
          subtitle: '示例：example.com 或 https://example.com',
        }))
      }

      const bookmarkItems = buildBookmarkItems(featureId, filteredBookmarks, networkCapabilityState)
      const recentItems = buildRecentItems(featureId, recentDisplay, networkCapabilityState)

      const tips = []
      if (!bookmarkItems.length) {
        tips.push(buildInfoItem({
          id: `${featureId}-tip-empty-bookmarks`,
          featureId,
          title: '暂无收藏',
          subtitle: '可以先输入 URL 后添加收藏',
        }))
      }
      if (!recentItems.length) {
        tips.push(buildInfoItem({
          id: `${featureId}-tip-empty-recent`,
          featureId,
          title: '暂无最近访问',
          subtitle: '打开过的网址会自动进最近列表',
        }))
      }

      const groups = {
        quick,
        bookmarks: bookmarkItems,
        recent: recentItems,
        tips,
      }

      const order = resolveGroupOrder(groups)
      const items = []

      order.forEach((groupId) => {
        if (groupId === 'quick') {
          items.push(buildSectionHeader(featureId, 'quick', '快捷动作', '添加 / 打开 / 复制 / 配置'))
          items.push(...quick)
        }

        if (groupId === 'bookmarks') {
          items.push(buildSectionHeader(featureId, 'bookmarks', '收藏网址', `最多 ${SHOW_BOOKMARKS} 条`))
          items.push(...bookmarkItems)
        }

        if (groupId === 'recent') {
          items.push(buildSectionHeader(featureId, 'recent', '最近访问', `最多 ${SHOW_RECENT} 条`))
          items.push(...recentItems)
        }

        if (groupId === 'tips') {
          items.push(buildSectionHeader(featureId, 'tips', '提示', '空状态 / 使用说明'))
          items.push(...tips)
        }
      })

      if (isStaleGeneration(generation))
        return true
      await plugin.feature.clearItems()
      if (isStaleGeneration(generation))
        return true
      await plugin.feature.pushItems(items)
      return true
    }
    catch {
      logger?.error?.('[touch-browser-bookmarks] Failed to handle feature')
      if (isStaleGeneration(generation))
        return true
      try {
        await plugin.feature.clearItems()
        await plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-error`,
            featureId,
            title: '浏览器收藏加载失败',
            subtitle: '插件运行失败',
          }),
        ])
        return true
      }
      catch {
        logger?.error?.('[touch-browser-bookmarks] Failed to publish fallback')
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    if (item?.meta?.defaultAction !== ACTION_ID)
      return

    const action = resolveItemAction(item, context)
    if (!action) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'invalid-action',
        message: '未找到可执行操作',
      }
    }

    const actionId = action.id
    const payload = action.payload || {}

    try {
      if (actionId === 'copy-url') {
        const url = normalizeUrlInput(payload.url)
        if (!url)
          return

        const copyResult = await tryCopyUrl(url)
        if (!copyResult.copied) {
          return {
            externalAction: true,
            success: false,
            status: copyResult.status || 'blocked',
            reason: copyResult.reason || 'permission-denied',
            message: copyResult.message || '复制失败',
          }
        }

        return { externalAction: true, status: 'started' }
      }

      if (actionId === 'add-bookmark') {
        const url = normalizeUrlInput(payload.url)
        if (!url)
          return

        const bookmarks = await loadBookmarks()
        const next = upsertBookmark(bookmarks, {
          url,
          title: payload.title,
          tags: payload.tags,
          pinned: payload.pinned,
        })
        await saveBookmarks(next)

        return { externalAction: true }
      }

      if (actionId === 'toggle-pin-bookmark') {
        const bookmarks = await loadBookmarks()
        const toggled = togglePinBookmark(bookmarks, payload)
        if (!toggled.found) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'bookmark-not-found',
            message: '未找到对应收藏',
          }
        }
        await saveBookmarks(toggled.items)
        return {
          externalAction: true,
          success: true,
          status: 'completed',
          pinned: toggled.pinned,
          message: toggled.pinned ? '已置顶收藏' : '已取消置顶',
        }
      }

      if (actionId === 'remove-bookmark') {
        const bookmarks = await loadBookmarks()
        const result = removeBookmarkRecord(bookmarks, payload)
        if (!result.removed) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'bookmark-not-found',
            message: '未找到对应收藏',
          }
        }
        await saveBookmarks(result.items)
        return {
          externalAction: true,
          success: true,
          status: 'completed',
          removed: true,
          message: '已移除收藏',
        }
      }

      if (actionId === 'open-url') {
        const url = normalizeUrlInput(payload.url)
        if (!url)
          return

        if (typeof openUrl !== 'function') {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'open-url-unavailable',
            message: '当前环境不支持打开外链',
          }
        }

        try {
          await openUrl(url)
        }
        catch (error) {
          const failure = classifyHostCapabilityError(error, {
            fallbackReason: 'open-url-failed',
            fallbackMessage: '打开外部链接失败',
            deniedMessage: '缺少 network.internet 权限',
            unavailableMessage: '权限系统暂时不可用',
            cancelledMessage: '已取消打开链接',
            timeoutMessage: '打开链接超时，请重试',
          })
          return {
            externalAction: true,
            success: false,
            status: failure.status,
            reason: failure.reason,
            message: failure.message,
          }
        }

        const recent = await loadRecent()
        const nextRecent = touchRecentUrl(recent, url, payload.title)
        await saveRecent(nextRecent)

        return { externalAction: true, status: 'started' }
      }
    }
    catch {
      logger?.error?.('[touch-browser-bookmarks] Action failed')
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'action-failed',
        message: '执行失败',
      }
    }
  },

  async onDestroy() {
    destroyed = true
    triggerGeneration += 1
  },
}

module.exports = pluginLifecycle
