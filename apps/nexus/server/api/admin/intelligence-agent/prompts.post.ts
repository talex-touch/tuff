import type {
  IntelligencePromptRecord,
  IntelligencePromptRegistryUpsertPayload,
} from '@talex-touch/tuff-intelligence'
import { requireAdmin } from '../../../utils/auth'
import { savePromptRecord } from '../../../utils/intelligenceStore'

function normalizeRecord(body: unknown): IntelligencePromptRecord {
  const payload = (body || {}) as Partial<IntelligencePromptRegistryUpsertPayload> & Partial<IntelligencePromptRecord>
  const rawRecord = payload.record && typeof payload.record === 'object'
    ? payload.record
    : payload

  const record: IntelligencePromptRecord = {
    id: String(rawRecord.id || '').trim(),
    version: String(rawRecord.version || '').trim(),
    template: String(rawRecord.template || ''),
    name: typeof rawRecord.name === 'string' ? rawRecord.name : undefined,
    description: typeof rawRecord.description === 'string' ? rawRecord.description : undefined,
    variablesSchema: Array.isArray(rawRecord.variablesSchema) ? rawRecord.variablesSchema : undefined,
    scope: rawRecord.scope as IntelligencePromptRecord['scope'],
    status: rawRecord.status as IntelligencePromptRecord['status'],
    capabilityId: typeof rawRecord.capabilityId === 'string' ? rawRecord.capabilityId : undefined,
    providerId: typeof rawRecord.providerId === 'string' ? rawRecord.providerId : undefined,
    channel: rawRecord.channel as IntelligencePromptRecord['channel'],
    tags: Array.isArray(rawRecord.tags) ? rawRecord.tags : undefined,
    metadata: rawRecord.metadata && typeof rawRecord.metadata === 'object'
      ? rawRecord.metadata as Record<string, any>
      : undefined,
    createdAt: typeof rawRecord.createdAt === 'number' ? rawRecord.createdAt : undefined,
    updatedAt: typeof rawRecord.updatedAt === 'number' ? rawRecord.updatedAt : undefined,
  }

  if (!record.id) {
    throw createError({ statusCode: 400, statusMessage: 'record.id is required' })
  }
  if (!record.version) {
    throw createError({ statusCode: 400, statusMessage: 'record.version is required' })
  }
  if (!record.template.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'record.template is required' })
  }
  if (record.scope !== 'global' && record.scope !== 'capability' && record.scope !== 'provider') {
    throw createError({ statusCode: 400, statusMessage: 'record.scope is invalid' })
  }
  if (record.status !== 'active' && record.status !== 'deprecated') {
    throw createError({ statusCode: 400, statusMessage: 'record.status is invalid' })
  }

  return record
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)
  const record = normalizeRecord(body)
  const saved = await savePromptRecord(event, userId, record)
  return { prompt: saved }
})
