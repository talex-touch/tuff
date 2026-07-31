const { plugin, logger, TuffItemBuilder, system, platform: hostPlatform } = globalThis

const PLUGIN_NAME = 'touch-system-actions'
const SOURCE_ID = 'plugin-features'
const FEATURE_ID = 'system-actions'
const RUN_ACTION_ID = 'run-action'
const ICON = { type: 'class', value: 'i-ri-shut-down-line' }
const GROUP_ORDER = ['power', 'audio', 'display', 'window']
const GROUP_META = {
  power: { title: '电源操作', subtitle: '关机 / 重启 / 锁屏' },
  audio: { title: '音量操作', subtitle: '音量+ / 音量- / 静音' },
  display: { title: '显示操作', subtitle: '亮度+ / 亮度-' },
  window: { title: '窗口操作', subtitle: '主窗口控制' },
}
const ACTIONS = [
  {
    id: 'shutdown',
    name: '关机',
    description: '关闭计算机',
    keywords: ['关机', '关闭', 'shutdown', 'power off', '关闭电脑'],
    group: 'power',
    platforms: ['darwin', 'win32'],
  },
  {
    id: 'restart',
    name: '重启',
    description: '重启计算机',
    keywords: ['重启', '重新启动', 'restart', 'reboot', '重启电脑'],
    group: 'power',
    platforms: ['darwin', 'win32'],
  },
  {
    id: 'lock-screen',
    name: '锁定屏幕',
    description: '立即锁屏',
    keywords: ['锁定', '锁屏', 'lock', 'lock screen', '锁定屏幕'],
    group: 'power',
    platforms: ['darwin', 'win32'],
  },
  {
    id: 'volume-up',
    name: '增加音量',
    description: '增加系统音量',
    keywords: ['音量', '增加音量', 'volume up', '音量+', '声音'],
    group: 'audio',
    platforms: ['darwin', 'win32'],
  },
  {
    id: 'volume-down',
    name: '降低音量',
    description: '降低系统音量',
    keywords: ['音量', '降低音量', 'volume down', '音量-', '声音'],
    group: 'audio',
    platforms: ['darwin', 'win32'],
  },
  {
    id: 'mute-toggle',
    name: '静音切换',
    description: '静音或恢复系统声音',
    keywords: ['静音', 'mute', 'mute toggle', '无声', '关闭声音'],
    group: 'audio',
    platforms: ['darwin', 'win32'],
  },
  {
    id: 'brightness-up',
    name: '增加亮度',
    description: '增加屏幕亮度',
    keywords: ['亮度', '增加亮度', 'brightness up', '亮度+'],
    group: 'display',
    platforms: ['darwin'],
  },
  {
    id: 'brightness-down',
    name: '降低亮度',
    description: '降低屏幕亮度',
    keywords: ['亮度', '降低亮度', 'brightness down', '亮度-'],
    group: 'display',
    platforms: ['darwin'],
  },
  {
    id: 'open-main-window',
    name: '打开主窗口',
    description: '显示并激活 Tuff 主窗口',
    keywords: ['主窗口', '打开', 'main window', 'show window', '显示窗口', 'tuff', '窗口'],
    group: 'window',
    platforms: ['darwin', 'win32'],
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

function availableActions(platform = currentPlatform()) {
  return ACTIONS.filter(action => action.platforms.includes(platform))
}

function buildSearchTokens(action) {
  return Array.from(
    new Set(
      [action.id, action.name, action.description, ...action.keywords]
        .map(value => normalizeText(value).toLowerCase())
        .flatMap(value => [value, value.replace(/\s+/g, '')])
        .filter(Boolean),
    ),
  )
}

function matchActions(actions, query) {
  const keyword = normalizeText(query).toLowerCase()
  if (!keyword)
    return actions
  const compact = keyword.replace(/\s+/g, '')
  return actions.filter(action =>
    buildSearchTokens(action).some(token => token.includes(keyword) || token.includes(compact)),
  )
}

function groupOrder(actions) {
  return GROUP_ORDER.filter(group => actions.some(action => action.group === group))
}

function buildItem({ id, featureId, title, subtitle, actionId }) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      ...(actionId ? { defaultAction: FEATURE_ID } : {}),
    })

  if (actionId)
    builder.createAndAddAction(RUN_ACTION_ID, 'plugin', `执行${title}`, { actionId })
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
    return blocked('cancelled', '操作已取消', 'cancelled')
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT')
    return blocked('timeout', '系统操作执行超时', 'failed')
  return blocked('system-action-failed', '系统操作执行失败', 'failed')
}

async function runAction(actionId) {
  const platformActions = availableActions()
  const action = platformActions.find(candidate => candidate.id === actionId)
  if (!action || !ACTION_IDS.has(actionId))
    return blocked('invalid-action', '无效系统操作')
  if (!system || typeof system.runAction !== 'function')
    return blocked('system-capability-unavailable', '系统操作能力不可用')

  try {
    const result = await system.runAction(action.id)
    if (result?.status === 'started') {
      return {
        externalAction: true,
        success: true,
        status: 'started',
      }
    }
    if (result?.status === 'blocked') {
      const reason = normalizeText(result.reason) || 'blocked'
      const message = reason === 'confirmation-denied'
        ? '操作已取消'
        : reason === 'permission-denied'
          ? '缺少 system.shell 权限'
          : reason === 'permission-unavailable'
            ? '权限系统不可用'
            : reason === 'platform-unsupported'
              ? '当前平台暂不支持该系统操作'
              : '系统操作不可用'
      return blocked(reason, message, reason === 'confirmation-denied' ? 'cancelled' : 'blocked')
    }
    return blocked('execution-failed', '系统操作执行失败', 'failed')
  }
  catch (error) {
    const failure = stableFailure(error)
    logger?.error?.(`[touch-system-actions] ${failure.reason}`)
    return failure
  }
}

function selectedActionId(item, context) {
  if (!item?.meta || item.meta.defaultAction !== FEATURE_ID)
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

    const actions = availableActions()
    if (actions.length === 0) {
      await publishItems([
        buildItem({
          id: `${featureId}-unsupported`,
          featureId,
          title: '当前平台暂不支持系统操作',
          subtitle: `platform:${currentPlatform()}`,
        }),
      ])
      return true
    }

    const keyword = getQueryText(query)
    const matched = matchActions(actions, keyword)
    const items = []
    for (const group of groupOrder(matched)) {
      const meta = GROUP_META[group]
      items.push(
        buildItem({
          id: `${featureId}-section-${group}`,
          featureId,
          title: meta.title,
          subtitle: meta.subtitle,
        }),
      )
      for (const action of matched.filter(candidate => candidate.group === group)) {
        items.push(
          buildItem({
            id: `${featureId}-${action.id}`,
            featureId,
            title: action.name,
            subtitle: action.description,
            actionId: action.id,
          }),
        )
      }
    }

    if (items.length === 0) {
      items.push(
        buildItem({
          id: `${featureId}-empty`,
          featureId,
          title: '没有匹配的系统操作',
          subtitle: '可尝试输入：关机 / 重启 / 锁屏 / 音量 / 亮度 / 主窗口',
        }),
      )
    }
    await publishItems(items)
    return true
  },

  async onItemAction(item, context = {}) {
    const actionId = selectedActionId(item, context)
    if (!actionId)
      return blocked('invalid-action', '无效系统操作')
    return await runAction(actionId)
  },

  async onDestroy() {},
}

module.exports = pluginLifecycle
