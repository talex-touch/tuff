const { plugin, logger, TuffItemBuilder, permission } = globalThis
const { execFile } = require('node:child_process')
const process = require('node:process')

const PLUGIN_NAME = 'touch-window-presets'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'window-presets'

const GROUP_META = {
  presets: {
    title: '布局预设',
    subtitle: '双列平铺 / 开发工作台',
  },
  cleanup: {
    title: '清理动作',
    subtitle: '批量取消置顶',
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

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8', timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
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

function buildWindowsScript(action, payload = {}) {
  if (action === 'list') {
    return [
      '$code = @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class WinApi {',
      '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '}',
      '"@',
      'Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue | Out-Null',
      '$foreground = [WinApi]::GetForegroundWindow().ToInt64()',
      '$items = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne "" } | ForEach-Object {',
      '  $handle = [Int64]$_.MainWindowHandle',
      '  [pscustomobject]@{',
      '    name = $_.ProcessName',
      '    title = $_.MainWindowTitle',
      '    pid = $_.Id',
      '    handle = "$handle"',
      '    path = $_.Path',
      '    isFront = ($handle -eq $foreground)',
      '  }',
      '}',
      '$items | ConvertTo-Json -Depth 4 -Compress',
    ].join('\n')
  }

  if (action === 'snap') {
    const handle = Number(payload.handle || 0)
    const side = payload.side === 'right' ? 'right' : 'left'
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
      `$x = if ('${side}' -eq 'left') { $area.Left } else { $area.Left + $width }`,
      '$y = $area.Top',
      '[WinApi]::ShowWindowAsync($hWnd, 9) | Out-Null',
      '$ok = [WinApi]::SetWindowPos($hWnd, [IntPtr]::Zero, $x, $y, $width, $area.Height, 0x0040)',
      '[pscustomobject]@{ success = [bool]$ok; message = if ($ok) { "ok" } else { "贴边失败" } } | ConvertTo-Json -Compress',
    ].join('\n')
  }

  if (action === 'activate') {
    const handle = Number(payload.handle || 0)
    return [
      '$code = @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class WinApi {',
      '  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);',
      '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
      '}',
      '"@',
      'Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue | Out-Null',
      `$hWnd = [IntPtr]${handle}`,
      '[WinApi]::ShowWindowAsync($hWnd, 9) | Out-Null',
      '$ok = [WinApi]::SetForegroundWindow($hWnd)',
      '[pscustomobject]@{ success = [bool]$ok; message = if ($ok) { "ok" } else { "激活失败" } } | ConvertTo-Json -Compress',
    ].join('\n')
  }

  if (action === 'topmost-off') {
    const handle = Number(payload.handle || 0)
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
      '$flags = 0x0001 -bor 0x0002 -bor 0x0010 -bor 0x0040',
      '$ok = [WinApi]::SetWindowPos($hWnd, [IntPtr](-2), 0, 0, 0, 0, $flags)',
      '[pscustomobject]@{ success = [bool]$ok; message = if ($ok) { "ok" } else { "取消置顶失败" } } | ConvertTo-Json -Compress',
    ].join('\n')
  }

  return ''
}

function normalizeWindowRecord(raw) {
  if (!raw || typeof raw !== 'object')
    return null

  const name = normalizeText(raw.name)
  const title = normalizeText(raw.title)
  const handleNum = Number(raw.handle)

  if (!name || !title || !Number.isFinite(handleNum) || handleNum <= 0)
    return null

  return {
    key: `h:${Math.trunc(handleNum)}`,
    name,
    title,
    pid: Number.isFinite(Number(raw.pid)) ? Number(raw.pid) : null,
    handle: String(Math.trunc(handleNum)),
    isFront: Boolean(raw.isFront),
  }
}

function normalizeWindows(rows) {
  const list = Array.isArray(rows) ? rows : []
  const seen = new Set()
  const result = []

  list.forEach((row) => {
    const normalized = normalizeWindowRecord(row)
    if (!normalized)
      return
    if (seen.has(normalized.key))
      return
    seen.add(normalized.key)
    result.push(normalized)
  })

  return result
}

