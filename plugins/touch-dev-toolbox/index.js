const { plugin, logger, TuffItemBuilder, openUrl } = globalThis

const PLUGIN_NAME = 'touch-dev-toolbox'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'class', value: 'i-ri-tools-line' }
const ACTION_ID = 'dev-toolbox'
const TOOLBOX_FILE = 'toolbox.json'

const DEFAULT_CONFIG = {
  links: [],
}

let triggerGeneration = 0
let destroyed = false

function isStaleGeneration(generation) {
  return destroyed || generation !== triggerGeneration
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
}

function normalizeExternalUrl(value) {
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

function parseToolboxConfig(raw) {
  if (!raw)
    return { ...DEFAULT_CONFIG }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parseToolboxConfig(parsed)
    }
    catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  if (typeof raw === 'object') {
    return {
      links: Array.isArray(raw.links) ? raw.links : [],
    }
  }

  return { ...DEFAULT_CONFIG }
}

async function ensureToolboxFile() {
  try {
    const existing = await plugin.storage.getFile(TOOLBOX_FILE)
    if (!existing)
      await plugin.storage.setFile(TOOLBOX_FILE, DEFAULT_CONFIG)
  }
  catch {
    logger?.warn?.('[touch-dev-toolbox] Failed to ensure toolbox file')
  }
}

async function loadConfig() {
  const raw = await plugin.storage.getFile(TOOLBOX_FILE)
  return parseToolboxConfig(raw)
}

function matchKeyword(target, keyword) {
  if (!keyword)
    return true
  const lower = keyword.toLowerCase()
  return target.toLowerCase().includes(lower)
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
    })
    .createAndAddAction(actionId, 'plugin', title, payload)
    .build()
}

function classifyOpenUrlError(error) {
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
    return {
      status: 'blocked',
      reason: 'permission-denied',
      message: '缺少 network.internet 权限',
    }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
    return {
      status: 'blocked',
      reason: 'permission-unavailable',
      message: '权限系统暂时不可用',
    }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED') {
    return {
      status: 'cancelled',
      reason: 'cancelled',
      message: '已取消打开外部链接',
    }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT' || code === 'PLUGIN_HOST_REQUEST_TIMEOUT') {
    return {
      status: 'failed',
      reason: 'timeout',
      message: '打开外部链接超时，请重试',
    }
  }
  return {
    status: 'blocked',
    reason: 'open-url-failed',
    message: '打开外部链接失败',
  }
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
    await ensureToolboxFile()
  },

  async onFeatureTriggered(featureId, query) {
    destroyed = false
    const generation = ++triggerGeneration
    try {
      await ensureToolboxFile()
      if (isStaleGeneration(generation))
        return true

      const keyword = normalizeText(getQueryText(query))
      const config = await loadConfig()
      if (isStaleGeneration(generation))
        return true

      const links = Array.isArray(config.links) ? config.links : []
      const validLinks = []
      links.forEach((link, index) => {
        if (!link || typeof link !== 'object')
          return

        const title = typeof link.title === 'string' && normalizeText(link.title)
          ? normalizeText(link.title)
          : `链接 ${index + 1}`
        const url = normalizeExternalUrl(link.url)
        if (!url)
          return

        validLinks.push({ index, title, url })
      })

      const items = [
        buildInfoItem({
          id: `${featureId}-counts`,
          featureId,
          title: '链接数量',
          subtitle: String(validLinks.length),
        }),
        buildActionItem({
          id: `${featureId}-config-init`,
          featureId,
          title: '初始化配置',
          subtitle: '创建默认 toolbox.json',
          actionId: 'config-init',
        }),
      ]

      const linkItems = []
      validLinks.forEach((link) => {
        if (!matchKeyword(link.title, keyword) && !matchKeyword(link.url, keyword))
          return

        linkItems.push(buildActionItem({
          id: `${featureId}-link-${link.index}`,
          featureId,
          title: link.title,
          subtitle: link.url,
          actionId: 'open-link',
          payload: { url: link.url },
        }))
      })

      if (!linkItems.length) {
        linkItems.push(buildInfoItem({
          id: `${featureId}-empty`,
          featureId,
          title: '暂无链接',
          subtitle: '先在 toolbox.json 里配置 links',
        }))
      }

      if (isStaleGeneration(generation))
        return true
      await plugin.feature.clearItems()
      if (isStaleGeneration(generation))
        return true
      await plugin.feature.pushItems([...items, ...linkItems])
      return true
    }
    catch {
      logger?.error?.('[touch-dev-toolbox] Failed to handle feature')
      if (isStaleGeneration(generation))
        return true
      try {
        await plugin.feature.clearItems()
        await plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-error`,
            featureId,
            title: '加载失败',
            subtitle: '插件运行失败',
          }),
        ])
        return true
      }
      catch {
        logger?.error?.('[touch-dev-toolbox] Failed to publish fallback')
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    try {
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
      if (actionId === 'config-init') {
        await ensureToolboxFile()
        return { externalAction: true }
      }

      if (actionId === 'open-link') {
        const url = normalizeExternalUrl(payload.url)
        if (!url) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'invalid-url',
            message: '链接地址无效，仅支持 HTTP/HTTPS',
          }
        }

        if (!openUrl) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'open-url-unavailable',
            message: '当前运行时不支持打开外部链接',
          }
        }

        try {
          await openUrl(url)
          return { externalAction: true, status: 'started' }
        }
        catch (error) {
          logger?.error?.('[touch-dev-toolbox] Failed to open external URL')
          const failure = classifyOpenUrlError(error)
          return {
            externalAction: true,
            success: false,
            status: failure.status,
            reason: failure.reason,
            message: failure.message,
          }
        }
      }
    }
    catch {
      logger?.error?.('[touch-dev-toolbox] Action failed')
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
