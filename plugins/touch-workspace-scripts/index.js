const { plugin, logger, TuffItemBuilder } = globalThis

const PLUGIN_NAME = 'touch-workspace-scripts'
const SOURCE_ID = 'plugin-features'
const FEATURE_ID = 'workspace-scripts'
const ICON = { type: 'class', value: 'i-ri-terminal-box-line' }
const ACTIONS = new Set(['select-workspace', 'run-script'])

let currentWorkspace = null
let currentScripts = []

function locale() {
  try {
    return plugin.getLocale() === 'en-US' ? 'en' : 'zh'
  }
  catch {
    return 'zh'
  }
}

function t(zh, en) {
  return locale() === 'en' ? en : zh
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  return typeof query === 'string' ? query : (query?.text ?? '')
}

function matchesQuery(name, query) {
  const keyword = normalizeText(query).toLowerCase()
  return !keyword || name.toLowerCase().includes(keyword)
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

function buildSelectItem(featureId) {
  return new TuffItemBuilder(`${featureId}-select`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(t('选择工作区', 'Select Workspace'))
    .setSubtitle(
      currentWorkspace
        ? t(`当前：${currentWorkspace.name}`, `Current: ${currentWorkspace.name}`)
        : t('选择包含 package.json 的目录', 'Choose a directory containing package.json'),
    )
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: 'select-workspace',
    })
    .createAndAddAction('select-workspace', 'plugin', t('选择', 'Select'), {
      operation: 'select-workspace',
    })
    .build()
}

function buildScriptItem(featureId, index, script) {
  return new TuffItemBuilder(`${featureId}-script-${index}`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(script.name)
    .setSubtitle(t('运行 package.json 脚本', 'Run package.json script'))
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: 'run-script',
    })
    .createAndAddAction('run-script', 'plugin', t('运行', 'Run'), {
      scriptToken: script.token,
    })
    .build()
}

async function publishItems(featureId, query = '') {
  const items = [buildSelectItem(featureId)]
  if (currentWorkspace) {
    items.push(
      buildInfoItem({
        id: `${featureId}-summary`,
        featureId,
        title: currentWorkspace.name,
        subtitle: t(
          `${currentScripts.length} 个短期脚本令牌`,
          `${currentScripts.length} short-lived script tokens`,
        ),
      }),
    )
  }

  const filtered = currentScripts.filter(script => matchesQuery(script.name, query))
  filtered.forEach((script, index) => items.push(buildScriptItem(featureId, index, script)))
  if (currentWorkspace && filtered.length === 0) {
    items.push(
      buildInfoItem({
        id: `${featureId}-empty`,
        featureId,
        title: t('没有匹配脚本', 'No Matching Scripts'),
        subtitle: query
          ? t('请调整搜索关键词', 'Try another search term')
          : t('package.json 未声明可运行脚本', 'No runnable scripts are declared'),
      }),
    )
  }

  await plugin.feature.clearItems()
  await plugin.feature.pushItems(items)
}

function stableFailure(error) {
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    return { status: 'blocked', reason: 'permission-denied' }
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    return { status: 'blocked', reason: 'permission-unavailable' }
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED')
    return { status: 'cancelled', reason: 'cancelled' }
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT')
    return { status: 'failed', reason: 'timeout' }
  return { status: 'failed', reason: 'workspace-script-failed' }
}

function external(result, success = false) {
  return {
    externalAction: true,
    success,
    status: result.status,
    ...(result.reason ? { reason: result.reason } : {}),
  }
}

async function refreshScripts() {
  if (!currentWorkspace)
    return { operation: 'list-scripts', status: 'blocked', reason: 'token-invalid' }
  const result = await plugin.workspaceScripts.list(currentWorkspace.token)
  if (result?.status === 'available' && Array.isArray(result.scripts)) {
    currentWorkspace = result.workspace
    currentScripts = result.scripts
  }
  else if (result?.status === 'blocked') {
    currentWorkspace = null
    currentScripts = []
  }
  return result
}

function selectedAction(item, context) {
  const actionId = normalizeText(context?.actionId || item?.meta?.defaultAction)
  if (!ACTIONS.has(actionId) || !Array.isArray(item?.actions))
    return null
  const action = item.actions.find(candidate => candidate?.id === actionId)
  const payload = action?.payload
  if (!payload || typeof payload !== 'object')
    return null
  if (
    actionId === 'select-workspace'
    && Object.keys(payload).length === 1
    && payload.operation === 'select-workspace'
  ) {
    return { actionId }
  }
  if (
    actionId === 'run-script'
    && Object.keys(payload).length === 1
    && typeof payload.scriptToken === 'string'
    && payload.scriptToken.startsWith('wss_')
    && payload.scriptToken.length === 36
  ) {
    return { actionId, scriptToken: payload.scriptToken }
  }
  return null
}

const pluginLifecycle = {
  async onInit() {},

  async onFeatureTriggered(featureId, query) {
    if (featureId !== FEATURE_ID)
      return false
    if (!plugin.workspaceScripts) {
      throw Object.assign(new Error('workspace scripts capability unavailable'), {
        code: 'PLUGIN_WORKSPACE_SCRIPT_CAPABILITY_UNAVAILABLE',
      })
    }

    try {
      if (currentWorkspace)
        await refreshScripts()
      await publishItems(featureId, getQueryText(query))
    }
    catch (error) {
      const failure = stableFailure(error)
      logger?.error?.(`[touch-workspace-scripts] ${failure.reason}`)
      currentWorkspace = null
      currentScripts = []
      await plugin.feature.clearItems()
      await plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-failed`,
          featureId,
          title: t('工作区脚本不可用', 'Workspace Scripts Unavailable'),
          subtitle: failure.reason,
        }),
      ])
    }
    return true
  },

  async onItemAction(item, context = {}) {
    const selected = selectedAction(item, context)
    if (!selected)
      return external({ status: 'blocked', reason: 'invalid-action' })
    if (!plugin.workspaceScripts)
      return external({ status: 'blocked', reason: 'capability-unavailable' })

    try {
      if (selected.actionId === 'select-workspace') {
        const result = await plugin.workspaceScripts.select()
        if (result?.status === 'selected') {
          currentWorkspace = result.workspace
          currentScripts = []
          const listed = await refreshScripts()
          await publishItems(FEATURE_ID)
          return external(
            listed?.status === 'available'
              ? { status: 'completed' }
              : { status: listed?.status || 'failed', reason: listed?.reason || 'list-failed' },
            listed?.status === 'available',
          )
        }
        return external({
          status: result?.status || 'failed',
          ...(result?.reason ? { reason: result.reason } : {}),
        })
      }

      const result = await plugin.workspaceScripts.run(selected.scriptToken)
      if (result?.status === 'started')
        return external({ status: 'started' }, true)
      return external({
        status: result?.status || 'failed',
        reason: result?.reason || 'execution-failed',
      })
    }
    catch (error) {
      const failure = stableFailure(error)
      logger?.error?.(`[touch-workspace-scripts] ${failure.reason}`)
      return external(failure)
    }
  },

  async onDestroy() {
    currentWorkspace = null
    currentScripts = []
  },
}

module.exports = pluginLifecycle
