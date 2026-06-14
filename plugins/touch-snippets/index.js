const { randomUUID } = require('node:crypto')

const { plugin, clipboard, logger, TuffItemBuilder, permission, http, touchChannel } = globalThis

const PLUGIN_NAME = 'touch-snippets'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const COPY_ACTION_ID = 'copy'
const SAVE_ACTION_ID = 'save'
const MANAGE_ACTION_ID = 'manage'
const SNIPPETS_FILE = 'snippets.json'
const MAX_SEARCH_RESULTS = 30
const SNIPPET_PACK_FORMAT = 'tuff.snippet-pack+json'
const SNIPPET_PACK_KIND = 'snippet-pack'
const CLOUD_SHARE_BASE_URL = 'https://tuff.tagzxia.com'
const SENSITIVE_CONTENT_PATTERNS = [
  /(?:api[_-]?key|secret|password|passwd|token|private[_-]?key)\s*[:=]/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  /\bsk-[\w-]{20,}\b/,
  /\bghp_\w{20,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
]

const DEFAULT_SNIPPETS = {
  version: 1,
  snippets: [
    {
      id: 'snippet-greeting',
      type: 'text',
      title: '通用问候',
      tags: ['日常', '问候'],
      content: '你好，辛苦啦！这边更新一下进度：{{date}}',
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: 'snippet-react-useeffect',
      type: 'code',
      title: 'React useEffect 模板',
      language: 'ts',
      tags: ['react', 'hook'],
      content: 'useEffect(() => {\\n  $0\\n}, [])',
      createdAt: 0,
      updatedAt: 0,
    },
  ],
}

const snippetCacheByFeature = new Map()

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

function normalizeType(value) {
  const type = normalizeText(value).toLowerCase()
  if (['text', 'code', 'prompt', 'template'].includes(type))
    return type
  return 'text'
}

function formatNumber(value, length = 2) {
  return String(value).padStart(length, '0')
}

function formatDate(date, pattern) {
  const year = date.getFullYear()
  const month = formatNumber(date.getMonth() + 1)
  const day = formatNumber(date.getDate())
  const hour = formatNumber(date.getHours())
  const minute = formatNumber(date.getMinutes())
  const second = formatNumber(date.getSeconds())

  return pattern
    .replace(/YYYY/g, String(year))
    .replace(/MM/g, String(month))
    .replace(/DD/g, String(day))
    .replace(/HH/g, String(hour))
    .replace(/mm/g, String(minute))
    .replace(/ss/g, String(second))
}

function resolveUuid(options) {
  if (typeof options.uuid === 'string' && options.uuid.trim())
    return options.uuid.trim()
  if (typeof options.uuidFactory === 'function') {
    const value = options.uuidFactory()
    if (typeof value === 'string' && value.trim())
      return value.trim()
  }
  return randomUUID()
}

function applyPlaceholders(content, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date()
  const clipboardText = typeof options.clipboardText === 'string' ? options.clipboardText : ''
  let result = String(content ?? '')

  result = result.replace(/\{\{date\}\}/gi, formatDate(now, 'YYYY-MM-DD'))
  result = result.replace(/\{\{time\}\}/gi, formatDate(now, 'HH:mm:ss'))
  if (/\{\{uuid\}\}/i.test(result))
    result = result.replace(/\{\{uuid\}\}/gi, resolveUuid(options))
  if (/\{\{clipboard\}\}/i.test(result))
    result = result.replace(/\{\{clipboard\}\}/gi, clipboardText)

  return result
}

function parseSnippets(raw) {
  if (!raw)
    return { version: 1, snippets: [] }
  if (typeof raw === 'string') {
    try {
      return parseSnippets(JSON.parse(raw))
    }
    catch {
      return { version: 1, snippets: [] }
    }
  }
  if (typeof raw === 'object') {
    const snippets = Array.isArray(raw.snippets) ? raw.snippets : []
    return {
      version: typeof raw.version === 'number' ? raw.version : 1,
      snippets,
    }
  }
  return { version: 1, snippets: [] }
}

function normalizeTags(tags) {
  if (!Array.isArray(tags))
    return []
  return tags.map(tag => normalizeText(tag)).filter(Boolean)
}

function normalizeSnippet(snippet, index) {
  const rawId = normalizeText(snippet?.id)
  const id = rawId || `snippet-${index}`
  const now = Date.now()
  return {
    id,
    type: normalizeType(snippet?.type),
    title: normalizeText(snippet?.title) || '未命名片段',
    language: normalizeText(snippet?.language),
    tags: normalizeTags(snippet?.tags),
    content: String(snippet?.content ?? ''),
    createdAt: Number.isFinite(snippet?.createdAt) ? snippet.createdAt : now,
    updatedAt: Number.isFinite(snippet?.updatedAt) ? snippet.updatedAt : now,
    lastUsedAt: Number.isFinite(snippet?.lastUsedAt) ? snippet.lastUsedAt : undefined,
    useCount: Number.isFinite(snippet?.useCount) ? snippet.useCount : 0,
  }
}

function buildSnippetIndex(snippets) {
  const map = new Map()
  snippets.forEach((snippet, index) => {
    const normalized = normalizeSnippet(snippet, index)
    map.set(normalized.id, normalized)
  })
  return map
}

function serializeSnippets(snippets) {
  return {
    version: 1,
    snippets: snippets.map((snippet, index) => normalizeSnippet(snippet, index)),
  }
}

function containsSensitiveContent(value) {
  const text = String(value ?? '')
  return SENSITIVE_CONTENT_PATTERNS.some(pattern => pattern.test(text))
}

function isShareableSnippet(snippet) {
  const text = [
    snippet?.title,
    snippet?.language,
    snippet?.content,
    ...(Array.isArray(snippet?.tags) ? snippet.tags : []),
  ].join('\n')
  return !containsSensitiveContent(text)
}

function createSnippetPack(snippets, meta = {}, options = {}) {
  const normalized = serializeSnippets(Array.isArray(snippets) ? snippets : []).snippets
  const shouldFilterSensitive = options.excludeSensitive !== false
  const shareableSnippets = shouldFilterSensitive
    ? normalized.filter(isShareableSnippet)
    : normalized
  const now = options.now || Date.now()

  return {
    format: SNIPPET_PACK_FORMAT,
    version: 1,
    title: normalizeText(meta.title) || 'Touch Snippets Pack',
    summary: normalizeText(meta.summary),
    pluginId: 'touch-snippets',
    kind: SNIPPET_PACK_KIND,
    schemaVersion: 1,
    createdAt: now,
    snippets: shareableSnippets,
    skippedSensitiveCount: normalized.length - shareableSnippets.length,
  }
}

function normalizeSnippetPack(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!value || typeof value !== 'object')
    throw new Error('Invalid snippet pack')
  if (value.format && value.format !== SNIPPET_PACK_FORMAT)
    throw new Error('Unsupported snippet pack format')

  const snippets = Array.isArray(value.snippets)
    ? value.snippets
    : Array.isArray(value.content?.snippets)
      ? value.content.snippets
      : Array.isArray(value.contentInline?.snippets)
        ? value.contentInline.snippets
        : []

  return {
    format: SNIPPET_PACK_FORMAT,
    version: typeof value.version === 'number' ? value.version : 1,
    title: normalizeText(value.title) || 'Touch Snippets Pack',
    summary: normalizeText(value.summary),
    pluginId: normalizeText(value.pluginId) || 'touch-snippets',
    kind: normalizeText(value.kind) || SNIPPET_PACK_KIND,
    schemaVersion: Number.isFinite(value.schemaVersion) ? value.schemaVersion : 1,
    createdAt: Number.isFinite(value.createdAt) ? value.createdAt : Date.now(),
    snippets: snippets.map(normalizeSnippet),
    skippedSensitiveCount: Number.isFinite(value.skippedSensitiveCount) ? value.skippedSensitiveCount : 0,
  }
}

