const { plugin, logger, TuffItemBuilder, clipboard, touchChannel } = globalThis

const PLUGIN_NAME = 'touch-snippets'
const SOURCE_ID = 'plugin-features'
const STORE_FILE = 'snippets.json'
const MAX_SNIPPETS = 256
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
  /['"`]?(?:api[_-]?key|secret(?:[_-]?key)?|password|passwd|pwd|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|private[_-]?key|client[_-]?secret|session[_-]?id)['"`]?\s*[:=]/i,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\bBearer\s+[\w.~+/=-]{8,}/i,
  /\bBasic\s+[A-Z0-9+/=]{12,}/i,
  /\bsk-[\w-]{16,}\b/,
  /\bsk_(?:live|test)_[A-Z0-9]{16,}\b/i,
  /\b(?:gh[pousr]_[A-Z0-9]{20,}|github_pat_\w{20,})\b/i,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bxox[baprs]-[A-Z0-9-]{10,}\b/i,
  /\bAIza[\w-]{30,}\b/,
  /\bnpm_[A-Z0-9]{20,}\b/i,
  /\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}\b/,
  /\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:[^@\s/]+@[^\s/]+/i,
]

let sequence = 0
let pendingCloudPublishToken = null

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
    .slice(0, MAX_SNIPPETS)
    .map((entry, index) => normalizeSnippet(entry, `stored-${index}`))
    .filter(Boolean)
  return { snippets: snippets.length ? snippets : [...DEFAULT_SNIPPETS] }
}

async function ensureStore() {
  const existing = await plugin.storage.getFile(STORE_FILE)
  const hasStoredStore = typeof existing === 'string'
    ? existing.trim().length > 0
    : Boolean(existing && typeof existing === 'object' && !Array.isArray(existing) && Array.isArray(existing.snippets))
  if (!hasStoredStore)
    await plugin.storage.setFile(STORE_FILE, { snippets: [...DEFAULT_SNIPPETS] })
}

async function loadStore() {
  return parseStore(await plugin.storage.getFile(STORE_FILE))
}

async function saveStore(snippets) {
  await plugin.storage.setFile(STORE_FILE, { snippets: snippets.slice(0, MAX_SNIPPETS) })
}

async function saveNewSnippet(content) {
  const { snippets } = await loadStore()
  const id = nextId()
  const created = normalizeSnippet({ id, type: 'text', title: content.slice(0, 48), content, tags: [] }, id)
  const nextSnippets = [created, ...snippets].slice(0, MAX_SNIPPETS)
  await saveStore(nextSnippets)
  return created
}

