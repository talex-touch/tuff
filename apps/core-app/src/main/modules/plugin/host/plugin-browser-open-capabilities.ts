import type { ChildProcess } from 'node:child_process'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { types as utilTypes } from 'node:util'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'

export const PLUGIN_BROWSER_OPEN_TIMEOUT_MS = 30_000
export const PLUGIN_BROWSER_OPEN_TOKEN_TTL_MS = 30_000
export const PLUGIN_BROWSER_OPEN_MAX_BROWSERS = 16
export const PLUGIN_BROWSER_OPEN_MAX_URL_BYTES = 2_048

export interface PluginBrowserOpenPathIdentity {
  readonly canonicalPath: string
  readonly kind: 'directory' | 'file'
  readonly dev: string
  readonly ino: string
}

export interface PluginBrowserOpenProcess {
  started(): Promise<void>
  wait(): Promise<{ readonly code: number | null }>
  kill(): void | Promise<void>
}

export interface PluginBrowserOpenSpawnOptions {
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly detached: false
  readonly shell: false
  readonly stdio: readonly ['ignore', 'ignore', 'ignore']
  readonly windowsHide: true
}

interface NativeBrowserTarget {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly identity: PluginBrowserOpenPathIdentity
}

interface TrustedBrowserOpenService {
  readonly platform: NodeJS.Platform
  list(signal: AbortSignal): Promise<readonly NativeBrowserTarget[]>
  revalidate(target: NativeBrowserTarget, signal: AbortSignal): Promise<boolean>
  startOpen(url: string, target?: NativeBrowserTarget): PluginBrowserOpenProcess
}

export interface FixedPluginBrowserOpenServiceOptions {
  readonly platform: NodeJS.Platform
  readonly homeDirectory: string
  readonly windowsDirectory: string
  readonly environment: Readonly<Record<string, string | undefined>>
  inspect(
    candidatePath: string,
    kind: PluginBrowserOpenPathIdentity['kind'],
    signal: AbortSignal
  ): Promise<PluginBrowserOpenPathIdentity | null>
  spawn(
    executable: string,
    args: readonly string[],
    options: PluginBrowserOpenSpawnOptions
  ): PluginBrowserOpenProcess
}

export interface PluginBrowserOpenCapabilitiesOptions {
  readonly activation: PluginActivationIdentity
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  authorizeShell(pluginName: string): boolean
  authorizeNetwork(pluginName: string): boolean
  watchShellPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  watchNetworkPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  readonly service: TrustedBrowserOpenService
}

export interface PluginBrowserOpenCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  close(): Promise<void>
}

type BrowserOpenRequest =
  | { readonly operation: 'list' }
  | { readonly operation: 'open'; readonly url: string; readonly browserToken?: string }

type BrowserOpenResult =
  | {
      readonly operation: 'list'
      readonly status: 'available'
      readonly defaultAvailable: true
      readonly browsers: readonly {
        readonly id: string
        readonly name: string
        readonly token: string
      }[]
    }
  | {
      readonly operation: 'list'
      readonly status: 'blocked'
      readonly reason: 'platform-unsupported'
    }
  | { readonly operation: 'list'; readonly status: 'failed'; readonly reason: 'list-failed' }
  | { readonly operation: 'open'; readonly status: 'completed' }
  | {
      readonly operation: 'open'
      readonly status: 'blocked'
      readonly reason:
        | 'platform-unsupported'
        | 'token-invalid'
        | 'token-expired'
        | 'token-replayed'
        | 'native-replaced'
        | 'permission-denied'
        | 'permission-unavailable'
    }
  | { readonly operation: 'open'; readonly status: 'failed'; readonly reason: 'open-failed' }

interface TokenRecord {
  readonly epoch: number
  readonly hostGeneration: number
  readonly expiresAt: number
  readonly target: NativeBrowserTarget
}

interface OwnedProcess {
  readonly wait: Promise<{ readonly code: number | null }>
  terminate(): Promise<void>
}

const TOKEN_PATTERN = /^bo_[A-Za-z0-9_-]{32}$/
const BROWSER_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
const BROWSER_ENVIRONMENT_KEYS = new Set([
  'HOME',
  'LANG',
  'LOCALAPPDATA',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'SystemRoot',
  'WINDIR'
])
const TRUSTED_SERVICES = new WeakSet<object>()
const TRUSTED_PROCESSES = new WeakSet<object>()
const TRUSTED_TARGETS = new WeakSet<object>()

