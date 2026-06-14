const { plugin, logger, TuffItemBuilder, permission, dialog, features } = globalThis
const process = require('node:process')

let spawnShellCommand
try {
  ;({ spawnShellCommand } = require('@talex-touch/utils/common/utils/safe-shell'))
}
catch {
  spawnShellCommand = null
}

const SHELL_UNSAFE_PATTERN = /[\0\r\n]/

const PLUGIN_NAME = 'touch-quick-actions'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'quick-actions'
const DYNAMIC_FEATURE_PREFIX = 'quick-action-'
const SHELL_PERMISSION_ID = 'system.shell'
const PERMISSION_REASON = '需要 system.shell 权限执行系统快捷动作'
const COMMON_ACTION_IDS = ['restart', 'shutdown', 'lock-screen', 'mute-toggle', 'focus-settings']
const SHELL_STATUS_LABELS = {
  'available': '可用',
  'permission-missing': '缺少权限',
  'unsupported': '不可用',
}
let dynamicFeaturesInitialized = false

const GROUP_META = {
  instant: {
    title: '即时动作',
    subtitle: '锁屏 / 静音 / 专注模式',
  },
  settings: {
    title: '系统设置',
    subtitle: '通知 / 声音 / 显示',
  },
}

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

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
}

function resolvePlatformFlags(platform = process.platform) {
  return {
    win32: platform === 'win32',
    darwin: platform === 'darwin',
    linux: platform === 'linux',
  }
}

function isShellPlatformSupported(platform = process.platform) {
  return platform === 'win32' || platform === 'darwin'
}

function resolveShellStatus(platform = process.platform) {
  if (!isShellPlatformSupported(platform)) {
    return {
      status: 'unsupported',
      reason: `platform:${platform}`,
    }
  }

  if (!spawnShellCommand) {
    return {
      status: 'unsupported',
      reason: 'safe-shell-unavailable',
    }
  }

  return {
    status: 'available',
  }
}

function resolveActionCommandKind(action) {
  const command = normalizeText(action?.command).toLowerCase()
  if (command.includes('powershell'))
    return 'powershell'
  return 'fixed-shell'
}

async function checkPermissionStatus(permissionId) {
  if (!permission?.check) {
    return {
      granted: false,
      reason: 'permission-sdk-unavailable',
    }
  }

  try {
    return {
      granted: Boolean(await permission.check(permissionId)),
    }
  }
  catch (error) {
    logger?.warn?.('[touch-quick-actions] Failed to check permission', error)
    return {
      granted: false,
      reason: 'permission-check-failed',
    }
  }
}

async function resolveShellCapabilityState(platform = process.platform) {
  const shellStatus = resolveShellStatus(platform)
  if (shellStatus.status !== 'available')
    return shellStatus

  const permissionStatus = await checkPermissionStatus(SHELL_PERMISSION_ID)
  if (!permissionStatus.granted) {
    return {
      status: 'permission-missing',
      reason: permissionStatus.reason || 'system-shell-permission-required',
    }
  }

  return shellStatus
}

function formatShellStatusSubtitle(state) {
  const label = SHELL_STATUS_LABELS[state.status] || state.status
  return state.reason ? `${label} · ${state.reason}` : label
}

function buildShellCapability({
  featureId,
  actionId,
  commandKind = 'fixed-shell',
  requiresConfirmation = false,
  requiresAdmin = false,
  platform = process.platform,
  status,
  reason,
} = {}) {
  const resolved = status ? { status, reason } : resolveShellStatus(platform)
  const capability = {
    id: SHELL_PERMISSION_ID,
    type: 'shell',
    platform,
    permission: SHELL_PERMISSION_ID,
    status: resolved.status,
    audit: {
      pluginName: PLUGIN_NAME,
      featureId,
      actionId,
      commandKind,
      requiresConfirmation: Boolean(requiresConfirmation),
      requiresAdmin: Boolean(requiresAdmin),
    },
  }

  if (resolved.reason)
    capability.reason = resolved.reason

  return capability
}

