const { plugin, clipboard, logger, TuffItemBuilder, permission } = globalThis
const crypto = require('node:crypto')

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
const HANDOFF_SOURCE = 'corebox.touch-intelligence'
const HANDOFF_SESSION_PREFIX = 'corebox_ai_ask'
const INPUT_TYPE_TEXT = 'text'
const INPUT_TYPE_IMAGE = 'image'

const AI_ERROR_MESSAGES = {
  PERMISSION_DENIED: '权限已拒绝，请在插件权限中授予 intelligence.basic',
  OCR_EMPTY: 'OCR 未识别到可用文字',
  PROVIDER_UNAVAILABLE: 'Provider 不可用，请检查默认模型或 BYOK 配置',
  QUOTA_EXCEEDED: 'AI 配额不足，请稍后重试或调整用量',
  MODEL_UNSUPPORTED: '当前模型不支持该能力，请切换支持 text.chat / vision.ocr 的模型',
  EMPTY_RESPONSE: 'AI 未返回可用内容',
  UNKNOWN: 'AI 调用失败',
}

const AI_SYSTEM_PROMPT = '你是 Talex Touch 桌面助手里的智能助手，请用简洁清晰的中文回答。'
const conversationSessions = new Map()

function resolveIntelligenceClient() {
  const { createIntelligenceClient } = require('@talex-touch/tuff-intelligence')
  return createIntelligenceClient()
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
  return `${HANDOFF_SESSION_PREFIX}_${toSessionIdPart(resolveFeatureId(featureId)) || DEFAULT_FEATURE_ID}`
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
  session.handoffSessionId = handoffSessionId

  if (!client?.agentSessionStart)
    return handoffSessionId

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
    if (session.history.length === 0 && restoredMessages.length > 0) {
      session.history = keepNewestBusinessMessages(restoredMessages)
    }
  }
  catch (error) {
    logger?.warn?.('[touch-intelligence] handoff session unavailable', error)
  }

  return handoffSessionId
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

function buildInvokeOptions({ featureId, requestId, capabilityId, inputKinds = [], sessionId }) {
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
    },
  }
}

function mapInvokeResult(result, prompt, requestId, handoffSessionId = '') {
  return {
    requestId,
    prompt,
    answer: normalizeText(result?.result),
    provider: normalizeText(result?.provider),
    model: normalizeText(result?.model),
    handoffSessionId: normalizeText(handoffSessionId),
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

function normalizeInvokeError(error) {
  const rawCode = normalizeText(error?.code).toUpperCase()
  const rawMessage = toErrorMessage(error)
  const lower = rawMessage.toLowerCase()

  let code = AI_ERROR_MESSAGES[rawCode] ? rawCode : 'UNKNOWN'
  if (code === 'UNKNOWN') {
    if (
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
      lower.includes('unsupported')
      || lower.includes('not supported')
      || lower.includes('capability not supported')
      || lower.includes('model does not support')
    ) {
      code = 'MODEL_UNSUPPORTED'
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
  if (!permission)
    return true

  const hasPermission = await permission.check(permissionId)
  if (hasPermission)
    return true

  const granted = await permission.request(permissionId, reason)
  return Boolean(granted)
}

function buildInfoItem({
  id,
  featureId,
  title,
  subtitle,
  payload,
  actionId,
  status,
  handoffSessionId,
}) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)

  const meta = {
    pluginName: PLUGIN_NAME,
    featureId,
    status,
  }

  if (handoffSessionId) {
    meta.intelligence = {
      handoffSessionId,
      sessionId: handoffSessionId,
      source: HANDOFF_SOURCE,
    }
  }

  if (actionId) {
    meta.defaultAction = ACTION_ID
    meta.actionId = actionId
    meta.payload = payload
  }

  return builder.setMeta(meta).build()
}

function buildPlaceholderItem(featureId) {
  return buildInfoItem({
    id: `${featureId}-placeholder`,
    featureId,
    title: '输入问题或复制图片后提问',
    subtitle: '示例：ai 帮我总结今天待办；复制图片后可先 OCR 再回答',
    status: 'empty',
  })
}

function resolveDisplayPrompt(prompt, hasImage) {
  const normalizedPrompt = normalizePrompt(prompt)
  if (normalizedPrompt)
    return normalizedPrompt
  return hasImage ? '分析剪贴板图片' : ''
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
    actionId: 'send',
    payload: {
      prompt: draft.prompt,
      draftId: draft.draftId,
      inputKinds: draft.inputKinds,
    },
    status: 'ready-to-send',
  })
}

