const { plugin, clipboard, logger, TuffItemBuilder, permission, touchChannel, intelligence } = globalThis
const crypto = require('node:crypto')

const AUTH_SESSION_GET_STATE_EVENT = resolveAuthSessionGetStateEvent()

let makeWidgetIdLoader = null

function getMakeWidgetId() {
  if (!makeWidgetIdLoader) {
    try {
      ;({ makeWidgetId: makeWidgetIdLoader } = require('@talex-touch/utils/plugin/widget'))
    }
    catch {
      makeWidgetIdLoader = (pluginName, featureId) => `${pluginName}::${featureId}`
    }
  }
  return makeWidgetIdLoader
}

const PLUGIN_NAME = 'touch-intelligence'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'intelligence-action'
const DEFAULT_FEATURE_ID = 'intelligence-ask'
const MAX_HISTORY_MESSAGES = 10
const MAX_DRAFTS = 20
const MAX_OCR_CONTEXT_CHARS = 4000
const CALLER_ID = `plugin:${PLUGIN_NAME}`
const ENTRY_ID = 'corebox.ai-ask'
const WIDGET_ITEM_ID = 'intelligence-widget'
const HANDOFF_SOURCE = 'corebox.touch-intelligence'
const HANDOFF_SESSION_PREFIX = 'corebox_ai_ask'
const CONTEXT_TRACE_PREFIX = 'corebox_ai_ask'
const INPUT_TYPE_TEXT = 'text'
const INPUT_TYPE_IMAGE = 'image'
const HISTORY_FILE = 'conversation-history.json'
const AUTO_MODEL_SELECTION = '__auto__'

function resolveAuthSessionGetStateEvent() {
  try {
    const { AuthEvents } = require('@talex-touch/utils/transport/events')
    return AuthEvents.session.getState.toEventName()
  }
  catch {
    return 'auth:session:get-state'
  }
}

const AI_ERROR_MESSAGES = {
  AUTH_REQUIRED: '未登录，请先登录后重试；可在登录恢复后再次发送',
  PERMISSION_DENIED: '权限已拒绝，请在插件权限中授予 intelligence.basic',
  OCR_EMPTY: 'OCR 未识别到可用文字',
  PROVIDER_UNAVAILABLE: 'Provider 不可用，请在设置中检查默认模型或 BYOK 配置后重试',
  QUOTA_EXCEEDED: 'AI 配额不足，请稍后重试或调整用量',
  MODEL_UNSUPPORTED: '当前模型不支持该能力，请切换支持 text.chat / vision.ocr 的模型',
  EMPTY_RESPONSE: 'AI 未返回可用内容',
  UNKNOWN: 'AI 调用失败',
}

const AI_SYSTEM_PROMPT = '你是 Talex Touch 桌面助手里的智能助手，请用简洁清晰的中文回答。'
const conversationSessions = new Map()