function buildActionCapability(featureId, action, platform = process.platform, capabilityState) {
  const confirmLevel = Number(action?.confirmLevel || 0)
  const resolvedState = capabilityState || resolveShellStatus(platform)
  return buildShellCapability({
    featureId,
    actionId: action?.id,
    commandKind: resolveActionCommandKind(action),
    requiresConfirmation: confirmLevel > 0,
    requiresAdmin: confirmLevel >= 2,
    platform,
    status: resolvedState.status,
    reason: resolvedState.reason,
  })
}

async function ensurePermission(permissionId, reason) {
  if (!permission?.check || !permission?.request)
    return { granted: false, reason: 'permission-sdk-unavailable' }

  try {
    const hasPermission = await permission.check(permissionId)
    if (hasPermission)
      return { granted: true, reason: '' }

    const granted = await permission.request(permissionId, reason)
    return granted
      ? { granted: true, reason: '' }
      : { granted: false, reason: 'permission-denied' }
  }
  catch (error) {
    logger?.warn?.('[touch-quick-actions] Failed to request permission', error)
    return { granted: false, reason: 'permission-request-failed' }
  }
}

function resolveActions(platform = process.platform) {
  if (platform === 'darwin') {
    return [
      {
        id: 'restart',
        name: '重启',
        description: '立即重启系统（高风险）',
        group: 'instant',
        keywords: ['restart', 'reboot', '重启', '重新启动'],
        confirmLevel: 2,
        command: 'osascript -e \'tell app "System Events" to restart\'',
      },
      {
        id: 'shutdown',
        name: '关机',
        description: '立即关闭系统（高风险）',
        group: 'instant',
        keywords: ['shutdown', 'power off', '关机', '关闭电脑'],
        confirmLevel: 2,
        command: 'osascript -e \'tell app "System Events" to shut down\'',
      },
      {
        id: 'lock-screen',
        name: '锁定屏幕',
        description: '立即锁屏',
        group: 'instant',
        keywords: ['lock', '锁屏', '锁定'],
        command: 'pmset displaysleepnow',
      },
      {
        id: 'mute-toggle',
        name: '静音切换',
        description: '切换系统静音状态',
        group: 'instant',
        keywords: ['mute', '静音', '声音'],
        command: 'osascript -e \'set volume output muted not (output muted of (get volume settings))\'',
      },
      {
        id: 'focus-settings',
        name: '专注模式设置',
        description: '打开专注模式设置',
        group: 'instant',
        keywords: ['focus', 'dnd', '勿扰', '专注'],
        command: 'open "x-apple.systempreferences:com.apple.Focus"',
      },
      {
        id: 'notification-settings',
        name: '通知设置',
        description: '打开通知设置页',
        group: 'settings',
        keywords: ['notification', '通知'],
        command: 'open "x-apple.systempreferences:com.apple.preference.notifications"',
      },
      {
        id: 'sound-settings',
        name: '声音设置',
        description: '打开声音设置页',
        group: 'settings',
        keywords: ['sound', '声音', '音量'],
        command: 'open "x-apple.systempreferences:com.apple.preference.sound"',
      },
      {
        id: 'display-settings',
        name: '显示设置',
        description: '打开显示设置页',
        group: 'settings',
        keywords: ['display', '显示', '亮度'],
        command: 'open "x-apple.systempreferences:com.apple.preference.displays"',
      },
    ]
  }

  if (platform === 'win32') {
    return [
      {
        id: 'restart',
        name: '重启',
        description: '立即重启系统（高风险）',
        group: 'instant',
        keywords: ['restart', 'reboot', '重启', '重新启动'],
        confirmLevel: 2,
        command: 'shutdown /r /t 0',
      },
      {
        id: 'shutdown',
        name: '关机',
        description: '立即关闭系统（高风险）',
        group: 'instant',
        keywords: ['shutdown', 'power off', '关机', '关闭电脑'],
        confirmLevel: 2,
        command: 'shutdown /s /t 0',
      },
      {
        id: 'lock-screen',
        name: '锁定屏幕',
        description: '立即锁屏',
        group: 'instant',
        keywords: ['lock', '锁屏', '锁定'],
        command: 'rundll32.exe user32.dll,LockWorkStation',
      },
      {
        id: 'mute-toggle',
        name: '静音切换',
        description: '切换系统静音状态',
        group: 'instant',
        keywords: ['mute', '静音', '声音'],
        command: 'powershell -NoProfile -Command "$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]173)"',
      },
      {
        id: 'focus-settings',
        name: '专注模式设置',
        description: '打开专注模式设置',
        group: 'instant',
        keywords: ['focus', 'dnd', '勿扰', '专注'],
        command: 'powershell -NoProfile -Command "Start-Process ms-settings:quiethours"',
      },
      {
        id: 'notification-settings',
        name: '通知设置',
        description: '打开通知设置页',
        group: 'settings',
        keywords: ['notification', '通知'],
        command: 'powershell -NoProfile -Command "Start-Process ms-settings:notifications"',
      },
      {
        id: 'sound-settings',
        name: '声音设置',
        description: '打开声音设置页',
        group: 'settings',
        keywords: ['sound', '声音', '音量'],
        command: 'powershell -NoProfile -Command "Start-Process ms-settings:sound"',
      },
      {
        id: 'display-settings',
        name: '显示设置',
        description: '打开显示设置页',
        group: 'settings',
        keywords: ['display', '显示', '亮度'],
        command: 'powershell -NoProfile -Command "Start-Process ms-settings:display"',
      },
    ]
  }

  return []
}