function buildPendingItem(featureId, prompt, requestId, stage = 'chat', handoffSessionId = '') {
  const isOcr = stage === 'ocr'
  return buildInfoItem({
    id: `${featureId}-${isOcr ? 'ocr-pending' : 'chat-pending'}-${requestId}`,
    featureId,
    title: prompt,
    subtitle: isOcr ? '正在识别剪贴板图片…' : 'AI 正在思考…',
    status: isOcr ? 'ocr-pending' : 'chat-pending',
    handoffSessionId,
  })
}

function buildReadyItem(featureId, state) {
  const modelInfo = [state.provider, state.model].filter(Boolean).join(' / ')
  const handoffText = state.handoffSessionId ? '已接入交接会话' : ''
  const subtitle = [truncateText(state.answer, 72), modelInfo, handoffText]
    .filter(Boolean)
    .join(' · ')

  return buildInfoItem({
    id: `${featureId}-ready-${state.requestId}`,
    featureId,
    title: state.prompt || 'AI 回答',
    subtitle: subtitle || '回答已生成',
    actionId: 'copy-answer',
    payload: {
      prompt: state.prompt,
      answer: state.answer,
      handoffSessionId: state.handoffSessionId,
    },
    status: 'ready',
    handoffSessionId: state.handoffSessionId,
  })
}

function buildErrorItem(featureId, prompt, error, history = [], retryContext = {}) {
  const normalizedError = typeof error === 'object' && error?.code && error?.message
    ? error
    : normalizeInvokeError(error)

  return buildInfoItem({
    id: `${featureId}-error-${Date.now()}`,
    featureId,
    title: prompt || 'AI 请求失败',
    subtitle: truncateText(`${normalizedError.code} · ${normalizedError.message}`, 120),
    actionId: 'retry',
    payload: {
      prompt,
      history: cloneHistory(history),
      draftId: retryContext.draftId,
      inputKinds: retryContext.inputKinds,
      handoffSessionId: retryContext.handoffSessionId,
    },
    status: 'error',
    handoffSessionId: retryContext.handoffSessionId,
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

function extractQueryContext(query) {
  const rawText = getQueryText(query)
  const prompt = normalizePrompt(rawText)
  const imageDataUrl = extractImageDataUrl(query)
  const shouldUseOcr = Boolean(imageDataUrl && (!prompt || hasAiPrefix(rawText)))

  return {
    rawText,
    prompt,
    imageDataUrl: shouldUseOcr ? imageDataUrl : '',
    inputKinds: extractInputKinds(query),
  }
}

function storeDraft(session, draft) {
  const draftId = draft.draftId || crypto.randomUUID()
  const normalizedDraft = {
    draftId,
    prompt: normalizePrompt(draft.prompt),
    imageDataUrl: normalizeText(draft.imageDataUrl),
    ocrText: normalizeText(draft.ocrText),
    inputKinds: Array.isArray(draft.inputKinds) ? draft.inputKinds.filter(Boolean) : [],
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
  })
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
}) {
  const resolvedFeatureId = resolveFeatureId(featureId)
  const normalizedPrompt = normalizePrompt(prompt)
  const session = getSession(resolvedFeatureId)
  let resolvedHistory = cloneHistory(historySnapshot)
  let resolvedOcrText = normalizeText(ocrText)
  const displayPrompt = resolveDisplayPrompt(
    normalizedPrompt,
    Boolean(imageDataUrl || resolvedOcrText),
  )

  if (!displayPrompt)
    return

  try {
    const client = resolveIntelligenceClient()
    const handoffSessionId = await ensureHandoffSession(client, session, {
      featureId: resolvedFeatureId,
      prompt: displayPrompt,
      history: resolvedHistory,
      requestId,
      inputKinds,
    })
    if (resolvedHistory.length === 0 && session.history.length > 0) {
      resolvedHistory = cloneHistory(session.history)
    }

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
        })
      }

      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildPendingItem(resolvedFeatureId, displayPrompt, requestId, 'chat', handoffSessionId),
      ])
    }

    const chatPrompt = normalizedPrompt || '请总结剪贴板图片中的文字。'
    const payload = buildInvokePayload(chatPrompt, resolvedHistory, { ocrText: resolvedOcrText })
    const result = await client.invoke(
      'text.chat',
      payload,
      buildInvokeOptions({
        featureId: resolvedFeatureId,
        requestId,
        capabilityId: 'text.chat',
        inputKinds,
        sessionId: handoffSessionId,
      }),
    )
    const mapped = mapInvokeResult(result, displayPrompt, requestId, handoffSessionId)

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

    plugin.feature.clearItems()
    plugin.feature.pushItems([buildReadyItem(resolvedFeatureId, mapped)])
  }
  catch (error) {
    if (!canCommitResponse(session, requestId))
      return

    session.activeRequestId = ''
    session.uiRequestId = requestId
    const normalizedError = normalizeInvokeError(error)
    logger?.error?.('[touch-intelligence] invoke failed', error)
    plugin.feature.clearItems()
    plugin.feature.pushItems([
      buildErrorItem(resolvedFeatureId, displayPrompt, normalizedError, resolvedHistory, {
        draftId,
        inputKinds,
        handoffSessionId: session.handoffSessionId,
      }),
    ])
  }
}

