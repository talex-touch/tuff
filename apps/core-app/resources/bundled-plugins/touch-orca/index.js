const { plugin, TuffItemBuilder: Builder } = globalThis

const FEATURE_ID = 'orca'
const SOURCE_ID = 'touch-orca'
const MAX_REASON = 160
const MAX_SUMMARY = 180
let issuedActionTokens = new Set()
let triggerGeneration = 0

function safeText(value, limit = 128) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (!text || hasControlCharacter(text)) return ''
  if (
    /(?:^|[\\/])(?:Users|private|tmp|var|home|workspace)(?:[\\/]|$)|(?:api[_-]?key|token|secret|cookie|password|authorization|bearer|transcript|command|cwd|env)\s*[:=]/i.test(
      text,
    )
  ) {
    return ''
  }
  return text.slice(0, limit)
}

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function safeReason(value, fallback) {
  return safeText(value, MAX_REASON) || fallback
}

function stableFailure(error, fallback = 'capability-failed') {
  const code = error?.code
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') return 'permission-denied'
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') return 'permission-unavailable'
  if (code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE' || code === 'PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
    return 'capability-unavailable'
  if (code === 'PLUGIN_HOST_PERMISSION_REQUEST_FAILED') return 'permission-request-failed'
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED' || code === 'PLUGIN_HOST_REQUEST_CANCELLED') return 'cancelled'
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT' || code === 'PLUGIN_HOST_REQUEST_TIMEOUT') return 'timeout'
  return fallback
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  if (!['ready', 'degraded', 'unsupported'].includes(snapshot.status)) return null
  if (snapshot.status !== 'ready') {
    return { status: snapshot.status, reason: safeReason(snapshot.reason, snapshot.status) }
  }
  const result = { status: 'ready' }
  for (const key of ['workspaces', 'terminals', 'tasks']) {
    if (!Number.isInteger(snapshot[key]) || snapshot[key] < 0 || snapshot[key] > 100000) return null
    result[key] = snapshot[key]
  }
  if (typeof snapshot.tasksAvailable !== 'boolean') return null
  result.tasksAvailable = snapshot.tasksAvailable
  const title = safeText(snapshot.title, MAX_SUMMARY)
  if (title) result.title = title
  return result
}

async function publish(items, generation) {
  if (generation !== triggerGeneration) return false
  if (
    !plugin?.feature ||
    typeof plugin.feature.clearItems !== 'function' ||
    typeof plugin.feature.pushItems !== 'function'
  ) {
    return false
  }
  await plugin.feature.clearItems()
  if (generation !== triggerGeneration) return false
  await plugin.feature.pushItems(items)
  return generation === triggerGeneration
}

function messageItem(featureId, title, subtitle) {
  const item = new Builder(`${featureId}-message`)
    .setSource('plugin', SOURCE_ID, 'Orca')
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .build()
  return item
}

function snapshotItem(featureId, snapshot, nextTokens) {
  const parts = [
    `workspaces ${snapshot.workspaces}`,
    `terminals ${snapshot.terminals}`,
    snapshot.tasksAvailable ? `tasks ${snapshot.tasks}` : 'tasks unavailable',
  ]
  const subtitle = snapshot.title ? `${parts.join(' · ')} · ${snapshot.title}` : parts.join(' · ')
  const actionToken = crypto.randomUUID()
  const item = new Builder(`${featureId}-snapshot`)
    .setSource('plugin', SOURCE_ID, 'Orca')
    .setTitle('Orca 状态')
    .setSubtitle(subtitle)
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .setMeta({ defaultAction: 'open', featureId })
    .createAndAddAction('open', 'plugin', '打开 Orca', { actionToken })
    .build()
  nextTokens.add(actionToken)
  return item
}

const lifecycle = {
  async onFeatureTriggered(featureId = FEATURE_ID) {
    if (featureId !== FEATURE_ID) return false
    const generation = ++triggerGeneration
    issuedActionTokens = new Set()
    const facade = plugin?.orca
    try {
      if (!facade || typeof facade.snapshot !== 'function') {
        if (generation !== triggerGeneration) return true
        issuedActionTokens = new Set()
        await publish([messageItem(featureId, 'Orca 能力不可用', 'capability-unavailable')], generation)
        return true
      }
      const snapshot = normalizeSnapshot(await facade.snapshot())
      if (generation !== triggerGeneration) return true
      if (!snapshot) {
        issuedActionTokens = new Set()
        await publish([messageItem(featureId, 'Orca 状态读取失败', 'invalid-response')], generation)
        return true
      }
      if (snapshot.status !== 'ready') {
        issuedActionTokens = new Set()
        await publish(
          [
            messageItem(
              featureId,
              snapshot.status === 'unsupported' ? '当前平台不支持 Orca' : 'Orca 暂不可用',
              snapshot.reason,
            ),
          ],
          generation,
        )
        return true
      }
      const nextTokens = new Set()
      const item = snapshotItem(featureId, snapshot, nextTokens)
      if (generation !== triggerGeneration) return true
      const published = await publish([item], generation)
      if (!published) return true
      issuedActionTokens = nextTokens
      return true
    } catch (error) {
      if (generation !== triggerGeneration) return true
      issuedActionTokens = new Set()
      try {
        await publish([messageItem(featureId, 'Orca 状态读取失败', stableFailure(error))], generation)
        return true
      } catch {
        return false
      }
    }
  },

  async onItemAction(target, context) {
    const selectedActionId = context?.actionId || target?.meta?.defaultAction || target?.actions?.[0]?.id
    if (
      !target ||
      typeof target !== 'object' ||
      target.source?.type !== 'plugin' ||
      ![SOURCE_ID, 'plugin-features'].includes(target.source.id) ||
      target.meta?.defaultAction !== 'open' ||
      target.meta?.featureId !== FEATURE_ID ||
      selectedActionId !== 'open'
    ) {
      return
    }
    const actions = Array.isArray(target.actions) ? target.actions : []
    const action = actions.find(candidate => candidate?.id === selectedActionId && candidate?.type === 'plugin')
    const payload = action?.payload
    const actionToken =
      payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length === 1
        ? payload.actionToken
        : ''
    if (typeof actionToken !== 'string' || !issuedActionTokens.has(actionToken))
      return { externalAction: true, status: 'blocked', reason: 'invalid-action' }
    const facade = plugin?.orca
    if (!facade || typeof facade.open !== 'function')
      return { externalAction: true, status: 'blocked', reason: 'capability-unavailable' }
    try {
      const result = await facade.open()
      if (result?.status === 'started') return { externalAction: true, status: 'started' }
      if (result?.status === 'blocked')
        return { externalAction: true, status: 'blocked', reason: safeReason(result.reason, 'blocked') }
      if (result?.status === 'unsupported')
        return { externalAction: true, status: 'blocked', reason: safeReason(result.reason, 'unsupported') }
      if (result?.status === 'failed')
        return { externalAction: true, status: 'failed', reason: safeReason(result.reason, 'open-failed') }
      return { externalAction: true, status: 'failed', reason: 'invalid-response' }
    } catch (error) {
      return { externalAction: true, status: 'blocked', reason: stableFailure(error, 'open-failed') }
    }
  },

  onDestroy() {
    triggerGeneration += 1
    issuedActionTokens = new Set()
  },
}

module.exports = lifecycle
