const { plugin, logger, TuffItemBuilder, permission } = globalThis
const { execFile, spawn } = require('node:child_process')

const PLUGIN_NAME = 'touch-window-manager'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'window-manager'
const RECENT_WINDOWS_FILE = 'recent-windows.json'
const RECENT_MAX_ITEMS = 30
const RECENT_SHOW_LIMIT = 8
const CURRENT_SHOW_LIMIT = 20
const RECENT_TTL_MS = 7 * 24 * 60 * 60 * 1000

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
}

function truncateText(value, max = 56) {
  const text = normalizeText(value)
  if (!text)
    return ''
  if (text.length <= max)
    return text
  return `${text.slice(0, max - 1)}…`
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
    execFile(command, args, { encoding: 'utf8', timeout: 12_000 }, (error, stdout, stderr) => {
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

function parseJsonSafe(text) {
  const content = normalizeText(text)
  if (!content)
    return null
  try {
    return JSON.parse(content)
  }
  catch {}

  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index])
    }
    catch {}
  }

  return null
}

function psQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `''`)}'`
}

function windowKey(windowInfo) {
  const handle = normalizeText(windowInfo?.handle)
  if (handle)
    return `h:${handle}`
  return `n:${normalizeText(windowInfo?.name)}:${windowInfo?.pid ?? 0}:${normalizeText(windowInfo?.title)}`
}

function normalizeWindowRecord(raw) {
  if (!raw || typeof raw !== 'object')
    return null

  const name = normalizeText(raw.name || raw.processName)
  const title = normalizeText(raw.title || raw.windowTitle)
  if (!name || !title)
    return null

  const handleValue = raw.handle ?? raw.mainWindowHandle
  const handle = Number(handleValue)
  if (!Number.isFinite(handle) || handle <= 0)
    return null

  const pidValue = raw.pid ?? raw.processId
  const pid = Number(pidValue)

  const record = {
    name,
    title,
    pid: Number.isFinite(pid) && pid > 0 ? pid : null,
    handle: String(Math.trunc(handle)),
    path: normalizeText(raw.path || raw.executablePath) || null,
    topmost: Boolean(raw.topmost),
    isFront: Boolean(raw.isFront),
  }

  record.key = windowKey(record)
  return record
}

