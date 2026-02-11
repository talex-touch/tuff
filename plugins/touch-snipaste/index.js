const { plugin, logger, TuffItemBuilder } = globalThis
const { spawn } = require('node:child_process')
const path = require('node:path')

const PLUGIN_NAME = 'touch-snipaste'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const DEFAULT_ACTION = 'snipaste'

const INTERNAL_ACTIONS = [
  {
    id: 'config-init',
    title: '生成默认配置',
    subtitle: '写入 settings.json（已存在则不覆盖）',
    keywords: ['config', 'settings', '配置', '初始化'],
    kind: 'internal',
  },
  {
    id: 'config-open',
    title: '打开配置目录',
    subtitle: '打开插件存储目录',
    keywords: ['config', 'settings', '配置', '目录'],
    kind: 'internal',
  },
]

const BUILTIN_ACTIONS = [
  {
    id: 'launch',
    title: '启动 Snipaste',
    subtitle: '打开 Snipaste 程序',
    args: [],
    keywords: ['launch', 'start', '启动', '打开'],
  },
  {
    id: 'snip',
    title: '截图',
    subtitle: '开始截图',
    args: ['snip'],
    keywords: ['snip', '截图'],
  },
  {
    id: 'snip-full',
    title: '全屏截图到剪贴板',
    subtitle: 'snip --full -o clipboard',
    args: ['snip', '--full', '-o', 'clipboard'],
    keywords: ['full', '全屏', 'clipboard', '剪贴板'],
  },
  {
    id: 'paste',
    title: '贴图',
    subtitle: '从剪贴板贴图',
    args: ['paste'],
    keywords: ['paste', '贴图'],
  },
  {
    id: 'pick-color',
    title: '取色',
    subtitle: '屏幕取色',
    args: ['pick-color'],
    keywords: ['color', '取色'],
  },
  {
    id: 'toggle-images',
    title: '显示/隐藏贴图',
    subtitle: 'toggle-images',
    args: ['toggle-images'],
    keywords: ['toggle', '隐藏', '显示', '贴图管理'],
  },
  {
    id: 'docs',
    title: '打开帮助',
    subtitle: '打开 Snipaste 帮助面板',
    args: ['docs'],
    keywords: ['docs', 'help', '文档', '帮助'],
  },
]

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

function matchesKeyword(action, keyword) {
  if (!keyword)
    return true
  if (action.kind === 'internal')
    return true
  const lower = keyword.toLowerCase()
  return action.keywords?.some((item) => item.toLowerCase().includes(lower))
    || action.title.toLowerCase().includes(lower)
    || action.subtitle.toLowerCase().includes(lower)
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

function buildActionItem({ id, featureId, title, subtitle, actionId }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: DEFAULT_ACTION,
      actionId,
    })
    .build()
}

function normalizeAction(action, source) {
  const id = typeof action.id === 'string' ? action.id.trim() : ''
  if (!id)
    return null

  const args = Array.isArray(action.args) ? action.args.filter((arg) => typeof arg === 'string' && arg.trim()) : []
  const title = typeof action.title === 'string' && action.title.trim() ? action.title.trim() : id
  const subtitle = typeof action.subtitle === 'string' && action.subtitle.trim()
    ? action.subtitle.trim()
    : (args.length > 0 ? args.join(' ') : '')
  const keywords = Array.isArray(action.keywords)
    ? action.keywords.filter((item) => typeof item === 'string' && item.trim())
    : []

  if (source === 'custom' && args.length === 0)
    return null

  return {
    id,
    key: `${source}:${id}`,
    title,
    subtitle,
    args,
    keywords,
    source,
    kind: action.kind || source,
  }
}

function getDefaultSnipastePath() {
  if (process.platform === 'win32')
    return 'C:\\Program Files\\Snipaste\\Snipaste.exe'
  if (process.platform === 'darwin')
    return '/Applications/Snipaste.app/Contents/MacOS/Snipaste'
  return '/opt/Snipaste/Snipaste.AppImage'
}

function buildDefaultSettings() {
  return {
    snipastePath: getDefaultSnipastePath(),
    actions: [
      {
        id: 'custom-snip',
        title: '自定义截图',
        subtitle: 'snip --your-args',
        args: ['snip', '--your-args'],
        keywords: ['custom', '自定义'],
      },
    ],
  }
}

async function readSettings() {
  try {
    const settings = await plugin.storage.getFile('settings.json')
    if (!settings)
      return null
    if (typeof settings === 'string') {
      try {
        return JSON.parse(settings)
      }
      catch (error) {
        logger?.warn?.('[touch-snipaste] Failed to parse settings.json')
        return null
      }
    }
    if (typeof settings === 'object')
      return settings
  }
  catch (error) {
    return null
  }
  return null
}

async function loadCustomActions() {
  const settings = await readSettings()
  if (!settings || !Array.isArray(settings.actions))
    return []
  return settings.actions
    .map((action) => normalizeAction(action, 'custom'))
    .filter(Boolean)
}

