import type {
  PluginInstallRequest,
  PluginInstallResult,
  PluginProvider,
  PluginProviderContext
} from '@talex-touch/utils/plugin/providers'
import type { NpmTarballDistInfo } from '../npm-tarball-inspector'
import { createRequire } from 'node:module'
import process from 'node:process'
import {
  DEFAULT_NPM_REGISTRY_URL,
  encodeNpmPackagePath,
  isAllowedNpmRegistryUrl,
  NPM_ABBREVIATED_PACKUMENT_ACCEPT,
  parseNpmPluginSource,
  resolveNpmRegistryUrl
} from '@talex-touch/utils/plugin'
import { resolvePackageDownloadTimeout } from '@talex-touch/utils/plugin/install-budgets'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers'
import fse from 'fs-extra'
import { getEnabledNpmSources } from '../../../service/store-api.service'
import { getNetworkService } from '../../network'
import { inspectNpmPluginTarball } from '../npm-tarball-inspector'
import { createProviderLogger } from './logger'
import { downloadToTempFile } from './utils'

interface NpmVersionMetadata {
  name?: string
  version?: string
  deprecated?: string | boolean
  dist?: NpmTarballDistInfo
}

interface NpmAbbreviatedPackument {
  name?: string
  'dist-tags'?: Record<string, string>
  versions?: Record<string, NpmVersionMetadata>
}

export interface NpmPluginProviderOptions {
  registry?: string
  allowLocalHttp?: boolean
}

interface ParsedSemver {
  major: number
  minor: number
  patch: number
  prerelease: Array<number | string>
  raw: string
}

interface SemverComparator {
  operator: '=' | '>' | '>=' | '<' | '<='
  target: ParsedSemver
  hasPrerelease: boolean
}

const EXACT_SEMVER_RE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/i

const PARTIAL_SEMVER_RE =
  /^v?(?:(\*|x|X)|(0|[1-9]\d*))(?:\.(?:(\*|x|X)|(0|[1-9]\d*))(?:\.(?:(\*|x|X)|(0|[1-9]\d*))(?:-(.+?))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?)?)?$/i

function parsePrerelease(raw?: string): Array<number | string> {
  if (!raw) return []
  return raw.split('.').map((part) => {
    if (/^(?:0|[1-9]\d*)$/.test(part)) {
      return Number.parseInt(part, 10)
    }
    return part
  })
}

export function parseStrictSemver(version: string): ParsedSemver | null {
  const trimmed = version.trim()
  const match = EXACT_SEMVER_RE.exec(trimmed)
  if (!match) return null
  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2]!, 10),
    patch: Number.parseInt(match[3]!, 10),
    prerelease: parsePrerelease(match[4]),
    raw: trimmed
  }
}

export function compareStrictSemver(a: ParsedSemver, b: ParsedSemver): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1

  const aPre = a.prerelease
  const bPre = b.prerelease
  if (aPre.length === 0 && bPre.length === 0) return 0
  if (aPre.length === 0) return 1
  if (bPre.length === 0) return -1

  const len = Math.max(aPre.length, bPre.length)
  for (let index = 0; index < len; index += 1) {
    const left = aPre[index]
    const right = bPre[index]
    if (left === undefined) return -1
    if (right === undefined) return 1
    if (left === right) continue
    if (typeof left === 'number' && typeof right === 'string') return -1
    if (typeof left === 'string' && typeof right === 'number') return 1
    return left < right ? -1 : 1
  }
  return 0
}

interface PartialVersion {
  major: number | null
  minor: number | null
  patch: number | null
  prerelease: Array<number | string>
}

function parsePartialVersion(token: string): PartialVersion | null {
  const match = PARTIAL_SEMVER_RE.exec(token.trim())
  if (!match) return null

  const major = match[1] ? null : Number.parseInt(match[2]!, 10)
  const minor =
    major === null || match[3] || match[4] === undefined ? null : Number.parseInt(match[4]!, 10)
  const patch =
    minor === null || match[5] || match[6] === undefined ? null : Number.parseInt(match[6]!, 10)
  const prerelease = patch !== null && match[7] ? parsePrerelease(match[7]) : []

  return { major, minor, patch, prerelease }
}

