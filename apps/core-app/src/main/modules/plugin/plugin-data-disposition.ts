import type {
  PluginApiUninstallRequest,
  PluginApiUninstallResponse,
  PluginUninstallResultCode,
  PluginUninstallStage,
  PluginUninstallStageCode,
  PluginUninstallStageResult
} from '@talex-touch/utils/transport/events/types'
import { PLUGIN_UNINSTALL_STAGES } from '@talex-touch/utils/transport/events/types'

export interface PluginDataDispositionOwner {
  readonly pluginName: string
  readonly folderName: string
  readonly pluginInstanceId: string
  readonly activationGeneration: number
  readonly codePath?: string
  readonly dataPath?: string
  readonly tempPath?: string
  readonly cachePath?: string
}

export interface PluginDataDispositionResiduals {
  readonly runtime?: boolean
  readonly sqliteOwner: boolean
  readonly sqliteFile: boolean
  readonly permissions?: boolean
  readonly pendingAuthority?: boolean
  readonly secrets: boolean
  readonly temp: boolean
  readonly cache: boolean
  readonly data: boolean
  readonly pluginData: boolean
  readonly code: boolean
}

export type PluginDataDispositionStepOutcome = 'completed' | 'cancelled' | 'no-data' | 'residual'

export interface PluginDataDispositionDependencies {
  resolveCurrentOwner: (pluginName: string) => PluginDataDispositionOwner | null
  canStart?: (owner: PluginDataDispositionOwner) => boolean
  closeAdmission: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
  closeRuntime: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
  closeSqlite: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
  closeLogger: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
  exportOrdinary: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
  backupPortableSecrets: (
    owner: PluginDataDispositionOwner,
    password: string
  ) => Promise<PluginDataDispositionStepOutcome>
  verifySqliteClosed: (
    owner: PluginDataDispositionOwner
  ) => Promise<PluginDataDispositionStepOutcome>
  revokePermissions?: (
    owner: PluginDataDispositionOwner
  ) => Promise<PluginDataDispositionStepOutcome>
  invalidateAuthority?: (
    owner: PluginDataDispositionOwner
  ) => Promise<PluginDataDispositionStepOutcome>
  purgeSecrets: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
  deleteTemp: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
  deleteCache: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
  deleteData: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
  deletePluginData: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
  deleteCode: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
  inspectResiduals: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionResiduals>
  finalize: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
  reportUninstall: (owner: PluginDataDispositionOwner) => Promise<PluginDataDispositionStepOutcome>
}

interface DispositionOperationState {
  readonly owner: PluginDataDispositionOwner
  readonly disposition: {
    readonly ordinaryExportEnabled: boolean
    readonly portableSecretBackupEnabled: boolean
  }
  readonly completedStages: Set<PluginUninstallStage>
  readonly stageResults: Map<PluginUninstallStage, PluginUninstallStageResult>
  running: boolean
  completed: boolean
  completedResponse?: PluginApiUninstallResponse
}

export interface PluginDataDispositionCoordinator {
  uninstall: (request: PluginApiUninstallRequest) => Promise<PluginApiUninstallResponse>
  isBlocked: (pluginName: string) => boolean
  hasBlockedOperations: () => boolean
}

const COMPLETED_STAGE_CODES: Record<PluginUninstallStage, PluginUninstallStageCode> = {
  admission: 'PLUGIN_UNINSTALL_ADMISSION_CLOSED',
  runtime: 'PLUGIN_UNINSTALL_RUNTIME_CLOSED',
  'ordinary-export': 'PLUGIN_UNINSTALL_ORDINARY_EXPORT_COMPLETED',
  'secret-backup': 'PLUGIN_UNINSTALL_SECRET_BACKUP_COMPLETED',
  logger: 'PLUGIN_UNINSTALL_LOGGER_CLOSED',
  sqlite: 'PLUGIN_UNINSTALL_SQLITE_CLOSED',
  permissions: 'PLUGIN_UNINSTALL_PERMISSIONS_REVOKED',
  authority: 'PLUGIN_UNINSTALL_AUTHORITY_INVALIDATED',
  secrets: 'PLUGIN_UNINSTALL_SECRETS_PURGED',
  temp: 'PLUGIN_UNINSTALL_TEMP_DELETED',
  cache: 'PLUGIN_UNINSTALL_CACHE_DELETED',
  data: 'PLUGIN_UNINSTALL_DATA_DELETED',
  'plugin-data': 'PLUGIN_UNINSTALL_PLUGIN_DATA_DELETED',
  code: 'PLUGIN_UNINSTALL_CODE_DELETED',
  verification: 'PLUGIN_UNINSTALL_VERIFIED',
  finalize: 'PLUGIN_UNINSTALL_FINALIZED'
}