function resolveIntelligenceClient() {
  if (intelligence?.invoke) {
    return intelligence
  }

  const { createIntelligenceClient } = require('@talex-touch/tuff-intelligence/client')
  return createIntelligenceClient(touchChannel)
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function truncateText(value, max = 88) {
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

function hasAiPrefix(raw) {
  return /^(?:@?ai|\/ai|智能|问答)(?:[\s:：，,。?？]|$)/i.test(normalizeText(raw))
}

function normalizePrompt(raw) {
  const input = normalizeText(raw)
  if (!input)
    return ''

  const withoutPrefix = input.replace(/^(?:@?ai|\/ai|智能|问答)[\s:：，,。?？]*/i, '')
  if (withoutPrefix !== input)
    return normalizeText(withoutPrefix)
  return input
}

function resolveFeatureId(featureId) {
  return normalizeText(featureId) || DEFAULT_FEATURE_ID
}

function toSessionIdPart(value) {
  return normalizeText(value).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')
}

function buildHandoffSessionId(featureId) {
  const resolvedFeatureId = resolveFeatureId(featureId)
  const slug = toSessionIdPart(resolvedFeatureId) || DEFAULT_FEATURE_ID
  const digest = crypto
    .createHash('sha256')
    .update(resolvedFeatureId)
    .digest('hex')
    .slice(0, 8)
  return `${HANDOFF_SESSION_PREFIX}_${slug}_${digest}`
}

function buildContextTraceId(featureId, requestId) {
  const slug = toSessionIdPart(featureId) || DEFAULT_FEATURE_ID
  const id = normalizeText(requestId) || crypto.randomUUID()
  return `${CONTEXT_TRACE_PREFIX}_${slug}_${id}`
}

function shouldSkipOptionalHandoff(error) {
  const message = toErrorMessage(error).toLowerCase()
  return (
    message.includes('not authenticated')
    || message.includes('auth required')
    || message.includes('nexus_auth_required')
    || message.includes('permission')
    || message.includes('denied')
    || message.includes('intelligence.basic')
    || message.includes('未登录')
    || message.includes('需要登录')
  )
}

function shouldFallbackFromStream(error) {
  const message = toErrorMessage(error).toLowerCase()
  return (
    message.includes('stream-capable transport')
    || message.includes('transport.stream')
    || message.includes('not authenticated')
    || message.includes('auth required')
    || message.includes('nexus_auth_required')
    || message.includes('permission')
    || message.includes('denied')
    || message.includes('intelligence.basic')
    || message.includes('未登录')
    || message.includes('需要登录')
  )
}

function normalizeHistory(messages) {
  if (!Array.isArray(messages))
    return []

  return messages
    .map((message) => {
      const role = normalizeText(message?.role)
      const content = normalizeText(message?.content)
      if (!content)
        return null
      if (role !== 'user' && role !== 'assistant')
        return null
      return { role, content }
    })
    .filter(Boolean)
}

function cloneHistory(messages) {
  return normalizeHistory(messages).map(message => ({ ...message }))
}

function keepNewestBusinessMessages(messages) {
  const normalized = cloneHistory(messages)
  if (normalized.length <= MAX_HISTORY_MESSAGES)
    return normalized
  return normalized.slice(normalized.length - MAX_HISTORY_MESSAGES)
}

async function loadStoredHistory(featureId) {
  try {
    const raw = await plugin?.storage?.getFile?.(HISTORY_FILE)
    const byFeature = raw && typeof raw === 'object' ? raw[resolveFeatureId(featureId)] : null
    return keepNewestBusinessMessages(byFeature?.messages || [])
  }
  catch (error) {
    logger?.warn?.('[touch-intelligence] failed to load conversation history', error)
    return []
  }
}

async function saveStoredHistory(featureId, messages) {
  try {
    const raw = await plugin?.storage?.getFile?.(HISTORY_FILE)
    const next = raw && typeof raw === 'object' ? { ...raw } : {}
    next[resolveFeatureId(featureId)] = {
      messages: keepNewestBusinessMessages(messages),
      updatedAt: Date.now(),
    }
    await plugin?.storage?.setFile?.(HISTORY_FILE, next)
  }
  catch (error) {
    logger?.warn?.('[touch-intelligence] failed to save conversation history', error)
  }
}

function canCommitResponse(session, requestId) {
  return session.activeRequestId === requestId && session.uiRequestId === requestId
}

function markPendingRequest(session, requestId) {
  session.activeRequestId = requestId
  session.uiRequestId = requestId
}

function getSession(featureId) {
  const resolvedFeatureId = resolveFeatureId(featureId)
  if (!conversationSessions.has(resolvedFeatureId)) {
    conversationSessions.set(resolvedFeatureId, {
      history: [],
      activeRequestId: '',
      uiRequestId: '',
      handoffSessionId: buildHandoffSessionId(resolvedFeatureId),
      drafts: new Map(),
      lastReadyDraftId: '',
      lastReadyPromptKey: '',
      modelOptions: [],
      selectedProviderId: '',
      selectedModel: '',
    })
  }

  return conversationSessions.get(resolvedFeatureId)
}

function buildHandoffContext({ featureId, prompt, history, answer, requestId, inputKinds = [] }) {
  const messages = keepNewestBusinessMessages([
    ...cloneHistory(history),
    ...(answer
      ? [
          { role: 'user', content: normalizeText(prompt) },
          { role: 'assistant', content: normalizeText(answer) },
        ]
      : []),
  ])
  const conversation = messages.length > 0
    ? {
        conversation: {
          messages,
          updatedAt: Date.now(),
        },
      }
    : {}

  return {
    source: HANDOFF_SOURCE,
    featureId: resolveFeatureId(featureId),
    entry: ENTRY_ID,
    requestId,
    inputKinds: Array.from(new Set(inputKinds.filter(Boolean))),
    lastPrompt: normalizeText(prompt),
    ...(answer ? { lastAnswer: normalizeText(answer) } : {}),
    ...conversation,
  }
}

async function ensureHandoffSession(client, session, params) {
  const handoffSessionId = normalizeText(session.handoffSessionId)
    || buildHandoffSessionId(params.featureId)

  if (!client?.agentSessionStart)
    return ''

  try {
    const handoff = await client.agentSessionStart({
      sessionId: handoffSessionId,
      objective: params.prompt,
      context: buildHandoffContext(params),
      metadata: {
        caller: CALLER_ID,
        entry: ENTRY_ID,
        featureId: resolveFeatureId(params.featureId),
        source: HANDOFF_SOURCE,
      },
    })
    const restoredMessages = normalizeHistory(handoff?.context?.conversation?.messages)
    if (restoredMessages.length > session.history.length) {
      session.history = keepNewestBusinessMessages(restoredMessages)
    }
    session.handoffSessionId = handoffSessionId
    return handoffSessionId
  }
  catch (error) {
    logger?.warn?.('[touch-intelligence] handoff session unavailable', error)
    if (shouldSkipOptionalHandoff(error))
      session.handoffSessionId = ''
  }

  return ''
}

async function updateHandoffSession(client, session, params) {
  if (!client?.agentSessionStart || !session.handoffSessionId)
    return

  try {
    await client.agentSessionStart({
      sessionId: session.handoffSessionId,
      objective: params.prompt,
      context: buildHandoffContext(params),
      metadata: {
        caller: CALLER_ID,
        entry: ENTRY_ID,
        featureId: resolveFeatureId(params.featureId),
        source: HANDOFF_SOURCE,
        lastRequestId: params.requestId,
      },
    })
  }
  catch (error) {
    logger?.warn?.('[touch-intelligence] failed to update handoff session', error)
  }
}

function summarizeContextPackage(contextPackage) {
  if (!contextPackage || typeof contextPackage !== 'object')
    return null

  const items = Array.isArray(contextPackage.items) ? contextPackage.items : []
  const sourceTypes = {}
  let citationCount = 0
  let retrievalItemCount = 0

  for (const item of items) {
    const sourceType = normalizeText(item?.sourceType) || 'unknown'
    sourceTypes[sourceType] = (sourceTypes[sourceType] || 0) + 1
    if (sourceType === 'retrieval')
      retrievalItemCount += 1
    if (item?.metadata?.citation && typeof item.metadata.citation === 'object')
      citationCount += 1
  }

  const retrieval = contextPackage.metadata?.retrieval
    && typeof contextPackage.metadata.retrieval === 'object'
    ? contextPackage.metadata.retrieval
    : null
  const metadataCitationCount = Number(retrieval?.citationCount)

  return {
    id: normalizeText(contextPackage.id),
    sessionId: normalizeText(contextPackage.sessionId),
    scope: normalizeText(contextPackage.scope),
    traceId: normalizeText(contextPackage.traceId),
    tokenBudget: Number(contextPackage.tokenBudget) || 0,
    tokenEstimate: Number(contextPackage.tokenEstimate) || 0,
    itemCount: items.length,
    retrievalItemCount,
    citationCount: Number.isFinite(metadataCitationCount) ? metadataCitationCount : citationCount,
    sourceTypes,
    retrievalStatus: normalizeText(retrieval?.status),
    degradedReason: normalizeText(retrieval?.degradedReason),
  }
}

function hasExplicitMemoryIntent(prompt) {
  return [
    /\b(remember this|remember that|save this as memory|save this memory)\b/i,
    /(请)?记住|帮我记住|保存为记忆|加入记忆|记到记忆/,
  ].some(pattern => pattern.test(normalizeText(prompt)))
}

function summarizeMemoryPolicy(result) {
  if (!result || typeof result !== 'object')
    return null

  const candidate = result.candidate && typeof result.candidate === 'object'
    ? result.candidate
    : null
  const summary = {
    status: normalizeText(result.status),
    reason: normalizeText(result.reason),
  }
  if (candidate) {
    summary.candidate = {
      type: normalizeText(candidate.type),
      scope: normalizeText(candidate.scope),
      summary: truncateText(candidate.summary, 160),
      tags: normalizeStringList(candidate.tags),
      confidence: Number(candidate.confidence) || 0,
      privacyLevel: normalizeText(candidate.privacyLevel),
      ...(candidate.sourceSessionId ? { sourceSessionId: normalizeText(candidate.sourceSessionId) } : {}),
      ...(candidate.sourceTurnId ? { sourceTurnId: normalizeText(candidate.sourceTurnId) } : {}),
    }
  }
  return summary
}

async function evaluateMemoryPolicyForAsk(client, {
  prompt,
  contextState,
}) {
  if (typeof client?.contextEvaluateMemory !== 'function')
    return null

  const content = normalizeText(prompt)
  if (!content || !hasExplicitMemoryIntent(content))
    return null

  try {
    const result = await client.contextEvaluateMemory({
      content,
      type: 'preference',
      scope: 'session',
      tags: ['corebox-ai-ask'],
      sourceSessionId: normalizeText(contextState?.sessionId),
      sourceTurnId: normalizeText(contextState?.turnId),
      privacyLevel: 'normal',
      metadata: {
        caller: CALLER_ID,
        entry: ENTRY_ID,
        source: HANDOFF_SOURCE,
      },
    })
    return summarizeMemoryPolicy(result)
  }
  catch (error) {
    logger?.warn?.('[touch-intelligence] memory policy unavailable', error)
    return null
  }
}

async function prepareContextTurnForAsk(client, {
  featureId,
  prompt,
  requestId,
  inputKinds = [],
  handoffSessionId = '',
  selectedProviderId = '',
  selectedModel = '',
}) {
  if (typeof client?.contextPrepareTurn !== 'function')
    return null

  const displayPrompt = normalizeText(prompt)
  if (!displayPrompt)
    return null

  const contextTraceId = buildContextTraceId(featureId, requestId)

  try {
    const prepared = await client.contextPrepareTurn({
      owner: 'corebox',
      input: displayPrompt,
      objective: displayPrompt,
      explicitScope: 'retrieval',
      continueSession: Boolean(handoffSessionId),
      traceId: contextTraceId,
      tokenBudget: 1200,
      metadata: {
        caller: CALLER_ID,
        entry: ENTRY_ID,
        featureId: resolveFeatureId(featureId),
        source: HANDOFF_SOURCE,
        requestId,
        inputKinds: normalizeStringList(inputKinds),
        ...(handoffSessionId ? { handoffSessionId } : {}),
        ...(selectedProviderId ? { selectedProviderId } : {}),
        ...(selectedModel ? { selectedModel } : {}),
      },
    })
    return {
      traceId: contextTraceId,
      sessionId: normalizeText(prepared?.session?.id),
      turnId: normalizeText(prepared?.turn?.id),
      checkpointId: normalizeText(prepared?.checkpoint?.id),
      package: summarizeContextPackage(prepared?.package),
    }
  }
  catch (error) {
    logger?.warn?.('[touch-intelligence] context hygiene unavailable', error)
    return null
  }
}

function truncateForContext(value, max = MAX_OCR_CONTEXT_CHARS) {
  const text = normalizeText(value)
  if (text.length <= max)
    return text
  return text.slice(0, max)
}

function buildUserMessageContent(prompt, context = {}) {
  const normalizedPrompt = normalizeText(prompt)
  const ocrText = truncateForContext(context.ocrText)

  if (!ocrText)
    return normalizedPrompt

  const task = normalizedPrompt || '请总结剪贴板图片中的文字。'
  return `${task}\n\n以下是剪贴板图片的 OCR 文本，请只基于这些文字回答：\n${ocrText}`
}

function buildInvokePayload(prompt, history = [], context = {}) {
  const normalizedHistory = normalizeHistory(history)
  return {
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      ...normalizedHistory,
      { role: 'user', content: buildUserMessageContent(prompt, context) },
    ],
  }
}

function buildOcrPayload(imageDataUrl) {
  return {
    source: {
      type: 'data-url',
      dataUrl: imageDataUrl,
    },
    language: 'zh-CN',
    includeLayout: false,
    includeKeywords: false,
  }
}

function buildInvokeOptions({
  featureId,
  requestId,
  capabilityId,
  inputKinds = [],
  sessionId,
  contextPackage,
  memoryPolicy,
}) {
  const contextSummary = contextPackage && typeof contextPackage === 'object'
    ? contextPackage
    : null
  const memoryPolicySummary = memoryPolicy && typeof memoryPolicy === 'object'
    ? memoryPolicy
    : null
  return {
    metadata: {
      caller: CALLER_ID,
      entry: ENTRY_ID,
      featureId: resolveFeatureId(featureId),
      requestId,
      inputKinds: Array.from(new Set(inputKinds.filter(Boolean))),
      capabilityId,
      ...(sessionId
        ? {
            sessionId,
            handoffSessionId: sessionId,
            handoffSource: HANDOFF_SOURCE,
          }
        : {}),
      ...(contextSummary
        ? {
            contextTraceId: contextSummary.traceId,
            contextSessionId: contextSummary.sessionId,
            contextPackageId: contextSummary.id,
            contextScope: contextSummary.scope,
            contextTokenEstimate: contextSummary.tokenEstimate,
            contextCitationCount: contextSummary.citationCount,
          }
        : {}),
      ...(memoryPolicySummary
        ? {
            memoryPolicyStatus: memoryPolicySummary.status,
            memoryPolicyReason: memoryPolicySummary.reason,
          }
        : {}),
    },
  }
}

function normalizeModelSelection(selection = {}) {
  const providerId = normalizeText(selection.providerId)
  const model = normalizeText(selection.model)
  if (!providerId || !model || providerId === AUTO_MODEL_SELECTION || model === AUTO_MODEL_SELECTION) {
    return {
      providerId: '',
      model: '',
    }
  }
  return { providerId, model }
}

function buildModelSelectionInvokeOptions(baseOptions, selection = {}) {
  const normalized = normalizeModelSelection(selection)
  if (!normalized.providerId || !normalized.model) {
    return baseOptions
  }
  return {
    ...baseOptions,
    preferredProviderId: normalized.providerId,
    modelPreference: [normalized.model],
    metadata: {
      ...(baseOptions.metadata ?? {}),
      selectedProviderId: normalized.providerId,
      selectedModel: normalized.model,
    },
  }
}

function normalizeStringList(values) {
  if (!Array.isArray(values))
    return []
  return Array.from(new Set(values.map(value => normalizeText(value)).filter(Boolean)))
}

function normalizeLatency(value) {
  const latency = Number(value)
  if (!Number.isFinite(latency) || latency < 0)
    return undefined
  return Math.round(latency)
}

function formatLatency(latency) {
  const normalized = normalizeLatency(latency)
  if (normalized === undefined)
    return ''
  if (normalized < 1000)
    return `${normalized}ms`
  return `${(normalized / 1000).toFixed(normalized >= 10000 ? 0 : 1)}s`
}

function buildCapabilitySummary(values) {
  return normalizeStringList(values).join(' + ')
}

function mapInvokeResult(
  result,
  prompt,
  requestId,
  handoffSessionId = '',
  inputKinds = [],
  contextPackage = null,
  memoryPolicy = null,
) {
  return {
    requestId,
    prompt,
    answer: normalizeText(result?.result),
    provider: normalizeText(result?.provider),
    model: normalizeText(result?.model),
    traceId: normalizeText(result?.traceId),
    latency: normalizeLatency(result?.latency ?? result?.latencyMs),
    handoffSessionId: normalizeText(handoffSessionId),
    inputKinds: normalizeStringList(inputKinds),
    contextPackage,
    memoryPolicy,
  }
}

async function streamChatAnswer({
  client,
  featureId,
  requestId,
  payload,
  invokeOptions,
  displayPrompt,
  handoffSessionId,
  inputKinds,
  imageDataUrl,
  ocrText,
  history,
  session,
  selectedProviderId,
  selectedModel,
  modelOptions,
  contextPackage,
  memoryPolicy,
}) {
  if (typeof client?.stream !== 'function')
    return null

  let answer = ''
  let provider = ''
  let model = ''
  let traceId = ''
  let latency = 0
  const startedAt = Date.now()

  try {
    await new Promise((resolve, reject) => {
      client.stream('text.chat', payload, {
        onStart(event) {
          provider = normalizeText(event?.provider) || provider
          model = normalizeText(event?.model) || model
          traceId = normalizeText(event?.traceId) || traceId
        },
        onDelta(delta, event) {
          if (!canCommitResponse(session, requestId))
            return
          answer = normalizeText(event?.content) || `${answer}${normalizeText(delta)}`
          provider = normalizeText(event?.provider) || provider
          model = normalizeText(event?.model) || model
          traceId = normalizeText(event?.traceId) || traceId
          void pushWidgetState(featureId, {
            requestId,
            prompt: displayPrompt,
            answer,
            provider,
            model,
            traceId,
            latency: Date.now() - startedAt,
            handoffSessionId,
            status: 'chat-pending',
            stage: 'chat',
            capabilityId: 'text.chat',
            inputKinds,
            imageDataUrl,
            ocrText,
            history,
            selectedProviderId,
            selectedModel,
            modelOptions,
            contextPackage,
            memoryPolicy,
          })
        },
        onUsage(eventUsage, event) {
          provider = normalizeText(event?.provider) || provider
          model = normalizeText(event?.model) || model
          traceId = normalizeText(event?.traceId) || traceId
          void eventUsage
        },
        onEnd(event) {
          answer = normalizeText(event?.content) || normalizeText(event?.result) || answer
          provider = normalizeText(event?.provider) || provider
          model = normalizeText(event?.model) || model
          traceId = normalizeText(event?.traceId) || traceId
          latency = normalizeLatency(event?.metadata?.latency) || Date.now() - startedAt
          resolve()
        },
        onError(error) {
          reject(error)
        },
      }, invokeOptions).catch(reject)
    })
  }
  catch (error) {
    if (shouldFallbackFromStream(error)) {
      logger?.warn?.('[touch-intelligence] stream unavailable, falling back to invoke', error)
      return null
    }
    throw error
  }

  if (!answer)
    throw createPluginError('EMPTY_RESPONSE')

  return {
    requestId,
    prompt: displayPrompt,
    answer,
    provider,
    model,
    traceId,
    latency,
    handoffSessionId,
    inputKinds: normalizeStringList(inputKinds),
    selectedProviderId: normalizeText(selectedProviderId),
    selectedModel: normalizeText(selectedModel),
    contextPackage,
    memoryPolicy,
  }
}

function toErrorMessage(error) {
  if (!error)
    return ''
  if (typeof error === 'string')
    return error
  return normalizeText(error.message || String(error))
}

function createPluginError(code, message) {
  const error = new Error(message || AI_ERROR_MESSAGES[code] || AI_ERROR_MESSAGES.UNKNOWN)
  error.code = code
  return error
}

async function getAuthState() {
  if (!touchChannel?.send)
    return null

  try {
    return await touchChannel.send(AUTH_SESSION_GET_STATE_EVENT)
  }
  catch (error) {
    logger?.warn?.('[touch-intelligence] failed to resolve auth state', error)
    return null
  }
}

async function ensureSignedIn() {
  const state = await getAuthState()
  return state?.isSignedIn === true
}

function normalizeInvokeError(error) {
  const rawCode = normalizeText(error?.code).toUpperCase()
  const rawMessage = toErrorMessage(error)
  const lower = rawMessage.toLowerCase()

  let code = AI_ERROR_MESSAGES[rawCode] ? rawCode : 'UNKNOWN'
  if (code === 'UNKNOWN') {
    if (
      lower.includes('not authenticated')
      || lower.includes('auth required')
      || lower.includes('nexus_auth_required')
      || lower.includes('未登录')
      || lower.includes('需要登录')
    ) {
      code = 'AUTH_REQUIRED'
    }
    else if (
      lower.includes('permission')
      || lower.includes('denied')
      || lower.includes('intelligence.basic')
    ) {
      code = 'PERMISSION_DENIED'
    }
    else if (lower.includes('quota') || lower.includes('rate limit') || lower.includes('too many')) {
      code = 'QUOTA_EXCEEDED'
    }
    else if (
      lower.includes('provider')
      || lower.includes('api key')
      || lower.includes('not configured')
      || lower.includes('provider_config_unavailable')
      || lower.includes('no enabled providers')
      || lower.includes('no providers available')
    ) {
      code = 'PROVIDER_UNAVAILABLE'
    }
    else if (
      lower.includes('unsupported')
      || lower.includes('not supported')
      || lower.includes('capability not supported')
      || lower.includes('model does not support')
    ) {
      code = 'MODEL_UNSUPPORTED'
    }
    else if (lower.includes('empty response') || lower.includes('未返回可用内容')) {
      code = 'EMPTY_RESPONSE'
    }
  }

  const fallback = AI_ERROR_MESSAGES[code] || AI_ERROR_MESSAGES.UNKNOWN
  const detail = rawMessage && rawMessage !== fallback ? `：${truncateText(rawMessage, 120)}` : ''
  return {
    code,
    message: `${fallback}${detail}`,
  }
}

async function ensurePermission(permissionId, reason) {
  if (!permission?.check || !permission?.request)
    return false

  try {
    const hasPermission = await permission.check(permissionId)
    if (hasPermission)
      return true

    const granted = await permission.request(permissionId, reason)
    return Boolean(granted)
  }
  catch (error) {
    logger?.warn?.('[touch-intelligence] Failed to request permission', error)
    return false
  }
}

function buildIntelligenceMeta(details = {}) {
  const meta = {
    entry: ENTRY_ID,
    source: HANDOFF_SOURCE,
  }
  const status = normalizeText(details.status)
  const stage = normalizeText(details.stage)
  const requestId = normalizeText(details.requestId)
  const capabilityId = normalizeText(details.capabilityId)
  const provider = normalizeText(details.provider)
  const model = normalizeText(details.model)
  const traceId = normalizeText(details.traceId)
  const handoffSessionId = normalizeText(details.handoffSessionId)
  const errorCode = normalizeText(details.errorCode)
  const errorMessage = normalizeText(details.errorMessage)
  const inputKinds = normalizeStringList(details.inputKinds)
  const capabilities = normalizeStringList(details.capabilities)
  const contextPackage = details.contextPackage && typeof details.contextPackage === 'object'
    ? details.contextPackage
    : null
  const memoryPolicy = details.memoryPolicy && typeof details.memoryPolicy === 'object'
    ? details.memoryPolicy
    : null
  const latency = normalizeLatency(details.latency)

  if (status)
    meta.status = status
  if (stage)
    meta.stage = stage
  if (requestId)
    meta.requestId = requestId
  if (capabilityId)
    meta.capabilityId = capabilityId
  if (capabilities.length > 0)
    meta.capabilities = capabilities
  if (provider)
    meta.provider = provider
  if (model)
    meta.model = model
  if (traceId)
    meta.traceId = traceId
  if (latency !== undefined)
    meta.latency = latency
  if (inputKinds.length > 0)
    meta.inputKinds = inputKinds
  if (errorCode)
    meta.errorCode = errorCode
  if (errorMessage)
    meta.errorMessage = errorMessage
  if (handoffSessionId) {
    meta.handoffSessionId = handoffSessionId
    meta.sessionId = handoffSessionId
  }
  if (contextPackage) {
    meta.contextPackage = contextPackage
    if (contextPackage.traceId)
      meta.contextTraceId = contextPackage.traceId
    if (contextPackage.sessionId)
      meta.contextSessionId = contextPackage.sessionId
    if (contextPackage.id)
      meta.contextPackageId = contextPackage.id
  }
  if (memoryPolicy) {
    meta.memoryPolicy = memoryPolicy
    if (memoryPolicy.status)
      meta.memoryPolicyStatus = memoryPolicy.status
    if (memoryPolicy.reason)
      meta.memoryPolicyReason = memoryPolicy.reason
  }

  return meta
}

function buildInfoItem({
  id,
  featureId,
  title,
  subtitle,
  description,
  accessory,
  payload,
  actionId,
  status,
  handoffSessionId,
  intelligence,
}) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)

  if (description)
    builder.setDescription(description)
  if (accessory)
    builder.setAccessory(accessory)

  const meta = {
    pluginName: PLUGIN_NAME,
    featureId,
    status,
    keepCoreBoxOpen: true,
    intelligence: buildIntelligenceMeta({
      ...intelligence,
      status,
      handoffSessionId,
    }),
  }

  if (actionId) {
    meta.defaultAction = ACTION_ID
    meta.actionId = actionId
    meta.payload = payload
  }

  return builder.setMeta(meta).build()
}

