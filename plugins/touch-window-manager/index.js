const { plugin, logger, TuffItemBuilder, platform: hostPlatform } = globalThis

const PLUGIN_NAME = 'touch-window-manager'
const SOURCE_ID = 'plugin-features'
const FEATURE_ID = 'window-app'
const ICON = { type: 'class', value: 'i-ri-window-line' }
const WINDOW_LIMIT = 20
const APP_LIMIT = 8
const ACTIONS = new Set(['activate', 'snap-left', 'snap-right', 'topmost-toggle', 'close', 'hide', 'quit', 'launch'])
const ACTION_LABELS = {
  'activate': '激活',
  'snap-left': '贴左',
  'snap-right': '贴右',
  'topmost-toggle': '切换置顶',
  'close': '关闭窗口',
  'hide': '隐藏',
  'quit': '退出应用',
  'launch': '启动',
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  return typeof query === 'string' ? query : (query?.text ?? '')
}

function currentPlatform() {
  return typeof hostPlatform?.platform === 'string' ? hostPlatform.platform : 'unsupported'
}

function truncateText(value, max = 72) {
  const text = normalizeText(value)
  if (text.length <= max)
    return text
  return `${text.slice(0, max - 1)}...`
}

function matchesQuery(item, query) {
  const keyword = normalizeText(query).toLowerCase()
  if (!keyword)
    return true
  return `${item.name ?? ''} ${item.title ?? ''}`.toLowerCase().includes(keyword)
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

function buildManagedItem(featureId, index, entry) {
  const actions = Array.isArray(entry.actions) ? entry.actions.filter(action => ACTIONS.has(action)) : []
  const builder = new TuffItemBuilder(`${featureId}-${entry.kind}-${index}`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(entry.kind === 'app' ? `应用 · ${entry.name}` : entry.name)
    .setSubtitle(
      entry.kind === 'app'
        ? '宿主 inventory 签发，可打开当前运行应用'
        : `${truncateText(entry.title) || '无窗口标题'}${entry.isFront ? ' · FRONT' : ''}${entry.topmost ? ' · TOPMOST' : ''}`,
    )
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      ...(actions[0] ? { defaultAction: actions[0] } : {}),
    })

  for (const action of actions) {
    builder.createAndAddAction(action, 'plugin', ACTION_LABELS[action], {
      action,
      token: entry.token,
    })
  }
  return builder.build()
}

async function publishItems(items) {
  await plugin.feature.clearItems()
  await plugin.feature.pushItems(items)
}

function blocked(reason, message, status = 'blocked') {
  return {
    externalAction: true,
    success: false,
    status,
    reason,
    message,
  }
}

function stableFailure(error) {
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    return blocked('permission-denied', '缺少 system.shell 权限')
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    return blocked('permission-unavailable', '权限系统不可用')
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED')
    return blocked('cancelled', '窗口操作已取消', 'cancelled')
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT')
    return blocked('timeout', '窗口操作超时', 'failed')
  return blocked('window-manager-failed', '窗口操作失败', 'failed')
}

function selectedAction(item, context) {
  const selectedId = normalizeText(context?.actionId || item?.meta?.defaultAction)
  if (!ACTIONS.has(selectedId) || !Array.isArray(item?.actions))
    return null
  const action = item.actions.find(candidate => candidate?.id === selectedId)
  const payload = action?.payload
  if (
    !payload
    || Object.keys(payload).length !== 2
    || !Object.prototype.hasOwnProperty.call(payload, 'action')
    || !Object.prototype.hasOwnProperty.call(payload, 'token')
    || payload.action !== selectedId
    || typeof payload.token !== 'string'
    || !/^wm_[\w-]{32}$/.test(payload.token)
  ) {
    return null
  }
  return { action: selectedId, token: payload.token }
}

function resultMessage(reason) {
  if (reason === 'token-expired' || reason === 'token-replayed')
    return '窗口列表已过期，请重新搜索'
  if (reason === 'native-replaced')
    return '窗口状态已变化，请重新搜索'
  if (reason === 'action-unsupported')
    return '当前对象不支持该动作'
  if (reason === 'platform-unsupported')
    return '当前平台暂不支持该动作'
  return '窗口令牌无效，请重新搜索'
}

