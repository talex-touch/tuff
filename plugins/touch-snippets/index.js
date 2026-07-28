const { plugin, logger, TuffItemBuilder, clipboard, touchChannel } = globalThis

const PLUGIN_NAME = 'touch-snippets'
const SOURCE_ID = 'plugin-features'
const STORE_FILE = 'snippets.json'
const ICON = { type: 'class', value: 'i-ri-file-copy-line' }
const DEFAULT_SNIPPETS = [
  {
    id: 'welcome',
    type: 'text',
    title: 'Welcome',
    language: '',
    content: 'Welcome to Touch Snippets.',
    tags: ['welcome'],
    createdAt: 0,
    updatedAt: 0,
    useCount: 0,
  },
]
const SENSITIVE_CONTENT_PATTERNS = [
  /(?:api[_-]?key|secret|password|passwd|token|private[_-]?key)\s*[:=]/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  /\bsk-[\w-]{20,}\b/,
  /\bghp_\w{20,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
]

let sequence = 0

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  return typeof query === 'string' ? query : query?.text ?? ''
}

function nextId(prefix = 'snippet') {
  sequence += 1
  return `${prefix}-${Date.now()}-${sequence}`
}

function normalizeSnippet(value, fallbackId) {
  if (!value || typeof value !== 'object')
    return null
  const title = normalizeText(value.title)
  const content = normalizeText(value.content)
  if (!title || !content)
    return null
  const type = ['text', 'code', 'prompt', 'template'].includes(value.type)
    ? value.type
    : 'text'
  const now = Date.now()
  return {
    id: normalizeText(value.id) || fallbackId,
    type,
    title: title.slice(0, 120),
    language: normalizeText(value.language).slice(0, 64),
    content: content.slice(0, 64 * 1024),
    tags: Array.isArray(value.tags)
      ? value.tags.map(normalizeText).filter(Boolean).slice(0, 16)
      : [],
    createdAt: Number.isSafeInteger(value.createdAt) && value.createdAt >= 0
      ? value.createdAt
      : now,
    updatedAt: Number.isSafeInteger(value.updatedAt) && value.updatedAt >= 0
      ? value.updatedAt
      : now,
    ...(Number.isSafeInteger(value.lastUsedAt) && value.lastUsedAt >= 0
      ? { lastUsedAt: value.lastUsedAt }
      : {}),
    useCount: Number.isSafeInteger(value.useCount) && value.useCount >= 0
      ? value.useCount
      : 0,
  }
}

function containsSensitiveContent(snippet) {
  const text = [snippet.title, snippet.language, snippet.content, ...snippet.tags].join('\n')
  return SENSITIVE_CONTENT_PATTERNS.some(pattern => pattern.test(text))
}

function parseStore(raw) {
  if (!raw)
    return { snippets: [...DEFAULT_SNIPPETS] }
  if (typeof raw === 'string') {
    try {
      return parseStore(JSON.parse(raw))
    }
    catch {
      return { snippets: [...DEFAULT_SNIPPETS] }
    }
  }
  const values = Array.isArray(raw?.snippets) ? raw.snippets : []
  const snippets = values
    .slice(0, 256)
    .map((entry, index) => normalizeSnippet(entry, `stored-${index}`))
    .filter(Boolean)
  return { snippets: snippets.length ? snippets : [...DEFAULT_SNIPPETS] }
}

async function ensureStore() {
  const existing = await plugin.storage.getFile(STORE_FILE)
  if (!existing)
    await plugin.storage.setFile(STORE_FILE, { snippets: [...DEFAULT_SNIPPETS] })
}

async function loadStore() {
  return parseStore(await plugin.storage.getFile(STORE_FILE))
}

async function saveStore(snippets) {
  await plugin.storage.setFile(STORE_FILE, { snippets: snippets.slice(0, 256) })
}

function buildItem({ id, featureId, title, subtitle, actionId, payload, defaultAction }) {
  const resolvedActionId = defaultAction ?? actionId ?? 'none'
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: resolvedActionId,
    })
  if (actionId && actionId !== 'none')
    builder.createAndAddAction(actionId, 'plugin', title, payload)
  return builder.build()
}