function makeSemver(
  major: number,
  minor: number,
  patch: number,
  prerelease: Array<number | string> = []
): ParsedSemver {
  return { major, minor, patch, prerelease, raw: `${major}.${minor}.${patch}` }
}

function expandComparatorToken(token: string): SemverComparator[] | null {
  const trimmed = token.trim()
  if (!trimmed || trimmed === '*' || trimmed === 'x' || trimmed === 'X') {
    return [{ operator: '>=', target: makeSemver(0, 0, 0), hasPrerelease: false }]
  }

  const opMatch = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(trimmed)
  if (!opMatch) return null
  const op = (opMatch[1] ?? '=') as '=' | '>' | '>=' | '<' | '<=' | '^' | '~'
  const partial = parsePartialVersion(opMatch[2]!)
  if (!partial) return null

  const { major, minor, patch, prerelease } = partial
  const hasPrerelease = prerelease.length > 0

  if (major === null) {
    if (op === '<' || op === '>') return null
    return [{ operator: '>=', target: makeSemver(0, 0, 0), hasPrerelease: false }]
  }

  if (op === '^') {
    const lower = makeSemver(major, minor ?? 0, patch ?? 0, prerelease)
    let upper: ParsedSemver
    if (major > 0) {
      upper = makeSemver(major + 1, 0, 0, [0])
    } else if (minor === null) {
      upper = makeSemver(1, 0, 0, [0])
    } else if (minor > 0) {
      upper = makeSemver(0, minor + 1, 0, [0])
    } else if (patch === null) {
      upper = makeSemver(0, 1, 0, [0])
    } else {
      upper = makeSemver(0, 0, patch + 1, [0])
    }
    return [
      { operator: '>=', target: lower, hasPrerelease },
      { operator: '<', target: upper, hasPrerelease: false }
    ]
  }

  if (op === '~') {
    const lower = makeSemver(major, minor ?? 0, patch ?? 0, prerelease)
    const upper =
      minor === null ? makeSemver(major + 1, 0, 0, [0]) : makeSemver(major, minor + 1, 0, [0])
    return [
      { operator: '>=', target: lower, hasPrerelease },
      { operator: '<', target: upper, hasPrerelease: false }
    ]
  }

  // Wildcard/partial comparisons
  if (minor === null) {
    if (op === '=') {
      return [
        { operator: '>=', target: makeSemver(major, 0, 0), hasPrerelease: false },
        { operator: '<', target: makeSemver(major + 1, 0, 0, [0]), hasPrerelease: false }
      ]
    }
    if (op === '>') {
      return [{ operator: '>=', target: makeSemver(major + 1, 0, 0), hasPrerelease: false }]
    }
    if (op === '>=') {
      return [{ operator: '>=', target: makeSemver(major, 0, 0), hasPrerelease: false }]
    }
    if (op === '<=') {
      return [{ operator: '<', target: makeSemver(major + 1, 0, 0, [0]), hasPrerelease: false }]
    }
    return [{ operator: '<', target: makeSemver(major, 0, 0, [0]), hasPrerelease: false }]
  }

  if (patch === null) {
    if (op === '=') {
      return [
        { operator: '>=', target: makeSemver(major, minor, 0), hasPrerelease: false },
        { operator: '<', target: makeSemver(major, minor + 1, 0, [0]), hasPrerelease: false }
      ]
    }
    if (op === '>') {
      return [{ operator: '>=', target: makeSemver(major, minor + 1, 0), hasPrerelease: false }]
    }
    if (op === '>=') {
      return [{ operator: '>=', target: makeSemver(major, minor, 0), hasPrerelease: false }]
    }
    if (op === '<=') {
      return [{ operator: '<', target: makeSemver(major, minor + 1, 0, [0]), hasPrerelease: false }]
    }
    return [{ operator: '<', target: makeSemver(major, minor, 0, [0]), hasPrerelease: false }]
  }

  return [
    {
      operator: op,
      target: makeSemver(major, minor, patch, prerelease),
      hasPrerelease
    }
  ]
}