const FAILED_STAGE_CODES: Record<PluginUninstallStage, PluginUninstallStageCode> = {
  admission: 'PLUGIN_UNINSTALL_RUNTIME_TEARDOWN_FAILED',
  runtime: 'PLUGIN_UNINSTALL_RUNTIME_TEARDOWN_FAILED',
  'ordinary-export': 'PLUGIN_UNINSTALL_ORDINARY_EXPORT_FAILED',
  'secret-backup': 'PLUGIN_UNINSTALL_SECRET_BACKUP_FAILED',
  logger: 'PLUGIN_UNINSTALL_LOGGER_CLOSE_FAILED',
  sqlite: 'PLUGIN_UNINSTALL_SQLITE_CLOSE_FAILED',
  permissions: 'PLUGIN_UNINSTALL_PERMISSION_REVOKE_FAILED',
  authority: 'PLUGIN_UNINSTALL_AUTHORITY_INVALIDATION_FAILED',
  secrets: 'PLUGIN_UNINSTALL_SECRET_PURGE_FAILED',
  temp: 'PLUGIN_UNINSTALL_TEMP_DELETE_FAILED',
  cache: 'PLUGIN_UNINSTALL_CACHE_DELETE_FAILED',
  data: 'PLUGIN_UNINSTALL_DATA_DELETE_FAILED',
  'plugin-data': 'PLUGIN_UNINSTALL_PLUGIN_DATA_DELETE_FAILED',
  code: 'PLUGIN_UNINSTALL_CODE_DELETE_FAILED',
  verification: 'PLUGIN_UNINSTALL_RESIDUALS_FOUND',
  finalize: 'PLUGIN_UNINSTALL_FINALIZE_FAILED'
}

const CLEANUP_STAGES = [
  'secrets',
  'data',
  'cache',
  'plugin-data'
] as const satisfies readonly PluginUninstallStage[]

function ownerMatches(
  owner: PluginDataDispositionOwner,
  request: PluginApiUninstallRequest
): boolean {
  return (
    owner.pluginName === request.plugin.name &&
    owner.pluginInstanceId === request.plugin.pluginInstanceId &&
    owner.activationGeneration === request.plugin.activationGeneration
  )
}

function dispositionMatches(
  state: DispositionOperationState,
  request: PluginApiUninstallRequest
): boolean {
  return (
    state.disposition.ordinaryExportEnabled === request.disposition.ordinaryExport.enabled &&
    state.disposition.portableSecretBackupEnabled ===
      request.disposition.portableSecretBackup.enabled
  )
}

function stageResult(
  stage: PluginUninstallStage,
  status: PluginUninstallStageResult['status'],
  code: PluginUninstallStageCode,
  retryable: boolean
): PluginUninstallStageResult {
  return Object.freeze({ stage, status, code, retryable })
}

function orderedStageResults(
  stageResults: ReadonlyMap<PluginUninstallStage, PluginUninstallStageResult>
): readonly PluginUninstallStageResult[] {
  const order = PLUGIN_UNINSTALL_STAGES
  return Object.freeze(
    order.flatMap((stage) => {
      const result = stageResults.get(stage)
      return result ? [result] : []
    })
  )
}

function response(
  success: boolean,
  status: PluginApiUninstallResponse['status'],
  code: PluginUninstallResultCode,
  retryable: boolean,
  installed: boolean,
  stages: readonly PluginUninstallStageResult[]
): PluginApiUninstallResponse {
  return Object.freeze({
    version: 1,
    success,
    status,
    code,
    retryable,
    installed,
    stages: Object.freeze([...stages])
  })
}

function failedResponse(
  state: DispositionOperationState,
  code: PluginUninstallResultCode,
  status: 'failed' | 'cancelled' = 'failed'
): PluginApiUninstallResponse {
  return response(false, status, code, true, true, orderedStageResults(state.stageResults))
}

function hasResiduals(residuals: PluginDataDispositionResiduals): boolean {
  return Object.values(residuals).some(Boolean)
}

