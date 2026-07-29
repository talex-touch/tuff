import type { ChildProcess } from 'node:child_process'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import path from 'node:path'
import { types as utilTypes } from 'node:util'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'

export const PLUGIN_SNIPASTE_ACTION_IDS = Object.freeze([
  'launch',
  'snip',
  'snip-full',
  'paste',
  'pick-color',
  'toggle-images',
  'docs'
] as const)

export type PluginSnipasteActionId = (typeof PLUGIN_SNIPASTE_ACTION_IDS)[number]

export const PLUGIN_SNIPASTE_PROCESS_TIMEOUT_MS = 15_000
export const PLUGIN_SNIPASTE_MAX_PROCESSES = 2

export interface PluginSnipasteProcessExit {
  readonly code: number | null
}

export interface PluginSnipasteProcess {
  started(): Promise<void>
  wait(): Promise<PluginSnipasteProcessExit>
  kill(): void | Promise<void>
}

export interface PluginSnipasteDiscovery {
  discover(signal: AbortSignal): Promise<string | null>
}

declare const TRUSTED_SNIPASTE_DISCOVERY_TYPE: unique symbol

interface TrustedPluginSnipasteDiscovery extends PluginSnipasteDiscovery {
  readonly [TRUSTED_SNIPASTE_DISCOVERY_TYPE]: true
}

export interface PluginSnipasteExecutor {
  start(executable: string, actionId: PluginSnipasteActionId): PluginSnipasteProcess
}

export interface PluginSnipasteProcessCapabilityOptions {
  readonly activation: PluginActivationIdentity
  readonly platform: NodeJS.Platform
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  authorizeShell(pluginName: string): boolean
  watchShellPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  readonly discovery: TrustedPluginSnipasteDiscovery
  readonly executor: PluginSnipasteExecutor
}

export interface PluginSnipasteProcessCapability {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  close(): Promise<void>
}

export type PluginSnipasteFileKind = 'directory' | 'file' | 'missing' | 'other' | 'symlink'

export interface PluginSnipasteDiscoveryFileSystem {
  kind(target: string): Promise<PluginSnipasteFileKind>
  realpath(target: string): Promise<string>
}

export interface FixedPluginSnipasteDiscoveryOptions {
  readonly platform: NodeJS.Platform
  readonly homeDirectory?: string
  readonly fileSystem: PluginSnipasteDiscoveryFileSystem
}

export interface PluginSnipasteSpawnOptions {
  readonly cwd: string
  readonly detached: false
  readonly env: Readonly<Record<string, string>>
  readonly shell: false
  readonly stdio: 'ignore'
  readonly windowsHide: true
}

export interface FixedPluginSnipasteExecutorOptions {
  readonly platform: NodeJS.Platform
  readonly environment: Readonly<Record<string, string | undefined>>
  spawn(
    executable: string,
    args: readonly string[],
    options: PluginSnipasteSpawnOptions
  ): PluginSnipasteProcess
}

type SnipasteRequest = {
  readonly operation: 'snipaste-action'
  readonly actionId: PluginSnipasteActionId
}

type SnipasteResult =
  | { readonly actionId: PluginSnipasteActionId; readonly status: 'started' }
  | {
      readonly actionId: PluginSnipasteActionId
      readonly status: 'blocked'
      readonly reason:
        | 'not-installed'
        | 'permission-denied'
        | 'permission-unavailable'
        | 'platform-unsupported'
    }
  | {
      readonly actionId: PluginSnipasteActionId
      readonly status: 'failed'
      readonly reason: 'spawn-failed'
    }

interface DiscoveryCandidate {
  readonly executable: string
  readonly root: string
}

interface OwnedProcess {
  readonly process: PluginSnipasteProcess
  readonly terminate: () => Promise<void>
  readonly wait: Promise<PluginSnipasteProcessExit>
}

const ACTION_ARGUMENTS: Readonly<Record<PluginSnipasteActionId, readonly string[]>> = Object.freeze(
  {
    launch: Object.freeze([]),
    snip: Object.freeze(['snip']),
    'snip-full': Object.freeze(['snip', '--full', '-o', 'clipboard']),
    paste: Object.freeze(['paste']),
    'pick-color': Object.freeze(['pick-color']),
    'toggle-images': Object.freeze(['toggle-images']),
    docs: Object.freeze(['docs'])
  }
)

