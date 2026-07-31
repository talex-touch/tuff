/**
 * Exact, versioned renderer/main contract for plugin data disposition.
 * Filesystem paths, Secret selectors, table names, and native failure detail are
 * intentionally absent from this boundary.
 */

import { isPrivacySecretPasswordValid } from './privacy'

export interface PluginUninstallPluginIdentityV1 {
  readonly name: string
  readonly pluginInstanceId: string
  readonly activationGeneration: number
}

export type PluginUninstallOrdinaryExportPlanV1 = { readonly enabled: false } | { readonly enabled: true }

export type PluginUninstallPortableSecretBackupPlanV1 =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly password: string }

export interface PluginUninstallDataDispositionPlanV1 {
  readonly confirmation: 'delete-plugin-and-data'
  readonly ordinaryExport: PluginUninstallOrdinaryExportPlanV1
  readonly portableSecretBackup: PluginUninstallPortableSecretBackupPlanV1
}

export interface PluginApiUninstallRequest {
  readonly version: 1
  readonly plugin: PluginUninstallPluginIdentityV1
  readonly disposition: PluginUninstallDataDispositionPlanV1
}

export const PLUGIN_UNINSTALL_STAGES = [
  'admission',
  'runtime',
  'logger',
  'ordinary-export',
  'secret-backup',
  'sqlite',
  'permissions',
  'authority',
  'secrets',
  'data',
  'cache',
  'temp',
  'plugin-data',
  'code',
  'verification',
  'finalize',
] as const

export type PluginUninstallStage = (typeof PLUGIN_UNINSTALL_STAGES)[number]
export type PluginUninstallStageStatus = 'completed' | 'skipped' | 'failed' | 'cancelled'

export const PLUGIN_UNINSTALL_RESULT_CODES = [
  'PLUGIN_UNINSTALL_COMPLETED',
  'PLUGIN_UNINSTALL_NOT_FOUND',
  'PLUGIN_UNINSTALL_STALE_GENERATION',
  'PLUGIN_UNINSTALL_OPERATION_BUSY',
  'PLUGIN_UNINSTALL_CANCELLED',
  'PLUGIN_UNINSTALL_TEARDOWN_FAILED',
  'PLUGIN_UNINSTALL_EXPORT_FAILED',
  'PLUGIN_UNINSTALL_CLEANUP_FAILED',
  'PLUGIN_UNINSTALL_VERIFICATION_FAILED',
  'PLUGIN_UNINSTALL_FINALIZE_FAILED',
] as const

export type PluginUninstallResultCode = (typeof PLUGIN_UNINSTALL_RESULT_CODES)[number]

export const PLUGIN_UNINSTALL_STAGE_CODES = [
  'PLUGIN_UNINSTALL_ADMISSION_CLOSED',
  'PLUGIN_UNINSTALL_RUNTIME_CLOSED',
  'PLUGIN_UNINSTALL_RUNTIME_TEARDOWN_FAILED',
  'PLUGIN_UNINSTALL_SQLITE_CLOSED',
  'PLUGIN_UNINSTALL_SQLITE_CLOSE_FAILED',
  'PLUGIN_UNINSTALL_SQLITE_RESIDUAL',
  'PLUGIN_UNINSTALL_PERMISSIONS_REVOKED',
  'PLUGIN_UNINSTALL_PERMISSION_REVOKE_FAILED',
  'PLUGIN_UNINSTALL_AUTHORITY_INVALIDATED',
  'PLUGIN_UNINSTALL_AUTHORITY_INVALIDATION_FAILED',
  'PLUGIN_UNINSTALL_LOGGER_CLOSED',
  'PLUGIN_UNINSTALL_LOGGER_CLOSE_FAILED',
  'PLUGIN_UNINSTALL_ORDINARY_EXPORT_SKIPPED',
  'PLUGIN_UNINSTALL_ORDINARY_EXPORT_COMPLETED',
  'PLUGIN_UNINSTALL_ORDINARY_EXPORT_FAILED',
  'PLUGIN_UNINSTALL_ORDINARY_EXPORT_CANCELLED',
  'PLUGIN_UNINSTALL_SECRET_BACKUP_SKIPPED',
  'PLUGIN_UNINSTALL_SECRET_BACKUP_COMPLETED',
  'PLUGIN_UNINSTALL_SECRET_BACKUP_NO_DATA',
  'PLUGIN_UNINSTALL_SECRET_BACKUP_FAILED',
  'PLUGIN_UNINSTALL_SECRET_BACKUP_CANCELLED',
  'PLUGIN_UNINSTALL_SECRETS_PURGED',
  'PLUGIN_UNINSTALL_SECRET_PURGE_FAILED',
  'PLUGIN_UNINSTALL_TEMP_DELETED',
  'PLUGIN_UNINSTALL_TEMP_DELETE_FAILED',
  'PLUGIN_UNINSTALL_CACHE_DELETED',
  'PLUGIN_UNINSTALL_CACHE_DELETE_FAILED',
  'PLUGIN_UNINSTALL_DATA_DELETED',
  'PLUGIN_UNINSTALL_DATA_DELETE_FAILED',
  'PLUGIN_UNINSTALL_PLUGIN_DATA_DELETED',
  'PLUGIN_UNINSTALL_PLUGIN_DATA_DELETE_FAILED',
  'PLUGIN_UNINSTALL_CODE_DELETED',
  'PLUGIN_UNINSTALL_CODE_DELETE_FAILED',
  'PLUGIN_UNINSTALL_VERIFIED',
  'PLUGIN_UNINSTALL_RESIDUALS_FOUND',
  'PLUGIN_UNINSTALL_FINALIZED',
  'PLUGIN_UNINSTALL_FINALIZE_FAILED',
] as const