function resolveDisplayPrompt(prompt, hasImage) {
  const normalizedPrompt = normalizePrompt(prompt)
  if (normalizedPrompt)
    return normalizedPrompt
  return hasImage ? '分析剪贴板图片' : ''
}

function buildWidgetMessages(state = {}) {
  const messages = cloneHistory(state.history).map((message, index) => ({
    id: `${normalizeText(state.requestId) || 'history'}-${index}`,
    role: message.role,
    content: message.content,
    status: 'complete',
  }))
  const prompt = normalizeText(state.prompt)
  const answer = normalizeText(state.answer)
  if (prompt) {
    messages.push({
      id: `${normalizeText(state.requestId) || 'draft'}-user`,
      role: 'user',
      content: prompt,
      status: 'complete',
      attachments: state.imageDataUrl
        ? [
            {
              type: 'image',
              title: '剪贴板图片',
              detail: state.ocrText ? '已作为 OCR 上下文引用' : '作为图片上下文引用',
              preview: state.imageDataUrl,
            },
          ]
        : [],
    })
  }
  if (answer) {
    messages.push({
      id: `${normalizeText(state.requestId) || 'draft'}-assistant`,
      role: 'assistant',
      content: answer,
      status: state.status === 'chat-pending' ? 'streaming' : 'complete',
    })
  }
  else if (state.status === 'error') {
    messages.push({
      id: `${normalizeText(state.requestId) || 'draft'}-assistant-error`,
      role: 'assistant',
      content: normalizeText(state.errorMessage) || AI_ERROR_MESSAGES.UNKNOWN,
      status: 'error',
    })
  }
  else if (state.status === 'ocr-pending' || state.status === 'chat-pending') {
    messages.push({
      id: `${normalizeText(state.requestId) || 'draft'}-assistant-pending`,
      role: 'assistant',
      content: '',
      status: 'streaming',
    })
  }
  return messages
}

