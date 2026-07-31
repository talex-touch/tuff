const { plugin, logger, TuffItemBuilder, openUrl } = globalThis

const PLUGIN_NAME = 'touch-dev-toolbox'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'class', value: 'i-ri-tools-line' }
const ACTION_ID = 'dev-toolbox'
const TOOLBOX_FILE = 'toolbox.json'

const DEFAULT_CONFIG = {
  links: [],
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

const pluginLifecycle = {
  async onInit() {
    await ensureToolboxFile()
  },

  async onFeatureTriggered(featureId, query) {
    try {
      await ensureToolboxFile()
      const keyword = normalizeText(getQueryText(query))
      const config = await loadConfig()
      const links = Array.isArray(config.links) ? config.links : []

      const items = [
        buildInfoItem({
          id: `${featureId}-counts`,
          featureId,
          title: '链接数量',
          subtitle: String(links.length),
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
      links.forEach((link, index) => {
        const title = typeof link.title === 'string' ? link.title : `链接 ${index + 1}`
        const url = normalizeExternalUrl(link.url)
        if (!url)
          return

        if (!matchKeyword(title, keyword) && !matchKeyword(url, keyword))
          return

        linkItems.push(buildActionItem({
          id: `${featureId}-link-${index}`,
          featureId,
          title,
          subtitle: url,
          actionId: 'open-link',
          payload: { url },
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

      await plugin.feature.clearItems()
      await plugin.feature.pushItems([...items, ...linkItems])
      return true
    }
    catch {
      logger?.error?.('[touch-dev-toolbox] Failed to handle feature')
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

  async onItemAction(item) {
    try {
      if (item?.meta?.defaultAction !== ACTION_ID)
        return

      const action = Array.isArray(item.actions) ? item.actions[0] : null
      const actionId = action?.id
      const payload = action?.payload || {}
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
          const permissionDenied = error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: permissionDenied ? 'permission-denied' : 'open-url-failed',
            message: permissionDenied ? '缺少 network.internet 权限' : '打开外部链接失败',
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
}

module.exports = pluginLifecycle
