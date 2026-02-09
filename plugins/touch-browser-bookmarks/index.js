const { plugin, clipboard, logger, TuffItemBuilder, permission, openUrl } = globalThis

const PLUGIN_NAME = 'touch-browser-bookmarks'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'browser-bookmarks'

const BOOKMARKS_FILE = 'bookmarks.json'
const RECENT_FILE = 'recent-urls.json'

const MAX_BOOKMARKS = 200
const MAX_RECENT = 60
const SHOW_BOOKMARKS = 20
const SHOW_RECENT = 8
const RECENT_TTL_MS = 30 * 24 * 60 * 60 * 1000

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
  const useIncoming =
    (!current.pinned && incoming.pinned) ||
    (incoming.pinned === current.pinned && incoming.updatedAt >= current.updatedAt)

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

async function ensurePermission(permissionId, reason) {
  if (!permission)
    return true
  const hasPermission = await permission.check(permissionId)
  if (hasPermission)
    return true
  const granted = await permission.request(permissionId, reason)
  return Boolean(granted)
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
  catch (error) {
    logger?.warn?.('[touch-browser-bookmarks] Failed to ensure data files', error)
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

function buildActionItem({ id, featureId, title, subtitle, actionId, payload }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: ACTION_ID,
      actionId,
      payload,
    })
    .build()
}

function buildBookmarkItems(featureId, bookmarks) {
  return bookmarks.slice(0, SHOW_BOOKMARKS).map((item, index) => buildActionItem({
    id: `${featureId}-bookmark-${index}`,
    featureId,
    title: `打开 · ${item.title}`,
    subtitle: `${truncateText(item.url)}${item.pinned ? ' · PINNED' : ''}`,
    actionId: 'open-url',
    payload: {
      url: item.url,
      title: item.title,
      source: 'bookmark',
    },
  }))
}

function buildRecentItems(featureId, recentItems) {
  return recentItems.map((item, index) => buildActionItem({
    id: `${featureId}-recent-${index}`,
    featureId,
    title: `最近 · ${item.title}`,
    subtitle: truncateText(item.url),
    actionId: 'open-url',
    payload: {
      url: item.url,
      title: item.title,
      source: 'recent',
    },
  }))
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

const pluginLifecycle = {
  async onInit() {
    await ensureDataFiles()
  },

  async onFeatureTriggered(featureId, query) {
    try {
      await ensureDataFiles()

      const input = normalizeText(getQueryText(query))
      const inputUrl = normalizeUrlInput(input)
      const keyword = inputUrl ? '' : input

      const bookmarks = await loadBookmarks()
      const recent = await loadRecent()

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
          subtitle: truncateText(inputUrl),
          actionId: 'open-url',
          payload: { url: inputUrl, title: guessTitleFromUrl(inputUrl), source: 'quick' },
        }))
        quick.push(buildActionItem({
          id: `${featureId}-quick-add`,
          featureId,
          title: '添加到收藏',
          subtitle: truncateText(inputUrl),
          actionId: 'add-bookmark',
          payload: { url: inputUrl, title: guessTitleFromUrl(inputUrl) },
        }))
        quick.push(buildActionItem({
          id: `${featureId}-quick-copy`,
          featureId,
          title: '复制 URL',
          subtitle: truncateText(inputUrl),
          actionId: 'copy-url',
          payload: { url: inputUrl },
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

      quick.push(buildActionItem({
        id: `${featureId}-config-open`,
        featureId,
        title: '打开配置目录',
        subtitle: '编辑 bookmarks.json / recent-urls.json',
        actionId: 'config-open',
      }))

      const bookmarkItems = buildBookmarkItems(featureId, filteredBookmarks)
      const recentItems = buildRecentItems(featureId, recentDisplay)

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

      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      logger?.error?.('[touch-browser-bookmarks] Failed to handle feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-error`,
          featureId,
          title: '浏览器收藏加载失败',
          subtitle: truncateText(error?.message || '未知错误', 120),
        }),
      ])
      return true
    }
  },

  async onItemAction(item) {
    if (item?.meta?.defaultAction !== ACTION_ID)
      return

    const actionId = item.meta?.actionId
    const payload = item.meta?.payload || {}

    try {
      if (actionId === 'config-open') {
        await plugin.storage.openFolder()
        return { externalAction: true }
      }

      if (actionId === 'copy-url') {
        const url = normalizeUrlInput(payload.url)
        if (!url)
          return

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

      if (actionId === 'open-url') {
        const url = normalizeUrlInput(payload.url)
        if (!url)
          return

        if (typeof openUrl !== 'function') {
          return {
            externalAction: true,
            success: false,
            message: '当前环境不支持打开外链',
          }
        }

        openUrl(url)

        const recent = await loadRecent()
        const nextRecent = touchRecentUrl(recent, url, payload.title)
        await saveRecent(nextRecent)

        return { externalAction: true }
      }
    }
    catch (error) {
      logger?.error?.('[touch-browser-bookmarks] Action failed', error)
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
    cleanupBookmarks,
    cleanupRecent,
    filterBookmarks,
    mergeRecentForDisplay,
    normalizeUrlInput,
    parseBookmarks,
    touchRecentUrl,
    upsertBookmark,
  },
}
