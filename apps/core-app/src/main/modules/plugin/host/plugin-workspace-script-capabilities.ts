import type { ChildProcess } from 'node:child_process'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { createHash, randomBytes } from 'node:crypto'
import {
  constants as fsConstants,
  lstatSync,
  promises as fs,
  realpathSync,
  statSync
} from 'node:fs'
import path from 'node:path'
import { types as utilTypes } from 'node:util'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'

export const PLUGIN_WORKSPACE_SCRIPT_TIMEOUT_MS = 30_000
export const PLUGIN_WORKSPACE_SCRIPT_MAX_PACKAGE_BYTES = 256 * 1024
export const PLUGIN_WORKSPACE_SCRIPT_MAX_SCRIPTS = 128
export const PLUGIN_WORKSPACE_SCRIPT_TOKEN_TTL_MS = 2 * 60 * 1000
export const PLUGIN_WORKSPACE_TOKEN_TTL_MS = 5 * 60 * 1000
export const PLUGIN_WORKSPACE_TOKEN_MAX_USES = 32
export const PLUGIN_WORKSPACE_SCRIPT_MAX_PROCESSES = 2

const WORKSPACE_TOKEN_PATTERN = /^ws_[A-Za-z0-9_-]{32}$/
const SCRIPT_TOKEN_PATTERN = /^wss_[A-Za-z0-9_-]{32}$/
const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,95}$/
const TRUSTED_HOSTS = new WeakSet<object>()
const TRUSTED_PROCESSES = new WeakSet<object>()
const SAFE_ENVIRONMENT_KEYS = Object.freeze([
  'APPDATA',
  'HOME',
  'LOCALAPPDATA',
  'NODE_ENV',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USERPROFILE',
  'WINDIR'
] as const)

type WorkspaceScriptRequest =
  | { readonly operation: 'select-workspace' }
  | { readonly operation: 'list-scripts'; readonly workspaceToken: string }
  | { readonly operation: 'run-script'; readonly scriptToken: string }

type WorkspaceScriptResult =
  | {
      readonly operation: 'select-workspace'
      readonly status: 'selected'
      readonly workspace: WorkspaceDisplay
    }
  | { readonly operation: 'select-workspace'; readonly status: 'cancelled' }
  | {
      readonly operation: 'select-workspace'
      readonly status: 'failed'
      readonly reason: 'selection-failed' | 'workspace-invalid'
    }
  | {
      readonly operation: 'list-scripts'
      readonly status: 'available'
      readonly workspace: WorkspaceDisplay
      readonly scripts: readonly ScriptDisplay[]
    }
  | {
      readonly operation: 'list-scripts'
      readonly status: 'blocked'
      readonly reason: WorkspaceTokenFailure | 'workspace-replaced' | 'package-replaced'
    }
  | {
      readonly operation: 'list-scripts'
      readonly status: 'failed'
      readonly reason: 'package-invalid'
    }
  | {
      readonly operation: 'run-script'
      readonly status: 'started'
      readonly scriptName: string
    }
  | {
      readonly operation: 'run-script'
      readonly status: 'blocked'
      readonly reason:
        | ScriptTokenFailure
        | 'workspace-replaced'
        | 'package-replaced'
        | 'script-changed'
        | 'confirmation-denied'
        | 'permission-denied'
        | 'permission-unavailable'
        | 'process-limit'
    }
  | {
      readonly operation: 'run-script'
      readonly status: 'failed'
      readonly reason: 'confirmation-unavailable' | 'execution-failed'
    }

interface WorkspaceDisplay {
  readonly token: string
  readonly name: string
}

interface ScriptDisplay {
  readonly token: string
  readonly name: string
}

interface WorkspaceIdentity {
  readonly root: string
  readonly rootDevice: string
  readonly rootInode: string
  readonly packagePath: string
  readonly packageDevice: string
  readonly packageInode: string
  readonly displayName: string
}

interface PackageSnapshot {
  readonly identity: WorkspaceIdentity
  readonly scripts: ReadonlyMap<string, string>
}

interface WorkspaceTokenRecord {
  readonly epoch: number
  readonly expiresAt: number
  readonly workspace: WorkspaceIdentity
  remainingUses: number
}

interface ScriptTokenRecord {
  readonly epoch: number
  readonly expiresAt: number
  readonly workspace: WorkspaceIdentity
  readonly scriptName: string
  readonly scriptDigest: string
}

type WorkspaceTokenFailure = 'token-invalid' | 'token-expired' | 'token-replayed'
type ScriptTokenFailure = WorkspaceTokenFailure

type WorkspaceValidationCode =
  | 'workspace-invalid'
  | 'package-invalid'
  | 'workspace-replaced'
  | 'package-replaced'
  | 'script-changed'

class WorkspaceValidationError extends Error {
  constructor(readonly code: WorkspaceValidationCode) {
    super(code)
  }
}

export interface PluginWorkspaceScriptProcessExit {
  readonly code: number | null
}

export interface PluginWorkspaceScriptProcess {
  started(): Promise<void>
  wait(): Promise<PluginWorkspaceScriptProcessExit>
  kill(): void | Promise<void>
}

export interface PluginWorkspaceScriptSpawnOptions {
  readonly cwd: string
  readonly detached: false
  readonly env: Readonly<Record<string, string>>
  readonly shell: false
  readonly stdio: readonly ['ignore', 'ignore', 'ignore']
  readonly windowsHide: true
  readonly windowsVerbatimArguments: boolean
}

export interface PluginWorkspaceScriptConfirmation {
  readonly workspaceName: string
  readonly scriptName: string
}

interface TrustedPluginWorkspaceScriptHost {
  selectWorkspace(signal: AbortSignal): Promise<string | null>
  confirmRun(input: PluginWorkspaceScriptConfirmation, signal: AbortSignal): Promise<boolean>
  startScript(workspace: WorkspaceIdentity, scriptName: string): PluginWorkspaceScriptProcess
}

export interface FixedPluginWorkspaceScriptHostOptions {
  readonly platform: NodeJS.Platform
  readonly environment: NodeJS.ProcessEnv
  resolvePackageManager(
    platform: NodeJS.Platform,
    environment: Readonly<Record<string, string>>
  ): string | null
  selectWorkspace(signal: AbortSignal): Promise<string | null>
  confirmRun(input: PluginWorkspaceScriptConfirmation, signal: AbortSignal): Promise<boolean>
  spawn(
    executable: string,
    args: readonly string[],
    options: PluginWorkspaceScriptSpawnOptions
  ): PluginWorkspaceScriptProcess
}

export interface PluginWorkspaceScriptCapabilitiesOptions {
  readonly activation: PluginActivationIdentity
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  authorizeRead(pluginName: string): boolean
  authorizeShell(pluginName: string): boolean
  watchReadPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  watchShellPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  readonly host: TrustedPluginWorkspaceScriptHost
}

export interface PluginWorkspaceScriptCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  close(): Promise<void>
}

interface OwnedProcess {
  readonly wait: Promise<PluginWorkspaceScriptProcessExit>
  terminate(): Promise<void>
}

