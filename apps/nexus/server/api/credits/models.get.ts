import { requireVerifiedEmail } from '../../utils/auth'
import { listProviders } from '../../utils/intelligenceStore'
import { resolveRequestGeo } from '../../utils/requestGeo'

const DOMESTIC_PROVIDER_TYPES = new Set(['deepseek', 'siliconflow', 'local'])

function resolveMultiplier(value: unknown, fallback = 1): number {
  const resolved = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(resolved) || resolved <= 0) {
    return fallback
  }
  return Number(resolved.toFixed(2))
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireVerifiedEmail(event)
  const geo = resolveRequestGeo(event)
  const isChina = geo.countryCode === 'CN'
  const providers = await listProviders(event, userId)

  const models: Array<{
    id: string
    provider: string
    providerType: string
    providerId: string
    multiplier: number
  }> = []

  for (const provider of providers) {
    if (!provider.enabled)
      continue

    const metadata = provider.metadata ?? {}
    const isDomestic = metadata.region === 'cn'
      || metadata.region === 'CN'
      || metadata.country === 'CN'
      || DOMESTIC_PROVIDER_TYPES.has(provider.type)

    if (isChina && !isDomestic)
      continue

    const providerMultiplier = resolveMultiplier(
      (metadata as Record<string, any>).creditMultiplier ?? (metadata as Record<string, any>).multiplier,
      1,
    )
    const rawModelMultipliers = (metadata as Record<string, any>).modelMultipliers
    const modelMultipliers = rawModelMultipliers && typeof rawModelMultipliers === 'object'
      ? rawModelMultipliers as Record<string, unknown>
      : {}

    for (const model of provider.models || []) {
      const modelMultiplier = resolveMultiplier(modelMultipliers[model], providerMultiplier)
      models.push({
        id: model,
        provider: provider.name,
        providerType: provider.type,
        providerId: provider.id,
        multiplier: modelMultiplier,
      })
    }
  }

  return {
    restricted: isChina,
    models,
  }
})