const ENVIRONMENT_KEYS: Readonly<Record<'darwin' | 'linux' | 'win32', readonly string[]>> =
  Object.freeze({
    darwin: Object.freeze(['HOME', 'LANG', 'LC_ALL', 'TMPDIR']),
    linux: Object.freeze([
      'DBUS_SESSION_BUS_ADDRESS',
      'DISPLAY',
      'HOME',
      'LANG',
      'LC_ALL',
      'WAYLAND_DISPLAY',
      'XDG_RUNTIME_DIR'
    ]),
    win32: Object.freeze(['SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'WINDIR'])
  })

function invalid(): never {
  throw new TypeError('PLUGIN_SNIPASTE_PROCESS_INVALID')
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

function dataMethod<T extends (...args: never[]) => unknown>(value: unknown, key: string): T {
  const record = exactRecord(value, [key])
  const method = record[key]
  if (typeof method !== 'function' || utilTypes.isProxy(method)) invalid()
  return method as T
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

function isActionId(value: unknown): value is PluginSnipasteActionId {
  return (
    typeof value === 'string' &&
    PLUGIN_SNIPASTE_ACTION_IDS.includes(value as PluginSnipasteActionId)
  )
}

function validateRequest(value: unknown): SnipasteRequest {
  const record = exactRecord(value, ['operation', 'actionId'])
  if (record.operation !== 'snipaste-action' || !isActionId(record.actionId)) invalid()
  return Object.freeze({ operation: 'snipaste-action', actionId: record.actionId })
}

function validateResult(value: unknown): SnipasteResult {
  const record = exactRecord(value, ['actionId', 'status', 'reason'], ['actionId', 'status'])
  const hasReason = Object.hasOwn(record, 'reason')
  if (!isActionId(record.actionId)) invalid()
  if (record.status === 'started' && !hasReason) {
    return Object.freeze({ actionId: record.actionId, status: 'started' })
  }
  if (
    record.status === 'blocked' &&
    (record.reason === 'not-installed' ||
      record.reason === 'permission-denied' ||
      record.reason === 'permission-unavailable' ||
      record.reason === 'platform-unsupported')
  ) {
    return Object.freeze({
      actionId: record.actionId,
      status: 'blocked',
      reason: record.reason
    })
  }
  if (record.status === 'failed' && record.reason === 'spawn-failed') {
    return Object.freeze({ actionId: record.actionId, status: 'failed', reason: 'spawn-failed' })
  }
  invalid()
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

// Factory identity is the runtime signature; structural copies and proxies are untrusted.
const TRUSTED_SNIPASTE_DISCOVERIES = new WeakSet<object>()
const TRUSTED_SNIPASTE_EXECUTORS = new WeakSet<object>()
const TRUSTED_SNIPASTE_PROCESSES = new WeakSet<object>()

function snapshotProcessShape(value: unknown): PluginSnipasteProcess {
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
  const started = record.started as PluginSnipasteProcess['started']
  const wait = record.wait as PluginSnipasteProcess['wait']
  const kill = record.kill as PluginSnipasteProcess['kill']
  return Object.freeze({
    started: () => started.call(value),
    wait: () => wait.call(value),
    kill: () => kill.call(value)
  })
}

function trustProcess(value: unknown): PluginSnipasteProcess {
  const process = snapshotProcessShape(value)
  TRUSTED_SNIPASTE_PROCESSES.add(process)
  return process
}

function snapshotProcess(value: unknown): PluginSnipasteProcess {
  if (!value || typeof value !== 'object' || !TRUSTED_SNIPASTE_PROCESSES.has(value)) invalid()
  return value as PluginSnipasteProcess
}

function snapshotExit(value: unknown): PluginSnipasteProcessExit {
  const record = exactRecord(value, ['code'])
  if (record.code !== null && !Number.isSafeInteger(record.code)) invalid()
  return Object.freeze({ code: record.code === null ? null : Number(record.code) })
}

function platformPath(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix
}

function safeAbsolutePath(value: unknown, platform: NodeJS.Platform): string | null {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 4096 ||
    /[\0\r\n]/.test(value)
  ) {
    return null
  }
  const paths = platformPath(platform)
  if (!paths.isAbsolute(value) || paths.normalize(value) !== value) return null
  return value
}

function discoveryCandidates(
  platform: NodeJS.Platform,
  homeDirectory?: string
): readonly DiscoveryCandidate[] {
  const candidates: DiscoveryCandidate[] = []
  const home = safeAbsolutePath(homeDirectory, platform)
  if (platform === 'darwin') {
    candidates.push({
      root: '/Applications',
      executable: '/Applications/Snipaste.app/Contents/MacOS/Snipaste'
    })
    if (home) {
      const root = path.posix.join(home, 'Applications')
      candidates.push({
        root,
        executable: path.posix.join(root, 'Snipaste.app', 'Contents', 'MacOS', 'Snipaste')
      })
    }
  } else if (platform === 'win32') {
    for (const root of ['C:\\Program Files', 'C:\\Program Files (x86)']) {
      candidates.push({ root, executable: path.win32.join(root, 'Snipaste', 'Snipaste.exe') })
    }
    if (home) {
      const root = path.win32.join(home, 'Applications')
      candidates.push({ root, executable: path.win32.join(root, 'Snipaste', 'Snipaste.exe') })
    }
  } else if (platform === 'linux') {
    candidates.push(
      { root: '/opt/Snipaste', executable: '/opt/Snipaste/Snipaste.AppImage' },
      { root: '/usr/bin', executable: '/usr/bin/snipaste' },
      { root: '/usr/local/bin', executable: '/usr/local/bin/snipaste' }
    )
    if (home) {
      const root = path.posix.join(home, 'Applications')
      candidates.push({ root, executable: path.posix.join(root, 'Snipaste.AppImage') })
    }
  }
  return Object.freeze(
    candidates.map((candidate) =>
      Object.freeze({ root: candidate.root, executable: candidate.executable })
    )
  )
}

function normalizeCanonical(value: string, platform: NodeJS.Platform): string {
  const normalized = platformPath(platform).normalize(value)
  if (platform !== 'win32') return normalized
  return normalized.replace(/^\\\\\?\\/, '').toLowerCase()
}

function isContained(root: string, target: string, platform: NodeJS.Platform): boolean {
  const paths = platformPath(platform)
  const relative = paths.relative(root, target)
  return relative !== '' && !relative.startsWith('..') && !paths.isAbsolute(relative)
}

function snapshotEnvironment(
  value: unknown,
  platform: NodeJS.Platform
): Readonly<Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalid()
  }
  let descriptors: PropertyDescriptorMap
  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalid()
  }
  const platformKeys =
    platform === 'darwin' || platform === 'linux' || platform === 'win32'
      ? ENVIRONMENT_KEYS[platform]
      : []
  const allowed = new Set<string>(platformKeys)
  const environment: Record<string, string> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key]
    if (typeof key !== 'string' || !descriptor?.enumerable || !('value' in descriptor)) invalid()
    if (!allowed.has(key) || descriptor.value === undefined) continue
    if (
      typeof descriptor.value !== 'string' ||
      descriptor.value.length > 4096 ||
      /[\0\r\n]/.test(descriptor.value)
    ) {
      invalid()
    }
    environment[key] = descriptor.value
  }
  return Object.freeze(environment)
}

