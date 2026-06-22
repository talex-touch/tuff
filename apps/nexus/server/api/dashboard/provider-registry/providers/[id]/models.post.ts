import { createError, getRouterParam } from 'h3'
import { requireAdmin } from '../../../../../utils/auth'
import { fetchProviderModels } from '../../../../../utils/intelligenceModels'
import { getProviderCredential } from '../../../../../utils/providerCredentialStore'
import { getProviderRegistryEntry } from '../../../../../utils/providerRegistryStore'

const VALID_MODEL_PROVIDER_TYPES = new Set(['openai', 'anthropic', 'deepseek', 'siliconflow', 'local', 'custom'])

function readStringMetadata(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function resolveModelProviderType(provider: Awaited<ReturnType<typeof getProviderRegistryEntry>>): string {
  const metadataType = readStringMetadata(provider?.metadata, 'intelligenceType')
  if (metadataType && VALID_MODEL_PROVIDER_TYPES.has(metadataType))
    return metadataType

  const vendor = provider?.vendor
  if (vendor === 'openai' || vendor === 'deepseek')
    return vendor

  return 'custom'
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  }

  const provider = await getProviderRegistryEntry(event, id)
  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: 'Provider registry entry not found.' })
  }

  const type = resolveModelProviderType(provider)
  let apiKey: string | null = null

  if (type !== 'local') {
    if (provider.authType !== 'api_key' || !provider.authRef) {
      throw createError({ statusCode: 400, statusMessage: 'Provider API key credential is required to fetch models.' })
    }

    const credential = await getProviderCredential(event, provider.authRef)
    apiKey = credential && 'apiKey' in credential ? credential.apiKey : null
    if (!apiKey) {
      throw createError({ statusCode: 400, statusMessage: 'Provider API key credential is missing.' })
    }
  }

  const models = await fetchProviderModels({
    type,
    baseUrl: provider.endpoint,
    apiKey,
  })

  return { models }
})