const BROWSER_CANDIDATES = Object.freeze({
  darwin: Object.freeze([
    Object.freeze({ id: 'safari', name: 'Safari', relative: 'Safari.app' }),
    Object.freeze({ id: 'chrome', name: 'Chrome', relative: 'Google Chrome.app' }),
    Object.freeze({ id: 'edge', name: 'Edge', relative: 'Microsoft Edge.app' }),
    Object.freeze({ id: 'firefox', name: 'Firefox', relative: 'Firefox.app' }),
    Object.freeze({ id: 'brave', name: 'Brave', relative: 'Brave Browser.app' }),
    Object.freeze({ id: 'opera', name: 'Opera', relative: 'Opera.app' })
  ]),
  win32: Object.freeze([
    Object.freeze({ id: 'edge', name: 'Edge', relative: 'Microsoft/Edge/Application/msedge.exe' }),
    Object.freeze({
      id: 'chrome',
      name: 'Chrome',
      relative: 'Google/Chrome/Application/chrome.exe'
    }),
    Object.freeze({ id: 'firefox', name: 'Firefox', relative: 'Mozilla Firefox/firefox.exe' }),
    Object.freeze({
      id: 'brave',
      name: 'Brave',
      relative: 'BraveSoftware/Brave-Browser/Application/brave.exe'
    }),
    Object.freeze({ id: 'opera', name: 'Opera', relative: 'Programs/Opera/opera.exe' })
  ])
})

function invalid(): never {
  throw new TypeError('PLUGIN_BROWSER_OPEN_INVALID')
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

function dataMethod<T extends (...args: never[]) => unknown>(value: object, key: string): T {
  let descriptor: PropertyDescriptor | undefined
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key)
  } catch {
    invalid()
  }
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'function') invalid()
  if (utilTypes.isProxy(descriptor.value)) invalid()
  return descriptor.value as T
}

