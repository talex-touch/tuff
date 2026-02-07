const { plugin, logger, TuffItemBuilder, permission } = globalThis
const { execFile, spawn } = require('node:child_process')

const PLUGIN_NAME = 'touch-window-manager'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'window-manager'

function normalizeText(value) {
  return String(value ?? '').trim()
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

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        const err = new Error(stderr || error.message)
        err.cause = error
        reject(err)
        return
      }
      resolve(stdout)
    })
  })
}

function buildAppleScript(action, appName) {
  const escapedName = String(appName || '').replace(/"/g, '\\"')
  if (!escapedName)
    return []
  if (action === 'activate')
    return [`tell application "${escapedName}" to activate`]
  if (action === 'hide')
    return [`tell application "${escapedName}" to hide`]
  if (action === 'quit')
    return [`tell application "${escapedName}" to quit`]
  return []
}

async function runAppleScript(lines) {
  const args = lines.flatMap(line => ['-e', line])
  return execFileAsync('osascript', args)
}

async function listRunningApps() {
  const output = await runAppleScript([
    'tell application "System Events" to get name of (processes where background only is false)',
  ])
  return String(output)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

async function getFrontmostApp() {
  const output = await runAppleScript([
    'tell application "System Events" to get name of (first application process whose frontmost is true)',
  ])
  return String(output).trim()
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

function openApp(appName) {
  const child = spawn('open', ['-a', appName], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      if (process.platform !== 'darwin') {
        plugin.feature.clearItems()
        plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-unsupported`,
            featureId,
            title: '仅支持 macOS',
            subtitle: '当前平台不支持窗口管理',
          }),
        ])
        return true
      }

      const canRun = await ensurePermission('system.shell', '需要系统命令权限以管理应用窗口')
      if (!canRun) {
        plugin.feature.clearItems()
        plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-no-permission`,
            featureId,
            title: '缺少系统权限',
            subtitle: '请授予 system.shell 权限',
          }),
        ])
        return true
      }

      const keyword = normalizeText(getQueryText(query))
      const apps = await listRunningApps()
      const frontmost = await getFrontmostApp()

      const items = [
        buildInfoItem({
          id: `${featureId}-frontmost`,
          featureId,
          title: '前台应用',
          subtitle: frontmost || '未知',
        }),
        buildInfoItem({
          id: `${featureId}-count`,
          featureId,
          title: '运行中应用',
          subtitle: `${apps.length} 个`,
        }),
        buildActionItem({
          id: `${featureId}-hide-frontmost`,
          featureId,
          title: '隐藏前台应用',
          subtitle: frontmost || '',
          actionId: 'hide',
          payload: { appName: frontmost },
        }),
        buildActionItem({
          id: `${featureId}-quit-frontmost`,
          featureId,
          title: '退出前台应用',
          subtitle: frontmost || '',
          actionId: 'quit',
          payload: { appName: frontmost },
        }),
      ]

      const matchedApps = apps.filter((app) => {
        if (!keyword)
          return true
        return app.toLowerCase().includes(keyword.toLowerCase())
      })

      matchedApps.forEach((app, index) => {
        items.push(buildActionItem({
          id: `${featureId}-activate-${index}`,
          featureId,
          title: `激活 ${app}`,
          subtitle: '切换到该应用',
          actionId: 'activate',
          payload: { appName: app },
        }))
      })

      if (keyword && !matchedApps.some(app => app.toLowerCase() === keyword.toLowerCase())) {
        items.push(buildActionItem({
          id: `${featureId}-launch`,
          featureId,
          title: `启动 ${keyword}`,
          subtitle: '使用 open -a 启动应用',
          actionId: 'launch',
          payload: { appName: keyword },
        }))
      }

      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      logger?.error?.('[touch-window-manager] Failed to handle feature', error)
    }
  },

  async onItemAction(item) {
    if (item?.meta?.defaultAction !== ACTION_ID)
      return

    const actionId = item.meta?.actionId
    const appName = item.meta?.payload?.appName
    if (!actionId || !appName)
      return

    const canRun = await ensurePermission('system.shell', '需要系统命令权限以管理应用窗口')
    if (!canRun)
      return

    try {
      if (actionId === 'launch') {
        openApp(appName)
        return { externalAction: true }
      }

      const script = buildAppleScript(actionId, appName)
      if (script.length === 0)
        return
      await runAppleScript(script)
      return { externalAction: true }
    }
    catch (error) {
      logger?.error?.('[touch-window-manager] Action failed', error)
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    buildAppleScript,
  },
}