function normalizeWindows(raw) {
  const items = Array.isArray(raw) ? raw : []
  const result = []
  const seen = new Set()

  items.forEach((item) => {
    const normalized = normalizeWindowRecord(item)
    if (!normalized)
      return
    if (seen.has(normalized.key))
      return
    seen.add(normalized.key)
    result.push(normalized)
  })

  return result
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

async function listRunningAppsMac() {
  const output = await runAppleScript([
    'tell application "System Events" to get name of (processes where background only is false)',
  ])
  return String(output)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

async function getFrontmostAppMac() {
  const output = await runAppleScript([
    'tell application "System Events" to get name of (first application process whose frontmost is true)',
  ])
  return String(output).trim()
}

function buildWindowsScript(action, payload = {}) {
  if (action === 'list') {
    return [
      '$code = @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class WinApi {',
      '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '  [DllImport("user32.dll", EntryPoint="GetWindowLongPtr")] public static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);',
      '  [DllImport("user32.dll", EntryPoint="GetWindowLong")] public static extern IntPtr GetWindowLongPtr32(IntPtr hWnd, int nIndex);',
      '  public static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex) {',
      '    return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, nIndex) : GetWindowLongPtr32(hWnd, nIndex);',
      '  }',
      '}',
      '"@',
      'Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue | Out-Null',
      '$foreground = [WinApi]::GetForegroundWindow().ToInt64()',
      '$items = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne "" } | ForEach-Object {',
      '  $handle = [Int64]$_.MainWindowHandle',
      '  $style = [WinApi]::GetWindowLongPtr([IntPtr]$handle, -20).ToInt64()',
      '  [pscustomobject]@{',
      '    name = $_.ProcessName',
      '    title = $_.MainWindowTitle',
      '    pid = $_.Id',
      '    handle = "$handle"',
      '    path = $_.Path',
      '    topmost = [bool]($style -band 0x00000008)',
      '    isFront = ($handle -eq $foreground)',
      '  }',
      '}',
      '$items | ConvertTo-Json -Depth 4 -Compress',
    ].join('\n')
  }

  if (action === 'activate') {
    const handle = Number(payload.handle || 0)
    return [
      '$code = @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class WinApi {',
      '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
      '  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);',
      '}',
      '"@',
      'Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue | Out-Null',
      `$hWnd = [IntPtr]${handle}`,
      '[WinApi]::ShowWindowAsync($hWnd, 9) | Out-Null',
      '$ok = [WinApi]::SetForegroundWindow($hWnd)',
      '[pscustomobject]@{ success = [bool]$ok; message = if ($ok) { "ok" } else { "无法激活窗口" } } | ConvertTo-Json -Compress',
    ].join('\n')
  }

  if (action === 'close') {
    const pid = Number(payload.pid || 0)
    return [
      `$target = Get-Process -Id ${pid} -ErrorAction SilentlyContinue`,
      'if ($null -eq $target) { [pscustomobject]@{ success = $false; message = "进程不存在" } | ConvertTo-Json -Compress; exit 0 }',
      '$closed = $target.CloseMainWindow()',
      'if ($closed) { $target.WaitForExit(2000) | Out-Null }',
      '$exited = $target.HasExited',
      '[pscustomobject]@{ success = [bool]$exited; message = if ($exited) { "ok" } else { "窗口未响应，请手动关闭" } } | ConvertTo-Json -Compress',
    ].join('\n')
  }

  if (action === 'snap-left' || action === 'snap-right') {
    const handle = Number(payload.handle || 0)
    const placeLeft = action === 'snap-left'
    return [
      '$code = @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class WinApi {',
      '  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);',
      '  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);',
      '}',
      '"@',
      'Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue | Out-Null',
      'Add-Type -AssemblyName System.Windows.Forms',
      `$hWnd = [IntPtr]${handle}`,
      '$screen = [System.Windows.Forms.Screen]::FromHandle($hWnd)',
      '$area = $screen.WorkingArea',
      '$width = [Math]::Floor($area.Width / 2)',
      `$x = if (${placeLeft ? '$true' : '$false'}) { $area.Left } else { $area.Left + $width }`,
      '$y = $area.Top',
      '[WinApi]::ShowWindowAsync($hWnd, 9) | Out-Null',
      '$ok = [WinApi]::SetWindowPos($hWnd, [IntPtr]::Zero, $x, $y, $width, $area.Height, 0x0040)',
      '[pscustomobject]@{ success = [bool]$ok; message = if ($ok) { "ok" } else { "贴边失败" } } | ConvertTo-Json -Compress',
    ].join('\n')
  }

  if (action === 'topmost-toggle') {
    const handle = Number(payload.handle || 0)
    const toTopmost = Boolean(payload.toTopmost)
    return [
      '$code = @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class WinApi {',
      '  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);',
      '}',
      '"@',
      'Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue | Out-Null',
      `$hWnd = [IntPtr]${handle}`,
      `$target = if (${toTopmost ? '$true' : '$false'}) { [IntPtr](-1) } else { [IntPtr](-2) }`,
      '$ok = [WinApi]::SetWindowPos($hWnd, $target, 0, 0, 0, 0, 0x0001 -bor 0x0002 -bor 0x0040)',
      '[pscustomobject]@{ success = [bool]$ok; message = if ($ok) { "ok" } else { "置顶切换失败" } } | ConvertTo-Json -Compress',
    ].join('\n')
  }

  if (action === 'launch') {
    const target = normalizeText(payload.target || payload.appName || payload.path)
    return [
      '$ErrorActionPreference = "Stop"',
      'try {',
      `  Start-Process -FilePath ${psQuote(target)} | Out-Null`,
      '  [pscustomobject]@{ success = $true; message = "ok" } | ConvertTo-Json -Compress',
      '} catch {',
      '  [pscustomobject]@{ success = $false; message = $_.Exception.Message } | ConvertTo-Json -Compress',
      '}',
    ].join('\n')
  }

  return ''
}

async function runPowerShell(script) {
  const commands = ['powershell.exe', 'powershell']
  let lastError = null

  for (const command of commands) {
    try {
      return await execFileAsync(command, [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script,
      ])
    }
    catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('PowerShell 不可用')
}

async function runWindowsAction(action, payload = {}) {
  const script = buildWindowsScript(action, payload)
  if (!script)
    throw new Error(`不支持的 Windows 动作: ${action}`)

  const output = await runPowerShell(script)
  const parsed = parseJsonSafe(output)
  if (parsed && parsed.success === false)
    throw new Error(parsed.message || '执行失败')
  return parsed || { success: true }
}

async function listWindowsWin() {
  const output = await runPowerShell(buildWindowsScript('list'))
  const parsed = parseJsonSafe(output)
  const windows = normalizeWindows(parsed)
  const frontWindow = windows.find(item => item.isFront) || null
  return { platform: 'win32', windows, frontWindow }
}

async function listWindowsMac() {
  const apps = await listRunningAppsMac()
  const frontName = await getFrontmostAppMac()
  const windows = apps.map((name) => {
    const windowInfo = {
      name,
      title: name,
      pid: null,
      handle: String(name),
      path: null,
      topmost: false,
      isFront: name === frontName,
    }
    windowInfo.key = windowKey(windowInfo)
    return windowInfo
  })

  const frontWindow = windows.find(item => item.isFront) || null
  return { platform: 'darwin', windows, frontWindow }
}

async function getPlatformSnapshot() {
  if (process.platform === 'win32')
    return listWindowsWin()
  if (process.platform === 'darwin')
    return listWindowsMac()
  return { platform: process.platform, windows: [], frontWindow: null }
}

function parseRecentWindows(raw) {
  if (!raw)
    return { items: [], updatedAt: 0 }

  let payload = raw
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw)
    }
    catch {
      return { items: [], updatedAt: 0 }
    }
  }

  if (!payload || typeof payload !== 'object')
    return { items: [], updatedAt: 0 }

  const items = Array.isArray(payload.items) ? payload.items : []
  return {
    items: items
      .map((item) => {
        const normalized = normalizeWindowRecord(item)
        if (!normalized)
          return null
        const lastUsedAt = Number(item.lastUsedAt)
        return {
          ...normalized,
          lastUsedAt: Number.isFinite(lastUsedAt) ? lastUsedAt : 0,
        }
      })
      .filter(Boolean),
    updatedAt: Number(payload.updatedAt) || 0,
  }
}

