const { plugin, TuffItemBuilder: Builder } = globalThis

const FEATURE_ID = 'vscode-projects'
const SOURCE_ID = 'touch-vscode-projects'
const INDEXED_SOURCE_ID = 'vscode-projects'
const SOURCE_STATE_FILE = 'source-state.json'
const MAX_REASON = 160
const MAX_ITEMS = 100
const TOKEN_PATTERN = /^vsp_[\w-]{32}$/
const MANAGEMENT_ACTIONS = new Set(['enable-source', 'disable-source', 'clear-source', 'rebuild-source'])
const MANAGEMENT_QUERY_PATTERN = /\b(?:manage|source|index|enable|disable|clear|rebuild)\b|管理|来源|索引|启用|停用|清除|重建/i

let issuedTokens = new Set()
let triggerGeneration = 0
let sourceEnabled = true
let sourceStateLoaded = false

function text(value, limit = 256) {
  if (typeof value !== 'string')
    return ''
  const normalized = value.trim()
  return hasControlCharacter(normalized) ? '' : normalized.slice(0, limit)
}

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1F || code === 0x7F)
      return true
  }
  return false
}

function stableReason(error, fallback = 'action-failed') {
  const code = error?.code
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    return 'permission-denied'
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    return 'permission-unavailable'
  if (code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE' || code === 'PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
    return 'capability-unavailable'
  if (code === 'PLUGIN_HOST_PERMISSION_REQUEST_FAILED')
    return 'permission-check-failed'
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED' || code === 'PLUGIN_HOST_REQUEST_CANCELLED')
    return 'cancelled'
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT' || code === 'PLUGIN_HOST_REQUEST_TIMEOUT')
    return 'timeout'
  return fallback
}

function safeReason(value, fallback = 'degraded') {
  const reason = text(value, MAX_REASON)
  return /^(?:permission-denied|permission-unavailable|permission-sdk-unavailable|permission-check-failed|capability-unavailable|platform-unsupported|source-disabled|source-cleared|storage-missing|storage-invalid|storage-too-large|read-failed|project-missing|project-replaced|token-expired|open-failed|degraded|cancelled|timeout)$/.test(
    reason,
  )
    ? reason
    : fallback
}

async function loadSourceEnabled() {
  if (sourceStateLoaded)
    return sourceEnabled
  sourceStateLoaded = true
  if (typeof plugin?.storage?.getFile !== 'function')
    return sourceEnabled
  try {
    const stored = await plugin.storage.getFile(SOURCE_STATE_FILE)
    if (stored && typeof stored === 'object' && typeof stored.enabled === 'boolean') {
      sourceEnabled = stored.enabled
    }
  }
  catch {
    // Keep in-memory state when plugin storage is unavailable.
  }
  return sourceEnabled
}

async function persistSourceEnabled(enabled) {
  sourceEnabled = Boolean(enabled)
  sourceStateLoaded = true
  if (typeof plugin?.storage?.setFile !== 'function')
    return
  try {
    await plugin.storage.setFile(SOURCE_STATE_FILE, {
      sourceId: INDEXED_SOURCE_ID,
      enabled: sourceEnabled,
    })
  }
  catch {
    // Keep in-memory state even if persistence is optional/ungranted.
  }
}

function normalizeProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project))
    return null
  const token = text(project.token, 36)
  const label = text(project.label, 128)
  if (!TOKEN_PATTERN.test(token) || !label || !['folder', 'workspace', 'file'].includes(project.kind))
    return null
  const lastOpenedAt = text(project.lastOpenedAt, 64)
  return {
    token,
    label,
    kind: project.kind,
    ...(lastOpenedAt ? { lastOpenedAt } : {}),
  }
}

function queryParts(query) {
  const raw = typeof query === 'string' ? query : (query?.text ?? query?.query)
  const value = text(raw, 128)
  const parts = { needle: value.toLowerCase(), kind: '' }
  const match = value.match(/(?:^|\s)kind\s*:\s*(folder|workspace|file)(?:\s|$)/i)
  if (match) {
    parts.kind = match[1].toLowerCase()
    parts.needle = value.replace(match[0], ' ').trim().toLowerCase()
  }
  return parts
}

function makeItem(project, index, nextTokens) {
  nextTokens.add(project.token)
  return new Builder(`${FEATURE_ID}-${index}-${project.kind}`)
    .setSource('plugin', SOURCE_ID, 'VS Code Projects')
    .setTitle(project.label)
    .setSubtitle(`${project.kind}${project.lastOpenedAt ? ` · ${project.lastOpenedAt}` : ''}`)
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .setMeta({ defaultAction: 'open', featureId: FEATURE_ID })
    .createAndAddAction('open', 'plugin', '打开项目', { token: project.token })
    .build()
}

function messageItem(title, subtitle) {
  return new Builder(`${FEATURE_ID}-message`)
    .setSource('plugin', SOURCE_ID, 'VS Code Projects')
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .build()
}

