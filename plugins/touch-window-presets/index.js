const { plugin, logger, TuffItemBuilder, platform: hostPlatform } = globalThis

const PLUGIN_NAME = 'touch-window-presets'
const SOURCE_ID = 'plugin-features'
const FEATURE_ID = 'window-presets'
const DEFAULT_ACTION = 'window-presets-action'
const RUN_ACTION_ID = 'run-action'
const ICON = { type: 'class', value: 'i-ri-layout-column-line' }
const GROUP_ORDER = ['presets', 'cleanup']
const GROUP_META = {
  presets: { title: '布局预设', subtitle: '双列平铺 / 开发工作台' },
  cleanup: { title: '清理动作', subtitle: '批量取消置顶' },
}
const PRESETS = [
  {
    id: 'preset-two-column',
    title: '双列平铺（前两窗口）',
    subtitle: '自动将前两窗口分到左右半屏',
    group: 'presets',
    keywords: ['split', 'tile', '双列', '平铺', '左右'],
  },
  {
    id: 'preset-dev-split',
    title: '开发工作台（终端+浏览器）',
    subtitle: '终端贴左，浏览器贴右，适合开发调试',
    group: 'presets',
    keywords: ['dev', 'terminal', 'browser', '开发', '终端', '浏览器'],
  },
  {
    id: 'preset-clear-topmost',
    title: '取消全部置顶',
    subtitle: '批量取消当前可见窗口的置顶状态',
    group: 'cleanup',
    keywords: ['topmost', 'cleanup', '置顶', '清理'],
  },
]
const PRESET_IDS = new Set(PRESETS.map(preset => preset.id))

function normalizeText(value) {
  return String(value ?? '').trim()
}

function currentPlatform() {
  return typeof hostPlatform?.platform === 'string' ? hostPlatform.platform : 'unsupported'
}

function getQueryText(query) {
  return typeof query === 'string' ? query : (query?.text ?? '')
}

function matchesPreset(preset, query) {
  const keyword = normalizeText(query).toLowerCase()
  if (!keyword)
    return true
  return [preset.id, preset.title, preset.subtitle, ...preset.keywords]
    .join(' ')
    .toLowerCase()
    .includes(keyword)
}

function buildItem({ id, featureId, title, subtitle, presetId }) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      ...(presetId ? { defaultAction: DEFAULT_ACTION } : {}),
    })

  if (presetId)
    builder.createAndAddAction(RUN_ACTION_ID, 'plugin', title, { actionId: presetId })
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
    return blocked('cancelled', '窗口预设操作已取消', 'cancelled')
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT')
    return blocked('timeout', '窗口预设执行超时', 'failed')
  return blocked('window-preset-failed', '窗口预设执行失败', 'failed')
}

function statusItem(featureId, result) {
  if (result?.status === 'available') {
    return buildItem({
      id: `${featureId}-window-count`,
      featureId,
      title: '当前可见窗口',
      subtitle: `${result.windowCount} 个`,
    })
  }
  if (result?.status === 'blocked') {
    const message = result.reason === 'permission-denied'
      ? '缺少 system.shell 权限'
      : result.reason === 'permission-unavailable'
        ? '权限系统不可用'
        : '当前平台暂不支持窗口预设'
    return buildItem({
      id: `${featureId}-status-blocked`,
      featureId,
      title: message,
      subtitle: '窗口数量与布局执行均由宿主授权',
    })
  }
  return buildItem({
    id: `${featureId}-status-failed`,
    featureId,
    title: '窗口状态获取失败',
    subtitle: '请稍后重试',
  })
}

function selectedPresetId(item, context) {
  if (!item?.meta || item.meta.defaultAction !== DEFAULT_ACTION)
    return ''
  const selectedId = context?.actionId || item.actions?.[0]?.id
  if (selectedId !== RUN_ACTION_ID)
    return ''
  const selectedAction = item.actions?.find?.(action => action?.id === selectedId)
  const presetId = normalizeText(selectedAction?.payload?.actionId)
  return PRESET_IDS.has(presetId) ? presetId : ''
}

async function runPreset(presetId) {
  if (!PRESET_IDS.has(presetId))
    return blocked('invalid-action', '无效窗口预设')
  if (!plugin.windowPresets || typeof plugin.windowPresets.runAction !== 'function')
    return blocked('window-preset-capability-unavailable', '窗口预设能力不可用')

  try {
    const result = await plugin.windowPresets.runAction(presetId)
    if (result?.status === 'completed') {
      return {
        externalAction: true,
        success: true,
        status: 'completed',
        message: `已处理 ${result.affectedWindows} 个窗口`,
      }
    }
    if (result?.status === 'blocked') {
      const reason = normalizeText(result.reason) || 'blocked'
      const message = reason === 'insufficient-windows'
        ? '可见窗口数量不足'
        : reason === 'permission-denied'
          ? '缺少 system.shell 权限'
          : reason === 'permission-unavailable'
            ? '权限系统不可用'
            : reason === 'platform-unsupported'
              ? '当前平台暂不支持窗口预设'
              : '窗口预设不可用'
      return blocked(reason, message)
    }
    return blocked('execution-failed', '窗口预设执行失败', 'failed')
  }
  catch (error) {
    const failure = stableFailure(error)
    logger?.error?.(`[touch-window-presets] ${failure.reason}`)
    return failure
  }
}

const pluginLifecycle = {
  async onInit() {},

  async onFeatureTriggered(featureId, query) {
    if (featureId !== FEATURE_ID)
      return false

    if (currentPlatform() !== 'win32') {
      await publishItems([
        buildItem({
          id: `${featureId}-unsupported`,
          featureId,
          title: '当前平台暂不支持窗口预设',
          subtitle: '该插件当前仅支持 Windows',
        }),
      ])
      return true
    }

    let status
    try {
      status = plugin.windowPresets && typeof plugin.windowPresets.status === 'function'
        ? await plugin.windowPresets.status()
        : { operation: 'status', status: 'failed', reason: 'status-failed' }
    }
    catch (error) {
      const failure = stableFailure(error)
      status = {
        operation: 'status',
        status: failure.status === 'blocked' ? 'blocked' : 'failed',
        reason: failure.reason,
      }
    }

    const matched = PRESETS.filter(preset => matchesPreset(preset, getQueryText(query)))
    const items = [statusItem(featureId, status)]
    for (const group of GROUP_ORDER) {
      const presets = matched.filter(preset => preset.group === group)
      if (presets.length === 0)
        continue
      const meta = GROUP_META[group]
      items.push(
        buildItem({
          id: `${featureId}-section-${group}`,
          featureId,
          title: meta.title,
          subtitle: meta.subtitle,
        }),
      )
      for (const preset of presets) {
        items.push(
          buildItem({
            id: `${featureId}-${preset.id}`,
            featureId,
            title: preset.title,
            subtitle: preset.subtitle,
            presetId: preset.id,
          }),
        )
      }
    }
    if (matched.length === 0) {
      items.push(
        buildItem({
          id: `${featureId}-empty`,
          featureId,
          title: '暂无匹配预设',
          subtitle: '可输入 dev / split / topmost 过滤',
        }),
      )
    }
    await publishItems(items)
    return true
  },

  async onItemAction(item, context = {}) {
    const presetId = selectedPresetId(item, context)
    if (!presetId)
      return blocked('invalid-action', '无效窗口预设')
    return await runPreset(presetId)
  },

  async onDestroy() {},
}

module.exports = pluginLifecycle
