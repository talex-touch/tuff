import type {
  AiAgentProfile,
  AiAutomationDefinition,
  AiAutomationRunRecord,
  AiImportApplyResult,
  AiImportCandidate,
  AiImportScanResult,
  AiImportedConfigItem,
  AiOrchestratorEvent,
  AiOrchestratorRunListRequest,
  AiOrchestratorRunRecord,
  AiOrchestratorRunStatus,
  AiSessionHistoryMessage
} from '@talex-touch/utils/types/ai-orchestrator'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { and, asc, desc, eq, gte, inArray, or } from 'drizzle-orm'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import {
  aiAgentProfiles,
  aiAutomationRuns,
  aiAutomations,
  aiImportItems,
  aiImportRevisions,
  aiImportScans,
  aiImportSources,
  aiOrchestratorEvents,
  aiOrchestratorRuns
} from '../../db/schema'
import { resolveRuntimeRootPath } from '../../utils/app-root-path'
import { getSecureStoreValue, setSecureStoreValue } from '../../utils/secure-store'
import { databaseModule } from '../database'
import { normalizeAutomationPolicy } from './ai-automation-policy'
import type { AiPreparedImportItem } from './ai-import-types'

const DEFAULT_PROFILE_ID = 'default-pi'
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function serializeJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value)
}

async function removeSecureStoreRefs(authRefs: Iterable<string>): Promise<() => Promise<void>> {
  const rootPath = resolveRuntimeRootPath(app)
  const removed: Array<{ authRef: string; previousValue: string }> = []
  const restore = async (): Promise<void> => {
    const failed: string[] = []
    for (const { authRef, previousValue } of [...removed].reverse()) {
      if (!(await setSecureStoreValue(rootPath, authRef, previousValue, 'ai-import-secret')))
        failed.push(authRef)
    }
    if (failed.length > 0)
      throw new Error(`Failed to restore imported secret references: ${failed.join(', ')}`)
  }

  try {
    for (const authRef of new Set(authRefs)) {
      const previousValue = await getSecureStoreValue(rootPath, authRef, 'ai-import-secret')
      if (!(await setSecureStoreValue(rootPath, authRef, null, 'ai-import-secret')))
        throw new Error(`Failed to remove imported secret reference ${authRef}`)
      if (previousValue !== null) removed.push({ authRef, previousValue })
    }
  } catch (error) {
    await restore()
    throw error
  }
  return restore
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 50
  return Math.max(1, Math.min(200, Math.floor(limit as number)))
}