function invalid(): never {
  throw new TypeError('PLUGIN_WORKSPACE_SCRIPT_INVALID')
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = allowedKeys
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalid()
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalid()
  }
  if (prototype !== Object.prototype && prototype !== null) invalid()
  const allowed = new Set(allowedKeys)
  const output: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key]
    if (
      typeof key !== 'string' ||
      !allowed.has(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    ) {
      invalid()
    }
    output[key] = descriptor.value
  }
  for (const key of requiredKeys) if (!Object.hasOwn(descriptors, key)) invalid()
  return output
}

function snapshotArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const lengthDescriptor = descriptors.length
  const length = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : -1
  if (!Number.isSafeInteger(length) || Number(length) < 0 || Number(length) > maximum) invalid()
  const allowedKeys = new Set<PropertyKey>(['length'])
  const output: unknown[] = []
  for (let index = 0; index < Number(length); index += 1) {
    const key = String(index)
    allowedKeys.add(key)
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
    output.push(descriptor.value)
  }
  if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))) invalid()
  return output
}

function dataMethod<T extends (...args: never[]) => unknown>(value: unknown, key: string): T {
  if (!value || typeof value !== 'object' || utilTypes.isProxy(value)) invalid()
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
  if (typeof descriptor.value !== 'function' || utilTypes.isProxy(descriptor.value)) invalid()
  return descriptor.value as T
}

function snapshotActivation(value: unknown): PluginActivationIdentity {
  const record = exactRecord(value, ['name', 'pluginInstanceId', 'activationGeneration', 'key'])
  if (
    typeof record.name !== 'string' ||
    record.name.length < 1 ||
    typeof record.pluginInstanceId !== 'string' ||
    record.pluginInstanceId.length < 1 ||
    !Number.isSafeInteger(record.activationGeneration) ||
    Number(record.activationGeneration) < 1 ||
    typeof record.key !== 'string' ||
    record.key.length < 1
  ) {
    invalid()
  }
  return Object.freeze({
    name: record.name,
    pluginInstanceId: record.pluginInstanceId,
    activationGeneration: Number(record.activationGeneration),
    key: record.key
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

function validateRequest(value: unknown): WorkspaceScriptRequest {
  const record = exactRecord(value, ['operation', 'workspaceToken', 'scriptToken'], ['operation'])
  if (
    record.operation === 'select-workspace' &&
    !Object.hasOwn(record, 'workspaceToken') &&
    !Object.hasOwn(record, 'scriptToken')
  ) {
    return Object.freeze({ operation: 'select-workspace' })
  }
  if (
    record.operation === 'list-scripts' &&
    typeof record.workspaceToken === 'string' &&
    WORKSPACE_TOKEN_PATTERN.test(record.workspaceToken) &&
    !Object.hasOwn(record, 'scriptToken')
  ) {
    return Object.freeze({ operation: 'list-scripts', workspaceToken: record.workspaceToken })
  }
  if (
    record.operation === 'run-script' &&
    typeof record.scriptToken === 'string' &&
    SCRIPT_TOKEN_PATTERN.test(record.scriptToken) &&
    !Object.hasOwn(record, 'workspaceToken')
  ) {
    return Object.freeze({ operation: 'run-script', scriptToken: record.scriptToken })
  }
  invalid()
}

function boundedDisplayName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 96 ||
    Buffer.byteLength(value, 'utf8') > 384 ||
    /[\0\r\n]/.test(value)
  ) {
    invalid()
  }
  return value
}

function validateWorkspaceDisplay(value: unknown): WorkspaceDisplay {
  const record = exactRecord(value, ['token', 'name'])
  if (typeof record.token !== 'string' || !WORKSPACE_TOKEN_PATTERN.test(record.token)) invalid()
  return Object.freeze({ token: record.token, name: boundedDisplayName(record.name) })
}

function validateScriptDisplay(value: unknown): ScriptDisplay {
  const record = exactRecord(value, ['token', 'name'])
  if (
    typeof record.token !== 'string' ||
    !SCRIPT_TOKEN_PATTERN.test(record.token) ||
    typeof record.name !== 'string' ||
    !SCRIPT_NAME_PATTERN.test(record.name)
  ) {
    invalid()
  }
  return Object.freeze({ token: record.token, name: record.name })
}

function validateResult(value: unknown): WorkspaceScriptResult {
  const record = exactRecord(
    value,
    ['operation', 'status', 'workspace', 'scripts', 'scriptName', 'reason'],
    ['operation', 'status']
  )
  if (record.operation === 'select-workspace') {
    if (
      record.status === 'selected' &&
      Object.hasOwn(record, 'workspace') &&
      !Object.hasOwn(record, 'scripts') &&
      !Object.hasOwn(record, 'scriptName') &&
      !Object.hasOwn(record, 'reason')
    ) {
      return Object.freeze({
        operation: 'select-workspace',
        status: 'selected',
        workspace: validateWorkspaceDisplay(record.workspace)
      })
    }
    if (
      record.status === 'cancelled' &&
      !Object.hasOwn(record, 'workspace') &&
      !Object.hasOwn(record, 'scripts') &&
      !Object.hasOwn(record, 'scriptName') &&
      !Object.hasOwn(record, 'reason')
    ) {
      return Object.freeze({ operation: 'select-workspace', status: 'cancelled' })
    }
    if (
      record.status === 'failed' &&
      (record.reason === 'selection-failed' || record.reason === 'workspace-invalid') &&
      !Object.hasOwn(record, 'workspace') &&
      !Object.hasOwn(record, 'scripts') &&
      !Object.hasOwn(record, 'scriptName')
    ) {
      return Object.freeze({
        operation: 'select-workspace',
        status: 'failed',
        reason: record.reason
      })
    }
    invalid()
  }
  if (record.operation === 'list-scripts') {
    if (
      record.status === 'available' &&
      Object.hasOwn(record, 'workspace') &&
      Object.hasOwn(record, 'scripts') &&
      !Object.hasOwn(record, 'scriptName') &&
      !Object.hasOwn(record, 'reason')
    ) {
      const scripts = Object.freeze(
        snapshotArray(record.scripts, PLUGIN_WORKSPACE_SCRIPT_MAX_SCRIPTS).map(
          validateScriptDisplay
        )
      )
      return Object.freeze({
        operation: 'list-scripts',
        status: 'available',
        workspace: validateWorkspaceDisplay(record.workspace),
        scripts
      })
    }
    const blockedReasons = new Set([
      'token-invalid',
      'token-expired',
      'token-replayed',
      'workspace-replaced',
      'package-replaced'
    ])
    if (
      record.status === 'blocked' &&
      typeof record.reason === 'string' &&
      blockedReasons.has(record.reason) &&
      !Object.hasOwn(record, 'workspace') &&
      !Object.hasOwn(record, 'scripts') &&
      !Object.hasOwn(record, 'scriptName')
    ) {
      return Object.freeze({
        operation: 'list-scripts',
        status: 'blocked',
        reason: record.reason
      }) as WorkspaceScriptResult
    }
    if (
      record.status === 'failed' &&
      record.reason === 'package-invalid' &&
      !Object.hasOwn(record, 'workspace') &&
      !Object.hasOwn(record, 'scripts') &&
      !Object.hasOwn(record, 'scriptName')
    ) {
      return Object.freeze({
        operation: 'list-scripts',
        status: 'failed',
        reason: 'package-invalid'
      })
    }
    invalid()
  }
  if (record.operation !== 'run-script') invalid()
  if (
    record.status === 'started' &&
    typeof record.scriptName === 'string' &&
    SCRIPT_NAME_PATTERN.test(record.scriptName) &&
    !Object.hasOwn(record, 'workspace') &&
    !Object.hasOwn(record, 'scripts') &&
    !Object.hasOwn(record, 'reason')
  ) {
    return Object.freeze({
      operation: 'run-script',
      status: 'started',
      scriptName: record.scriptName
    })
  }
  const runBlockedReasons = new Set([
    'token-invalid',
    'token-expired',
    'token-replayed',
    'workspace-replaced',
    'package-replaced',
    'script-changed',
    'confirmation-denied',
    'permission-denied',
    'permission-unavailable',
    'process-limit'
  ])
  if (
    record.status === 'blocked' &&
    typeof record.reason === 'string' &&
    runBlockedReasons.has(record.reason) &&
    !Object.hasOwn(record, 'workspace') &&
    !Object.hasOwn(record, 'scripts') &&
    !Object.hasOwn(record, 'scriptName')
  ) {
    return Object.freeze({
      operation: 'run-script',
      status: 'blocked',
      reason: record.reason
    }) as WorkspaceScriptResult
  }
  if (
    record.status === 'failed' &&
    (record.reason === 'confirmation-unavailable' || record.reason === 'execution-failed') &&
    !Object.hasOwn(record, 'workspace') &&
    !Object.hasOwn(record, 'scripts') &&
    !Object.hasOwn(record, 'scriptName')
  ) {
    return Object.freeze({
      operation: 'run-script',
      status: 'failed',
      reason: record.reason
    })
  }
  invalid()
}

function snapshotProcessShape(value: unknown): PluginWorkspaceScriptProcess {
  const record = exactRecord(value, ['started', 'wait', 'kill'])
  if (
    typeof record.started !== 'function' ||
    utilTypes.isProxy(record.started) ||
    typeof record.wait !== 'function' ||
    utilTypes.isProxy(record.wait) ||
    typeof record.kill !== 'function' ||
    utilTypes.isProxy(record.kill)
  ) {
    invalid()
  }
  const started = record.started as PluginWorkspaceScriptProcess['started']
  const wait = record.wait as PluginWorkspaceScriptProcess['wait']
  const kill = record.kill as PluginWorkspaceScriptProcess['kill']
  return Object.freeze({
    started: () => started.call(value),
    wait: () => wait.call(value),
    kill: () => kill.call(value)
  })
}

function trustProcess(value: unknown): PluginWorkspaceScriptProcess {
  const process = snapshotProcessShape(value)
  TRUSTED_PROCESSES.add(process)
  return process
}

function snapshotProcess(value: unknown): PluginWorkspaceScriptProcess {
  if (!value || typeof value !== 'object' || !TRUSTED_PROCESSES.has(value)) invalid()
  return value as PluginWorkspaceScriptProcess
}

function snapshotExit(value: unknown): PluginWorkspaceScriptProcessExit {
  const record = exactRecord(value, ['code'])
  if (record.code !== null && !Number.isSafeInteger(record.code)) invalid()
  return Object.freeze({ code: record.code === null ? null : Number(record.code) })
}

function snapshotEnvironment(
  value: unknown,
  platform: NodeJS.Platform
): Readonly<Record<string, string>> {
  if (!value || typeof value !== 'object' || utilTypes.isProxy(value)) invalid()
  const output: Record<string, string> = Object.create(null)
  for (const key of SAFE_ENVIRONMENT_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string') continue
    if (descriptor.value.length > 4096 || /[\0\r\n]/.test(descriptor.value)) continue
    output[key] = descriptor.value
  }
  const pathKey = Object.keys(value).find((key) => key.toUpperCase() === 'PATH')
  if (pathKey) {
    const descriptor = Object.getOwnPropertyDescriptor(value, pathKey)
    if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string') {
      const pathApi = platform === 'win32' ? path.win32 : path.posix
      const normalized = descriptor.value
        .split(pathApi.delimiter)
        .filter(
          (entry) =>
            entry.length > 0 &&
            entry.length <= 4096 &&
            !/[\0\r\n]/.test(entry) &&
            pathApi.isAbsolute(entry)
        )
        .map((entry) => pathApi.normalize(entry))
      if (normalized.length > 0) output.PATH = [...new Set(normalized)].join(pathApi.delimiter)
    }
  }
  return Object.freeze(output)
}

