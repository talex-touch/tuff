const { plugin, dialog, logger, TuffItemBuilder, permission, openUrl } = globalThis
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')

const PLUGIN_NAME = 'touch-dev-toolbox'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'dev-toolbox'
const TOOLBOX_FILE = 'toolbox.json'

const DEFAULT_CONFIG = {
  workspacePath: '',
  commands: [],
  links: [],
}


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

function parseToolboxConfig(raw) {
  if (!raw)
    return { ...DEFAULT_CONFIG }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parseToolboxConfig(parsed)
    }
    catch {
      return { ...DEFAULT_CONFIG }
    }
  }
  if (typeof raw === 'object') {
    return {
      workspacePath: typeof raw.workspacePath === 'string' ? raw.workspacePath : '',
      commands: Array.isArray(raw.commands) ? raw.commands : [],
      links: Array.isArray(raw.links) ? raw.links : [],
    }
  }
  return { ...DEFAULT_CONFIG }
}

async function ensureToolboxFile() {
  try {
    const existing = await plugin.storage.getFile(TOOLBOX_FILE)
    if (!existing)
      await plugin.storage.setFile(TOOLBOX_FILE, DEFAULT_CONFIG)
  }
  catch (error) {
    logger?.warn?.('[touch-dev-toolbox] Failed to ensure toolbox file', error)
  }
}

async function loadConfig() {
  const raw = await plugin.storage.getFile(TOOLBOX_FILE)
  const config = parseToolboxConfig(raw)
  return config
}

async function saveConfig(config) {
  await plugin.storage.setFile(TOOLBOX_FILE, config)
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
    const scripts = parsed?.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {}
    return Object.entries(scripts).map(([name, command]) => ({
      id: `script:${name}`,
      title: `pnpm ${name}`,
      command: `pnpm ${name}`,
      source: 'package',
    }))
  }
  catch (error) {
    logger?.warn?.('[touch-dev-toolbox] Failed to read package.json scripts', error)
    return []
  }
}

function matchKeyword(target, keyword) {
  if (!keyword)
    return true
  const lower = keyword.toLowerCase()
  return target.toLowerCase().includes(lower)
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

function resolveCommandCwd(commandCwd, workspacePath) {
  if (!commandCwd || commandCwd === '.')
    return workspacePath || process.cwd()
  if (path.isAbsolute(commandCwd))
    return commandCwd
  return path.join(workspacePath || process.cwd(), commandCwd)
}

function runCommand(command, cwd) {
  const child = spawn(command, {
    cwd,
    shell: true,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
}

const pluginLifecycle = {
  async onInit() {
    await ensureToolboxFile()
  },

  async onFeatureTriggered(featureId, query) {
    try {
      await ensureToolboxFile()
      const keyword = normalizeText(getQueryText(query))
      const config = await loadConfig()
      const workspacePath = config.workspacePath
      const scripts = await readPackageScripts(workspacePath)

      const items = []

      items.push(buildInfoItem({
        id: `${featureId}-workspace`,
        featureId,
        title: '工作区路径',
        subtitle: workspacePath || '未配置',
      }))

      items.push(buildInfoItem({
        id: `${featureId}-counts`,
        featureId,
        title: '条目统计',
        subtitle: `命令 ${config.commands.length + scripts.length} / 链接 ${config.links.length}`,
      }))

      items.push(buildActionItem({
        id: `${featureId}-config-init`,
        featureId,
        title: '初始化配置',
        subtitle: '创建默认 toolbox.json',
        actionId: 'config-init',
      }))

      items.push(buildActionItem({
        id: `${featureId}-config-open`,
        featureId,
        title: '打开配置目录',
        subtitle: '打开插件存储目录',
        actionId: 'config-open',
      }))

      items.push(buildActionItem({
        id: `${featureId}-workspace-select`,
        featureId,
        title: '选择工作区目录',
        subtitle: '用于读取 package.json 脚本',
        actionId: 'workspace-select',
      }))

      const commandItems = []
      const customCommands = Array.isArray(config.commands) ? config.commands : []

      scripts.forEach((script) => {
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
        }))
      })

      const linkItems = []
      const links = Array.isArray(config.links) ? config.links : []
      links.forEach((link, index) => {
        const title = typeof link.title === 'string' ? link.title : `链接 ${index + 1}`
        const url = typeof link.url === 'string' ? link.url : ''
        if (!url)
          return
        if (!matchKeyword(title, keyword) && !matchKeyword(url, keyword))
          return
        linkItems.push(buildActionItem({
          id: `${featureId}-link-${index}`,
          featureId,
          title,
          subtitle: url,
          actionId: 'open-link',
          payload: { url },
        }))
      })

      plugin.feature.clearItems()
      plugin.feature.pushItems([...items, ...commandItems, ...linkItems])
      return true
    }
    catch (error) {
      logger?.error?.('[touch-dev-toolbox] Failed to handle feature', error)
    }
  },

  async onItemAction(item) {
    if (item?.meta?.defaultAction !== ACTION_ID)
      return

    const actionId = item.meta?.actionId
    if (actionId === 'config-init') {
      await ensureToolboxFile()
      return { externalAction: true }
    }

    if (actionId === 'config-open') {
      await plugin.storage.openFolder()
      return { externalAction: true }
    }

    if (actionId === 'workspace-select') {
      const config = parseToolboxConfig(await plugin.storage.getFile(TOOLBOX_FILE))
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

      const canRun = await ensurePermission('system.shell', '需要系统命令权限以执行开发命令')
      if (!canRun)
        return

      const confirmed = await confirmRun(command)
      if (!confirmed)
        return

      runCommand(command, cwd)
      return { externalAction: true }
    }

    if (actionId === 'open-link') {
      const url = item.meta?.payload?.url
      if (typeof url === 'string' && url) {
        openUrl?.(url)
        return { externalAction: true }
      }
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    parseToolboxConfig,
    readPackageScripts,
  },
}