export function createFixedPluginSnipasteDiscovery(
  rawOptions: FixedPluginSnipasteDiscoveryOptions
): TrustedPluginSnipasteDiscovery {
  const options = exactRecord(
    rawOptions,
    ['platform', 'homeDirectory', 'fileSystem'],
    ['platform', 'fileSystem']
  )
  if (
    typeof options.platform !== 'string' ||
    (options.homeDirectory !== undefined && typeof options.homeDirectory !== 'string')
  ) {
    invalid()
  }
  const platform = options.platform as NodeJS.Platform
  const fileSystem = exactRecord(options.fileSystem, ['kind', 'realpath'])
  if (
    typeof fileSystem.kind !== 'function' ||
    utilTypes.isProxy(fileSystem.kind) ||
    typeof fileSystem.realpath !== 'function' ||
    utilTypes.isProxy(fileSystem.realpath)
  ) {
    invalid()
  }
  const kind = fileSystem.kind as PluginSnipasteDiscoveryFileSystem['kind']
  const realpath = fileSystem.realpath as PluginSnipasteDiscoveryFileSystem['realpath']
  const candidates = discoveryCandidates(platform, options.homeDirectory as string | undefined)
  const fileSystemOwner = options.fileSystem

  const discovery = Object.freeze({
    async discover(signal: AbortSignal): Promise<string | null> {
      assertSignal(signal)
      for (const candidate of candidates) {
        assertSignal(signal)
        try {
          const rootKind = await kind.call(fileSystemOwner, candidate.root)
          assertSignal(signal)
          if (rootKind !== 'directory') continue
          const canonicalRoot = await realpath.call(fileSystemOwner, candidate.root)
          assertSignal(signal)
          if (
            typeof canonicalRoot !== 'string' ||
            normalizeCanonical(canonicalRoot, platform) !==
              normalizeCanonical(candidate.root, platform)
          ) {
            continue
          }

          const executableKind = await kind.call(fileSystemOwner, candidate.executable)
          assertSignal(signal)
          if (executableKind !== 'file') continue
          const canonicalExecutable = await realpath.call(fileSystemOwner, candidate.executable)
          assertSignal(signal)
          if (
            typeof canonicalExecutable !== 'string' ||
            normalizeCanonical(canonicalExecutable, platform) !==
              normalizeCanonical(candidate.executable, platform) ||
            !isContained(canonicalRoot, canonicalExecutable, platform)
          ) {
            continue
          }
          return candidate.executable
        } catch {
          assertSignal(signal)
        }
      }
      return null
    }
  }) as TrustedPluginSnipasteDiscovery
  TRUSTED_SNIPASTE_DISCOVERIES.add(discovery)
  return discovery
}