function actionFailure(error, fallbackReason, fallbackMessage) {
  const permissionDenied = error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
  const unavailable = error?.code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE'
  return {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: permissionDenied ? 'permission-denied' : unavailable ? 'host-unavailable' : fallbackReason,
    message: permissionDenied
      ? '缺少执行此操作所需的权限'
      : unavailable
        ? '宿主服务暂不可用'
        : fallbackMessage,
  }
}

async function resolveClipboardPlaceholders(content) {
  if (!/\{\{clipboard\}\}/i.test(content))
    return content
  if (typeof clipboard?.readText !== 'function') {
    throw Object.assign(new Error('clipboard unavailable'), {
      code: 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE',
    })
  }
  const clipboardText = await clipboard.readText()
  return content.replace(/\{\{clipboard\}\}/gi, normalizeText(clipboardText))
}

async function replaceItems(items) {
  await plugin.feature.clearItems()
  await plugin.feature.pushItems(items)
}

async function showSearch(featureId, queryText) {
  const { snippets } = await loadStore()
  const keyword = normalizeText(queryText).toLowerCase()
  const matched = snippets.filter((snippet) => {
    if (!keyword)
      return true
    return [snippet.title, snippet.content, ...(snippet.tags ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
  const items = matched.map(snippet =>
    buildItem({
      id: `${featureId}-${snippet.id}`,
      featureId,
      title: snippet.title,
      subtitle: snippet.content,
      actionId: 'copy',
      payload: { content: snippet.content },
      defaultAction: 'copy',
    }))
  if (!items.length) {
    items.push(buildItem({
      id: `${featureId}-empty`,
      featureId,
      title: '没有匹配的片段',
      subtitle: '可在片段管理中添加内容',
      actionId: 'none',
      defaultAction: 'none',
    }))
  }
  await replaceItems(items)
}

async function showSave(featureId, queryText) {
  const content = normalizeText(queryText)
  const items = content
    ? [buildItem({
        id: `${featureId}-save`,
        featureId,
        title: '保存当前文本',
        subtitle: content.slice(0, 120),
        actionId: 'save',
        payload: { content },
      })]
    : [buildItem({
        id: `${featureId}-empty`,
        featureId,
        title: '没有可保存的内容',
        subtitle: '输入文本后再保存片段',
        actionId: 'none',
        defaultAction: 'none',
      })]
  await replaceItems(items)
}

async function showManager(featureId, queryText) {
  const { snippets } = await loadStore()
  const text = normalizeText(queryText)
  const items = [
    buildItem({
      id: `${featureId}-add`,
      featureId,
      title: text ? '添加当前文本' : '添加片段',
      subtitle: text || '输入内容后再次打开管理器',
      actionId: 'add',
      payload: { content: text },
    }),
    buildItem({
      id: `${featureId}-cloud-list`,
      featureId,
      title: '浏览 CloudShare 片段包',
      subtitle: '从官方内容服务读取可安装片段包',
      actionId: 'cloud-list',
    }),
    buildItem({
      id: `${featureId}-cloud-publish`,
      featureId,
      title: '发布当前片段包',
      subtitle: `${snippets.length} 个片段`,
      actionId: 'cloud-publish',
    }),
    buildItem({
      id: `${featureId}-clear`,
      featureId,
      title: '恢复默认片段',
      subtitle: '清除本地自定义片段',
      actionId: 'clear',
    }),
  ]
  await replaceItems(items)
}

function requireChannel() {
  if (!touchChannel?.send) {
    throw Object.assign(new Error('channel unavailable'), {
      code: 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE',
    })
  }
  return touchChannel
}

async function listCloudPackages(featureId) {
  const response = await requireChannel().send('snippets.cloud.list', { limit: 10 })
  const packages = Array.isArray(response?.packages) ? response.packages : []
  const items = packages.map(entry => buildItem({
    id: `${featureId}-cloud-${entry.id}`,
    featureId,
    title: normalizeText(entry.title) || 'CloudShare 片段包',
    subtitle: normalizeText(entry.summary) || '可安装的片段包',
    actionId: 'cloud-install',
    payload: { packageId: entry.id },
  }))
  if (!items.length) {
    items.push(buildItem({
      id: `${featureId}-cloud-empty`,
      featureId,
      title: '暂无 CloudShare 片段包',
      subtitle: '稍后再试',
      actionId: 'none',
      defaultAction: 'none',
    }))
  }
  await replaceItems(items)
}

async function publishCloudPackage() {
  const { snippets } = await loadStore()
  const shareable = snippets.filter(snippet => !containsSensitiveContent(snippet))
  return await requireChannel().send('snippets.cloud.publish', {
    pack: {
      format: 'tuff.snippet-pack+json',
      version: 1,
      title: 'Touch Snippets Pack',
      summary: `${shareable.length} snippets`,
      pluginId: PLUGIN_NAME,
      kind: 'snippet-pack',
      schemaVersion: 1,
      createdAt: Date.now(),
      snippets: shareable,
      skippedSensitiveCount: snippets.length - shareable.length,
    },
    visibility: 'public',
  })
}

async function installCloudPackage(packageId) {
  const response = await requireChannel().send('snippets.cloud.install', { packageId })
  const content = response?.package?.contentInline
  const incoming = Array.isArray(content?.snippets)
    ? content.snippets
        .slice(0, 256)
        .map((entry, index) => normalizeSnippet(entry, `cloud-${index}`))
        .filter(Boolean)
    : []
  if (!incoming.length)
    throw new Error('empty cloud package')
  const { snippets } = await loadStore()
  const byId = new Map(snippets.map(entry => [entry.id, entry]))
  for (const entry of incoming)
    byId.set(entry.id, entry)
  await saveStore([...byId.values()])
  return response
}

const pluginLifecycle = {
  async onInit() {
    await ensureStore()
  },

  async onFeatureTriggered(featureId, query) {
    try {
      await ensureStore()
      const text = getQueryText(query)
      if (featureId === 'snippets-manage')
        await showManager(featureId, text)
      else if (featureId === 'snippets-save')
        await showSave(featureId, text)
      else if (featureId === 'snippets-search')
        await showSearch(featureId, text)
      else
        return false
      return true
    }
    catch {
      logger?.error?.('[touch-snippets] Failed to publish feature items')
      return false
    }
  },

  async onItemAction(item, context = {}) {
    const actionId = context.actionId || item?.meta?.defaultAction
    const featureId = item?.meta?.featureId || 'snippets-manage'
    const payload = item?.actions?.find(action => action?.id === actionId)?.payload || {}
    try {
      if (actionId === 'copy') {
        const content = await resolveClipboardPlaceholders(normalizeText(payload.content))
        await clipboard.writeText(content)
        return { externalAction: true, status: 'started' }
      }
      if (actionId === 'add' || actionId === 'save') {
        const content = normalizeText(payload.content)
        if (!content) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'empty-content',
            message: '请输入要保存的内容',
          }
        }
        const { snippets } = await loadStore()
        const id = nextId()
        snippets.push(normalizeSnippet({ id, type: 'text', title: content.slice(0, 48), content, tags: [] }, id))
        await saveStore(snippets)
        if (actionId === 'add')
          await showManager(featureId, '')
        return { externalAction: true, status: 'started' }
      }
      if (actionId === 'cloud-list') {
        await listCloudPackages(featureId)
        return { externalAction: true, status: 'started' }
      }
      if (actionId === 'cloud-publish') {
        await publishCloudPackage()
        return { externalAction: true, status: 'started' }
      }
      if (actionId === 'cloud-install') {
        await installCloudPackage(normalizeText(payload.packageId))
        return { externalAction: true, status: 'started' }
      }
      if (actionId === 'clear') {
        await saveStore([...DEFAULT_SNIPPETS])
        await showManager(featureId, '')
        return { externalAction: true, status: 'started' }
      }
    }
    catch (error) {
      logger?.error?.('[touch-snippets] Action failed')
      return actionFailure(error, 'action-failed', '操作失败')
    }
  },
}

module.exports = pluginLifecycle
