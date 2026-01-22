import type {
  TuffIntelligenceStorageAdapter,
  TuffQuota,
  TuffStorageAuditFilter,
  TuffUsageDelta
} from '@talex-touch/tuff-intelligence'
import type {
  IntelligenceAuditLog,
  IntelligenceCapabilityConfig,
  IntelligenceProviderConfig,
  PromptTemplate
} from '@talex-touch/utils/types/intelligence'
import { eq } from 'drizzle-orm'
import { config } from '../../db/schema'
import { databaseModule } from '../database'
import {
  intelligenceAuditLogger,
  type IntelligenceAuditLogEntry
} from './intelligence-audit-logger'
import { intelligenceQuotaManager } from './intelligence-quota-manager'

const CONFIG_KEYS = {
  providers: 'intelligence/providers',
  capabilities: 'intelligence/capabilities',
  prompts: 'intelligence/prompts'
} as const

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

async function upsertConfig(key: string, value: unknown): Promise<void> {
  const db = databaseModule.getDb()
  const serialized = JSON.stringify(value ?? null)
  await db
    .insert(config)
    .values({ key, value: serialized })
    .onConflictDoUpdate({
      target: config.key,
      set: { value: serialized }
    })
}

async function readConfigValue(key: string): Promise<string | null> {
  const db = databaseModule.getDb()
  const row = await db
    .select({ value: config.value })
    .from(config)
    .where(eq(config.key, key))
    .limit(1)
  return row[0]?.value ?? null
}

export class DbTuffIntelligenceStorageAdapter implements TuffIntelligenceStorageAdapter {
  async saveAuditLog(entry: IntelligenceAuditLog): Promise<void> {
    await intelligenceAuditLogger.log(entry)
  }

  async queryAuditLogs(filter: TuffStorageAuditFilter): Promise<IntelligenceAuditLog[]> {
    const logs = await intelligenceAuditLogger.queryLogs({
      caller: filter.caller,
      capabilityId: filter.capabilityId,
      provider: filter.providerId,
      success: filter.success,
      limit: filter.limit,
      offset: filter.offset
    })

    return logs.filter((log) => {
      if (filter.model && log.model !== filter.model) return false
      if (filter.promptId) {
        const promptId =
          typeof log.metadata?.promptId === 'string' ? log.metadata.promptId : undefined
        if (promptId !== filter.promptId) return false
      }
      return true
    })
  }

  async saveUsageDelta(caller: string, delta: TuffUsageDelta): Promise<void> {
    const traceId = intelligenceAuditLogger.generateTraceId()

    const entry: IntelligenceAuditLogEntry = {
      traceId,
      timestamp: delta.timestamp ?? Date.now(),
      capabilityId: delta.capabilityId ?? 'unknown',
      provider: delta.provider ?? 'unknown',
      model: delta.model ?? 'unknown',
      promptHash: delta.promptHash,
      caller,
      usage: {
        promptTokens: delta.promptTokens ?? 0,
        completionTokens: delta.completionTokens ?? 0,
        totalTokens: delta.totalTokens ?? (delta.promptTokens ?? 0) + (delta.completionTokens ?? 0)
      },
      latency: delta.latency ?? 0,
      success: delta.success ?? true,
      error: delta.success === false ? 'usage_delta_failed' : undefined,
      metadata: {
        ...delta.metadata,
        promptId: delta.promptId
      }
    }
    await intelligenceAuditLogger.log(entry)
  }

  async getQuota(caller: string): Promise<TuffQuota | null> {
    const quota = await intelligenceQuotaManager.getQuota(caller, 'plugin')
    if (!quota) return null

    return {
      requestLimit: quota.requestsPerMinute ?? quota.requestsPerDay ?? quota.requestsPerMonth,
      tokenLimit: quota.tokensPerMinute ?? quota.tokensPerDay ?? quota.tokensPerMonth,
      costLimit: quota.costLimitPerDay ?? quota.costLimitPerMonth,
      windowSeconds:
        quota.requestsPerMinute || quota.tokensPerMinute
          ? 60
          : quota.requestsPerDay || quota.tokensPerDay
            ? 86400
            : quota.requestsPerMonth || quota.tokensPerMonth
              ? 2592000
              : undefined
    }
  }

  async setQuota(caller: string, quota: TuffQuota): Promise<void> {
    const window = quota.windowSeconds
    const useMinute = typeof window === 'number' && window > 0 && window <= 60
    const useDay = typeof window === 'number' && window > 60 && window <= 86400
    const useMonth = typeof window === 'number' && window > 86400

    await intelligenceQuotaManager.setQuota({
      callerId: caller,
      callerType: 'plugin',
      requestsPerMinute: useMinute ? quota.requestLimit : undefined,
      tokensPerMinute: useMinute ? quota.tokenLimit : undefined,
      requestsPerDay: useDay
        ? quota.requestLimit
        : !useMinute && !useMonth
          ? quota.requestLimit
          : undefined,
      tokensPerDay: useDay
        ? quota.tokenLimit
        : !useMinute && !useMonth
          ? quota.tokenLimit
          : undefined,
      requestsPerMonth: useMonth ? quota.requestLimit : undefined,
      tokensPerMonth: useMonth ? quota.tokenLimit : undefined,
      costLimitPerDay: useMonth ? undefined : quota.costLimit,
      costLimitPerMonth: useMonth ? quota.costLimit : undefined,
      enabled: true
    })
  }

  async saveProviderConfig(cfg: IntelligenceProviderConfig): Promise<void> {
    const list = await this.listProviders()
    const idx = list.findIndex((p) => p.id === cfg.id)
    if (idx >= 0) list[idx] = cfg
    else list.push(cfg)

    await upsertConfig(CONFIG_KEYS.providers, list)
  }

  async listProviders(): Promise<IntelligenceProviderConfig[]> {
    const raw = await readConfigValue(CONFIG_KEYS.providers)
    return parseJson<IntelligenceProviderConfig[]>(raw, [])
  }

  async saveCapabilityConfig(cfg: IntelligenceCapabilityConfig): Promise<void> {
    const list = await this.listCapabilities()
    const idx = list.findIndex((c) => c.id === cfg.id)
    if (idx >= 0) list[idx] = cfg
    else list.push(cfg)

    await upsertConfig(CONFIG_KEYS.capabilities, list)
  }

  async listCapabilities(): Promise<IntelligenceCapabilityConfig[]> {
    const raw = await readConfigValue(CONFIG_KEYS.capabilities)
    return parseJson<IntelligenceCapabilityConfig[]>(raw, [])
  }

  async savePrompt(prompt: PromptTemplate): Promise<void> {
    const list = await this.listPrompts()
    const idx = list.findIndex((p) => p.id === prompt.id)
    if (idx >= 0) list[idx] = prompt
    else list.push(prompt)

    await upsertConfig(CONFIG_KEYS.prompts, list)
  }

  async listPrompts(): Promise<PromptTemplate[]> {
    const raw = await readConfigValue(CONFIG_KEYS.prompts)
    return parseJson<PromptTemplate[]>(raw, [])
  }

  async deletePrompt(id: string): Promise<void> {
    const list = await this.listPrompts()
    await upsertConfig(
      CONFIG_KEYS.prompts,
      list.filter((p) => p.id !== id)
    )
  }
}

export const dbTuffIntelligenceStorageAdapter = new DbTuffIntelligenceStorageAdapter()
