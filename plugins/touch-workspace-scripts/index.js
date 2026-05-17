const { plugin, dialog, logger, TuffItemBuilder, permission } = globalThis
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const process = require('node:process')

let spawnShellCommand
try {
  ({ spawnShellCommand } = require('@talex-touch/utils/common/utils/safe-shell'))
}
catch {
  spawnShellCommand = null
}

const PLUGIN_NAME = 'touch-workspace-scripts'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'workspace-scripts'
const SHELL_PERMISSION_ID = 'system.shell'
const CONFIG_FILE = 'workspace-scripts.json'
const SHELL_UNSAFE_PATTERN = /[\0\r\n]/
const SHELL_STATUS_LABELS = {
  'available': '可用',
  'permission-missing': '缺少权限',
  'unsupported': '不可用',
}

const DEFAULT_CONFIG = {
  workspacePath: '',
  commands: [],
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

function resolveShellStatus() {
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

async function checkPermissionStatus(permissionId) {
  if (!permission?.check) {
    return {
      granted: true,
    }
  }

  try {
    return {
      granted: Boolean(await permission.check(permissionId)),
    }
  }
  catch (error) {
    logger?.warn?.('[touch-workspace-scripts] Failed to check permission', error)
    return {
      granted: false,
      reason: 'permission-check-failed',
    }
  }
}

async function resolveShellCapabilityState() {
  const shellStatus = resolveShellStatus()
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

function parseScriptsConfig(raw) {
  if (!raw)
    return { ...DEFAULT_CONFIG }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parseScriptsConfig(parsed)
    }
    catch {
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
  const raw = await plugin.storage.getFile(CONFIG_FILE)
  return parseScriptsConfig(raw)
}

async function saveConfig(config) {
  await plugin.storage.setFile(CONFIG_FILE, config)
}

async function selectWorkspace() {
  if (!dialog)
    return null
  const result = await dialog.showOpenDialog({
    title: '选择工作区目录',
    properties: ['openDirectory'],
  })
  const filePaths = Array.isArray(result?.filePaths) ? result.filePaths : []
  return filePaths[0] || null
}

async function readPackageScripts(workspacePath) {
  if (!workspacePath)
    return []

  const canRead = await ensurePermission('fs.read', '需要读取 workspace 的 package.json 脚本列表')
  if (!canRead)
    return []

  const packagePath = path.join(workspacePath, 'package.json')
  if (!fs.existsSync(packagePath))
    return []

  try {
    const raw = await fsp.readFile(packagePath, 'utf8')
    const parsed = JSON.parse(raw)
    return parsePackageScriptsMap(parsed?.scripts)
  }
  catch (error) {
    logger?.warn?.('[touch-workspace-scripts] Failed to read package scripts', error)
    return []
  }
}

function matchKeyword(target, keyword) {
  if (!keyword)
    return true
  const lower = keyword.toLowerCase()
  return target.toLowerCase().includes(lower)
}

function resolveCommandCwd(commandCwd, workspacePath) {
  if (!commandCwd || commandCwd === '.')
    return workspacePath || process.cwd()
  if (path.isAbsolute(commandCwd))
    return commandCwd
  return path.join(workspacePath || process.cwd(), commandCwd)
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

async function confirmRun(command) {
  if (!dialog)
    return true
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['取消', '运行'],
    defaultId: 1,
    cancelId: 0,
    title: '确认执行命令',
    message: '确认执行以下命令？',
    detail: command,
  })
  return result?.response === 1
}

function validateCommandRequest(command, cwd) {
  const normalizedCommand = normalizeText(command)
  if (!normalizedCommand) {
    return {
      ok: false,
      reason: 'empty-command',
    }
  }
  if (SHELL_UNSAFE_PATTERN.test(normalizedCommand)) {
    return {
      ok: false,
      reason: 'unsafe-command-payload',
    }
  }

  const normalizedCwd = normalizeText(cwd) || process.cwd()
  const resolvedCwd = path.resolve(normalizedCwd)
  try {
    if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
      return {
        ok: false,
        reason: 'cwd-unavailable',
        command: normalizedCommand,
        cwd: resolvedCwd,
      }
    }
  }
  catch {
    return {
      ok: false,
      reason: 'cwd-unavailable',
      command: normalizedCommand,
      cwd: resolvedCwd,
    }
  }

  return {
    ok: true,
    command: normalizedCommand,
    cwd: resolvedCwd,
  }
}

function runCommand(command, cwd) {
  const request = validateCommandRequest(command, cwd)
  if (!request.ok) {
    logger?.warn?.('[workspace-scripts] blocked command request', {
      reason: request.reason,
      cwd: request.cwd,
    })
    return request
  }

  if (!spawnShellCommand) {
    const result = {
      ok: false,
      reason: 'safe-shell-unavailable',
      command: request.command,
      cwd: request.cwd,
    }
    logger?.warn?.('[workspace-scripts] safe-shell unavailable; command was not executed')
    return result
  }

  const child = spawnShellCommand(request.command, {
    cwd: request.cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref?.()
  return {
    ok: true,
    command: request.command,
    cwd: request.cwd,
    pid: child.pid,
  }
}

async function showRunBlocked(result) {
  if (!dialog?.showMessageBox)
    return

  await dialog.showMessageBox({
    type: 'warning',
    buttons: ['好的'],
    defaultId: 0,
    cancelId: 0,
    title: '命令未执行',
    message: '工作区脚本未执行。',
    detail: result?.reason || 'unknown',
  })
}

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
      const shellCapabilityState = await resolveShellCapabilityState()

      const headerItems = [
        buildInfoItem({
          id: `${featureId}-workspace`,
          featureId,
          title: '工作区路径',
          subtitle: workspacePath || '未配置',
        }),
        buildInfoItem({
          id: `${featureId}-stats`,
          featureId,
          title: '脚本数量',
          subtitle: `内置 ${packageCommands.length} / 自定义 ${customCommands.length}`,
        }),
        buildInfoItem({
          id: `${featureId}-shell-capability`,
          featureId,
          title: '命令能力',
          subtitle: formatShellStatusSubtitle(shellCapabilityState),
          capability: buildShellCapability({
            featureId,
            actionId: 'run-command',
            commandKind: 'user-shell',
            commandSource: 'diagnostic',
            requiresConfirmation: true,
            status: shellCapabilityState.status,
            reason: shellCapabilityState.reason,
          }),
        }),
        buildActionItem({
          id: `${featureId}-config-init`,
          featureId,
          title: '初始化配置',
          subtitle: '创建默认 workspace-scripts.json',
          actionId: 'config-init',
        }),
        buildActionItem({
          id: `${featureId}-config-open`,
          featureId,
          title: '打开配置目录',
          subtitle: '编辑 workspace-scripts.json',
          actionId: 'config-open',
        }),
        buildActionItem({
          id: `${featureId}-workspace-select`,
          featureId,
          title: '选择工作区目录',
          subtitle: '用于读取 package.json scripts',
          actionId: 'workspace-select',
        }),
      ]

      const commandItems = []

      packageCommands.forEach((script) => {
        if (!matchKeyword(script.title, keyword) && !matchKeyword(script.command, keyword))
          return

        commandItems.push(buildActionItem({
          id: `${featureId}-${script.id}`,
          featureId,
          title: script.title,
          subtitle: script.command,
          actionId: 'run-command',
          payload: {
            command: script.command,
            cwd: workspacePath || process.cwd(),
          },
          capability: buildShellCapability({
            featureId,
            actionId: 'run-command',
            commandKind: 'user-shell',
            commandSource: 'package-script',
            requiresConfirmation: true,
            status: shellCapabilityState.status,
            reason: shellCapabilityState.reason,
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

        commandItems.push(buildActionItem({
          id: `${featureId}-custom-${index}`,
          featureId,
          title,
          subtitle: commandText,
          actionId: 'run-command',
          payload: {
            command: commandText,
            cwd: resolveCommandCwd(cmd.cwd, workspacePath),
          },
          capability: buildShellCapability({
            featureId,
            actionId: 'run-command',
            commandKind: 'user-shell',
            commandSource: 'custom-command',
            requiresConfirmation: true,
            status: shellCapabilityState.status,
            reason: shellCapabilityState.reason,
          }),
        }))
      })

      if (!commandItems.length) {
        commandItems.push(buildInfoItem({
          id: `${featureId}-empty`,
          featureId,
          title: '暂无可执行脚本',
          subtitle: '先选择工作区或在 workspace-scripts.json 里添加 commands',
        }))
      }

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
          title: '加载失败',
          subtitle: truncateText(error?.message || '未知错误', 120),
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
        const config = parseScriptsConfig(await plugin.storage.getFile(CONFIG_FILE))
        const selected = await selectWorkspace()
        if (selected) {
          config.workspacePath = selected
          await saveConfig(config)
        }
        return { externalAction: true }
      }

      if (actionId === 'run-command') {
        const payload = item.meta?.payload || {}
        const command = typeof payload.command === 'string' ? payload.command : ''
        const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd()
        if (!command)
          return

        const shellStatus = resolveShellStatus()
        if (shellStatus.status !== 'available') {
          await showRunBlocked(shellStatus)
          return { externalAction: true, status: 'blocked', reason: shellStatus.reason }
        }

        const canRun = await ensurePermission(SHELL_PERMISSION_ID, '需要系统命令权限以执行开发命令')
        if (!canRun)
          return { externalAction: true, status: 'blocked', reason: 'permission-denied' }

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
    }
    catch (error) {
      logger?.error?.('[touch-workspace-scripts] Action failed', error)
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    buildShellCapability,
    checkPermissionStatus,
    formatShellStatusSubtitle,
    parseScriptsConfig,
    parsePackageScriptsMap,
    resolveShellCapabilityState,
    resolveCommandCwd,
    resolveShellStatus,
    runCommand,
    setSpawnShellCommandForTest(runner) {
      spawnShellCommand = runner
    },
    validateCommandRequest,
  },
}
