import { accessSync, constants, lstatSync, realpathSync } from 'node:fs'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { types as utilTypes } from 'node:util'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'
import { isPrivilegedPluginFor } from '../privileged-plugins'
import { hasControlCharacter } from './plugin-host-text-validation'

export type PluginOrcaReason =
  | 'permission-denied'
  | 'permission-unavailable'
  | 'platform-unsupported'
  | 'orca-unavailable'
  | 'invalid-response'
  | 'cancelled'
  | 'timeout'
  | 'open-failed'

export type PluginOrcaSnapshot =
  | {
      readonly status: 'ready'
      readonly workspaces: number
      readonly terminals: number
      readonly tasks: number
      readonly tasksAvailable: boolean
      readonly title?: string
    }
  | {
      readonly status: 'degraded' | 'unsupported'
      readonly workspaces: 0
      readonly terminals: 0
      readonly tasks: 0
      readonly reason: PluginOrcaReason
    }

export type PluginOrcaOpenResult =
  | { readonly status: 'started' }
  | { readonly status: 'blocked' | 'unsupported' | 'failed'; readonly reason: PluginOrcaReason }

export interface TrustedPluginOrcaService {
  snapshot(signal: AbortSignal): Promise<PluginOrcaSnapshot>
  open(signal: AbortSignal): Promise<PluginOrcaOpenResult>
}

export interface PluginOrcaCapabilityOptions {
  readonly activation: PluginActivationIdentity
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  authorizeApplications(pluginName: string): boolean
  watchApplicationsPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  readonly service: TrustedPluginOrcaService
}

export interface PluginOrcaCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  close(): Promise<void>
}

export interface FixedPluginOrcaServiceOptions {
  readonly platform: NodeJS.Platform
  readonly applicationPath?: string
  readonly cliPath?: string
  execFile(
    executable: string,
    args: readonly string[],
    options: { readonly timeout: number; readonly maxBuffer: number; readonly signal: AbortSignal }
  ): Promise<{ readonly stdout: string }>
  openApplication(applicationPath: string, signal: AbortSignal): Promise<void>
}

const TRUSTED_SERVICES = new WeakSet<object>()
const MAX_COUNT = 100_000
const MAX_TITLE_BYTES = 128
const MAX_OUTPUT_BYTES = 256 * 1024
const REASONS = new Set<PluginOrcaReason>([
  'permission-denied',
  'permission-unavailable',
  'platform-unsupported',
  'orca-unavailable',
  'invalid-response',
  'cancelled',
  'timeout',
  'open-failed'
])

function invalid(): never {
  throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = []
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value))
    invalid()
  let descriptors: PropertyDescriptorMap
  let prototype: object | null
  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
    prototype = Object.getPrototypeOf(value)
  } catch {
    invalid()
  }
  if (prototype !== Object.prototype && prototype !== null) invalid()
  const allowed = new Set(allowedKeys)
  const output: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.has(key)) invalid()
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
    output[key] = descriptor.value
  }
  for (const key of requiredKeys) if (!Object.hasOwn(output, key)) invalid()
  return output
}

function boundedString(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    Buffer.byteLength(value, 'utf8') > maximum ||
    hasControlCharacter(value)
  ) {
    invalid()
  }
  return value.trim()
}

function safeTitle(value: unknown): string | undefined {
  if (value === undefined) return undefined
  const title = boundedString(value, MAX_TITLE_BYTES)
  if (
    /(?:^|[\\/])(?:Users|home|private|tmp|var)(?:[\\/]|$)|(?:api[_-]?key|token|secret|cookie|password|authorization|bearer|command|cwd|env)\s*[:=]/i.test(
      title
    )
  )
    return undefined
  return title
}

function boundedCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > MAX_COUNT) invalid()
  return Number(value)
}

function validateRequest(value: unknown): { readonly operation: 'snapshot' | 'open' } {
  const record = exactRecord(value, ['operation'], ['operation'])
  if (record.operation !== 'snapshot' && record.operation !== 'open') invalid()
  return Object.freeze({ operation: record.operation })
}