export function createPluginDataDispositionCoordinator(
  dependencies: PluginDataDispositionDependencies
): PluginDataDispositionCoordinator {
  const operations = new Map<string, DispositionOperationState>()

  function pruneCompletedOperations(): void {
    if (operations.size < 256) return
    for (const [pluginName, state] of operations) {
      if (!state.completed || state.running) continue
      operations.delete(pluginName)
      if (operations.size < 256) return
    }
  }

  function setStage(
    state: DispositionOperationState,
    stage: PluginUninstallStage,
    status: PluginUninstallStageResult['status'],
    code: PluginUninstallStageCode,
    retryable: boolean
  ): void {
    state.stageResults.set(stage, stageResult(stage, status, code, retryable))
  }

  async function runStage(
    state: DispositionOperationState,
    stage: PluginUninstallStage,
    operation: () => Promise<PluginDataDispositionStepOutcome>
  ): Promise<'completed' | 'failed' | 'cancelled' | 'no-data' | 'residual'> {
    if (state.completedStages.has(stage)) return 'completed'
    try {
      const outcome = await operation()
      if (outcome === 'cancelled') {
        const code =
          stage === 'ordinary-export'
            ? 'PLUGIN_UNINSTALL_ORDINARY_EXPORT_CANCELLED'
            : 'PLUGIN_UNINSTALL_SECRET_BACKUP_CANCELLED'
        setStage(state, stage, 'cancelled', code, true)
        return 'cancelled'
      }
      if (outcome === 'no-data') {
        setStage(state, stage, 'skipped', 'PLUGIN_UNINSTALL_SECRET_BACKUP_NO_DATA', false)
        state.completedStages.add(stage)
        return 'no-data'
      }
      if (outcome === 'residual') {
        setStage(state, stage, 'failed', 'PLUGIN_UNINSTALL_SQLITE_RESIDUAL', true)
        return 'residual'
      }
      setStage(state, stage, 'completed', COMPLETED_STAGE_CODES[stage], false)
      state.completedStages.add(stage)
      return 'completed'
    } catch {
      setStage(state, stage, 'failed', FAILED_STAGE_CODES[stage], true)
      return 'failed'
    }
  }

  async function execute(
    state: DispositionOperationState,
    request: PluginApiUninstallRequest
  ): Promise<PluginApiUninstallResponse> {
    const owner = state.owner
    const admission = await runStage(state, 'admission', () => dependencies.closeAdmission(owner))
    if (admission !== 'completed') {
      return failedResponse(state, 'PLUGIN_UNINSTALL_TEARDOWN_FAILED')
    }

    const teardownResults: Array<'completed' | 'failed' | 'cancelled' | 'no-data' | 'residual'> = []
    teardownResults.push(await runStage(state, 'runtime', () => dependencies.closeRuntime(owner)))
    teardownResults.push(await runStage(state, 'logger', () => dependencies.closeLogger(owner)))
    teardownResults.push(await runStage(state, 'temp', () => dependencies.deleteTemp(owner)))
    teardownResults.push(
      await runStage(state, 'sqlite', async () => {
        const closed = await dependencies.closeSqlite(owner)
        if (closed !== 'completed') return closed
        return dependencies.verifySqliteClosed(owner)
      })
    )
    if (teardownResults.some((result) => result !== 'completed')) {
      return failedResponse(state, 'PLUGIN_UNINSTALL_TEARDOWN_FAILED')
    }

    const exportResults: Array<'completed' | 'failed' | 'cancelled' | 'no-data' | 'residual'> = []
    if (request.disposition.ordinaryExport.enabled) {
      exportResults.push(
        await runStage(state, 'ordinary-export', () => dependencies.exportOrdinary(owner))
      )
    } else if (!state.completedStages.has('ordinary-export')) {
      setStage(
        state,
        'ordinary-export',
        'skipped',
        'PLUGIN_UNINSTALL_ORDINARY_EXPORT_SKIPPED',
        false
      )
      state.completedStages.add('ordinary-export')
    }

    if (!exportResults.includes('cancelled')) {
      if (request.disposition.portableSecretBackup.enabled) {
        const password = request.disposition.portableSecretBackup.password
        exportResults.push(
          await runStage(state, 'secret-backup', () =>
            dependencies.backupPortableSecrets(owner, password)
          )
        )
      } else if (!state.completedStages.has('secret-backup')) {
        setStage(state, 'secret-backup', 'skipped', 'PLUGIN_UNINSTALL_SECRET_BACKUP_SKIPPED', false)
        state.completedStages.add('secret-backup')
      }
    }

    if (exportResults.includes('cancelled')) {
      return failedResponse(state, 'PLUGIN_UNINSTALL_CANCELLED', 'cancelled')
    }
    if (exportResults.some((result) => result === 'failed')) {
      return failedResponse(state, 'PLUGIN_UNINSTALL_EXPORT_FAILED')
    }

    const authorityResults = [
      dependencies.revokePermissions
        ? await runStage(state, 'permissions', () => dependencies.revokePermissions!(owner))
        : 'completed',
      dependencies.invalidateAuthority
        ? await runStage(state, 'authority', () => dependencies.invalidateAuthority!(owner))
        : 'completed'
    ]
    if (authorityResults.some((result) => result !== 'completed')) {
      return failedResponse(state, 'PLUGIN_UNINSTALL_TEARDOWN_FAILED')
    }

    let cleanupFailed = false
    const cleanupOperations: Record<
      (typeof CLEANUP_STAGES)[number],
      () => Promise<PluginDataDispositionStepOutcome>
    > = {
      secrets: () => dependencies.purgeSecrets(owner),
      data: () => dependencies.deleteData(owner),
      cache: () => dependencies.deleteCache(owner),
      'plugin-data': () => dependencies.deletePluginData(owner)
    }
    for (const stage of CLEANUP_STAGES) {
      const result = await runStage(state, stage, cleanupOperations[stage])
      if (result !== 'completed') cleanupFailed = true
    }
    if (!cleanupFailed) {
      const codeRemoval = await runStage(state, 'code', () => dependencies.deleteCode(owner))
      if (codeRemoval !== 'completed') cleanupFailed = true
    }

    let residuals: PluginDataDispositionResiduals
    try {
      residuals = await dependencies.inspectResiduals(owner)
    } catch {
      residuals = {
        sqliteOwner: true,
        sqliteFile: true,
        secrets: true,
        temp: true,
        cache: true,
        data: true,
        pluginData: true,
        code: true
      }
    }
    if (hasResiduals(residuals)) {
      setStage(state, 'verification', 'failed', 'PLUGIN_UNINSTALL_RESIDUALS_FOUND', true)
      return failedResponse(
        state,
        cleanupFailed ? 'PLUGIN_UNINSTALL_CLEANUP_FAILED' : 'PLUGIN_UNINSTALL_VERIFICATION_FAILED'
      )
    }
    setStage(state, 'verification', 'completed', 'PLUGIN_UNINSTALL_VERIFIED', false)
    if (cleanupFailed) {
      return failedResponse(state, 'PLUGIN_UNINSTALL_CLEANUP_FAILED')
    }

    const finalization = await runStage(state, 'finalize', () => dependencies.finalize(owner))
    if (finalization !== 'completed') {
      return failedResponse(state, 'PLUGIN_UNINSTALL_FINALIZE_FAILED')
    }

    const completed = response(
      true,
      'completed',
      'PLUGIN_UNINSTALL_COMPLETED',
      false,
      false,
      orderedStageResults(state.stageResults)
    )
    state.completed = true
    state.completedResponse = completed
    try {
      await dependencies.reportUninstall(owner)
    } catch {
      // Store reporting is downstream of proved local removal and is best-effort.
    }
    return completed
  }

  return {
    hasBlockedOperations(): boolean {
      return [...operations.values()].some((state) => !state.completed)
    },

    isBlocked(pluginName: string): boolean {
      return [...operations.values()].some(
        (state) =>
          !state.completed &&
          (state.owner.pluginName === pluginName || state.owner.folderName === pluginName)
      )
    },

    async uninstall(request: PluginApiUninstallRequest): Promise<PluginApiUninstallResponse> {
      const existing = operations.get(request.plugin.name)
      if (existing?.running) {
        return response(false, 'failed', 'PLUGIN_UNINSTALL_OPERATION_BUSY', true, true, [])
      }

      const currentOwner = dependencies.resolveCurrentOwner(request.plugin.name)
      if (!currentOwner) {
        if (existing?.completed && ownerMatches(existing.owner, request)) {
          return existing.completedResponse as PluginApiUninstallResponse
        }
        return response(false, 'failed', 'PLUGIN_UNINSTALL_NOT_FOUND', false, false, [])
      }
      if (!ownerMatches(currentOwner, request)) {
        return response(false, 'failed', 'PLUGIN_UNINSTALL_STALE_GENERATION', true, true, [])
      }
      if (
        (!existing || existing.completed) &&
        dependencies.canStart &&
        !dependencies.canStart(currentOwner)
      ) {
        return response(false, 'failed', 'PLUGIN_UNINSTALL_OPERATION_BUSY', true, true, [])
      }
      if (existing && !ownerMatches(existing.owner, request) && !existing.completed) {
        return response(false, 'failed', 'PLUGIN_UNINSTALL_STALE_GENERATION', true, true, [])
      }
      if (existing && !existing.completed && !dispositionMatches(existing, request)) {
        return response(false, 'failed', 'PLUGIN_UNINSTALL_OPERATION_BUSY', true, true, [])
      }

      const state: DispositionOperationState =
        existing && ownerMatches(existing.owner, request)
          ? existing
          : {
              owner: Object.freeze({ ...currentOwner }),
              disposition: Object.freeze({
                ordinaryExportEnabled: request.disposition.ordinaryExport.enabled,
                portableSecretBackupEnabled: request.disposition.portableSecretBackup.enabled
              }),
              completedStages: new Set(),
              stageResults: new Map(),
              running: false,
              completed: false
            }
      if (!existing) pruneCompletedOperations()
      operations.set(request.plugin.name, state)
      state.running = true
      try {
        return await execute(state, request)
      } finally {
        state.running = false
      }
    }
  }
}