function buildImageContext(state = {}) {
  const hasImage = Boolean(state.imageDataUrl || state.ocrText || normalizeStringList(state.inputKinds).includes(INPUT_TYPE_IMAGE))
  if (!hasImage)
    return null

  const errorCode = normalizeText(state.errorCode)
  const unsupported = errorCode === 'MODEL_UNSUPPORTED' || errorCode === 'PROVIDER_UNAVAILABLE'
  return {
    type: 'image',
    title: '剪贴板图片上下文',
    preview: normalizeText(state.imageDataUrl),
    ocrText: normalizeText(state.ocrText),
    status: unsupported ? 'unsupported' : state.ocrText ? 'ready' : 'attached',
    note: unsupported
      ? '当前默认模型或 Provider 不支持图片/OCR，请切换支持 vision.ocr 的模型后重试。'
      : state.ocrText
        ? '图片已识别为文字上下文并参与回答。'
        : '图片将作为上下文参与本次提问。',
  }
}

function buildWidgetPayload(state = {}) {
  const selected = normalizeModelSelection({
    providerId: state.selectedProviderId,
    model: state.selectedModel,
  })
  return {
    requestId: normalizeText(state.requestId),
    prompt: normalizeText(state.prompt),
    answer: normalizeText(state.answer),
    provider: normalizeText(state.provider),
    model: normalizeText(state.model),
    traceId: normalizeText(state.traceId),
    latency: normalizeLatency(state.latency),
    handoffSessionId: normalizeText(state.handoffSessionId),
    status: normalizeText(state.status) || 'idle',
    stage: normalizeText(state.stage),
    capabilityId: normalizeText(state.capabilityId),
    inputKinds: normalizeStringList(state.inputKinds),
    errorCode: normalizeText(state.errorCode),
    errorMessage: normalizeText(state.errorMessage),
    copyStatus: normalizeText(state.copyStatus),
    copyError: normalizeText(state.copyError),
    copyRecovery: normalizeText(state.copyRecovery),
    contextPackage: state.contextPackage && typeof state.contextPackage === 'object'
      ? state.contextPackage
      : null,
    memoryPolicy: state.memoryPolicy && typeof state.memoryPolicy === 'object'
      ? state.memoryPolicy
      : null,
    modelOptions: normalizeModelOptions(state.modelOptions),
    selectedProviderId: selected.providerId,
    selectedModel: selected.model,
    messages: buildWidgetMessages(state),
    imageContext: buildImageContext(state),
    streamMode: 'visual-reveal',
    updatedAt: Date.now(),
  }
}