async function resolveActions() {
  const internal = INTERNAL_ACTIONS.map((action) => normalizeAction(action, 'internal')).filter(Boolean)
  const builtins = BUILTIN_ACTIONS.map((action) => normalizeAction(action, 'builtin')).filter(Boolean)
  const custom = await loadCustomActions()
  return [...internal, ...builtins, ...custom]
}

async function getCustomPath() {
  const envPath = process.env.SNIPASTE_PATH
  if (envPath)
    return envPath
  const settings = await readSettings()
  if (settings?.snipastePath)
    return settings.snipastePath
  return null
}

async function resolveCommandCandidates() {
  const candidates = []
  const customPath = await getCustomPath()
  if (customPath)
    candidates.push(customPath)

  const platform = process.platform
  const homeDir = process.env.HOME

  if (platform === 'win32') {
    candidates.push(
      'Snipaste',
      'Snipaste.exe',
      'C:\\Program Files\\Snipaste\\Snipaste.exe',
      'C:\\Program Files (x86)\\Snipaste\\Snipaste.exe',
    )
  }
  else if (platform === 'darwin') {
    candidates.push(
      '/Applications/Snipaste.app/Contents/MacOS/Snipaste',
      'Snipaste',
    )
    if (homeDir) {
      candidates.push(path.join(homeDir, 'Applications', 'Snipaste.app', 'Contents', 'MacOS', 'Snipaste'))
    }
  }
  else {
    candidates.push(
      'Snipaste.AppImage',
      'snipaste',
      '/opt/Snipaste/Snipaste.AppImage',
    )
    if (homeDir) {
      candidates.push(path.join(homeDir, 'Applications', 'Snipaste.AppImage'))
    }
  }

  return [...new Set(candidates.filter(Boolean))]
}

function spawnCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('spawn', () => resolve())
    child.unref()
  })
}

async function runSnipaste(args) {
  const candidates = await resolveCommandCandidates()
  let lastError = null
  for (const command of candidates) {
    try {
      await spawnCommand(command, args)
      return { ok: true, command }
    }
    catch (error) {
      lastError = error
    }
  }
  return { ok: false, error: lastError }
}

const pluginLifecycle = {
  async onInit() {
    const existing = await readSettings()
    if (!existing)
      await plugin.storage.setFile('settings.json', buildDefaultSettings())
  },

  async onFeatureTriggered(featureId, query, _feature, signal) {
    try {
      if (signal?.aborted)
        return true

      const keyword = normalizeText(query?.text ?? query)
      const items = []
      const actions = await resolveActions()
      const settings = await readSettings()
      const configReady = Boolean(settings)
      const customCount = Array.isArray(settings?.actions) ? settings.actions.length : 0
      const currentPath = settings?.snipastePath || '未配置'

      items.push(buildInfoItem({
        id: `${featureId}-config-status`,
        featureId,
        title: `配置状态：${configReady ? '已生成' : '未生成'}`,
        subtitle: `当前路径：${currentPath}`,
      }))

      items.push(buildInfoItem({
        id: `${featureId}-custom-count`,
        featureId,
        title: '自定义动作',
        subtitle: `已配置 ${customCount} 条（settings.json actions）`,
      }))

      items.push(buildInfoItem({
        id: `${featureId}-hint`,
        featureId,
        title: '提示：Snipaste 需保持运行',
        subtitle: '命令行指令需 Snipaste 已运行才会生效',
      }))

      actions.filter((action) => matchesKeyword(action, keyword)).forEach((action) => {
        items.push(buildActionItem({
          id: `${featureId}-${action.key}`,
          featureId,
          title: action.title,
          subtitle: action.subtitle,
          actionId: action.key,
        }))
      })

      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      logger?.error?.('[touch-snipaste] Failed to handle feature', error)
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
      if (item?.meta?.defaultAction !== DEFAULT_ACTION)
        return

      const actionId = item?.meta?.actionId
      if (!actionId)
        return

      const actions = await resolveActions()
      const action = actions.find((entry) => entry.key === actionId)
      if (!action)
        return

      if (action.kind === 'internal') {
        if (action.id === 'config-init') {
          const existing = await readSettings()
          if (!existing)
            await plugin.storage.setFile('settings.json', buildDefaultSettings())
          return { externalAction: true }
        }
        if (action.id === 'config-open') {
          await plugin.storage.openFolder()
          return { externalAction: true }
        }
        return
      }

      const result = await runSnipaste(action.args)
      if (!result.ok) {
        logger?.warn?.('[touch-snipaste] Failed to run Snipaste command', result.error)
      }
      return { externalAction: true }
    }
    catch (error) {
      logger?.error?.('[touch-snipaste] Action failed', error)
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    normalizeAction,
    matchesKeyword,
  },
}