export type PluginUninstallStageCode = (typeof PLUGIN_UNINSTALL_STAGE_CODES)[number]

export interface PluginUninstallStageResult {
  readonly stage: PluginUninstallStage
  readonly status: PluginUninstallStageStatus
  readonly code: PluginUninstallStageCode
  readonly retryable: boolean
}

export interface PluginApiUninstallResponse {
  readonly version: 1
  readonly success: boolean
  readonly status: 'completed' | 'failed' | 'cancelled'
  readonly code: PluginUninstallResultCode
  readonly retryable: boolean
  readonly installed: boolean
  readonly stages: readonly PluginUninstallStageResult[]
}

export interface PluginApiExactOperationRequest {
  readonly name: string
}

const STAGE_SET = new Set<string>(PLUGIN_UNINSTALL_STAGES)
const RESULT_CODE_SET = new Set<string>(PLUGIN_UNINSTALL_RESULT_CODES)
const STAGE_CODE_SET = new Set<string>(PLUGIN_UNINSTALL_STAGE_CODES)
const STAGE_STATUS_SET = new Set<string>(['completed', 'skipped', 'failed', 'cancelled'])
const NAME_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,127}$/i
const INSTANCE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,127}$/i

function invalidOperationRequest(): never {
  throw new Error('PLUGIN_OPERATION_REQUEST_INVALID')
}

function invalidUninstallRequest(): never {
  throw new Error('PLUGIN_UNINSTALL_REQUEST_INVALID')
}

function invalidUninstallResult(): never {
  throw new Error('PLUGIN_UNINSTALL_RESULT_INVALID')
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  invalid: () => never,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  try {
    const prototype = Object.getPrototypeOf(value)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (prototype !== Object.prototype && prototype !== null) invalid()
    const allowed = new Set(allowedKeys)
    const output: Record<string, unknown> = Object.create(null)
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = typeof key === 'string' ? descriptors[key] : undefined
      if (
        typeof key !== 'string' ||
        !allowed.has(key) ||
        !descriptor?.enumerable ||
        !Object.hasOwn(descriptor, 'value')
      ) {
        invalid()
      }
      output[key] = descriptor.value
    }
    if (requiredKeys.some(key => !Object.hasOwn(descriptors, key))) invalid()
    return output
  } catch {
    return invalid()
  }
}

function exactArray(value: unknown, maximum: number, invalid: () => never): readonly unknown[] {
  if (!Array.isArray(value)) invalid()
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) invalid()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum) invalid()
    const allowed = new Set<PropertyKey>(['length'])
    const output: unknown[] = []
    for (let index = 0; index < length; index += 1) {
      const key = String(index)
      allowed.add(key)
      const descriptor = descriptors[key]
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid()
      output.push(descriptor.value)
    }
    if (Reflect.ownKeys(descriptors).some(key => !allowed.has(key))) invalid()
    return output
  } catch {
    return invalid()
  }
}

function utf8Bytes(value: string, maximum: number): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index) ?? 0
    if (codePoint > 0xffff) index += 1
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
    if (bytes > maximum) return bytes
  }
  return bytes
}

function assertCloneable(value: object, invalid: () => never): void {
  if (typeof structuredClone !== 'function') return
  try {
    structuredClone(value)
  } catch {
    invalid()
  }
}

function normalizeName(value: unknown, invalid: () => never): string {
  if (typeof value !== 'string' || !NAME_PATTERN.test(value) || utf8Bytes(value, 256) > 256) {
    invalid()
  }
  return value
}

export function normalizePluginApiOperationRequest(value: unknown): PluginApiExactOperationRequest {
  const request = exactRecord(value, ['name'], ['name'], invalidOperationRequest)
  const name = normalizeName(request.name, invalidOperationRequest)
  assertCloneable(value as object, invalidOperationRequest)
  return Object.freeze({ name })
}