function resolveWidgetAction(state = {}) {
  const status = normalizeText(state.status)
  if (status === 'ready-to-send') {
    return {
      actionId: 'send',
      payload: {
        prompt: state.prompt,
        draftId: state.draftId,
        inputKinds: state.inputKinds,
        selectedProviderId: state.selectedProviderId,
        selectedModel: state.selectedModel,
      },
    }
  }
  if (status === 'ready') {
    return {
      actionId: 'copy-answer',
      payload: {
        prompt: state.prompt,
        requestId: state.requestId,
        answer: state.answer,
        provider: state.provider,
        model: state.model,
        traceId: state.traceId,
        latency: state.latency,
        handoffSessionId: state.handoffSessionId,
        inputKinds: state.inputKinds,
        contextPackage: state.contextPackage,
        memoryPolicy: state.memoryPolicy,
        selectedProviderId: state.selectedProviderId,
        selectedModel: state.selectedModel,
      },
    }
  }
  if (status === 'error') {
    return {
      actionId: 'retry',
      payload: {
        prompt: state.prompt,
        history: cloneHistory(state.history),
        draftId: state.draftId,
        inputKinds: state.inputKinds,
        errorCode: state.errorCode,
        errorMessage: state.errorMessage,
        handoffSessionId: state.handoffSessionId,
        contextPackage: state.contextPackage,
        memoryPolicy: state.memoryPolicy,
        selectedProviderId: state.selectedProviderId,
        selectedModel: state.selectedModel,
      },
    }
  }
  return null
}

function buildWidgetItem(featureId, state = {}) {
  const session = getSession(featureId)
  const status = normalizeText(state.status) || 'idle'
  const prompt = resolveDisplayPrompt(state.prompt, Boolean(state.imageDataUrl || state.ocrText))
  const title = prompt ? `智能问答：${truncateText(prompt, 48)}` : '智能问答'
  const action = resolveWidgetAction({ ...state, prompt: prompt || state.prompt })
  const subtitleMap = {
    'idle': '等待 AI 输入',
    'ready-to-send': '按回车发送到 AI',
    'ocr-pending': '正在识别剪贴板图片…',
    'chat-pending': 'AI 正在思考…',
    'ready': '回答已生成',
    'error': 'AI 请求失败',
  }

  return new TuffItemBuilder(WIDGET_ITEM_ID)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitleMap[status] || '智能问答')
    .setIcon(ICON)
    .setCustomRender('vue', getMakeWidgetId()(PLUGIN_NAME, featureId), buildWidgetPayload({
      modelOptions: state.modelOptions ?? session.modelOptions,
      selectedProviderId: state.selectedProviderId ?? session.selectedProviderId,
      selectedModel: state.selectedModel ?? session.selectedModel,
      ...state,
      prompt: prompt || state.prompt,
    }))
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      status,
      keepCoreBoxOpen: true,
      ...(action
        ? {
            defaultAction: ACTION_ID,
            actionId: action.actionId,
            payload: action.payload,
          }
        : {}),
      intelligence: buildIntelligenceMeta({
        status,
        stage: state.stage,
        requestId: state.requestId,
        capabilityId: state.capabilityId,
        provider: state.provider,
        model: state.model,
        traceId: state.traceId,
        latency: state.latency,
        inputKinds: state.inputKinds,
        errorCode: state.errorCode,
        errorMessage: state.errorMessage,
        handoffSessionId: state.handoffSessionId,
        contextPackage: state.contextPackage,
        memoryPolicy: state.memoryPolicy,
        selectedProviderId: state.selectedProviderId,
        selectedModel: state.selectedModel,
      }),
    })
    .build()
}

async function pushWidgetState(featureId, state = {}) {
  try {
    plugin.feature.clearItems()
    const item = buildWidgetItem(featureId, state)
    await plugin.feature.pushItems([item])
    return item
  }
  catch (error) {
    logger?.warn?.('[touch-intelligence] failed to push widget state', error)
    return null
  }
}

function buildSendItem(featureId, draft) {
  const hasImage = Boolean(draft.imageDataUrl || draft.ocrText)
  const prompt = resolveDisplayPrompt(draft.prompt, hasImage)
  const subtitle = hasImage
    ? '按回车先 OCR，再发送到 AI'
    : '按回车发送到 AI'

  return buildInfoItem({
    id: `${featureId}-send`,
    featureId,
    title: prompt,
    subtitle,
    description: buildCapabilitySummary(hasImage ? ['vision.ocr', 'text.chat'] : ['text.chat']),
    accessory: hasImage ? 'OCR + AI' : 'AI Ask',
    actionId: 'send',
    payload: {
      prompt: draft.prompt,
      draftId: draft.draftId,
      inputKinds: draft.inputKinds,
      selectedProviderId: draft.selectedProviderId,
      selectedModel: draft.selectedModel,
    },
    status: 'ready-to-send',
    intelligence: {
      stage: hasImage ? 'ocr' : 'chat',
      capabilities: hasImage ? ['vision.ocr', 'text.chat'] : ['text.chat'],
      inputKinds: draft.inputKinds,
    },
  })
}

function buildPendingItem(
  featureId,
  prompt,
  requestId,
  stage = 'chat',
  handoffSessionId = '',
  context = {},
) {
  const isOcr = stage === 'ocr'
  const capabilityId = isOcr ? 'vision.ocr' : 'text.chat'
  return buildInfoItem({
    id: `${featureId}-${isOcr ? 'ocr-pending' : 'chat-pending'}-${requestId}`,
    featureId,
    title: prompt,
    subtitle: isOcr ? '正在识别剪贴板图片…' : 'AI 正在思考…',
    description: isOcr ? '正在调用 vision.ocr，完成后继续 text.chat。' : '正在调用 text.chat。',
    accessory: capabilityId,
    status: isOcr ? 'ocr-pending' : 'chat-pending',
    handoffSessionId,
    intelligence: {
      requestId,
      stage,
      capabilityId,
      inputKinds: context.inputKinds,
    },
  })
}

