const { plugin, logger, TuffItemBuilder, openUrl } = globalThis

const PLUGIN_NAME = 'touch-dev-toolbox'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
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
  catch (error) {
    logger?.warn?.('[touch-dev-toolbox] Failed to ensure toolbox file', error)
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
      actionId,
      payload,
    })
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
        buildActionItem({
          id: `${featureId}-config-open`,
          featureId,
          title: '打开配置目录',
          subtitle: '编辑 toolbox.json',
          actionId: 'config-open',
        }),
      ]

      const linkItems = []
      links.forEach((link, index) => {
        const title = typeof link.title === 'string' ? link.title : `链接 ${index + 1}`
        const url = typeof link.url === 'string' ? link.url : ''
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

      plugin.feature.clearItems()
      plugin.feature.pushItems([...items, ...linkItems])
      return true
    }
    catch (error) {
      logger?.error?.('[touch-dev-toolbox] Failed to handle feature', error)
    }
  },

  async onItemAction(item) {
    if (item?.meta?.defaultAction !== ACTION_ID)
      return

    const actionId = item.meta?.actionId
    if (actionId === 'config-init') {
      await ensureToolboxFile()
      return { externalAction: true }
    }

    if (actionId === 'config-open') {
      await plugin.storage.openFolder()
      return { externalAction: true }
    }

    if (actionId === 'open-link') {
      const url = item.meta?.payload?.url
      if (typeof url === 'string' && url) {
        openUrl?.(url)
        return { externalAction: true }
      }
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    parseToolboxConfig,
  },
}