async function runShellCommand(command) {
  const normalizedCommand = normalizeText(command)
  if (!normalizedCommand) {
    throw new Error('empty-command')
  }
  if (SHELL_UNSAFE_PATTERN.test(String(command ?? ''))) {
    throw new Error('unsafe-command-payload')
  }
  if (!spawnShellCommand) {
    throw new Error('safe-shell-unavailable')
  }

  await new Promise((resolve, reject) => {
    const child = spawnShellCommand(normalizedCommand, { windowsHide: true })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code && code !== 0)
        reject(new Error(`command failed with code ${code}`))
      else
        resolve()
    })
  })
}

function matchActions(actions, keyword) {
  const list = Array.isArray(actions) ? actions : []
  const target = normalizeText(keyword).toLowerCase()
  if (!target)
    return list

  return list.filter((action) => {
    const haystack = [
      action.name,
      action.description,
      ...(Array.isArray(action.keywords) ? action.keywords : []),
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(target)
  })
}

function resolveGroupOrder(actions) {
  const list = Array.isArray(actions) ? actions : []
  const groups = []

  if (list.some(action => action.group === 'instant'))
    groups.push('instant')
  if (list.some(action => action.group === 'settings'))
    groups.push('settings')

  return groups
}

function resolveCommonActions(actions) {
  const list = Array.isArray(actions) ? actions : []
  const map = new Map(list.map(action => [action.id, action]))
  const common = COMMON_ACTION_IDS
    .map(id => map.get(id))
    .filter(Boolean)

  if (common.length > 0)
    return common

  return list.slice(0, 6)
}

function collectActionKeywords(action) {
  const values = [
    action?.id,
    action?.name,
    action?.description,
    ...(Array.isArray(action?.keywords) ? action.keywords : []),
  ]
    .map(value => normalizeText(value).toLowerCase())
    .filter(Boolean)

  return Array.from(new Set(values))
}

function buildDynamicFeatures(actions, platform = process.platform) {
  const list = Array.isArray(actions) ? actions : []
  const platformFlags = resolvePlatformFlags(platform)

  return list.map((action) => {
    const keywords = collectActionKeywords(action)
    return {
      id: `${DYNAMIC_FEATURE_PREFIX}${action.id}`,
      name: action.name,
      desc: action.description,
      icon: ICON,
      keywords,
      push: false,
      priority: 8,
      acceptedInputTypes: ['text'],
      platform: platformFlags,
      commands: [
        {
          type: 'contain',
          value: keywords,
        },
      ],
      meta: {
        capability: buildActionCapability(`${DYNAMIC_FEATURE_PREFIX}${action.id}`, action, platform),
      },
    }
  })
}

function resolveActionFromFeatureId(featureId, actions) {
  const list = Array.isArray(actions) ? actions : []
  const normalizedFeatureId = normalizeText(featureId)

  if (!normalizedFeatureId.startsWith(DYNAMIC_FEATURE_PREFIX))
    return null

  const actionId = normalizedFeatureId.slice(DYNAMIC_FEATURE_PREFIX.length)
  if (!actionId)
    return null

  return list.find(action => action.id === actionId) || null
}

function resolveActionForExecution(payloadAction, platform = process.platform) {
  const actionId = normalizeText(payloadAction?.id)
  if (!actionId)
    return null
  return resolveActions(platform).find(action => action.id === actionId) || null
}

function registerDynamicFeatures(actions, platform = process.platform) {
  if (dynamicFeaturesInitialized)
    return 0

  if (!features || typeof features.addFeature !== 'function') {
    dynamicFeaturesInitialized = true
    return 0
  }

  let addedCount = 0
  const dynamicFeatures = buildDynamicFeatures(actions, platform)
  dynamicFeatures.forEach((feature) => {
    if (typeof features.getFeature === 'function' && features.getFeature(feature.id))
      return

    if (features.addFeature(feature))
      addedCount += 1
  })

  dynamicFeaturesInitialized = true
  return addedCount
}

function buildInfoItem({ id, featureId, title, subtitle, capability }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      ...(capability ? { capability } : {}),
    })
    .build()
}

