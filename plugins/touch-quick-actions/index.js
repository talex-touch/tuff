const { plugin, logger, TuffItemBuilder, features, system, platform: hostPlatform } = globalThis

const PLUGIN_NAME = 'touch-quick-actions'
const SOURCE_ID = 'plugin-features'
const FEATURE_ID = 'quick-actions'
const DYNAMIC_FEATURE_PREFIX = 'quick-action-'
const ACTION_ID = 'quick-actions'
const RUN_ACTION_ID = 'run-action'
const ICON = { type: 'class', value: 'i-ri-settings-3-line' }
const COMMON_ACTION_IDS = ['restart', 'shutdown', 'lock-screen', 'mute-toggle', 'focus-settings']
const ACTIONS = [
  {
    id: 'restart',
    name: '重启',
    description: '立即重启系统（高风险）',
    group: 'instant',
    keywords: ['restart', 'reboot', '重启', '重新启动'],
  },
  {
    id: 'shutdown',
    name: '关机',
    description: '立即关闭系统（高风险）',
    group: 'instant',
    keywords: ['shutdown', 'power off', '关机', '关闭电脑'],
  },
  {
    id: 'lock-screen',
    name: '锁定屏幕',
    description: '立即锁屏',
    group: 'instant',
    keywords: ['lock', '锁屏', '锁定'],
  },
  {
    id: 'mute-toggle',
    name: '静音切换',
    description: '切换系统静音状态',
    group: 'instant',
    keywords: ['mute', '静音', '声音'],
  },
  {
    id: 'focus-settings',
    name: '专注模式设置',
    description: '打开专注模式设置',
    group: 'instant',
    keywords: ['focus', 'dnd', '勿扰', '专注'],
  },
  {
    id: 'notification-settings',
    name: '通知设置',
    description: '打开通知设置页',
    group: 'settings',
    keywords: ['notification', '通知'],
  },
  {
    id: 'sound-settings',
    name: '声音设置',
    description: '打开声音设置页',
    group: 'settings',
    keywords: ['sound', '声音', '音量'],
  },
  {
    id: 'display-settings',
    name: '显示设置',
    description: '打开显示设置页',
    group: 'settings',
    keywords: ['display', '显示', '亮度'],
  },
]
const ACTION_IDS = new Set(ACTIONS.map(action => action.id))
const GROUP_META = {
  instant: { title: '即时动作', subtitle: '锁屏 / 静音 / 专注模式' },
  settings: { title: '系统设置', subtitle: '通知 / 声音 / 显示' },
}
let dynamicFeaturesInitialized = false

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  return typeof query === 'string' ? query : (query?.text ?? '')
}

function currentPlatform() {
  return typeof hostPlatform?.platform === 'string' ? hostPlatform.platform : 'unsupported'
}

function platformFlags(value = currentPlatform()) {
  const availability = enabled => ({ enable: enabled, arch: [], os: [] })
  return {
    win: availability(value === 'win32'),
    darwin: availability(value === 'darwin'),
    linux: availability(value === 'linux'),
  }
}

function resolveActions(value = currentPlatform()) {
  return value === 'darwin' || value === 'win32' ? ACTIONS : []
}

function actionById(actionId, value = currentPlatform()) {
  const normalized = normalizeText(actionId)
  if (!ACTION_IDS.has(normalized))
    return null
  return resolveActions(value).find(action => action.id === normalized) || null
}

function collectKeywords(action) {
  return Array.from(
    new Set(
      [action.id, action.name, action.description, ...action.keywords]
        .map(value => normalizeText(value).toLowerCase())
        .filter(Boolean),
    ),
  )
}

function buildDynamicFeatures(actions, value = currentPlatform()) {
  return actions.map(action => ({
    id: `${DYNAMIC_FEATURE_PREFIX}${action.id}`,
    name: action.name,
    desc: action.description,
    icon: ICON,
    keywords: collectKeywords(action),
    push: false,
    priority: 8,
    acceptedInputTypes: ['text'],
    platform: platformFlags(value),
    commands: [{ type: 'contain', value: collectKeywords(action) }],
  }))
}

async function registerDynamicFeatures(actions, value = currentPlatform()) {
  if (dynamicFeaturesInitialized)
    return 0
  if (!features || typeof features.addFeature !== 'function')
    throw new Error('PLUGIN_QUICK_ACTIONS_FEATURES_UNAVAILABLE')

  let added = 0
  for (const feature of buildDynamicFeatures(actions, value)) {
    if (await features.addFeature(feature))
      added += 1
  }
  dynamicFeaturesInitialized = true
  return added
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
      ...(actionId ? { defaultAction: ACTION_ID } : {}),
    })
  if (actionId) {
    builder.createAndAddAction(RUN_ACTION_ID, 'plugin', `执行${title}`, { actionId })
  }
  return builder.build()
}