const pluginLifecycle = {
  async onInit() {},

  async onFeatureTriggered(featureId, query) {
    if (featureId !== FEATURE_ID)
      return false

    if (currentPlatform() !== 'win32' && currentPlatform() !== 'darwin') {
      await publishItems([
        buildInfoItem({
          id: `${featureId}-unsupported`,
          featureId,
          title: '当前平台暂不支持窗口管理',
          subtitle: '仅支持 Windows 与 macOS',
        }),
      ])
      return true
    }

    let result
    try {
      if (!plugin.windowManager || typeof plugin.windowManager.list !== 'function')
        throw Object.assign(new Error('capability unavailable'), { code: 'CAPABILITY_UNAVAILABLE' })
      result = await plugin.windowManager.list()
    }
    catch (error) {
      const failure = stableFailure(error)
      logger?.error?.(`[touch-window-manager] ${failure.reason}`)
      await publishItems([
        buildInfoItem({
          id: `${featureId}-failed`,
          featureId,
          title: failure.message,
          subtitle: '窗口与应用身份只由宿主读取和签发',
        }),
      ])
      return true
    }

    if (result?.status === 'blocked') {
      await publishItems([
        buildInfoItem({
          id: `${featureId}-blocked`,
          featureId,
          title: result.reason === 'platform-unsupported' ? '当前平台暂不支持窗口管理' : '窗口管理不可用',
          subtitle: '窗口与应用身份只由宿主读取和签发',
        }),
      ])
      return true
    }
    if (result?.status !== 'available' || !Array.isArray(result.items)) {
      await publishItems([
        buildInfoItem({
          id: `${featureId}-failed`,
          featureId,
          title: '窗口列表获取失败',
          subtitle: '请稍后重试',
        }),
      ])
      return true
    }

    const keyword = getQueryText(query)
    const windows = result.items
      .filter(entry => entry?.kind === 'window' && matchesQuery(entry, keyword))
      .slice(0, WINDOW_LIMIT)
    const apps = result.items.filter(entry => entry?.kind === 'app' && matchesQuery(entry, keyword)).slice(0, APP_LIMIT)
    const items = [
      buildInfoItem({
        id: `${featureId}-summary`,
        featureId,
        title: '窗口管理',
        subtitle: `${windows.length} 个窗口 · ${apps.length} 个宿主应用令牌`,
      }),
    ]

    if (windows.length > 0) {
      items.push(
        buildInfoItem({
          id: `${featureId}-section-windows`,
          featureId,
          title: '当前窗口',
          subtitle: '令牌短期有效且单次使用',
        }),
      )
      windows.forEach((entry, index) => items.push(buildManagedItem(featureId, index, entry)))
    }
    if (apps.length > 0) {
      items.push(
        buildInfoItem({
          id: `${featureId}-section-apps`,
          featureId,
          title: '可启动应用',
          subtitle: '仅限宿主 inventory 中的应用',
        }),
      )
      apps.forEach((entry, index) => items.push(buildManagedItem(featureId, index, entry)))
    }
    if (windows.length === 0 && apps.length === 0) {
      items.push(
        buildInfoItem({
          id: `${featureId}-empty`,
          featureId,
          title: '暂无匹配窗口',
          subtitle: keyword ? '请调整搜索关键词' : '打开应用窗口后再试',
        }),
      )
    }

    await publishItems(items)
    return true
  },

  async onItemAction(item, context = {}) {
    const selected = selectedAction(item, context)
    if (!selected)
      return blocked('invalid-action', '无效窗口动作')
    if (!plugin.windowManager || typeof plugin.windowManager.act !== 'function')
      return blocked('window-manager-capability-unavailable', '窗口管理能力不可用')

    try {
      const result = await plugin.windowManager.act(selected.action, selected.token)
      if (result?.status === 'completed') {
        return {
          externalAction: true,
          success: true,
          status: 'completed',
          message: '窗口动作已完成',
        }
      }
      if (result?.status === 'blocked')
        return blocked(normalizeText(result.reason) || 'blocked', resultMessage(result.reason))
      return blocked('action-failed', '窗口动作执行失败', 'failed')
    }
    catch (error) {
      const failure = stableFailure(error)
      logger?.error?.(`[touch-window-manager] ${failure.reason}`)
      return failure
    }
  },

  async onDestroy() {},
}

module.exports = pluginLifecycle
