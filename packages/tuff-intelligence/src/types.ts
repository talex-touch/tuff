import type {
  IntelligenceAuditLog,
  IntelligenceCapabilityConfig,
  IntelligenceProviderConfig,
  PromptTemplate,
} from '@talex-touch/utils/types/intelligence'

type CompiledStateGraph = any

export interface TuffQuota {
  requestLimit?: number
  tokenLimit?: number
  costLimit?: number
  windowSeconds?: number
}

export interface TuffUsageDelta {
  capabilityId?: string
  provider?: string
  model?: string
  promptId?: string
  promptHash?: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  cost?: number
  latency?: number
  success?: boolean
  timestamp?: number
  metadata?: Record<string, any>
}

export interface TuffGraphContext {
  capabilityId: string
  payload?: any
  provider?: IntelligenceProviderConfig
  model?: string
  promptId?: string
  prompt?: string
  variables?: Record<string, any>
  caller?: string
  userId?: string
  traceId?: string
  timestamp?: number
  metadata?: Record<string, any>
}

export interface TuffGraphState {
  context: TuffGraphContext
}

export interface TuffGraphStep {
  id: string
  run: (context: TuffGraphContext) => Promise<TuffGraphContext> | TuffGraphContext
}

export interface TuffGraphArtifacts {
  compiled?: CompiledStateGraph | null
  steps: TuffGraphStep[]
}

export interface TuffProviderRegistryEntry extends IntelligenceProviderConfig {
  weight?: number
  fallback?: boolean
}

export interface TuffCapabilityBinding extends IntelligenceCapabilityConfig {
  promptId?: string
  promptTemplate?: string
  prompt?: PromptTemplate
}

export interface TuffStorageAuditFilter {
  capabilityId?: string
  providerId?: string
  model?: string
  success?: boolean
  caller?: string
  promptId?: string
  limit?: number
  offset?: number
}

export interface TuffIntelligenceStorageAdapter {
  saveAuditLog: (entry: IntelligenceAuditLog) => Promise<void>
  queryAuditLogs: (filter: TuffStorageAuditFilter) => Promise<IntelligenceAuditLog[]>
  saveUsageDelta: (caller: string, delta: TuffUsageDelta) => Promise<void>
  getQuota: (caller: string) => Promise<TuffQuota | null>
  setQuota: (caller: string, quota: TuffQuota) => Promise<void>
  saveProviderConfig: (config: IntelligenceProviderConfig) => Promise<void>
  listProviders: () => Promise<IntelligenceProviderConfig[]>
  saveCapabilityConfig: (config: IntelligenceCapabilityConfig) => Promise<void>
  listCapabilities: () => Promise<IntelligenceCapabilityConfig[]>
  savePrompt: (prompt: PromptTemplate) => Promise<void>
  listPrompts: () => Promise<PromptTemplate[]>
  deletePrompt: (id: string) => Promise<void>
}

export interface TuffIntelligenceConfig {
  providers: TuffProviderRegistryEntry[]
  capabilities: TuffCapabilityBinding[]
  prompts: PromptTemplate[]
  quota?: Record<string, TuffQuota>
  enableAudit?: boolean
  enableUsage?: boolean
}