async function publishItems(items) {
  await plugin.feature.clearItems()
  await plugin.feature.pushItems(items)
}

function matchActions(actions, keyword) {
  const target = normalizeText(keyword).toLowerCase()
  if (!target)
    return actions
  return actions.filter(action =>
    [action.id, action.name, action.description, ...action.keywords].join(' ').toLowerCase().includes(target),
  )
}

function commonActions(actions) {
  const byId = new Map(actions.map(action => [action.id, action]))
  return COMMON_ACTION_IDS.map(id => byId.get(id)).filter(Boolean)
}

function groupOrder(actions) {
  const groups = []
  if (actions.some(action => action.group === 'instant'))
    groups.push('instant')
  if (actions.some(action => action.group === 'settings'))
    groups.push('settings')
  return groups
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
    return blocked('timeout', '系统动作执行超时', 'failed')
  return blocked('system-action-failed', '系统动作执行失败', 'failed')
}

async function runAction(actionId) {
  const action = actionById(actionId)
  if (!action)
    return blocked('invalid-action', '无效动作')
  if (!system || typeof system.runAction !== 'function')
    return blocked('system-capability-unavailable', '系统快捷动作不可用')

  try {
    const result = await system.runAction(action.id)
    if (result?.status === 'started') {
      return { externalAction: true, success: true, status: 'started' }
    }
    if (result?.status === 'blocked') {
      const message
        = result.reason === 'confirmation-denied'
          ? '操作已取消'
          : result.reason === 'platform-unsupported'
            ? '当前平台暂不支持系统快捷动作'
            : '系统快捷动作不可用'
      return blocked(result.reason || 'blocked', message)
    }
    return blocked('execution-failed', '系统动作执行失败', 'failed')
  }
  catch (error) {
    const failure = stableFailure(error)
    logger?.error?.(`[touch-quick-actions] ${failure.reason}`)
    return failure
  }
}

function dynamicActionId(featureId) {
  const normalized = normalizeText(featureId)
  if (!normalized.startsWith(DYNAMIC_FEATURE_PREFIX))
    return ''
  const actionId = normalized.slice(DYNAMIC_FEATURE_PREFIX.length)
  return ACTION_IDS.has(actionId) ? actionId : ''
}

const pluginLifecycle = {
  async onInit() {
    const actions = resolveActions()
    const added = await registerDynamicFeatures(actions)
    if (added > 0)
      logger?.info?.(`[touch-quick-actions] Registered ${added} dynamic features`)
  },

  async onFeatureTriggered(featureId, query) {
    const directActionId = dynamicActionId(featureId)
    if (directActionId)
      return await runAction(directActionId)
    if (featureId !== FEATURE_ID)
      return false

    const actions = resolveActions()
    if (actions.length === 0) {
      await publishItems([
        buildItem({
          id: `${featureId}-unsupported`,
          featureId,
          title: '当前平台暂不支持系统快捷动作',
          subtitle: `platform:${currentPlatform()}`,
        }),
      ])
      return true
    }

    const keyword = normalizeText(getQueryText(query))
    const items = []
    if (!keyword) {
      commonActions(actions).forEach((action, index) => {
        items.push(
          buildItem({
            id: `${featureId}-common-${index}`,
            featureId,
            title: action.name,
            subtitle: action.description,
            actionId: action.id,
          }),
        )
      })
    }
    else {
      const matched = matchActions(actions, keyword)
      for (const groupId of groupOrder(matched)) {
        const meta = GROUP_META[groupId]
        items.push(
          buildItem({
            id: `${featureId}-section-${groupId}`,
            featureId,
            title: meta.title,
            subtitle: meta.subtitle,
          }),
        )
        matched
          .filter(action => action.group === groupId)
          .forEach((action, index) => {
            items.push(
              buildItem({
                id: `${featureId}-${groupId}-${index}`,
                featureId,
                title: action.name,
                subtitle: action.description,
                actionId: action.id,
              }),
            )
          })
      }
    }

    if (items.length === 0) {
      items.push(
        buildItem({
          id: `${featureId}-empty`,
          featureId,
          title: '暂无匹配动作',
          subtitle: `没有匹配“${keyword}”的系统快捷动作`,
        }),
      )
    }
    await publishItems(items)
    return true
  },

  async onItemAction(item, context = {}) {
    if (!item?.meta || item.meta.defaultAction !== ACTION_ID)
      return
    const selectedActionId = context.actionId || item.actions?.[0]?.id
    if (selectedActionId !== RUN_ACTION_ID)
      return
    const selectedAction = item.actions?.find?.(action => action?.id === selectedActionId)
    return await runAction(selectedAction?.payload?.actionId)
  },

  onDestroy() {
    dynamicFeaturesInitialized = false
  },
}

module.exports = pluginLifecycle
