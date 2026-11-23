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

const PRESET_ICON = { type: 'class', value: 'i-ri-layout-column-line' }
const PRESETS = [
  {
    id: 'preset-two-column',
    title: '双列平铺（前两窗口）',
    subtitle: '自动将前两窗口分到左右半屏',
    keywords: ['split', 'tile', '双列', '平铺', '左右'],
  },
  {
    id: 'preset-dev-split',
    title: '开发工作台（终端+浏览器）',
    subtitle: '终端贴左，浏览器贴右，适合开发调试',
    keywords: ['dev', 'terminal', 'browser', '开发', '终端', '浏览器'],
  },
  {
    id: 'preset-clear-topmost',
    title: '取消全部置顶',
    subtitle: '批量取消当前可见窗口的置顶状态',
    keywords: ['topmost', 'cleanup', '置顶', '清理'],
  },
]
const PRESET_IDS = new Set(PRESETS.map(p => p.id))
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
  if (code === 'PLUGIN_HOST_PERMISSION_REQUEST_FAILED')
    return blocked('permission-check-failed', '权限请求失败')
  if (
    code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE'
    || code === 'PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE'
    || code === 'CAPABILITY_UNAVAILABLE'
  ) {
    return blocked('capability-unavailable', '窗口管理能力不可用')
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED')
    return blocked('cancelled', '窗口操作已取消', 'cancelled')
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT')
    return blocked('timeout', '窗口操作超时', 'failed')
  return blocked('window-manager-failed', '窗口操作失败', 'failed')
}

function selectedPresetId(item, context) {
  const selectedId = normalizeText(context?.actionId || item?.actions?.[0]?.id || item?.meta?.defaultAction)
  if (selectedId !== 'run-preset')
    return ''
  const action = Array.isArray(item?.actions)
    ? item.actions.find(candidate => candidate?.id === 'run-preset' && (!candidate?.type || candidate.type === 'plugin'))
    : null
  const payload = action?.payload
  if (payload && typeof payload === 'object') {
    if (
      Object.keys(payload).length !== 1
      || !Object.prototype.hasOwnProperty.call(payload, 'presetId')
      || typeof payload.presetId !== 'string'
    ) {
      return ''
    }
    const candidate = normalizeText(payload.presetId)
    return PRESET_IDS.has(candidate) ? candidate : ''
  }
  const fallback = normalizeText(item?.meta?.presetId)
  return PRESET_IDS.has(fallback) ? fallback : ''
}

function presetBlockedMessage(reason) {
  if (reason === 'insufficient-windows')
    return '可见窗口数量不足'
  if (reason === 'permission-denied')
    return '缺少 system.shell 权限'
  if (reason === 'permission-unavailable')
    return '权限系统不可用'
  if (reason === 'permission-check-failed')
    return '权限请求失败'
  if (reason === 'platform-unsupported')
    return '当前平台暂不支持窗口预设'
  return '窗口预设不可用'
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
    if (featureId === 'window-presets') {
      if (currentPlatform() !== 'win32') {
        await publishItems([
          new TuffItemBuilder(`${featureId}-unsupported`)
            .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
            .setTitle('当前平台暂不支持窗口预设')
            .setSubtitle('窗口预设当前仅支持 Windows')
            .setIcon(PRESET_ICON)
            .setMeta({ pluginName: PLUGIN_NAME, featureId })
            .build(),
        ])
        return true
      }
      const keyword = normalizeText(getQueryText(query)).toLowerCase()
      const matched = PRESETS.filter(
        p => !keyword || [p.id, p.title, p.subtitle, ...p.keywords].join(' ').toLowerCase().includes(keyword),
      )
      const items = matched.map(p =>
        new TuffItemBuilder(`window-preset-${p.id}`)
          .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
          .setTitle(p.title)
          .setSubtitle(p.subtitle)
          .setIcon(PRESET_ICON)
          .setMeta({ pluginName: PLUGIN_NAME, featureId, defaultAction: 'run-preset', presetId: p.id })
          .createAndAddAction('run-preset', 'plugin', '应用预设', { presetId: p.id })
          .build(),
      )
      if (items.length === 0) {
        items.push(
          new TuffItemBuilder(`${featureId}-empty`)
            .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
            .setTitle('暂无匹配预设')
            .setSubtitle('可输入 dev / split / topmost 过滤')
            .setIcon(PRESET_ICON)
            .setMeta({ pluginName: PLUGIN_NAME, featureId })
            .build(),
        )
      }
      await publishItems(items)
      return true
    }
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
    if (item?.meta?.pluginName && item.meta.pluginName !== PLUGIN_NAME)
      return

    if (item?.meta?.defaultAction === 'run-preset') {
      const selectedId = normalizeText(context?.actionId || item?.actions?.[0]?.id || item?.meta?.defaultAction)
      if (selectedId !== 'run-preset')
        return
      const presetId = selectedPresetId(item, context)
      if (!presetId)
        return blocked('invalid-action', '无效窗口预设')
      if (currentPlatform() !== 'win32')
        return blocked('platform-unsupported', '当前平台暂不支持窗口预设')
      if (!plugin.windowPresets || typeof plugin.windowPresets.runAction !== 'function')
        return blocked('capability-unavailable', '窗口预设能力不可用')
      try {
        const result = await plugin.windowPresets.runAction(presetId)
        if (result?.status === 'completed') {
          return {
            externalAction: true,
            success: true,
            status: 'completed',
            message: `已处理 ${result.affectedWindows ?? 0} 个窗口`,
          }
        }
        if (result?.status === 'blocked') {
          const reason = normalizeText(result.reason) || 'blocked'
          return blocked(reason, presetBlockedMessage(reason))
        }
        return blocked('execution-failed', '窗口预设执行失败', 'failed')
      }
      catch (error) {
        const failure = stableFailure(error)
        logger?.error?.(`[touch-window-manager] ${failure.reason}`)
        return failure
      }
    }

    const candidateActionId = normalizeText(context?.actionId || item?.meta?.defaultAction)
    if (!ACTIONS.has(candidateActionId))
      return

    const selected = selectedAction(item, context)
    if (!selected)
      return blocked('invalid-action', '无效窗口动作')
    if (!plugin.windowManager || typeof plugin.windowManager.act !== 'function')
      return blocked('capability-unavailable', '窗口管理能力不可用')

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
