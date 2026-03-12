import { getRequestHeader, getRequestIP, setResponseStatus } from 'h3'
import crypto from 'node:crypto'
import type { IntelligenceMessage } from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { networkClient } from '@talex-touch/utils/network'
import { requireAuth } from '../../utils/auth'
import { consumeCredits } from '../../utils/creditsStore'
import { createAssistantMessage, createAssistantSession, getAssistantSession, getLatestAssistantSessionByDoc, updateAssistantSession } from '../../utils/docAssistantStore'
import { createAudit, getProviderApiKey, getSettings, isIpBanned, listProviders } from '../../utils/intelligenceStore'
import { buildOpenAiCompatBaseUrls, resolveProviderBaseUrl } from '../../utils/intelligenceModels'

interface AssistantMessage { role: 'user' | 'assistant'; content: string }
interface AssistantDoc { title?: string; path?: string; context?: string }
interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimated?: boolean
}
interface ProviderChatResult {
  content: string
  provider: string
  model: string
  traceId: string
  baseUrl: string
  requestId?: string
  endpoint?: string
  status?: number
  latency: number
  usage?: TokenUsage
}
type ProviderChatError = Error & {
  endpoint?: string
  status?: number
  latency?: number
  traceId?: string
  model?: string
  baseUrl?: string
  endpoints?: string[]
  contentType?: string
  responseSnippet?: string
  requestId?: string
}

const DOC_CONTEXT_LIMIT = 8000
const DEFAULT_TIMEOUT_MS = 60000
const MAX_CONTEXT_MESSAGES = 16
const SUMMARY_CHAR_LIMIT = 1600
const FULL_HTTP_STATUS_RANGE = Array.from({ length: 500 }, (_, index) => index + 100)

const OPENAI_COMPATIBLE_TYPES = new Set([
  IntelligenceProviderType.OPENAI,
  IntelligenceProviderType.DEEPSEEK,
  IntelligenceProviderType.SILICONFLOW,
  IntelligenceProviderType.CUSTOM
])

type StatusStage = 'analyzing' | 'fetching' | 'generating'

export default defineEventHandler(async (event) => {
  const auditMeta = resolveAuditMeta(event)
  let provider: any = null
  let settings: Awaited<ReturnType<typeof getSettings>> | null = null
  let userId: string | null = null

  try {
    const auth = await requireAuth(event)
    userId = auth.userId
    const body = await readBody(event)
    const messages = normalizeMessages(body?.messages)
    const streamEnabled = body?.stream === true
    const locale = typeof body?.locale === 'string' ? body.locale : 'en'

    if (!messages.length) {
      return fail(event, 'Messages are required.')
    }

    if (auditMeta.ip && await isIpBanned(event, auditMeta.ip)) {
      return fail(event, 'IP blocked.')
    }

    const { compressed: compressedMessages, summary } = compressMessages(messages)

    const docInput = normalizeDoc(body?.doc)
    const sessionIdInput =
      typeof body?.sessionId === 'string' && body.sessionId.trim().length > 0
        ? body.sessionId.trim()
        : null
    const preferredProviderId =
      typeof body?.providerId === 'string' && body.providerId.trim().length > 0
        ? body.providerId.trim()
        : null

    const providers = await listProviders(event, userId)
    const enabledProviders = providers.filter(provider => provider.enabled)
    if (!enabledProviders.length) {
      return fail(event, 'No enabled intelligence providers.')
    }

    settings = await getSettings(event, userId)
    provider = resolveProvider(enabledProviders, settings.defaultStrategy, preferredProviderId)
    if (!provider) {
      return fail(event, 'Provider not found.')
    }

    const apiKey =
      provider.type === IntelligenceProviderType.LOCAL
        ? null
        : await getProviderApiKey(event, userId, provider.id)

    if (!apiKey && provider.type !== IntelligenceProviderType.LOCAL) {
      return fail(event, 'Provider API key is missing.')
    }

    if (provider.type === IntelligenceProviderType.LOCAL && !provider.baseUrl) {
      return fail(event, 'Local provider base URL is missing.')
    }

    let session = sessionIdInput
      ? await getAssistantSession(event, userId, sessionIdInput)
      : null

    if (!session && docInput.path) {
      session = await getLatestAssistantSessionByDoc(event, userId, docInput.path)
    }

    if (!session) {
      session = await createAssistantSession(event, userId, docInput)
    }
    else {
      await updateAssistantSession(event, session.id, userId, docInput)
    }

    const doc = resolveDocFromSession(docInput, session)

    const latestUserMessage = [...messages].reverse().find(message => message.role === 'user')
    if (latestUserMessage) {
      await createAssistantMessage(event, {
        sessionId: session.id,
        userId,
        role: 'user',
        content: latestUserMessage.content,
      })
    }

    if (streamEnabled) {
      return await streamAssistantResponse(event, {
        userId,
        provider,
        settings,
        apiKey,
        messages: compressedMessages,
        summary,
        doc,
        model: resolveProviderModel(provider),
        sessionId: session.id,
        locale,
        auditMeta,
      })
    }

    const response = await invokeProviderChat({
      provider,
      apiKey,
      messages: compressedMessages,
      summary,
      doc,
      model: resolveProviderModel(provider)
    })

    const usage = resolveUsage(response, compressedMessages, doc, summary)
    await consumeCredits(event, userId, usage.totalTokens, 'docs-assistant', {
      sessionId: session.id,
      model: response.model,
      providerId: provider.id,
      traceId: response.traceId,
      tokens: usage.totalTokens,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      estimated: usage.estimated ?? false,
    })

    if (settings.enableAudit && userId) {
      await recordAudit(event, {
        userId,
        providerId: provider.id,
        providerType: provider.type,
        model: response.model,
        endpoint: response.endpoint,
        status: response.status,
        latency: response.latency,
        success: true,
        traceId: response.traceId,
        metadata: {
          ...auditMeta,
          baseUrl: response.baseUrl,
          requestId: response.requestId,
          tokens: usage.totalTokens,
        },
      })
    }

    await createAssistantMessage(event, {
      sessionId: session.id,
      userId,
      role: 'assistant',
      content: response.content,
    })

    return ok({ content: response.content, sessionId: session.id })
  }
  catch (error: any) {
    const auditError = error as ProviderChatError
    if (settings?.enableAudit && userId && provider && typeof auditError?.model === 'string') {
      await recordAudit(event, {
        userId,
        providerId: provider.id,
        providerType: provider.type,
        model: auditError.model,
        endpoint: auditError.endpoint,
        status: auditError.status,
        latency: auditError.latency,
        success: false,
        errorMessage: auditError.message,
        traceId: auditError.traceId,
        metadata: {
          ...auditMeta,
          baseUrl: auditError.baseUrl,
          requestId: auditError.requestId,
          endpoints: auditError.endpoints,
          contentType: auditError.contentType,
          responseSnippet: auditError.responseSnippet,
        },
      })
    }
    return fail(event, resolveErrorMessage(error))
  }
})