function snapshotActivation(value: unknown): PluginActivationIdentity {
  const record = exactRecord(value, ['name', 'pluginInstanceId', 'activationGeneration', 'key'])
  if (
    typeof record.name !== 'string' ||
    typeof record.pluginInstanceId !== 'string' ||
    !Number.isSafeInteger(record.activationGeneration) ||
    Number(record.activationGeneration) < 1 ||
    typeof record.key !== 'string'
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

function pathApiFor(value: string): typeof path.posix | typeof path.win32 {
  return /^(?:[A-Za-z]:[\\/]|\\\\)/.test(value) ? path.win32 : path.posix
}

function snapshotIdentity(
  value: unknown,
  expectedKind: 'directory' | 'file'
): PluginBrowserOpenPathIdentity {
  const record = exactRecord(value, ['canonicalPath', 'kind', 'dev', 'ino'])
  if (
    typeof record.canonicalPath !== 'string' ||
    !pathApiFor(record.canonicalPath).isAbsolute(record.canonicalPath) ||
    record.kind !== expectedKind ||
    typeof record.dev !== 'string' ||
    record.dev.length === 0 ||
    record.dev.length > 64 ||
    typeof record.ino !== 'string' ||
    record.ino.length === 0 ||
    record.ino.length > 64
  ) {
    invalid()
  }
  const pathApi = pathApiFor(record.canonicalPath)
  return Object.freeze({
    canonicalPath: pathApi.normalize(record.canonicalPath),
    kind: expectedKind,
    dev: record.dev,
    ino: record.ino
  })
}

function snapshotProcess(value: unknown): PluginBrowserOpenProcess {
  if (
    !value ||
    typeof value !== 'object' ||
    utilTypes.isProxy(value) ||
    !TRUSTED_PROCESSES.has(value)
  ) {
    invalid()
  }
  const started = dataMethod<PluginBrowserOpenProcess['started']>(value, 'started')
  const wait = dataMethod<PluginBrowserOpenProcess['wait']>(value, 'wait')
  const kill = dataMethod<PluginBrowserOpenProcess['kill']>(value, 'kill')
  const snapshot = Object.freeze({
    started: () => started.call(value),
    wait: () => wait.call(value),
    kill: () => kill.call(value)
  })
  TRUSTED_PROCESSES.add(snapshot)
  return snapshot
}

function snapshotExit(value: unknown): { readonly code: number | null } {
  const record = exactRecord(value, ['code'])
  if (record.code !== null && !Number.isSafeInteger(record.code)) invalid()
  return Object.freeze({ code: record.code === null ? null : Number(record.code) })
}

function sameIdentity(
  left: PluginBrowserOpenPathIdentity,
  right: PluginBrowserOpenPathIdentity
): boolean {
  return (
    left.canonicalPath === right.canonicalPath &&
    left.kind === right.kind &&
    left.dev === right.dev &&
    left.ino === right.ino
  )
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

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function normalizeUrl(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value, 'utf8') > PLUGIN_BROWSER_OPEN_MAX_URL_BYTES ||
    containsControlCharacter(value)
  ) {
    invalid()
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    invalid()
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.hostname.length === 0
  ) {
    invalid()
  }
  const normalized = parsed.toString()
  if (Buffer.byteLength(normalized, 'utf8') > PLUGIN_BROWSER_OPEN_MAX_URL_BYTES) invalid()
  return normalized
}

function validateRequest(value: unknown): BrowserOpenRequest {
  const record = exactRecord(value, ['operation', 'url', 'browserToken'], ['operation'])
  if (record.operation === 'list') {
    if (Object.keys(record).length !== 1) invalid()
    return Object.freeze({ operation: 'list' })
  }
  if (record.operation !== 'open') invalid()
  const url = normalizeUrl(record.url)
  const hasToken = Object.hasOwn(record, 'browserToken')
  if (
    hasToken &&
    (typeof record.browserToken !== 'string' || !TOKEN_PATTERN.test(record.browserToken))
  ) {
    invalid()
  }
  return Object.freeze({
    operation: 'open',
    url,
    ...(hasToken ? { browserToken: record.browserToken as string } : {})
  })
}

function validateBrowserResult(value: unknown): void {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    value.length > PLUGIN_BROWSER_OPEN_MAX_BROWSERS
  ) {
    invalid()
  }
  for (const entry of value) {
    const record = exactRecord(entry, ['id', 'name', 'token'])
    if (
      typeof record.id !== 'string' ||
      !BROWSER_ID_PATTERN.test(record.id) ||
      typeof record.name !== 'string' ||
      record.name.length === 0 ||
      record.name.length > 64 ||
      typeof record.token !== 'string' ||
      !TOKEN_PATTERN.test(record.token)
    ) {
      invalid()
    }
  }
}

function validateResult(value: unknown): BrowserOpenResult {
  const base = exactRecord(
    value,
    ['operation', 'status', 'defaultAvailable', 'browsers', 'reason'],
    ['operation', 'status']
  )
  if (base.operation === 'list' && base.status === 'available') {
    if (Object.keys(base).length !== 4 || base.defaultAvailable !== true) invalid()
    validateBrowserResult(base.browsers)
    return value as BrowserOpenResult
  }
  if (base.operation === 'list' && base.status === 'blocked') {
    if (Object.keys(base).length !== 3 || base.reason !== 'platform-unsupported') invalid()
    return value as BrowserOpenResult
  }
  if (base.operation === 'list' && base.status === 'failed') {
    if (Object.keys(base).length !== 3 || base.reason !== 'list-failed') invalid()
    return value as BrowserOpenResult
  }
  if (base.operation === 'open' && base.status === 'completed') {
    if (Object.keys(base).length !== 2) invalid()
    return value as BrowserOpenResult
  }
  if (base.operation === 'open' && base.status === 'failed') {
    if (Object.keys(base).length !== 3 || base.reason !== 'open-failed') invalid()
    return value as BrowserOpenResult
  }
  if (base.operation === 'open' && base.status === 'blocked') {
    if (
      Object.keys(base).length !== 3 ||
      ![
        'platform-unsupported',
        'token-invalid',
        'token-expired',
        'token-replayed',
        'native-replaced',
        'permission-denied',
        'permission-unavailable'
      ].includes(String(base.reason))
    ) {
      invalid()
    }
    return value as BrowserOpenResult
  }
  invalid()
}