function buildActionItem({ id, featureId, title, subtitle, actionId, payload, capability }) {
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
      ...(capability ? { capability } : {}),
    })
    .build()
}

function buildSectionHeader(featureId, groupId) {
  const meta = GROUP_META[groupId] || { title: groupId, subtitle: '' }
  return buildInfoItem({
    id: `${featureId}-section-${groupId}`,
    featureId,
    title: meta.title,
    subtitle: meta.subtitle,
  })
}

async function executeAction(action) {
  await runShellCommand(action.command)
}

async function runActionWithGuards(action) {
  if (!action || typeof action.command !== 'string') {
    return {
      status: 'blocked',
      reason: 'invalid-action',
      message: '无效动作',
    }
  }

  const normalizedCommand = normalizeText(action.command)
  if (!normalizedCommand) {
    return {
      status: 'blocked',
      reason: 'empty-command',
      message: '命令为空',
    }
  }

  if (SHELL_UNSAFE_PATTERN.test(action.command)) {
    return {
      status: 'blocked',
      reason: 'unsafe-command-payload',
      message: '命令载荷不安全',
    }
  }

  const shellStatus = resolveShellStatus(process.platform)
  if (shellStatus.status !== 'available') {
    return {
      status: 'blocked',
      reason: shellStatus.reason || shellStatus.status,
      message: '系统快捷动作不可用',
    }
  }

  const permissionState = await ensurePermission(SHELL_PERMISSION_ID, PERMISSION_REASON)
  if (!permissionState.granted) {
    return {
      status: 'blocked',
      reason: permissionState.reason,
      message: permissionState.reason === 'permission-sdk-unavailable'
        ? '权限系统不可用，无法执行系统快捷动作'
        : '缺少 system.shell 权限',
    }
  }

  const confirmed = await confirmDangerAction(action)
  if (!confirmed) {
    return {
      status: 'cancelled',
      reason: 'user-cancelled',
      message: '操作已取消',
    }
  }

  try {
    await executeAction(action)
    return {
      status: 'started',
    }
  }
  catch (error) {
    logger?.error?.('[touch-quick-actions] Action failed', error)
    return {
      status: 'failed',
      reason: error?.message || 'execution-failed',
      message: error?.message || '执行失败',
    }
  }
}

async function confirmDangerAction(action) {
  const level = Number(action?.confirmLevel || 0)
  if (level <= 0)
    return true
  if (!dialog?.showMessageBox)
    return false

  const actionName = action?.name || '该操作'
  for (let step = 1; step <= level; step += 1) {
    const result = await dialog.showMessageBox({
      type: 'warning',
      title: `确认${actionName}`,
      message: step === 1 ? `确定要执行${actionName}吗？` : `请再次确认执行${actionName}`,
      detail: '该操作会立即影响系统状态，请确认你已保存当前工作内容。',
      buttons: ['取消', '确定'],
      defaultId: 0,
      cancelId: 0,
    })
    if (result?.response !== 1)
      return false
  }

  return true
}