async function copyAnswer(answer) {
  if (!clipboard?.writeText)
    return false

  const canCopy = await ensurePermission('clipboard.write', '需要剪贴板权限以复制 AI 回答')
  if (!canCopy)
    return false

  clipboard.writeText(answer)
  return true
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const resolvedFeatureId = resolveFeatureId(featureId)
      const session = getSession(resolvedFeatureId)
      const queryContext = extractQueryContext(query)

      plugin.feature.clearItems()

      if (!queryContext.prompt && !queryContext.imageDataUrl) {
        plugin.feature.pushItems([buildPlaceholderItem(resolvedFeatureId)])
        return true
      }

      const draft = storeDraft(session, queryContext)
      plugin.feature.pushItems([buildSendItem(resolvedFeatureId, draft)])
      return true
    }
    catch (error) {
      const normalizedError = normalizeInvokeError(error)
      logger?.error?.('[touch-intelligence] Failed to handle feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildErrorItem(featureId, '', normalizedError),
      ])
      return true
    }
  },

  async onItemAction(item) {
    try {
      if (item?.meta?.defaultAction !== ACTION_ID)
        return

      const actionId = item.meta?.actionId
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
          return {
            externalAction: true,
            success: false,
            message: '复制失败：缺少 clipboard.write 权限',
          }
        }

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
          plugin.feature.clearItems()
          plugin.feature.pushItems([
            buildErrorItem(featureId, displayPrompt, normalizedError, [], {
              draftId: draft.draftId,
              inputKinds: draft.inputKinds,
              handoffSessionId: session.handoffSessionId,
            }),
          ])
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
        plugin.feature.clearItems()
        plugin.feature.pushItems([
          buildPendingItem(
            featureId,
            displayPrompt,
            requestId,
            draft.imageDataUrl ? 'ocr' : 'chat',
            session.handoffSessionId,
          ),
        ])
        void dispatchPrompt({
          featureId,
          prompt: draft.prompt,
          requestId,
          historySnapshot,
          imageDataUrl: draft.imageDataUrl,
          ocrText: draft.ocrText,
          inputKinds: draft.inputKinds,
          draftId: draft.draftId,
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
    buildHandoffContext,
    buildHandoffSessionId,
    buildOcrPayload,
    extractImageDataUrl,
    extractInputKinds,
    extractQueryContext,
    mapInvokeResult,
    normalizeInvokeError,
    normalizePrompt,
  },
}
