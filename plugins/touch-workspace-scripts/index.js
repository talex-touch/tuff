const { plugin, dialog, logger, TuffItemBuilder, permission } = globalThis
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const process = require('node:process')

let spawnCommandSafe
try {
  ;({ spawnCommandSafe } = require('@talex-touch/utils/common/utils/safe-shell'))
}
catch {
  spawnCommandSafe = null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PLUGIN_NAME = 'touch-workspace-scripts'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'workspace-scripts'
const SHELL_PERMISSION_ID = 'system.shell'
const FS_READ_PERMISSION_ID = 'fs.read'
const CONFIG_FILE = 'workspace-scripts.json'

/** Characters and shell control/substitution tokens forbidden in structured commands. */
const SHELL_VALIDATION_PATTERN = /[\0\r\n;&|`<>]|\$\(/u

// ---------------------------------------------------------------------------
// i18n — minimal bilingual support for plugin-side strings.
// Frontend CoreBox renders these strings directly; if the frontend supports
// `$i18n:key` resolution in the future these should be migrated.
// ---------------------------------------------------------------------------
function detectLocale() {
  try {
    if (typeof plugin?.getLocale === 'function')
      return plugin.getLocale()
  }
  catch { /* ignore */ }
  // Fallback: check system env; default zh
  const lang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || ''
  return lang.toLowerCase().startsWith('en') ? 'en' : 'zh'
}
const t = (zh, en) => (detectLocale() === 'en' ? en : zh)

const SHELL_STATUS_LABELS = {
  'available': t('可用', 'Available'),
  'permission-missing': t('缺少权限', 'Permission Missing'),
  'unsupported': t('不可用', 'Unavailable'),
}

const DEFAULT_CONFIG = {
  workspacePath: '',
  commands: [],
}

// ---------------------------------------------------------------------------
// Caches (TTL-based to avoid repeated I/O during fast typing in CoreBox)
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 5_000
const configCache = { value: null, ts: 0 }
const packageScriptsCache = { key: '', value: [], ts: 0 }
const shellCapabilityCache = { value: null, ts: 0 }
let configLock = Promise.resolve() // serializes config read-modify-write operations

function cacheGet(cache) {
  if (Date.now() - cache.ts < CACHE_TTL_MS)
    return cache.value
  return undefined
}
function cacheSet(cache, value) {
  cache.value = value
  cache.ts = Date.now()
}
function cacheInvalidate() {
  configCache.ts = 0
  packageScriptsCache.key = ''
  packageScriptsCache.ts = 0
  shellCapabilityCache.ts = 0
}

function cacheGetPackageScripts(workspacePath) {
  const key = path.resolve(workspacePath)
  if (packageScriptsCache.key === key && Date.now() - packageScriptsCache.ts < CACHE_TTL_MS) {
    return packageScriptsCache.value
  }
  return undefined
}

function cacheSetPackageScripts(workspacePath, value) {
  packageScriptsCache.key = path.resolve(workspacePath)
  packageScriptsCache.value = value
  packageScriptsCache.ts = Date.now()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
  if (!permission?.check || !permission?.request) {
    return { granted: false, reason: 'permission-sdk-unavailable' }
  }
  try {
    if (await permission.check(permissionId))
      return { granted: true, reason: '' }
    const granted = await permission.request(permissionId, reason)
    return granted
      ? { granted: true, reason: '' }
      : { granted: false, reason: 'permission-denied' }
  }
  catch (error) {
    logger?.warn?.('[touch-workspace-scripts] Failed to request permission', error)
    return { granted: false, reason: 'permission-request-failed' }
  }
}

// Unified permission-state check (used for both UI diagnostics and guards).
async function resolvePermissionState(permissionId) {
  if (!permission?.check)
    return { granted: false, reason: 'permission-sdk-unavailable' }
  try {
    return { granted: Boolean(await permission.check(permissionId)) }
  }
  catch (error) {
    logger?.warn?.('[touch-workspace-scripts] Failed to check permission', error)
    return { granted: false, reason: 'permission-check-failed' }
  }
}

function resolveShellStatus() {
  if (!spawnCommandSafe)
    return { status: 'unsupported', reason: 'safe-command-unavailable' }
  return { status: 'available' }
}

async function resolveShellCapabilityState() {
  const cached = cacheGet(shellCapabilityCache)
  if (cached)
    return cached

  const shellStatus = resolveShellStatus()
  if (shellStatus.status !== 'available') {
    cacheSet(shellCapabilityCache, shellStatus)
    return shellStatus
  }
  const permState = await resolvePermissionState(SHELL_PERMISSION_ID)
  const result = permState.granted
    ? shellStatus
    : { status: 'permission-missing', reason: permState.reason || 'system-shell-permission-required' }
  cacheSet(shellCapabilityCache, result)
  return result
}

function formatShellStatusSubtitle(state) {
  const label = SHELL_STATUS_LABELS[state.status] || state.status
  return state.reason ? `${label} · ${state.reason}` : label
}

// ---------------------------------------------------------------------------
// Shell capability builder
// ---------------------------------------------------------------------------
function buildShellCapability({
  featureId,
  actionId,
  commandKind = 'user-shell',
  commandSource = 'custom',
  requiresConfirmation = false,
  requiresAdmin = false,
  platform = process.platform,
  status,
  reason,
} = {}) {
  const resolved = status ? { status, reason } : resolveShellStatus()
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
      commandSource,
      requiresConfirmation: Boolean(requiresConfirmation),
      requiresAdmin: Boolean(requiresAdmin),
    },
  }
  if (resolved.reason)
    capability.reason = resolved.reason
  return capability
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function parseScriptsConfig(raw) {
  if (!raw)
    return { ...DEFAULT_CONFIG }
  if (typeof raw === 'string') {
    try {
      return parseScriptsConfig(JSON.parse(raw))
    }
    catch (err) {
      logger?.warn?.('[touch-workspace-scripts] Config JSON parse failed, falling back to defaults', err?.message)
      return { ...DEFAULT_CONFIG }
    }
  }
  if (typeof raw === 'object') {
    return {
      workspacePath: typeof raw.workspacePath === 'string' ? raw.workspacePath : '',
      commands: Array.isArray(raw.commands) ? raw.commands : [],
    }
  }
  return { ...DEFAULT_CONFIG }
}

function parsePackageScriptsMap(scripts) {
  if (!scripts || typeof scripts !== 'object')
    return []
  return Object.entries(scripts)
    .filter(([, command]) => typeof command === 'string' && normalizeText(command))
    .map(([name]) => ({
      id: `script:${name}`,
      title: `pnpm ${name}`,
      command: `pnpm ${name}`,
      source: 'package',
    }))
}

async function ensureConfigFile() {
  try {
    const existing = await plugin.storage.getFile(CONFIG_FILE)
    if (!existing)
      await plugin.storage.setFile(CONFIG_FILE, DEFAULT_CONFIG)
  }
  catch (error) {
    logger?.warn?.('[touch-workspace-scripts] Failed to ensure config file', error)
  }
}

async function loadConfig() {
  const cached = cacheGet(configCache)
  if (cached)
    return cached
  const raw = await plugin.storage.getFile(CONFIG_FILE)
  const parsed = parseScriptsConfig(raw)
  cacheSet(configCache, parsed)
  return parsed
}

async function saveConfig(config) {
  await plugin.storage.setFile(CONFIG_FILE, config)
  cacheInvalidate()
}

async function selectWorkspace() {
  if (!dialog)
    return null
  const result = await dialog.showOpenDialog({
    title: t('选择工作区目录', 'Select Workspace Directory'),
    properties: ['openDirectory'],
  })
  const filePaths = Array.isArray(result?.filePaths) ? result.filePaths : []
  return filePaths[0] || null
}

async function readPackageScripts(workspacePath) {
  if (!workspacePath)
    return []
  const cached = cacheGetPackageScripts(workspacePath)
  if (cached)
    return cached

  const canRead = await ensurePermission(FS_READ_PERMISSION_ID, t(
    '需要读取 workspace 的 package.json 脚本列表',
    'Need to read package.json scripts from workspace',
  ))
  if (!canRead.granted)
    return []
  const packagePath = path.join(workspacePath, 'package.json')
  if (!fs.existsSync(packagePath))
    return []
  try {
    const raw = await fsp.readFile(packagePath, 'utf8')
    const parsed = JSON.parse(raw)
    const scripts = parsePackageScriptsMap(parsed?.scripts)
    cacheSetPackageScripts(workspacePath, scripts)
    return scripts
  }
  catch (error) {
    logger?.warn?.('[touch-workspace-scripts] Failed to read package scripts', error)
    return []
  }
}

// ---------------------------------------------------------------------------
// Item builders (extracted from onFeatureTriggered to reduce function length)
// ---------------------------------------------------------------------------
function buildInfoItem({ id, featureId, title, subtitle, capability }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({ pluginName: PLUGIN_NAME, featureId, ...(capability ? { capability } : {}) })
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

function buildHeaderItems(featureId, workspacePath, packageCommands, customCommands, shellState) {
  return [
    buildInfoItem({
      id: `${featureId}-workspace`,
      featureId,
      title: t('工作区路径', 'Workspace Path'),
      subtitle: workspacePath || t('未配置', 'Not configured'),
    }),
    buildInfoItem({
      id: `${featureId}-stats`,
      featureId,
      title: t('脚本数量', 'Script Count'),
      subtitle: t(
        `内置 ${packageCommands.length} / 自定义 ${customCommands.length}`,
        `Built-in ${packageCommands.length} / Custom ${customCommands.length}`,
      ),
    }),
    buildInfoItem({
      id: `${featureId}-shell-capability`,
      featureId,
      title: t('命令能力', 'Shell Capability'),
      subtitle: formatShellStatusSubtitle(shellState),
      capability: buildShellCapability({
        featureId,
        actionId: 'run-command',
        commandKind: 'user-shell',
        commandSource: 'diagnostic',
        requiresConfirmation: true,
        status: shellState.status,
        reason: shellState.reason,
      }),
    }),
    buildActionItem({
      id: `${featureId}-config-init`,
      featureId,
      title: t('初始化配置', 'Initialize Config'),
      subtitle: t('创建默认 workspace-scripts.json', 'Create default workspace-scripts.json'),
      actionId: 'config-init',
    }),
    buildActionItem({
      id: `${featureId}-config-open`,
      featureId,
      title: t('打开配置目录', 'Open Config Folder'),
      subtitle: t('编辑 workspace-scripts.json', 'Edit workspace-scripts.json'),
      actionId: 'config-open',
    }),
    buildActionItem({
      id: `${featureId}-workspace-select`,
      featureId,
      title: t('选择工作区目录', 'Select Workspace'),
      subtitle: t('用于读取 package.json scripts', 'Read package.json scripts from directory'),
      actionId: 'workspace-select',
    }),
  ]
}

function buildCommandItems(featureId, keyword, workspacePath, packageCommands, customCommands, shellState) {
  const items = []

  packageCommands.forEach((script) => {
    if (!matchKeyword(script.title, keyword) && !matchKeyword(script.command, keyword))
      return
    items.push(buildActionItem({
      id: `${featureId}-${script.id}`,
      featureId,
      title: script.title,
      subtitle: script.command,
      actionId: 'run-command',
      payload: { command: script.command, cwd: workspacePath || process.cwd() },
      capability: buildShellCapability({
        featureId,
        actionId: 'run-command',
        commandKind: 'user-shell',
        commandSource: 'package-script',
        requiresConfirmation: true,
        status: shellState.status,
        reason: shellState.reason,
      }),
    }))
  })

  customCommands.forEach((cmd, index) => {
    const commandText = typeof cmd.command === 'string' ? cmd.command : ''
    const title = typeof cmd.title === 'string' ? cmd.title : commandText || `Command ${index + 1}`
    if (!commandText)
      return
    if (!matchKeyword(title, keyword) && !matchKeyword(commandText, keyword))
      return
    items.push(buildActionItem({
      id: `${featureId}-custom-${index}`,
      featureId,
      title,
      subtitle: commandText,
      actionId: 'run-command',
      payload: { command: commandText, cwd: resolveCommandCwd(cmd.cwd, workspacePath) },
      capability: buildShellCapability({
        featureId,
        actionId: 'run-command',
        commandKind: 'user-shell',
        commandSource: 'custom-command',
        requiresConfirmation: true,
        status: shellState.status,
        reason: shellState.reason,
      }),
    }))
  })

  if (!items.length) {
    items.push(buildInfoItem({
      id: `${featureId}-empty`,
      featureId,
      title: t('暂无可执行脚本', 'No Scripts Available'),
      subtitle: t(
        '先选择工作区或在 workspace-scripts.json 里添加 commands',
        'Select a workspace or add commands in workspace-scripts.json',
      ),
    }))
  }

  return items
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------
function matchKeyword(target, keyword) {
  if (!keyword)
    return true
  return target.toLowerCase().includes(keyword.toLowerCase())
}

function resolveCommandCwd(commandCwd, workspacePath) {
  if (!commandCwd || commandCwd === '.')
    return workspacePath || process.cwd()
  if (path.isAbsolute(commandCwd))
    return commandCwd
  return path.join(workspacePath || process.cwd(), commandCwd)
}

function splitCommand(command) {
  const normalizedCommand = normalizeText(command)
  if (!normalizedCommand)
    return { ok: false, reason: 'empty-command' }
  if (SHELL_VALIDATION_PATTERN.test(normalizedCommand)) {
    return { ok: false, reason: 'unsupported-shell-syntax' }
  }

  const parts = normalizedCommand.match(/(?:[^\s"']|"[^"]*"|'[^']*')+/g) || []
  if (!parts.length)
    return { ok: false, reason: 'empty-command' }

  const [executable, ...args] = parts.map((part) => {
    const first = part[0]
    const last = part[part.length - 1]
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      return part.slice(1, -1)
    }
    return part
  })

  if (!executable)
    return { ok: false, reason: 'empty-command' }
  return { ok: true, command: normalizedCommand, executable, args }
}

function validateCommandRequest(command, cwd) {
  const parsed = splitCommand(command)
  if (!parsed.ok)
    return parsed

  const normalizedCwd = normalizeText(cwd) || process.cwd()
  const resolvedCwd = path.resolve(normalizedCwd)
  try {
    if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
      return { ok: false, reason: 'cwd-unavailable', command: parsed.command, cwd: resolvedCwd }
    }
  }
  catch {
    return { ok: false, reason: 'cwd-unavailable', command: parsed.command, cwd: resolvedCwd }
  }
  return { ...parsed, cwd: resolvedCwd }
}

function quoteWindowsCmdArg(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function resolveSpawnRequest(request) {
  if (process.platform !== 'win32') {
    return { executable: request.executable, args: request.args }
  }

  const commandLine = [request.executable, ...request.args].map(quoteWindowsCmdArg).join(' ')
  return { executable: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', commandLine] }
}

function runCommand(command, cwd) {
  const request = validateCommandRequest(command, cwd)
  if (!request.ok) {
    logger?.warn?.('[workspace-scripts] blocked command request', { reason: request.reason, cwd: request.cwd })
    return request
  }
  if (!spawnCommandSafe) {
    const result = { ok: false, reason: 'safe-command-unavailable', command: request.command, cwd: request.cwd }
    logger?.warn?.('[workspace-scripts] safe command runner unavailable; command was not executed')
    return result
  }
  const spawnRequest = resolveSpawnRequest(request)
  const child = spawnCommandSafe(spawnRequest.executable, spawnRequest.args, {
    cwd: request.cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref?.()
  return {
    ok: true,
    command: request.command,
    executable: request.executable,
    args: request.args,
    spawnedExecutable: spawnRequest.executable,
    spawnedArgs: spawnRequest.args,
    cwd: request.cwd,
    pid: child.pid,
  }
}

async function showRunBlocked(result) {
  if (!dialog?.showMessageBox)
    return
  await dialog.showMessageBox({
    type: 'warning',
    buttons: [t('好的', 'OK')],
    defaultId: 0,
    cancelId: 0,
    title: t('命令未执行', 'Command Not Executed'),
    message: t('工作区脚本未执行。', 'Workspace script was not executed.'),
    detail: result?.reason || 'unknown',
  })
}

async function confirmRun(command) {
  if (!dialog)
    return true
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: [t('取消', 'Cancel'), t('运行', 'Run')],
    defaultId: 1,
    cancelId: 0,
    title: t('确认执行命令', 'Confirm Command'),
    message: t('确认执行以下命令？', 'Execute the following command?'),
    detail: command,
  })
  return result?.response === 1
}

/**
 * Execute a shell command with full safety checks.
 *
 * Flow: validate → check safe command runner → check permission → confirm → run.
 */
async function executeCommand(payload) {
  const command = typeof payload.command === 'string' ? payload.command : ''
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd()
  if (!command)
    return

  const shellStatus = resolveShellStatus()
  if (shellStatus.status !== 'available') {
    await showRunBlocked(shellStatus)
    return { externalAction: true, status: 'blocked', reason: shellStatus.reason }
  }

  const permState = await ensurePermission(SHELL_PERMISSION_ID, t(
    '需要系统命令权限以执行开发命令',
    'System shell permission is required to run dev commands',
  ))
  if (!permState.granted) {
    return { externalAction: true, status: 'blocked', reason: permState.reason }
  }

  const confirmed = await confirmRun(command)
  if (!confirmed)
    return { externalAction: true, status: 'cancelled' }

  const result = runCommand(command, cwd)
  if (!result?.ok) {
    await showRunBlocked(result)
    return { externalAction: true, status: 'blocked', reason: result?.reason }
  }
  return { externalAction: true, status: 'started', pid: result.pid }
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------
const pluginLifecycle = {
  async onInit() {
    await ensureConfigFile()
  },

  async onFeatureTriggered(featureId, query) {
    try {
      await ensureConfigFile()
      const keyword = normalizeText(getQueryText(query))
      const config = await loadConfig()
      const workspacePath = config.workspacePath
      const packageCommands = await readPackageScripts(workspacePath)
      const customCommands = Array.isArray(config.commands) ? config.commands : []
      const shellState = await resolveShellCapabilityState()

      const headerItems = buildHeaderItems(featureId, workspacePath, packageCommands, customCommands, shellState)
      const commandItems = buildCommandItems(featureId, keyword, workspacePath, packageCommands, customCommands, shellState)

      plugin.feature.clearItems()
      plugin.feature.pushItems([...headerItems, ...commandItems])
      return true
    }
    catch (error) {
      logger?.error?.('[touch-workspace-scripts] Failed to handle feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-error`,
          featureId,
          title: t('加载失败', 'Load Failed'),
          subtitle: truncateText(error?.message || t('未知错误', 'Unknown error'), 120),
        }),
      ])
      return true
    }
  },

  async onItemAction(item) {
    try {
      if (item?.meta?.defaultAction !== ACTION_ID)
        return
      const actionId = item.meta?.actionId

      if (actionId === 'config-init') {
        await ensureConfigFile()
        return { externalAction: true }
      }
      if (actionId === 'config-open') {
        await plugin.storage.openFolder()
        return { externalAction: true }
      }
      if (actionId === 'workspace-select') {
        const selectWorkspaceTask = configLock.then(async () => {
          const config = await loadConfig()
          const selected = await selectWorkspace()
          if (selected) {
            config.workspacePath = selected
            await saveConfig(config)
          }
        })
        configLock = selectWorkspaceTask.then(
          () => undefined,
          () => undefined,
        )
        await selectWorkspaceTask
        return { externalAction: true }
      }
      if (actionId === 'run-command') {
        return await executeCommand(item.meta?.payload || {})
      }
    }
    catch (error) {
      logger?.error?.('[touch-workspace-scripts] Action failed', error)
    }
  },
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  ...pluginLifecycle,
  __test: {
    buildShellCapability,
    resolvePermissionState,
    formatShellStatusSubtitle,
    parseScriptsConfig,
    parsePackageScriptsMap,
    readPackageScripts,
    resolveShellCapabilityState,
    resolveCommandCwd,
    resolveShellStatus,
    runCommand,
    splitCommand,
    resolveSpawnRequest,
    setSpawnShellCommandForTest(runner) {
      spawnCommandSafe = runner
    },
    validateCommandRequest,
    executeCommand,
    cacheSet,
    cacheGet,
    cacheInvalidate,
    SHELL_VALIDATION_PATTERN,
  },
}
