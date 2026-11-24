import type { HerdrCoreSettings } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { HerdrOwnership } from '@talex-touch/utils/transport/events/herdr'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import type { Socket } from 'node:net'
import { spawn as nodeSpawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

export const DEFAULT_HERDR_SESSION = 'default'
export const DEFAULT_HERDR_CONNECT_TIMEOUT_MS = 5_000
export const DEFAULT_HERDR_BOOTSTRAP_TIMEOUT_MS = 5_000
const RETRY_DIAL_DELAY_MS = 100
const MAX_RETRY_DIAL_ATTEMPTS = 10

export type HerdrSocketSource = 'settings' | 'env' | 'default'

export interface ResolvedHerdrSocket {
  socketPath: string
  session: string
  source: HerdrSocketSource
}

export type HerdrBinarySource = 'settings' | 'path' | 'local-bin' | 'macos-bundle' | 'resources'

export interface ResolvedHerdrBinary {
  binaryPath: string
  source: HerdrBinarySource
}

export type HerdrDiscoveryErrorCode =
  | 'CORE_NOT_RUNNING'
  | 'BINARY_NOT_FOUND'
  | 'BOOTSTRAP_FAILED'
  | 'BOOTSTRAP_TIMEOUT'
  | 'CONNECT_FAILED'

export class HerdrDiscoveryError extends Error {
  readonly code: HerdrDiscoveryErrorCode
  readonly cause?: unknown

  constructor(code: HerdrDiscoveryErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'HerdrDiscoveryError'
    this.code = code
    this.cause = cause
  }
}

export interface HerdrDiscoveryDeps {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homedir?: () => string
  resourcesPath?: string
  isExecutable?: (filePath: string) => Promise<boolean>
  spawn?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess
  dial?: (socketPath: string, timeoutMs: number) => Promise<Socket>
  sleep?: (ms: number) => Promise<void>
}

export interface DiscoverAndConnectOptions {
  settings?: Partial<HerdrCoreSettings>
  forceBootstrap?: boolean
  connectTimeoutMs?: number
  bootstrapTimeoutMs?: number
  onStateChange?: (phase: 'discovering' | 'connecting' | 'bootstrapping') => void
  deps?: HerdrDiscoveryDeps
}

export interface DiscoveredHerdrConnection {
  socket: Socket
  socketPath: string
  session: string
  binaryPath: string | null
  binarySource?: HerdrBinarySource | null
  ownership: Exclude<HerdrOwnership, 'none'>
}

function getPlatform(deps?: HerdrDiscoveryDeps): NodeJS.Platform {
  return deps?.platform ?? process.platform
}

function getPathApi(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix
}

function expandHomePath(rawPath: string, home: string, platform: NodeJS.Platform): string {
  if (rawPath === '~') return home
  if (rawPath.startsWith('~/') || (platform === 'win32' && rawPath.startsWith('~\\'))) {
    const pathApi = getPathApi(platform)
    return pathApi.join(home, rawPath.slice(2))
  }
  return rawPath
}

export function resolveHerdrSession(
  settings?: Partial<HerdrCoreSettings>,
  deps?: Pick<HerdrDiscoveryDeps, 'env'>
): string {
  const env = deps?.env ?? process.env
  const fromSettings = settings?.session?.trim()
  if (fromSettings) return fromSettings
  const fromEnv = env.HC_SESSION?.trim()
  if (fromEnv) return fromEnv
  return DEFAULT_HERDR_SESSION
}

/**
 * Resolves the herdr-core IPC socket path using strict precedence:
 * 1. `settings.herdrCore.socketPath`
 * 2. `process.env.HC_SOCKET`
 * 3. Default platform socket path for resolved session (`HC_SESSION` / `'default'`).
 */
export function resolveHerdrSocketPath(
  settings?: Partial<HerdrCoreSettings>,
  deps?: Pick<HerdrDiscoveryDeps, 'env' | 'platform' | 'homedir'>
): ResolvedHerdrSocket {
  const env = deps?.env ?? process.env
  const platform = getPlatform(deps)
  const home = (deps?.homedir ?? os.homedir)()
  const session = resolveHerdrSession(settings, { env })

  const fromSettings = settings?.socketPath?.trim()
  if (fromSettings) {
    return {
      socketPath: expandHomePath(fromSettings, home, platform),
      session,
      source: 'settings'
    }
  }

  const fromEnv = env.HC_SOCKET?.trim()
  if (fromEnv) {
    return {
      socketPath: expandHomePath(fromEnv, home, platform),
      session,
      source: 'env'
    }
  }

  if (platform === 'win32') {
    return {
      socketPath: `\\\\.\\pipe\\herdr-core-${session}`,
      session,
      source: 'default'
    }
  }

  const xdgStateHome = env.XDG_STATE_HOME?.trim()
  const stateRoot = xdgStateHome
    ? expandHomePath(xdgStateHome, home, platform)
    : path.posix.join(home, '.local', 'state')

  return {
    socketPath: path.posix.join(stateRoot, 'herdr-core', session, `${session}.sock`),
    session,
    source: 'default'
  }
}

export async function defaultIsExecutable(
  filePath: string,
  platform: NodeJS.Platform = process.platform
): Promise<boolean> {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) return false
    await access(filePath, platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Resolves the `herdr-core` binary path in strict priority order:
 * 1. `settings.herdrCore.binaryPath`
 * 2. `PATH` entries
 * 3. `~/.local/bin/herdr-core`
 * 4. `~/.local/share/herdr-core/active/Herdr Core.app/Contents/MacOS/herdr-core`
 * 5. `process.resourcesPath/herdr-core/herdr-core` or `process.resourcesPath/herdr-core`
 */
export async function resolveHerdrBinaryPath(
  settings?: Partial<HerdrCoreSettings>,
  deps?: Pick<HerdrDiscoveryDeps, 'env' | 'platform' | 'homedir' | 'resourcesPath' | 'isExecutable'>
): Promise<ResolvedHerdrBinary | null> {
  const env = deps?.env ?? process.env
  const platform = getPlatform(deps)
  const pathApi = getPathApi(platform)
  const home = (deps?.homedir ?? os.homedir)()
  const binaryName = platform === 'win32' ? 'herdr-core.exe' : 'herdr-core'
  const check = deps?.isExecutable ?? ((target: string) => defaultIsExecutable(target, platform))

  const candidates: Array<{ candidate: string; source: HerdrBinarySource }> = []
  const seen = new Set<string>()
  const pushCandidate = (candidate: string | undefined, source: HerdrBinarySource): void => {
    const trimmed = candidate?.trim()
    if (!trimmed) return
    const expanded = expandHomePath(trimmed, home, platform)
    if (seen.has(expanded)) return
    seen.add(expanded)
    candidates.push({ candidate: expanded, source })
  }

  pushCandidate(settings?.binaryPath, 'settings')

  const rawPath = env.PATH ?? env.Path ?? ''
  const delimiter = platform === 'win32' ? ';' : ':'
  for (const dir of rawPath.split(delimiter)) {
    const trimmedDir = dir.trim()
    if (!trimmedDir) continue
    pushCandidate(pathApi.join(trimmedDir, binaryName), 'path')
  }

  pushCandidate(pathApi.join(home, '.local', 'bin', binaryName), 'local-bin')

  if (platform === 'darwin') {
    pushCandidate(
      path.posix.join(
        home,
        '.local',
        'share',
        'herdr-core',
        'active',
        'Herdr Core.app',
        'Contents',
        'MacOS',
        'herdr-core'
      ),
      'macos-bundle'
    )
  }

  const resourcesPath =
    deps?.resourcesPath ?? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath?.trim()) {
    const trimmedResources = resourcesPath.trim()
    pushCandidate(pathApi.join(trimmedResources, 'herdr-core', binaryName), 'resources')
    pushCandidate(pathApi.join(trimmedResources, binaryName), 'resources')
  }

  for (const entry of candidates) {
    if (await check(entry.candidate)) {
      return {
        binaryPath: entry.candidate,
        source: entry.source
      }
    }
  }

  return null
}

export function isBootstrapEligibleDialError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return code === 'ENOENT' || code === 'ECONNREFUSED'
}

