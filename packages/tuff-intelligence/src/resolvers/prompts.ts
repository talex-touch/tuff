import type {
  IntelligenceCapabilityConfig,
  IntelligencePromptBinding,
  IntelligencePromptRecord,
} from '../types/intelligence'
import { toRuntimeCapabilityId } from './capabilities'

export interface ResolvePromptTemplateOptions {
  capabilityId: string
  capability?: Pick<IntelligenceCapabilityConfig, 'promptBinding' | 'promptTemplate'> | null
  promptRegistry?: IntelligencePromptRecord[] | null
  promptBindings?: IntelligencePromptBinding[] | null
  metadataBinding?: IntelligencePromptBinding | null
  providerId?: string | null
}

function normalizePromptBindingCapability(
  capabilityId: string,
  binding: IntelligencePromptBinding,
): IntelligencePromptBinding {
  const { capabilityId: _ignored, ...rest } = binding
  return {
    capabilityId,
    ...rest,
  }
}

function resolvePromptRecord(
  registry: IntelligencePromptRecord[],
  binding: IntelligencePromptBinding,
  providerId?: string | null,
): IntelligencePromptRecord | undefined {
  const candidates = registry.filter((item) => {
    if (item.id !== binding.promptId) return false
    if (item.status !== 'active') return false
    if (binding.promptVersion && item.version !== binding.promptVersion) return false
    const targetProviderId = providerId || binding.providerId
    if (targetProviderId && item.providerId && item.providerId !== targetProviderId) return false
    if (binding.providerId && item.providerId && item.providerId !== binding.providerId) return false
    return true
  })

  if (candidates.length <= 0) {
    return undefined
  }

  return [...candidates].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
}

export function resolveIntelligencePromptTemplate(
  options: ResolvePromptTemplateOptions,
): string | undefined {
  const capabilityId = toRuntimeCapabilityId(options.capabilityId)
  if (!capabilityId) {
    return undefined
  }

  const orderedBindings: IntelligencePromptBinding[] = []
  const capability = options.capability ?? null

  if (options.metadataBinding?.promptId) {
    orderedBindings.push(normalizePromptBindingCapability(capabilityId, options.metadataBinding))
  }

  if (capability?.promptBinding?.promptId) {
    orderedBindings.push(normalizePromptBindingCapability(capabilityId, capability.promptBinding))
  }

  const promptBindings = options.promptBindings ?? []
  const providerSpecificBindings = promptBindings.filter(
    item => toRuntimeCapabilityId(item.capabilityId) === capabilityId
      && options.providerId
      && item.providerId === options.providerId,
  )
  const genericBindings = promptBindings.filter(
    item => toRuntimeCapabilityId(item.capabilityId) === capabilityId && !item.providerId,
  )
  const otherBindings = promptBindings.filter(
    item => toRuntimeCapabilityId(item.capabilityId) === capabilityId
      && item.providerId
      && item.providerId !== options.providerId,
  )

  orderedBindings.push(...providerSpecificBindings, ...genericBindings, ...otherBindings)

  const registry = options.promptRegistry ?? []
  for (const binding of orderedBindings) {
    const record = resolvePromptRecord(registry, binding, options.providerId)
    if (record?.template) {
      return record.template
    }
  }

  return capability?.promptTemplate
}