function ok(result: { content: string; sessionId?: string }) {
  return { ok: true, result }
}

function fail(event: any, message: string) {
  setResponseStatus(event, 200)
  return { ok: false, error: message }
}

function resolveErrorMessage(error: any): string {
  if (typeof error?.statusMessage === 'string' && error.statusMessage.trim())
    return sanitizeClientError(error.statusMessage)
  if (typeof error?.message === 'string' && error.message.trim())
    return sanitizeClientError(error.message)
  return sanitizeClientError('Request failed.')
}

function sanitizeClientError(message: string): string {
  if (!message)
    return 'Request failed.'
  let sanitized = message
  sanitized = sanitized.replace(/\s*\(POST [^)]+\)/gi, '')
  sanitized = sanitized.replace(/https?:\/\/\S+/g, '[redacted]')
  sanitized = sanitized.replace(/\s+/g, ' ').trim()
  return sanitized || 'Request failed.'
}

function resolveClientIp(event: any): string | null {
  const direct = getRequestIP(event, { xForwardedFor: true })
  if (direct)
    return direct
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  if (forwarded) {
    const value = forwarded.split(',')[0]?.trim()
    return value || null
  }
  const cf = getRequestHeader(event, 'cf-connecting-ip')
  return cf?.trim() || null
}

function resolveClientCountry(event: any): string | null {
  const country = getRequestHeader(event, 'cf-ipcountry')
    || getRequestHeader(event, 'x-vercel-ip-country')
    || getRequestHeader(event, 'x-country')
  return typeof country === 'string' && country.trim() ? country.trim() : null
}

function resolveAuditMeta(event: any): Record<string, string> {
  const meta: Record<string, string> = {}
  const ip = resolveClientIp(event)
  if (ip)
    meta.ip = ip
  const country = resolveClientCountry(event)
  if (country)
    meta.country = country
  return meta
}

function normalizeMessages(raw: unknown): AssistantMessage[] {
  if (!Array.isArray(raw))
    return []

  return raw
    .filter((item): item is AssistantMessage => {
      if (!item || typeof item !== 'object')
        return false
      const role = (item as AssistantMessage).role
      const content = (item as AssistantMessage).content
      return (role === 'user' || role === 'assistant') && typeof content === 'string'
    })
    .map(item => ({
      role: item.role,
      content: item.content.trim()
    }))
    .filter(item => item.content.length > 0)
}

function compressMessages(messages: AssistantMessage[]): { compressed: AssistantMessage[]; summary?: string } {
  if (messages.length <= MAX_CONTEXT_MESSAGES)
    return { compressed: messages }

  const keep = messages.slice(-MAX_CONTEXT_MESSAGES)
  const older = messages.slice(0, -MAX_CONTEXT_MESSAGES)
  const summaryRaw = older
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()

  if (!summaryRaw)
    return { compressed: keep }

  const summary = summaryRaw.length > SUMMARY_CHAR_LIMIT
    ? `${summaryRaw.slice(0, SUMMARY_CHAR_LIMIT)}...`
    : summaryRaw

  return { compressed: keep, summary }
}

function normalizeDoc(raw: unknown): AssistantDoc {
  if (!raw || typeof raw !== 'object')
    return {}
  const record = raw as AssistantDoc
  const context = typeof record.context === 'string' ? record.context.trim() : ''
  return {
    title: typeof record.title === 'string' ? record.title.trim() : undefined,
    path: typeof record.path === 'string' ? record.path.trim() : undefined,
    context: context ? context.slice(0, DOC_CONTEXT_LIMIT) : undefined
  }
}

function resolveDocFromSession(doc: AssistantDoc, session: { docTitle: string | null; docPath: string | null; docContext: string | null }) {
  return {
    title: doc.title ?? session.docTitle ?? undefined,
    path: doc.path ?? session.docPath ?? undefined,
    context: doc.context ?? session.docContext ?? undefined,
  }
}

function resolveProvider<T extends { id: string; enabled: boolean; priority: number }>(
  providers: T[],
  strategy: string,
  preferredId: string | null
): T | null {
  if (preferredId) {
    return providers.find(provider => provider.id === preferredId) ?? null
  }
  if (strategy === 'random') {
    return providers[Math.floor(Math.random() * providers.length)] ?? null
  }
  return providers[0] ?? null
}

function buildSystemPrompt(provider: { instructions?: string | null }, doc: AssistantDoc, summary?: string): string {
  const lines: string[] = []
  if (provider.instructions)
    lines.push(provider.instructions)
  lines.push('You are Tuff Assistant. Answer concisely and with practical steps.')
  if (doc.title)
    lines.push(`Document title: ${doc.title}`)
  if (doc.path)
    lines.push(`Document path: ${doc.path}`)
  if (summary) {
    lines.push('Conversation summary (compressed):')
    lines.push(summary)
  }
  if (doc.context) {
    lines.push('Always call tool "docs_context" or "page_context" before answering if document context is available.')
  }
  return lines.filter(Boolean).join('\n')
}