function cleanupRecentWindows(items, now = Date.now()) {
  const threshold = now - RECENT_TTL_MS
  return items
    .filter(item => item.lastUsedAt >= threshold)
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, RECENT_MAX_ITEMS)
}

async function loadRecentWindows() {
  try {
    const raw = await plugin.storage.getFile(RECENT_WINDOWS_FILE)
    const parsed = parseRecentWindows(raw)
    return cleanupRecentWindows(parsed.items)
  }
  catch {
    return []
  }
}

async function saveRecentWindows(items) {
  const cleaned = cleanupRecentWindows(items)
  await plugin.storage.setFile(RECENT_WINDOWS_FILE, {
    items: cleaned,
    updatedAt: Date.now(),
  })
}

function touchRecentWindow(recentWindows, windowInfo, now = Date.now()) {
  const key = windowKey(windowInfo)
  const filtered = recentWindows.filter(item => item.key !== key)
  filtered.unshift({
    ...windowInfo,
    key,
    lastUsedAt: now,
  })
  return cleanupRecentWindows(filtered, now)
}

function matchesWindow(windowInfo, keyword) {
  if (!keyword)
    return true
  const lower = keyword.toLowerCase()
  return windowInfo.name.toLowerCase().includes(lower) || windowInfo.title.toLowerCase().includes(lower)
}

function sortVisibleWindows(windows, frontKey) {
  return [...windows].sort((left, right) => {
    const leftFront = left.key === frontKey ? 1 : 0
    const rightFront = right.key === frontKey ? 1 : 0
    if (leftFront !== rightFront)
      return rightFront - leftFront
    const byName = left.name.localeCompare(right.name)
    if (byName !== 0)
      return byName
    return left.title.localeCompare(right.title)
  })
}

function mergeRecentWindows(visibleWindows, recentWindows, keyword, now = Date.now()) {
  const visibleKeys = new Set(visibleWindows.map(item => item.key))
  return cleanupRecentWindows(recentWindows, now)
    .filter(item => !visibleKeys.has(item.key))
    .filter(item => matchesWindow(item, keyword))
    .slice(0, RECENT_SHOW_LIMIT)
}

