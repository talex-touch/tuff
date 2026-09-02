const { plugin, clipboard, TuffItemBuilder: Builder } = globalThis

const FEATURE_ID = 'ai-sessions'
const SOURCE_ID = 'touch-ai-sessions'
const MAX_REASON = 160
const MAX_ITEMS = 100
const MAX_TEXT = 128
let issuedReferences = new Map()
let triggerGeneration = 0

function safeText(value, limit = MAX_TEXT) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (!text || hasControlCharacter(text)) return ''
  return text.slice(0, limit)
}

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function safeField(value, limit = MAX_TEXT) {
  const text = safeText(value, limit)
  if (!text || /[\\/]/.test(text) || /sk-[a-z0-9]|api[_ -]?key|token|secret|cookie|bearer/i.test(text)) return ''
  return text
}

function stableReason(error, fallback = 'session-index-failed') {
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

function normalizeSession(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)) return null
  const id = safeField(session.id, 96)
  const platform = safeField(session.platform, 48)
  const project = safeField(session.project, 96)
  const updatedAt = safeField(session.updatedAt, 64)
  const state = safeField(session.state, 32)
  const turnCount =
    session.turnCount === null
      ? null
      : Number.isSafeInteger(session.turnCount) && session.turnCount >= 0 && session.turnCount <= 100000
        ? session.turnCount
        : undefined
  if (!id || !platform || !project || !updatedAt || !state || turnCount === undefined) return null
  return { id, platform, project, updatedAt, state, turnCount }
}

function queryText(query) {
  const raw = typeof query === 'string' ? query : (query?.text ?? query?.query)
  return safeText(raw, MAX_TEXT).toLowerCase()
}

function reference(session) {
  return `AI session ${session.id.slice(0, 12)} · ${session.platform} · ${session.updatedAt}`
}

function itemFor(featureId, session, index, nextReferences) {
  const item = new Builder(`${featureId}-${index}-${session.id.slice(0, 12)}`)
    .setSource('plugin', SOURCE_ID, 'AI Sessions')
    .setTitle(`${session.project} · ${session.platform}`)
    .setSubtitle(
      `${session.state} · ${session.turnCount === null ? '轮数未知' : `${session.turnCount} 轮`} · ${session.updatedAt}`,
    )
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .setMeta({ defaultAction: 'copy-reference', featureId })
    .createAndAddAction('copy-reference', 'plugin', '复制脱敏引用', { id: session.id })
    .build()
  nextReferences.set(session.id, reference(session))
  return item
}

function messageItem(featureId, title, subtitle) {
  const item = new Builder(`${featureId}-message`)
    .setSource('plugin', SOURCE_ID, 'AI Sessions')
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .build()
  return item
}