function snapshotEnvironment(value: unknown): Readonly<Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalid()
  }
  let descriptors: PropertyDescriptorMap
  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalid()
  }
  const output: Record<string, string> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key]
    if (typeof key !== 'string' || !descriptor?.enumerable || !('value' in descriptor)) invalid()
    if (!BROWSER_ENVIRONMENT_KEYS.has(key) || descriptor.value === undefined) continue
    if (
      typeof descriptor.value !== 'string' ||
      descriptor.value.length > 4096 ||
      /[\0\r\n]/.test(descriptor.value)
    ) {
      invalid()
    }
    output[key] = descriptor.value
  }
  return Object.freeze(output)
}

function candidateRoots(options: FixedPluginBrowserOpenServiceOptions): readonly string[] {
  const pathApi = options.platform === 'win32' ? path.win32 : path.posix
  if (options.platform === 'darwin') {
    return Object.freeze(['/Applications', pathApi.join(options.homeDirectory, 'Applications')])
  }
  if (options.platform === 'win32') {
    return Object.freeze(
      [
        options.environment.ProgramFiles,
        options.environment['ProgramFiles(x86)'],
        options.environment.LOCALAPPDATA
      ].filter((value): value is string => typeof value === 'string' && pathApi.isAbsolute(value))
    )
  }
  return Object.freeze([])
}

function minimalEnvironment(
  options: FixedPluginBrowserOpenServiceOptions
): Readonly<Record<string, string>> {
  const output: Record<string, string> = Object.create(null)
  for (const key of options.platform === 'win32' ? ['SystemRoot', 'WINDIR'] : ['HOME', 'LANG']) {
    const value = options.environment[key]
    if (typeof value === 'string' && value.length > 0 && value.length <= 4096) output[key] = value
  }
  return Object.freeze(output)
}

export function createFixedPluginBrowserOpenService(
  rawOptions: FixedPluginBrowserOpenServiceOptions
): TrustedBrowserOpenService {
  const options = exactRecord(rawOptions, [
    'platform',
    'homeDirectory',
    'windowsDirectory',
    'environment',
    'inspect',
    'spawn'
  ])
  if (
    typeof options.platform !== 'string' ||
    typeof options.homeDirectory !== 'string' ||
    !pathApiFor(options.homeDirectory).isAbsolute(options.homeDirectory) ||
    typeof options.windowsDirectory !== 'string' ||
    !pathApiFor(options.windowsDirectory).isAbsolute(options.windowsDirectory) ||
    !options.environment ||
    typeof options.environment !== 'object' ||
    utilTypes.isProxy(options.environment) ||
    typeof options.inspect !== 'function' ||
    utilTypes.isProxy(options.inspect) ||
    typeof options.spawn !== 'function' ||
    utilTypes.isProxy(options.spawn)
  ) {
    invalid()
  }
  const platform = options.platform as NodeJS.Platform
  const pathApi = platform === 'win32' ? path.win32 : path.posix
  const homeDirectory = pathApiFor(options.homeDirectory as string).normalize(
    options.homeDirectory as string
  )
  const windowsDirectory = pathApiFor(options.windowsDirectory as string).normalize(
    options.windowsDirectory as string
  )
  const environment = snapshotEnvironment(options.environment)
  const inspect = options.inspect as FixedPluginBrowserOpenServiceOptions['inspect']
  const spawn = options.spawn as FixedPluginBrowserOpenServiceOptions['spawn']
  const fixedOptions: FixedPluginBrowserOpenServiceOptions = Object.freeze({
    platform,
    homeDirectory,
    windowsDirectory,
    environment,
    inspect,
    spawn
  })
  const roots = candidateRoots(fixedOptions)
  const env = minimalEnvironment(fixedOptions)

  const inspectCandidate = async (
    candidatePath: string,
    kind: PluginBrowserOpenPathIdentity['kind'],
    signal: AbortSignal
  ): Promise<PluginBrowserOpenPathIdentity | null> => {
    assertSignal(signal)
    const raw = await inspect.call(fixedOptions, candidatePath, kind, signal)
    assertSignal(signal)
    if (raw === null) return null
    const identity = snapshotIdentity(raw, kind)
    if (identity.canonicalPath !== pathApi.normalize(candidatePath)) return null
    return identity
  }

  const list = async (signal: AbortSignal): Promise<readonly NativeBrowserTarget[]> => {
    assertSignal(signal)
    if (platform !== 'darwin' && platform !== 'win32') return Object.freeze([])
    const candidates = BROWSER_CANDIDATES[platform]
    const kind = platform === 'darwin' ? 'directory' : 'file'
    const output: NativeBrowserTarget[] = []
    for (const candidate of candidates) {
      for (const root of roots) {
        const candidatePath = pathApi.resolve(root, candidate.relative)
        if (pathApi.relative(pathApi.resolve(root), candidatePath).startsWith('..')) continue
        const identity = await inspectCandidate(candidatePath, kind, signal)
        if (!identity) continue
        const target = Object.freeze({
          id: candidate.id,
          name: candidate.name,
          path: candidatePath,
          identity
        })
        TRUSTED_TARGETS.add(target)
        output.push(target)
        break
      }
      if (output.length >= PLUGIN_BROWSER_OPEN_MAX_BROWSERS) break
    }
    return Object.freeze(output)
  }

  const revalidate = async (target: NativeBrowserTarget, signal: AbortSignal): Promise<boolean> => {
    if (!TRUSTED_TARGETS.has(target)) invalid()
    const identity = await inspectCandidate(target.path, target.identity.kind, signal)
    return identity !== null && sameIdentity(identity, target.identity)
  }

  const startOpen = (url: string, target?: NativeBrowserTarget): PluginBrowserOpenProcess => {
    if (target && !TRUSTED_TARGETS.has(target)) invalid()
    const normalizedUrl = normalizeUrl(url)
    let executable: string
    let args: readonly string[]
    let cwd: string
    if (platform === 'darwin') {
      executable = '/usr/bin/open'
      args = target
        ? Object.freeze(['-a', target.path, normalizedUrl])
        : Object.freeze([normalizedUrl])
      cwd = '/usr/bin'
    } else if (platform === 'win32') {
      if (target) {
        executable = pathApi.join(
          windowsDirectory,
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe'
        )
        args = Object.freeze([
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          "$ErrorActionPreference='Stop'; Start-Process -FilePath $args[0] -ArgumentList @($args[1])",
          target.path,
          normalizedUrl
        ])
        cwd = pathApi.dirname(executable)
      } else {
        executable = pathApi.join(windowsDirectory, 'System32', 'rundll32.exe')
        args = Object.freeze(['url.dll,FileProtocolHandler', normalizedUrl])
        cwd = pathApi.dirname(executable)
      }
    } else if (platform === 'linux' && !target) {
      executable = '/usr/bin/xdg-open'
      args = Object.freeze([normalizedUrl])
      cwd = '/usr/bin'
    } else {
      invalid()
    }
    return snapshotProcess(
      spawn.call(fixedOptions, executable, args, {
        cwd,
        env,
        detached: false,
        shell: false,
        stdio: Object.freeze(['ignore', 'ignore', 'ignore'] as const),
        windowsHide: true
      })
    )
  }

  const service = Object.freeze({ platform, list, revalidate, startOpen })
  TRUSTED_SERVICES.add(service)
  return service
}

