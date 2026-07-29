const { plugin, logger, TuffItemBuilder, platform: hostPlatform } = globalThis

const PLUGIN_NAME = 'touch-snipaste'
const SOURCE_ID = 'plugin-features'
const FEATURE_ID = 'snipaste-quick'
const DEFAULT_ACTION = 'snipaste-action'
const RUN_ACTION_ID = 'run-action'
const ICON = { type: 'class', value: 'i-ri-screenshot-2-line' }
const ACTIONS = [
  {
    id: 'launch',
    title: '启动 Snipaste',
    subtitle: '打开 Snipaste 程序',
    keywords: ['launch', 'start', '启动', '打开'],
  },
  {
    id: 'snip',
    title: '截图',
    subtitle: '开始截图',
    keywords: ['snip', '截图'],
  },
  {
    id: 'snip-full',
    title: '全屏截图到剪贴板',
    subtitle: '截取全屏并写入剪贴板',
    keywords: ['full', '全屏', 'clipboard', '剪贴板'],
  },
  {
    id: 'paste',
    title: '贴图',
    subtitle: '从剪贴板贴图',
    keywords: ['paste', '贴图'],
  },
  {
    id: 'pick-color',
    title: '取色',
    subtitle: '屏幕取色',
    keywords: ['color', '取色'],
  },
  {
    id: 'toggle-images',
    title: '显示/隐藏贴图',
    subtitle: '切换全部贴图的可见状态',
    keywords: ['toggle', '隐藏', '显示', '贴图管理'],
  },
  {
    id: 'docs',
    title: '打开帮助',
    subtitle: '打开 Snipaste 帮助面板',
    keywords: ['docs', 'help', '文档', '帮助'],
  },
]
const ACTION_IDS = new Set(ACTIONS.map(action => action.id))

function normalizeText(value) {
  return String(value ?? '').trim()
}

function currentPlatform() {
  return typeof hostPlatform?.platform === 'string' ? hostPlatform.platform : 'unsupported'
}

function getQueryText(query) {
  return typeof query === 'string' ? query : (query?.text ?? '')
}

function matchesKeyword(action, query) {
  const keyword = normalizeText(query).toLowerCase()
  if (!keyword)
    return true
  return [action.id, action.title, action.subtitle, ...action.keywords]
    .join(' ')
    .toLowerCase()
    .includes(keyword)
}

function buildItem(action, featureId) {
  return new TuffItemBuilder(`${featureId}-${action.id}`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(action.title)
    .setSubtitle(action.subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: DEFAULT_ACTION,
    })
    .createAndAddAction(RUN_ACTION_ID, 'plugin', action.title, { actionId: action.id })
    .build()
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
    return blocked('cancelled', 'Snipaste 操作已取消', 'cancelled')
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT')
    return blocked('timeout', 'Snipaste 启动超时', 'failed')
  return blocked('snipaste-action-failed', 'Snipaste 操作执行失败', 'failed')
}

async function runAction(actionId) {
  if (!ACTION_IDS.has(actionId))
    return blocked('invalid-action', '无效 Snipaste 操作')
  if (!plugin.snipaste || typeof plugin.snipaste.runAction !== 'function')
    return blocked('process-capability-unavailable', 'Snipaste 操作能力不可用')

  try {
    const result = await plugin.snipaste.runAction(actionId)
    if (result?.status === 'started') {
      return {
        externalAction: true,
        success: true,
        status: 'started',
      }
    }
    if (result?.status === 'blocked') {
      const reason = normalizeText(result.reason) || 'blocked'
      const message = reason === 'not-installed'
        ? '未在受信任位置找到 Snipaste'
        : reason === 'permission-denied'
          ? '缺少 system.shell 权限'
          : reason === 'permission-unavailable'
            ? '权限系统不可用'
            : reason === 'platform-unsupported'
              ? '当前平台暂不支持 Snipaste 操作'
              : 'Snipaste 操作不可用'
      return blocked(reason, message)
    }
    return blocked('spawn-failed', 'Snipaste 启动失败', 'failed')
  }
  catch (error) {
    const failure = stableFailure(error)
    logger?.error?.(`[touch-snipaste] ${failure.reason}`)
    return failure
  }
}

function selectedActionId(item, context) {
  if (!item?.meta || item.meta.defaultAction !== DEFAULT_ACTION)
    return ''
  const selectedId = context?.actionId || item.actions?.[0]?.id
  if (selectedId !== RUN_ACTION_ID)
    return ''
  const selectedAction = item.actions?.find?.(action => action?.id === selectedId)
  const actionId = normalizeText(selectedAction?.payload?.actionId)
  return ACTION_IDS.has(actionId) ? actionId : ''
}

const pluginLifecycle = {
  async onInit() {},

  async onFeatureTriggered(featureId, query) {
    if (featureId !== FEATURE_ID)
      return false
    const platform = currentPlatform()
    if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') {
      await publishItems([
        new TuffItemBuilder(`${featureId}-unsupported`)
          .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
          .setTitle('当前平台暂不支持 Snipaste 操作')
          .setSubtitle('Snipaste 仅支持 macOS、Windows 和 Linux')
          .setIcon(ICON)
          .setMeta({ pluginName: PLUGIN_NAME, featureId })
          .build(),
      ])
      return true
    }
    const keyword = getQueryText(query)
    const items = ACTIONS
      .filter(action => matchesKeyword(action, keyword))
      .map(action => buildItem(action, featureId))
    if (items.length === 0) {
      items.push(
        new TuffItemBuilder(`${featureId}-empty`)
          .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
          .setTitle('没有匹配的 Snipaste 操作')
          .setSubtitle('可尝试输入：截图 / 贴图 / 取色 / 帮助')
          .setIcon(ICON)
          .setMeta({ pluginName: PLUGIN_NAME, featureId })
          .build(),
      )
    }
    await publishItems(items)
    return true
  },

  async onItemAction(item, context = {}) {
    const actionId = selectedActionId(item, context)
    if (!actionId)
      return blocked('invalid-action', '无效 Snipaste 操作')
    return await runAction(actionId)
  },

  async onDestroy() {},
}

module.exports = pluginLifecycle