function importSnippetPack(currentSnippets, rawPack, options = {}) {
  const pack = normalizeSnippetPack(rawPack)
  const now = options.now || Date.now()
  const existing = serializeSnippets(Array.isArray(currentSnippets) ? currentSnippets : []).snippets
  const existingIds = new Set(existing.map(snippet => snippet.id))
  const imported = pack.snippets.map((snippet, index) => {
    const normalized = normalizeSnippet(snippet, index)
    let id = normalized.id
    if (existingIds.has(id))
      id = `${id}-imported-${now}-${index}`
    existingIds.add(id)
    return {
      ...normalized,
      id,
      createdAt: normalized.createdAt || now,
      updatedAt: now,
    }
  })

  return {
    version: 1,
    snippets: [...imported, ...existing],
    importedCount: imported.length,
    pack,
  }
}

function buildCloudShareUrl(path, baseUrl = CLOUD_SHARE_BASE_URL) {
  const base = normalizeText(baseUrl).replace(/\/+$/, '') || CLOUD_SHARE_BASE_URL
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

async function publishSnippetPack(pack, options = {}) {
  if (!http && !options.httpClient)
    throw new Error('CloudShare HTTP client is unavailable')
  const authToken = normalizeText(options.authToken)
  if (!authToken)
    throw new Error('CloudShare auth token is required')

  const client = options.httpClient || http
  const normalizedPack = normalizeSnippetPack(pack)
  const response = await client.post(
    buildCloudShareUrl('/api/store/plugin-content', options.baseUrl),
    {
      pluginId: 'touch-snippets',
      kind: SNIPPET_PACK_KIND,
      title: normalizedPack.title,
      summary: normalizedPack.summary,
      schemaVersion: 1,
      visibility: options.visibility || 'public',
      manifest: {
        importTarget: 'touch-snippets',
        format: SNIPPET_PACK_FORMAT,
      },
      contentInline: normalizedPack,
    },
    {
      headers: {
        authorization: authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
      },
    },
  )
  return response?.data?.package || response?.package || response?.data
}

function getAccountAuthTokenEventName() {
  try {
    const { AccountEvents } = require('@talex-touch/utils/transport/events')
    return AccountEvents.auth.getToken.toEventName()
  }
  catch {
    return 'account:auth:get-token'
  }
}

async function resolveAccountAuthToken(options = {}) {
  if (typeof options.authToken === 'string' && options.authToken.trim())
    return options.authToken.trim()
  const channel = options.touchChannel || touchChannel
  if (!channel || typeof channel.send !== 'function')
    return ''
  const token = await channel.send(getAccountAuthTokenEventName())
  return normalizeText(token)
}

async function listCloudSnippetPacks(options = {}) {
  if (!http && !options.httpClient)
    throw new Error('CloudShare HTTP client is unavailable')
  const client = options.httpClient || http
  const params = new URLSearchParams()
  params.set('pluginId', 'touch-snippets')
  params.set('kind', SNIPPET_PACK_KIND)
  params.set('limit', String(options.limit || 10))
  const response = await client.get(
    buildCloudShareUrl(`/api/store/plugin-content?${params.toString()}`, options.baseUrl),
  )
  return response?.data?.packages || response?.packages || []
}

async function installCloudSnippetPack(packageId, options = {}) {
  if (!http && !options.httpClient)
    throw new Error('CloudShare HTTP client is unavailable')
  const client = options.httpClient || http
  const response = await client.post(
    buildCloudShareUrl(`/api/store/plugin-content/${encodeURIComponent(packageId)}/install`, options.baseUrl),
  )
  return response?.data?.package || response?.package || response?.data
}

function inferSnippetType(content) {
  const text = String(content ?? '')
  if (/```|\b(?:import|export|function|const|let|class|return)\b|=>|;/.test(text))
    return 'code'
  if (/\b(?:prompt|system|assistant|user)\b/i.test(text))
    return 'prompt'
  return 'text'
}

function createSnippetFromContent(content, options = {}) {
  const normalizedContent = String(content ?? '').trim()
  const now = options.now || Date.now()
  const title = normalizeText(options.title)
    || normalizedContent.split(/\r?\n/).find(Boolean)?.slice(0, 32)
    || '未命名片段'

  return {
    id: `snippet-${now}`,
    type: normalizeType(options.type || inferSnippetType(normalizedContent)),
    title,
    language: normalizeText(options.language),
    tags: normalizeTags(options.tags),
    content: normalizedContent,
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  }
}

function matchSnippet(snippet, keyword) {
  if (!keyword)
    return true
  const lower = keyword.toLowerCase()
  const searchable = [
    snippet.title,
    snippet.type,
    snippet.language,
    snippet.content,
    ...(Array.isArray(snippet.tags) ? snippet.tags : []),
  ]
  return searchable.some(value => String(value ?? '').toLowerCase().includes(lower))
}

function rankSnippets(snippets, keyword) {
  const lower = keyword.toLowerCase()
  return [...snippets].sort((a, b) => {
    const aTitle = String(a.title ?? '').toLowerCase()
    const bTitle = String(b.title ?? '').toLowerCase()
    const aTitleScore = lower && aTitle.startsWith(lower) ? 1 : 0
    const bTitleScore = lower && bTitle.startsWith(lower) ? 1 : 0
    if (aTitleScore !== bTitleScore)
      return bTitleScore - aTitleScore
    const aUsed = a.lastUsedAt || 0
    const bUsed = b.lastUsedAt || 0
    if (aUsed !== bUsed)
      return bUsed - aUsed
    return (b.useCount || 0) - (a.useCount || 0)
  })
}

async function ensurePermission(permissionId, reason) {
  if (!permission?.check || !permission?.request) {
    return {
      granted: false,
      reason: 'permission-sdk-unavailable',
    }
  }

  try {
    const hasPermission = await permission.check(permissionId)
    if (hasPermission) {
      return { granted: true }
    }

    const granted = await permission.request(permissionId, reason)
    if (granted) {
      return { granted: true }
    }

    return {
      granted: false,
      reason: 'permission-denied',
    }
  }
  catch (error) {
    logger?.warn?.('[touch-snippets] Failed to request permission', error)
    return {
      granted: false,
      reason: 'permission-request-failed',
    }
  }
}

async function ensureSnippetsFile() {
  try {
    const existing = await plugin.storage.getFile(SNIPPETS_FILE)
    if (!existing)
      await plugin.storage.setFile(SNIPPETS_FILE, DEFAULT_SNIPPETS)
  }
  catch (error) {
    logger?.warn?.('[touch-snippets] Failed to ensure snippets file', error)
  }
}

async function loadSnippetStore() {
  await ensureSnippetsFile()
  const raw = await plugin.storage.getFile(SNIPPETS_FILE)
  return parseSnippets(raw)
}

async function loadSnippets(featureId) {
  const parsed = await loadSnippetStore()
  const map = buildSnippetIndex(parsed.snippets)
  snippetCacheByFeature.set(featureId, map)
  return Array.from(map.values())
}

async function saveSnippets(snippets) {
  await plugin.storage.setFile(SNIPPETS_FILE, serializeSnippets(snippets))
}

async function readClipboardText(reason) {
  const hasClipboardPermission = await ensurePermission('clipboard.read', reason)
  if (!hasClipboardPermission)
    return ''
  try {
    return clipboard.readText()
  }
  catch {
    return ''
  }
}

async function readClipboardTextForContent(content, reason) {
  if (!/\{\{clipboard\}\}/i.test(String(content ?? '')))
    return ''
  return readClipboardText(reason)
}

async function writeClipboardText(text, reason) {
  const permissionResult = await ensurePermission('clipboard.write', reason)
  if (!permissionResult.granted) {
    return {
      written: false,
      reason: permissionResult.reason || 'permission-denied',
    }
  }

  clipboard.writeText(text)
  return { written: true }
}

function getTypeLabel(type) {
  switch (type) {
    case 'code':
      return '代码'
    case 'prompt':
      return '提示词'
    case 'template':
      return '模板'
    default:
      return '文本'
  }
}

function buildCopySubtitle(snippet) {
  const parts = [getTypeLabel(snippet.type)]
  if (snippet.language)
    parts.push(snippet.language)
  if (snippet.tags.length > 0)
    parts.push(snippet.tags.join(', '))
  const preview = truncateText(snippet.content.replace(/\s+/g, ' '), 72)
  return preview ? `${parts.join(' · ')} · ${preview}` : parts.join(' · ')
}

function buildCopyItem({ id, featureId, title, subtitle, snippetId }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: COPY_ACTION_ID,
      snippetId,
    })
    .build()
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
      defaultAction: actionId === 'save' ? SAVE_ACTION_ID : MANAGE_ACTION_ID,
      actionId,
      payload,
    })
    .build()
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

async function buildSearchItems(featureId, query) {
  const keyword = normalizeText(getQueryText(query))
  const snippets = await loadSnippets(featureId)
  const matched = rankSnippets(snippets.filter(snippet => matchSnippet(snippet, keyword)), keyword)
  const items = []

  if (matched.length === 0) {
    items.push(buildInfoItem({
      id: `${featureId}-empty`,
      featureId,
      title: '暂无匹配片段',
      subtitle: '使用“保存片段”创建第一条片段',
    }))
    items.push(buildActionItem({
      id: `${featureId}-save`,
      featureId,
      title: '保存当前输入为片段',
      subtitle: keyword || '输入内容后可直接保存',
      actionId: 'save',
      payload: { content: keyword },
    }))
    return items
  }

  matched.slice(0, MAX_SEARCH_RESULTS).forEach((snippet) => {
    items.push(buildCopyItem({
      id: `${featureId}-${snippet.id}`,
      featureId,
      title: snippet.title,
      subtitle: buildCopySubtitle(snippet),
      snippetId: snippet.id,
    }))
  })
  return items
}

async function buildSaveItems(featureId, query) {
  const text = normalizeText(getQueryText(query))
  const clipboardText = text
    ? ''
    : await readClipboardText('需要读取剪贴板以将当前剪贴板内容保存为片段')
  const content = text || normalizeText(clipboardText)
  const items = []

  if (!content) {
    items.push(buildInfoItem({
      id: `${featureId}-empty`,
      featureId,
      title: '没有可保存的内容',
      subtitle: '输入内容或复制文本后再保存片段',
    }))
    return items
  }

  const snippet = createSnippetFromContent(content)
  items.push(buildActionItem({
    id: `${featureId}-save-current`,
    featureId,
    title: `保存为${getTypeLabel(snippet.type)}片段`,
    subtitle: truncateText(snippet.title, 72),
    actionId: 'save',
    payload: snippet,
  }))
  items.push(buildInfoItem({
    id: `${featureId}-preview`,
    featureId,
    title: '内容预览',
    subtitle: truncateText(content.replace(/\s+/g, ' '), 120),
  }))
  return items
}

async function buildManageItems(featureId) {
  const snippets = await loadSnippets(featureId)
  const counts = snippets.reduce((result, snippet) => {
    const type = normalizeType(snippet.type)
    result[type] = (result[type] || 0) + 1
    return result
  }, {})

  return [
    buildInfoItem({
      id: `${featureId}-info-file`,
      featureId,
      title: '配置文件',
      subtitle: SNIPPETS_FILE,
    }),
    buildInfoItem({
      id: `${featureId}-info-count`,
      featureId,
      title: '片段数量',
      subtitle: `${snippets.length} 条 · 文本 ${counts.text || 0} / 代码 ${counts.code || 0} / 提示词 ${counts.prompt || 0}`,
    }),
    buildActionItem({
      id: `${featureId}-action-init`,
      featureId,
      title: '初始化配置',
      subtitle: '缺失时创建默认 snippets.json',
      actionId: 'config-init',
    }),
    buildActionItem({
      id: `${featureId}-action-open`,
      featureId,
      title: '打开配置目录',
      subtitle: '编辑 snippets.json',
      actionId: 'config-open',
    }),
    buildActionItem({
      id: `${featureId}-action-export-pack`,
      featureId,
      title: '导出片段包',
      subtitle: '将当前片段库写入剪贴板，格式为 snippet pack',
      actionId: 'pack-export',
    }),
    buildActionItem({
      id: `${featureId}-action-import-pack`,
      featureId,
      title: '从剪贴板导入片段包',
      subtitle: '读取 snippet pack 并合并到当前片段库',
      actionId: 'pack-import-clipboard',
    }),
    buildActionItem({
      id: `${featureId}-action-cloud-list`,
      featureId,
      title: '浏览云端片段包',
      subtitle: '从 CloudShare 读取 touch-snippets 公开 snippet packs',
      actionId: 'cloud-list',
    }),
    buildActionItem({
      id: `${featureId}-action-cloud-publish`,
      featureId,
      title: '发布当前片段包到云端',
      subtitle: '需要已登录账号；发布后会显示在 Store 内容包页',
      actionId: 'cloud-publish-current',
    }),
  ]
}

function buildCloudPackItems(featureId, packages) {
  if (!packages.length) {
    return [
      buildInfoItem({
        id: `${featureId}-cloud-empty`,
        featureId,
        title: '暂无云端片段包',
        subtitle: '发布后会在这里显示 touch-snippets 的公开内容包',
      }),
    ]
  }

  return packages.map(item => buildActionItem({
    id: `${featureId}-cloud-${item.id}`,
    featureId,
    title: item.title || '未命名片段包',
    subtitle: `${item.summary || 'CloudShare snippet pack'} · ${item.installCount || 0} 次安装`,
    actionId: 'cloud-install',
    payload: { packageId: item.id },
  }))
}

async function markSnippetUsed(snippetId) {
  const parsed = await loadSnippetStore()
  const snippets = Array.isArray(parsed.snippets) ? parsed.snippets : []
  const index = snippets.findIndex(snippet => normalizeText(snippet?.id) === snippetId)
  if (index < 0)
    return
  const current = normalizeSnippet(snippets[index], index)
  snippets[index] = {
    ...current,
    lastUsedAt: Date.now(),
    useCount: (current.useCount || 0) + 1,
    updatedAt: Date.now(),
  }
  await saveSnippets(snippets)
}

async function saveSnippet(payload) {
  const content = normalizeText(payload?.content)
  if (!content)
    return false
  const parsed = await loadSnippetStore()
  const snippets = Array.isArray(parsed.snippets) ? parsed.snippets : []
  const snippet = createSnippetFromContent(content, payload)
  snippets.unshift(snippet)
  await saveSnippets(snippets)
  return true
}

const pluginLifecycle = {
  async onInit() {
    await ensureSnippetsFile()
  },

  async onFeatureTriggered(featureId, query) {
    try {
      let items = []
      if (featureId === 'snippets-search')
        items = await buildSearchItems(featureId, query)
      else if (featureId === 'snippets-save')
        items = await buildSaveItems(featureId, query)
      else if (featureId === 'snippets-manage')
        items = await buildManageItems(featureId)
      else
        return false

      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      logger?.error?.('[touch-snippets] Failed to handle feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-error`,
          featureId,
          title: '加载失败',
          subtitle: truncateText(error?.message || '未知错误', 120),
        }),
      ])
      return true
    }
  },

  async onItemAction(item) {
    try {
      if (item?.meta?.defaultAction === COPY_ACTION_ID) {
        const featureId = item.meta?.featureId
        const snippetId = item.meta?.snippetId
        const snippetMap = snippetCacheByFeature.get(featureId)
        const snippet = snippetMap?.get(snippetId)
        if (!snippet)
          return

        const clipboardText = await readClipboardTextForContent(
          snippet.content,
          '需要读取剪贴板以支持 {{clipboard}} 占位符',
        )
        const resolved = applyPlaceholders(snippet.content, { clipboardText })
        const copyResult = await writeClipboardText(resolved, '需要剪贴板写入权限以复制片段内容')
        if (!copyResult.written) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: copyResult.reason || 'permission-denied',
            message: '缺少 clipboard.write 权限',
          }
        }
        await markSnippetUsed(snippet.id)
        return { externalAction: true }
      }

      if (item?.meta?.defaultAction === SAVE_ACTION_ID) {
        const saved = await saveSnippet(item.meta?.payload)
        if (saved)
          return { externalAction: true }
        return
      }

      if (item?.meta?.defaultAction === MANAGE_ACTION_ID) {
        const actionId = item.meta?.actionId
        if (actionId === 'config-init') {
          await ensureSnippetsFile()
          return { externalAction: true }
        }
        if (actionId === 'config-open') {
          await plugin.storage.openFolder()
          return { externalAction: true }
        }
        if (actionId === 'pack-export') {
          const snippets = await loadSnippets(item.meta?.featureId || 'snippets-manage')
          const pack = createSnippetPack(snippets, {
            title: 'Touch Snippets Pack',
            summary: `${snippets.length} snippets exported from touch-snippets`,
          })
          const copyResult = await writeClipboardText(
            JSON.stringify(pack, null, 2),
            '需要剪贴板写入权限以导出片段包',
          )
          if (!copyResult.written) {
            return {
              externalAction: true,
              success: false,
              status: 'blocked',
              reason: copyResult.reason || 'permission-denied',
              message: '缺少 clipboard.write 权限',
            }
          }
          return { externalAction: true }
        }
        if (actionId === 'pack-import-clipboard') {
          const content = await readClipboardText('需要读取剪贴板以导入片段包')
          const parsed = await loadSnippetStore()
          const merged = importSnippetPack(parsed.snippets, content)
          await saveSnippets(merged.snippets)
          return { externalAction: true }
        }
        if (actionId === 'cloud-list') {
          const featureId = item.meta?.featureId || 'snippets-manage'
          const packages = await listCloudSnippetPacks()
          plugin.feature.clearItems()
          plugin.feature.pushItems(buildCloudPackItems(featureId, packages))
          return { externalAction: true }
        }
        if (actionId === 'cloud-publish-current') {
          const snippets = await loadSnippets(item.meta?.featureId || 'snippets-manage')
          const pack = createSnippetPack(snippets, {
            title: 'Touch Snippets Pack',
            summary: `${snippets.length} snippets shared from touch-snippets`,
          })
          const authToken = await resolveAccountAuthToken()
          if (!authToken)
            throw new Error('请先登录 Tuff 账号后再发布片段包')
          await publishSnippetPack(pack, { authToken })
          return { externalAction: true }
        }
        if (actionId === 'cloud-install') {
          const installed = await installCloudSnippetPack(item.meta?.payload?.packageId)
          const content = installed?.contentInline || installed
          const parsed = await loadSnippetStore()
          const merged = importSnippetPack(parsed.snippets, content)
          await saveSnippets(merged.snippets)
          return { externalAction: true }
        }
      }
    }
    catch (error) {
      logger?.error?.('[touch-snippets] Failed to handle action', error)
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    applyPlaceholders,
    buildSnippetIndex,
    containsSensitiveContent,
    createSnippetPack,
    createSnippetFromContent,
    formatDate,
    importSnippetPack,
    inferSnippetType,
    installCloudSnippetPack,
    isShareableSnippet,
    listCloudSnippetPacks,
    matchSnippet,
    normalizeSnippet,
    normalizeSnippetPack,
    parseSnippets,
    publishSnippetPack,
    resolveAccountAuthToken,
    rankSnippets,
    serializeSnippets,
  },
}
