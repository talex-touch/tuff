import { createError, getRouterParam, readBody } from 'h3'
import { requireAdmin } from '../../../../../utils/auth'
import { getProviderRegistryEntry } from '../../../../../utils/providerRegistryStore'
import { checkTencentMachineTranslationProvider } from '../../../../../utils/tencentMachineTranslationProvider'

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

  const body = await readBody<{ capability?: string }>(event)
  return await checkTencentMachineTranslationProvider(event, provider, {
    capability: typeof body?.capability === 'string' ? body.capability : undefined,
  })
})