function parseComparatorBranch(branch: string): SemverComparator[] | null {
  const trimmed = branch.trim()
  if (!trimmed) return null

  if (trimmed.includes(' - ')) {
    const parts = trimmed.split(/\s+-\s+/)
    if (parts.length !== 2) return null
    const lower = expandComparatorToken(`>=${parts[0]!.trim()}`)
    const upper = expandComparatorToken(`<=${parts[1]!.trim()}`)
    if (!lower || !upper) return null
    return [...lower, ...upper]
  }

  const normalized = trimmed.replace(/([<>]=?|=|\^|~)\s+/g, '$1')
  const tokens = normalized.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  const comparators: SemverComparator[] = []
  for (const token of tokens) {
    const expanded = expandComparatorToken(token)
    if (!expanded) return null
    comparators.push(...expanded)
  }
  return comparators
}

function matchesComparator(version: ParsedSemver, comp: SemverComparator): boolean {
  const cmp = compareStrictSemver(version, comp.target)
  switch (comp.operator) {
    case '=':
      return cmp === 0
    case '>':
      return cmp === 1
    case '>=':
      return cmp >= 0
    case '<':
      return cmp === -1
    case '<=':
      return cmp <= 0
  }
}

export function satisfiesSemverRange(version: string, range: string): boolean {
  const parsed = parseStrictSemver(version)
  if (!parsed) return false

  const branches = range.split('||')
  for (const rawBranch of branches) {
    const comparators = parseComparatorBranch(rawBranch)
    if (!comparators) continue

    const allMatch = comparators.every((comp) => matchesComparator(parsed, comp))
    if (!allMatch) continue

    if (parsed.prerelease.length > 0) {
      const prereleaseAllowed = comparators.some(
        (comp) =>
          comp.hasPrerelease &&
          comp.target.major === parsed.major &&
          comp.target.minor === parsed.minor &&
          comp.target.patch === parsed.patch
      )
      if (!prereleaseAllowed) continue
    }

    return true
  }

  return false
}

function isDeprecatedVersion(meta: NpmVersionMetadata | undefined): boolean {
  if (!meta) return true
  if (typeof meta.deprecated === 'boolean') return meta.deprecated
  if (typeof meta.deprecated === 'string') return meta.deprecated.trim().length > 0
  return false
}

export function resolvePackumentVersion(
  packument: NpmAbbreviatedPackument,
  requestedSpec?: string
): { resolvedVersion: string; distTag?: string; versionMeta: NpmVersionMetadata } | null {
  const distTags = packument['dist-tags'] ?? {}
  const versions = packument.versions ?? {}

  if (!requestedSpec) {
    const latest = distTags.latest
    if (typeof latest === 'string' && Object.prototype.hasOwnProperty.call(versions, latest)) {
      return {
        resolvedVersion: latest,
        distTag: 'latest',
        versionMeta: versions[latest]!
      }
    }
    return null
  }

  // 1. Dist-tag match (e.g. `latest`, `beta`, `next`)
  if (
    Object.prototype.hasOwnProperty.call(distTags, requestedSpec) &&
    typeof distTags[requestedSpec] === 'string'
  ) {
    const tagTarget = distTags[requestedSpec]!
    if (Object.prototype.hasOwnProperty.call(versions, tagTarget)) {
      return {
        resolvedVersion: tagTarget,
        distTag: requestedSpec,
        versionMeta: versions[tagTarget]!
      }
    }
    return null
  }

  // 2. Exact version match
  if (Object.prototype.hasOwnProperty.call(versions, requestedSpec)) {
    return {
      resolvedVersion: requestedSpec,
      versionMeta: versions[requestedSpec]!
    }
  }

  // 3. Semver range: pick max non-deprecated satisfying version
  let bestVersion: ParsedSemver | null = null
  let bestKey: string | null = null

  for (const [verKey, meta] of Object.entries(versions)) {
    if (isDeprecatedVersion(meta)) continue
    if (!satisfiesSemverRange(verKey, requestedSpec)) continue
    const parsedVer = parseStrictSemver(verKey)
    if (!parsedVer) continue
    if (!bestVersion || compareStrictSemver(parsedVer, bestVersion) === 1) {
      bestVersion = parsedVer
      bestKey = verKey
    }
  }

  if (bestKey && versions[bestKey]) {
    return {
      resolvedVersion: bestKey,
      versionMeta: versions[bestKey]!
    }
  }

  return null
}

