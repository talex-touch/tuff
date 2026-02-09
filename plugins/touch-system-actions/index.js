const { plugin, logger, TuffItemBuilder, permission, dialog, openUrl } = globalThis
const { exec } = require('node:child_process')
const process = require('node:process')
const { promisify } = require('node:util')

const execAsync = promisify(exec)
const PLUGIN_NAME = 'touch-system-actions'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'system-actions'
const GROUP_ORDER = ['power', 'audio', 'display', 'window']

const GROUP_META = {
  power: { title: '电源操作', subtitle: '关机 / 重启 / 锁屏' },
  audio: { title: '音量操作', subtitle: '音量+ / 音量- / 静音' },
  display: { title: '显示操作', subtitle: '亮度+ / 亮度-' },
  window: { title: '窗口操作', subtitle: '主窗口控制' },
}

let cachedActions = null
let pinyin = null

try {
  ;({ pinyin } = require('pinyin-pro'))
}
catch {
  pinyin = null
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

async function openSystemSettings() {
  if (process.platform === 'darwin') {
    if (typeof openUrl === 'function') {
      openUrl('x-apple.systempreferences:com.apple.preference.security')
      return
    }
    await execAsync('open "x-apple.systempreferences:com.apple.preference.security"')
    return
  }

  if (process.platform === 'win32') {
    if (typeof openUrl === 'function') {
      openUrl('ms-settings:')
      return
    }
    await execAsync('powershell -Command "Start-Process ms-settings:"')
  }
}

async function showPermissionError(actionName) {
  if (!dialog?.showMessageBox)
    return

  const result = await dialog.showMessageBox({
    type: 'warning',
    title: '权限不足',
    message: `执行"${actionName}"操作可能需要更高权限`,
    detail: '请以管理员身份运行应用，或手动执行该操作。',
    buttons: ['确定', '打开系统设置'],
    defaultId: 0,
    cancelId: 0,
  })

  if (result?.response === 1) {
    await openSystemSettings()
  }
}

async function confirmDangerAction(actionName, detail) {
  if (!dialog?.showMessageBox)
    return false

  const result = await dialog.showMessageBox({
    type: 'question',
    title: `确认${actionName}`,
    message: `确定要执行${actionName}吗？`,
    detail,
    buttons: ['取消', '确定'],
    defaultId: 0,
    cancelId: 0,
  })

  return result?.response === 1
}

function addTokensFromText(text, tokens) {
  const value = normalizeText(text)
  if (!value)
    return

  const lower = value.toLowerCase()
  tokens.add(lower)
  tokens.add(lower.replace(/\s+/g, ''))

  if (/[\u4E00-\u9FFF]/.test(value) && pinyin) {
    try {
      const full = pinyin(value, { toneType: 'none' }).replace(/\s/g, '').toLowerCase()
      if (full)
        tokens.add(full)
      const first = pinyin(value, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '').toLowerCase()
      if (first)
        tokens.add(first)
    }
    catch {}
  }
}

function buildSearchTokens(action) {
  const tokens = new Set()
  addTokensFromText(action.name, tokens)
  addTokensFromText(action.description, tokens)
  action.keywords.forEach(keyword => addTokensFromText(keyword, tokens))
  return Array.from(tokens)
}

function createActions(platform = process.platform) {
  const isMac = platform === 'darwin'
  const isWindows = platform === 'win32'
  const actions = []

  actions.push({
    id: 'shutdown',
    name: '关机',
    description: '关闭计算机',
    keywords: ['关机', '关闭', 'shutdown', 'power off', '关闭电脑'],
    group: 'power',
    requiresAdmin: true,
    execute: async () => {
      const confirmed = await confirmDangerAction('关机', '此操作会立即关闭计算机。')
      if (!confirmed)
        return

      if (isMac) {
        await execAsync('osascript -e \'tell app "System Events" to shut down\'')
      }
      else if (isWindows) {
        await execAsync('shutdown /s /t 0')
      }
    },
  })

  actions.push({
    id: 'restart',
    name: '重启',
    description: '重启计算机',
    keywords: ['重启', '重新启动', 'restart', 'reboot', '重启电脑'],
    group: 'power',
    requiresAdmin: true,
    execute: async () => {
      const confirmed = await confirmDangerAction('重启', '此操作会立即重启计算机。')
      if (!confirmed)
        return

      if (isMac) {
        await execAsync('osascript -e \'tell app "System Events" to restart\'')
      }
      else if (isWindows) {
        await execAsync('shutdown /r /t 0')
      }
    },
  })

  actions.push({
    id: 'lock-screen',
    name: '锁定屏幕',
    description: '立即锁屏',
    keywords: ['锁定', '锁屏', 'lock', 'lock screen', '锁定屏幕'],
    group: 'power',
    execute: async () => {
      if (isMac) {
        await execAsync('pmset displaysleepnow')
      }
      else if (isWindows) {
        await execAsync('rundll32.exe user32.dll,LockWorkStation')
      }
    },
  })

  actions.push({
    id: 'volume-up',
    name: '增加音量',
    description: '增加系统音量',
    keywords: ['音量', '增加音量', 'volume up', '音量+', '声音'],
    group: 'audio',
    execute: async () => {
      if (isMac) {
        await execAsync("osascript -e 'set volume output volume (output volume of (get volume settings) + 10)'")
      }
      else if (isWindows) {
        await execAsync("powershell -Command \"(New-Object -ComObject Shell.Application).NameSpace(17).ParseName('Volume Control').InvokeVerb('properties')\"")
      }
    },
  })

  actions.push({
    id: 'volume-down',
    name: '降低音量',
    description: '降低系统音量',
    keywords: ['音量', '降低音量', 'volume down', '音量-', '声音'],
    group: 'audio',
    execute: async () => {
      if (isMac) {
        await execAsync("osascript -e 'set volume output volume (output volume of (get volume settings) - 10)'")
      }
      else if (isWindows) {
        await execAsync("powershell -Command \"(New-Object -ComObject Shell.Application).NameSpace(17).ParseName('Volume Control').InvokeVerb('properties')\"")
      }
    },
  })

  actions.push({
    id: 'mute',
    name: '静音',
    description: '静音/取消静音',
    keywords: ['静音', 'mute', '无声', '关闭声音'],
    group: 'audio',
    execute: async () => {
      if (isMac) {
        await execAsync("osascript -e 'set volume output muted not (output muted of (get volume settings))'")
      }
      else if (isWindows) {
        await execAsync('powershell -Command "$wshShell = New-Object -ComObject WScript.Shell; $wshShell.SendKeys([char]173)"')
      }
    },
  })

  if (isMac) {
    actions.push({
      id: 'brightness-up',
      name: '增加亮度',
      description: '增加屏幕亮度',
      keywords: ['亮度', '增加亮度', 'brightness up', '亮度+'],
      group: 'display',
      execute: async () => {
        await execAsync('osascript -e \'tell application "System Events" to key code 144\'')
      },
    })

    actions.push({
      id: 'brightness-down',
      name: '降低亮度',
      description: '降低屏幕亮度',
      keywords: ['亮度', '降低亮度', 'brightness down', '亮度-'],
      group: 'display',
      execute: async () => {
        await execAsync('osascript -e \'tell application "System Events" to key code 145\'')
      },
    })
  }

  actions.push({
    id: 'open-main-window',
    name: '打开主窗口',
    description: '显示并激活 Tuff 主窗口',
    keywords: ['主窗口', '打开', 'main window', 'show window', '显示窗口', 'tuff', '窗口'],
    group: 'window',
    execute: async () => {
      const mainWindow = globalThis.$app?.window?.window
      if (!mainWindow) {
        throw new Error('主窗口不可用')
      }
      mainWindow.show()
      mainWindow.focus()
    },
  })

  return actions.map(action => ({
    ...action,
    searchTokens: buildSearchTokens(action),
  }))
}

function resolveActions(platform = process.platform) {
  if (cachedActions && cachedActions.platform === platform) {
    return cachedActions.items
  }

  const items = createActions(platform)
  cachedActions = { platform, items }
  return items
}

function matchActions(actions, keyword) {
  const text = normalizeText(keyword).toLowerCase()
  if (!text)
    return actions

  return actions.filter((action) => {
    if (action.name.toLowerCase().includes(text))
      return true

    return action.searchTokens.some(token => token.includes(text))
  })
}

function resolveGroupOrder(actions) {
  return GROUP_ORDER.filter(groupId => actions.some(action => action.group === groupId))
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

function buildSectionHeader(featureId, groupId) {
  const section = GROUP_META[groupId]
  return buildInfoItem({
    id: `${featureId}-section-${groupId}`,
    featureId,
    title: section?.title || groupId,
    subtitle: section?.subtitle || '',
  })
}

function buildActionItem(featureId, action) {
  return new TuffItemBuilder(`${featureId}-${action.id}`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(action.name)
    .setSubtitle(action.description)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: ACTION_ID,
      actionId: action.id,
    })
    .build()
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const hasPermission = await ensurePermission('system.shell', '需要系统命令权限以执行系统操作')
      if (!hasPermission) {
        plugin.feature.clearItems()
        plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-no-permission`,
            featureId,
            title: '缺少系统权限',
            subtitle: '请授予 system.shell 权限后再试',
          }),
        ])
        return true
      }

      const keyword = getQueryText(query)
      const actions = resolveActions()
      const matched = matchActions(actions, keyword)

      if (matched.length === 0) {
        plugin.feature.clearItems()
        plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-empty`,
            featureId,
            title: '没有匹配的系统操作',
            subtitle: '可尝试输入：关机 / 重启 / 锁屏 / 音量 / 亮度 / 主窗口',
          }),
        ])
        return true
      }

      const order = resolveGroupOrder(matched)
      const items = []

      order.forEach((groupId) => {
        items.push(buildSectionHeader(featureId, groupId))
        matched
          .filter(action => action.group === groupId)
          .forEach((action) => {
            items.push(buildActionItem(featureId, action))
          })
      })

      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      logger?.error?.('[touch-system-actions] Failed to handle feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-error`,
          featureId,
          title: '系统操作加载失败',
          subtitle: truncateText(error?.message || '未知错误', 120),
        }),
      ])
      return true
    }
  },

  async onItemAction(item) {
    if (item?.meta?.defaultAction !== ACTION_ID)
      return

    const actionId = normalizeText(item.meta?.actionId)
    if (!actionId)
      return

    const hasPermission = await ensurePermission('system.shell', '需要系统命令权限以执行系统操作')
    if (!hasPermission)
      return

    const action = resolveActions().find(candidate => candidate.id === actionId)
    if (!action)
      return

    try {
      await action.execute()
      return { externalAction: true }
    }
    catch (error) {
      logger?.error?.(`[touch-system-actions] Action failed: ${action.id}`, error)

      if (action.requiresAdmin) {
        await showPermissionError(action.name)
      }
      else if (dialog?.showMessageBox) {
        await dialog.showMessageBox({
          type: 'error',
          title: '操作失败',
          message: `执行"${action.name}"失败`,
          detail: truncateText(error?.message || '未知错误', 180),
          buttons: ['确定'],
        })
      }

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
    buildSearchTokens,
    matchActions,
    resolveActions,
    resolveGroupOrder,
  },
}