const pluginLifecycle = {
  onInit() {
    const actions = resolveActions(process.platform)
    const addedCount = registerDynamicFeatures(actions, process.platform)

    if (addedCount > 0) {
      logger?.info?.(`[touch-quick-actions] Registered ${addedCount} dynamic features`)
    }
  },

  async onFeatureTriggered(featureId, query) {
    const actions = resolveActions(process.platform)
    const dynamicAction = resolveActionFromFeatureId(featureId, actions)
    if (dynamicAction) {
      const result = await runActionWithGuards(dynamicAction)
      return {
        externalAction: true,
        status: result.status,
        reason: result.reason,
        success: result.status === 'started',
        message: result.message,
      }
    }

    if (featureId !== ACTION_ID)
      return false

    try {
      const shellCapabilityState = await resolveShellCapabilityState(process.platform)
      if (shellCapabilityState.status !== 'available') {
        const isPermissionMissing = shellCapabilityState.status === 'permission-missing'
        plugin.feature.clearItems()
        plugin.feature.pushItems([
          buildInfoItem({
            id: isPermissionMissing ? `${featureId}-no-permission` : `${featureId}-unsupported`,
            featureId,
            title: isPermissionMissing ? `缺少 ${SHELL_PERMISSION_ID} 权限` : '当前平台暂不支持系统快捷动作',
            subtitle: isPermissionMissing ? '授权后可执行锁屏、静音与系统设置动作' : formatShellStatusSubtitle(shellCapabilityState),
            capability: buildShellCapability({
              featureId,
              actionId: 'list-actions',
              platform: process.platform,
              status: shellCapabilityState.status,
              reason: shellCapabilityState.reason,
            }),
          }),
        ])
        return true
      }

      const keyword = normalizeText(getQueryText(query))
      const items = []

      if (!keyword) {
        resolveCommonActions(actions).forEach((action, index) => {
          items.push(buildActionItem({
            id: `${featureId}-common-${index}`,
            featureId,
            title: action.name,
            subtitle: action.description,
            actionId: 'run-action',
            payload: {
              action,
            },
            capability: buildActionCapability(featureId, action, process.platform, shellCapabilityState),
          }))
        })
      }
      else {
        const matched = matchActions(actions, keyword)
        const order = resolveGroupOrder(matched)
        order.forEach((groupId) => {
          items.push(buildSectionHeader(featureId, groupId))
          matched
            .filter(action => action.group === groupId)
            .forEach((action, index) => {
              items.push(buildActionItem({
                id: `${featureId}-${groupId}-${index}`,
                featureId,
                title: action.name,
                subtitle: action.description,
                actionId: 'run-action',
                payload: {
                  action,
                },
                capability: buildActionCapability(featureId, action, process.platform, shellCapabilityState),
              }))
            })
        })
      }

      if (!items.length) {
        items.push(buildInfoItem({
          id: `${featureId}-empty`,
          featureId,
          title: '暂无匹配动作',
          subtitle: keyword ? `没有匹配“${keyword}”的系统快捷动作` : '当前平台暂无可用动作',
        }))
      }

      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      logger?.error?.('[touch-quick-actions] Failed to handle feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-error`,
          featureId,
          title: '系统快捷动作加载失败',
          subtitle: truncateText(error?.message || '未知错误', 120),
        }),
      ])
      return true
    }
  },

  async onItemAction(item) {
    if (item?.meta?.defaultAction !== ACTION_ID)
      return

    const actionId = item.meta?.actionId
    if (actionId !== 'run-action')
      return

    const action = resolveActionForExecution(item.meta?.payload?.action)
    const result = await runActionWithGuards(action)

    return {
      externalAction: true,
      status: result.status,
      reason: result.reason,
      success: result.status === 'started',
      message: result.message,
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    buildActionCapability,
    buildDynamicFeatures,
    buildShellCapability,
    checkPermissionStatus,
    confirmDangerAction,
    formatShellStatusSubtitle,
    isShellPlatformSupported,
    matchActions,
    resolveActionFromFeatureId,
    resolveActionForExecution,
    resolveCommonActions,
    resolveActions,
    resolveGroupOrder,
    resolveShellCapabilityState,
    resolveShellStatus,
    runActionWithGuards,
    runShellCommand,
    setSpawnShellCommandForTest(runner) {
      spawnShellCommand = runner
    },
  },
}