function resolveProviderModel(provider: { defaultModel?: string | null; models?: string[] }) {
  return provider.defaultModel || provider.models?.[0] || 'gpt-4o-mini'
}

function resolveStatusLabels(locale: string): Record<StatusStage, string> {
  const isZh = locale.toLowerCase().startsWith('zh')
  if (isZh) {
    return {
      analyzing: '正在分析意图',
      fetching: '正在获取文档内容',
      generating: '正在生成回复',
    }
  }
  return {
    analyzing: 'Analyzing intent',
    fetching: 'Fetching document context',
    generating: 'Generating response',
  }
}

function resolveToolChoice(toolAvailable: boolean): 'auto' | 'none' | { type: 'function'; function: { name: string } } | undefined {
  if (!toolAvailable)
    return undefined
  return { type: 'function', function: { name: 'docs_context' } }
}

function isToolChoiceError(message: string): boolean {
  if (!message)
    return false
  const lower = message.toLowerCase()
  return lower.includes('tool_choice')
    || (lower.includes('tool') && lower.includes('choice'))
    || (lower.includes('tools') && lower.includes('unsupported'))
}

function estimateTokens(text: string): number {
  if (!text)
    return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function estimateUsage(messages: AssistantMessage[], doc: AssistantDoc, output: string, summary?: string): TokenUsage {
  const promptText = [
    ...messages.map(message => message.content),
    summary || '',
    doc.context || '',
  ].join('\n')

  const promptTokens = estimateTokens(promptText)
  const completionTokens = estimateTokens(output)
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: true,
  }
}

function resolveUsage(result: ProviderChatResult, messages: AssistantMessage[], doc: AssistantDoc, summary?: string): TokenUsage {
  if (result.usage?.totalTokens) {
    return {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
    }
  }
  return estimateUsage(messages, doc, result.content, summary)
}

function mergeUsage(first?: TokenUsage, second?: TokenUsage): TokenUsage | undefined {
  if (!first && !second)
    return undefined
  if (!first)
    return second
  if (!second)
    return first
  const promptTokens = (first.promptTokens || 0) + (second.promptTokens || 0)
  const completionTokens = (first.completionTokens || 0) + (second.completionTokens || 0)
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: Boolean(first.estimated || second.estimated),
  }
}

async function recordAudit(
  event: any,
  data: Parameters<typeof createAudit>[1],
) {
  try {
    await createAudit(event, data)
  } catch {}
}

function resolveHeader(headers: Record<string, string>, name: string): string {
  return headers[name.toLowerCase()] || headers[name] || ''
}

function isHttpSuccess(status: number): boolean {
  return status >= 200 && status < 300
}

async function readStreamBodyText(streamBody: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!streamBody) {
    return ''
  }
  const reader = streamBody.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })
  }
  return buffer
}

function resolveRequestId(headers: Record<string, string>) {
  return (
    resolveHeader(headers, 'x-request-id')
    || resolveHeader(headers, 'request-id')
    || resolveHeader(headers, 'openai-request-id')
    || undefined
  )
}