function validateResult(value: unknown): PluginOrcaSnapshot | PluginOrcaOpenResult {
  const record = exactRecord(
    value,
    ['status', 'workspaces', 'terminals', 'tasks', 'tasksAvailable', 'title', 'reason'],
    ['status']
  )
  if (record.status === 'ready') {
    if (typeof record.tasksAvailable !== 'boolean') invalid()
    const title = safeTitle(record.title)
    return Object.freeze({
      status: 'ready' as const,
      workspaces: boundedCount(record.workspaces),
      terminals: boundedCount(record.terminals),
      tasks: boundedCount(record.tasks),
      tasksAvailable: record.tasksAvailable,
      ...(title === undefined ? {} : { title })
    })
  }
  if (record.status === 'degraded' || record.status === 'unsupported') {
    if (typeof record.reason !== 'string' || !REASONS.has(record.reason as PluginOrcaReason))
      invalid()
    const workspaces = Object.hasOwn(record, 'workspaces') ? boundedCount(record.workspaces) : 0
    const terminals = Object.hasOwn(record, 'terminals') ? boundedCount(record.terminals) : 0
    const tasks = Object.hasOwn(record, 'tasks') ? boundedCount(record.tasks) : 0
    if (workspaces !== 0 || terminals !== 0 || tasks !== 0) invalid()
    return Object.freeze({
      status: record.status,
      workspaces: 0 as const,
      terminals: 0 as const,
      tasks: 0 as const,
      reason: record.reason as PluginOrcaReason
    })
  }
  if (record.status === 'started') {
    if (Object.keys(record).length !== 1) invalid()
    return Object.freeze({ status: 'started' as const })
  }
  if (record.status === 'blocked' || record.status === 'failed') {
    if (typeof record.reason !== 'string' || !REASONS.has(record.reason as PluginOrcaReason))
      invalid()
    return Object.freeze({ status: record.status, reason: record.reason as PluginOrcaReason })
  }
  invalid()
}

function snapshotActivation(value: unknown): PluginActivationIdentity {
  const record = exactRecord(
    value,
    ['name', 'pluginInstanceId', 'activationGeneration', 'key'],
    ['name', 'pluginInstanceId', 'activationGeneration', 'key']
  )
  if (!Number.isSafeInteger(record.activationGeneration) || Number(record.activationGeneration) < 1)
    invalid()
  return Object.freeze({
    name: boundedString(record.name, 128),
    pluginInstanceId: boundedString(record.pluginInstanceId, 128),
    activationGeneration: Number(record.activationGeneration),
    key: boundedString(record.key, 512)
  })
}

function sameActivation(left: PluginActivationIdentity, right: PluginActivationIdentity): boolean {
  return (
    left.name === right.name &&
    left.pluginInstanceId === right.pluginInstanceId &&
    left.activationGeneration === right.activationGeneration &&
    left.key === right.key
  )
}

function serviceMethod<T extends (...args: never[]) => unknown>(value: unknown, key: string): T {
  if (!value || typeof value !== 'object' || !TRUSTED_SERVICES.has(value)) invalid()
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor?.enumerable || !('value' in descriptor) || typeof descriptor.value !== 'function')
    invalid()
  return descriptor.value as T
}

