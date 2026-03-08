import type {
  IntelligencePromptBinding,
  IntelligencePromptBindingUpsertPayload,
} from '@talex-touch/tuff-intelligence'
import { requireAdmin } from '../../../utils/auth'
import { savePromptBinding } from '../../../utils/intelligenceStore'

function normalizeBinding(body: unknown): IntelligencePromptBinding {
  const payload = (body || {}) as Partial<IntelligencePromptBindingUpsertPayload> & Partial<IntelligencePromptBinding>
  const rawBinding = payload.binding && typeof payload.binding === 'object'
    ? payload.binding
    : payload

  const binding: IntelligencePromptBinding = {
    capabilityId: String(rawBinding.capabilityId || '').trim(),
    promptId: String(rawBinding.promptId || '').trim(),
    promptVersion: typeof rawBinding.promptVersion === 'string'
      ? rawBinding.promptVersion.trim() || undefined
      : undefined,
    channel: rawBinding.channel as IntelligencePromptBinding['channel'],
    providerId: typeof rawBinding.providerId === 'string' ? rawBinding.providerId.trim() || undefined : undefined,
    metadata: rawBinding.metadata && typeof rawBinding.metadata === 'object'
      ? rawBinding.metadata as Record<string, any>
      : undefined,
  }

  if (!binding.capabilityId) {
    throw createError({ statusCode: 400, statusMessage: 'binding.capabilityId is required' })
  }
  if (!binding.promptId) {
    throw createError({ statusCode: 400, statusMessage: 'binding.promptId is required' })
  }
  if (binding.channel && binding.channel !== 'stable' && binding.channel !== 'latest') {
    throw createError({ statusCode: 400, statusMessage: 'binding.channel is invalid' })
  }

  return binding
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)
  const binding = normalizeBinding(body)
  const saved = await savePromptBinding(event, userId, binding)
  return { binding: saved }
})