function makeManagementItem(actionId, title, subtitle, label) {
  return new Builder(`${FEATURE_ID}-${actionId}`)
    .setSource('plugin', SOURCE_ID, 'VS Code Projects')
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .setMeta({ defaultAction: actionId, featureId: FEATURE_ID, indexedSourceId: INDEXED_SOURCE_ID })
    .createAndAddAction(actionId, 'plugin', label, { sourceId: INDEXED_SOURCE_ID })
    .build()
}

function buildManagementItems(enabled) {
  if (!enabled) {
    return [
      makeManagementItem('enable-source', '启用 VS Code 项目来源', '重新启用 VS Code 最近项目索引与搜索', '启用来源'),
      makeManagementItem('clear-source', '清除 VS Code 项目结果', '清除当前缓存与已签发令牌', '清除缓存'),
    ]
  }
  return [
    makeManagementItem('rebuild-source', '重建 VS Code 项目索引', '重新读取已授权的 VS Code 最近项目', '重建索引'),
    makeManagementItem('clear-source', '清除 VS Code 项目结果', '清除当前面板结果并撤销旧令牌', '清除结果'),
    makeManagementItem('disable-source', '停用 VS Code 项目来源', '暂停读取 VS Code 最近项目并清除令牌', '停用来源'),
  ]
}

function shouldIncludeManagementItems(needle, kind) {
  if (kind)
    return false
  if (!needle)
    return true
  return MANAGEMENT_QUERY_PATTERN.test(needle)
}