export function createPluginOrcaCapabilities(
  rawOptions: PluginOrcaCapabilityOptions
): PluginOrcaCapabilities {
  const options = exactRecord(rawOptions, [
    'activation',
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeApplications',
    'watchApplicationsPermissionRevoked',
    'service'
  ]) as unknown as PluginOrcaCapabilityOptions
  for (const key of [
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeApplications',
    'watchApplicationsPermissionRevoked'
  ] as const) {
    if (typeof options[key] !== 'function' || utilTypes.isProxy(options[key])) invalid()
  }
  const expected = snapshotActivation(options.activation)
  if (!isPrivilegedPluginFor('orca', expected.name)) invalid()
  const snapshotService = serviceMethod<TrustedPluginOrcaService['snapshot']>(
    options.service,
    'snapshot'
  )
  const openService = serviceMethod<TrustedPluginOrcaService['open']>(options.service, 'open')
  const controllers = new Set<AbortController>()
  const operations = new Set<Promise<void>>()
  let closed = false
  let permissionAvailable = true
  let closePromise: Promise<void> | null = null
  let disposer: (() => void) | null = null

  const abortAll = (): void => {
    for (const controller of controllers) controller.abort()
  }
  try {
    disposer = options.watchApplicationsPermissionRevoked.call(rawOptions, expected.name, abortAll)
    if (typeof disposer !== 'function' || utilTypes.isProxy(disposer)) invalid()
  } catch {
    permissionAvailable = false
  }

  const assertAuthority = (context: PluginSecurityContext): void => {
    if (!isAuthoritativePluginContext(context)) invalid()
    const identity = context.identity
    if (
      identity.authority !== 'plugin-host' ||
      identity.pluginName !== expected.name ||
      context.name !== expected.name ||
      identity.pluginInstanceId !== expected.pluginInstanceId ||
      identity.activationGeneration !== expected.activationGeneration ||
      context.uniqueKey !== expected.key ||
      !Number.isSafeInteger(identity.hostGeneration)
    ) {
      invalid()
    }
    const current = options.resolveCurrentActivation.call(rawOptions, expected.name)
    if (
      !current ||
      !sameActivation(snapshotActivation(current), expected) ||
      options.resolveHostGeneration.call(rawOptions, expected) !== identity.hostGeneration
    ) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
  }

  const assertPermission = (): void => {
    if (!permissionAvailable) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    }
    let decision: unknown
    try {
      decision = options.authorizeApplications.call(rawOptions, expected.name)
    } catch {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    }
    if (typeof decision !== 'boolean') {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    }
    if (!decision) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
  }

  const run = async (
    operation: 'snapshot' | 'open',
    signal: AbortSignal
  ): Promise<PluginOrcaSnapshot | PluginOrcaOpenResult> => {
    if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
    if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    controllers.add(controller)
    let finish!: () => void
    const active = new Promise<void>((resolve) => {
      finish = resolve
    })
    operations.add(active)
    try {
      const value =
        operation === 'snapshot'
          ? await Reflect.apply(snapshotService, options.service, [controller.signal])
          : await Reflect.apply(openService, options.service, [controller.signal])
      const validated = validateResult(value)
      if (controller.signal.aborted && validated.status !== 'started') {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
      }
      return validated
    } finally {
      signal.removeEventListener('abort', onAbort)
      controllers.delete(controller)
      operations.delete(active)
      finish()
    }
  }

  const definition: PluginHostCapabilityDefinition<
    { readonly operation: 'snapshot' | 'open' },
    PluginOrcaSnapshot | PluginOrcaOpenResult
  > = Object.freeze({
    id: 'orchestration.orca',
    permission: 'system.applications',
    timeoutMs: 15_000,
    maxConcurrency: 1,
    callbackLifetime: 'transient',
    callbackFields: Object.freeze([]),
    validateRequest,
    validateResult,
    isCommittedResult: (result: unknown) =>
      Boolean(
        result &&
        typeof result === 'object' &&
        !utilTypes.isProxy(result) &&
        Object.getOwnPropertyDescriptor(result, 'status')?.value === 'started'
      ),
    invoke: async (
      context: PluginSecurityContext,
      request: { readonly operation: 'snapshot' | 'open' },
      signal: AbortSignal
    ) => {
      assertAuthority(context)
      assertPermission()
      return await run(request.operation, signal)
    }
  })

  return Object.freeze({
    definitions: Object.freeze([definition]),
    close(): Promise<void> {
      if (closePromise) return closePromise
      closed = true
      abortAll()
      try {
        disposer?.()
      } catch {
        // Authority is already closed.
      }
      disposer = null
      closePromise = Promise.allSettled([...operations]).then(() => undefined)
      return closePromise
    }
  })
}