function isLocalHttpRegistryAllowed(explicitOverride?: boolean): boolean {
  if (typeof explicitOverride === 'boolean') return explicitOverride
  if (!process.versions?.electron) return false
  try {
    const req = createRequire(import.meta.url)
    const electron = req('electron') as { app?: { isPackaged?: boolean } }
    return electron?.app?.isPackaged === false
  } catch {
    return false
  }
}

function validateTarballUrl(tarballUrl: string, allowLocalHttp: boolean): string {
  let parsed: URL
  try {
    parsed = new URL(tarballUrl)
  } catch {
    throw new Error('PLUGIN_NPM_TARBALL_URL_INVALID')
  }

  if (parsed.username || parsed.password) {
    throw new Error('PLUGIN_NPM_TARBALL_URL_INVALID')
  }

  // Validate protocol + host policy against canonical registry URL rules on origin
  if (!isAllowedNpmRegistryUrl(parsed.origin, { allowLocalHttp })) {
    throw new Error('PLUGIN_NPM_TARBALL_URL_DISALLOWED')
  }

  return parsed.toString()
}

export class NpmPluginProvider implements PluginProvider {
  readonly type = PluginProviderType.NPM
  private readonly log = createProviderLogger(this.type)
  private readonly options: NpmPluginProviderOptions

  constructor(options: NpmPluginProviderOptions = {}) {
    this.options = options
  }

  private resolveRegistry(request: PluginInstallRequest, allowLocalHttp: boolean): string {
    const requestRegistry =
      typeof request.metadata?.registry === 'string' ? request.metadata.registry.trim() : ''
    if (requestRegistry) {
      if (!isAllowedNpmRegistryUrl(requestRegistry, { allowLocalHttp })) {
        throw new Error('PLUGIN_NPM_REGISTRY_INVALID')
      }
      return resolveNpmRegistryUrl([requestRegistry], { allowLocalHttp })
    }

    if (this.options.registry) {
      return resolveNpmRegistryUrl([this.options.registry], { allowLocalHttp })
    }

    const storeCandidates: string[] = []
    try {
      const enabledNpmSources = getEnabledNpmSources()
      for (const source of enabledNpmSources) {
        const configRegistry =
          typeof source.config?.registryUrl === 'string' ? source.config.registryUrl.trim() : ''
        if (configRegistry && isAllowedNpmRegistryUrl(configRegistry, { allowLocalHttp })) {
          storeCandidates.push(configRegistry)
          continue
        }
        const sourceUrl = typeof source.url === 'string' ? source.url.trim() : ''
        if (sourceUrl && isAllowedNpmRegistryUrl(sourceUrl, { allowLocalHttp })) {
          storeCandidates.push(sourceUrl)
        }
      }
    } catch {
      // Storage may not be ready yet; fall back to default registry
    }

    return resolveNpmRegistryUrl([...storeCandidates, DEFAULT_NPM_REGISTRY_URL], { allowLocalHttp })
  }

  canHandle(request: PluginInstallRequest): boolean {
    if (typeof request?.source !== 'string') return false
    return (
      parseNpmPluginSource(request.source, {
        allowAnyBarePackageName: request.hintType === PluginProviderType.NPM
      }) !== null
    )
  }