function mapProfile(row: typeof aiAgentProfiles.$inferSelect): AiAgentProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    runtimeProvider: 'pi-core',
    enabled: row.enabled,
    systemPrompt: row.systemPrompt ?? undefined,
    modelPreference: parseJson(row.modelPreference, []),
    allowedToolIds: parseJson(row.allowedToolIds, []),
    enabledSkillIds: parseJson(row.enabledSkillIds, []),
    permissionPolicy: parseJson(row.permissionPolicy, {
      mode: 'manual',
      allowedPermissions: []
    }),
    timeoutMs: row.timeoutMs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapImportedItem(row: typeof aiImportItems.$inferSelect): AiImportedConfigItem {
  return {
    id: row.id,
    candidateId: row.candidateId,
    sourceId: row.sourceId,
    provider: row.provider as AiImportedConfigItem['provider'],
    sourceScope: row.scope as AiImportedConfigItem['sourceScope'],
    targetScope: row.targetScope as AiImportedConfigItem['targetScope'],
    workspaceRoot: row.workspaceRoot ?? undefined,
    kind: row.kind as AiImportedConfigItem['kind'],
    name: row.name,
    alias: row.alias ?? undefined,
    sourceKey: row.sourceKey,
    contentRef: row.contentRef ?? undefined,
    normalizedProjection: parseJson(row.projection, undefined),
    secrets: parseJson(row.secrets, []),
    state: row.state as AiImportedConfigItem['state'],
    revisionId: row.revisionId,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapAutomation(row: typeof aiAutomations.$inferSelect): AiAutomationDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    objective: row.objective,
    input: parseJson(row.input, undefined),
    profileId: row.profileId,
    trigger: parseJson(row.trigger, { type: 'startup' }),
    approvalMode: row.approvalMode as AiAutomationDefinition['approvalMode'],
    cwd: row.cwd ?? undefined,
    timeoutMs: row.timeoutMs ?? undefined,
    metadata: parseJson(row.metadata, undefined),
    policy: normalizeAutomationPolicy(
      {
        profileId: row.profileId,
        cwd: row.cwd ?? undefined,
        timeoutMs: row.timeoutMs ?? undefined
      },
      parseJson(row.policy, undefined)
    ),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapOrchestratorRun(row: typeof aiOrchestratorRuns.$inferSelect): AiOrchestratorRunRecord {
  return {
    id: row.id,
    automationId: row.automationId ?? undefined,
    sessionId: row.sessionId,
    objective: row.objective,
    profileId: row.profileId,
    runtimeProvider: row.runtimeProvider as AiOrchestratorRunRecord['runtimeProvider'],
    cwd: row.cwd,
    status: row.status as AiOrchestratorRunStatus,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
    usage: parseJson(row.usage, undefined),
    metadata: parseJson(row.metadata, undefined),
    parentRunId: row.parentRunId ?? undefined,
    delegationPlan: parseJson(row.delegationPlan, undefined),
    approvalReason: row.approvalReason ?? undefined,
    createdAt: row.createdAt,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    updatedAt: row.updatedAt
  }
}

function mapAutomationRun(row: typeof aiAutomationRuns.$inferSelect): AiAutomationRunRecord {
  return {
    id: row.id,
    automationId: row.automationId,
    orchestratorRunId: row.orchestratorRunId ?? undefined,
    triggerType: row.triggerType as AiAutomationRunRecord['triggerType'],
    status: row.status as AiOrchestratorRunStatus,
    approved: row.approved,
    missedCount: row.missedCount,
    payload: parseJson(row.payload, undefined),
    error: row.error ?? undefined,
    policyVersion: row.policyVersion,
    approvalReason: row.approvalReason ?? undefined,
    createdAt: row.createdAt,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    updatedAt: row.updatedAt
  }
}

export class AiOrchestratorStore {
  private readonly eventSeq = new Map<string, number>()

  async initialize(): Promise<void> {
    const db = databaseModule.getDb()
    const existing = await db
      .select({ id: aiAgentProfiles.id })
      .from(aiAgentProfiles)
      .where(eq(aiAgentProfiles.id, DEFAULT_PROFILE_ID))
      .limit(1)

    if (existing.length === 0) {
      const now = Date.now()
      await dbWriteScheduler.schedule(
        'ai-orchestrator.profile.default',
        async () => {
          await db.insert(aiAgentProfiles).values({
            id: DEFAULT_PROFILE_ID,
            name: 'Tuff Pi Coordinator',
            description: 'Host-managed Pi coordinator with explicit tool approval.',
            runtimeProvider: 'pi-core',
            enabled: true,
            systemPrompt:
              'You are Tuff Pi, the central coordinator. Use only host tools. Before creating child agents, submit one explicit dependency-aware plan through agent.delegate and wait for approval.',
            modelPreference: '[]',
            allowedToolIds: JSON.stringify([
              'file.read',
              'file.exists',
              'file.list',
              'file.info',
              'desktop.context.activeApp',
              'desktop.context.snapshot',
              'agent.delegate',
              'skill.read',
              'mcp.listTools',
              'mcp.call'
            ]),
            enabledSkillIds: '[]',
            permissionPolicy: JSON.stringify({ mode: 'manual', allowedPermissions: [] }),
            timeoutMs: DEFAULT_TIMEOUT_MS,
            createdAt: now,
            updatedAt: now
          })
        },
        { priority: 'critical' }
      )
    }

    const defaultProfile = await this.getProfile(DEFAULT_PROFILE_ID)
    if (defaultProfile) {
      const allowedToolIds = defaultProfile.allowedToolIds.filter(
        (toolId) => toolId !== 'cli.delegate'
      )
      const requiredToolIds = ['agent.delegate', 'skill.read', 'mcp.listTools', 'mcp.call']
      for (const toolId of requiredToolIds) {
        if (!allowedToolIds.includes(toolId)) allowedToolIds.push(toolId)
      }
      const changed =
        allowedToolIds.length !== defaultProfile.allowedToolIds.length ||
        requiredToolIds.some((toolId) => !defaultProfile.allowedToolIds.includes(toolId))
      if (changed) await this.saveProfile({ ...defaultProfile, allowedToolIds })
    }

    await this.markInterruptedRuns()
  }

  async listProfiles(): Promise<AiAgentProfile[]> {
    const rows = await databaseModule
      .getDb()
      .select()
      .from(aiAgentProfiles)
      .orderBy(desc(aiAgentProfiles.updatedAt))
    return rows.map(mapProfile)
  }

  async getProfile(profileId = DEFAULT_PROFILE_ID): Promise<AiAgentProfile | null> {
    const rows = await databaseModule
      .getDb()
      .select()
      .from(aiAgentProfiles)
      .where(eq(aiAgentProfiles.id, profileId))
      .limit(1)
    return rows[0] ? mapProfile(rows[0]) : null
  }

  async saveProfile(profile: AiAgentProfile): Promise<AiAgentProfile> {
    const now = Date.now()
    const normalized: AiAgentProfile = {
      ...profile,
      name: profile.name.trim(),
      description: profile.description.trim(),
      runtimeProvider: 'pi-core',
      timeoutMs: Math.max(1_000, profile.timeoutMs),
      createdAt: profile.createdAt || now,
      updatedAt: now
    }
    if (!normalized.id || !normalized.name) {
      throw new Error('Profile id and name are required')
    }

    await dbWriteScheduler.schedule('ai-orchestrator.profile.save', async () => {
      await databaseModule
        .getDb()
        .insert(aiAgentProfiles)
        .values({
          id: normalized.id,
          name: normalized.name,
          description: normalized.description,
          runtimeProvider: normalized.runtimeProvider,
          enabled: normalized.enabled,
          systemPrompt: normalized.systemPrompt ?? null,
          modelPreference: JSON.stringify(normalized.modelPreference),
          allowedToolIds: JSON.stringify(normalized.allowedToolIds),
          enabledSkillIds: JSON.stringify(normalized.enabledSkillIds),
          permissionPolicy: JSON.stringify(normalized.permissionPolicy),
          timeoutMs: normalized.timeoutMs,
          createdAt: normalized.createdAt,
          updatedAt: normalized.updatedAt
        })
        .onConflictDoUpdate({
          target: aiAgentProfiles.id,
          set: {
            name: normalized.name,
            description: normalized.description,
            runtimeProvider: normalized.runtimeProvider,
            enabled: normalized.enabled,
            systemPrompt: normalized.systemPrompt ?? null,
            modelPreference: JSON.stringify(normalized.modelPreference),
            allowedToolIds: JSON.stringify(normalized.allowedToolIds),
            enabledSkillIds: JSON.stringify(normalized.enabledSkillIds),
            permissionPolicy: JSON.stringify(normalized.permissionPolicy),
            timeoutMs: normalized.timeoutMs,
            updatedAt: normalized.updatedAt
          }
        })
    })
    return normalized
  }

  async saveImportScan(scan: AiImportScanResult): Promise<void> {
    await dbWriteScheduler.schedule('ai-orchestrator.import.scan', async () => {
      const db = databaseModule.getDb()
      await db.transaction(async (tx) => {
        await tx.insert(aiImportScans).values({
          id: scan.scanId,
          cwd: scan.cwd,
          sources: JSON.stringify(scan.sources),
          candidates: JSON.stringify(scan.candidates),
          createdAt: scan.scannedAt
        })
        if (scan.sources.length > 0) {
          await tx.insert(aiImportSources).values(
            scan.sources.map((source) => ({
              id: `${scan.scanId}:${source.id}`,
              scanId: scan.scanId,
              provider: source.provider,
              label: source.label,
              scope: source.scope,
              rootPath: source.rootPath,
              executablePath: source.executablePath ?? null,
              installed: source.installed,
              fingerprint: source.fingerprint,
              warnings: JSON.stringify(source.warnings),
              scannedAt: source.scannedAt
            }))
          )
        }
      })
    })
  }

  async getImportScan(scanId: string): Promise<AiImportScanResult | null> {
    const rows = await databaseModule
      .getDb()
      .select()
      .from(aiImportScans)
      .where(eq(aiImportScans.id, scanId))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      scanId: row.id,
      scannedAt: row.createdAt,
      cwd: row.cwd,
      sources: parseJson(row.sources, []),
      candidates: parseJson(row.candidates, [])
    }
  }

  async applyPreparedImportScan(
    scanId: string,
    preparedItems: AiPreparedImportItem[]
  ): Promise<AiImportApplyResult> {
    const scan = await this.getImportScan(scanId)
    if (!scan) throw new Error(`Import scan ${scanId} not found`)
    const candidateById = new Map(scan.candidates.map((candidate) => [candidate.id, candidate]))
    const selectedIds = new Set(preparedItems.map((item) => item.candidate.id))
    if (selectedIds.size !== preparedItems.length)
      throw new Error('Import selection contains duplicate candidates')
    for (const item of preparedItems) {
      const scanned = candidateById.get(item.candidate.id)
      if (!scanned || scanned.fingerprint !== item.candidate.fingerprint)
        throw new Error(`Import candidate ${item.candidate.id} is stale`)
    }

    const db = databaseModule.getDb()
    const revisionId = randomUUID()
    const now = Date.now()
    let changed: AiPreparedImportItem[] = []
    let unchanged: AiPreparedImportItem[] = []
    let currentByCandidate = new Map<string, typeof aiImportItems.$inferSelect>()
    let sourceMissingRows: Array<typeof aiImportItems.$inferSelect> = []

    await dbWriteScheduler.schedule(
      'ai-orchestrator.import.apply',
      async () => {
        let restoreSecretRefs: (() => Promise<void>) | undefined
        try {
          await db.transaction(async (tx) => {
            const currentRows = await tx
              .select()
              .from(aiImportItems)
              .where(eq(aiImportItems.current, true))
            currentByCandidate = new Map(currentRows.map((row) => [row.candidateId, row]))
            changed = preparedItems.filter((item) => {
              const current = currentByCandidate.get(item.candidate.id)
              const state = item.secrets.some((secret) => secret.reauthRequired)
                ? 'invalid'
                : 'active'
              return (
                !current ||
                current.fingerprint !== item.candidate.fingerprint ||
                current.targetScope !== item.targetScope ||
                current.workspaceRoot !== (item.workspaceRoot ?? null) ||
                current.alias !== (item.alias ?? null) ||
                current.contentRef !== item.contentRef ||
                current.projection !== serializeJson(item.projection) ||
                current.secrets !== JSON.stringify(item.secrets) ||
                current.state !== state
              )
            })
            unchanged = preparedItems.filter((item) => !changed.includes(item))
            const replacedRows = currentRows.filter(
              (row) =>
                selectedIds.has(row.candidateId) &&
                changed.some((item) => item.candidate.id === row.candidateId)
            )
            sourceMissingRows = currentRows.filter(
              (row) =>
                row.state !== 'source-missing' &&
                candidateById.get(row.candidateId)?.state === 'source-missing'
            )
            const supersededRows = [...replacedRows, ...sourceMissingRows]
            const replacedIds = new Set(supersededRows.map((row) => row.id))
            const aliases = new Map(
              currentRows
                .filter((row) => Boolean(row.alias))
                .map((row) => [
                  `${row.targetScope}:${row.workspaceRoot ?? ''}:${row.kind}:${row.alias}`,
                  row
                ])
            )
            const reservedAliases = new Map<string, string>()
            for (const item of preparedItems) {
              if (!item.alias) continue
              const key = `${item.targetScope}:${item.workspaceRoot ?? ''}:${item.candidate.kind}:${item.alias}`
              const reservedBy = reservedAliases.get(key)
              if (reservedBy && reservedBy !== item.candidate.id)
                throw new Error(`Import alias ${item.alias} is already assigned`)
              reservedAliases.set(key, item.candidate.id)
              const existing = aliases.get(key)
              if (
                existing &&
                existing.candidateId !== item.candidate.id &&
                !replacedIds.has(existing.id)
              )
                throw new Error(`Import alias ${item.alias} is already assigned`)
            }

            const retainedAuthRefs = new Set(
              [
                ...currentRows
                  .filter((row) => !replacedIds.has(row.id))
                  .flatMap((row) => parseJson<Array<{ authRef?: string }>>(row.secrets, [])),
                ...sourceMissingRows.flatMap((row) =>
                  parseJson<Array<{ authRef?: string }>>(row.secrets, [])
                ),
                ...changed.flatMap((item) => item.secrets)
              ]
                .map((secret) => secret.authRef)
                .filter((authRef): authRef is string => Boolean(authRef))
            )
            const authRefsToRemove = replacedRows
              .flatMap((row) => parseJson<Array<{ authRef?: string }>>(row.secrets, []))
              .map((secret) => secret.authRef)
              .filter(
                (authRef): authRef is string =>
                  typeof authRef === 'string' && !retainedAuthRefs.has(authRef)
              )
            restoreSecretRefs = await removeSecureStoreRefs(authRefsToRemove)

            await tx.insert(aiImportRevisions).values({
              id: revisionId,
              scanId,
              importedCount: changed.length,
              unchangedCount: unchanged.length,
              removedCount: sourceMissingRows.length,
              createdAt: now
            })
            if (supersededRows.length > 0) {
              await tx
                .update(aiImportItems)
                .set({ current: false, updatedAt: now })
                .where(
                  inArray(
                    aiImportItems.id,
                    supersededRows.map((row) => row.id)
                  )
                )
            }
            if (changed.length > 0) {
              await tx.insert(aiImportItems).values(
                changed.map((item) => {
                  const candidate = item.candidate
                  const current = currentByCandidate.get(candidate.id)
                  return {
                    id: `${candidate.id}:${revisionId}`,
                    candidateId: candidate.id,
                    sourceId: candidate.sourceId,
                    provider: candidate.provider,
                    scope: candidate.scope,
                    targetScope: item.targetScope,
                    workspaceRoot: item.workspaceRoot ?? null,
                    kind: candidate.kind,
                    name: candidate.name,
                    alias: item.alias ?? null,
                    sourceKey: candidate.sourceKey,
                    path: candidate.path,
                    fingerprint: candidate.fingerprint,
                    snapshot: JSON.stringify(candidate),
                    contentRef: item.contentRef,
                    projection: JSON.stringify(item.projection),
                    secrets: JSON.stringify(item.secrets),
                    state: item.secrets.some((secret) => secret.reauthRequired)
                      ? 'invalid'
                      : 'active',
                    revisionId,
                    current: true,
                    active: current?.active ?? true,
                    createdAt: now,
                    updatedAt: now
                  }
                })
              )
            }
            if (sourceMissingRows.length > 0) {
              await tx.insert(aiImportItems).values(
                sourceMissingRows.map((row) => {
                  const candidate = candidateById.get(row.candidateId)!
                  return {
                    id: `${row.candidateId}:${revisionId}`,
                    candidateId: row.candidateId,
                    sourceId: candidate.sourceId,
                    provider: candidate.provider,
                    scope: candidate.scope,
                    targetScope: row.targetScope,
                    workspaceRoot: row.workspaceRoot,
                    kind: candidate.kind,
                    name: candidate.name,
                    alias: row.alias,
                    sourceKey: candidate.sourceKey,
                    path: candidate.path,
                    fingerprint: candidate.fingerprint,
                    snapshot: JSON.stringify(candidate),
                    contentRef: row.contentRef,
                    projection: row.projection,
                    secrets: row.secrets,
                    state: 'source-missing' as const,
                    revisionId,
                    current: true,
                    active: row.active,
                    createdAt: now,
                    updatedAt: now
                  }
                })
              )
            }
            for (const item of changed) {
              if (item.candidate.kind !== 'agent') continue
              const profileId =
                typeof item.projection.profileId === 'string' ? item.projection.profileId : null
              if (!profileId) continue
              await tx
                .insert(aiAgentProfiles)
                .values({
                  id: profileId,
                  name: item.alias || item.candidate.name,
                  description:
                    typeof item.projection.description === 'string'
                      ? item.projection.description
                      : '',
                  runtimeProvider: 'pi-core',
                  enabled: currentByCandidate.get(item.candidate.id)?.active ?? true,
                  systemPrompt:
                    typeof item.projection.instructions === 'string'
                      ? item.projection.instructions
                      : null,
                  modelPreference: '[]',
                  allowedToolIds: '[]',
                  enabledSkillIds: '[]',
                  permissionPolicy: JSON.stringify({ mode: 'manual', allowedPermissions: [] }),
                  timeoutMs: DEFAULT_TIMEOUT_MS,
                  createdAt: now,
                  updatedAt: now
                })
                .onConflictDoUpdate({
                  target: aiAgentProfiles.id,
                  set: {
                    name: item.alias || item.candidate.name,
                    description:
                      typeof item.projection.description === 'string'
                        ? item.projection.description
                        : '',
                    systemPrompt:
                      typeof item.projection.instructions === 'string'
                        ? item.projection.instructions
                        : null,
                    updatedAt: now
                  }
                })
            }
          })
        } catch (error) {
          if (restoreSecretRefs) await restoreSecretRefs()
          throw error
        }
      },
      { priority: 'interactive' }
    )

    return {
      revisionId,
      imported: changed.length,
      unchanged: unchanged.length,
      removed: sourceMissingRows.length,
      items: [
        ...changed.map((item) => ({
          candidateId: item.candidate.id,
          status: item.secrets.some((secret) => secret.reauthRequired)
            ? ('reauth-required' as const)
            : ('imported' as const),
          itemId: `${item.candidate.id}:${revisionId}`
        })),
        ...unchanged.map((item) => ({
          candidateId: item.candidate.id,
          status: 'unchanged' as const,
          itemId: currentByCandidate.get(item.candidate.id)?.id
        }))
      ]
    }
  }

  async listImportedItems(includeSuperseded = false): Promise<AiImportedConfigItem[]> {
    const query = databaseModule.getDb().select().from(aiImportItems)
    const rows = includeSuperseded
      ? await query.orderBy(desc(aiImportItems.updatedAt))
      : await query.where(eq(aiImportItems.current, true)).orderBy(desc(aiImportItems.updatedAt))
    return rows.map(mapImportedItem)
  }

  async getImportedItem(itemId: string): Promise<AiImportedConfigItem | null> {
    const rows = await databaseModule
      .getDb()
      .select()
      .from(aiImportItems)
      .where(and(eq(aiImportItems.id, itemId), eq(aiImportItems.current, true)))
      .limit(1)
    return rows[0] ? mapImportedItem(rows[0]) : null
  }

  async setImportedItemActive(itemId: string, active: boolean): Promise<AiImportedConfigItem> {
    await dbWriteScheduler.schedule('ai-import.item.toggle', async () => {
      await databaseModule
        .getDb()
        .update(aiImportItems)
        .set({ active, updatedAt: Date.now() })
        .where(and(eq(aiImportItems.id, itemId), eq(aiImportItems.current, true)))
    })
    const item = await this.getImportedItem(itemId)
    if (!item) throw new Error(`Imported item ${itemId} not found`)
    return item
  }

  async cloneImportedItem(itemId: string, alias?: string): Promise<AiImportedConfigItem> {
    const db = databaseModule.getDb()
    const rows = await db
      .select()
      .from(aiImportItems)
      .where(and(eq(aiImportItems.id, itemId), eq(aiImportItems.current, true)))
      .limit(1)
    const source = rows[0]
    if (!source) throw new Error(`Imported item ${itemId} not found`)
    const now = Date.now()
    const localSuffix = randomUUID()
    const cloneId = `local:${localSuffix}`
    const sourceProjection = parseJson<Record<string, unknown>>(source.projection, {})
    const sourceProfileId =
      typeof sourceProjection.profileId === 'string' ? sourceProjection.profileId : undefined
    const cloneProfileId =
      source.kind === 'agent' && sourceProfileId ? `import.local.${localSuffix}` : undefined
    const sourceAgentProfile = sourceProfileId ? await this.getProfile(sourceProfileId) : null
    const sourceMcpProfiles = Array.isArray(sourceProjection.mcpProfiles)
      ? sourceProjection.mcpProfiles
      : []
    const localMcpProfiles = sourceMcpProfiles.map((profile, index) => {
      if (!profile || typeof profile !== 'object') return profile
      return {
        ...(profile as Record<string, unknown>),
        id: `import.local.${localSuffix}.${index}`
      }
    })
    const projection = {
      ...sourceProjection,
      ...(cloneProfileId ? { profileId: cloneProfileId } : {}),
      ...(sourceMcpProfiles.length > 0 ? { mcpProfiles: localMcpProfiles } : {}),
      localCopyOf: source.id
    }
    const requestedAlias = alias?.trim()
    const baseAlias = requestedAlias || `${source.alias || source.name} (Local)`
    let cloneAlias = ''
    await dbWriteScheduler.schedule('ai-import.item.clone', async () => {
      await db.transaction(async (tx) => {
        const currentSource = await tx
          .select({ id: aiImportItems.id })
          .from(aiImportItems)
          .where(and(eq(aiImportItems.id, itemId), eq(aiImportItems.current, true)))
          .limit(1)
        if (!currentSource[0]) throw new Error(`Imported item ${itemId} is no longer current`)
        const existingAliases = new Set(
          (await tx.select().from(aiImportItems).where(eq(aiImportItems.current, true)))
            .filter(
              (item) =>
                item.targetScope === source.targetScope &&
                (item.workspaceRoot ?? '') === (source.workspaceRoot ?? '') &&
                item.kind === source.kind
            )
            .map((item) => item.alias)
            .filter((value): value is string => Boolean(value))
        )
        if (requestedAlias && existingAliases.has(requestedAlias))
          throw new Error(`Import alias ${requestedAlias} is already assigned`)
        cloneAlias = baseAlias
        for (let suffix = 2; existingAliases.has(cloneAlias); suffix += 1)
          cloneAlias = `${baseAlias} ${suffix}`
        await tx.insert(aiImportItems).values({
          id: cloneId,
          candidateId: cloneId,
          sourceId: `${source.sourceId}:local`,
          provider: source.provider,
          scope: source.scope,
          targetScope: source.targetScope,
          workspaceRoot: source.workspaceRoot,
          kind: source.kind,
          name: source.name,
          alias: cloneAlias,
          sourceKey: cloneId,
          path: source.path,
          fingerprint: source.fingerprint,
          snapshot: JSON.stringify({ localCopyOf: source.id }),
          contentRef: source.contentRef,
          projection: JSON.stringify(projection),
          secrets: source.secrets,
          state: source.state,
          revisionId: source.revisionId,
          current: true,
          active: true,
          createdAt: now,
          updatedAt: now
        })
        if (cloneProfileId && sourceAgentProfile) {
          await tx.insert(aiAgentProfiles).values({
            id: cloneProfileId,
            name: cloneAlias,
            description: sourceAgentProfile.description,
            runtimeProvider: 'pi-core',
            enabled: true,
            systemPrompt: sourceAgentProfile.systemPrompt ?? null,
            modelPreference: JSON.stringify(sourceAgentProfile.modelPreference),
            allowedToolIds: JSON.stringify(sourceAgentProfile.allowedToolIds),
            enabledSkillIds: JSON.stringify(sourceAgentProfile.enabledSkillIds),
            permissionPolicy: JSON.stringify(sourceAgentProfile.permissionPolicy),
            timeoutMs: sourceAgentProfile.timeoutMs,
            createdAt: now,
            updatedAt: now
          })
        }
      })
    })
    return (await this.getImportedItem(cloneId))!
  }

  async deleteImportedItem(itemId: string): Promise<boolean> {
    const db = databaseModule.getDb()
    let deleted = false
    await dbWriteScheduler.schedule('ai-import.item.delete', async () => {
      let restoreSecretRefs: (() => Promise<void>) | undefined
      try {
        await db.transaction(async (tx) => {
          const rows = await tx.select().from(aiImportItems).where(eq(aiImportItems.current, true))
          const existing = rows.find((row) => row.id === itemId)
          if (!existing) return
          const remainingAuthRefs = new Set(
            rows
              .filter((row) => row.id !== itemId)
              .flatMap((row) => parseJson<Array<{ authRef?: string }>>(row.secrets, []))
              .map((secret) => secret.authRef)
              .filter((authRef): authRef is string => Boolean(authRef))
          )
          const authRefsToRemove = parseJson<Array<{ authRef?: string }>>(existing.secrets, [])
            .map((secret) => secret.authRef)
            .filter(
              (authRef): authRef is string =>
                typeof authRef === 'string' && !remainingAuthRefs.has(authRef)
            )
          restoreSecretRefs = await removeSecureStoreRefs(authRefsToRemove)
          await tx
            .delete(aiImportItems)
            .where(and(eq(aiImportItems.id, itemId), eq(aiImportItems.current, true)))
          deleted = true
        })
      } catch (error) {
        if (restoreSecretRefs) await restoreSecretRefs()
        throw error
      }
    })
    return deleted
  }

  async listActiveImportCandidates(sourceIds: string[]): Promise<AiImportCandidate[]> {
    if (sourceIds.length === 0) return []
    const rows = await databaseModule
      .getDb()
      .select({ snapshot: aiImportItems.snapshot, state: aiImportItems.state })
      .from(aiImportItems)
      .where(
        and(
          inArray(aiImportItems.sourceId, sourceIds),
          eq(aiImportItems.current, true),
          eq(aiImportItems.active, true)
        )
      )
    return rows.map((row) => ({
      ...parseJson<AiImportCandidate>(row.snapshot, {} as AiImportCandidate),
      ...(row.state === 'invalid' ? { state: 'invalid' as const } : {})
    }))
  }

  async createOrchestratorRun(run: AiOrchestratorRunRecord): Promise<void> {
    await dbWriteScheduler.schedule(
      'ai-orchestrator.run.create',
      async () => {
        await databaseModule
          .getDb()
          .insert(aiOrchestratorRuns)
          .values({
            id: run.id,
            automationId: run.automationId ?? null,
            sessionId: run.sessionId,
            objective: run.objective,
            profileId: run.profileId,
            runtimeProvider: run.runtimeProvider,
            cwd: run.cwd,
            status: run.status,
            output: run.output ?? null,
            error: run.error ?? null,
            usage: serializeJson(run.usage),
            metadata: serializeJson(run.metadata),
            parentRunId: run.parentRunId ?? null,
            delegationPlan: serializeJson(run.delegationPlan),
            approvalReason: run.approvalReason ?? null,
            createdAt: run.createdAt,
            startedAt: run.startedAt ?? null,
            completedAt: run.completedAt ?? null,
            updatedAt: run.updatedAt
          })
      },
      { priority: 'interactive' }
    )
    this.eventSeq.set(run.id, 0)
  }

  async updateOrchestratorRun(
    runId: string,
    patch: Partial<Omit<AiOrchestratorRunRecord, 'id' | 'createdAt'>>
  ): Promise<void> {
    const now = Date.now()
    await dbWriteScheduler.schedule(
      'ai-orchestrator.run.update',
      async () => {
        await databaseModule
          .getDb()
          .update(aiOrchestratorRuns)
          .set({
            ...(patch.automationId !== undefined ? { automationId: patch.automationId } : {}),
            ...(patch.sessionId !== undefined ? { sessionId: patch.sessionId } : {}),
            ...(patch.objective !== undefined ? { objective: patch.objective } : {}),
            ...(patch.profileId !== undefined ? { profileId: patch.profileId } : {}),
            ...(patch.runtimeProvider !== undefined
              ? { runtimeProvider: patch.runtimeProvider }
              : {}),
            ...(patch.cwd !== undefined ? { cwd: patch.cwd } : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.output !== undefined ? { output: patch.output } : {}),
            ...(patch.error !== undefined ? { error: patch.error } : {}),
            ...(patch.usage !== undefined ? { usage: JSON.stringify(patch.usage) } : {}),
            ...(patch.metadata !== undefined ? { metadata: JSON.stringify(patch.metadata) } : {}),
            ...(patch.parentRunId !== undefined ? { parentRunId: patch.parentRunId } : {}),
            ...(patch.delegationPlan !== undefined
              ? { delegationPlan: JSON.stringify(patch.delegationPlan) }
              : {}),
            ...(patch.approvalReason !== undefined ? { approvalReason: patch.approvalReason } : {}),
            ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
            ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
            updatedAt: now
          })
          .where(eq(aiOrchestratorRuns.id, runId))
      },
      { priority: 'interactive' }
    )
  }

  async appendOrchestratorEvent(
    runId: string,
    type: string,
    payload?: Record<string, unknown>,
    level: AiOrchestratorEvent['level'] = 'info'
  ): Promise<AiOrchestratorEvent> {
    let event: AiOrchestratorEvent | undefined
    await dbWriteScheduler.schedule('ai-orchestrator.event.append', async () => {
      let previousSeq = this.eventSeq.get(runId)
      if (previousSeq === undefined) {
        const rows = await databaseModule
          .getDb()
          .select({ seq: aiOrchestratorEvents.seq })
          .from(aiOrchestratorEvents)
          .where(eq(aiOrchestratorEvents.runId, runId))
          .orderBy(desc(aiOrchestratorEvents.seq))
          .limit(1)
        previousSeq = rows[0]?.seq ?? 0
      }
      const seq = previousSeq + 1
      this.eventSeq.set(runId, seq)
      event = {
        id: randomUUID(),
        runId,
        seq,
        type,
        level,
        payload,
        createdAt: Date.now()
      }
      await databaseModule
        .getDb()
        .insert(aiOrchestratorEvents)
        .values({
          ...event,
          payload: serializeJson(event.payload)
        })
      if (['run.completed', 'run.failed', 'run.cancelled', 'run.interrupted'].includes(type))
        this.eventSeq.delete(runId)
    })
    return event!
  }

  async listOrchestratorRuns(
    options: AiOrchestratorRunListRequest = {}
  ): Promise<AiOrchestratorRunRecord[]> {
    const db = databaseModule.getDb()
    const query = db.select().from(aiOrchestratorRuns)
    const rows = options.status
      ? await query
          .where(eq(aiOrchestratorRuns.status, options.status))
          .orderBy(desc(aiOrchestratorRuns.createdAt))
          .limit(normalizeLimit(options.limit))
      : await query.orderBy(desc(aiOrchestratorRuns.createdAt)).limit(normalizeLimit(options.limit))
    return rows.map(mapOrchestratorRun)
  }

  async listSessionHistory(
    sessionId: string,
    excludeRunId?: string,
    limit = 50
  ): Promise<AiSessionHistoryMessage[]> {
    const rows = await databaseModule
      .getDb()
      .select()
      .from(aiOrchestratorRuns)
      .where(eq(aiOrchestratorRuns.sessionId, sessionId))
      .orderBy(asc(aiOrchestratorRuns.createdAt))
      .limit(100)
    const messages: AiSessionHistoryMessage[] = []
    for (const row of rows) {
      if (row.id === excludeRunId || row.status !== 'completed' || !row.output) continue
      messages.push(
        { role: 'user', text: row.objective, createdAt: row.createdAt },
        {
          role: 'assistant',
          text: row.output,
          createdAt: row.completedAt ?? row.updatedAt
        }
      )
    }
    return messages.slice(-normalizeLimit(limit))
  }

  async getOrchestratorRun(runId: string): Promise<AiOrchestratorRunRecord | null> {
    const rows = await databaseModule
      .getDb()
      .select()
      .from(aiOrchestratorRuns)
      .where(eq(aiOrchestratorRuns.id, runId))
      .limit(1)
    return rows[0] ? mapOrchestratorRun(rows[0]) : null
  }

  async saveAutomation(definition: AiAutomationDefinition): Promise<AiAutomationDefinition> {
    const now = Date.now()
    const normalized: AiAutomationDefinition = {
      ...definition,
      name: definition.name.trim(),
      objective: definition.objective.trim(),
      description: definition.description.trim(),
      policy: normalizeAutomationPolicy(definition, definition.policy),
      createdAt: definition.createdAt || now,
      updatedAt: now
    }
    if (!normalized.id || !normalized.name || !normalized.objective) {
      throw new Error('Automation id, name, and objective are required')
    }

    await dbWriteScheduler.schedule('ai-orchestrator.automation.save', async () => {
      await databaseModule
        .getDb()
        .insert(aiAutomations)
        .values({
          id: normalized.id,
          name: normalized.name,
          description: normalized.description,
          enabled: normalized.enabled,
          objective: normalized.objective,
          input: serializeJson(normalized.input),
          profileId: normalized.profileId,
          trigger: JSON.stringify(normalized.trigger),
          approvalMode: normalized.approvalMode,
          cwd: normalized.cwd ?? null,
          timeoutMs: normalized.timeoutMs ?? null,
          metadata: serializeJson(normalized.metadata),
          policy: JSON.stringify(normalized.policy),
          createdAt: normalized.createdAt,
          updatedAt: normalized.updatedAt
        })
        .onConflictDoUpdate({
          target: aiAutomations.id,
          set: {
            name: normalized.name,
            description: normalized.description,
            enabled: normalized.enabled,
            objective: normalized.objective,
            input: serializeJson(normalized.input),
            profileId: normalized.profileId,
            trigger: JSON.stringify(normalized.trigger),
            approvalMode: normalized.approvalMode,
            cwd: normalized.cwd ?? null,
            timeoutMs: normalized.timeoutMs ?? null,
            metadata: serializeJson(normalized.metadata),
            policy: JSON.stringify(normalized.policy),
            updatedAt: normalized.updatedAt
          }
        })
    })
    return normalized
  }

  async listAutomations(): Promise<AiAutomationDefinition[]> {
    const rows = await databaseModule
      .getDb()
      .select()
      .from(aiAutomations)
      .orderBy(desc(aiAutomations.updatedAt))
    return rows.map(mapAutomation)
  }

  async getAutomation(automationId: string): Promise<AiAutomationDefinition | null> {
    const rows = await databaseModule
      .getDb()
      .select()
      .from(aiAutomations)
      .where(eq(aiAutomations.id, automationId))
      .limit(1)
    return rows[0] ? mapAutomation(rows[0]) : null
  }

  async deleteAutomation(automationId: string): Promise<boolean> {
    const rows = await databaseModule
      .getDb()
      .select({ id: aiAutomations.id })
      .from(aiAutomations)
      .where(eq(aiAutomations.id, automationId))
      .limit(1)
    if (rows.length === 0) return false
    await dbWriteScheduler.schedule('ai-orchestrator.automation.delete', async () => {
      await databaseModule.getDb().delete(aiAutomations).where(eq(aiAutomations.id, automationId))
    })
    return true
  }

  async createAutomationRun(run: AiAutomationRunRecord): Promise<void> {
    await dbWriteScheduler.schedule('ai-orchestrator.automation-run.create', async () => {
      await databaseModule
        .getDb()
        .insert(aiAutomationRuns)
        .values({
          id: run.id,
          automationId: run.automationId,
          orchestratorRunId: run.orchestratorRunId ?? null,
          triggerType: run.triggerType,
          status: run.status,
          approved: run.approved,
          missedCount: run.missedCount,
          payload: serializeJson(run.payload),
          error: run.error ?? null,
          policyVersion: run.policyVersion,
          approvalReason: run.approvalReason ?? null,
          createdAt: run.createdAt,
          startedAt: run.startedAt ?? null,
          completedAt: run.completedAt ?? null,
          updatedAt: run.updatedAt
        })
    })
  }

  async updateAutomationRun(
    runId: string,
    patch: Partial<Omit<AiAutomationRunRecord, 'id' | 'automationId' | 'createdAt'>>
  ): Promise<void> {
    const now = Date.now()
    await dbWriteScheduler.schedule('ai-orchestrator.automation-run.update', async () => {
      await databaseModule
        .getDb()
        .update(aiAutomationRuns)
        .set({
          ...(patch.orchestratorRunId !== undefined
            ? { orchestratorRunId: patch.orchestratorRunId }
            : {}),
          ...(patch.triggerType !== undefined ? { triggerType: patch.triggerType } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.approved !== undefined ? { approved: patch.approved } : {}),
          ...(patch.missedCount !== undefined ? { missedCount: patch.missedCount } : {}),
          ...(patch.payload !== undefined ? { payload: JSON.stringify(patch.payload) } : {}),
          ...(patch.error !== undefined ? { error: patch.error } : {}),
          ...(patch.policyVersion !== undefined ? { policyVersion: patch.policyVersion } : {}),
          ...(patch.approvalReason !== undefined ? { approvalReason: patch.approvalReason } : {}),
          ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
          ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
          updatedAt: now
        })
        .where(eq(aiAutomationRuns.id, runId))
    })
  }

  async getAutomationRun(runId: string): Promise<AiAutomationRunRecord | null> {
    const rows = await databaseModule
      .getDb()
      .select()
      .from(aiAutomationRuns)
      .where(eq(aiAutomationRuns.id, runId))
      .limit(1)
    return rows[0] ? mapAutomationRun(rows[0]) : null
  }

  async countAutomationRunsSince(automationId: string, since: number): Promise<number> {
    const rows = await databaseModule
      .getDb()
      .select({ id: aiAutomationRuns.id })
      .from(aiAutomationRuns)
      .where(
        and(eq(aiAutomationRuns.automationId, automationId), gte(aiAutomationRuns.createdAt, since))
      )
    return rows.length
  }

  async listRecoverableAutomationRuns(): Promise<AiAutomationRunRecord[]> {
    const rows = await databaseModule
      .getDb()
      .select()
      .from(aiAutomationRuns)
      .where(
        or(
          eq(aiAutomationRuns.status, 'queued'),
          eq(aiAutomationRuns.status, 'running'),
          eq(aiAutomationRuns.status, 'interrupted')
        )
      )
      .orderBy(aiAutomationRuns.createdAt)
    return rows.map(mapAutomationRun)
  }

  private async markInterruptedRuns(): Promise<void> {
    const now = Date.now()
    await dbWriteScheduler.schedule(
      'ai-orchestrator.recovery.mark-interrupted',
      async () => {
        const db = databaseModule.getDb()
        await db
          .update(aiOrchestratorRuns)
          .set({ status: 'interrupted', error: 'Host restarted during execution', updatedAt: now })
          .where(
            or(eq(aiOrchestratorRuns.status, 'queued'), eq(aiOrchestratorRuns.status, 'running'))
          )
        await db
          .update(aiAutomationRuns)
          .set({ status: 'interrupted', error: 'Host restarted during execution', updatedAt: now })
          .where(or(eq(aiAutomationRuns.status, 'queued'), eq(aiAutomationRuns.status, 'running')))
      },
      { priority: 'critical' }
    )
  }
}

export const aiOrchestratorStore = new AiOrchestratorStore()
export { DEFAULT_PROFILE_ID }