async function streamAssistantResponse(
  event: any,
  params: {
    userId: string
    provider: any
    settings: Awaited<ReturnType<typeof getSettings>>
    apiKey: string | null
    messages: AssistantMessage[]
    summary?: string
    doc: AssistantDoc
    model: string
    sessionId: string
    locale: string
    auditMeta: Record<string, string>
  },
) {
  const encoder = new TextEncoder()
  const statusLabels = resolveStatusLabels(params.locale)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: Record<string, any>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      const sendStatus = (stage: StatusStage) => {
        const content = statusLabels[stage]
        if (content)
          send({ type: 'status', content })
      }

      const close = () => {
        try {
          controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'))
        } catch {}
        controller.close()
      }

      const sendError = async (error: ProviderChatError) => {
        const message = resolveErrorMessage(error)
        send({ type: 'error', message })
        if (params.settings.enableAudit) {
          await recordAudit(event, {
            userId: params.userId,
            providerId: params.provider.id,
            providerType: params.provider.type,
            model: error.model || params.model,
            endpoint: error.endpoint,
            status: error.status,
            latency: error.latency,
            success: false,
            errorMessage: error.message,
            traceId: error.traceId,
            metadata: {
              ...params.auditMeta,
              baseUrl: error.baseUrl,
              requestId: error.requestId,
              endpoints: error.endpoints,
              contentType: error.contentType,
              responseSnippet: error.responseSnippet,
            },
          })
        }
        close()
      }

      const run = async () => {
        try {
          send({ type: 'meta', sessionId: params.sessionId })
          sendStatus('analyzing')
          const result = await invokeProviderChatStream({
            provider: params.provider,
            apiKey: params.apiKey,
            messages: params.messages,
            summary: params.summary,
            doc: params.doc,
            model: params.model,
            onDelta: (delta) => {
              if (delta)
                send({ type: 'delta', content: delta })
            },
            onToolCall: (tool) => {
              const rawArgs = typeof tool.arguments === 'string' ? tool.arguments.trim() : ''
              const safeArgs = rawArgs.length > 800 ? `${rawArgs.slice(0, 800)}...` : rawArgs
              send({
                type: 'tool',
                name: tool.name,
                arguments: safeArgs || undefined,
              })
            },
            onStatus: sendStatus,
          })

          const usage = resolveUsage(result, params.messages, params.doc, params.summary)
          try {
            await consumeCredits(event, params.userId, usage.totalTokens, 'docs-assistant', {
              sessionId: params.sessionId,
              model: result.model,
              providerId: result.provider,
              traceId: result.traceId,
              tokens: usage.totalTokens,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              estimated: usage.estimated ?? false,
            })
          }
          catch (creditError: any) {
            const message = resolveErrorMessage(creditError)
            send({ type: 'error', message })
            return close()
          }

          if (params.settings.enableAudit) {
            await recordAudit(event, {
              userId: params.userId,
              providerId: params.provider.id,
              providerType: params.provider.type,
              model: result.model,
              endpoint: result.endpoint,
              status: result.status,
              latency: result.latency,
              success: true,
              traceId: result.traceId,
              metadata: {
                ...params.auditMeta,
                baseUrl: result.baseUrl,
                requestId: result.requestId,
                tokens: usage.totalTokens,
              },
            })
          }

          await createAssistantMessage(event, {
            sessionId: params.sessionId,
            userId: params.userId,
            role: 'assistant',
            content: result.content,
          })

          close()
        } catch (error: any) {
          await sendError(error as ProviderChatError)
        }
      }

      void run()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

function buildDocToolResponse(doc: AssistantDoc, query?: string) {
  if (!doc.context) {
    return {
      title: doc.title,
      path: doc.path,
      context: ''
    }
  }

  const source = doc.context
  const keyword = typeof query === 'string' ? query.trim().toLowerCase() : ''
  if (!keyword) {
    return {
      title: doc.title,
      path: doc.path,
      context: source
    }
  }

  const index = source.toLowerCase().indexOf(keyword)
  if (index === -1) {
    return {
      title: doc.title,
      path: doc.path,
      context: source
    }
  }

  const start = Math.max(0, index - 200)
  const end = Math.min(source.length, index + 1200)
  return {
    title: doc.title,
    path: doc.path,
    context: source.slice(start, end)
  }
}

async function invokeProviderChat(params: {
  provider: {
    id: string
    type: string
    baseUrl?: string | null
    defaultModel?: string | null
    models: string[]
    instructions?: string | null
    timeout?: number
  }
  apiKey: string | null
  messages: AssistantMessage[]
  summary?: string
  doc: AssistantDoc
  model: string
}): Promise<ProviderChatResult> {
  const systemPrompt = buildSystemPrompt(params.provider, params.doc, params.summary)
  const chatMessages: IntelligenceMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...params.messages]
    : [...params.messages]

  const providerType = params.provider.type as IntelligenceProviderType
  const baseUrl = resolveProviderBaseUrl(providerType, params.provider.baseUrl ?? undefined)
  const model = params.model
  const traceId = crypto.randomUUID()
  const startedAt = Date.now()
  const useContextAppend = !OPENAI_COMPATIBLE_TYPES.has(providerType) && Boolean(params.doc.context)
  const resolvedMessages = useContextAppend
    ? appendDocContext(chatMessages, params.doc.context || '')
    : chatMessages

  try {
    if (providerType === IntelligenceProviderType.ANTHROPIC) {
      const { content, endpoint, status, requestId } = await invokeAnthropicChat({
        baseUrl,
        apiKey: params.apiKey,
        model,
        messages: resolvedMessages,
        timeout: params.provider.timeout
      })
      return {
        content,
        provider: params.provider.id,
        model,
        traceId,
        baseUrl,
        requestId,
        endpoint,
        status,
        latency: Date.now() - startedAt,
      }
    }

    if (providerType === IntelligenceProviderType.LOCAL) {
      const { content, endpoint, status, requestId } = await invokeLocalChat({
        baseUrl,
        model,
        messages: resolvedMessages,
        timeout: params.provider.timeout
      })
      return {
        content,
        provider: params.provider.id,
        model,
        traceId,
        baseUrl,
        requestId,
        endpoint,
        status,
        latency: Date.now() - startedAt,
      }
    }

    if (!OPENAI_COMPATIBLE_TYPES.has(providerType)) {
      throw new Error(`Unsupported provider type: ${providerType}`)
    }

    const { content, endpoint, status, requestId, usage } = await invokeOpenAiChat({
      baseUrl,
      apiKey: params.apiKey,
      model,
      messages: chatMessages,
      timeout: params.provider.timeout,
      doc: params.doc
    })

    return {
      content,
      provider: params.provider.id,
      model,
      traceId,
      baseUrl,
      requestId,
      endpoint,
      status,
      latency: Date.now() - startedAt,
      usage,
    }
  }
  catch (error: any) {
    const resolved = error as ProviderChatError
    resolved.model = model
    resolved.traceId = traceId
    resolved.latency = Date.now() - startedAt
    resolved.baseUrl = baseUrl
    throw resolved
  }
}

async function invokeProviderChatStream(params: {
  provider: {
    id: string
    type: string
    baseUrl?: string | null
    defaultModel?: string | null
    models: string[]
    instructions?: string | null
    timeout?: number
  }
  apiKey: string | null
  messages: AssistantMessage[]
  summary?: string
  doc: AssistantDoc
  model: string
  onDelta: (delta: string) => void
  onToolCall?: (tool: { name?: string; arguments?: string }) => void
  onStatus?: (stage: StatusStage) => void
}): Promise<ProviderChatResult> {
  const systemPrompt = buildSystemPrompt(params.provider, params.doc, params.summary)
  const chatMessages: IntelligenceMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...params.messages]
    : [...params.messages]

  const providerType = params.provider.type as IntelligenceProviderType
  const baseUrl = resolveProviderBaseUrl(providerType, params.provider.baseUrl ?? undefined)
  const model = params.model
  const traceId = crypto.randomUUID()
  const startedAt = Date.now()

  const toolAvailable = OPENAI_COMPATIBLE_TYPES.has(providerType) && Boolean(params.doc.context)
  const streamMessages = toolAvailable
    ? chatMessages
    : params.doc.context
      ? appendDocContext(chatMessages, params.doc.context)
      : chatMessages

  try {
    if (providerType === IntelligenceProviderType.ANTHROPIC) {
      params.onStatus?.('generating')
      const { content, endpoint, status, requestId } = await invokeAnthropicChat({
        baseUrl,
        apiKey: params.apiKey,
        model,
        messages: streamMessages,
        timeout: params.provider.timeout
      })
      params.onDelta(content)
      return {
        content,
        provider: params.provider.id,
        model,
        traceId,
        baseUrl,
        requestId,
        endpoint,
        status,
        latency: Date.now() - startedAt,
      }
    }

    if (providerType === IntelligenceProviderType.LOCAL) {
      params.onStatus?.('generating')
      const { content, endpoint, status, requestId } = await invokeLocalChat({
        baseUrl,
        model,
        messages: streamMessages,
        timeout: params.provider.timeout
      })
      params.onDelta(content)
      return {
        content,
        provider: params.provider.id,
        model,
        traceId,
        baseUrl,
        requestId,
        endpoint,
        status,
        latency: Date.now() - startedAt,
      }
    }

    if (!OPENAI_COMPATIBLE_TYPES.has(providerType)) {
      throw new Error(`Unsupported provider type: ${providerType}`)
    }

    const { content, endpoint, status, requestId } = await invokeOpenAiChatStream({
      baseUrl,
      apiKey: params.apiKey,
      model,
      messages: streamMessages,
      timeout: params.provider.timeout,
      doc: params.doc,
      onDelta: params.onDelta,
      onToolCall: params.onToolCall,
      onStatus: params.onStatus,
    })

    return {
      content,
      provider: params.provider.id,
      model,
      traceId,
      baseUrl,
      requestId,
      endpoint,
      status,
      latency: Date.now() - startedAt,
    }
  }
  catch (error: any) {
    const resolved = error as ProviderChatError
    resolved.model = model
    resolved.traceId = traceId
    resolved.latency = Date.now() - startedAt
    resolved.baseUrl = baseUrl
    throw resolved
  }
}

