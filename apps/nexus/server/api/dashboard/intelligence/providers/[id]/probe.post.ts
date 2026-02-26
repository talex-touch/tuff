import { createError } from 'h3'
import { requireAdmin } from '../../../../../utils/auth'
import { getProvider } from '../../../../../utils/intelligenceStore'
import { probeIntelligenceLabProvider } from '../../../../../utils/tuffIntelligenceLabService'

interface ProbeErrorDetail {
  message: string
  endpoint: string | null
  status: number | null
  responseSnippet: string | null
  baseUrl: string | null
}

function normalizeProbeError(error: unknown): ProbeErrorDetail {
  const fallback: ProbeErrorDetail = {
    message: 'Probe failed.',
    endpoint: null,
    status: null,
    responseSnippet: null,
    baseUrl: null,
  }
  if (!(error instanceof Error))
    return fallback

  const detail = error as Error & {
    endpoint?: unknown
    status?: unknown
    responseSnippet?: unknown
    baseUrl?: unknown
  }

  return {
    message: error.message || fallback.message,
    endpoint: typeof detail.endpoint === 'string' ? detail.endpoint : null,
    status: typeof detail.status === 'number' ? detail.status : null,
    responseSnippet: typeof detail.responseSnippet === 'string' ? detail.responseSnippet : null,
    baseUrl: typeof detail.baseUrl === 'string' ? detail.baseUrl : null,
  }
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required.' })
  }

  const provider = await getProvider(event, userId, id)
  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found.' })
  }

  const body = await readBody<{
    model?: string
    prompt?: string
    timeoutMs?: number
  }>(event)

  const model = typeof body?.model === 'string' ? body.model.trim() : ''
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  const timeoutMs = Number.isFinite(body?.timeoutMs) && typeof body?.timeoutMs === 'number'
    ? Math.max(5000, Math.floor(body.timeoutMs))
    : undefined

  try {
    const result = await probeIntelligenceLabProvider(event, userId, {
      providerId: id,
      model: model || undefined,
      prompt: prompt || undefined,
      timeoutMs,
    })
    return result
  }
  catch (error) {
    const detail = normalizeProbeError(error)
    return {
      success: false,
      providerId: provider.id,
      providerName: provider.name,
      providerType: provider.type,
      model: model || provider.defaultModel || provider.models[0] || '',
      output: '',
      latency: 0,
      endpoint: detail.endpoint || '',
      traceId: '',
      fallbackCount: 0,
      retryCount: 0,
      attemptedProviders: [provider.id],
      message: detail.message,
      error: detail,
    }
  }
})