function parseEnvelope(stdout: string): Record<string, unknown> {
  if (Buffer.byteLength(stdout, 'utf8') > MAX_OUTPUT_BYTES) invalid()
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    invalid()
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid()
  const envelopeDescriptors = Object.getOwnPropertyDescriptors(parsed)
  const envelope = Object.create(null) as Record<string, unknown>
  for (const key of ['id', 'ok', 'result']) {
    const descriptor = envelopeDescriptors[key]
    if (descriptor && (!descriptor.enumerable || !('value' in descriptor))) invalid()
    if (descriptor) envelope[key] = descriptor.value
  }
  if (envelope.ok !== true || !Object.hasOwn(envelope, 'result')) invalid()
  const result = envelope.result
  if (!result || typeof result !== 'object' || Array.isArray(result)) invalid()
  const descriptors = Object.getOwnPropertyDescriptors(result)
  const projection: Record<string, unknown> = Object.create(null)
  const allowed = new Set([
    'app',
    'runtime',
    'graph',
    'worktrees',
    'terminals',
    'visualLayouts',
    'tasks',
    'totalCount',
    'count',
    'truncated',
    'title'
  ])
  for (const key of allowed) {
    const descriptor = descriptors[key]
    if (descriptor && (!descriptor.enumerable || !('value' in descriptor))) invalid()
    if (descriptor) projection[key] = descriptor.value
  }
  return projection
}
function countSummary(record: Record<string, unknown>, countKey: string, arrayKey: string): number {
  if (Object.hasOwn(record, countKey)) return boundedCount(record[countKey])
  const values = record[arrayKey]
  if (Array.isArray(values) && values.length <= MAX_COUNT) return values.length
  invalid()
}

function parseOrcaSnapshot(
  outputs: readonly [string, string, string, string | null]
): PluginOrcaSnapshot {
  const status = parseEnvelope(outputs[0])
  const runtime = exactRecord(
    status.runtime,
    ['state', 'reachable', 'runtimeId'],
    ['state', 'reachable']
  )
  if (runtime.state !== 'ready' || runtime.reachable !== true) invalid()
  const worktrees = parseEnvelope(outputs[1])
  const terminals = parseEnvelope(outputs[2])
  const tasks = outputs[3] ? parseEnvelope(outputs[3]) : null
  return Object.freeze({
    status: 'ready' as const,
    workspaces: countSummary(worktrees, 'totalCount', 'worktrees'),
    terminals: countSummary(terminals, 'totalCount', 'terminals'),
    tasks: tasks ? countSummary(tasks, 'count', 'tasks') : 0,
    tasksAvailable: tasks !== null,
    title: 'Orca ready'
  })
}