function sortWindows(windows) {
  return [...windows].sort((left, right) => {
    if (left.isFront !== right.isFront)
      return left.isFront ? -1 : 1
    return left.name.localeCompare(right.name)
  })
}

function selectDevPair(windows) {
  const list = sortWindows(windows)
  const terminalPattern = /(terminal|powershell|cmd|iterm|warp)/i
  const browserPattern = /(chrome|edge|firefox|brave|opera|safari)/i

  let terminal = list.find(item => terminalPattern.test(item.name) || terminalPattern.test(item.title))
  let browser = list.find(item => browserPattern.test(item.name) || browserPattern.test(item.title))

  if (!terminal)
    terminal = list[0]

  if (!browser)
    browser = list.find(item => item.key !== terminal?.key)

  if (!terminal || !browser)
    return null

  if (terminal.key === browser.key)
    return null

  return {
    left: terminal,
    right: browser,
  }
}

async function listWindows() {
  const output = await runPowerShell(buildWindowsScript('list'))
  const parsed = parseJsonSafe(output)
  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
  return sortWindows(normalizeWindows(rows))
}

async function runWindowsAction(action, payload) {
  const output = await runPowerShell(buildWindowsScript(action, payload))
  const parsed = parseJsonSafe(output)
  if (parsed?.success === false)
    throw new Error(parsed.message || '动作执行失败')
  return parsed || { success: true }
}

async function applyTwoColumnPreset() {
  const windows = await listWindows()
  if (windows.length < 2)
    throw new Error('至少需要两个可见窗口')

  const left = windows[0]
  const right = windows.find(item => item.key !== left.key)
  if (!right)
    throw new Error('没有可用的第二个窗口')

  await runWindowsAction('snap', { handle: left.handle, side: 'left' })
  await runWindowsAction('snap', { handle: right.handle, side: 'right' })
  await runWindowsAction('activate', { handle: left.handle })

  return `${left.name} 左侧 / ${right.name} 右侧`
}

async function applyDevSplitPreset() {
  const windows = await listWindows()
  if (windows.length < 2)
    throw new Error('至少需要两个可见窗口')

  const pair = selectDevPair(windows)
  if (!pair)
    throw new Error('无法匹配终端和浏览器窗口')

  await runWindowsAction('snap', { handle: pair.left.handle, side: 'left' })
  await runWindowsAction('snap', { handle: pair.right.handle, side: 'right' })
  await runWindowsAction('activate', { handle: pair.left.handle })

  return `${pair.left.name} 左侧 / ${pair.right.name} 右侧`
}

async function clearTopmostPreset() {
  const windows = await listWindows()
  if (!windows.length)
    throw new Error('当前没有可见窗口')

  for (const item of windows) {
    await runWindowsAction('topmost-off', { handle: item.handle })
  }

  return `已处理 ${windows.length} 个窗口`
}

function resolvePresets(platform = process.platform) {
  if (platform !== 'win32')
    return []

  return [
    {
      id: 'preset-two-column',
      name: '双列平铺（前两窗口）',
      description: '自动将前两窗口分到左右半屏',
      group: 'presets',
      keywords: ['split', 'tile', '双列', '平铺', '左右'],
      run: applyTwoColumnPreset,
    },
    {
      id: 'preset-dev-split',
      name: '开发工作台（终端+浏览器）',
      description: '终端贴左，浏览器贴右，适合开发调试',
      group: 'presets',
      keywords: ['dev', 'terminal', 'browser', '开发', '终端', '浏览器'],
      run: applyDevSplitPreset,
    },
    {
      id: 'preset-clear-topmost',
      name: '取消全部置顶',
      description: '批量取消当前可见窗口的置顶状态',
      group: 'cleanup',
      keywords: ['topmost', 'cleanup', '置顶', '清理'],
      run: clearTopmostPreset,
    },
  ]
}