async function invokeAnthropicChat(params: {
  baseUrl: string
  apiKey: string | null
  model: string
  messages: IntelligenceMessage[]
  timeout?: number
}): Promise<{ content: string; endpoint: string; status: number; requestId?: string }> {
  const systemMessage = params.messages.find(message => message.role === 'system')?.content
  const conversation = params.messages.filter(message => message.role !== 'system')
  const endpoint = `${params.baseUrl}/messages`

  const response = await networkClient.request<string>({
    url: endpoint,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': params.apiKey || '',
      'anthropic-version': '2023-06-01'
    },
    body: {
      model: params.model,
      system: systemMessage,
      messages: conversation,
      max_tokens: 1024,
      temperature: 0.7
    },
    timeoutMs: params.timeout ?? DEFAULT_TIMEOUT_MS,
    responseType: 'text',
    validateStatus: FULL_HTTP_STATUS_RANGE,
  })

  if (!isHttpSuccess(response.status)) {
    const text = response.data || ''
    const error = new Error(`Anthropic API error: ${response.status} ${text}`) as ProviderChatError
    error.status = response.status
    error.endpoint = endpoint
    error.requestId = resolveRequestId(response.headers)
    error.contentType = resolveHeader(response.headers, 'content-type') || undefined
    error.responseSnippet = text.slice(0, 400)
    throw error
  }

  const data = JSON.parse(response.data || '{}') as { content?: Array<{ text?: string }> }
  return {
    content: data.content?.[0]?.text || '',
    endpoint,
    status: response.status,
    requestId: resolveRequestId(response.headers),
  }
}

async function invokeLocalChat(params: {
  baseUrl: string
  model: string
  messages: IntelligenceMessage[]
  timeout?: number
}): Promise<{ content: string; endpoint: string; status: number; requestId?: string }> {
  const endpoint = `${params.baseUrl}/chat`
  const response = await networkClient.request<string>({
    url: endpoint,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      model: params.model,
      messages: params.messages
    },
    timeoutMs: params.timeout ?? DEFAULT_TIMEOUT_MS,
    responseType: 'text',
    validateStatus: FULL_HTTP_STATUS_RANGE,
  })

  if (!isHttpSuccess(response.status)) {
    const text = response.data || ''
    const error = new Error(`Local provider error: ${response.status} ${text}`) as ProviderChatError
    error.status = response.status
    error.endpoint = endpoint
    error.requestId = resolveRequestId(response.headers)
    error.contentType = resolveHeader(response.headers, 'content-type') || undefined
    error.responseSnippet = text.slice(0, 400)
    throw error
  }

  const data = JSON.parse(response.data || '{}') as { result?: string }
  return {
    content: data.result || '',
    endpoint,
    status: response.status,
    requestId: resolveRequestId(response.headers),
  }
}

async function invokeOpenAiChat(params: {
  baseUrl: string
  apiKey: string | null
  model: string
  messages: IntelligenceMessage[]
  timeout?: number
  doc: AssistantDoc
}): Promise<{ content: string; endpoint?: string; status?: number; requestId?: string; usage?: TokenUsage }> {
  const endpoints = buildOpenAiChatEndpoints(params.baseUrl)
  const toolAvailable = Boolean(params.doc.context)
  const toolChoice = resolveToolChoice(toolAvailable)
  const toolDefinition = toolAvailable
    ? [
        {
          type: 'function',
          function: {
            name: 'docs_context',
            description: 'Fetch context from the current documentation.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Optional search keyword.' }
              }
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'page_context',
            description: 'Fetch context from the current page.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Optional search keyword.' }
              }
            }
          }
        },
      ]
    : undefined

  try {
    const initial = await fetchOpenAiCompletion({
      endpoints,
      apiKey: params.apiKey,
      model: params.model,
      messages: params.messages,
      timeout: params.timeout,
      tools: toolDefinition,
      toolChoice,
    })

    if (toolAvailable && initial.toolCalls?.length) {
      const toolMessages = initial.toolCalls.map(call => {
        let query: string | undefined
        if (call.function?.arguments) {
          try {
            const parsed = JSON.parse(call.function.arguments)
            if (parsed && typeof parsed.query === 'string')
              query = parsed.query
          } catch {}
        }
        const payload = buildDocToolResponse(params.doc, query)
        return {
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(payload)
        }
      })

      const followUpMessages = [
        ...params.messages,
        {
          role: 'assistant',
          content: initial.content || '',
          tool_calls: initial.toolCalls
        },
        ...toolMessages
      ]

      const final = await fetchOpenAiCompletion({
        endpoints,
        apiKey: params.apiKey,
        model: params.model,
        messages: followUpMessages as IntelligenceMessage[],
        timeout: params.timeout
      })
      const mergedUsage = mergeUsage(initial.usage, final.usage)
      return {
        content: final.content,
        endpoint: final.endpoint,
        status: final.status,
        requestId: final.requestId,
        usage: mergedUsage,
      }
    }

    return {
      content: initial.content,
      endpoint: initial.endpoint,
      status: initial.status,
      requestId: initial.requestId,
      usage: initial.usage,
    }
  } catch (error) {
    if (!toolAvailable)
      throw error

    const fallbackMessages = appendDocContext(params.messages, params.doc.context || '')
    const fallback = await fetchOpenAiCompletion({
      endpoints,
      apiKey: params.apiKey,
      model: params.model,
      messages: fallbackMessages,
      timeout: params.timeout
    })
    return {
      content: fallback.content,
      endpoint: fallback.endpoint,
      status: fallback.status,
      requestId: fallback.requestId,
      usage: fallback.usage,
    }
  }
}

