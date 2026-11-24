import type { HerdrCoreSettings } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { HerdrBinaryInfo, HerdrBinarySource } from '@talex-touch/utils/transport/events/herdr'
import type {
  HerdrBinarySource as DiscoveryBinarySource,
  HerdrDiscoveryDeps
} from './socket-discovery'
import { Buffer } from 'node:buffer'
import { execFile as nodeExecFile } from 'node:child_process'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import process from 'node:process'
import { resolveHerdrBinaryPath } from './socket-discovery'

export const DEFAULT_HERDR_VERSION_TIMEOUT_MS = 2_000
const MAX_VERSION_BUFFER_BYTES = 16 * 1024
const SHA256_HEX_RE = /^[0-9a-f]{64}$/i
const SEMVER_TOKEN_RE = /(?:^|\s)v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?:\s|$)/

const SUPPORTED_HERDR_PLATFORMS: Readonly<Record<string, readonly string[]>> = {
  darwin: ['arm64', 'x64'],
  linux: ['x64', 'arm64'],
  win32: ['x64', 'arm64']
}

export interface HerdrBinarySha256Result {
  ok: boolean
  actual: string | null
  reason?: string
}

export interface HerdrBinaryFileStat {
  mtimeMs: number
  size: number
}

export interface HerdrBinaryManagerDeps {
  discoveryDeps?: Pick<
    HerdrDiscoveryDeps,
    'env' | 'platform' | 'homedir' | 'resourcesPath' | 'isExecutable'
  >
  platform?: NodeJS.Platform
  arch?: string
  versionTimeoutMs?: number
  execVersion?: (binaryPath: string, timeoutMs: number) => Promise<string>
  statFile?: (filePath: string) => Promise<HerdrBinaryFileStat | null>
}

interface CachedVersionEntry {
  mtimeMs: number
  size: number
  version: string
}

/**
 * Maps internal socket-discovery resolution origins to the public transport contract.
 */
export function mapDiscoveryBinarySource(
  source: DiscoveryBinarySource | null | undefined
): HerdrBinarySource {
  switch (source) {
    case 'settings':
      return 'custom'
    case 'path':
    case 'local-bin':
      return 'system'
    case 'macos-bundle':
      return 'bundle'
    case 'resources':
      return 'packaged-resource'
    default:
      return 'missing'
  }
}

export function isSupportedHerdrPlatform(
  platform: string = process.platform,
  arch: string = process.arch
): boolean {
  const arches = SUPPORTED_HERDR_PLATFORMS[platform]
  return Boolean(arches && arches.includes(arch))
}

export function getHerdrInstallHint(
  platform: string = process.platform,
  arch: string = process.arch
): string {
  if (!isSupportedHerdrPlatform(platform, arch)) {
    return `herdr-core is not supported on ${platform}/${arch}; local PTY fallback remains active.`
  }
  switch (platform) {
    case 'darwin':
      return 'Install herdr-core onto PATH, ~/.local/bin/herdr-core, or Herdr Core.app, or configure a custom binary path.'
    case 'win32':
      return 'Install herdr-core.exe onto PATH or configure a custom binary path.'
    default:
      return 'Install herdr-core onto PATH or ~/.local/bin/herdr-core, or configure a custom binary path.'
  }
}

/**
 * Extracts a semver version from `herdr-core --version` output (e.g. `hc 0.1.21` -> `0.1.21`).
 */
export function parseHerdrVersionOutput(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const match = SEMVER_TOKEN_RE.exec(trimmed)
  return match?.[1] ?? null
}

/**
 * Streams a file through SHA-256 and returns the lowercase 64-character hex digest.
 */
export function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => {
      hash.update(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      resolve(hash.digest('hex'))
    })
  })
}

/**
 * Fail-closed SHA-256 verification using constant-time digest comparison.
 */
