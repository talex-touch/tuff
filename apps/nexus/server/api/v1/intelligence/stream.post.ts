import type { NexusIntelligenceInvokePayload } from '../../../utils/tuffIntelligenceLabService'
import { createError, readBody } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { normalizeNexusIntelligenceTransportError } from '../../../utils/intelligenceErrorContract'
import {

  streamIntelligenceCapability,
} from '../../../utils/tuffIntelligenceLabService'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

function readStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value))
    return undefined
  const values = value
    .filter(
      (item): item is string =>
        typeof item === 'string' && Boolean(item.trim()),
    )
    .map(item => item.trim())
  return values.length > 0 ? values : undefined
}

function parseRequest(value: unknown): NexusIntelligenceInvokePayload {
  if (!isRecord(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request body is required.',
    })
  }
  const capabilityId = readOptionalString(value.capabilityId)
  if (!capabilityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'capabilityId is required.',
    })
  }
  const rawOptions = isRecord(value.options) ? value.options : null
  return {
    capabilityId,
    payload: value.payload,
    options: rawOptions
      ? {
          providerId: readOptionalString(rawOptions.providerId),
          preferredProviderId: readOptionalString(
            rawOptions.preferredProviderId,
          ),
          model: readOptionalString(rawOptions.model),
          timeoutMs: readOptionalNumber(rawOptions.timeoutMs),
          modelPreference: readStringList(rawOptions.modelPreference),
          allowedProviderIds: readStringList(rawOptions.allowedProviderIds),
          metadata: isRecord(rawOptions.metadata)
            ? rawOptions.metadata
            : undefined,
        }
      : undefined,
  }
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const request = parseRequest(await readBody(event))
  const encoder = new TextEncoder()
  const abortController = new AbortController()
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: Record<string, unknown>): void => {
        if (closed)
          return
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
          )
        }
        catch {
          closed = true
          abortController.abort(new Error('Client stream closed.'))
        }
      }
      const close = (): void => {
        if (closed)
          return
        closed = true
        try {
          controller.close()
        }
        catch {
          // The client already closed the stream.
        }
      }

      const run = async (): Promise<void> => {
        try {
          const result = await streamIntelligenceCapability(
            event,
            userId,
            request,
            {
              signal: abortController.signal,
              onStart: meta => send({ type: 'start', ...meta }),
              onDelta: (delta, meta) => send({ type: 'delta', delta, ...meta }),
            },
          )
          send({
            type: 'usage',
            capabilityId: result.capabilityId,
            usage: result.usage,
            traceId: result.traceId,
            provider: result.provider,
            model: result.model,
            latency: result.latency,
          })
          send({ type: 'end' })
        }
        catch (error) {
          if (!abortController.signal.aborted) {
            send({
              type: 'error',
              ...normalizeNexusIntelligenceTransportError(error),
            })
          }
        }
        finally {
          close()
        }
      }

      void run()
    },
    cancel() {
      closed = true
      abortController.abort(new Error('Client stream cancelled.'))
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
})