export function createPluginBrowserOpenCapabilities(
  rawOptions: PluginBrowserOpenCapabilitiesOptions
): PluginBrowserOpenCapabilities {
  const options = exactRecord(rawOptions, [
    'activation',
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeShell',
    'authorizeNetwork',
    'watchShellPermissionRevoked',
    'watchNetworkPermissionRevoked',
    'service'
  ])
  if (
    typeof options.resolveCurrentActivation !== 'function' ||
    utilTypes.isProxy(options.resolveCurrentActivation) ||
    typeof options.resolveHostGeneration !== 'function' ||
    utilTypes.isProxy(options.resolveHostGeneration) ||
    typeof options.authorizeShell !== 'function' ||
    utilTypes.isProxy(options.authorizeShell) ||
    typeof options.authorizeNetwork !== 'function' ||
    utilTypes.isProxy(options.authorizeNetwork) ||
    typeof options.watchShellPermissionRevoked !== 'function' ||
    utilTypes.isProxy(options.watchShellPermissionRevoked) ||
    typeof options.watchNetworkPermissionRevoked !== 'function' ||
    utilTypes.isProxy(options.watchNetworkPermissionRevoked) ||
    !options.service ||
    typeof options.service !== 'object' ||
    !TRUSTED_SERVICES.has(options.service)
  ) {
    invalid()
  }
  const expectedActivation = snapshotActivation(options.activation)
  if (expectedActivation.name !== 'touch-browser-open') invalid()
  const service = options.service as TrustedBrowserOpenService
  const listBrowsers = dataMethod<TrustedBrowserOpenService['list']>(service, 'list')
  const revalidateBrowser = dataMethod<TrustedBrowserOpenService['revalidate']>(
    service,
    'revalidate'
  )
  const startOpen = dataMethod<TrustedBrowserOpenService['startOpen']>(service, 'startOpen')
  const resolveCurrentActivation =
    options.resolveCurrentActivation as PluginBrowserOpenCapabilitiesOptions['resolveCurrentActivation']
  const resolveHostGeneration =
    options.resolveHostGeneration as PluginBrowserOpenCapabilitiesOptions['resolveHostGeneration']
  const authorizeShell =
    options.authorizeShell as PluginBrowserOpenCapabilitiesOptions['authorizeShell']
  const authorizeNetwork =
    options.authorizeNetwork as PluginBrowserOpenCapabilitiesOptions['authorizeNetwork']
  const watchShell =
    options.watchShellPermissionRevoked as PluginBrowserOpenCapabilitiesOptions['watchShellPermissionRevoked']
  const watchNetwork =
    options.watchNetworkPermissionRevoked as PluginBrowserOpenCapabilitiesOptions['watchNetworkPermissionRevoked']
  const owned = new Set<OwnedProcess>()
  const tokens = new Map<string, TokenRecord>()
  const retiredTokens = new Map<string, number>()
  const permissionDisposers: Array<() => void> = []
  let shellRevoked = false
  let networkRevoked = false
  let shellWatcherAvailable = true
  let networkWatcherAvailable = true
  let epoch = 0
  let closed = false
  let closePromise: Promise<void> | null = null
  let activeOperations = 0
  const operationIdleWaiters = new Set<() => void>()

  const retireToken = (token: string): void => {
    retiredTokens.set(token, Date.now())
    while (retiredTokens.size > 1024) {
      const oldest = retiredTokens.keys().next().value
      if (typeof oldest !== 'string') break
      retiredTokens.delete(oldest)
    }
  }
  const retireAllTokens = (): void => {
    for (const token of tokens.keys()) retireToken(token)
    tokens.clear()
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
  const terminateAll = async (): Promise<void> => {
    const results = await Promise.allSettled([...owned].map((record) => record.terminate()))
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('PLUGIN_BROWSER_OPEN_TEARDOWN_FAILED')
    }
  }
  const revoke = (kind: 'shell' | 'network'): void => {
    if (kind === 'shell') shellRevoked = true
    else networkRevoked = true
    retireAllTokens()
    void terminateAll().catch(() => undefined)
  }
  try {
    const disposer = watchShell.call(rawOptions, expectedActivation.name, () => revoke('shell'))
    if (typeof disposer !== 'function' || utilTypes.isProxy(disposer)) invalid()
    permissionDisposers.push(disposer)
  } catch {
    shellWatcherAvailable = false
  }
  try {
    const disposer = watchNetwork.call(rawOptions, expectedActivation.name, () => revoke('network'))
    if (typeof disposer !== 'function' || utilTypes.isProxy(disposer)) invalid()
    permissionDisposers.push(disposer)
  } catch {
    networkWatcherAvailable = false
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
    const current = resolveCurrentActivation.call(rawOptions, identity.pluginName)
    if (
      !current ||
      !sameActivation(snapshotActivation(current), expectedActivation) ||
      resolveHostGeneration.call(rawOptions, expectedActivation) !== identity.hostGeneration
    ) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
    return Number(identity.hostGeneration)
  }

  const permission = (kind: 'shell' | 'network'): 'allowed' | 'denied' | 'unavailable' => {
    if (kind === 'shell' && !shellWatcherAvailable) return 'unavailable'
    if (kind === 'network' && !networkWatcherAvailable) return 'unavailable'
    if ((kind === 'shell' && shellRevoked) || (kind === 'network' && networkRevoked)) {
      return 'denied'
    }
    try {
      const result =
        kind === 'shell'
          ? authorizeShell.call(rawOptions, expectedActivation.name)
          : authorizeNetwork.call(rawOptions, expectedActivation.name)
      return typeof result !== 'boolean' ? 'unavailable' : result ? 'allowed' : 'denied'
    } catch {
      return 'unavailable'
    }
  }

  const assertAdmission = (
    context: PluginSecurityContext,
    signal: AbortSignal,
    requireNetwork: boolean
  ): number => {
    assertSignal(signal)
    const hostGeneration = assertAuthority(context)
    if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
    for (const kind of requireNetwork ? (['shell', 'network'] as const) : (['shell'] as const)) {
      const decision = permission(kind)
      if (decision === 'denied') {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
      }
      if (decision === 'unavailable') {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
      }
    }
    return hostGeneration
  }

  const ownProcess = (process: PluginBrowserOpenProcess): OwnedProcess => {
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
      wait,
      terminate(): Promise<void> {
        if (terminatePromise) return terminatePromise
        terminatePromise = Promise.resolve().then(async () => {
          if (!exited) {
            try {
              await process.kill()
            } catch {
              // The native exit event remains the barrier.
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

  const runOpen = async (
    url: string,
    target: NativeBrowserTarget | undefined,
    context: PluginSecurityContext,
    signal: AbortSignal
  ): Promise<void> => {
    assertAdmission(context, signal, true)
    const finishOperation = beginOperation()
    try {
      let process: PluginBrowserOpenProcess
      try {
        process = snapshotProcess(startOpen.call(service, url, target))
      } catch {
        invalid()
      }
      const record = ownProcess(process)
      try {
        assertAdmission(context, signal, true)
        await awaitWithAbort(
          Promise.resolve().then(() => process.started()),
          signal
        )
        assertAdmission(context, signal, true)
        const exit = await awaitWithAbort(record.wait, signal)
        assertAdmission(context, signal, true)
        if (exit.code !== 0) invalid()
      } catch (error) {
        await record.terminate()
        throw error
      }
    } finally {
      finishOperation()
    }
  }

  const createToken = (
    target: NativeBrowserTarget,
    hostGeneration: number,
    tokenEpoch: number
  ): string => {
    let token = ''
    do {
      token = `bo_${randomBytes(24).toString('base64url')}`
    } while (tokens.has(token) || retiredTokens.has(token))
    tokens.set(
      token,
      Object.freeze({
        epoch: tokenEpoch,
        hostGeneration,
        expiresAt: Date.now() + PLUGIN_BROWSER_OPEN_TOKEN_TTL_MS,
        target
      })
    )
    return token
  }

  const consumeToken = (
    token: string,
    hostGeneration: number
  ): {
    readonly target?: NativeBrowserTarget
    readonly reason?: 'token-invalid' | 'token-expired' | 'token-replayed'
  } => {
    if (retiredTokens.has(token)) return Object.freeze({ reason: 'token-replayed' })
    const record = tokens.get(token)
    if (!record) return Object.freeze({ reason: 'token-invalid' })
    tokens.delete(token)
    retireToken(token)
    if (record.epoch !== epoch || record.hostGeneration !== hostGeneration) {
      return Object.freeze({ reason: 'token-replayed' })
    }
    if (Date.now() >= record.expiresAt) return Object.freeze({ reason: 'token-expired' })
    return Object.freeze({ target: record.target })
  }

  const definition: PluginHostCapabilityDefinition = Object.freeze({
    id: 'system.browser-open',
    permission: 'system.shell',
    timeoutMs: PLUGIN_BROWSER_OPEN_TIMEOUT_MS,
    maxConcurrency: 2,
    callbackLifetime: 'transient',
    callbackFields: Object.freeze([]),
    validateRequest,
    validateResult,
    async invoke(context, request, signal) {
      const normalized = request as BrowserOpenRequest
      const supported =
        service.platform === 'darwin' ||
        service.platform === 'win32' ||
        service.platform === 'linux'
      if (!supported) {
        return Object.freeze({
          operation: normalized.operation,
          status: 'blocked',
          reason: 'platform-unsupported'
        })
      }

      if (normalized.operation === 'list') {
        const hostGeneration = assertAdmission(context, signal, false)
        const requestEpoch = epoch + 1
        epoch = requestEpoch
        retireAllTokens()
        if (service.platform === 'linux') {
          return Object.freeze({
            operation: 'list',
            status: 'available',
            defaultAvailable: true,
            browsers: Object.freeze([])
          })
        }
        try {
          const targets = await listBrowsers.call(service, signal)
          assertAdmission(context, signal, false)
          if (requestEpoch !== epoch) {
            return Object.freeze({ operation: 'list', status: 'failed', reason: 'list-failed' })
          }
          const browsers = targets.map((target) => {
            if (!TRUSTED_TARGETS.has(target)) invalid()
            return Object.freeze({
              id: target.id,
              name: target.name,
              token: createToken(target, hostGeneration, requestEpoch)
            })
          })
          return Object.freeze({
            operation: 'list',
            status: 'available',
            defaultAvailable: true,
            browsers: Object.freeze(browsers)
          })
        } catch (error) {
          if (error instanceof PluginHostCapabilityError) throw error
          return Object.freeze({ operation: 'list', status: 'failed', reason: 'list-failed' })
        }
      }

      const shellDecision = permission('shell')
      const networkDecision = permission('network')
      if (shellDecision !== 'allowed' || networkDecision !== 'allowed') {
        return Object.freeze({
          operation: 'open',
          status: 'blocked',
          reason:
            shellDecision === 'unavailable' || networkDecision === 'unavailable'
              ? 'permission-unavailable'
              : 'permission-denied'
        })
      }
      const hostGeneration = assertAdmission(context, signal, true)
      let target: NativeBrowserTarget | undefined
      if (normalized.browserToken) {
        const consumed = consumeToken(normalized.browserToken, hostGeneration)
        if (!consumed.target) {
          return Object.freeze({
            operation: 'open',
            status: 'blocked',
            reason: consumed.reason ?? 'token-invalid'
          })
        }
        target = consumed.target
        try {
          const current = await revalidateBrowser.call(service, target, signal)
          assertAdmission(context, signal, true)
          if (current !== true) {
            return Object.freeze({
              operation: 'open',
              status: 'blocked',
              reason: 'native-replaced'
            })
          }
        } catch (error) {
          if (error instanceof PluginHostCapabilityError) throw error
          return Object.freeze({ operation: 'open', status: 'failed', reason: 'open-failed' })
        }
      }

      try {
        await runOpen(normalized.url, target, context, signal)
        return Object.freeze({ operation: 'open', status: 'completed' })
      } catch (error) {
        const shellAfter = permission('shell')
        const networkAfter = permission('network')
        if (shellAfter !== 'allowed' || networkAfter !== 'allowed') {
          return Object.freeze({
            operation: 'open',
            status: 'blocked',
            reason:
              shellAfter === 'unavailable' || networkAfter === 'unavailable'
                ? 'permission-unavailable'
                : 'permission-denied'
          })
        }
        if (error instanceof PluginHostCapabilityError) throw error
        return Object.freeze({ operation: 'open', status: 'failed', reason: 'open-failed' })
      }
    }
  })

  return Object.freeze({
    definitions: Object.freeze([definition]),
    close(): Promise<void> {
      if (closePromise) return closePromise
      closed = true
      retireAllTokens()
      for (const dispose of permissionDisposers.splice(0)) {
        try {
          dispose()
        } catch {
          // Authority is already closed.
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

export function createPluginBrowserOpenProcess(child: ChildProcess): PluginBrowserOpenProcess {
  let spawned = typeof child.pid === 'number'
  let settled = false
  let killRequested = false
  let resolveStarted!: () => void
  let rejectStarted!: (error: Error) => void
  let resolveExit!: (value: { readonly code: number | null }) => void
  let rejectExit!: (error: Error) => void
  const started = new Promise<void>((resolve, reject) => {
    resolveStarted = resolve
    rejectStarted = reject
  })
  const exit = new Promise<{ readonly code: number | null }>((resolve, reject) => {
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
    const error = new Error('PLUGIN_BROWSER_OPEN_PROCESS_SPAWN_FAILED')
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
  const onExit = (code: number | null): void => {
    if (settled) return
    if (!spawned) {
      failSpawn()
      return
    }
    settled = true
    cleanup()
    resolveExit(Object.freeze({ code: Number.isSafeInteger(code) ? Number(code) : null }))
  }
  child.once('spawn', onSpawn)
  child.once('error', onError)
  child.once('exit', onExit)
  if (spawned) resolveStarted()
  void started.catch(() => undefined)
  void exit.catch(() => undefined)
  const process = Object.freeze({
    started: () => started,
    wait: () => exit,
    kill(): void {
      if (settled || killRequested) return
      killRequested = true
      try {
        child.kill()
      } catch {
        // The real exit event remains authoritative.
      }
    }
  })
  TRUSTED_PROCESSES.add(process)
  return process
}