function matchPresets(presets, keyword) {
  const list = Array.isArray(presets) ? presets : []
  const target = normalizeText(keyword).toLowerCase()
  if (!target)
    return list

  return list.filter((preset) => {
    const haystack = [preset.name, preset.description, ...(preset.keywords || [])]
      .join(' ')
      .toLowerCase()
    return haystack.includes(target)
  })
}

function resolveGroupOrder(presets) {
  const list = Array.isArray(presets) ? presets : []
  const order = []

  if (list.some(preset => preset.group === 'presets'))
    order.push('presets')
  if (list.some(preset => preset.group === 'cleanup'))
    order.push('cleanup')

  return order
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

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      if (process.platform !== 'win32') {
        plugin.feature.clearItems()
        plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-platform`,
            featureId,
            title: '当前平台暂不支持窗口预设',
            subtitle: '该插件当前仅支持 Windows',
          }),
        ])
        return true
      }

      const hasPermission = await ensurePermission('system.shell', '需要 system.shell 权限执行窗口预设')
      if (!hasPermission) {
        plugin.feature.clearItems()
        plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-no-permission`,
            featureId,
            title: '缺少 system.shell 权限',
            subtitle: '授权后可一键执行窗口布局预设',
          }),
        ])
        return true
      }

      const keyword = normalizeText(getQueryText(query))
      const presets = resolvePresets(process.platform)
      const matched = matchPresets(presets, keyword)
      const order = resolveGroupOrder(matched)

      const items = []

      try {
        const windows = await listWindows()
        items.push(buildInfoItem({
          id: `${featureId}-window-count`,
          featureId,
          title: '当前可见窗口',
          subtitle: `${windows.length} 个`,
        }))
      }
      catch (error) {
        items.push(buildInfoItem({
          id: `${featureId}-window-error`,
          featureId,
          title: '窗口列表获取失败',
          subtitle: truncateText(error?.message || '请检查系统权限', 96),
        }))
      }

      order.forEach((groupId) => {
        items.push(buildSectionHeader(featureId, groupId))
        matched
          .filter(preset => preset.group === groupId)
          .forEach((preset, index) => {
            items.push(buildActionItem({
              id: `${featureId}-${groupId}-${index}`,
              featureId,
              title: preset.name,
              subtitle: preset.description,
              actionId: 'run-preset',
              payload: {
                presetId: preset.id,
              },
            }))
          })
      })

      if (matched.length === 0) {
        items.push(buildInfoItem({
          id: `${featureId}-empty`,
          featureId,
          title: '暂无匹配预设',
          subtitle: keyword ? `没有匹配“${keyword}”的布局预设` : '可输入 dev / split / topmost 过滤',
        }))
      }

      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      logger?.error?.('[touch-window-presets] Failed to handle feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-error`,
          featureId,
          title: '窗口预设加载失败',
          subtitle: truncateText(error?.message || '未知错误', 120),
        }),
      ])
      return true
    }
  },

  async onItemAction(item) {
    if (item?.meta?.defaultAction !== ACTION_ID)
      return

    if (item.meta?.actionId !== 'run-preset')
      return

    const presetId = normalizeText(item.meta?.payload?.presetId)
    if (!presetId)
      return

    const hasPermission = await ensurePermission('system.shell', '需要 system.shell 权限执行窗口预设')
    if (!hasPermission)
      return

    try {
      const presets = resolvePresets(process.platform)
      const preset = presets.find(entry => entry.id === presetId)
      if (!preset)
        return

      const summary = await preset.run()
      return {
        externalAction: true,
        success: true,
        message: summary,
      }
    }
    catch (error) {
      logger?.error?.('[touch-window-presets] Run preset failed', error)
      return {
        externalAction: true,
        success: false,
        message: error?.message || '预设执行失败',
      }
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    buildWindowsScript,
    matchPresets,
    normalizeWindows,
    resolveGroupOrder,
    resolvePresets,
    selectDevPair,
  },
}