async function invokeOpenAiChatStream(params: {
  baseUrl: string
  apiKey: string | null
  model: string
  messages: IntelligenceMessage[]
  timeout?: number
  doc?: AssistantDoc
  onDelta: (delta: string) => void
  onToolCall?: (tool: { name?: string; arguments?: string }) => void
  onStatus?: (stage: StatusStage) => void
}): Promise<{ content: string; endpoint?: string; status?: number; requestId?: string; endpoints: string[] }> {
  const endpoints = buildOpenAiChatEndpoints(params.baseUrl)
  const toolAvailable = Boolean(params.doc?.context)
  const toolChoice = resolveToolChoice(toolAvailable)
  const toolDefinition = toolAvailable
    ? [
        {
          type: 'function',
          function: {
            name: 'docs_context',
            description: 'Fetch context from the current documentation.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Optional search keyword.' }
              }
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'page_context',
            description: 'Fetch context from the current page.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Optional search keyword.' }
              }
            }
          }
        },
      ]
    : undefined

  if (!toolDefinition) {
    params.onStatus?.('generating')
    const result = await streamOpenAiCompletion({
      endpoints,
      apiKey: params.apiKey,
      model: params.model,
      messages: params.messages,
      timeout: params.timeout,
      onDelta: params.onDelta,
    })
    return { ...result, endpoints }
  }

  const initial = await streamOpenAiCompletionWithTools({
    endpoints,
    apiKey: params.apiKey,
    model: params.model,
    messages: params.messages,
    timeout: params.timeout,
    tools: toolDefinition,
    toolChoice,
    onDelta: params.onDelta,
    onToolCallDetected: () => params.onStatus?.('fetching'),
  })

  if (!initial.toolCalls?.length) {
    return { content: initial.content, endpoint: initial.endpoint, status: initial.status, requestId: initial.requestId, endpoints }
  }

  if (params.onToolCall) {
    for (const call of initial.toolCalls) {
      params.onToolCall({
        name: call.function?.name,
        arguments: call.function?.arguments,
      })
    }
  }

  const toolMessages = initial.toolCalls.map(call => {
    let query: string | undefined
    if (call.function?.arguments) {
      try {
        const parsed = JSON.parse(call.function.arguments)
        if (parsed && typeof parsed.query === 'string')
          query = parsed.query
      } catch {}
    }
    const payload = buildDocToolResponse(params.doc || {}, query)
    return {
      role: 'tool',
      tool_call_id: call.id,
      content: JSON.stringify(payload)
    }
  })

  const followUpMessages = [
    ...params.messages,
    {
      role: 'assistant',
      content: initial.content || '',
      tool_calls: initial.toolCalls
    },
    ...toolMessages
  ]

  params.onStatus?.('generating')
  const final = await streamOpenAiCompletion({
    endpoints,
    apiKey: params.apiKey,
    model: params.model,
    messages: followUpMessages as IntelligenceMessage[],
    timeout: params.timeout,
    onDelta: params.onDelta,
  })

  return { content: final.content, endpoint: final.endpoint, status: final.status, requestId: final.requestId, endpoints }
}

function appendDocContext(messages: IntelligenceMessage[], context: string): IntelligenceMessage[] {
  if (!context)
    return messages

  const merged = [...messages]
  merged.unshift({
    role: 'system',
    content: `Document context:\n${context}`
  })
  return merged
}