export function createFixedPluginOrcaService(
  rawOptions: FixedPluginOrcaServiceOptions
): TrustedPluginOrcaService {
  const options = exactRecord(
    rawOptions,
    ['platform', 'applicationPath', 'cliPath', 'execFile', 'openApplication'],
    ['platform', 'execFile', 'openApplication']
  ) as unknown as FixedPluginOrcaServiceOptions
  if (
    typeof options.platform !== 'string' ||
    typeof options.execFile !== 'function' ||
    utilTypes.isProxy(options.execFile) ||
    typeof options.openApplication !== 'function' ||
    utilTypes.isProxy(options.openApplication)
  ) {
    invalid()
  }
  const supported = options.platform === 'darwin'
  const appPath = options.applicationPath ?? '/Applications/Orca.app'
  const cliPath = options.cliPath ?? '/usr/local/bin/orca'
  if (Buffer.byteLength(appPath, 'utf8') > 1024 || appPath.includes('\0')) invalid()
  const allowedCliPath =
    cliPath === '/usr/local/bin/orca' ||
    cliPath === '/opt/homebrew/bin/orca' ||
    cliPath === '/Applications/Orca.app/Contents/Resources/bin/orca' ||
    /^\/(?:usr\/local|opt\/homebrew)\/Cellar\/[^/]+\/[^/]+\/bin\/orca$/.test(cliPath)
  if (!allowedCliPath) invalid()
  const service: TrustedPluginOrcaService = {
    async snapshot(signal) {
      if (!supported) {
        return Object.freeze({
          status: 'unsupported' as const,
          workspaces: 0 as const,
          terminals: 0 as const,
          tasks: 0 as const,
          reason: 'platform-unsupported' as const
        })
      }
      if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
      const controller = new AbortController()
      const onAbort = (): void => controller.abort()
      signal.addEventListener('abort', onAbort, { once: true })
      const execute = async (args: readonly string[]): Promise<string> =>
        (
          await options.execFile(
            cliPath,
            args,
            Object.freeze({
              timeout: 10_000,
              maxBuffer: MAX_OUTPUT_BYTES,
              signal: controller.signal
            })
          )
        ).stdout
      const coreOperations = [
        execute(Object.freeze(['status', '--json'])),
        execute(Object.freeze(['worktree', 'ps', '--limit', '1', '--json'])),
        execute(Object.freeze(['terminal', 'list', '--limit', '1', '--json']))
      ] as const
      const taskOperation = execute(Object.freeze(['orchestration', 'task-list', '--json'])).catch(
        (error) => {
          if (controller.signal.aborted) throw error
          return null
        }
      )
      const operations = [...coreOperations, taskOperation] as const
      try {
        const outputs = await Promise.all(operations)
        return parseOrcaSnapshot(outputs)
      } catch (error) {
        controller.abort()
        await Promise.allSettled(operations)
        if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
        const code =
          error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
        return Object.freeze({
          status: 'degraded' as const,
          workspaces: 0 as const,
          terminals: 0 as const,
          tasks: 0 as const,
          reason: code === 'ENOENT' ? ('orca-unavailable' as const) : ('invalid-response' as const)
        })
      } finally {
        signal.removeEventListener('abort', onAbort)
      }
    },
    async open(signal) {
      if (!supported) {
        return Object.freeze({
          status: 'unsupported' as const,
          reason: 'platform-unsupported' as const
        })
      }
      if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
      try {
        await options.openApplication(appPath, signal)
        return Object.freeze({ status: 'started' as const })
      } catch {
        if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
        return Object.freeze({ status: 'failed' as const, reason: 'open-failed' as const })
      }
    }
  }
  Object.freeze(service)
  TRUSTED_SERVICES.add(service)
  return service
}

const execFileAsync = promisify(execFileCallback)

function resolveOrcaCliPath(): string {
  const candidates = ['/opt/homebrew/bin/orca', '/usr/local/bin/orca']
  for (const candidate of candidates) {
    try {
      const stats = lstatSync(candidate)
      const canonical = realpathSync(candidate)
      const canonicalStats = lstatSync(canonical)
      if (
        (!stats.isFile() && !stats.isSymbolicLink()) ||
        (canonicalStats.mode & 0o002) !== 0 ||
        (!canonical.startsWith('/opt/homebrew/') &&
          !canonical.startsWith('/usr/local/') &&
          canonical !== '/Applications/Orca.app/Contents/Resources/bin/orca')
      )
        continue
      accessSync(canonical, constants.X_OK)
      return canonical
    } catch {
      // Try the next fixed installation prefix.
    }
  }
  return '/opt/homebrew/bin/orca'
}

export function createDefaultPluginOrcaService(
  platform: NodeJS.Platform
): TrustedPluginOrcaService {
  const cliPath = resolveOrcaCliPath()
  return createFixedPluginOrcaService({
    platform,
    cliPath,
    execFile: async (executable, args, options) => {
      const result = await execFileAsync(executable, [...args], {
        timeout: options.timeout,
        maxBuffer: options.maxBuffer,
        signal: options.signal,
        encoding: 'utf8',
        windowsHide: true
      })
      return { stdout: result.stdout }
    },
    openApplication: async (applicationPath, signal) => {
      if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
      await execFileAsync('/usr/bin/open', [applicationPath], {
        timeout: 10_000,
        maxBuffer: 16 * 1024,
        signal,
        windowsHide: true
      })
    }
  })
}