export function createFixedPluginSnipasteExecutor(
  rawOptions: FixedPluginSnipasteExecutorOptions
): PluginSnipasteExecutor {
  const options = exactRecord(rawOptions, ['platform', 'environment', 'spawn'])
  if (
    typeof options.platform !== 'string' ||
    typeof options.spawn !== 'function' ||
    utilTypes.isProxy(options.spawn)
  ) {
    invalid()
  }
  const platform = options.platform as NodeJS.Platform
  const environment = snapshotEnvironment(options.environment, platform)
  const spawn = options.spawn as FixedPluginSnipasteExecutorOptions['spawn']

  const executor = Object.freeze({
    start(executable: string, actionId: PluginSnipasteActionId): PluginSnipasteProcess {
      const safeExecutable = safeAbsolutePath(executable, platform)
      if (!safeExecutable || !isActionId(actionId)) invalid()
      const cwd = platformPath(platform).dirname(safeExecutable)
      return trustProcess(
        spawn.call(
          rawOptions,
          safeExecutable,
          Object.freeze([...ACTION_ARGUMENTS[actionId]]),
          Object.freeze({
            cwd,
            detached: false,
            env: environment,
            shell: false,
            stdio: 'ignore',
            windowsHide: true
          })
        )
      )
    }
  })
  TRUSTED_SNIPASTE_EXECUTORS.add(executor)
  return executor
}