  async install(
    request: PluginInstallRequest,
    context?: PluginProviderContext
  ): Promise<PluginInstallResult> {
    this.log.info('Preparing NPM plugin install', {
      meta: { source: request.source, hintType: request.hintType }
    })

    let downloadedFilePath: string | undefined
    try {
      const parsed = parseNpmPluginSource(request.source, {
        allowAnyBarePackageName: request.hintType === PluginProviderType.NPM
      })
      if (!parsed) {
        this.log.error('NPM source parsing failed', {
          meta: { source: request.source }
        })
        throw new Error('PLUGIN_SOURCE_INVALID')
      }

      const allowLocalHttp = isLocalHttpRegistryAllowed(this.options.allowLocalHttp)
      const registry = this.resolveRegistry(request, allowLocalHttp)
      const encodedPackagePath = encodeNpmPackagePath(parsed.packageName)
      const metadataUrl = `${registry}/${encodedPackagePath}`

      this.log.debug('Fetching abbreviated NPM packument', {
        meta: { packageName: parsed.packageName, registry, spec: parsed.spec ?? 'latest' }
      })

      const response = await getNetworkService().request<NpmAbbreviatedPackument>({
        method: 'GET',
        url: metadataUrl,
        timeoutMs: 30_000,
        responseType: 'json',
        headers: {
          Accept: NPM_ABBREVIATED_PACKUMENT_ACCEPT
        },
        validateStatus: [200, 404]
      })

      if (response.status === 404) {
        throw new Error('PLUGIN_NOT_FOUND')
      }
      if (response.status !== 200 || !response.data || typeof response.data !== 'object') {
        throw new Error(`NETWORK_HTTP_STATUS_${response.status}`)
      }

      const resolved = resolvePackumentVersion(response.data, parsed.spec)
      if (!resolved) {
        throw new Error('PLUGIN_VERSION_UNAVAILABLE')
      }

      const { resolvedVersion, distTag, versionMeta } = resolved
      const rawTarballUrl = versionMeta.dist?.tarball
      if (typeof rawTarballUrl !== 'string' || !rawTarballUrl.trim()) {
        throw new Error('PLUGIN_VERSION_UNAVAILABLE')
      }

      const tarballUrl = validateTarballUrl(rawTarballUrl.trim(), allowLocalHttp)

      this.log.debug('Downloading NPM plugin tarball', {
        meta: { packageName: parsed.packageName, resolvedVersion, tarballUrl }
      })

      downloadedFilePath = await downloadToTempFile(tarballUrl, '.tgz', {
        timeout: resolvePackageDownloadTimeout(versionMeta.dist?.unpackedSize),
        ...context?.downloadOptions
      })

      // Fail-closed pre-extraction inspection: SRI/shasum, bounded gunzip, package/ root,
      // npm-package policy, manifest._files/_signature digest, and static security scan.
      const inspection = await inspectNpmPluginTarball({
        filePath: downloadedFilePath,
        packageName: parsed.packageName,
        expectedVersion: resolvedVersion,
        dist: versionMeta.dist
      })

      this.log.success('NPM plugin tarball verified and prepared', {
        meta: {
          filePath: downloadedFilePath,
          packageName: parsed.packageName,
          resolvedVersion,
          trustTier: inspection.trustTier,
          officialScope: parsed.classification.officialScope
        }
      })

      return {
        provider: this.type,
        // Security invariant: NEVER set official: true from @talex-touch/ naming scope alone.
        // Cryptographic Nexus attestation is required to earn official/nexus-attested trust.
        official: false,
        filePath: downloadedFilePath,
        manifest: inspection.manifest,
        metadata: {
          packageName: parsed.packageName,
          resolvedVersion,
          version: resolvedVersion,
          ...(parsed.spec ? { requestedSpec: parsed.spec } : {}),
          ...(distTag ? { distTag } : {}),
          registry,
          integrity: versionMeta.dist?.integrity ?? inspection.integrity.raw,
          ...(versionMeta.dist?.shasum ? { shasum: versionMeta.dist.shasum } : {}),
          tarballUrl,
          trustTier: inspection.trustTier,
          officialScope: parsed.classification.officialScope,
          artifactSha256: inspection.artifactSha256,
          unstamped: !inspection.integrityStamped,
          ...(inspection.fileMapSha256 ? { fileMapSha256: inspection.fileMapSha256 } : {}),
          ...(inspection.provenance ? { provenance: inspection.provenance } : {}),
          securityScanDecision: inspection.securityScan.decision
        }
      }
    } catch (error) {
      if (downloadedFilePath) {
        await fse.remove(downloadedFilePath).catch(() => undefined)
      }
      this.log.error('NPM plugin install failed', {
        meta: { source: request.source },
        error
      })
      throw error
    }
  }
}
