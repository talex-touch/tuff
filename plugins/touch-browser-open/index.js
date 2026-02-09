const { plugin, clipboard, logger, TuffItemBuilder, permission } = globalThis
const { execFile, spawn } = require('node:child_process')

const PLUGIN_NAME = 'touch-browser-open'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'browser-open'
const RECENT_FILE = 'recent-browsers.json'
const RECENT_MAX_ITEMS = 20
const RECENT_SHOW_LIMIT = 5
const RECENT_TTL_MS = 30 * 24 * 60 * 60 * 1000

const MAC_BROWSER_CANDIDATES = [
  { id: 'safari', name: 'Safari', target: 'Safari' },
  { id: 'chrome', name: 'Chrome', target: 'Google Chrome' },
  { id: 'edge', name: 'Edge', target: 'Microsoft Edge' },
  { id: 'firefox', name: 'Firefox', target: 'Firefox' },
  { id: 'brave', name: 'Brave', target: 'Brave Browser' },
  { id: 'opera', name: 'Opera', target: 'Opera' },
]

const WIN_BROWSER_CANDIDATES = [
  {
    id: 'edge',
    name: 'Edge',
    target: 'msedge.exe',
    paths: [
      '$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe',
      '${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
  },
  {
    id: 'chrome',
    name: 'Chrome',
    target: 'chrome.exe',
    paths: [
      '$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe',
      '${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe',
      '$env:LocalAppData\\Google\\Chrome\\Application\\chrome.exe',
    ],
  },
  {
    id: 'firefox',
    name: 'Firefox',
    target: 'firefox.exe',
    paths: [
      '$env:ProgramFiles\\Mozilla Firefox\\firefox.exe',
      '${env:ProgramFiles(x86)}\\Mozilla Firefox\\firefox.exe',
    ],
  },
  {
    id: 'brave',
    name: 'Brave',
    target: 'brave.exe',
    paths: [
      '$env:ProgramFiles\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      '${env:ProgramFiles(x86)}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      '$env:LocalAppData\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ],
  },
  {
    id: 'opera',
    name: 'Opera',
    target: 'opera.exe',
    paths: [
      '$env:LocalAppData\\Programs\\Opera\\opera.exe',
      '$env:ProgramFiles\\Opera\\opera.exe',
      '${env:ProgramFiles(x86)}\\Opera\\opera.exe',
    ],
  },
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function truncateText(value, max = 72) {
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

function isLikelyUrlInput(text) {
  const value = normalizeText(text)
  if (!value)
    return false
  if (/^https?:\/\//i.test(value))
    return true
  if (/^www\./i.test(value))
    return true
  return /^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(value)
}

function normalizeUrlInput(rawInput) {
  let value = normalizeText(rawInput)
  if (!value)
    return null

  if (!/^https?:\/\//i.test(value)) {
    if (!isLikelyUrlInput(value))
      return null
    value = `https://${value.replace(/^\/+/, '')}`
  }

  try {
    const parsed = new URL(value)
    const protocol = parsed.protocol.toLowerCase()
    if (protocol !== 'http:' && protocol !== 'https:')
      return null
    return parsed.toString()
  }
  catch {
    return null
  }
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
    execFile(command, args, { encoding: 'utf8', timeout: 10000 }, (error, stdout, stderr) => {
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

  const lines = content.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
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

function buildWindowsOpenScript(action, payload = {}) {
  if (action === 'default-open') {
    const url = String(payload.url || '').replace(/'/g, `''`)
    return [
      '$ErrorActionPreference = "Stop"',
      'try {',
      `  Start-Process -FilePath '${url}' | Out-Null`,
      '  [pscustomobject]@{ success = $true; message = "ok" } | ConvertTo-Json -Compress',
      '} catch {',
      '  [pscustomobject]@{ success = $false; message = $_.Exception.Message } | ConvertTo-Json -Compress',
      '}',
    ].join('\n')
  }

  if (action === 'open-browser') {
    const url = String(payload.url || '').replace(/'/g, `''`)
    const target = String(payload.target || '').replace(/'/g, `''`)
    return [
      '$ErrorActionPreference = "Stop"',
      'try {',
      `  Start-Process -FilePath '${target}' -ArgumentList '${url}' | Out-Null`,
      '  [pscustomobject]@{ success = $true; message = "ok" } | ConvertTo-Json -Compress',
      '} catch {',
      '  [pscustomobject]@{ success = $false; message = $_.Exception.Message } | ConvertTo-Json -Compress',
      '}',
    ].join('\n')
  }

  return ''
}

function buildWindowsDetectScript() {
  const rows = WIN_BROWSER_CANDIDATES.map((item) => {
    const paths = item.paths.map(path => `'${path.replace(/'/g, `''`)}'`).join(', ')
    return `@{ id='${item.id}'; name='${item.name.replace(/'/g, `''`)}'; target='${item.target.replace(/'/g, `''`)}'; paths=@(${paths}) }`
  }).join(',\n  ')

  return [
    '$ErrorActionPreference = "SilentlyContinue"',
    '$items = @(',
    `  ${rows}`,
    ')',
    '$result = @()',
    'foreach ($item in $items) {',
    '  $resolvedPath = $null',
    '  foreach ($p in $item.paths) {',
    '    $expanded = $ExecutionContext.InvokeCommand.ExpandString($p)',
    '    if (Test-Path $expanded) { $resolvedPath = $expanded; break }',
    '  }',
    '  if (-not $resolvedPath) {',
    '    $cmd = Get-Command $item.target -ErrorAction SilentlyContinue | Select-Object -First 1',
    '    if ($cmd) { $resolvedPath = $item.target }',
    '  }',
    '  if ($resolvedPath) {',
    '    $result += [pscustomobject]@{ id = $item.id; name = $item.name; target = $resolvedPath }',
    '  }',
    '}',
    '$result | ConvertTo-Json -Compress',
  ].join('\n')
}

async function detectBrowsersMac() {
  const result = []
  for (const candidate of MAC_BROWSER_CANDIDATES) {
    try {
      await execFileAsync('open', ['-Ra', candidate.target])
      result.push(candidate)
    }
    catch {}
  }
  return result
}

async function detectBrowsersWin() {
  const output = await runPowerShell(buildWindowsDetectScript())
  const parsed = parseJsonSafe(output)
  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
  return rows
    .map((row) => {
      const id = normalizeText(row.id)
      const name = normalizeText(row.name)
      const target = normalizeText(row.target)
      if (!id || !name || !target)
        return null
      return { id, name, target }
    })
    .filter(Boolean)
}

async function detectBrowsers() {
  if (process.platform === 'darwin')
    return detectBrowsersMac()
  if (process.platform === 'win32')
    return detectBrowsersWin()
  return []
}

function cleanupRecentBrowsers(items, now = Date.now()) {
  const threshold = now - RECENT_TTL_MS
  return items
    .filter(item => item.lastUsedAt >= threshold)
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, RECENT_MAX_ITEMS)
}

function parseRecentBrowsers(raw) {
  if (!raw)
    return []

  let payload = raw
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw)
    }
    catch {
      return []
    }
  }

  const items = Array.isArray(payload?.items) ? payload.items : []
  return items
    .map((item) => {
      const id = normalizeText(item.id)
      const name = normalizeText(item.name)
      const target = normalizeText(item.target)
      const lastUsedAt = Number(item.lastUsedAt)
      if (!id || !name || !target)
        return null
      return {
        id,
        name,
        target,
        lastUsedAt: Number.isFinite(lastUsedAt) ? lastUsedAt : 0,
      }
    })
    .filter(Boolean)
}

async function loadRecentBrowsers() {
  try {
    const raw = await plugin.storage.getFile(RECENT_FILE)
    return cleanupRecentBrowsers(parseRecentBrowsers(raw))
  }
  catch {
    return []
  }
}

async function saveRecentBrowsers(items) {
  const cleaned = cleanupRecentBrowsers(items)
  await plugin.storage.setFile(RECENT_FILE, {
    items: cleaned,
    updatedAt: Date.now(),
  })
}

function mergeRecentBrowsers(availableBrowsers, recentBrowsers) {
  const index = new Map(availableBrowsers.map(item => [item.id, item]))
  return recentBrowsers
    .map((item) => {
      const candidate = index.get(item.id)
      if (!candidate)
        return null
      return {
        ...candidate,
        lastUsedAt: item.lastUsedAt,
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, RECENT_SHOW_LIMIT)
}

function touchRecentBrowser(recentBrowsers, browser, now = Date.now()) {
  const filtered = recentBrowsers.filter(item => item.id !== browser.id)
  filtered.unshift({
    id: browser.id,
    name: browser.name,
    target: browser.target,
    lastUsedAt: now,
  })
  return cleanupRecentBrowsers(filtered, now)
}

function resolveGroupOrder({ quickActions, recommendedItems, recentItems, tips }) {
  const order = []
  if (quickActions.length)
    order.push('quick')
  if (recommendedItems.length)
    order.push('recommended')
  if (recentItems.length)
    order.push('recent')
  if (tips.length)
    order.push('tips')
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

function buildSectionHeader(featureId, sectionId, title, subtitle) {
  return buildInfoItem({
    id: `${featureId}-section-${sectionId}`,
    featureId,
    title,
    subtitle,
  })
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

function openWithMac(url, browserTarget) {
  const args = browserTarget ? ['-a', browserTarget, url] : [url]
  const child = spawn('open', args, {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

async function openWithWindows(url, browserTarget) {
  const action = browserTarget ? 'open-browser' : 'default-open'
  const output = await runPowerShell(buildWindowsOpenScript(action, {
    url,
    target: browserTarget,
  }))
  const parsed = parseJsonSafe(output)
  if (parsed?.success === false)
    throw new Error(parsed.message || '打开链接失败')
}

async function executeOpenAction(url, browserTarget) {
  if (process.platform === 'darwin') {
    openWithMac(url, browserTarget)
    return
  }

  if (process.platform === 'win32') {
    await openWithWindows(url, browserTarget)
    return
  }

  throw new Error('当前平台暂不支持浏览器打开')
}

async function tryCopyUrl(url) {
  if (!clipboard?.writeText)
    return false

  const canCopy = await ensurePermission('clipboard.write', '需要剪贴板写入权限以复制链接')
  if (!canCopy)
    return false

  clipboard.writeText(url)
  return true
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const hasShell = await ensurePermission('system.shell', '需要系统命令权限以打开浏览器')
      if (!hasShell) {
        plugin.feature.clearItems()
        plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-no-permission`,
            featureId,
            title: '缺少 system.shell 权限',
            subtitle: '授予权限后可执行浏览器打开动作',
          }),
        ])
        return true
      }

      const input = getQueryText(query)
      const url = normalizeUrlInput(input)
      const hasInput = normalizeText(input).length > 0

      if (!url) {
        plugin.feature.clearItems()
        plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-input-tip`,
            featureId,
            title: hasInput ? 'URL 格式不正确' : '请输入 URL',
            subtitle: hasInput ? '示例：https://example.com' : '支持 example.com 或 https://example.com',
          }),
          buildInfoItem({
            id: `${featureId}-input-guide`,
            featureId,
            title: '快捷提示',
            subtitle: '可输入域名后回车，自动补全 https://',
          }),
        ])
        return true
      }

      const availableBrowsers = await detectBrowsers()
      const recentBrowsers = await loadRecentBrowsers()
      const recommendedItems = availableBrowsers.map((browser, index) =>
        buildActionItem({
          id: `${featureId}-browser-${browser.id}-${index}`,
          featureId,
          title: `用 ${browser.name} 打开`,
          subtitle: truncateText(url, 72),
          actionId: 'open-browser',
          payload: { url, browser },
        }),
      )

      const recentItems = mergeRecentBrowsers(availableBrowsers, recentBrowsers).map((browser, index) =>
        buildActionItem({
          id: `${featureId}-recent-${browser.id}-${index}`,
          featureId,
          title: `最近 · ${browser.name}`,
          subtitle: truncateText(url, 72),
          actionId: 'open-browser',
          payload: { url, browser },
        }),
      )

      const quickActions = [
        buildActionItem({
          id: `${featureId}-quick-default`,
          featureId,
          title: '默认浏览器打开',
          subtitle: truncateText(url, 72),
          actionId: 'default-open',
          payload: { url },
        }),
        buildActionItem({
          id: `${featureId}-quick-copy`,
          featureId,
          title: '复制 URL',
          subtitle: truncateText(url, 72),
          actionId: 'copy-url',
          payload: { url },
        }),
      ]

      const tips = [
        buildInfoItem({
          id: `${featureId}-tip`,
          featureId,
          title: '安全提示',
          subtitle: '请先确认域名可信再打开链接',
        }),
      ]

      if (recommendedItems.length === 0) {
        tips.unshift(buildInfoItem({
          id: `${featureId}-no-browser`,
          featureId,
          title: '未检测到可用浏览器',
          subtitle: '可先尝试默认浏览器打开',
        }))
      }

      const groupOrder = resolveGroupOrder({
        quickActions,
        recommendedItems,
        recentItems,
        tips,
      })

      const items = []
      groupOrder.forEach((groupId) => {
        if (groupId === 'quick') {
          items.push(buildSectionHeader(featureId, 'quick', '快捷动作', '默认打开 / 复制 URL'))
          items.push(...quickActions)
        }

        if (groupId === 'recommended') {
          items.push(buildSectionHeader(featureId, 'recommended', '推荐浏览器', '按当前系统可用浏览器展示'))
          items.push(...recommendedItems)
        }

        if (groupId === 'recent') {
          items.push(buildSectionHeader(featureId, 'recent', '最近浏览器', `最多 ${RECENT_SHOW_LIMIT} 条`))
          items.push(...recentItems)
        }

        if (groupId === 'tips') {
          items.push(buildSectionHeader(featureId, 'tips', '提示区', '权限 / 输入 / 安全'))
          items.push(...tips)
        }
      })

      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      logger?.error?.('[touch-browser-open] Failed to handle feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-error`,
          featureId,
          title: '浏览器打开失败',
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
    const payload = item.meta?.payload || {}
    const url = normalizeUrlInput(payload.url)
    if (!actionId || !url)
      return

    const hasShell = await ensurePermission('system.shell', '需要系统命令权限以打开浏览器')
    if (!hasShell)
      return

    try {
      if (actionId === 'copy-url') {
        const copied = await tryCopyUrl(url)
        if (!copied) {
          return {
            externalAction: true,
            success: false,
            message: '复制失败：缺少 clipboard.write 权限',
          }
        }
        return { externalAction: true }
      }

      if (actionId === 'default-open') {
        await executeOpenAction(url, null)
        return { externalAction: true }
      }

      if (actionId === 'open-browser') {
        const browser = payload.browser || {}
        const browserTarget = normalizeText(browser.target)
        const browserId = normalizeText(browser.id)
        const browserName = normalizeText(browser.name) || browserId

        if (!browserTarget)
          return

        await executeOpenAction(url, browserTarget)

        if (browserId) {
          const recent = await loadRecentBrowsers()
          const next = touchRecentBrowser(recent, {
            id: browserId,
            name: browserName,
            target: browserTarget,
          })
          await saveRecentBrowsers(next)
        }

        return { externalAction: true }
      }
    }
    catch (error) {
      logger?.error?.('[touch-browser-open] Action failed', error)
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
    buildWindowsOpenScript,
    isLikelyUrlInput,
    mergeRecentBrowsers,
    normalizeUrlInput,
    parseRecentBrowsers,
    resolveGroupOrder,
    touchRecentBrowser,
  },
}
