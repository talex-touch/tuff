import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createError } from 'h3'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { requireAdmin } from '../../../utils/auth'
import { buildOpenAiCompatBaseUrls, resolveProviderBaseUrl } from '../../../utils/intelligenceModels'
import { getProviderApiKey, getSettings, listProviders, type IntelligenceProviderRecord } from '../../../utils/intelligenceStore'
import { getRuntimeSession, upsertRuntimeSession } from '../../../utils/tuffIntelligenceRuntimeStore'

interface ChatHistoryItem {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

interface ResolvedProviderContext {
  provider: IntelligenceProviderRecord
  model: string
  apiKey: string | null
  baseUrl: string
  timeoutMs: number
  systemPrompt: string
}

const SESSION_PREFIX = 'tuff-intelligence-chat'
const MAX_HISTORY = 48
const DEFAULT_TIMEOUT_MS = 30000
const SYSTEM_PROMPT = 'You are TuffIntelligence assistant. Respond clearly and concisely.'
const OPENAI_COMPATIBLE_TYPES = new Set([
  IntelligenceProviderType.OPENAI,
  IntelligenceProviderType.DEEPSEEK,
  IntelligenceProviderType.SILICONFLOW,
  IntelligenceProviderType.CUSTOM,
  IntelligenceProviderType.LOCAL,
])

function ensureHistory(value: unknown): ChatHistoryItem[] {
  if (!Array.isArray(value))
    return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object')
        return null
      const row = item as Record<string, unknown>
      const role = String(row.role || '').trim() as ChatHistoryItem['role']
      const content = String(row.content || '').trim()
      if (!role || !content)
        return null
      return {
        role: role === 'assistant' || role === 'system' ? role : 'user',
        content,
        timestamp: typeof row.timestamp === 'number' ? row.timestamp : Date.now(),
      }
    })
    .filter((item): item is ChatHistoryItem => Boolean(item))
    .slice(-MAX_HISTORY)
}

function toLangChainMessages(history: ChatHistoryItem[], systemPrompt: string): BaseMessage[] {
  const messages: BaseMessage[] = []
  if (systemPrompt) {
    messages.push(new SystemMessage(systemPrompt))
  }
  for (const item of history) {
    if (item.role === 'assistant') {
      messages.push(new AIMessage(item.content))
      continue
    }
    if (item.role === 'system') {
      messages.push(new SystemMessage(item.content))
      continue
    }
    messages.push(new HumanMessage(item.content))
  }
  return messages
}

function extractChunkText(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object')
    return ''
  const content = (chunk as { content?: unknown }).content
  if (typeof content === 'string')
    return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string')
          return item
        if (item && typeof item === 'object' && 'text' in item)
          return String((item as { text?: unknown }).text || '')
        return ''
      })
      .join('')
  }
  return ''
}

function resolveProviderModel(provider: IntelligenceProviderRecord): string | null {
  return provider.defaultModel || provider.models?.[0] || null
}

function resolveProvider(providers: IntelligenceProviderRecord[], strategy: string): IntelligenceProviderRecord | null {
  const ordered = [...providers].sort((a, b) => a.priority - b.priority)
  if (!ordered.length)
    return null
  if (strategy === 'random') {
    return ordered[Math.floor(Math.random() * ordered.length)] ?? null
  }
  return ordered[0] ?? null
}

function buildSystemPrompt(provider: IntelligenceProviderRecord): string {
  const lines: string[] = []
  if (provider.instructions)
    lines.push(provider.instructions)
  lines.push(SYSTEM_PROMPT)
  return lines.filter(Boolean).join('\n')
}