export function dialHerdrSocket(
  socketPath: string,
  timeoutMs = DEFAULT_HERDR_CONNECT_TIMEOUT_MS
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    let settled = false
    const socket = net.createConnection(socketPath)

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      socket.destroy()
      const err = new Error(`Timed out connecting to herdr-core socket ${socketPath}`) as Error & {
        code?: string
      }
      err.code = 'ETIMEDOUT'
      reject(err)
    }, timeoutMs)

    const cleanup = (): void => {
      clearTimeout(timer)
      socket.removeListener('connect', onConnect)
      socket.removeListener('error', onError)
    }

    const onConnect = (): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(socket)
    }

    const onError = (error: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      socket.destroy()
      reject(error)
    }

    socket.once('connect', onConnect)
    socket.once('error', onError)
  })
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Spawns `herdr-core server start --json` detached with a strict 5s bound.
 * NEVER invokes `server stop` or `server restart`.
 */
export async function bootstrapHerdrCore(options: {
  binaryPath: string
  resolvedSocket: ResolvedHerdrSocket
  timeoutMs?: number
  deps?: Pick<HerdrDiscoveryDeps, 'env' | 'spawn'>
}): Promise<void> {
  const {
    binaryPath,
    resolvedSocket,
    timeoutMs = DEFAULT_HERDR_BOOTSTRAP_TIMEOUT_MS,
    deps
  } = options
  const spawnFn = deps?.spawn ?? nodeSpawn
  const childEnv: NodeJS.ProcessEnv = {
    ...(deps?.env ?? process.env),
    HC_SESSION: resolvedSocket.session
  }
  if (resolvedSocket.source === 'settings' || resolvedSocket.source === 'env') {
    childEnv.HC_SOCKET = resolvedSocket.socketPath
  } else {
    delete childEnv.HC_SOCKET
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let stderr = ''
    let child: ChildProcess

    try {
      child = spawnFn(binaryPath, ['server', 'start', '--json'], {
        detached: true,
        windowsHide: true,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (error) {
      reject(
        new HerdrDiscoveryError(
          'BOOTSTRAP_FAILED',
          `Failed to spawn ${binaryPath} server start: ${error instanceof Error ? error.message : String(error)}`,
          error
        )
      )
      return
    }

    const releaseChild = (): void => {
      try {
        child.stdout?.destroy()
        child.stderr?.destroy()
      } catch {
        // Ignore stream cleanup failures on already-closed pipes.
      }
      try {
        child.unref()
      } catch {
        // Ignore if test double omits unref.
      }
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      releaseChild()
      reject(
        new HerdrDiscoveryError(
          'BOOTSTRAP_TIMEOUT',
          `Timed out waiting ${timeoutMs}ms for herdr-core server start`
        )
      )
    }, timeoutMs)

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      releaseChild()
      if (error) reject(error)
      else resolve()
    }

    child.stderr?.on('data', (chunk: Buffer | string) => {
      if (stderr.length < 2048) {
        stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      }
    })
    child.stdout?.resume()

    child.once('error', (error) => {
      finish(
        new HerdrDiscoveryError(
          'BOOTSTRAP_FAILED',
          `herdr-core bootstrap process error: ${error.message}`,
          error
        )
      )
    })

    child.once('exit', (code, signal) => {
      if (code === 0) {
        finish()
        return
      }
      const detail = stderr.trim() || (signal ? `signal ${signal}` : `exit code ${String(code)}`)
      finish(
        new HerdrDiscoveryError('BOOTSTRAP_FAILED', `herdr-core server start failed: ${detail}`)
      )
    })
  })
}

