const { plugin, logger, TuffItemBuilder, permission } = globalThis
const { exec } = require('node:child_process')
const process = require('node:process')
const { promisify } = require('node:util')

const execAsync = promisify(exec)

const PLUGIN_NAME = 'touch-quick-actions'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'quick-actions'

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

async function ensurePermission(permissionId, reason) {
  if (!permission)
    return true

  const hasPermission = await permission.check(permissionId)
  if (hasPermission)
    return true

  const granted = await permission.request(permissionId, reason)
  return Boolean(granted)
}

function resolveActions(platform = process.platform) {
  if (platform === 'darwin') {
    return [
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
        command: "osascript -e 'set volume output muted not (output muted of (get volume settings))'",
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
  await execAsync(action.command)
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const hasPermission = await ensurePermission('system.shell', '需要 system.shell 权限执行系统快捷动作')
      if (!hasPermission) {
        plugin.feature.clearItems()
        plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-no-permission`,
            featureId,
            title: '缺少 system.shell 权限',
            subtitle: '授权后可执行锁屏、静音与系统设置动作',
          }),
        ])
        return true
      }

      const keyword = normalizeText(getQueryText(query))
      const actions = resolveActions(process.platform)
      const matched = matchActions(actions, keyword)
      const order = resolveGroupOrder(matched)

      const items = []
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
            }))
          })
      })

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

    const action = item.meta?.payload?.action
    if (!action || typeof action.command !== 'string')
      return

    const hasPermission = await ensurePermission('system.shell', '需要 system.shell 权限执行系统快捷动作')
    if (!hasPermission)
      return

    try {
      await executeAction(action)
      return { externalAction: true }
    }
    catch (error) {
      logger?.error?.('[touch-quick-actions] Action failed', error)
      return {
        externalAction: true,
        success: false,
        message: error?.message || '执行失败',
      }
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    matchActions,
    resolveActions,
    resolveGroupOrder,
  },
}
