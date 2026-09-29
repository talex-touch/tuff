import { createError, getRouterParam, readBody } from 'h3'
import { requireAdmin } from '../../../../../utils/auth'
import {
  checkIntelligenceProviderRegistryEntry,
  isIntelligenceProviderRegistryEntry,
} from '../../../../../utils/intelligenceProviderHealthCheck'
import { recordProviderHealthCheck } from '../../../../../utils/providerHealthStore'
import { getProviderRegistryEntry } from '../../../../../utils/providerRegistryStore'
import { checkTencentMachineTranslationProvider } from '../../../../../utils/tencentMachineTranslationProvider'
import { resolveProviderSceneAdapterKey } from '../../../../../utils/sceneCapabilityAdapterRegistry'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  }

  const provider = await getProviderRegistryEntry(event, id)
  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: 'Provider registry entry not found.' })
  }

  const body = await readBody<{
    capability?: string
    model?: string
    prompt?: string
    timeoutMs?: number
    imageDataUrl?: string
    imageBase64?: string
    language?: string
  }>(event)
  const options = {
    capability: typeof body?.capability === 'string' ? body.capability : undefined,
    model: typeof body?.model === 'string' ? body.model.trim() || undefined : undefined,
    prompt: typeof body?.prompt === 'string' ? body.prompt.trim() || undefined : undefined,
    imageDataUrl: typeof body?.imageDataUrl === 'string' ? body.imageDataUrl.trim() || undefined : undefined,
    imageBase64: typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() || undefined : undefined,
    language: typeof body?.language === 'string' ? body.language.trim() || undefined : undefined,
    timeoutMs: Number.isFinite(body?.timeoutMs) && typeof body?.timeoutMs === 'number'
      ? Math.max(5000, Math.floor(body.timeoutMs))
      : undefined,
  }
  const adapterKey = resolveProviderSceneAdapterKey(provider)
  const result = isIntelligenceProviderRegistryEntry(provider)
    ? await checkIntelligenceProviderRegistryEntry(event, userId, provider, options)
    : adapterKey === 'tencent-translation'
      ? await checkTencentMachineTranslationProvider(event, provider, options)
      : {
          success: false,
          providerId: provider.id,
          capability: options.capability || provider.capabilities[0]?.capability || 'unknown',
          latency: 0,
          endpoint: provider.endpoint || '',
          message: 'Provider check is not supported for this adapter.',
          error: { code: 'PROVIDER_CHECK_UNSUPPORTED', message: 'Provider check is not supported for this adapter.' },
        }

  try {
    await recordProviderHealthCheck(event, provider, result)
  }
  catch (error) {
    console.warn('[provider-registry] Failed to record provider health check', error)
  }

  return result
})