export function createPluginSnipasteProcessCapability(
  rawOptions: PluginSnipasteProcessCapabilityOptions
): PluginSnipasteProcessCapability {
  const options = exactRecord(rawOptions, [
    'activation',
    'platform',
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeShell',
    'watchShellPermissionRevoked',
    'discovery',
    'executor'
  ])
  if (
    typeof options.platform !== 'string' ||
    typeof options.resolveCurrentActivation !== 'function' ||
    utilTypes.isProxy(options.resolveCurrentActivation) ||
    typeof options.resolveHostGeneration !== 'function' ||
    utilTypes.isProxy(options.resolveHostGeneration) ||
    typeof options.authorizeShell !== 'function' ||
    utilTypes.isProxy(options.authorizeShell) ||
    typeof options.watchShellPermissionRevoked !== 'function' ||
    utilTypes.isProxy(options.watchShellPermissionRevoked)
  ) {
    invalid()
  }
  const expectedActivation = snapshotActivation(options.activation)
  if (expectedActivation.name !== 'touch-snipaste') invalid()
  const platform = options.platform as NodeJS.Platform
  const resolveCurrentActivation =
    options.resolveCurrentActivation as PluginSnipasteProcessCapabilityOptions['resolveCurrentActivation']
  const resolveHostGeneration =
    options.resolveHostGeneration as PluginSnipasteProcessCapabilityOptions['resolveHostGeneration']
  const authorizeShell =
    options.authorizeShell as PluginSnipasteProcessCapabilityOptions['authorizeShell']
  const watchShellPermissionRevoked =
    options.watchShellPermissionRevoked as PluginSnipasteProcessCapabilityOptions['watchShellPermissionRevoked']
  if (
    !options.discovery ||
    typeof options.discovery !== 'object' ||
    !TRUSTED_SNIPASTE_DISCOVERIES.has(options.discovery)
  ) {
    invalid()
  }
  const discover = dataMethod<PluginSnipasteDiscovery['discover']>(options.discovery, 'discover')
  if (
    !options.executor ||
    typeof options.executor !== 'object' ||
    !TRUSTED_SNIPASTE_EXECUTORS.has(options.executor)
  ) {
    invalid()
  }
  const start = dataMethod<PluginSnipasteExecutor['start']>(options.executor, 'start')
  const owned = new Set<OwnedProcess>()
  let closed = false
  let revoked = false
  let closePromise: Promise<void> | null = null
  let permissionDisposer: (() => void) | null = null
  let permissionWatcherAvailable = true

  const terminateAll = async (): Promise<void> => {
    const results = await Promise.allSettled([...owned].map((record) => record.terminate()))
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('PLUGIN_SNIPASTE_PROCESS_TEARDOWN_FAILED')
    }
  }
  try {
    const disposer = watchShellPermissionRevoked.call(rawOptions, expectedActivation.name, () => {
      revoked = true
      void terminateAll().catch(() => undefined)
    })
    if (typeof disposer !== 'function' || utilTypes.isProxy(disposer)) invalid()
    permissionDisposer = disposer
  } catch {
    permissionWatcherAvailable = false
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
    const current = snapshotActivation(resolveCurrentActivation(identity.pluginName))
    if (
      !sameActivation(current, expectedActivation) ||
      resolveHostGeneration(current) !== identity.hostGeneration
    ) {
      invalid()
    }
    return Number(identity.hostGeneration)
  }

  const permissionResult = (): 'allowed' | 'denied' | 'unavailable' => {
    if (!permissionWatcherAvailable) return 'unavailable'
    if (revoked) return 'denied'
    try {
      const allowed = authorizeShell.call(rawOptions, expectedActivation.name)
      if (typeof allowed !== 'boolean') return 'unavailable'
      return allowed ? 'allowed' : 'denied'
    } catch {
      return 'unavailable'
    }
  }

  const ownProcess = (process: PluginSnipasteProcess): OwnedProcess => {
    let exited = false
    let terminatePromise: Promise<void> | null = null
    const wait = Promise.resolve()
      .then(() => process.wait())
      .then((value) => {
        const exit = snapshotExit(value)
        exited = true
        return exit
      })
    void wait.catch(() => undefined)
    const record: OwnedProcess = {
      process,
      wait,
      terminate: () => {
        if (terminatePromise) return terminatePromise
        terminatePromise = Promise.resolve().then(async () => {
          if (!exited) {
            try {
              await process.kill()
            } catch {
              // The real exit event remains the cleanup barrier.
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
    id: 'process.spawn',
    permission: 'system.shell',
    timeoutMs: PLUGIN_SNIPASTE_PROCESS_TIMEOUT_MS,
    maxConcurrency: 1,
    callbackLifetime: 'transient',
    callbackFields: Object.freeze([]),
    validateRequest,
    validateResult,
    async invoke(context, request, signal) {
      assertAuthority(context)
      assertSignal(signal)
      const normalized = request as SnipasteRequest
      if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
      if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') {
        return Object.freeze({
          actionId: normalized.actionId,
          status: 'blocked',
          reason: 'platform-unsupported'
        })
      }
      const initialPermission = permissionResult()
      if (initialPermission !== 'allowed') {
        return Object.freeze({
          actionId: normalized.actionId,
          status: 'blocked',
          reason: initialPermission === 'denied' ? 'permission-denied' : 'permission-unavailable'
        })
      }

      let executable: string | null
      try {
        executable = await awaitWithAbort(
          Promise.resolve().then(() => discover.call(options.discovery, signal)),
          signal
        )
      } catch (error) {
        if (signal.aborted) throw error
        executable = null
      }
      assertSignal(signal)
      assertAuthority(context)
      if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
      const postDiscoveryPermission = permissionResult()
      if (postDiscoveryPermission !== 'allowed') {
        return Object.freeze({
          actionId: normalized.actionId,
          status: 'blocked',
          reason:
            postDiscoveryPermission === 'denied' ? 'permission-denied' : 'permission-unavailable'
        })
      }
      if (!executable) {
        return Object.freeze({
          actionId: normalized.actionId,
          status: 'blocked',
          reason: 'not-installed'
        })
      }
      if (owned.size >= PLUGIN_SNIPASTE_MAX_PROCESSES) {
        return Object.freeze({
          actionId: normalized.actionId,
          status: 'failed',
          reason: 'spawn-failed'
        })
      }

      let process: PluginSnipasteProcess
      try {
        process = snapshotProcess(start.call(options.executor, executable, normalized.actionId))
      } catch {
        return Object.freeze({
          actionId: normalized.actionId,
          status: 'failed',
          reason: 'spawn-failed'
        })
      }
      const record = ownProcess(process)
      try {
        await awaitWithAbort(
          Promise.resolve().then(() => process.started()),
          signal
        )
      } catch (error) {
        await record.terminate()
        if (signal.aborted) throw error
        return Object.freeze({
          actionId: normalized.actionId,
          status: 'failed',
          reason: 'spawn-failed'
        })
      }

      try {
        assertSignal(signal)
        assertAuthority(context)
        if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
        const postSpawnPermission = permissionResult()
        if (postSpawnPermission !== 'allowed') {
          await record.terminate()
          return Object.freeze({
            actionId: normalized.actionId,
            status: 'blocked',
            reason:
              postSpawnPermission === 'denied' ? 'permission-denied' : 'permission-unavailable'
          })
        }
      } catch (error) {
        await record.terminate()
        throw error
      }
      return Object.freeze({ actionId: normalized.actionId, status: 'started' })
    }
  })

  return Object.freeze({
    definitions: Object.freeze([definition]),
    close(): Promise<void> {
      if (closePromise) return closePromise
      closed = true
      try {
        permissionDisposer?.()
      } catch {
        // Authority is already closed for this activation.
      }
      permissionDisposer = null
      closePromise = terminateAll()
      return closePromise
    }
  })
}

export function createPluginSnipasteProcess(child: ChildProcess): PluginSnipasteProcess {
  let spawned = typeof child.pid === 'number'
  let settled = false
  let killPromise: Promise<void> | null = null
  let resolveStarted!: () => void
  let rejectStarted!: (error: Error) => void
  let resolveExit!: (exit: PluginSnipasteProcessExit) => void
  let rejectExit!: (error: Error) => void
  const started = new Promise<void>((resolve, reject) => {
    resolveStarted = resolve
    rejectStarted = reject
  })
  const exit = new Promise<PluginSnipasteProcessExit>((resolve, reject) => {
    resolveExit = resolve
    rejectExit = reject
  })
  const cleanup = (): void => {
    child.removeListener('spawn', onSpawn)
    child.removeListener('error', onError)
    child.removeListener('exit', onExit)
  }
  const onSpawn = (): void => {
    if (settled) return
    spawned = true
    resolveStarted()
  }
  const onError = (): void => {
    if (settled || spawned) return
    settled = true
    cleanup()
    const error = new Error('PLUGIN_SNIPASTE_PROCESS_SPAWN_FAILED')
    rejectStarted(error)
    rejectExit(error)
  }
  const onExit = (code: number | null): void => {
    if (settled) return
    settled = true
    cleanup()
    if (!spawned) rejectStarted(new Error('PLUGIN_SNIPASTE_PROCESS_SPAWN_FAILED'))
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
          let killError: Error | null = null
          if (!settled) {
            try {
              if (child.kill() !== true)
                killError = new Error('PLUGIN_SNIPASTE_PROCESS_KILL_FAILED')
            } catch {
              killError = new Error('PLUGIN_SNIPASTE_PROCESS_KILL_FAILED')
            }
          }
          let exitError: unknown
          try {
            await exit
          } catch (error) {
            exitError = error
          }
          if (killError) throw killError
          if (exitError) throw exitError
        })
        return killPromise
      }
    })
  )
}