async function fetchOpenAiCompletion(params: {
  endpoints: string[]
  apiKey: string | null
  model: string
  messages: IntelligenceMessage[]
  timeout?: number
  tools?: any[]
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
}): Promise<{
  content: string
  endpoint: string
  status: number
  requestId?: string
  usage?: TokenUsage
  toolCalls?: Array<{
    id: string
    type?: string
    function?: { name?: string; arguments: string }
  }>
}> {
  let lastError: Error | null = null
  let bestError: Error | null = null
  let bestRank = -1
  const fallbackToolChoice = typeof params.toolChoice === 'object' ? 'auto' : undefined

  const rankError = (status?: number) => {
    if (typeof status !== 'number')
      return 0
    if (status >= 400 && status < 500 && status !== 404 && status !== 405)
      return 3
    if (status >= 500)
      return 2
    if (status === 404 || status === 405)
      return 1
    return 0
  }

  const recordError = (error: Error, rank: number) => {
    lastError = error
    if (rank > bestRank) {
      bestRank = rank
      bestError = error
    }
  }

  const requestOnce = async (endpoint: string, toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }) => {
    const response = await networkClient.request<string>({
      url: endpoint,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${params.apiKey ?? ''}`
      },
      body: {
        model: params.model,
        messages: params.messages,
        temperature: 0.2,
        tools: params.tools,
        tool_choice: toolChoice
      },
      timeoutMs: params.timeout ?? DEFAULT_TIMEOUT_MS,
      responseType: 'text',
      validateStatus: FULL_HTTP_STATUS_RANGE,
    })

    const raw = response.data || ''
    const contentType = resolveHeader(response.headers, 'content-type')
    if (!isHttpSuccess(response.status)) {
      let detail = ''
      if (contentType.includes('application/json')) {
        try {
          const parsed = JSON.parse(raw) as { error?: { message?: string } }
          detail = parsed?.error?.message?.trim() ?? ''
        } catch {}
      }
      let errorMessage = `OpenAI API error: ${response.status} (POST ${endpoint})`
      if (detail)
        errorMessage = `${errorMessage} ${detail}`
      const error = new Error(errorMessage) as ProviderChatError & { toolChoiceInvalid?: boolean }
      error.status = response.status
      error.endpoint = endpoint
      error.requestId = resolveRequestId(response.headers)
      if (raw) {
        error.contentType = contentType || undefined
        error.responseSnippet = raw.slice(0, 400)
      }
      error.endpoints = params.endpoints
      if (detail && isToolChoiceError(detail))
        error.toolChoiceInvalid = true
      return { error }
    }

    let data: {
      choices?: Array<{
        message?: {
          content?: string
          tool_calls?: Array<{
            id: string
            type?: string
            function?: { name?: string; arguments: string }
          }>
        }
      }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      }
    }

    try {
      data = JSON.parse(raw)
    } catch {
      const error = new Error('OpenAI API returned non-JSON response.') as ProviderChatError
      error.endpoint = endpoint
      error.requestId = resolveRequestId(response.headers)
      error.contentType = contentType || undefined
      error.responseSnippet = raw.slice(0, 400)
      error.endpoints = params.endpoints
      throw error
    }

    const message = data.choices?.[0]?.message
    const usage = data.usage
    return {
      result: {
        content: message?.content || '',
        endpoint,
        status: response.status,
        requestId: resolveRequestId(response.headers),
        toolCalls: message?.tool_calls,
        usage: usage
          ? {
              promptTokens: Number(usage.prompt_tokens ?? 0),
              completionTokens: Number(usage.completion_tokens ?? 0),
              totalTokens: Number(usage.total_tokens ?? 0),
            }
          : undefined,
      }
    }
  }

  for (const endpoint of params.endpoints) {
    try {
      const primary = await requestOnce(endpoint, params.toolChoice)
      if (primary.result)
        return primary.result
      const primaryError = primary.error as (ProviderChatError & { toolChoiceInvalid?: boolean }) | undefined
      if (primaryError && primaryError.toolChoiceInvalid && fallbackToolChoice) {
        const fallback = await requestOnce(endpoint, fallbackToolChoice)
        if (fallback.result)
          return fallback.result
        const fallbackError = (fallback.error ?? primaryError) as ProviderChatError
        recordError(fallbackError, rankError(fallbackError.status))
        continue
      }
      if (primary.error) {
        const primaryRecord = primary.error as ProviderChatError
        recordError(primaryRecord, rankError(primaryRecord.status))
      }
    } catch (error: any) {
      const resolved = error instanceof Error ? error : new Error(String(error))
      const wrapped = resolved as ProviderChatError
      if (!wrapped.endpoint)
        wrapped.endpoint = endpoint
      if (!wrapped.endpoints)
        wrapped.endpoints = params.endpoints
      recordError(wrapped, 0)
    }
  }

  throw bestError ?? lastError ?? new Error('OpenAI API request failed')
}

async function streamOpenAiCompletion(params: {
  endpoints: string[]
  apiKey: string | null
  model: string
  messages: IntelligenceMessage[]
  timeout?: number
  onDelta: (delta: string) => void
}): Promise<{ content: string; endpoint: string; status: number; requestId?: string }> {
  let lastError: Error | null = null
  const decoder = new TextDecoder()

  for (const endpoint of params.endpoints) {
    try {
      const response = await networkClient.request<ReadableStream<Uint8Array> | null>({
        url: endpoint,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${params.apiKey ?? ''}`,
          accept: 'text/event-stream',
        },
        body: {
          model: params.model,
          messages: params.messages,
          temperature: 0.2,
          stream: true,
        },
        timeoutMs: params.timeout ?? DEFAULT_TIMEOUT_MS,
        responseType: 'stream',
        validateStatus: FULL_HTTP_STATUS_RANGE,
      })

      const contentType = resolveHeader(response.headers, 'content-type')
      if (!isHttpSuccess(response.status)) {
        const text = await readStreamBodyText(response.data)
        const error = new Error(`OpenAI API error: ${response.status} (POST ${endpoint})`) as ProviderChatError
        error.status = response.status
        error.endpoint = endpoint
        error.requestId = resolveRequestId(response.headers)
        error.contentType = contentType || undefined
        error.responseSnippet = text.slice(0, 400)
        error.endpoints = params.endpoints
        lastError = error
        continue
      }

      if (!response.data) {
        const error = new Error('OpenAI API stream body is empty.') as ProviderChatError
        error.endpoint = endpoint
        error.status = response.status
        error.endpoints = params.endpoints
        lastError = error
        continue
      }

      const reader = response.data.getReader()
      let buffer = ''
      let content = ''
      let done = false

      while (!done) {
        const { value, done: streamDone } = await reader.read()
        if (streamDone)
          break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          const line = part.split('\n').find(item => item.startsWith('data:'))
          if (!line)
            continue
          const data = line.slice(5).trim()
          if (!data)
            continue
          if (data === '[DONE]') {
            done = true
            break
          }

          try {
            const parsed = JSON.parse(data) as any
            const delta = parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.text ?? ''
            if (delta) {
              content += delta
              params.onDelta(delta)
            }
          } catch {
            // Ignore malformed chunks
          }
        }
      }

      return {
        content,
        endpoint,
        status: response.status,
        requestId: resolveRequestId(response.headers),
      }
    } catch (error: any) {
      const resolved = error instanceof Error ? error : new Error(String(error))
      lastError = resolved
    }
  }

  throw lastError ?? new Error('OpenAI API request failed')
}