export function normalizePluginUninstallRequest(value: unknown): PluginApiUninstallRequest {
  const request = exactRecord(
    value,
    ['version', 'plugin', 'disposition'],
    ['version', 'plugin', 'disposition'],
    invalidUninstallRequest,
  )
  if (request.version !== 1) invalidUninstallRequest()

  const plugin = exactRecord(
    request.plugin,
    ['name', 'pluginInstanceId', 'activationGeneration'],
    ['name', 'pluginInstanceId', 'activationGeneration'],
    invalidUninstallRequest,
  )
  const name = normalizeName(plugin.name, invalidUninstallRequest)
  if (
    typeof plugin.pluginInstanceId !== 'string' ||
    !INSTANCE_PATTERN.test(plugin.pluginInstanceId) ||
    !Number.isSafeInteger(plugin.activationGeneration) ||
    Number(plugin.activationGeneration) < 0
  ) {
    invalidUninstallRequest()
  }

  const disposition = exactRecord(
    request.disposition,
    ['confirmation', 'ordinaryExport', 'portableSecretBackup'],
    ['confirmation', 'ordinaryExport', 'portableSecretBackup'],
    invalidUninstallRequest,
  )
  if (disposition.confirmation !== 'delete-plugin-and-data') invalidUninstallRequest()

  const ordinary = exactRecord(disposition.ordinaryExport, ['enabled'], ['enabled'], invalidUninstallRequest)
  if (typeof ordinary.enabled !== 'boolean') invalidUninstallRequest()

  const backup = exactRecord(
    disposition.portableSecretBackup,
    ['enabled', 'password'],
    ['enabled'],
    invalidUninstallRequest,
  )
  if (typeof backup.enabled !== 'boolean') invalidUninstallRequest()
  let portableSecretBackup: PluginUninstallPortableSecretBackupPlanV1
  if (backup.enabled) {
    if (!isPrivacySecretPasswordValid(backup.password)) {
      invalidUninstallRequest()
    }
    portableSecretBackup = Object.freeze({ enabled: true, password: backup.password })
  } else {
    if (Object.hasOwn(backup, 'password')) invalidUninstallRequest()
    portableSecretBackup = Object.freeze({ enabled: false })
  }

  assertCloneable(value as object, invalidUninstallRequest)
  return Object.freeze({
    version: 1,
    plugin: Object.freeze({
      name,
      pluginInstanceId: plugin.pluginInstanceId as string,
      activationGeneration: Number(plugin.activationGeneration),
    }),
    disposition: Object.freeze({
      confirmation: 'delete-plugin-and-data',
      ordinaryExport: Object.freeze({ enabled: ordinary.enabled }),
      portableSecretBackup,
    }),
  }) as PluginApiUninstallRequest
}

export function normalizePluginUninstallResponse(value: unknown): PluginApiUninstallResponse {
  const response = exactRecord(
    value,
    ['version', 'success', 'status', 'code', 'retryable', 'installed', 'stages'],
    ['version', 'success', 'status', 'code', 'retryable', 'installed', 'stages'],
    invalidUninstallResult,
  )
  if (
    response.version !== 1 ||
    typeof response.success !== 'boolean' ||
    (response.status !== 'completed' && response.status !== 'failed' && response.status !== 'cancelled') ||
    typeof response.code !== 'string' ||
    !RESULT_CODE_SET.has(response.code) ||
    typeof response.retryable !== 'boolean' ||
    typeof response.installed !== 'boolean'
  ) {
    invalidUninstallResult()
  }

  const seenStages = new Set<string>()
  const stages = exactArray(response.stages, PLUGIN_UNINSTALL_STAGES.length, invalidUninstallResult).map(
    (candidate): PluginUninstallStageResult => {
      const stage = exactRecord(
        candidate,
        ['stage', 'status', 'code', 'retryable'],
        ['stage', 'status', 'code', 'retryable'],
        invalidUninstallResult,
      )
      if (
        typeof stage.stage !== 'string' ||
        !STAGE_SET.has(stage.stage) ||
        seenStages.has(stage.stage) ||
        typeof stage.status !== 'string' ||
        !STAGE_STATUS_SET.has(stage.status) ||
        typeof stage.code !== 'string' ||
        !STAGE_CODE_SET.has(stage.code) ||
        typeof stage.retryable !== 'boolean'
      ) {
        invalidUninstallResult()
      }
      seenStages.add(stage.stage)
      return Object.freeze({
        stage: stage.stage as PluginUninstallStage,
        status: stage.status as PluginUninstallStageStatus,
        code: stage.code as PluginUninstallStageCode,
        retryable: stage.retryable,
      })
    },
  )

  if (
    (response.success &&
      (response.status !== 'completed' ||
        response.code !== 'PLUGIN_UNINSTALL_COMPLETED' ||
        response.retryable ||
        response.installed)) ||
    (!response.success && response.status === 'completed') ||
    (response.status === 'cancelled' && response.code !== 'PLUGIN_UNINSTALL_CANCELLED') ||
    (!response.success && !response.installed && response.code !== 'PLUGIN_UNINSTALL_NOT_FOUND')
  ) {
    invalidUninstallResult()
  }
  assertCloneable(value as object, invalidUninstallResult)

  return Object.freeze({
    version: 1,
    success: response.success,
    status: response.status,
    code: response.code,
    retryable: response.retryable,
    installed: response.installed,
    stages: Object.freeze(stages),
  }) as PluginApiUninstallResponse
}