function buildReadyItem(featureId, state) {
  const modelInfo = [state.provider, state.model].filter(Boolean).join(' / ')
  const latencyText = formatLatency(state.latency)
  const handoffText = state.handoffSessionId ? '已接入交接会话' : ''
  const traceText = state.traceId ? `Trace ${state.traceId}` : ''
  const subtitle = [truncateText(state.answer, 72), modelInfo, latencyText]
    .filter(Boolean)
    .join(' · ')
  const description = [traceText, handoffText].filter(Boolean).join(' · ')

  return buildInfoItem({
    id: `${featureId}-ready-${state.requestId}`,
    featureId,
    title: state.prompt || 'AI 回答',
    subtitle: subtitle || '回答已生成',
    description,
    accessory: modelInfo || 'text.chat',
    actionId: 'copy-answer',
    payload: {
      prompt: state.prompt,
      requestId: state.requestId,
      answer: state.answer,
      provider: state.provider,
      model: state.model,
      traceId: state.traceId,
      latency: state.latency,
      handoffSessionId: state.handoffSessionId,
      inputKinds: state.inputKinds,
    },
    status: 'ready',
    handoffSessionId: state.handoffSessionId,
    intelligence: {
      requestId: state.requestId,
      capabilityId: 'text.chat',
      provider: state.provider,
      model: state.model,
      traceId: state.traceId,
      latency: state.latency,
      inputKinds: state.inputKinds,
    },
  })
}

function buildErrorItem(featureId, prompt, error, history = [], retryContext = {}) {
  const normalizedError = typeof error === 'object' && error?.code && error?.message
    ? error
    : normalizeInvokeError(error)

  return buildInfoItem({
    id: `${featureId}-error-${Date.now()}`,
    featureId,
    title: prompt ? `AI 请求失败：${truncateText(prompt, 48)}` : 'AI 请求失败',
    subtitle: truncateText(normalizedError.message, 120),
    description: buildCapabilitySummary([
      retryContext.capabilityId || 'text.chat',
      normalizedError.code,
    ]),
    accessory: normalizedError.code,
    actionId: 'retry',
    payload: {
      prompt,
      history: cloneHistory(history),
      draftId: retryContext.draftId,
      inputKinds: retryContext.inputKinds,
      errorCode: normalizedError.code,
      errorMessage: normalizedError.message,
      handoffSessionId: retryContext.handoffSessionId,
      selectedProviderId: retryContext.selectedProviderId,
      selectedModel: retryContext.selectedModel,
    },
    status: 'error',
    handoffSessionId: retryContext.handoffSessionId,
    intelligence: {
      stage: 'error',
      capabilityId: retryContext.capabilityId || 'text.chat',
      inputKinds: retryContext.inputKinds,
      errorCode: normalizedError.code,
      errorMessage: normalizedError.message,
    },
  })
}

function getQueryInputs(query) {
  if (!query || typeof query !== 'object' || !Array.isArray(query.inputs))
    return []
  return query.inputs
}

function extractImageDataUrl(query) {
  const imageInput = getQueryInputs(query).find((input) => {
    return input?.type === INPUT_TYPE_IMAGE
      && typeof input?.content === 'string'
      && input.content.startsWith('data:image/')
  })
  return imageInput?.content || ''
}

function extractInputKinds(query) {
  const inputKinds = new Set()
  if (normalizeText(getQueryText(query)))
    inputKinds.add(INPUT_TYPE_TEXT)

  for (const input of getQueryInputs(query)) {
    if (typeof input?.type === 'string' && input.type.trim()) {
      inputKinds.add(input.type.trim())
    }
  }

  return Array.from(inputKinds)
}

function extractQueryContext(query, options = {}) {
  const rawText = getQueryText(query)
  const prompt = normalizePrompt(rawText)
  const imageDataUrl = extractImageDataUrl(query)
  const isExplicitAiQuery = hasAiPrefix(rawText)
  const forceImageOcr = options?.forceImageOcr === true
  const shouldUseOcr = Boolean(imageDataUrl && prompt && (isExplicitAiQuery || forceImageOcr))
  const shouldShowEntry = Boolean(prompt || shouldUseOcr)

  return {
    rawText,
    prompt,
    imageDataUrl: shouldUseOcr ? imageDataUrl : '',
    inputKinds: extractInputKinds(query),
    shouldShowEntry,
  }
}

function storeDraft(session, draft) {
  const selected = normalizeModelSelection({
    providerId: draft.selectedProviderId ?? session.selectedProviderId,
    model: draft.selectedModel ?? session.selectedModel,
  })
  const draftId = draft.draftId || crypto.randomUUID()
  const normalizedDraft = {
    draftId,
    prompt: normalizePrompt(draft.prompt),
    imageDataUrl: normalizeText(draft.imageDataUrl),
    ocrText: normalizeText(draft.ocrText),
    inputKinds: Array.isArray(draft.inputKinds) ? draft.inputKinds.filter(Boolean) : [],
    selectedProviderId: selected.providerId,
    selectedModel: selected.model,
  }
  session.drafts.set(draftId, normalizedDraft)

  while (session.drafts.size > MAX_DRAFTS) {
    const firstKey = session.drafts.keys().next().value
    session.drafts.delete(firstKey)
  }

  return normalizedDraft
}

function resolveDraft(session, payload, prompt) {
  const draftId = normalizeText(payload?.draftId)
  if (draftId && session.drafts.has(draftId)) {
    return session.drafts.get(draftId)
  }

  return storeDraft(session, {
    draftId,
    prompt,
    inputKinds: Array.isArray(payload?.inputKinds) ? payload.inputKinds : [],
    selectedProviderId: payload?.selectedProviderId,
    selectedModel: payload?.selectedModel,
  })
}

function normalizeModelOptions(values) {
  if (!Array.isArray(values))
    return []

  return values
    .map((option) => {
      const providerId = normalizeText(option?.providerId)
      const providerName = normalizeText(option?.providerName) || providerId
      const providerType = normalizeText(option?.providerType)
      const defaultModel = normalizeText(option?.defaultModel)
      const models = normalizeStringList(option?.models)
      if (!providerId || !models.length)
        return null
      return {
        providerId,
        providerName,
        providerType,
        models,
        defaultModel,
        capabilities: normalizeStringList(option?.capabilities),
        available: option?.available !== false,
      }
    })
    .filter(Boolean)
}

async function resolveModelOptions(client) {
  if (!client?.getProviderModelOptions)
    return []
  try {
    return normalizeModelOptions(await client.getProviderModelOptions({ capabilityId: 'text.chat' }))
  }
  catch (error) {
    logger?.warn?.('[touch-intelligence] failed to load model options', error)
    return []
  }
}

async function refreshSessionModelOptions(session, client) {
  const options = await resolveModelOptions(client)
  if (options.length) {
    session.modelOptions = options
  }
  return session.modelOptions
}