async function recordSnippetUse(snippetId) {
  const targetId = normalizeText(snippetId)
  if (!targetId || typeof plugin?.storage?.getFile !== 'function' || typeof plugin?.storage?.setFile !== 'function')
    return
  try {
    const { snippets } = await loadStore()
    let updated = false
    const now = Date.now()
    const nextSnippets = snippets.map((snippet) => {
      if (snippet.id !== targetId)
        return snippet
      updated = true
      return {
        ...snippet,
        useCount: (Number.isSafeInteger(snippet.useCount) && snippet.useCount >= 0 ? snippet.useCount : 0) + 1,
        lastUsedAt: now,
        updatedAt: now,
      }
    })
    if (updated)
      await saveStore(nextSnippets)
  }
  catch {
    logger?.warn?.('[touch-snippets] Failed to update snippet usage metadata')
  }
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
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
      message: '缺少执行此操作所需的权限',
    }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-unavailable',
      message: '权限系统暂不可用',
    }
  }
  if (code === 'PLUGIN_HOST_PERMISSION_REQUEST_FAILED') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-check-failed',
      message: '权限请求失败',
    }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'capability-unavailable',
      message: '宿主能力暂不可用',
    }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'host-unavailable',
      message: '宿主服务暂不可用',
    }
  }
  return {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: fallbackReason,
    message: fallbackMessage,
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
  return content.replace(/\{\{clipboard\}\}/gi, () => normalizeText(clipboardText))
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
      payload: { snippetId: snippet.id, content: snippet.content },
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
        id: `${featureId}-save-clipboard`,
        featureId,
        title: '保存剪贴板内容',
        subtitle: '从当前剪贴板读取文本并保存为片段',
        actionId: 'save-clipboard',
        payload: { fromClipboard: true },
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

async function showCloudPublishConfirmation(featureId) {
  const { snippets } = await loadStore()
  const shareable = snippets.filter(snippet => !containsSensitiveContent(snippet))
  const skippedCount = snippets.length - shareable.length
  if (shareable.length === 0) {
    pendingCloudPublishToken = null
    await replaceItems([
      buildItem({
        id: `${featureId}-cloud-publish-empty`,
        featureId,
        title: '无可公开发布的片段',
        subtitle: `已过滤 ${skippedCount} 个疑似包含敏感信息的片段`,
        actionId: 'cloud-publish-cancel',
      }),
    ])
    return { shareableCount: 0, skippedCount }
  }

  const confirmToken = nextId('cloud-publish-confirm')
  pendingCloudPublishToken = confirmToken
  await replaceItems([
    buildItem({
      id: `${featureId}-cloud-publish-confirm`,
      featureId,
      title: '确认公开发布到 CloudShare',
      subtitle: `将以公开可见（public）上传 ${shareable.length} 个片段${skippedCount > 0 ? `（已过滤 ${skippedCount} 个敏感片段）` : ''}`,
      actionId: 'cloud-publish-confirm',
      payload: { confirmToken },
    }),
    buildItem({
      id: `${featureId}-cloud-publish-cancel`,
      featureId,
      title: '取消公开发布',
      subtitle: '返回片段管理，不上传任何内容',
      actionId: 'cloud-publish-cancel',
    }),
  ])
  return { shareableCount: shareable.length, skippedCount }
}

async function publishCloudPackage() {
  const { snippets } = await loadStore()
  const shareable = snippets.filter(snippet => !containsSensitiveContent(snippet))
  if (shareable.length === 0) {
    throw new Error('no shareable snippets')
  }
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
  const merged = [...byId.values()]
  await saveStore(merged.length > MAX_SNIPPETS ? merged.slice(-MAX_SNIPPETS) : merged)
  return response
}

const pluginLifecycle = {
  async onInit() {
    await ensureStore()
  },

  async onFeatureTriggered(featureId, query) {
    pendingCloudPublishToken = null
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
        if (typeof clipboard?.writeText !== 'function') {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'clipboard-unavailable',
            message: '当前环境不支持写入剪贴板',
          }
        }
        const content = await resolveClipboardPlaceholders(normalizeText(payload.content))
        await clipboard.writeText(content)
        if (payload.snippetId)
          await recordSnippetUse(payload.snippetId)
        return { externalAction: true, status: 'started' }
      }
      if (actionId === 'save-clipboard') {
        if (typeof clipboard?.readText !== 'function') {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'clipboard-unavailable',
            message: '当前环境不支持读取剪贴板',
          }
        }
        const content = normalizeText(await clipboard.readText())
        if (!content) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'empty-content',
            message: '剪贴板为空，暂无可保存内容',
          }
        }
        await saveNewSnippet(content)
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
        await saveNewSnippet(content)
        if (actionId === 'add')
          await showManager(featureId, '')
        return { externalAction: true, status: 'started' }
      }
      if (actionId === 'cloud-list') {
        await listCloudPackages(featureId)
        return { externalAction: true, status: 'started' }
      }
      if (actionId === 'cloud-publish') {
        const preview = await showCloudPublishConfirmation(featureId)
        if (preview.shareableCount === 0) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'no-shareable-snippets',
            message: '所有片段均被识别为敏感内容，已取消公开上传',
          }
        }
        return {
          externalAction: true,
          status: 'confirmation-required',
          message: '请确认将非敏感片段公开发布到 CloudShare',
        }
      }
      if (actionId === 'cloud-publish-confirm') {
        const confirmToken = normalizeText(payload.confirmToken)
        if (!confirmToken || !pendingCloudPublishToken || confirmToken !== pendingCloudPublishToken) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'confirmation-required',
            message: '请先发起公开发布并完成二次确认',
          }
        }
        pendingCloudPublishToken = null
        await publishCloudPackage()
        return { externalAction: true, status: 'started' }
      }
      if (actionId === 'cloud-publish-cancel') {
        pendingCloudPublishToken = null
        await showManager(featureId, '')
        return { externalAction: true, status: 'cancelled' }
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