async function publish(items, generation) {
  if (generation !== triggerGeneration)
    return false
  await plugin.feature.clearItems()
  if (generation !== triggerGeneration)
    return false
  await plugin.feature.pushItems(items)
  return generation === triggerGeneration
}
const lifecycle = {
  async onFeatureTriggered(featureId = FEATURE_ID, query) {
    if (featureId !== FEATURE_ID)
      return false
    const generation = ++triggerGeneration
    issuedTokens = new Set()
    const vscodeProjects = plugin?.vscodeProjects
    try {
      const enabled = await loadSourceEnabled()
      if (generation !== triggerGeneration)
        return true
      if (!enabled) {
        issuedTokens = new Set()
        await publish(
          [
            messageItem('VS Code 项目来源已停用', 'source-disabled'),
            ...buildManagementItems(false),
          ],
          generation,
        )
        return true
      }
      if (!vscodeProjects || typeof vscodeProjects.list !== 'function') {
        if (generation !== triggerGeneration)
          return true
        issuedTokens = new Set()
        await publish([messageItem('VS Code 项目能力不可用', 'capability-unavailable')], generation)
        return true
      }
      const snapshot = await vscodeProjects.list()
      if (generation !== triggerGeneration)
        return true
      if (!snapshot || !['ready', 'degraded', 'unsupported'].includes(snapshot.status)) {
        issuedTokens = new Set()
        await publish([messageItem('VS Code 项目读取失败', 'invalid-response')], generation)
        return true
      }
      if (snapshot.status !== 'ready') {
        issuedTokens = new Set()
        const resolvedReason = safeReason(snapshot.reason, snapshot.status)
        const degradedItems = [
          messageItem(
            snapshot.status === 'unsupported' ? '当前平台不支持 VS Code 项目' : 'VS Code 项目暂不可用',
            resolvedReason,
          ),
        ]
        if (resolvedReason === 'source-disabled') {
          degradedItems.push(...buildManagementItems(false))
        }
        await publish(degradedItems, generation)
        return true
      }
      const { needle, kind } = queryParts(query)
      const projects = (Array.isArray(snapshot.projects) ? snapshot.projects : [])
        .map(normalizeProject)
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
      const matched = projects.filter(
        project =>
          (!kind || project.kind === kind)
          && (!needle || `${project.label} ${project.kind}`.toLowerCase().includes(needle)),
      )
      const nextTokens = new Set()
      const items = matched.map((project, index) => makeItem(project, index, nextTokens))
      if (!items.length && !shouldIncludeManagementItems(needle, kind)) {
        items.push(
          messageItem(
            needle || kind ? '没有匹配的 VS Code 项目' : '没有 VS Code 最近项目',
            '请尝试其他关键词或启用项目来源',
          ),
        )
      }
      if (shouldIncludeManagementItems(needle, kind)) {
        if (!items.length && !needle) {
          items.push(
            messageItem('没有 VS Code 最近项目', '请尝试重建索引或检查 VS Code 项目来源'),
          )
        }
        items.push(...buildManagementItems(true))
      }
      const published = await publish(items, generation)
      if (!published)
        return true
      issuedTokens = nextTokens
      return true
    }
    catch (error) {
      if (generation !== triggerGeneration)
        return true
      issuedTokens = new Set()
      try {
        await publish([messageItem('VS Code 项目读取失败', stableReason(error))], generation)
        return true
      }
      catch {
        return false
      }
    }
  },

  async onItemAction(target, context) {
    const selectedActionId = context?.actionId || target?.meta?.defaultAction || target?.actions?.[0]?.id
    if (
      !target
      || typeof target !== 'object'
      || target.source?.type !== 'plugin'
      || ![SOURCE_ID, 'plugin-features'].includes(target.source.id)
      || target.meta?.featureId !== FEATURE_ID
    ) {
      return
    }

    if (MANAGEMENT_ACTIONS.has(selectedActionId) && target.meta?.defaultAction === selectedActionId) {
      const action = Array.isArray(target.actions)
        ? target.actions.find(candidate => candidate?.id === selectedActionId && candidate?.type === 'plugin')
        : null
      const payload = action?.payload
      const validPayload
        = payload
          && typeof payload === 'object'
          && !Array.isArray(payload)
          && Object.keys(payload).length === 1
          && payload.sourceId === INDEXED_SOURCE_ID
      if (!validPayload) {
        return { externalAction: true, status: 'blocked', reason: 'invalid-action' }
      }

      const vscodeProjects = plugin?.vscodeProjects
      try {
        if (selectedActionId === 'enable-source') {
          if (typeof vscodeProjects?.enable === 'function')
            await vscodeProjects.enable()
          await persistSourceEnabled(true)
          await lifecycle.onFeatureTriggered(FEATURE_ID, '')
          return { externalAction: true, status: 'started' }
        }
        if (selectedActionId === 'disable-source') {
          issuedTokens = new Set()
          if (typeof vscodeProjects?.disable === 'function')
            await vscodeProjects.disable()
          await persistSourceEnabled(false)
          const generation = ++triggerGeneration
          await publish(
            [
              messageItem('VS Code 项目来源已停用', 'source-disabled'),
              ...buildManagementItems(false),
            ],
            generation,
          )
          return { externalAction: true, status: 'started' }
        }
        if (selectedActionId === 'clear-source') {
          issuedTokens = new Set()
          if (typeof vscodeProjects?.clear === 'function')
            await vscodeProjects.clear()
          const generation = ++triggerGeneration
          await publish(
            [
              messageItem('已清除 VS Code 项目结果', 'source-cleared'),
              ...buildManagementItems(await loadSourceEnabled()),
            ],
            generation,
          )
          return { externalAction: true, status: 'started' }
        }
        if (selectedActionId === 'rebuild-source') {
          if (!(await loadSourceEnabled())) {
            return { externalAction: true, status: 'blocked', reason: 'source-disabled' }
          }
          issuedTokens = new Set()
          if (typeof vscodeProjects?.rebuild === 'function') {
            await vscodeProjects.rebuild()
          }
          else if (!vscodeProjects || typeof vscodeProjects.list !== 'function') {
            return { externalAction: true, status: 'blocked', reason: 'capability-unavailable' }
          }
          await lifecycle.onFeatureTriggered(FEATURE_ID, '')
          return { externalAction: true, status: 'started' }
        }
      }
      catch (error) {
        return { externalAction: true, status: 'blocked', reason: stableReason(error, 'action-failed') }
      }
    }

    if (target.meta?.defaultAction !== 'open' || selectedActionId !== 'open') {
      return
    }
    const action = Array.isArray(target.actions)
      ? target.actions.find(candidate => candidate?.id === selectedActionId && candidate?.type === 'plugin')
      : null
    const payload = action?.payload
    const token
      = payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length === 1
        ? text(payload.token, 36)
        : ''
    if (!TOKEN_PATTERN.test(token) || !issuedTokens.has(token)) {
      return { externalAction: true, status: 'blocked', reason: 'invalid-action' }
    }
    const vscodeProjects = plugin?.vscodeProjects
    if (!vscodeProjects || typeof vscodeProjects.open !== 'function') {
      return { externalAction: true, status: 'blocked', reason: 'capability-unavailable' }
    }
    try {
      const result = await vscodeProjects.open(token)
      if (result?.status === 'started')
        return { externalAction: true, status: 'started' }
      if (result?.status === 'blocked') {
        return { externalAction: true, status: 'blocked', reason: safeReason(result.reason, 'blocked') }
      }
      if (result?.status === 'unsupported') {
        return { externalAction: true, status: 'blocked', reason: safeReason(result.reason, 'platform-unsupported') }
      }
      if (result?.status === 'failed') {
        return { externalAction: true, status: 'failed', reason: safeReason(result.reason, 'open-failed') }
      }
      return { externalAction: true, status: 'failed', reason: 'invalid-response' }
    }
    catch (error) {
      return { externalAction: true, status: 'blocked', reason: stableReason(error, 'open-failed') }
    }
  },

  onDestroy() {
    triggerGeneration += 1
    issuedTokens = new Set()
    sourceStateLoaded = false
  },
}

module.exports = lifecycle