export function resolvePluginWorkspacePackageManagerPath(
  platform: NodeJS.Platform,
  environment: Readonly<Record<string, string>>
): string | null {
  const searchPath = environment.PATH
  if (typeof searchPath !== 'string') return null
  const pathApi = platform === 'win32' ? path.win32 : path.posix
  const executableName = platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  for (const directory of searchPath.split(pathApi.delimiter)) {
    if (!directory || !pathApi.isAbsolute(directory)) continue
    const candidate = pathApi.join(directory, executableName)
    try {
      const canonical = realpathSync(candidate)
      const stats = statSync(canonical)
      if (!stats.isFile()) continue
      if (platform !== 'win32' && (stats.mode & 0o111) === 0) continue
      if (platform === 'win32' && /["%!*?&|<>()^\r\n\0]/.test(canonical)) continue
      return canonical
    } catch {
      // Continue through the main-owned absolute search path.
    }
  }
  return null
}

export function createFixedPluginWorkspaceScriptHost(
  rawOptions: FixedPluginWorkspaceScriptHostOptions
): TrustedPluginWorkspaceScriptHost {
  const options = exactRecord(rawOptions, [
    'platform',
    'environment',
    'resolvePackageManager',
    'selectWorkspace',
    'confirmRun',
    'spawn'
  ])
  if (
    typeof options.platform !== 'string' ||
    typeof options.resolvePackageManager !== 'function' ||
    utilTypes.isProxy(options.resolvePackageManager) ||
    typeof options.selectWorkspace !== 'function' ||
    utilTypes.isProxy(options.selectWorkspace) ||
    typeof options.confirmRun !== 'function' ||
    utilTypes.isProxy(options.confirmRun) ||
    typeof options.spawn !== 'function' ||
    utilTypes.isProxy(options.spawn)
  ) {
    invalid()
  }
  const platform = options.platform as NodeJS.Platform
  const environment = snapshotEnvironment(options.environment, platform)
  const resolvePackageManager =
    options.resolvePackageManager as FixedPluginWorkspaceScriptHostOptions['resolvePackageManager']
  const selectWorkspace =
    options.selectWorkspace as FixedPluginWorkspaceScriptHostOptions['selectWorkspace']
  const confirmRun = options.confirmRun as FixedPluginWorkspaceScriptHostOptions['confirmRun']
  const spawn = options.spawn as FixedPluginWorkspaceScriptHostOptions['spawn']
  const windowsRootCandidate = environment.SystemRoot ?? environment.WINDIR ?? 'C:\\Windows'
  const windowsRoot =
    /^[A-Za-z]:\\Windows$/i.test(windowsRootCandidate) &&
    path.win32.normalize(windowsRootCandidate) === windowsRootCandidate
      ? windowsRootCandidate
      : 'C:\\Windows'
  const windowsExecutable = path.win32.join(windowsRoot, 'System32', 'cmd.exe')
  const host = Object.freeze({
    async selectWorkspace(signal: AbortSignal): Promise<string | null> {
      const selected = await selectWorkspace.call(rawOptions, signal)
      if (selected === null) return null
      if (typeof selected !== 'string' || selected.length < 1 || selected.length > 4096) invalid()
      return selected
    },
    async confirmRun(
      input: PluginWorkspaceScriptConfirmation,
      signal: AbortSignal
    ): Promise<boolean> {
      const record = exactRecord(input, ['workspaceName', 'scriptName'])
      const workspaceName = boundedDisplayName(record.workspaceName)
      if (typeof record.scriptName !== 'string' || !SCRIPT_NAME_PATTERN.test(record.scriptName)) {
        invalid()
      }
      const result = await confirmRun.call(
        rawOptions,
        Object.freeze({ workspaceName, scriptName: record.scriptName }),
        signal
      )
      if (typeof result !== 'boolean') invalid()
      return result
    },
    startScript(workspace: WorkspaceIdentity, scriptName: string): PluginWorkspaceScriptProcess {
      if (
        !workspace ||
        typeof workspace !== 'object' ||
        !path.isAbsolute(workspace.root) ||
        typeof scriptName !== 'string' ||
        !SCRIPT_NAME_PATTERN.test(scriptName)
      ) {
        invalid()
      }
      assertWorkspaceIdentitySync(workspace)
      const packageManager = resolvePackageManager.call(rawOptions, platform, environment)
      const pathApi = platform === 'win32' ? path.win32 : path.posix
      if (
        typeof packageManager !== 'string' ||
        !pathApi.isAbsolute(packageManager) ||
        (platform === 'win32' &&
          (pathApi.basename(packageManager).toLowerCase() !== 'pnpm.cmd' ||
            /["%!*?&|<>()^\r\n\0]/.test(packageManager))) ||
        (platform !== 'win32' && /[\0\r\n]/.test(packageManager))
      ) {
        invalid()
      }
      const spawnOptions: PluginWorkspaceScriptSpawnOptions = Object.freeze({
        cwd: workspace.root,
        detached: false,
        env: environment,
        shell: false,
        stdio: Object.freeze(['ignore', 'ignore', 'ignore']) as readonly [
          'ignore',
          'ignore',
          'ignore'
        ],
        windowsHide: true,
        windowsVerbatimArguments: platform === 'win32'
      })
      const executable = platform === 'win32' ? windowsExecutable : packageManager
      const args =
        platform === 'win32'
          ? Object.freeze(['/d', '/s', '/c', `""${packageManager}" run ${scriptName}"`])
          : Object.freeze(['run', scriptName])
      const process = trustProcess(spawn.call(rawOptions, executable, args, spawnOptions))
      return trustProcess(
        Object.freeze({
          async started(): Promise<void> {
            await process.started()
            assertWorkspaceIdentitySync(workspace)
          },
          wait: () => process.wait(),
          kill: () => process.kill()
        })
      )
    }
  }) as TrustedPluginWorkspaceScriptHost
  TRUSTED_HOSTS.add(host)
  return host
}

function assertSignal(signal: AbortSignal): void {
  if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
}

async function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  assertSignal(signal)
  let dispose = (): void => undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    const onAbort = (): void =>
      reject(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED'))
    dispose = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  void operation.catch(() => undefined)
  try {
    return await Promise.race([operation, aborted])
  } finally {
    dispose()
  }
}

function sameCanonicalPath(left: string, right: string): boolean {
  if (process.platform === 'win32') return left.toLowerCase() === right.toLowerCase()
  return left === right
}

function sameFileIdentity(
  stats: { dev: number | bigint; ino: number | bigint },
  device: string,
  inode: string
): boolean {
  return String(stats.dev) === device && String(stats.ino) === inode
}

function assertWorkspaceIdentitySync(workspace: WorkspaceIdentity): void {
  try {
    const rootStats = lstatSync(workspace.root)
    const canonicalRoot = realpathSync(workspace.root)
    if (
      rootStats.isSymbolicLink() ||
      !rootStats.isDirectory() ||
      !sameCanonicalPath(canonicalRoot, workspace.root) ||
      !sameFileIdentity(rootStats, workspace.rootDevice, workspace.rootInode)
    ) {
      throw new WorkspaceValidationError('workspace-replaced')
    }
    const packageStats = lstatSync(workspace.packagePath)
    const canonicalPackage = realpathSync(workspace.packagePath)
    if (
      packageStats.isSymbolicLink() ||
      !packageStats.isFile() ||
      packageStats.size > PLUGIN_WORKSPACE_SCRIPT_MAX_PACKAGE_BYTES ||
      !sameCanonicalPath(canonicalPackage, workspace.packagePath) ||
      !sameFileIdentity(packageStats, workspace.packageDevice, workspace.packageInode)
    ) {
      throw new WorkspaceValidationError('package-replaced')
    }
  } catch (error) {
    if (error instanceof WorkspaceValidationError) throw error
    throw new WorkspaceValidationError('workspace-replaced')
  }
}

async function readBoundedFile(handle: Awaited<ReturnType<typeof fs.open>>): Promise<string> {
  const buffer = Buffer.allocUnsafe(PLUGIN_WORKSPACE_SCRIPT_MAX_PACKAGE_BYTES + 1)
  let offset = 0
  while (offset < buffer.length) {
    const result = await handle.read(buffer, offset, buffer.length - offset, offset)
    if (result.bytesRead === 0) break
    offset += result.bytesRead
  }
  if (offset > PLUGIN_WORKSPACE_SCRIPT_MAX_PACKAGE_BYTES) {
    throw new WorkspaceValidationError('package-invalid')
  }
  return buffer.subarray(0, offset).toString('utf8')
}

function parseScripts(value: string): ReadonlyMap<string, string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new WorkspaceValidationError('package-invalid')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WorkspaceValidationError('package-invalid')
  }
  const descriptor = Object.getOwnPropertyDescriptor(parsed, 'scripts')
  if (!descriptor || !('value' in descriptor) || !descriptor.value) return new Map()
  const scriptsValue = descriptor.value as unknown
  if (typeof scriptsValue !== 'object' || Array.isArray(scriptsValue)) {
    throw new WorkspaceValidationError('package-invalid')
  }
  const descriptors = Object.getOwnPropertyDescriptors(scriptsValue)
  const keys = Reflect.ownKeys(descriptors)
  if (keys.length > PLUGIN_WORKSPACE_SCRIPT_MAX_SCRIPTS) {
    throw new WorkspaceValidationError('package-invalid')
  }
  const scripts = new Map<string, string>()
  let totalBytes = 0
  for (const key of keys) {
    if (typeof key !== 'string') continue
    const script = descriptors[key]
    if (
      !SCRIPT_NAME_PATTERN.test(key) ||
      !script?.enumerable ||
      !('value' in script) ||
      typeof script.value !== 'string' ||
      script.value.length < 1
    ) {
      continue
    }
    totalBytes += Buffer.byteLength(key, 'utf8') + Buffer.byteLength(script.value, 'utf8')
    if (totalBytes > PLUGIN_WORKSPACE_SCRIPT_MAX_PACKAGE_BYTES) {
      throw new WorkspaceValidationError('package-invalid')
    }
    scripts.set(key, script.value)
  }
  return new Map([...scripts].sort(([left], [right]) => left.localeCompare(right)))
}

async function readPackageSnapshot(
  selectedRoot: string,
  expected?: WorkspaceIdentity
): Promise<PackageSnapshot> {
  const requestedRoot = path.resolve(selectedRoot)
  let rootStats: Awaited<ReturnType<typeof fs.lstat>>
  let canonicalRoot: string
  try {
    rootStats = await fs.lstat(requestedRoot)
    canonicalRoot = await fs.realpath(requestedRoot)
  } catch {
    throw new WorkspaceValidationError(expected ? 'workspace-replaced' : 'workspace-invalid')
  }
  if (
    rootStats.isSymbolicLink() ||
    !rootStats.isDirectory() ||
    !sameCanonicalPath(requestedRoot, canonicalRoot)
  ) {
    throw new WorkspaceValidationError(expected ? 'workspace-replaced' : 'workspace-invalid')
  }
  if (
    expected &&
    (!sameCanonicalPath(canonicalRoot, expected.root) ||
      !sameFileIdentity(rootStats, expected.rootDevice, expected.rootInode))
  ) {
    throw new WorkspaceValidationError('workspace-replaced')
  }

  const packagePath = path.join(canonicalRoot, 'package.json')
  let packageStats: Awaited<ReturnType<typeof fs.lstat>>
  let canonicalPackage: string
  try {
    packageStats = await fs.lstat(packagePath)
    canonicalPackage = await fs.realpath(packagePath)
  } catch {
    throw new WorkspaceValidationError(expected ? 'package-replaced' : 'workspace-invalid')
  }
  if (
    packageStats.isSymbolicLink() ||
    !packageStats.isFile() ||
    packageStats.size > PLUGIN_WORKSPACE_SCRIPT_MAX_PACKAGE_BYTES ||
    !sameCanonicalPath(packagePath, canonicalPackage)
  ) {
    throw new WorkspaceValidationError(expected ? 'package-replaced' : 'workspace-invalid')
  }
  if (
    expected &&
    (!sameCanonicalPath(canonicalPackage, expected.packagePath) ||
      !sameFileIdentity(packageStats, expected.packageDevice, expected.packageInode))
  ) {
    throw new WorkspaceValidationError('package-replaced')
  }

  let handle: Awaited<ReturnType<typeof fs.open>> | null = null
  try {
    handle = await fs.open(canonicalPackage, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const before = await handle.stat()
    if (!sameFileIdentity(before, String(packageStats.dev), String(packageStats.ino))) {
      throw new WorkspaceValidationError(expected ? 'package-replaced' : 'workspace-invalid')
    }
    const content = await readBoundedFile(handle)
    const after = await handle.stat()
    if (
      !sameFileIdentity(after, String(packageStats.dev), String(packageStats.ino)) ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    ) {
      throw new WorkspaceValidationError(expected ? 'package-replaced' : 'workspace-invalid')
    }
    const [finalRootStats, finalCanonicalRoot, finalPackageStats, finalCanonicalPackage] =
      await Promise.all([
        fs.lstat(canonicalRoot),
        fs.realpath(canonicalRoot),
        fs.lstat(canonicalPackage),
        fs.realpath(canonicalPackage)
      ])
    if (
      finalRootStats.isSymbolicLink() ||
      !finalRootStats.isDirectory() ||
      !sameCanonicalPath(finalCanonicalRoot, canonicalRoot) ||
      !sameFileIdentity(finalRootStats, String(rootStats.dev), String(rootStats.ino))
    ) {
      throw new WorkspaceValidationError(expected ? 'workspace-replaced' : 'workspace-invalid')
    }
    if (
      finalPackageStats.isSymbolicLink() ||
      !finalPackageStats.isFile() ||
      !sameCanonicalPath(finalCanonicalPackage, canonicalPackage) ||
      !sameFileIdentity(finalPackageStats, String(packageStats.dev), String(packageStats.ino))
    ) {
      throw new WorkspaceValidationError(expected ? 'package-replaced' : 'workspace-invalid')
    }
    const identity = Object.freeze({
      root: canonicalRoot,
      rootDevice: String(rootStats.dev),
      rootInode: String(rootStats.ino),
      packagePath: canonicalPackage,
      packageDevice: String(packageStats.dev),
      packageInode: String(packageStats.ino),
      displayName: boundedDisplayName(path.basename(canonicalRoot))
    })
    return Object.freeze({ identity, scripts: parseScripts(content) })
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

function scriptDigest(name: string, command: string): string {
  return createHash('sha256').update(name).update('\0').update(command).digest('hex')
}

export function createPluginWorkspaceScriptCapabilities(
  rawOptions: PluginWorkspaceScriptCapabilitiesOptions
): PluginWorkspaceScriptCapabilities {
  const options = exactRecord(rawOptions, [
    'activation',
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeRead',
    'authorizeShell',
    'watchReadPermissionRevoked',
    'watchShellPermissionRevoked',
    'host'
  ])
  if (
    typeof options.resolveCurrentActivation !== 'function' ||
    utilTypes.isProxy(options.resolveCurrentActivation) ||
    typeof options.resolveHostGeneration !== 'function' ||
    utilTypes.isProxy(options.resolveHostGeneration) ||
    typeof options.authorizeRead !== 'function' ||
    utilTypes.isProxy(options.authorizeRead) ||
    typeof options.authorizeShell !== 'function' ||
    utilTypes.isProxy(options.authorizeShell) ||
    typeof options.watchReadPermissionRevoked !== 'function' ||
    utilTypes.isProxy(options.watchReadPermissionRevoked) ||
    typeof options.watchShellPermissionRevoked !== 'function' ||
    utilTypes.isProxy(options.watchShellPermissionRevoked) ||
    !options.host ||
    typeof options.host !== 'object' ||
    !TRUSTED_HOSTS.has(options.host)
  ) {
    invalid()
  }
  const expectedActivation = snapshotActivation(options.activation)
  if (expectedActivation.name !== 'touch-workspace-scripts') invalid()
  const resolveCurrentActivation =
    options.resolveCurrentActivation as PluginWorkspaceScriptCapabilitiesOptions['resolveCurrentActivation']
  const resolveHostGeneration =
    options.resolveHostGeneration as PluginWorkspaceScriptCapabilitiesOptions['resolveHostGeneration']
  const authorizeRead =
    options.authorizeRead as PluginWorkspaceScriptCapabilitiesOptions['authorizeRead']
  const authorizeShell =
    options.authorizeShell as PluginWorkspaceScriptCapabilitiesOptions['authorizeShell']
  const watchReadPermissionRevoked =
    options.watchReadPermissionRevoked as PluginWorkspaceScriptCapabilitiesOptions['watchReadPermissionRevoked']
  const watchShellPermissionRevoked =
    options.watchShellPermissionRevoked as PluginWorkspaceScriptCapabilitiesOptions['watchShellPermissionRevoked']
  const host = options.host as TrustedPluginWorkspaceScriptHost
  const selectWorkspace = dataMethod<TrustedPluginWorkspaceScriptHost['selectWorkspace']>(
    host,
    'selectWorkspace'
  )
  const confirmRun = dataMethod<TrustedPluginWorkspaceScriptHost['confirmRun']>(host, 'confirmRun')
  const startScript = dataMethod<TrustedPluginWorkspaceScriptHost['startScript']>(
    host,
    'startScript'
  )

  const workspaceTokens = new Map<string, WorkspaceTokenRecord>()
  const scriptTokens = new Map<string, ScriptTokenRecord>()
  const retiredTokens = new Map<string, number>()
  const owned = new Set<OwnedProcess>()
  const operationIdleWaiters = new Set<() => void>()
  const lifecycleAbort = new AbortController()
  let workspaceEpoch = 0
  let scriptEpoch = 0
  let activeOperations = 0
  let closed = false
  let permissionAvailable = true
  let closePromise: Promise<void> | null = null
  const permissionDisposers: Array<() => void> = []

  const trimRetired = (): void => {
    while (retiredTokens.size > 2048) {
      const oldest = retiredTokens.keys().next().value
      if (typeof oldest !== 'string') break
      retiredTokens.delete(oldest)
    }
  }
  const retire = (token: string): void => {
    retiredTokens.set(token, Date.now())
    trimRetired()
  }
  const retireScripts = (): void => {
    for (const token of scriptTokens.keys()) retire(token)
    scriptTokens.clear()
  }
  const retireAll = (): void => {
    for (const token of workspaceTokens.keys()) retire(token)
    workspaceTokens.clear()
    retireScripts()
  }
  const terminateAll = async (): Promise<void> => {
    const results = await Promise.allSettled([...owned].map((record) => record.terminate()))
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('PLUGIN_WORKSPACE_SCRIPT_TEARDOWN_FAILED')
    }
  }
  const revoke = (): void => {
    lifecycleAbort.abort()
    retireAll()
    void terminateAll().catch(() => undefined)
  }

  try {
    const readDisposer = watchReadPermissionRevoked.call(
      rawOptions,
      expectedActivation.name,
      revoke
    )
    if (typeof readDisposer !== 'function' || utilTypes.isProxy(readDisposer)) invalid()
    permissionDisposers.push(readDisposer)
    const shellDisposer = watchShellPermissionRevoked.call(
      rawOptions,
      expectedActivation.name,
      revoke
    )
    if (typeof shellDisposer !== 'function' || utilTypes.isProxy(shellDisposer)) invalid()
    permissionDisposers.push(shellDisposer)
  } catch {
    permissionAvailable = false
    for (const dispose of permissionDisposers.splice(0)) {
      try {
        dispose()
      } catch {
        // Construction remains fail closed.
      }
    }
  }

  const beginOperation = (): (() => void) => {
    if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
    activeOperations += 1
    let finished = false
    return () => {
      if (finished) return
      finished = true
      activeOperations -= 1
      if (activeOperations !== 0) return
      for (const resolve of operationIdleWaiters) resolve()
      operationIdleWaiters.clear()
    }
  }
  const waitForOperationsIdle = (): Promise<void> => {
    if (activeOperations === 0) return Promise.resolve()
    return new Promise((resolve) => operationIdleWaiters.add(resolve))
  }
  const assertAuthority = (context: PluginSecurityContext): number => {
    if (!isAuthoritativePluginContext(context)) invalid()
    const identity = context.identity
    if (
      identity.authority !== 'plugin-host' ||
      identity.pluginName !== expectedActivation.name ||
      context.name !== expectedActivation.name ||
      identity.pluginInstanceId !== expectedActivation.pluginInstanceId ||
      identity.activationGeneration !== expectedActivation.activationGeneration ||
      context.uniqueKey !== expectedActivation.key ||
      !Number.isSafeInteger(identity.hostGeneration) ||
      Number(identity.hostGeneration) < 1
    ) {
      invalid()
    }
    const current = resolveCurrentActivation.call(rawOptions, expectedActivation.name)
    if (
      !current ||
      !sameActivation(snapshotActivation(current), expectedActivation) ||
      resolveHostGeneration.call(rawOptions, expectedActivation) !== identity.hostGeneration
    ) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
    return Number(identity.hostGeneration)
  }
  const permission = (kind: 'read' | 'shell'): 'allowed' | 'denied' | 'unavailable' => {
    if (!permissionAvailable) return 'unavailable'
    try {
      const result =
        kind === 'read'
          ? authorizeRead.call(rawOptions, expectedActivation.name)
          : authorizeShell.call(rawOptions, expectedActivation.name)
      return typeof result !== 'boolean' ? 'unavailable' : result ? 'allowed' : 'denied'
    } catch {
      return 'unavailable'
    }
  }
  const assertPermissions = (run: boolean): void => {
    const decisions = [permission('read'), ...(run ? [permission('shell')] : [])]
    if (decisions.includes('unavailable')) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    }
    if (decisions.includes('denied')) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    }
  }
  const assertAdmission = (
    context: PluginSecurityContext,
    signal: AbortSignal,
    run = false
  ): void => {
    assertSignal(signal)
    assertSignal(lifecycleAbort.signal)
    assertAuthority(context)
    if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
    assertPermissions(run)
  }
  const linkedSignal = (signal: AbortSignal): { signal: AbortSignal; dispose(): void } => {
    const controller = new AbortController()
    const abort = (): void => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    lifecycleAbort.signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted || lifecycleAbort.signal.aborted) abort()
    return {
      signal: controller.signal,
      dispose() {
        signal.removeEventListener('abort', abort)
        lifecycleAbort.signal.removeEventListener('abort', abort)
      }
    }
  }
  const createToken = (prefix: 'ws_' | 'wss_'): string => {
    let token = ''
    do {
      token = `${prefix}${randomBytes(24).toString('base64url')}`
    } while (workspaceTokens.has(token) || scriptTokens.has(token) || retiredTokens.has(token))
    return token
  }
  const issueWorkspace = (workspace: WorkspaceIdentity): WorkspaceDisplay => {
    const token = createToken('ws_')
    workspaceTokens.set(token, {
      epoch: workspaceEpoch,
      expiresAt: Date.now() + PLUGIN_WORKSPACE_TOKEN_TTL_MS,
      remainingUses: PLUGIN_WORKSPACE_TOKEN_MAX_USES,
      workspace
    })
    return Object.freeze({ token, name: workspace.displayName })
  }
  const useWorkspace = (
    token: string
  ): { workspace?: WorkspaceIdentity; reason?: WorkspaceTokenFailure } => {
    if (retiredTokens.has(token)) return Object.freeze({ reason: 'token-replayed' })
    const record = workspaceTokens.get(token)
    if (!record) return Object.freeze({ reason: 'token-invalid' })
    if (record.epoch !== workspaceEpoch) {
      workspaceTokens.delete(token)
      retire(token)
      return Object.freeze({ reason: 'token-replayed' })
    }
    if (Date.now() >= record.expiresAt) {
      workspaceTokens.delete(token)
      retire(token)
      return Object.freeze({ reason: 'token-expired' })
    }
    record.remainingUses -= 1
    if (record.remainingUses <= 0) {
      workspaceTokens.delete(token)
      retire(token)
    }
    return Object.freeze({ workspace: record.workspace })
  }
  const consumeScript = (
    token: string
  ): { record?: ScriptTokenRecord; reason?: ScriptTokenFailure } => {
    if (retiredTokens.has(token)) return Object.freeze({ reason: 'token-replayed' })
    const record = scriptTokens.get(token)
    if (!record) return Object.freeze({ reason: 'token-invalid' })
    scriptTokens.delete(token)
    retire(token)
    if (record.epoch !== scriptEpoch) return Object.freeze({ reason: 'token-replayed' })
    if (Date.now() >= record.expiresAt) return Object.freeze({ reason: 'token-expired' })
    return Object.freeze({ record })
  }
  const ownProcess = (
    process: PluginWorkspaceScriptProcess,
    context: PluginSecurityContext
  ): OwnedProcess => {
    let exited = false
    let terminatePromise: Promise<void> | null = null
    const wait = Promise.resolve()
      .then(() => process.wait())
      .then((value) => {
        const exit = snapshotExit(value)
        exited = true
        assertAuthority(context)
        return exit
      })
    void wait.catch(() => undefined)
    const record: OwnedProcess = {
      wait,
      terminate(): Promise<void> {
        if (terminatePromise) return terminatePromise
        terminatePromise = Promise.resolve().then(async () => {
          if (!exited) {
            try {
              await process.kill()
            } catch {
              // The real exit event below remains the barrier.
            }
          }
          await wait.catch(() => undefined)
        })
        return terminatePromise
      }
    }
    owned.add(record)
    void wait.finally(() => owned.delete(record)).catch(() => undefined)
    return record
  }

  const definition: PluginHostCapabilityDefinition = Object.freeze({
    id: 'process.workspace-scripts',
    permission: 'fs.read',
    timeoutMs: PLUGIN_WORKSPACE_SCRIPT_TIMEOUT_MS,
    maxConcurrency: 1,
    callbackLifetime: 'transient',
    callbackFields: Object.freeze([]),
    validateRequest,
    validateResult,
    async invoke(context, request, signal) {
      const normalized = request as WorkspaceScriptRequest
      assertAdmission(context, signal)
      if (normalized.operation === 'run-script') {
        const shellPermission = permission('shell')
        if (shellPermission !== 'allowed') {
          return Object.freeze({
            operation: 'run-script',
            status: 'blocked',
            reason: shellPermission === 'denied' ? 'permission-denied' : 'permission-unavailable'
          })
        }
      }
      const finishOperation = beginOperation()
      const linked = linkedSignal(signal)
      try {
        if (normalized.operation === 'select-workspace') {
          let selected: string | null
          try {
            selected = await awaitWithAbort(
              Promise.resolve().then(() => selectWorkspace.call(host, linked.signal)),
              linked.signal
            )
          } catch (error) {
            if (error instanceof PluginHostCapabilityError) throw error
            return Object.freeze({
              operation: 'select-workspace',
              status: 'failed',
              reason: 'selection-failed'
            })
          }
          assertAdmission(context, linked.signal)
          if (selected === null) {
            return Object.freeze({ operation: 'select-workspace', status: 'cancelled' })
          }
          let snapshot: PackageSnapshot
          try {
            snapshot = await readPackageSnapshot(selected)
          } catch {
            return Object.freeze({
              operation: 'select-workspace',
              status: 'failed',
              reason: 'workspace-invalid'
            })
          }
          assertAdmission(context, linked.signal)
          workspaceEpoch += 1
          scriptEpoch += 1
          retireAll()
          return Object.freeze({
            operation: 'select-workspace',
            status: 'selected',
            workspace: issueWorkspace(snapshot.identity)
          })
        }

        if (normalized.operation === 'list-scripts') {
          const used = useWorkspace(normalized.workspaceToken)
          if (!used.workspace) {
            return Object.freeze({
              operation: 'list-scripts',
              status: 'blocked',
              reason: used.reason ?? 'token-invalid'
            })
          }
          let snapshot: PackageSnapshot
          try {
            snapshot = await readPackageSnapshot(used.workspace.root, used.workspace)
          } catch (error) {
            const reason =
              error instanceof WorkspaceValidationError && error.code === 'workspace-replaced'
                ? 'workspace-replaced'
                : 'package-replaced'
            return Object.freeze({ operation: 'list-scripts', status: 'blocked', reason })
          }
          assertAdmission(context, linked.signal)
          scriptEpoch += 1
          retireScripts()
          const epoch = scriptEpoch
          const scripts = Object.freeze(
            [...snapshot.scripts].map(([scriptName, command]) => {
              const token = createToken('wss_')
              scriptTokens.set(
                token,
                Object.freeze({
                  epoch,
                  expiresAt: Date.now() + PLUGIN_WORKSPACE_SCRIPT_TOKEN_TTL_MS,
                  workspace: snapshot.identity,
                  scriptName,
                  scriptDigest: scriptDigest(scriptName, command)
                })
              )
              return Object.freeze({ token, name: scriptName })
            })
          )
          return Object.freeze({
            operation: 'list-scripts',
            status: 'available',
            workspace: Object.freeze({
              token: normalized.workspaceToken,
              name: snapshot.identity.displayName
            }),
            scripts
          })
        }

        const consumed = consumeScript(normalized.scriptToken)
        if (!consumed.record) {
          return Object.freeze({
            operation: 'run-script',
            status: 'blocked',
            reason: consumed.reason ?? 'token-invalid'
          })
        }
        const tokenRecord = consumed.record
        let snapshot: PackageSnapshot
        try {
          snapshot = await readPackageSnapshot(tokenRecord.workspace.root, tokenRecord.workspace)
        } catch (error) {
          const reason =
            error instanceof WorkspaceValidationError && error.code === 'workspace-replaced'
              ? 'workspace-replaced'
              : 'package-replaced'
          return Object.freeze({ operation: 'run-script', status: 'blocked', reason })
        }
        const currentCommand = snapshot.scripts.get(tokenRecord.scriptName)
        if (
          typeof currentCommand !== 'string' ||
          scriptDigest(tokenRecord.scriptName, currentCommand) !== tokenRecord.scriptDigest
        ) {
          return Object.freeze({
            operation: 'run-script',
            status: 'blocked',
            reason: 'script-changed'
          })
        }
        assertAdmission(context, linked.signal, true)
        let confirmed: boolean
        try {
          confirmed = await awaitWithAbort(
            Promise.resolve().then(() =>
              confirmRun.call(
                host,
                Object.freeze({
                  workspaceName: snapshot.identity.displayName,
                  scriptName: tokenRecord.scriptName
                }),
                linked.signal
              )
            ),
            linked.signal
          )
        } catch (error) {
          if (error instanceof PluginHostCapabilityError) throw error
          return Object.freeze({
            operation: 'run-script',
            status: 'failed',
            reason: 'confirmation-unavailable'
          })
        }
        if (!confirmed) {
          return Object.freeze({
            operation: 'run-script',
            status: 'blocked',
            reason: 'confirmation-denied'
          })
        }
        assertAdmission(context, linked.signal, true)
        let revalidated: PackageSnapshot
        try {
          revalidated = await readPackageSnapshot(tokenRecord.workspace.root, tokenRecord.workspace)
        } catch (error) {
          const reason =
            error instanceof WorkspaceValidationError && error.code === 'workspace-replaced'
              ? 'workspace-replaced'
              : 'package-replaced'
          return Object.freeze({ operation: 'run-script', status: 'blocked', reason })
        }
        const revalidatedCommand = revalidated.scripts.get(tokenRecord.scriptName)
        if (
          typeof revalidatedCommand !== 'string' ||
          scriptDigest(tokenRecord.scriptName, revalidatedCommand) !== tokenRecord.scriptDigest
        ) {
          return Object.freeze({
            operation: 'run-script',
            status: 'blocked',
            reason: 'script-changed'
          })
        }
        if (owned.size >= PLUGIN_WORKSPACE_SCRIPT_MAX_PROCESSES) {
          return Object.freeze({
            operation: 'run-script',
            status: 'blocked',
            reason: 'process-limit'
          })
        }
        let process: PluginWorkspaceScriptProcess
        try {
          process = snapshotProcess(
            startScript.call(host, revalidated.identity, tokenRecord.scriptName)
          )
        } catch (error) {
          if (error instanceof WorkspaceValidationError) {
            return Object.freeze({
              operation: 'run-script',
              status: 'blocked',
              reason:
                error.code === 'workspace-replaced' ? 'workspace-replaced' : 'package-replaced'
            })
          }
          return Object.freeze({
            operation: 'run-script',
            status: 'failed',
            reason: 'execution-failed'
          })
        }
        const ownedProcess = ownProcess(process, context)
        try {
          await awaitWithAbort(
            Promise.resolve().then(() => process.started()),
            linked.signal
          )
          assertAdmission(context, linked.signal, true)
          return Object.freeze({
            operation: 'run-script',
            status: 'started',
            scriptName: tokenRecord.scriptName
          })
        } catch (error) {
          await ownedProcess.terminate()
          if (error instanceof PluginHostCapabilityError) throw error
          if (error instanceof WorkspaceValidationError) {
            return Object.freeze({
              operation: 'run-script',
              status: 'blocked',
              reason:
                error.code === 'workspace-replaced' ? 'workspace-replaced' : 'package-replaced'
            })
          }
          return Object.freeze({
            operation: 'run-script',
            status: 'failed',
            reason: 'execution-failed'
          })
        }
      } finally {
        linked.dispose()
        finishOperation()
      }
    }
  })

  return Object.freeze({
    definitions: Object.freeze([definition]),
    close(): Promise<void> {
      if (closePromise) return closePromise
      closed = true
      lifecycleAbort.abort()
      retireAll()
      for (const dispose of permissionDisposers.splice(0)) {
        try {
          dispose()
        } catch {
          // Activation authority is already closed.
        }
      }
      closePromise = (async () => {
        await terminateAll()
        await waitForOperationsIdle()
        await terminateAll()
      })()
      return closePromise
    }
  })
}

export function createPluginWorkspaceScriptProcess(
  child: ChildProcess
): PluginWorkspaceScriptProcess {
  let spawned = typeof child.pid === 'number'
  let settled = false
  let killRequested = false
  let killRequestError: Error | null = null
  let killPromise: Promise<void> | null = null
  let resolveStarted!: () => void
  let rejectStarted!: (error: Error) => void
  let resolveExit!: (exit: PluginWorkspaceScriptProcessExit) => void
  let rejectExit!: (error: Error) => void
  const started = new Promise<void>((resolve, reject) => {
    resolveStarted = resolve
    rejectStarted = reject
  })
  const exit = new Promise<PluginWorkspaceScriptProcessExit>((resolve, reject) => {
    resolveExit = resolve
    rejectExit = reject
  })
  const cleanup = (): void => {
    child.removeListener('spawn', onSpawn)
    child.removeListener('error', onError)
    child.removeListener('exit', onExit)
  }
  const failSpawn = (): void => {
    if (settled) return
    settled = true
    cleanup()
    const error = new Error('PLUGIN_WORKSPACE_SCRIPT_PROCESS_SPAWN_FAILED')
    rejectStarted(error)
    rejectExit(error)
  }
  const onSpawn = (): void => {
    if (settled) return
    spawned = true
    resolveStarted()
  }
  const onError = (): void => {
    if (!spawned) failSpawn()
  }
  const requestKill = (): void => {
    if (settled || killRequested) return
    killRequested = true
    try {
      if (child.kill() !== true) {
        killRequestError = new Error('PLUGIN_WORKSPACE_SCRIPT_PROCESS_KILL_FAILED')
      }
    } catch {
      killRequestError = new Error('PLUGIN_WORKSPACE_SCRIPT_PROCESS_KILL_FAILED')
    }
  }
  const onExit = (code: number | null): void => {
    if (settled) return
    settled = true
    cleanup()
    if (!spawned) {
      const error = new Error('PLUGIN_WORKSPACE_SCRIPT_PROCESS_SPAWN_FAILED')
      rejectStarted(error)
      rejectExit(error)
      return
    }
    resolveExit(Object.freeze({ code: Number.isSafeInteger(code) ? Number(code) : null }))
  }
  child.once('spawn', onSpawn)
  child.once('error', onError)
  child.once('exit', onExit)
  if (spawned) resolveStarted()
  void started.catch(() => undefined)
  void exit.catch(() => undefined)

  return trustProcess(
    Object.freeze({
      started: () => started,
      wait: () => exit,
      kill: (): Promise<void> => {
        if (killPromise) return killPromise
        killPromise = Promise.resolve().then(async () => {
          requestKill()
          let exitError: unknown
          try {
            await exit
          } catch (error) {
            exitError = error
          }
          if (killRequestError) throw killRequestError
          if (exitError) throw exitError
        })
        return killPromise
      }
    })
  )
}