async function dispatchPrompt({
  featureId,
  prompt,
  requestId,
  historySnapshot,
  imageDataUrl,
  ocrText,
  inputKinds,
  draftId,
  selectedProviderId,
  selectedModel,
}) {
  const resolvedFeatureId = resolveFeatureId(featureId)
  const normalizedPrompt = normalizePrompt(prompt)
  const session = getSession(resolvedFeatureId)
  let resolvedHistory = cloneHistory(historySnapshot)
  let resolvedOcrText = normalizeText(ocrText)
  const selected = normalizeModelSelection({ providerId: selectedProviderId, model: selectedModel })
  const displayPrompt = resolveDisplayPrompt(
    normalizedPrompt,
    Boolean(imageDataUrl || resolvedOcrText),
  )
  let contextPackage = null
  let memoryPolicy = null

  if (!displayPrompt)
    return

  try {
    const client = resolveIntelligenceClient()
    const modelOptions = await refreshSessionModelOptions(session, client)
    const handoffSessionId = await ensureHandoffSession(client, session, {
      featureId: resolvedFeatureId,
      prompt: displayPrompt,
      history: resolvedHistory,
      requestId,
      inputKinds,
    })
    if (session.history.length > resolvedHistory.length) {
      resolvedHistory = cloneHistory(session.history)
    }
    const contextState = await prepareContextTurnForAsk(client, {
      featureId: resolvedFeatureId,
      prompt: displayPrompt,
      requestId,
      inputKinds,
      handoffSessionId,
      selectedProviderId: selected.providerId,
      selectedModel: selected.model,
    })
    contextPackage = contextState?.package || null
    memoryPolicy = await evaluateMemoryPolicyForAsk(client, {
      prompt: displayPrompt,
      contextState,
    })

    if (imageDataUrl && !resolvedOcrText) {
      const ocrPayload = buildOcrPayload(imageDataUrl)
      const ocrResult = await client.invoke(
        'vision.ocr',
        ocrPayload,
        buildInvokeOptions({
          featureId: resolvedFeatureId,
          requestId,
          capabilityId: 'vision.ocr',
          inputKinds,
          sessionId: handoffSessionId,
          contextPackage,
          memoryPolicy,
        }),
      )
      resolvedOcrText = normalizeText(ocrResult?.result?.text)

      if (!resolvedOcrText) {
        throw createPluginError('OCR_EMPTY')
      }

      if (!canCommitResponse(session, requestId))
        return

      if (draftId && session.drafts.has(draftId)) {
        storeDraft(session, {
          draftId,
          prompt: normalizedPrompt,
          ocrText: resolvedOcrText,
          inputKinds,
          selectedProviderId: selected.providerId,
          selectedModel: selected.model,
        })
      }

      await pushWidgetState(resolvedFeatureId, {
        prompt: displayPrompt,
        requestId,
        status: 'chat-pending',
        stage: 'chat',
        capabilityId: 'text.chat',
        handoffSessionId,
        inputKinds,
        imageDataUrl,
        ocrText: resolvedOcrText,
        history: resolvedHistory,
        modelOptions,
        selectedProviderId: selected.providerId,
        selectedModel: selected.model,
        contextPackage,
        memoryPolicy,
      })
    }

    const chatPrompt = normalizedPrompt || '请总结剪贴板图片中的文字。'
    const payload = buildInvokePayload(chatPrompt, resolvedHistory, { ocrText: resolvedOcrText })
    const invokeOptions = buildModelSelectionInvokeOptions(
      buildInvokeOptions({
        featureId: resolvedFeatureId,
        requestId,
        capabilityId: 'text.chat',
        inputKinds,
        sessionId: handoffSessionId,
        contextPackage,
        memoryPolicy,
      }),
      selected,
    )
    const streamed = await streamChatAnswer({
      client,
      featureId: resolvedFeatureId,
      requestId,
      payload,
      invokeOptions,
      displayPrompt,
      handoffSessionId,
      inputKinds,
      imageDataUrl,
      ocrText: resolvedOcrText,
      history: resolvedHistory,
      session,
      selectedProviderId: selected.providerId,
      selectedModel: selected.model,
      modelOptions,
      contextPackage,
      memoryPolicy,
    })
    const mapped = streamed || mapInvokeResult(
      await client.invoke('text.chat', payload, invokeOptions),
      displayPrompt,
      requestId,
      handoffSessionId,
      inputKinds,
      contextPackage,
      memoryPolicy,
    )

    if (!mapped.answer) {
      throw createPluginError('EMPTY_RESPONSE')
    }

    if (!canCommitResponse(session, requestId))
      return

    session.history = keepNewestBusinessMessages([
      ...resolvedHistory,
      { role: 'user', content: displayPrompt },
      { role: 'assistant', content: mapped.answer },
    ])
    await saveStoredHistory(resolvedFeatureId, session.history)
    await updateHandoffSession(client, session, {
      featureId: resolvedFeatureId,
      prompt: displayPrompt,
      history: resolvedHistory,
      answer: mapped.answer,
      requestId,
      inputKinds,
    })
    session.activeRequestId = ''
    session.uiRequestId = requestId
    session.lastReadyDraftId = ''
    session.lastReadyPromptKey = ''

    await pushWidgetState(resolvedFeatureId, {
      ...mapped,
      status: 'ready',
      stage: 'chat',
      capabilityId: 'text.chat',
      imageDataUrl,
      ocrText: resolvedOcrText,
      history: resolvedHistory,
      modelOptions,
      selectedProviderId: selected.providerId,
      selectedModel: selected.model,
      contextPackage,
      memoryPolicy,
    })
  }
  catch (error) {
    if (!canCommitResponse(session, requestId))
      return

    session.activeRequestId = ''
    session.uiRequestId = requestId
    session.lastReadyDraftId = ''
    session.lastReadyPromptKey = ''
    const normalizedError = normalizeInvokeError(error)
    logger?.error?.('[touch-intelligence] invoke failed', error)
    await pushWidgetState(resolvedFeatureId, {
      prompt: displayPrompt,
      requestId,
      status: 'error',
      stage: 'error',
      capabilityId: imageDataUrl && !resolvedOcrText ? 'vision.ocr' : 'text.chat',
      inputKinds,
      imageDataUrl,
      ocrText: resolvedOcrText,
      errorCode: normalizedError.code,
      errorMessage: normalizedError.message,
      handoffSessionId: session.handoffSessionId,
      history: resolvedHistory,
      modelOptions: session.modelOptions,
      selectedProviderId: selected.providerId,
      selectedModel: selected.model,
      contextPackage: contextPackage ?? null,
      memoryPolicy: memoryPolicy ?? null,
    })
  }
}