export async function verifyBinarySha256(
  filePath: string,
  expectedSha256: string
): Promise<HerdrBinarySha256Result> {
  const trimmedExpected = typeof expectedSha256 === 'string' ? expectedSha256.trim() : ''
  if (!SHA256_HEX_RE.test(trimmedExpected)) {
    return {
      ok: false,
      actual: null,
      reason: 'Invalid SHA-256 digest format (expected 64 hexadecimal characters)'
    }
  }

  let actual: string
  try {
    actual = await computeFileSha256(filePath)
  } catch (error) {
    return {
      ok: false,
      actual: null,
      reason: `Failed to read binary for SHA-256 verification: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  const actualBuf = Buffer.from(actual.toLowerCase(), 'hex')
  const expectedBuf = Buffer.from(trimmedExpected.toLowerCase(), 'hex')
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return {
      ok: false,
      actual,
      reason: `SHA-256 mismatch: expected ${trimmedExpected.toLowerCase()}, got ${actual}`
    }
  }

  return { ok: true, actual }
}

function defaultExecVersion(binaryPath: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    nodeExecFile(
      binaryPath,
      ['--version'],
      {
        timeout: timeoutMs,
        maxBuffer: MAX_VERSION_BUFFER_BYTES,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error)
          return
        }
        resolve(`${String(stdout ?? '')}\n${String(stderr ?? '')}`)
      }
    )
  })
}

async function defaultStatFile(filePath: string): Promise<HerdrBinaryFileStat | null> {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) return null
    return { mtimeMs: info.mtimeMs, size: info.size }
  } catch {
    return null
  }
}

/**
 * Resolves `herdr-core` binary provenance, caches bounded `--version` probes by file stat,
 * and produces `HerdrBinaryInfo` snapshots for `HerdrRuntimeStore`.
 */
export class HerdrBinaryManager {
  private readonly discoveryDeps?: Pick<
    HerdrDiscoveryDeps,
    'env' | 'platform' | 'homedir' | 'resourcesPath' | 'isExecutable'
  >
  private readonly platform: NodeJS.Platform
  private readonly arch: string
  private readonly versionTimeoutMs: number
  private readonly execVersion: (binaryPath: string, timeoutMs: number) => Promise<string>
  private readonly statFile: (filePath: string) => Promise<HerdrBinaryFileStat | null>
  private readonly versionCache = new Map<string, CachedVersionEntry>()

  constructor(deps: HerdrBinaryManagerDeps = {}) {
    this.discoveryDeps = deps.discoveryDeps
    this.platform = deps.platform ?? deps.discoveryDeps?.platform ?? process.platform
    this.arch = deps.arch ?? process.arch
    this.versionTimeoutMs = deps.versionTimeoutMs ?? DEFAULT_HERDR_VERSION_TIMEOUT_MS
    this.execVersion = deps.execVersion ?? defaultExecVersion
    this.statFile = deps.statFile ?? defaultStatFile
  }

  getCachedVersion(binaryPath: string): string | null {
    return this.versionCache.get(binaryPath)?.version ?? null
  }

  clearCache(): void {
    this.versionCache.clear()
  }

  buildMissingInfo(): HerdrBinaryInfo {
    const supported = isSupportedHerdrPlatform(this.platform, this.arch)
    return {
      source: 'missing',
      path: null,
      version: null,
      platform: this.platform,
      arch: this.arch,
      supported,
      installHint: getHerdrInstallHint(this.platform, this.arch)
    }
  }

  buildFromPath(
    binaryPath: string,
    discoverySource: DiscoveryBinarySource,
    versionOverride?: string | null
  ): HerdrBinaryInfo {
    const supported = isSupportedHerdrPlatform(this.platform, this.arch)
    const version =
      versionOverride !== undefined ? versionOverride : this.getCachedVersion(binaryPath)
    return {
      source: mapDiscoveryBinarySource(discoverySource),
      path: binaryPath,
      version,
      platform: this.platform,
      arch: this.arch,
      supported,
      installHint: null
    }
  }

  async probeVersion(binaryPath: string): Promise<string | null> {
    const fileStat = await this.statFile(binaryPath)
    const cached = this.versionCache.get(binaryPath)
    if (
      fileStat &&
      cached &&
      cached.mtimeMs === fileStat.mtimeMs &&
      cached.size === fileStat.size
    ) {
      return cached.version
    }

    let version: string | null = null
    try {
      const raw = await this.execVersion(binaryPath, this.versionTimeoutMs)
      version = parseHerdrVersionOutput(raw)
    } catch {
      version = null
    }

    if (fileStat && version !== null) {
      this.versionCache.set(binaryPath, {
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
        version
      })
    } else if (cached) {
      this.versionCache.delete(binaryPath)
    }

    return version
  }

  async inspect(
    settings?: Partial<HerdrCoreSettings>,
    options: { probeVersion?: boolean } = {}
  ): Promise<HerdrBinaryInfo> {
    const resolved = await resolveHerdrBinaryPath(settings, {
      ...this.discoveryDeps,
      platform: this.platform
    })
    if (!resolved) {
      return this.buildMissingInfo()
    }

    const version =
      options.probeVersion === false
        ? this.getCachedVersion(resolved.binaryPath)
        : await this.probeVersion(resolved.binaryPath)

    return this.buildFromPath(resolved.binaryPath, resolved.source, version)
  }
}