/**
 * Resolves the herdr-core socket, dials it, and optionally bootstraps a managed
 * daemon on ENOENT/ECONNREFUSED when `autoStart` or `forceBootstrap` is enabled.
 */
export async function discoverAndConnectHerdrSocket(
  options: DiscoverAndConnectOptions = {}
): Promise<DiscoveredHerdrConnection> {
  const {
    settings,
    forceBootstrap = false,
    connectTimeoutMs = DEFAULT_HERDR_CONNECT_TIMEOUT_MS,
    bootstrapTimeoutMs = DEFAULT_HERDR_BOOTSTRAP_TIMEOUT_MS,
    onStateChange,
    deps
  } = options
  const dial = deps?.dial ?? dialHerdrSocket
  const sleep = deps?.sleep ?? defaultSleep

  onStateChange?.('discovering')
  const resolvedSocket = resolveHerdrSocketPath(settings, deps)
  const resolvedBinary = await resolveHerdrBinaryPath(settings, deps)

  onStateChange?.('connecting')
  try {
    const socket = await dial(resolvedSocket.socketPath, connectTimeoutMs)
    return {
      socket,
      socketPath: resolvedSocket.socketPath,
      session: resolvedSocket.session,
      binaryPath: resolvedBinary?.binaryPath ?? null,
      binarySource: resolvedBinary?.source ?? null,
      ownership: 'external'
    }
  } catch (error) {
    if (!isBootstrapEligibleDialError(error)) {
      throw new HerdrDiscoveryError(
        'CONNECT_FAILED',
        `Failed to connect to herdr-core at ${resolvedSocket.socketPath}: ${error instanceof Error ? error.message : String(error)}`,
        error
      )
    }

    const shouldBootstrap = forceBootstrap || settings?.autoStart !== false
    if (!shouldBootstrap) {
      throw new HerdrDiscoveryError(
        'CORE_NOT_RUNNING',
        `herdr-core is not running at ${resolvedSocket.socketPath} and autoStart is disabled`,
        error
      )
    }

    if (!resolvedBinary) {
      throw new HerdrDiscoveryError(
        'BINARY_NOT_FOUND',
        'herdr-core binary was not found in settings, PATH, ~/.local/bin, macOS bundle, or resources',
        error
      )
    }

    onStateChange?.('bootstrapping')
    await bootstrapHerdrCore({
      binaryPath: resolvedBinary.binaryPath,
      resolvedSocket,
      timeoutMs: bootstrapTimeoutMs,
      deps
    })

    onStateChange?.('connecting')
    let lastDialError: unknown
    const deadline = Date.now() + connectTimeoutMs
    for (let attempt = 0; attempt < MAX_RETRY_DIAL_ATTEMPTS; attempt += 1) {
      const remaining = Math.max(200, deadline - Date.now())
      try {
        const socket = await dial(resolvedSocket.socketPath, remaining)
        return {
          socket,
          socketPath: resolvedSocket.socketPath,
          session: resolvedSocket.session,
          binaryPath: resolvedBinary.binaryPath,
          binarySource: resolvedBinary.source,
          ownership: 'managed'
        }
      } catch (retryError) {
        lastDialError = retryError
        if (!isBootstrapEligibleDialError(retryError) || Date.now() >= deadline) {
          break
        }
        await sleep(RETRY_DIAL_DELAY_MS)
      }
    }

    throw new HerdrDiscoveryError(
      'CONNECT_FAILED',
      `Failed to connect after bootstrapping herdr-core at ${resolvedSocket.socketPath}: ${lastDialError instanceof Error ? lastDialError.message : String(lastDialError)}`,
      lastDialError
    )
  }
}