async function copyAnswer(answer) {
  if (!clipboard?.writeText)
    return false

  const canCopy = await ensurePermission('clipboard.write', '需要剪贴板权限以复制 AI 回答')
  if (!canCopy)
    return false

  try {
    await clipboard.writeText(answer)
    return true
  }
  catch (error) {
    logger?.warn?.('[touch-intelligence] failed to copy answer', error)
    return false
  }
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const resolvedFeatureId = resolveFeatureId(featureId)
      const session = getSession(resolvedFeatureId)
      const queryContext = extractQueryContext(query, {
        forceImageOcr: resolvedFeatureId === DEFAULT_FEATURE_ID,
      })
      const storedHistory = await loadStoredHistory(resolvedFeatureId)
      if (storedHistory.length > session.history.length) {
        session.history = storedHistory
      }

      if (!queryContext.shouldShowEntry) {
        const client = resolveIntelligenceClient()
        await refreshSessionModelOptions(session, client)
        session.lastReadyDraftId = ''
        session.lastReadyPromptKey = ''
        await pushWidgetState(resolvedFeatureId, {
          status: 'idle',
          stage: 'chat',
          capabilityId: 'text.chat',
          history: cloneHistory(session.history),
          handoffSessionId: session.handoffSessionId,
          modelOptions: session.modelOptions,
          selectedProviderId: session.selectedProviderId,
          selectedModel: session.selectedModel,
        })
        return true
      }

      const draft = storeDraft(session, queryContext)
      const displayPrompt = resolveDisplayPrompt(draft.prompt, Boolean(draft.imageDataUrl || draft.ocrText))
      if (!displayPrompt)
        return true

      const hasPermission = await ensurePermission(
        'intelligence.basic',
        '需要 AI 权限以执行智能问答',
      )
      if (!hasPermission) {
        const normalizedError = normalizeInvokeError(createPluginError('PERMISSION_DENIED'))
        await pushWidgetState(resolvedFeatureId, {
          ...draft,
          prompt: displayPrompt,
          status: 'error',
          stage: 'error',
          errorCode: normalizedError.code,
          errorMessage: normalizedError.message,
          handoffSessionId: session.handoffSessionId,
          history: cloneHistory(session.history),
        })
        return true
      }

      const requestId = crypto.randomUUID()
      markPendingRequest(session, requestId)
      session.lastReadyDraftId = ''
      session.lastReadyPromptKey = ''
      await pushWidgetState(resolvedFeatureId, {
        ...draft,
        prompt: displayPrompt,
        requestId,
        status: draft.imageDataUrl ? 'ocr-pending' : 'chat-pending',
        stage: draft.imageDataUrl ? 'ocr' : 'chat',
        capabilityId: draft.imageDataUrl ? 'vision.ocr' : 'text.chat',
        handoffSessionId: session.handoffSessionId,
        history: cloneHistory(session.history),
        modelOptions: session.modelOptions,
      })
      void dispatchPrompt({
        featureId: resolvedFeatureId,
        prompt: draft.prompt,
        requestId,
        historySnapshot: cloneHistory(session.history),
        imageDataUrl: draft.imageDataUrl,
        ocrText: draft.ocrText,
        inputKinds: draft.inputKinds,
        draftId: draft.draftId,
        selectedProviderId: draft.selectedProviderId,
        selectedModel: draft.selectedModel,
      })
      return true
    }
    catch (error) {
      const normalizedError = normalizeInvokeError(error)
      logger?.error?.('[touch-intelligence] Failed to handle feature', error)
      await pushWidgetState(featureId, {
        status: 'error',
        stage: 'error',
        errorCode: normalizedError.code,
        errorMessage: normalizedError.message,
      })
      return true
    }
  },

  async onItemAction(item, context = {}) {
    try {
      if (item?.meta?.defaultAction !== ACTION_ID)
        return

      const actionId = context?.actionId || item.meta?.actionId
      const payload = item.meta?.payload || {}
      const prompt = normalizePrompt(payload.prompt)
      const featureId = resolveFeatureId(item.meta?.featureId)
      const session = getSession(featureId)

      if (actionId === 'copy-answer') {
        const answer = normalizeText(payload.answer)
        if (!answer)
          return

        const copied = await copyAnswer(answer)
        if (!copied) {
          const failedItem = await pushWidgetState(featureId, {
            prompt,
            answer,
            provider: payload.provider,
            model: payload.model,
            traceId: payload.traceId,
            latency: payload.latency,
            handoffSessionId: payload.handoffSessionId,
            inputKinds: payload.inputKinds,
            status: 'ready',
            stage: 'chat',
            capabilityId: 'text.chat',
            copyStatus: 'failed',
            copyError: '复制失败：缺少 clipboard.write 权限',
            copyRecovery: '请在插件权限中允许 clipboard.write 后重试。',
            history: cloneHistory(session.history),
            modelOptions: session.modelOptions,
            selectedProviderId: payload.selectedProviderId,
            selectedModel: payload.selectedModel,
            contextPackage: payload.contextPackage,
          })
          return {
            externalAction: true,
            success: false,
            shouldActivate: Boolean(failedItem),
            activation: failedItem
              ? {
                  id: SOURCE_ID,
                  meta: {
                    pluginName: PLUGIN_NAME,
                    featureId,
                    feature: failedItem,
                  },
                  hideResults: false,
                  showInput: true,
                  forceMax: true,
                }
              : undefined,
            status: 'blocked',
            reason: 'permission-denied',
            message: '复制失败：缺少 clipboard.write 权限',
          }
        }

        return { externalAction: true, status: 'started' }
      }

      if (actionId === 'select-model') {
        const selected = normalizeModelSelection({
          providerId: payload.selectedProviderId,
          model: payload.selectedModel,
        })
        session.selectedProviderId = selected.providerId
        session.selectedModel = selected.model

        const client = resolveIntelligenceClient()
        await refreshSessionModelOptions(session, client)

        await pushWidgetState(featureId, {
          prompt,
          requestId: payload.requestId,
          answer: payload.answer,
          provider: payload.provider,
          model: payload.model,
          traceId: payload.traceId,
          latency: payload.latency,
          status: normalizeText(payload.status) || 'idle',
          stage: normalizeText(payload.stage) || 'chat',
          capabilityId: normalizeText(payload.capabilityId) || 'text.chat',
          errorCode: payload.errorCode,
          errorMessage: payload.errorMessage,
          copyStatus: payload.copyStatus,
          copyError: payload.copyError,
          copyRecovery: payload.copyRecovery,
          handoffSessionId: session.handoffSessionId,
          inputKinds: Array.isArray(payload.inputKinds) ? payload.inputKinds : [],
          imageDataUrl: payload.imageDataUrl,
          ocrText: payload.ocrText,
          history: cloneHistory(session.history),
          modelOptions: session.modelOptions,
          selectedProviderId: session.selectedProviderId,
          selectedModel: session.selectedModel,
          contextPackage: payload.contextPackage,
        })

        return { externalAction: true }
      }

      if (actionId === 'send' || actionId === 'retry') {
        const draft = resolveDraft(session, payload, prompt)
        const hasImageContext = Boolean(draft.imageDataUrl || draft.ocrText)
        const displayPrompt = resolveDisplayPrompt(draft.prompt, hasImageContext)

        if (!displayPrompt)
          return

        const hasPermission = await ensurePermission(
          'intelligence.basic',
          '需要 AI 权限以执行智能问答',
        )
        if (!hasPermission) {
          const normalizedError = normalizeInvokeError(createPluginError('PERMISSION_DENIED'))
          await pushWidgetState(featureId, {
            prompt: displayPrompt,
            status: 'error',
            stage: 'error',
            inputKinds: draft.inputKinds,
            errorCode: normalizedError.code,
            errorMessage: normalizedError.message,
            handoffSessionId: session.handoffSessionId,
          })
          return {
            externalAction: true,
            success: false,
            message: normalizedError.message,
          }
        }

        const historySnapshot = actionId === 'retry' && Array.isArray(payload.history)
          ? cloneHistory(payload.history)
          : cloneHistory(session.history)

        const requestId = crypto.randomUUID()
        markPendingRequest(session, requestId)
        await pushWidgetState(featureId, {
          prompt: displayPrompt,
          requestId,
          status: draft.imageDataUrl ? 'ocr-pending' : 'chat-pending',
          stage: draft.imageDataUrl ? 'ocr' : 'chat',
          capabilityId: draft.imageDataUrl ? 'vision.ocr' : 'text.chat',
          handoffSessionId: session.handoffSessionId,
          inputKinds: draft.inputKinds,
          modelOptions: session.modelOptions,
          selectedProviderId: draft.selectedProviderId,
          selectedModel: draft.selectedModel,
        })
        void dispatchPrompt({
          featureId,
          prompt: draft.prompt,
          requestId,
          historySnapshot,
          imageDataUrl: draft.imageDataUrl,
          ocrText: draft.ocrText,
          inputKinds: draft.inputKinds,
          draftId: draft.draftId,
          selectedProviderId: draft.selectedProviderId,
          selectedModel: draft.selectedModel,
        })
        return { externalAction: true }
      }
    }
    catch (error) {
      logger?.error?.('[touch-intelligence] Action failed', error)
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    buildInvokePayload,
    buildInvokeOptions,
    buildErrorItem,
    buildWidgetItem,
    buildWidgetPayload,
    buildHandoffContext,
    buildHandoffSessionId,
    buildIntelligenceMeta,
    buildOcrPayload,
    buildPendingItem,
    buildReadyItem,
    buildSendItem,
    extractImageDataUrl,
    extractInputKinds,
    extractQueryContext,
    formatLatency,
    getAuthState,
    ensureSignedIn,
    mapInvokeResult,
    normalizeInvokeError,
    normalizeLatency,
    normalizeModelOptions,
    normalizeModelSelection,
    normalizePrompt,
    buildModelSelectionInvokeOptions,
    resolveIntelligenceClient,
  },
}
