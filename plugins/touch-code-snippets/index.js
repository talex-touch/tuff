const { plugin, clipboard, logger, TuffItemBuilder, permission } = globalThis

const PLUGIN_NAME = 'touch-code-snippets'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const COPY_ACTION_ID = 'copy'
const MANAGE_ACTION_ID = 'manage'
const SNIPPETS_FILE = 'snippets.json'

const DEFAULT_SNIPPETS = {
  snippets: [
    {
      id: 'snippet-react-useeffect',
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

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
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

function applyPlaceholders(content, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date()
  const clipboardText = typeof options.clipboardText === 'string' ? options.clipboardText : ''
  let result = String(content ?? '')

  result = result.replace(/\{\{date\}\}/gi, formatDate(now, 'YYYY-MM-DD'))
  result = result.replace(/\{\{time\}\}/gi, formatDate(now, 'HH:mm:ss'))
  if (result.includes('{{clipboard}}')) {
    result = result.replace(/\{\{clipboard\}\}/gi, clipboardText)
  }

  return result
}

function parseSnippets(raw) {
  if (!raw)
    return { snippets: [] }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parseSnippets(parsed)
    }
    catch {
      return { snippets: [] }
    }
  }
  if (typeof raw === 'object') {
    const snippets = Array.isArray(raw.snippets) ? raw.snippets : []
    return { snippets }
  }
  return { snippets: [] }
}

function buildSnippetIndex(snippets) {
  const map = new Map()
  snippets.forEach((snippet, index) => {
    const rawId = typeof snippet.id === 'string' ? snippet.id.trim() : ''
    const id = rawId || `snippet-${index}`
    map.set(id, { ...snippet, id })
  })
  return map
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

async function ensureSnippetsFile() {
  try {
    const existing = await plugin.storage.getFile(SNIPPETS_FILE)
    if (!existing)
      await plugin.storage.setFile(SNIPPETS_FILE, DEFAULT_SNIPPETS)
  }
  catch (error) {
    logger?.warn?.('[touch-code-snippets] Failed to ensure snippets file', error)
  }
}

async function loadSnippets(featureId) {
  const raw = await plugin.storage.getFile(SNIPPETS_FILE)
  const parsed = parseSnippets(raw)
  const map = buildSnippetIndex(parsed.snippets)
  snippetCacheByFeature.set(featureId, map)
  return Array.from(map.values())
}

function matchSnippet(snippet, keyword) {
  if (!keyword)
    return true
  const lower = keyword.toLowerCase()
  const title = String(snippet.title ?? '').toLowerCase()
  const language = String(snippet.language ?? '').toLowerCase()
  const content = String(snippet.content ?? '').toLowerCase()
  const tags = Array.isArray(snippet.tags) ? snippet.tags.map(tag => String(tag).toLowerCase()) : []
  return title.includes(lower)
    || language.includes(lower)
    || content.includes(lower)
    || tags.some(tag => tag.includes(lower))
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

function buildActionItem({ id, featureId, title, subtitle, actionId }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: MANAGE_ACTION_ID,
      actionId,
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

const pluginLifecycle = {
  async onInit() {
    await ensureSnippetsFile()
  },

  async onFeatureTriggered(featureId, query) {
    try {
      await ensureSnippetsFile()
      const keyword = normalizeText(getQueryText(query))

      if (featureId === 'code-snippets.manage') {
        const snippets = await loadSnippets(featureId)
        const items = [
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
            subtitle: `${snippets.length} 条`,
          }),
          buildActionItem({
            id: `${featureId}-action-init`,
            featureId,
            title: '初始化配置',
            subtitle: '创建默认 snippets.json',
            actionId: 'config-init',
          }),
          buildActionItem({
            id: `${featureId}-action-open`,
            featureId,
            title: '打开配置目录',
            subtitle: '打开插件存储目录',
            actionId: 'config-open',
          }),
        ]
        plugin.feature.clearItems()
        plugin.feature.pushItems(items)
        return true
      }

      if (featureId === 'code-snippets.search') {
        const snippets = await loadSnippets(featureId)
        const matched = snippets.filter(snippet => matchSnippet(snippet, keyword))
        const items = []

        if (matched.length === 0) {
          items.push(buildInfoItem({
            id: `${featureId}-empty`,
            featureId,
            title: '暂无匹配片段',
            subtitle: '在 snippets.json 中添加代码片段',
          }))
          items.push(buildActionItem({
            id: `${featureId}-open`,
            featureId,
            title: '打开配置目录',
            subtitle: '编辑 snippets.json',
            actionId: 'config-open',
          }))
        } else {
          matched.slice(0, 20).forEach((snippet) => {
            const language = snippet.language ? ` · ${snippet.language}` : ''
            const tags = Array.isArray(snippet.tags) && snippet.tags.length > 0
              ? ` · ${snippet.tags.join(', ')}`
              : ''
            items.push(buildCopyItem({
              id: `${featureId}-${snippet.id}`,
              featureId,
              title: snippet.title || '未命名代码片段',
              subtitle: `${snippet.content?.slice(0, 50) || ''}${language}${tags}`,
              snippetId: snippet.id,
            }))
          })
        }

        plugin.feature.clearItems()
        plugin.feature.pushItems(items)
        return true
      }
    }
    catch (error) {
      logger?.error?.('[touch-code-snippets] Failed to handle feature', error)
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

        let clipboardText = ''
        const hasClipboardPermission = await ensurePermission(
          'clipboard.read',
          '需要读取剪贴板以支持 {{clipboard}} 占位符',
        )
        if (hasClipboardPermission) {
          try {
            clipboardText = clipboard.readText()
          }
          catch {
            clipboardText = ''
          }
        }

        const resolved = applyPlaceholders(snippet.content, { clipboardText })
        clipboard.writeText(resolved)
        return { externalAction: true }
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
      }
    }
    catch (error) {
      logger?.error?.('[touch-code-snippets] Failed to handle action', error)
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    applyPlaceholders,
    buildSnippetIndex,
    formatDate,
    matchSnippet,
    parseSnippets,
  },
}
