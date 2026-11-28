import type { H3Event } from 'h3'
import type { ProviderCheckOptions, ProviderCheckResult } from './providerCheck'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import { invokeIntelligenceVisionOcr } from './intelligenceVisionOcrProvider'
import { probeIntelligenceLabProvider } from './tuffIntelligenceLabService'
import { resolveProviderSceneAdapterKey } from './sceneCapabilityAdapterRegistry'

const DEFAULT_CHECK_CAPABILITY = 'text.chat'
const VISION_OCR_CAPABILITY = 'vision.ocr'
const DEFAULT_OCR_HEALTHCHECK_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5IaKQAAAABJRU5ErkJggg=='

interface IntelligenceProviderCheckOptions extends ProviderCheckOptions {
  model?: string
  prompt?: string
  timeoutMs?: number
  imageDataUrl?: string
  imageBase64?: string
  language?: string
}


function normalizeCapability(value: string | undefined): string {
  return value?.trim() || DEFAULT_CHECK_CAPABILITY
}

function providerHasCapability(provider: ProviderRegistryRecord, capability: string) {
  return provider.capabilities.some(item => item.capability === capability)
}

function readOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function errorCodeForMessage(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('api key') || normalized.includes('credential') || normalized.includes('auth'))
    return 'AUTH_REQUIRED'
  if (normalized.includes('not found'))
    return 'PROVIDER_NOT_FOUND'
  if (normalized.includes('timeout'))
    return 'PROVIDER_TIMEOUT'
  return 'PROVIDER_REQUEST_FAILED'
}

function normalizeErrorDetail(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      message: 'Intelligence provider check failed.',
      endpoint: '',
      status: undefined,
    }
  }

  const detail = error as Error & {
    endpoint?: unknown
    status?: unknown
  }

  return {
    message: error.message || 'Intelligence provider check failed.',
    endpoint: typeof detail.endpoint === 'string' ? detail.endpoint : '',
    status: typeof detail.status === 'number' ? detail.status : undefined,
  }
}

export function isIntelligenceProviderRegistryEntry(provider: ProviderRegistryRecord): boolean {
  const adapterKey = resolveProviderSceneAdapterKey(provider)
  return adapterKey === 'openai-compatible' || adapterKey === 'openai-responses'
}

export async function checkIntelligenceProviderRegistryEntry(
  event: H3Event,
  userId: string,
  provider: ProviderRegistryRecord,
  options: IntelligenceProviderCheckOptions = {},
): Promise<ProviderCheckResult> {
  const capability = normalizeCapability(options.capability)
  const endpoint = provider.endpoint?.trim() || ''

  if (provider.status === 'disabled') {
    return {
      success: false,
      providerId: provider.id,
      capability,
      latency: 0,
      endpoint,
      message: 'Provider is disabled.',
      error: { code: 'PROVIDER_DISABLED', message: 'Provider is disabled.' },
    }
  }

  if (!isIntelligenceProviderRegistryEntry(provider)) {
    return {
      success: false,
      providerId: provider.id,
      capability,
      latency: 0,
      endpoint,
      message: 'Provider check is not supported for this adapter.',
      error: { code: 'PROVIDER_CHECK_UNSUPPORTED', message: 'Provider check is not supported for this adapter.' },
    }
  }

  if (!providerHasCapability(provider, capability)) {
    return {
      success: false,
      providerId: provider.id,
      capability,
      latency: 0,
      endpoint,
      message: 'Provider capability is not supported.',
      error: { code: 'CAPABILITY_UNSUPPORTED', message: 'Provider capability is not supported.' },
    }
  }


  const startedAt = Date.now()
  const effectiveUserId = provider.ownerScope === 'user' && provider.ownerId
    ? provider.ownerId
    : userId

  if (capability === VISION_OCR_CAPABILITY) {
    try {
      const imageDataUrl = readOptionalString(options.imageDataUrl)
      const imageBase64 = readOptionalString(options.imageBase64)
      const result = await invokeIntelligenceVisionOcr(event, provider, {
        source: imageDataUrl
          ? { type: 'data-url', dataUrl: imageDataUrl }
          : imageBase64
            ? { type: 'base64', base64: imageBase64 }
            : { type: 'data-url', dataUrl: DEFAULT_OCR_HEALTHCHECK_DATA_URL },
        language: readOptionalString(options.language),
        prompt: readOptionalString(options.prompt)
          ?? 'Extract OCR text from this image and return compact JSON. If no readable text is visible, return {"text":"no visible text","confidence":0,"language":"unknown","keywords":[],"blocks":[]}.',
        includeLayout: true,
        includeKeywords: true,
      })

      return {
        success: true,
        providerId: provider.id,
        capability,
        latency: result.latencyMs,
        endpoint,
        requestId: result.providerRequestId,
        message: 'Intelligence vision OCR check succeeded.',
      }
    }
    catch (error) {
      const detail = normalizeErrorDetail(error)
      const message = detail.message || 'Intelligence vision OCR check failed.'
      return {
        success: false,
        providerId: provider.id,
        capability,
        latency: Date.now() - startedAt,
        endpoint: detail.endpoint || endpoint,
        message,
        error: {
          code: errorCodeForMessage(message),
          message,
          status: detail.status,
        },
      }
    }
  }

  try {
    const result = await probeIntelligenceLabProvider(event, effectiveUserId, {
      providerId: provider.id,
      model: options.model,
      prompt: options.prompt,
      timeoutMs: options.timeoutMs,
    })

    return {
      success: true,
      providerId: provider.id,
      capability,
      latency: result.latency,
      endpoint: result.endpoint || endpoint,
      requestId: result.traceId,
      message: result.message || 'Intelligence provider check succeeded.',
    }
  }
  catch (error) {
    const detail = normalizeErrorDetail(error)
    const message = detail.message || 'Intelligence provider check failed.'
    return {
      success: false,
      providerId: provider.id,
      capability,
      latency: Date.now() - startedAt,
      endpoint: detail.endpoint || endpoint,
      message,
      error: {
        code: errorCodeForMessage(message),
        message,
        status: detail.status,
      },
    }
  }
}