async function publish(items, generation) {
  if (generation !== triggerGeneration) return false
  await plugin.feature.clearItems()
  if (generation !== triggerGeneration) return false
  await plugin.feature.pushItems(items)
  return generation === triggerGeneration
}
const lifecycle = {
  async onFeatureTriggered(featureId = FEATURE_ID, query) {
    if (featureId !== FEATURE_ID) return false
    const generation = ++triggerGeneration
    issuedReferences = new Map()
    const id = FEATURE_ID
    const aiSessions = plugin?.aiSessions
    try {
      if (!aiSessions || typeof aiSessions.list !== 'function') {
        if (generation !== triggerGeneration) return true
        issuedReferences = new Map()
        await publish([messageItem(id, 'AI 会话能力不可用', 'capability-unavailable')], generation)
        return true
      }
      const snapshot = await aiSessions.list({ query: queryText(query), limit: MAX_ITEMS })
      if (generation !== triggerGeneration) return true
      if (!snapshot || !['ready', 'degraded', 'unsupported'].includes(snapshot.status)) {
        issuedReferences = new Map()
        await publish([messageItem(id, 'AI 会话读取失败', 'invalid-response')], generation)
        return true
      }
      if (snapshot.status !== 'ready') {
        issuedReferences = new Map()
        await publish(
          [
            messageItem(
              id,
              snapshot.status === 'unsupported' ? '当前平台不支持 AI 会话' : 'AI 会话暂不可用',
              safeText(snapshot.reason, MAX_REASON) || snapshot.status,
            ),
          ],
          generation,
        )
        return true
      }
      const needle = queryText(query)
      const incomplete = snapshot.incomplete === true
      const itemLimit = incomplete ? Math.max(1, MAX_ITEMS - 1) : MAX_ITEMS
      const sessions = (Array.isArray(snapshot.sessions) ? snapshot.sessions : [])
        .map(normalizeSession)
        .filter(Boolean)
        .slice(0, itemLimit)
      const matched = needle
        ? sessions.filter(session =>
            `${session.id} ${session.platform} ${session.project} ${session.state}`.toLowerCase().includes(needle),
          )
        : sessions
      const nextReferences = new Map()
      const items = matched.map((session, index) => itemFor(id, session, index, nextReferences))
      if (incomplete) {
        items.unshift(messageItem(id, 'AI 会话结果不完整', 'scan-limited · 请缩小关键词或调整来源'))
      } else if (!items.length) {
        items.push(
          messageItem(id, needle ? '没有匹配的 AI 会话' : '没有可用的 AI 会话', '请尝试其他关键词或启用会话来源'),
        )
      }
      const published = await publish(items, generation)
      if (!published) return true
      issuedReferences = nextReferences
      return true
    } catch (error) {
      if (generation !== triggerGeneration) return true
      issuedReferences = new Map()
      try {
        await publish([messageItem(id, 'AI 会话读取失败', stableReason(error))], generation)
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
      target.meta?.defaultAction !== 'copy-reference' ||
      target.meta?.featureId !== FEATURE_ID ||
      selectedActionId !== 'copy-reference'
    ) {
      return
    }
    const action = Array.isArray(target.actions)
      ? target.actions.find(candidate => candidate?.id === selectedActionId && candidate?.type === 'plugin')
      : null
    const payload = action?.payload
    const id =
      payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length === 1
        ? safeField(payload.id, 96)
        : ''
    const issued = issuedReferences.get(id)
    if (!id || !issued) return { externalAction: true, success: false, status: 'blocked', reason: 'invalid-action' }
    const actionGeneration = triggerGeneration
    const aiSessions = plugin?.aiSessions
    if (!aiSessions || typeof aiSessions.list !== 'function')
      return { externalAction: true, success: false, status: 'blocked', reason: 'capability-unavailable' }
    if (!clipboard || typeof clipboard.writeText !== 'function')
      return { externalAction: true, success: false, status: 'blocked', reason: 'clipboard-sdk-unavailable' }
    try {
      const snapshot = await aiSessions.list({ query: id, limit: 1 })
      if (!snapshot || !['ready', 'degraded', 'unsupported'].includes(snapshot.status)) {
        return { externalAction: true, success: false, status: 'blocked', reason: 'invalid-response' }
      }
      if (snapshot.status !== 'ready') {
        return {
          externalAction: true,
          success: false,
          status: 'blocked',
          reason: safeText(snapshot.reason, MAX_REASON) || snapshot.status,
        }
      }
      const current =
        snapshot?.status === 'ready' && Array.isArray(snapshot.sessions)
          ? snapshot.sessions.map(normalizeSession).find(session => session?.id === id)
          : null
      if (!current || reference(current) !== issued) {
        return { externalAction: true, success: false, status: 'blocked', reason: 'stale-reference' }
      }
      if (actionGeneration !== triggerGeneration || issuedReferences.get(id) !== issued) {
        return { externalAction: true, success: false, status: 'blocked', reason: 'stale-action' }
      }
      await clipboard.writeText(issued)
      return { externalAction: true, success: true, status: 'copied' }
    } catch (error) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: stableReason(error, 'clipboard-failed'),
      }
    }
  },
  onDestroy() {
    triggerGeneration += 1
    issuedReferences = new Map()
  },
}

module.exports = lifecycle