function resolveGroupOrder({ quickActions, frontWindow, recentWindows, visibleWindows }) {
  const order = []
  if (quickActions.length > 0)
    order.push('quick')
  if (frontWindow)
    order.push('front')
  if (recentWindows.length > 0)
    order.push('recent')
  if (visibleWindows.length > 0)
    order.push('current')
  return order
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

function buildSectionHeader(featureId, groupId, title, subtitle) {
  return buildInfoItem({
    id: `${featureId}-section-${groupId}`,
    featureId,
    title,
    subtitle,
  })
}

function buildQuickActions(featureId, platform, frontWindow, keyword) {
  const actions = []
  const basePayload = frontWindow ? { platform, window: frontWindow } : null

  if (platform === 'win32' && frontWindow) {
    actions.push(buildActionItem({
      id: `${featureId}-quick-snap-left`,
      featureId,
      title: `贴左 · ${frontWindow.name}`,
      subtitle: truncateText(frontWindow.title, 36),
      actionId: 'snap-left',
      payload: basePayload,
    }))
    actions.push(buildActionItem({
      id: `${featureId}-quick-snap-right`,
      featureId,
      title: `贴右 · ${frontWindow.name}`,
      subtitle: truncateText(frontWindow.title, 36),
      actionId: 'snap-right',
      payload: basePayload,
    }))
    actions.push(buildActionItem({
      id: `${featureId}-quick-topmost`,
      featureId,
      title: `${frontWindow.topmost ? '取消置顶' : '置顶'} · ${frontWindow.name}`,
      subtitle: truncateText(frontWindow.title, 36),
      actionId: 'topmost-toggle',
      payload: {
        platform,
        window: frontWindow,
        toTopmost: !frontWindow.topmost,
      },
    }))
    actions.push(buildActionItem({
      id: `${featureId}-quick-close`,
      featureId,
      title: `关闭 · ${frontWindow.name}`,
      subtitle: truncateText(frontWindow.title, 36),
      actionId: 'close',
      payload: basePayload,
    }))
  }

  if (platform === 'darwin' && frontWindow) {
    actions.push(buildActionItem({
      id: `${featureId}-quick-hide`,
      featureId,
      title: `隐藏 · ${frontWindow.name}`,
      subtitle: truncateText(frontWindow.title, 36),
      actionId: 'hide',
      payload: { platform, appName: frontWindow.name },
    }))
    actions.push(buildActionItem({
      id: `${featureId}-quick-quit`,
      featureId,
      title: `退出 · ${frontWindow.name}`,
      subtitle: truncateText(frontWindow.title, 36),
      actionId: 'quit',
      payload: { platform, appName: frontWindow.name },
    }))
  }

  if (keyword) {
    actions.push(buildActionItem({
      id: `${featureId}-quick-launch`,
      featureId,
      title: `启动 · ${keyword}`,
      subtitle: platform === 'win32' ? 'Start-Process' : 'open -a',
      actionId: 'launch',
      payload: { platform, appName: keyword },
    }))
  }

  return actions
}

function buildWindowActivateItem(featureId, index, group, windowInfo, platform, statusTag = '') {
  return buildActionItem({
    id: `${featureId}-${group}-activate-${index}`,
    featureId,
    title: `激活 · ${windowInfo.name}`,
    subtitle: `${truncateText(windowInfo.title, 48)}${statusTag ? ` · ${statusTag}` : ''}`,
    actionId: 'activate',
    payload: { platform, window: windowInfo },
  })
}

function openAppMac(appName) {
  const child = spawn('open', ['-a', appName], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

async function executeAction(actionId, payload) {
  const platform = payload?.platform || process.platform

  if (platform === 'win32') {
    if (actionId === 'launch') {
      return runWindowsAction('launch', { target: payload?.appName })
    }

    const windowInfo = payload?.window || {}
    if (actionId === 'activate')
      return runWindowsAction('activate', { handle: windowInfo.handle })
    if (actionId === 'close')
      return runWindowsAction('close', { pid: windowInfo.pid })
    if (actionId === 'snap-left')
      return runWindowsAction('snap-left', { handle: windowInfo.handle })
    if (actionId === 'snap-right')
      return runWindowsAction('snap-right', { handle: windowInfo.handle })
    if (actionId === 'topmost-toggle') {
      return runWindowsAction('topmost-toggle', {
        handle: windowInfo.handle,
        toTopmost: Boolean(payload?.toTopmost),
      })
    }
  }

  if (platform === 'darwin') {
    if (actionId === 'launch') {
      openAppMac(payload?.appName)
      return { success: true }
    }

    const appName = payload?.appName || payload?.window?.name
    const script = buildAppleScript(actionId, appName)
    if (script.length === 0)
      return { success: false, message: '不支持的 macOS 动作' }
    await runAppleScript(script)
    return { success: true }
  }

  return { success: false, message: '当前平台暂不支持该动作' }
}

function isTrackableAction(actionId) {
  return ['activate', 'snap-left', 'snap-right', 'topmost-toggle', 'close'].includes(actionId)
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const canRun = await ensurePermission('system.shell', '需要系统命令权限以管理应用窗口')
      if (!canRun) {
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

      const keyword = normalizeText(getQueryText(query))
      const snapshot = await getPlatformSnapshot()
      const platform = snapshot.platform
      const frontWindow = snapshot.frontWindow

      let visibleWindows = snapshot.windows.filter(windowInfo => matchesWindow(windowInfo, keyword))
      visibleWindows = sortVisibleWindows(visibleWindows, frontWindow?.key).slice(0, CURRENT_SHOW_LIMIT)

      const recentAll = await loadRecentWindows()
      const recentWindows = mergeRecentWindows(visibleWindows, recentAll, keyword)
      const quickActions = buildQuickActions(featureId, platform, frontWindow, keyword)
      const groupOrder = resolveGroupOrder({
        quickActions,
        frontWindow,
        recentWindows,
        visibleWindows,
      })

      const items = []

      groupOrder.forEach((groupId) => {
        if (groupId === 'quick') {
          items.push(buildSectionHeader(featureId, 'quick', '快捷动作', '贴边 / 置顶 / 关闭 / 启动'))
          items.push(...quickActions)
        }

        if (groupId === 'front' && frontWindow) {
          items.push(buildSectionHeader(featureId, 'front', '前台窗口', `${frontWindow.name} · FRONT`))
          items.push(buildInfoItem({
            id: `${featureId}-front-summary`,
            featureId,
            title: frontWindow.name,
            subtitle: truncateText(frontWindow.title, 64) || '无窗口标题',
          }))
        }

        if (groupId === 'recent') {
          items.push(buildSectionHeader(featureId, 'recent', '最近窗口', `最多 ${RECENT_SHOW_LIMIT} 项`))
          recentWindows.forEach((windowInfo, index) => {
            items.push(buildWindowActivateItem(featureId, index, 'recent', windowInfo, platform, 'RECENT'))
          })
        }

        if (groupId === 'current') {
          items.push(buildSectionHeader(featureId, 'current', '当前可见窗口', `最多 ${CURRENT_SHOW_LIMIT} 项`))
          visibleWindows.forEach((windowInfo, index) => {
            const tag = frontWindow?.key === windowInfo.key ? 'FRONT' : ''
            items.push(buildWindowActivateItem(featureId, index, 'current', windowInfo, platform, tag))
          })
        }
      })

      if (items.length === 0) {
        items.push(buildInfoItem({
          id: `${featureId}-empty`,
          featureId,
          title: '暂无可调度窗口',
          subtitle: keyword ? '可尝试输入应用名并直接启动' : '打开应用窗口后再试',
        }))

        if (keyword) {
          items.push(buildActionItem({
            id: `${featureId}-empty-launch`,
            featureId,
            title: `启动 · ${keyword}`,
            subtitle: platform === 'win32' ? 'Start-Process' : 'open -a',
            actionId: 'launch',
            payload: { platform, appName: keyword },
          }))
        }
      }

      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      const message = error?.message || '未知错误'
      logger?.error?.('[touch-window-manager] Failed to handle feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-error`,
          featureId,
          title: '窗口调度失败',
          subtitle: truncateText(message, 120) || '请检查系统权限或窗口状态',
        }),
      ])
      return true
    }
  },

  async onItemAction(item) {
    if (item?.meta?.defaultAction !== ACTION_ID)
      return

    const actionId = item.meta?.actionId
    const payload = item.meta?.payload || {}
    if (!actionId)
      return

    const canRun = await ensurePermission('system.shell', '需要系统命令权限以管理应用窗口')
    if (!canRun)
      return

    try {
      await executeAction(actionId, payload)

      if (isTrackableAction(actionId) && payload?.window) {
        const recent = await loadRecentWindows()
        const nextRecent = touchRecentWindow(recent, payload.window, Date.now())
        await saveRecentWindows(nextRecent)
      }

      return { externalAction: true }
    }
    catch (error) {
      logger?.error?.('[touch-window-manager] Action failed', error)
      return {
        externalAction: true,
        success: false,
        message: error?.message || '窗口调度失败，请检查权限或窗口句柄是否有效',
      }
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    buildAppleScript,
    buildWindowsScript,
    normalizeWindows,
    mergeRecentWindows,
    parseRecentWindows,
    resolveGroupOrder,
  },
}
