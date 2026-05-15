import type { BaseMessage } from '@langchain/core/messages'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { createError, getRouterParam, readBody } from 'h3'
import { requireAdmin } from '../../../../../utils/auth'
import { buildOpenAiCompatBaseUrls, resolveProviderBaseUrl } from '../../../../../utils/intelligenceModels'
import {
  getIntelligenceProviderApiKeyWithRegistryFallback,
  getIntelligenceProviderRegistryMirror,
} from '../../../../../utils/intelligenceProviderRegistryBridge'
import { getProvider, type IntelligenceProviderRecord } from '../../../../../utils/intelligenceStore'

interface ResolvedProbeContext {
  provider: IntelligenceProviderRecord
  model: string
  apiKey: string | null
  baseUrl: string
  timeoutMs: number
}

const DEFAULT_TIMEOUT_MS = 30_000
const OPENAI_COMPATIBLE_TYPES = new Set([
  IntelligenceProviderType.OPENAI,
  IntelligenceProviderType.DEEPSEEK,
  IntelligenceProviderType.SILICONFLOW,
  IntelligenceProviderType.CUSTOM,
  IntelligenceProviderType.LOCAL,
])

function resolveProviderModel(provider: IntelligenceProviderRecord, requestedModel?: string): string | null {
  return requestedModel?.trim() || provider.defaultModel || provider.models?.[0] || null
}

function buildProbeMessages(prompt: string): BaseMessage[] {
  return [
    new SystemMessage('You are a Tuff Intelligence provider probe assistant. Keep the output concise.'),
    new HumanMessage(prompt),
  ]
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

async function resolveProbeContext(
  event: any,
  userId: string,
  providerId: string,
  requestedModel?: string,
  requestedTimeoutMs?: number,
): Promise<ResolvedProbeContext> {
  const provider = await getProvider(event, userId, providerId)
    ?? await getIntelligenceProviderRegistryMirror(event, userId, providerId)
  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found.' })
  }

  const model = resolveProviderModel(provider, requestedModel)
  if (!model) {
    throw createError({ statusCode: 400, statusMessage: 'Provider model is missing.' })
  }

  const apiKey = provider.type === IntelligenceProviderType.LOCAL
    ? null
    : await getIntelligenceProviderApiKeyWithRegistryFallback(event, userId, provider.id)
  if (provider.type !== IntelligenceProviderType.LOCAL && !apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'Provider API key is missing.' })
  }

  const baseUrl = resolveProviderBaseUrl(provider.type, provider.baseUrl)
  const timeoutMs = Number.isFinite(requestedTimeoutMs)
    ? Math.min(Math.max(Math.floor(requestedTimeoutMs as number), 5000), 120000)
    : Math.max(5000, provider.timeout || DEFAULT_TIMEOUT_MS)

  return {
    provider,
    model,
    apiKey,
    baseUrl,
    timeoutMs,
  }
}

async function createProbeModel(context: ResolvedProbeContext) {
  if (context.provider.type === IntelligenceProviderType.ANTHROPIC) {
    const { ChatAnthropic } = await import('@langchain/anthropic') as { ChatAnthropic: any }
    return new ChatAnthropic({
      anthropicApiKey: context.apiKey || '',
      model: context.model,
      maxTokens: 800,
      timeout: context.timeoutMs,
      anthropicApiUrl: context.baseUrl,
      clientOptions: { baseURL: context.baseUrl },
    })
  }

  if (OPENAI_COMPATIBLE_TYPES.has(context.provider.type as IntelligenceProviderType)) {
    const { ChatOpenAI } = await import('@langchain/openai') as { ChatOpenAI: any }
    const compatBaseUrl = buildOpenAiCompatBaseUrls(context.baseUrl)[0] ?? context.baseUrl
    return new ChatOpenAI({
      apiKey: context.apiKey || 'tuff-local-key',
      model: context.model,
      temperature: 0.2,
      timeout: context.timeoutMs,
      streaming: true,
      configuration: { baseURL: compatBaseUrl },
    })
  }

  throw createError({ statusCode: 400, statusMessage: 'Provider type is not supported by streaming probe.' })
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message || 'Probe stream failed.'
  return 'Probe stream failed.'
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const providerId = String(getRouterParam(event, 'id') || '').trim()
  if (!providerId) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required.' })
  }

  const body = await readBody<{
    model?: string
    prompt?: string
    timeoutMs?: number
  }>(event)
  const prompt = typeof body?.prompt === 'string' && body.prompt.trim()
    ? body.prompt.trim()
    : 'Reply with "pong" and one short sentence describing your model capability.'
  const requestedModel = typeof body?.model === 'string' ? body.model.trim() : ''
  const requestedTimeoutMs = typeof body?.timeoutMs === 'number' ? body.timeoutMs : undefined

  const encoder = new TextEncoder()
  let aborted = false
  let closed = false
  const startedAt = Date.now()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: Record<string, unknown>) => {
        if (closed)
          return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            timestamp: Date.now(),
            ...payload,
          })}\n\n`))
        }
        catch {
          closed = true
        }
      }

      const closeStream = () => {
        if (closed)
          return
        closed = true
        try {
          controller.close()
        }
        catch {
          // Client already closed the stream.
        }
      }

      const run = async () => {
        let output = ''
        try {
          send({ type: 'status', message: 'Resolving provider...' })
          const context = await resolveProbeContext(event, userId, providerId, requestedModel, requestedTimeoutMs)
          send({
            type: 'probe.started',
            providerId: context.provider.id,
            providerName: context.provider.name,
            providerType: context.provider.type,
            model: context.model,
            message: 'Provider resolved. Waiting for model stream...',
          })

          const model = await createProbeModel(context)
          const responseStream = await model.stream(buildProbeMessages(prompt))
          for await (const chunk of responseStream) {
            if (aborted)
              break
            const delta = extractChunkText(chunk)
            if (!delta)
              continue
            output += delta
            send({ type: 'assistant.delta', delta })
          }

          send({
            type: 'probe.completed',
            result: {
              success: true,
              providerId: context.provider.id,
              providerName: context.provider.name,
              providerType: context.provider.type,
              model: context.model,
              output: output.trim(),
              latency: Date.now() - startedAt,
              endpoint: context.baseUrl,
              traceId: `probe_${startedAt}`,
              fallbackCount: 0,
              retryCount: 0,
              attemptedProviders: [context.provider.id],
              message: 'Probe completed.',
            },
          })
        }
        catch (error) {
          send({
            type: 'error',
            message: toErrorMessage(error),
          })
        }
        finally {
          send({ type: 'done' })
          closeStream()
        }
      }

      void run()
    },
    cancel() {
      aborted = true
      closed = true
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