async function streamOpenAiCompletionWithTools(params: {
  endpoints: string[]
  apiKey: string | null
  model: string
  messages: IntelligenceMessage[]
  timeout?: number
  tools: any[]
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  onDelta: (delta: string) => void
  onToolCallDetected?: (name?: string) => void
}): Promise<{
  content: string
  endpoint: string
  status: number
  requestId?: string
  toolCalls?: Array<{
    id: string
    type?: string
    function?: { name?: string; arguments: string }
  }>
}> {
  let lastError: Error | null = null
  const decoder = new TextDecoder()
  const fallbackToolChoice = typeof params.toolChoice === 'object' ? 'auto' : undefined

  const streamOnce = async (endpoint: string, toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }) => {
    const response = await networkClient.request<ReadableStream<Uint8Array> | null>({
      url: endpoint,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${params.apiKey ?? ''}`,
        accept: 'text/event-stream',
      },
      body: {
        model: params.model,
        messages: params.messages,
        temperature: 0.2,
        stream: true,
        tools: params.tools,
        tool_choice: toolChoice,
      },
      timeoutMs: params.timeout ?? DEFAULT_TIMEOUT_MS,
      responseType: 'stream',
      validateStatus: FULL_HTTP_STATUS_RANGE,
    })

    const contentType = resolveHeader(response.headers, 'content-type')
    if (!isHttpSuccess(response.status)) {
      const text = await readStreamBodyText(response.data)
      let detail = ''
      if (contentType.includes('application/json')) {
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string } }
          detail = parsed?.error?.message?.trim() ?? ''
        } catch {}
      }
      const error = new Error(`OpenAI API error: ${response.status} (POST ${endpoint})`) as ProviderChatError & { toolChoiceInvalid?: boolean }
      error.status = response.status
      error.endpoint = endpoint
      error.requestId = resolveRequestId(response.headers)
      error.contentType = contentType || undefined
      error.responseSnippet = text.slice(0, 400)
      error.endpoints = params.endpoints
      if (detail && isToolChoiceError(detail))
        error.toolChoiceInvalid = true
      return { error }
    }

    if (!response.data) {
      const error = new Error('OpenAI API stream body is empty.') as ProviderChatError
      error.endpoint = endpoint
      error.status = response.status
      error.endpoints = params.endpoints
      return { error }
    }

    const reader = response.data.getReader()
    let buffer = ''
    let content = ''
    const toolCallMap = new Map<number, { id?: string; name?: string; args: string }>()
    let toolDetected = false

    while (true) {
      const { value, done } = await reader.read()
      if (done)
        break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        const line = part.split('\n').find(item => item.startsWith('data:'))
        if (!line)
          continue
        const data = line.slice(5).trim()
        if (!data)
          continue
        if (data === '[DONE]')
          continue

        try {
          const parsed = JSON.parse(data) as any
          const choice = parsed?.choices?.[0]
          const delta = choice?.delta
          const deltaContent = delta?.content ?? ''
          if (deltaContent) {
            content += deltaContent
            params.onDelta(deltaContent)
          }

          const deltaToolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : []
          if (deltaToolCalls.length) {
            if (!toolDetected) {
              toolDetected = true
              const firstName = deltaToolCalls[0]?.function?.name
              params.onToolCallDetected?.(firstName)
            }
            for (const call of deltaToolCalls) {
              const index = typeof call.index === 'number' ? call.index : 0
              const existing = toolCallMap.get(index) ?? { args: '' }
              if (call.id)
                existing.id = call.id
              if (call.function?.name)
                existing.name = call.function.name
              if (typeof call.function?.arguments === 'string')
                existing.args += call.function.arguments
              toolCallMap.set(index, existing)
            }
          }
        } catch {
          // Ignore malformed chunks
        }
      }
    }

    const toolCalls = toolCallMap.size
      ? Array.from(toolCallMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([index, value]) => ({
            id: value.id || `tool_${index}`,
            type: 'function',
            function: {
              name: value.name,
              arguments: value.args || '',
            },
          }))
      : undefined

    return {
      result: {
        content,
        endpoint,
        status: response.status,
        requestId: resolveRequestId(response.headers),
        toolCalls,
      }
    }
  }

  for (const endpoint of params.endpoints) {
    try {
      const primary = await streamOnce(endpoint, params.toolChoice)
      if (primary.result)
        return primary.result
      const primaryError = primary.error as (ProviderChatError & { toolChoiceInvalid?: boolean }) | undefined
      if (primaryError && primaryError.toolChoiceInvalid && fallbackToolChoice) {
        const fallback = await streamOnce(endpoint, fallbackToolChoice)
        if (fallback.result)
          return fallback.result
        lastError = fallback.error || primaryError
        continue
      }
      lastError = primary.error ?? lastError
    } catch (error: any) {
      const resolved = error instanceof Error ? error : new Error(String(error))
      lastError = resolved
    }
  }

  throw lastError ?? new Error('OpenAI API request failed')
}

function buildOpenAiChatEndpoints(baseUrl: string): string[] {
  const trimmed = baseUrl.replace(/\/+$/, '')
  const directMatch = trimmed.match(/^(.*)\/chat\/completions$/i)
  const endpoints: string[] = []
  const push = (value: string) => {
    if (!endpoints.includes(value))
      endpoints.push(value)
  }

  if (directMatch) {
    push(trimmed)
    const prefix = directMatch[1]
    if (!prefix)
      return endpoints
    for (const candidate of buildOpenAiCompatBaseUrls(prefix)) {
      push(`${candidate.replace(/\/+$/, '')}/chat/completions`)
    }
    return endpoints
  }

  for (const candidate of buildOpenAiCompatBaseUrls(trimmed)) {
    push(`${candidate.replace(/\/+$/, '')}/chat/completions`)
  }
  return endpoints
}