async function resolveProviderContext(event: any, userId: string): Promise<ResolvedProviderContext> {
  const providers = await listProviders(event, userId)
  const enabledProviders = providers.filter(provider => provider.enabled)
  if (!enabledProviders.length) {
    throw new Error('No enabled intelligence providers.')
  }

  const settings = await getSettings(event, userId)
  const provider = resolveProvider(enabledProviders, settings.defaultStrategy)
  if (!provider) {
    throw new Error('Provider not found.')
  }

  if (!OPENAI_COMPATIBLE_TYPES.has(provider.type as IntelligenceProviderType)) {
    throw new Error('Provider type is not supported by intelligence chat.')
  }

  const model = resolveProviderModel(provider)
  if (!model) {
    throw new Error('Provider model is missing.')
  }

  const apiKey = provider.type === IntelligenceProviderType.LOCAL
    ? null
    : await getProviderApiKey(event, userId, provider.id)

  if (provider.type !== IntelligenceProviderType.LOCAL && !apiKey) {
    throw new Error('Provider API key is missing.')
  }

  const baseUrl = resolveProviderBaseUrl(provider.type, provider.baseUrl)
  const compatBaseUrl = buildOpenAiCompatBaseUrls(baseUrl)[0] ?? baseUrl

  return {
    provider,
    model,
    apiKey,
    baseUrl: compatBaseUrl,
    timeoutMs: Math.max(5000, provider.timeout || DEFAULT_TIMEOUT_MS),
    systemPrompt: buildSystemPrompt(provider),
  }
}

async function createLangChainModelWithContext(context: ResolvedProviderContext) {
  const { ChatOpenAI } = await import('@langchain/openai') as { ChatOpenAI: any }
  return new ChatOpenAI({
    apiKey: context.apiKey || 'tuff-intelligence',
    model: context.model,
    streaming: true,
    configuration: context.baseUrl ? { baseURL: context.baseUrl } : undefined,
  })
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const method = event.method || 'GET'
  const sessionId = `${SESSION_PREFIX}-${userId}`

  if (method === 'GET') {
    const session = await getRuntimeSession(event, userId, sessionId)
    const history = ensureHistory(session?.history ?? [])
    return history
  }

  if (method !== 'POST') {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method not allowed',
    })
  }

  const body = await readBody<{ message?: string }>(event)
  const message = String(body?.message || '').trim()
  if (!message) {
    throw createError({
      statusCode: 400,
      statusMessage: 'message is required',
    })
  }

  let providerContext: ResolvedProviderContext
  try {
    providerContext = await resolveProviderContext(event, userId)
  } catch (error) {
    const statusMessage = error instanceof Error ? error.message : 'Provider is not available.'
    throw createError({ statusCode: 400, statusMessage })
  }

  const session = await getRuntimeSession(event, userId, sessionId)
  const history = ensureHistory(session?.history ?? [])
  const nextHistory = [...history]
  nextHistory.push({
    role: 'user',
    content: message,
    timestamp: Date.now(),
  })
  if (nextHistory.length > MAX_HISTORY) {
    nextHistory.splice(0, nextHistory.length - MAX_HISTORY)
  }

  await upsertRuntimeSession(event, {
    sessionId,
    userId,
    status: 'executing',
    phase: 'chat',
    objective: message,
    history: nextHistory,
  })

  const encoder = new TextEncoder()
  let aborted = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      const run = async () => {
        let assistantContent = ''
        let hasError = false
        try {
          const model = await createLangChainModelWithContext(providerContext)
          const messages = toLangChainMessages(nextHistory, providerContext.systemPrompt)
          const responseStream = await model.stream(messages)

          for await (const chunk of responseStream) {
            if (aborted)
              break
            const delta = extractChunkText(chunk)
            if (!delta)
              continue
            assistantContent += delta
            send({ type: 'assistant.delta', delta })
          }
        } catch (error) {
          hasError = true
          const message = error instanceof Error ? error.message : 'TuffIntelligence stream failed.'
          send({ type: 'error', message })
        } finally {
          if (assistantContent.trim()) {
            nextHistory.push({
              role: 'assistant',
              content: assistantContent.trim(),
              timestamp: Date.now(),
            })
          }
          await upsertRuntimeSession(event, {
            sessionId,
            userId,
            status: hasError ? 'failed' : 'completed',
            phase: 'chat',
            history: nextHistory.slice(-MAX_HISTORY),
          })
          send({ type: 'done' })
          controller.close()
        }
      }

      void run()
    },
    cancel() {
      aborted = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
})
