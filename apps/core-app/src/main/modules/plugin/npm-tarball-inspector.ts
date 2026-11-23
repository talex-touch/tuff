import type {
  IManifest,
  NpmPluginTrustTier,
  PluginPackageEntry,
  PluginPackagePolicyResult,
  PluginSecurityScanFile,
  PluginSecurityScanReport,
  TuffNpmPackageMetadata
} from '@talex-touch/utils/plugin'
import { Buffer } from 'node:buffer'
import { createHash, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import zlib from 'node:zlib'
import {
  extractTuffPackageMetadata,
  formatPluginPackageViolation,
  isPluginSecurityScanTextPath,
  NPM_PLUGIN_TARBALL_ROOT_DIR,
  PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES,
  PLUGIN_PACKAGE_MAX_ENTRY_BYTES,
  PLUGIN_PACKAGE_MAX_ENTRY_COUNT,
  PLUGIN_PACKAGE_MAX_EXPANDED_BYTES,
  PLUGIN_SECURITY_MAX_FILE_INSPECTION_BYTES,
  scanPluginPackage,
  serializePluginFileMap,
  validatePluginPackagePolicy
} from '@talex-touch/utils/plugin'
import fse from 'fs-extra'

const TAR_BLOCK_SIZE = 512
const TAR_MAX_METADATA_BLOCK_BYTES = 64 * 1024
export const NPM_TARBALL_MAX_DECOMPRESSED_BYTES =
  PLUGIN_PACKAGE_MAX_EXPANDED_BYTES + 16 * 1024 * 1024

const SRI_ALGO_STRENGTH: Record<'sha512' | 'sha384' | 'sha256', number> = {
  sha512: 3,
  sha384: 2,
  sha256: 1
}
const SRI_TOKEN_RE = /^(sha512|sha384|sha256)-([A-Za-z0-9+/]+=*)(?:\?.*)?$/
const SHA1_HEX_RE = /^[a-f0-9]{40}$/i
const SHA256_FILE_HASH_RE = /^sha256-([a-f0-9]{64})$/i
const WINDOWS_DRIVE_RE = /^[a-z]:/i

export type NpmTarballInspectorErrorCode =
  | 'PLUGIN_NPM_INTEGRITY_MISMATCH'
  | 'PLUGIN_NPM_TARBALL_INVALID'
  | 'PLUGIN_NPM_TARBALL_ROOT_INVALID'
  | 'PLUGIN_PACKAGE_ARCHIVE_SIZE_INVALID'
  | 'PLUGIN_PACKAGE_ARCHIVE_SIZE_EXCEEDED'
  | 'PLUGIN_PACKAGE_EXPANDED_SIZE_EXCEEDED'
  | 'PLUGIN_PACKAGE_ENTRY_COUNT_EXCEEDED'
  | 'PLUGIN_PACKAGE_ENTRY_PATH_INVALID'
  | 'PLUGIN_PACKAGE_ENTRY_TYPE_DENIED'
  | 'PLUGIN_PACKAGE_ENTRY_CASE_COLLISION'
  | 'PLUGIN_PACKAGE_MANIFEST_INVALID'
  | 'PLUGIN_PACKAGE_NPM_PACKAGE_JSON_INVALID'
  | 'PLUGIN_PACKAGE_INTEGRITY_INVALID'
  | 'PLUGIN_PACKAGE_POLICY_REJECTED'
  | 'PLUGIN_SCAN_BLOCKED'
  | 'PLUGIN_SCAN_UNAVAILABLE'

export class NpmTarballInspectorError extends Error {
  readonly code: string

  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'NpmTarballInspectorError'
    this.code = code
  }
}

export interface NpmTarballDistSignature {
  keyid?: string
  sig?: string
}

export interface NpmTarballDistInfo {
  integrity?: string
  shasum?: string
  tarball?: string
  unpackedSize?: number
  signatures?: readonly NpmTarballDistSignature[]
  attestations?: {
    url?: string
    provenance?: {
      predicateType?: string
    }
  }
}

export interface VerifiedTarballIntegrity {
  method: 'sri' | 'shasum'
  algorithm: 'sha512' | 'sha384' | 'sha256' | 'sha1'
  raw: string
  artifactSha256: string
}

export interface NpmTarballProvenanceSummary {
  hasRegistrySignatures: boolean
  signatureKeyIds: string[]
  hasAttestation: boolean
  attestationUrl?: string
  predicateType?: string
}

export interface InspectNpmPluginTarballInput {
  filePath?: string
  buffer?: Buffer
  packageName: string
  expectedVersion: string
  dist?: NpmTarballDistInfo
  allowUnstampedCommunity?: boolean
  maxDecompressedBytes?: number
}

export interface NpmTarballInspectionResult {
  manifest: IManifest
  packageJson: Record<string, unknown>
  tuffMetadata: TuffNpmPackageMetadata | null
  artifactSha256: string
  archiveSize: number
  integrity: VerifiedTarballIntegrity
  integrityStamped: boolean
  fileMapSha256?: string
  trustTier: Extract<NpmPluginTrustTier, 'npm-verified' | 'npm-community'>
  provenance?: NpmTarballProvenanceSummary
  packagePolicy: Extract<PluginPackagePolicyResult, { ok: true }>
  securityScan: PluginSecurityScanReport
  entries: readonly PluginPackageEntry[]
}

export interface ParsedTarArchive {
  entries: PluginPackageEntry[]
  files: Map<string, Buffer>
  strippedRootDir: string | null
  expandedBytes: number
}

export interface ExtractTgzSafelyOptions {
  /**
   * `'auto'` (default): strip `package/` root directory when all entries live under `package/`.
   * Explicit string (e.g. `'package'`): require and strip that root directory.
   * `false`: do not strip any root directory.
   */
  stripRootDir?: string | 'auto' | false
  maxDecompressedBytes?: number
  skipNodeModules?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function safeDigestEqual(actual: Buffer, expected: Buffer): boolean {
  if (actual.length === 0 || actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

/**
 * Verify `.tgz` bytes against npm `dist.integrity` (SRI sha512/sha384/sha256)
 * or `dist.shasum` (SHA-1 fallback). Fails closed if missing, malformed, or mismatched.
 */
export function verifyNpmTarballIntegrity(
  tgzBuffer: Buffer,
  dist?: NpmTarballDistInfo
): VerifiedTarballIntegrity {
  const artifactSha256 = sha256Hex(tgzBuffer)
  const rawIntegrity = typeof dist?.integrity === 'string' ? dist.integrity.trim() : ''

  if (rawIntegrity) {
    const tokens = rawIntegrity.split(/\s+/).filter(Boolean)
    const parsedTokens: Array<{
      algorithm: 'sha512' | 'sha384' | 'sha256'
      digest: Buffer
      raw: string
    }> = []

    for (const token of tokens) {
      const match = SRI_TOKEN_RE.exec(token)
      if (!match) continue
      const algorithm = match[1] as 'sha512' | 'sha384' | 'sha256'
      const base64 = match[2]
      const digest = Buffer.from(base64, 'base64')
      const expectedLength = algorithm === 'sha512' ? 64 : algorithm === 'sha384' ? 48 : 32
      if (digest.length !== expectedLength) continue
      parsedTokens.push({ algorithm, digest, raw: `${algorithm}-${base64}` })
    }

    if (parsedTokens.length === 0) {
      throw new NpmTarballInspectorError(
        'PLUGIN_NPM_INTEGRITY_MISMATCH',
        'dist.integrity contains no supported sha512/sha384/sha256 SRI digest'
      )
    }

    const maxStrength = Math.max(...parsedTokens.map((item) => SRI_ALGO_STRENGTH[item.algorithm]))
    const strongestTokens = parsedTokens.filter(
      (item) => SRI_ALGO_STRENGTH[item.algorithm] === maxStrength
    )

    for (const candidate of strongestTokens) {
      const actual = createHash(candidate.algorithm).update(tgzBuffer).digest()
      if (safeDigestEqual(actual, candidate.digest)) {
        return {
          method: 'sri',
          algorithm: candidate.algorithm,
          raw: candidate.raw,
          artifactSha256
        }
      }
    }

    throw new NpmTarballInspectorError(
      'PLUGIN_NPM_INTEGRITY_MISMATCH',
      `Tarball SRI digest verification failed (${strongestTokens[0]!.algorithm})`
    )
  }

  const rawShasum = typeof dist?.shasum === 'string' ? dist.shasum.trim().toLowerCase() : ''
  if (rawShasum) {
    if (!SHA1_HEX_RE.test(rawShasum)) {
      throw new NpmTarballInspectorError(
        'PLUGIN_NPM_INTEGRITY_MISMATCH',
        'dist.shasum is not a valid SHA-1 hex digest'
      )
    }
    const actual = createHash('sha1').update(tgzBuffer).digest()
    const expected = Buffer.from(rawShasum, 'hex')
    if (!safeDigestEqual(actual, expected)) {
      throw new NpmTarballInspectorError(
        'PLUGIN_NPM_INTEGRITY_MISMATCH',
        'Tarball SHA-1 shasum verification failed'
      )
    }
    return {
      method: 'shasum',
      algorithm: 'sha1',
      raw: `sha1-${rawShasum}`,
      artifactSha256
    }
  }

  throw new NpmTarballInspectorError(
    'PLUGIN_NPM_INTEGRITY_MISMATCH',
    'Missing required dist.integrity and dist.shasum metadata'
  )
}

function isGzipLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: unknown; message?: unknown }
  const code = typeof err.code === 'string' ? err.code : ''
  const message = typeof err.message === 'string' ? err.message : ''
  return (
    code === 'ERR_BUFFER_TOO_LARGE' ||
    code === 'ERR_OUT_OF_RANGE' ||
    /maxOutputLength|Cannot create a Buffer larger/i.test(message)
  )
}

/**
 * Decompress a `.tgz` buffer with a hard upper bound on output bytes to defeat gzip bombs.
 */
export function decompressNpmTarballBounded(
  tgzBuffer: Buffer,
  maxOutputLength = NPM_TARBALL_MAX_DECOMPRESSED_BYTES
): Buffer {
  if (!Buffer.isBuffer(tgzBuffer) || tgzBuffer.length === 0) {
    throw new NpmTarballInspectorError(
      'PLUGIN_PACKAGE_ARCHIVE_SIZE_INVALID',
      'Tarball buffer is empty'
    )
  }
  if (tgzBuffer.length > PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES) {
    throw new NpmTarballInspectorError(
      'PLUGIN_PACKAGE_ARCHIVE_SIZE_EXCEEDED',
      `Tarball size ${tgzBuffer.length} exceeds limit ${PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES}`
    )
  }

  try {
    return zlib.gunzipSync(tgzBuffer, { maxOutputLength })
  } catch (error) {
    if (isGzipLimitError(error)) {
      throw new NpmTarballInspectorError(
        'PLUGIN_PACKAGE_EXPANDED_SIZE_EXCEEDED',
        `Decompressed tarball exceeds maximum allowed size (${maxOutputLength} bytes)`
      )
    }
    throw new NpmTarballInspectorError(
      'PLUGIN_NPM_TARBALL_INVALID',
      error instanceof Error ? error.message : 'Invalid gzip archive'
    )
  }
}

function readTarString(block: Buffer, start: number, length: number): string {
  return block
    .subarray(start, start + length)
    .toString('utf8')
    .replace(/\0.*$/s, '')
}

function readTarSize(block: Buffer): number {
  const field = block.subarray(124, 136)
  // GNU base-256 binary size (high bit set on first byte)
  if ((field[0]! & 0x80) !== 0) {
    // Reject negative two's complement sizes
    if ((field[0]! & 0x40) !== 0) return -1
    let value = field[0]! & 0x7f
    for (let index = 1; index < field.length; index += 1) {
      value = value * 256 + field[index]!
      if (!Number.isSafeInteger(value)) return -1
    }
    return value
  }

  const raw = readTarString(block, 124, 12).trim()
  if (!raw) return 0
  if (!/^[0-7]+$/.test(raw)) return -1
  const value = Number.parseInt(raw, 8)
  return Number.isSafeInteger(value) ? value : -1
}

function isEmptyBlock(block: Buffer): boolean {
  for (let index = 0; index < block.length; index += 1) {
    if (block[index] !== 0) return false
  }
  return true
}

function verifyTarHeaderChecksum(block: Buffer): boolean {
  const rawChecksum = readTarString(block, 148, 8).trim()
  if (!rawChecksum || !/^[0-7]+$/.test(rawChecksum)) return false
  const expected = Number.parseInt(rawChecksum, 8)
  let unsignedSum = 0
  let signedSum = 0
  for (let index = 0; index < TAR_BLOCK_SIZE; index += 1) {
    const byte = index >= 148 && index < 156 ? 0x20 : block[index]!
    unsignedSum += byte
    signedSum += byte >= 128 ? byte - 256 : byte
  }
  return expected === unsignedSum || expected === signedSum
}

function mapTarEntryType(typeFlag: string): PluginPackageEntry['type'] {
  if (typeFlag === '' || typeFlag === '0' || typeFlag === '7') return 'file'
  if (typeFlag === '5') return 'directory'
  if (typeFlag === '1') return 'hardlink'
  if (typeFlag === '2') return 'symlink'
  if (typeFlag === '3' || typeFlag === '4') return 'device'
  if (typeFlag === '6') return 'fifo'
  return 'other'
}

interface PaxAttributes {
  path?: string
  size?: number
}

function parsePaxRecords(data: Buffer): PaxAttributes {
  const attrs: PaxAttributes = {}
  let offset = 0
  while (offset < data.length) {
    const spaceIndex = data.indexOf(0x20, offset)
    if (spaceIndex <= offset) {
      throw new NpmTarballInspectorError('PLUGIN_NPM_TARBALL_INVALID', 'Malformed PAX header')
    }
    const lenStr = data.subarray(offset, spaceIndex).toString('ascii')
    if (!/^\d+$/.test(lenStr)) {
      throw new NpmTarballInspectorError(
        'PLUGIN_NPM_TARBALL_INVALID',
        'Malformed PAX record length'
      )
    }
    const recordLength = Number.parseInt(lenStr, 10)
    if (
      !Number.isSafeInteger(recordLength) ||
      recordLength <= 0 ||
      offset + recordLength > data.length
    ) {
      throw new NpmTarballInspectorError('PLUGIN_NPM_TARBALL_INVALID', 'Out-of-bounds PAX record')
    }
    const recordEnd = offset + recordLength
    const body = data.subarray(spaceIndex + 1, recordEnd).toString('utf8')
    if (!body.endsWith('\n')) {
      throw new NpmTarballInspectorError('PLUGIN_NPM_TARBALL_INVALID', 'Unterminated PAX record')
    }
    const trimmed = body.slice(0, -1)
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex)
      const value = trimmed.slice(eqIndex + 1)
      if (key === 'path') {
        attrs.path = value
      } else if (key === 'size' && /^\d+$/.test(value)) {
        const parsedSize = Number.parseInt(value, 10)
        if (Number.isSafeInteger(parsedSize) && parsedSize >= 0) {
          attrs.size = parsedSize
        }
      }
    }
    offset = recordEnd
  }
  return attrs
}

interface RawTarEntry {
  rawPath: string
  type: PluginPackageEntry['type']
  size: number
  content?: Buffer
}

function readRawTarEntries(tarBuffer: Buffer): { entries: RawTarEntry[]; expandedBytes: number } {
  if (tarBuffer.length < TAR_BLOCK_SIZE || tarBuffer.length % TAR_BLOCK_SIZE !== 0) {
    throw new NpmTarballInspectorError(
      'PLUGIN_NPM_TARBALL_INVALID',
      'Tar stream is truncated or not 512-byte aligned'
    )
  }

  const rawEntries: RawTarEntry[] = []
  let expandedBytes = 0
  let globalPax: PaxAttributes = {}
  let nextPax: PaxAttributes | null = null
  let nextLongName: string | null = null

  for (let offset = 0; offset + TAR_BLOCK_SIZE <= tarBuffer.length; ) {
    const header = tarBuffer.subarray(offset, offset + TAR_BLOCK_SIZE)
    offset += TAR_BLOCK_SIZE

    if (isEmptyBlock(header)) {
      // Allow trailing zero padding blocks; reject any non-zero trailing garbage.
      const remainder = tarBuffer.subarray(offset)
      for (let idx = 0; idx < remainder.length; idx += 1) {
        if (remainder[idx] !== 0) {
          throw new NpmTarballInspectorError(
            'PLUGIN_NPM_TARBALL_INVALID',
            'Unexpected non-zero data after tar end-of-archive block'
          )
        }
      }
      break
    }

    if (!verifyTarHeaderChecksum(header)) {
      throw new NpmTarballInspectorError(
        'PLUGIN_NPM_TARBALL_INVALID',
        'Invalid tar header checksum'
      )
    }

    const baseName = readTarString(header, 0, 100)
    const prefix = readTarString(header, 345, 155)
    const headerPath = prefix
      ? prefix.endsWith('/')
        ? `${prefix}${baseName}`
        : `${prefix}/${baseName}`
      : baseName
    const headerSize = readTarSize(header)
    const typeFlag = readTarString(header, 156, 1)

    if (headerSize < 0) {
      throw new NpmTarballInspectorError('PLUGIN_NPM_TARBALL_INVALID', 'Invalid tar entry size')
    }

    const resolvedSize =
      typeFlag === 'x' || typeFlag === 'g' || typeFlag === 'L' || typeFlag === 'K'
        ? headerSize
        : (nextPax?.size ?? globalPax.size ?? headerSize)

    if (!Number.isSafeInteger(resolvedSize) || resolvedSize < 0) {
      throw new NpmTarballInspectorError('PLUGIN_NPM_TARBALL_INVALID', 'Invalid resolved tar size')
    }

    const dataEnd = offset + resolvedSize
    const padding = (TAR_BLOCK_SIZE - (resolvedSize % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE
    const nextOffset = dataEnd + padding
    if (!Number.isSafeInteger(nextOffset) || nextOffset > tarBuffer.length) {
      throw new NpmTarballInspectorError(
        'PLUGIN_NPM_TARBALL_INVALID',
        'Tar entry payload exceeds archive bounds'
      )
    }

    const payload = tarBuffer.subarray(offset, dataEnd)
    offset = nextOffset

    if (typeFlag === 'x' || typeFlag === 'g') {
      if (resolvedSize > TAR_MAX_METADATA_BLOCK_BYTES) {
        throw new NpmTarballInspectorError(
          'PLUGIN_NPM_TARBALL_INVALID',
          'PAX extended header exceeds safety limit'
        )
      }
      const paxAttrs = parsePaxRecords(payload)
      if (typeFlag === 'g') {
        globalPax = { ...globalPax, ...paxAttrs }
      } else {
        nextPax = { ...(nextPax ?? {}), ...paxAttrs }
      }
      continue
    }

    if (typeFlag === 'L') {
      if (resolvedSize > TAR_MAX_METADATA_BLOCK_BYTES) {
        throw new NpmTarballInspectorError(
          'PLUGIN_NPM_TARBALL_INVALID',
          'GNU LongName header exceeds safety limit'
        )
      }
      nextLongName = payload.toString('utf8').replace(/\0.*$/s, '')
      continue
    }

    if (typeFlag === 'K') {
      // GNU LongLink target for an upcoming symlink/hardlink — consume safely;
      // the upcoming link entry itself will still be rejected by type policy.
      if (resolvedSize > TAR_MAX_METADATA_BLOCK_BYTES) {
        throw new NpmTarballInspectorError(
          'PLUGIN_NPM_TARBALL_INVALID',
          'GNU LongLink header exceeds safety limit'
        )
      }
      continue
    }

    const entryPath = nextLongName ?? nextPax?.path ?? globalPax.path ?? headerPath
    nextLongName = null
    nextPax = null

    const entryType = mapTarEntryType(typeFlag)
    rawEntries.push({
      rawPath: entryPath,
      type: entryType,
      size: resolvedSize,
      ...(entryType === 'file' ? { content: Buffer.from(payload) } : {})
    })

    if (rawEntries.length > PLUGIN_PACKAGE_MAX_ENTRY_COUNT + 1) {
      throw new NpmTarballInspectorError(
        'PLUGIN_PACKAGE_ENTRY_COUNT_EXCEEDED',
        `Tarball entry count exceeds limit (${PLUGIN_PACKAGE_MAX_ENTRY_COUNT})`
      )
    }

    if (entryType === 'file') {
      expandedBytes += resolvedSize
      if (expandedBytes > PLUGIN_PACKAGE_MAX_EXPANDED_BYTES) {
        throw new NpmTarballInspectorError(
          'PLUGIN_PACKAGE_EXPANDED_SIZE_EXCEEDED',
          `Tarball expanded bytes exceed limit (${PLUGIN_PACKAGE_MAX_EXPANDED_BYTES})`
        )
      }
    }
  }

  return { entries: rawEntries, expandedBytes }
}

function validateAndCleanRawTarPath(rawPath: string): string {
  if (
    !rawPath ||
    rawPath.includes('\0') ||
    rawPath.includes('\\') ||
    rawPath.startsWith('/') ||
    rawPath.startsWith('//') ||
    WINDOWS_DRIVE_RE.test(rawPath)
  ) {
    throw new NpmTarballInspectorError(
      'PLUGIN_PACKAGE_ENTRY_PATH_INVALID',
      `Unsafe tar entry path: "${rawPath}"`
    )
  }

  const strippedDot = rawPath.startsWith('./') ? rawPath.slice(2) : rawPath
  const trimmedTrailing = strippedDot.endsWith('/') ? strippedDot.slice(0, -1) : strippedDot
  if (!trimmedTrailing) {
    throw new NpmTarballInspectorError(
      'PLUGIN_PACKAGE_ENTRY_PATH_INVALID',
      `Empty tar entry path: "${rawPath}"`
    )
  }

  const segments = trimmedTrailing.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new NpmTarballInspectorError(
      'PLUGIN_PACKAGE_ENTRY_PATH_INVALID',
      `Traversal or invalid segment in tar entry path: "${rawPath}"`
    )
  }

  return trimmedTrailing
}

/**
 * Parse a raw tar buffer into normalized entries & in-memory file map.
 * When `stripRootDir` is `'package'` (or explicit string), requires EVERY entry
 * to reside under `<stripRootDir>/` and strips that prefix.
 */
export function parseTarBufferEntries(
  tarBuffer: Buffer,
  options: { stripRootDir?: string | 'auto' | false } = {}
): ParsedTarArchive {
  const { entries: rawEntries, expandedBytes } = readRawTarEntries(tarBuffer)
  const cleanedEntries = rawEntries.map((entry) => ({
    ...entry,
    cleanedPath: validateAndCleanRawTarPath(entry.rawPath)
  }))

  const stripOption = options.stripRootDir ?? NPM_PLUGIN_TARBALL_ROOT_DIR
  let effectiveRootDir: string | null = null

  if (typeof stripOption === 'string' && stripOption !== 'auto') {
    effectiveRootDir = stripOption
    const rootPrefix = `${effectiveRootDir}/`
    for (const entry of cleanedEntries) {
      if (entry.cleanedPath === effectiveRootDir) {
        if (entry.type !== 'directory') {
          throw new NpmTarballInspectorError(
            'PLUGIN_NPM_TARBALL_ROOT_INVALID',
            `Expected "${effectiveRootDir}" root entry to be a directory`
          )
        }
        continue
      }
      if (!entry.cleanedPath.startsWith(rootPrefix)) {
        throw new NpmTarballInspectorError(
          'PLUGIN_NPM_TARBALL_ROOT_INVALID',
          `Tarball entry "${entry.rawPath}" escapes required "${rootPrefix}" root`
        )
      }
    }
  } else if (stripOption === 'auto' && cleanedEntries.length > 0) {
    const npmRootPrefix = `${NPM_PLUGIN_TARBALL_ROOT_DIR}/`
    const allUnderPackageRoot = cleanedEntries.every(
      (entry) =>
        (entry.cleanedPath === NPM_PLUGIN_TARBALL_ROOT_DIR && entry.type === 'directory') ||
        entry.cleanedPath.startsWith(npmRootPrefix)
    )
    if (allUnderPackageRoot) {
      effectiveRootDir = NPM_PLUGIN_TARBALL_ROOT_DIR
    }
  }

  const entries: PluginPackageEntry[] = []
  const files = new Map<string, Buffer>()
  const rootPrefix = effectiveRootDir ? `${effectiveRootDir}/` : null

  for (const entry of cleanedEntries) {
    let relativePath = entry.cleanedPath
    if (effectiveRootDir && rootPrefix) {
      if (relativePath === effectiveRootDir && entry.type === 'directory') {
        continue
      }
      relativePath = relativePath.slice(rootPrefix.length)
      if (!relativePath) {
        throw new NpmTarballInspectorError(
          'PLUGIN_NPM_TARBALL_ROOT_INVALID',
          `Empty path after stripping "${rootPrefix}"`
        )
      }
    }

    entries.push({
      path: relativePath,
      type: entry.type,
      size: entry.size
    })

    if (entry.type === 'file' && entry.content && !files.has(relativePath)) {
      files.set(relativePath, entry.content)
    }
  }

  return {
    entries,
    files,
    strippedRootDir: effectiveRootDir,
    expandedBytes
  }
}

function canonicalFileMapJson(filesObject: Record<string, string>): string {
  const sortedKeys = Object.keys(filesObject).sort()
  const sortedObject: Record<string, string> = Object.create(null)
  for (const key of sortedKeys) {
    sortedObject[key] = Object.prototype.hasOwnProperty.call(filesObject, key)
      ? (filesObject[key] ?? '')
      : ''
  }
  return JSON.stringify(sortedObject)
}

function fileMapChecksums(filesObject: Record<string, string>): string[] {
  const json = canonicalFileMapJson(filesObject)
  return [
    createHash('sha256').update(json).digest('base64'),
    createHash('md5').update(json).digest('base64')
  ]
}

export interface ManifestFileMapVerificationResult {
  valid: boolean
  stamped: boolean
  fileMapSha256?: string
  reason?: string
}

/**
 * Verify `manifest._files` per-file SHA-256 hashes and `manifest._signature` checksum
 * against the actual extracted in-memory files.
 */
export function verifyManifestFileMapIntegrity(
  manifest: Record<string, unknown>,
  files: ReadonlyMap<string, Buffer>,
  tuffMetadata?: TuffNpmPackageMetadata | null
): ManifestFileMapVerificationResult {
  const hasFileMap = manifest._files !== undefined
  const hasSignature =
    manifest._signature !== undefined && manifest._signature !== null && manifest._signature !== ''

  if (!hasFileMap && !hasSignature) {
    return { valid: true, stamped: false }
  }

  const rawFiles = manifest._files
  const rawSignature = manifest._signature
  if (!isRecord(rawFiles)) {
    return { valid: false, stamped: true, reason: 'manifest._files is missing or invalid' }
  }
  if (typeof rawSignature !== 'string' || !rawSignature.trim()) {
    return { valid: false, stamped: true, reason: 'manifest._signature is missing or invalid' }
  }

  const expectedNormalized: Record<string, string> = Object.create(null)
  for (const [rawKey, rawHash] of Object.entries(rawFiles)) {
    if (typeof rawHash !== 'string' || !SHA256_FILE_HASH_RE.test(rawHash)) {
      return {
        valid: false,
        stamped: true,
        reason: `manifest._files entry for "${rawKey}" is not a valid sha256 digest`
      }
    }
    const normalizedKey = rawKey.replace(/^\.\//, '').replace(/\\/g, '/')
    if (Object.prototype.hasOwnProperty.call(expectedNormalized, normalizedKey)) {
      return {
        valid: false,
        stamped: true,
        reason: `manifest._files contains duplicate path "${normalizedKey}"`
      }
    }
    expectedNormalized[normalizedKey] = rawHash.toLowerCase()
  }

  const actualFiles: Record<string, string> = Object.create(null)
  for (const [filePath, fileBuffer] of files.entries()) {
    if (filePath === 'manifest.json' || filePath === 'key.talex') continue
    actualFiles[filePath] = `sha256-${sha256Hex(fileBuffer)}`
  }

  const expectedKeys = Object.keys(expectedNormalized).sort()
  const actualKeys = Object.keys(actualFiles).sort()
  if (
    expectedKeys.length !== actualKeys.length ||
    expectedKeys.some((key, index) => key !== actualKeys[index])
  ) {
    return {
      valid: false,
      stamped: true,
      reason: 'manifest._files does not match tarball contents'
    }
  }

  for (const key of expectedKeys) {
    if (expectedNormalized[key] !== actualFiles[key]) {
      return {
        valid: false,
        stamped: true,
        reason: `manifest._files hash mismatch for "${key}"`
      }
    }
  }

  const rawFilesRecord = rawFiles as Record<string, string>
  const checksumCandidates = new Set([
    ...fileMapChecksums(rawFilesRecord),
    ...fileMapChecksums(expectedNormalized)
  ])
  if (!checksumCandidates.has(rawSignature.trim())) {
    return {
      valid: false,
      stamped: true,
      reason: 'manifest._signature checksum does not match manifest._files'
    }
  }

  const fileMapSha256 = sha256Hex(serializePluginFileMap(expectedNormalized))
  const declaredFileMapSha256 = tuffMetadata?.integrity?.fileMapSha256?.toLowerCase()
  if (declaredFileMapSha256 && declaredFileMapSha256 !== fileMapSha256) {
    return {
      valid: false,
      stamped: true,
      reason: 'package.json tuff.integrity.fileMapSha256 does not match manifest._files'
    }
  }

  return {
    valid: true,
    stamped: true,
    fileMapSha256
  }
}

function buildSecurityScanFiles(files: ReadonlyMap<string, Buffer>): PluginSecurityScanFile[] {
  const scanFiles: PluginSecurityScanFile[] = []
  for (const [filePath, content] of files.entries()) {
    const isText = isPluginSecurityScanTextPath(filePath)
    const truncated = isText && content.length > PLUGIN_SECURITY_MAX_FILE_INSPECTION_BYTES
    scanFiles.push({
      path: filePath,
      size: content.length,
      sha256: sha256Hex(content),
      kind: isText ? 'text' : 'binary',
      ...(isText
        ? {
            text: content.subarray(0, PLUGIN_SECURITY_MAX_FILE_INSPECTION_BYTES).toString('utf8'),
            ...(truncated ? { truncated: true } : {})
          }
        : {})
    })
  }
  return scanFiles
}

function summarizeNpmProvenance(
  dist?: NpmTarballDistInfo
): NpmTarballProvenanceSummary | undefined {
  const signatureKeyIds = Array.isArray(dist?.signatures)
    ? dist.signatures
        .filter(
          (sig) =>
            typeof sig?.keyid === 'string' &&
            Boolean(sig.keyid.trim()) &&
            typeof sig?.sig === 'string' &&
            Boolean(sig.sig.trim())
        )
        .map((sig) => sig.keyid!.trim())
    : []
  const attestationUrl =
    typeof dist?.attestations?.url === 'string' && dist.attestations.url.trim()
      ? dist.attestations.url.trim()
      : undefined
  const predicateType =
    typeof dist?.attestations?.provenance?.predicateType === 'string' &&
    dist.attestations.provenance.predicateType.trim()
      ? dist.attestations.provenance.predicateType.trim()
      : undefined

  const hasRegistrySignatures = signatureKeyIds.length > 0
  const hasAttestation = Boolean(attestationUrl || predicateType)
  if (!hasRegistrySignatures && !hasAttestation) {
    return undefined
  }

  return {
    hasRegistrySignatures,
    signatureKeyIds,
    hasAttestation,
    ...(attestationUrl ? { attestationUrl } : {}),
    ...(predicateType ? { predicateType } : {})
  }
}

/**
 * Inspect an npm plugin `.tgz` tarball in memory before any files are extracted to the plugin directory.
 *
 * Fail-closed verification pipeline:
 * 1. Tarball byte-level integrity (`dist.integrity` SRI or `dist.shasum` fallback)
 * 2. Bounded gzip decompression (defeats gzip bombs)
 * 3. POSIX/ustar/PAX tar parsing requiring single `package/` root and stripping `package/`
 * 4. `manifest.json` + `package.json` parsing & `validatePluginPackagePolicy({ profile: 'npm-package' })`
 * 5. Strict `manifest._files` + `manifest._signature` digest check when stamped
 * 6. Static security scan (`scanPluginPackage`) failing closed on `blocked` / `unavailable`
 * 7. Trust tier classification (`'npm-verified'` vs `'npm-community'`) — never grants `official: true`
 */
export async function inspectNpmPluginTarball(
  input: InspectNpmPluginTarballInput
): Promise<NpmTarballInspectionResult> {
  let tgzBuffer: Buffer
  if (input.buffer) {
    tgzBuffer = input.buffer
  } else if (input.filePath) {
    const stat = await fse.stat(input.filePath).catch(() => null)
    if (!stat || !stat.isFile()) {
      throw new NpmTarballInspectorError(
        'PLUGIN_NPM_TARBALL_INVALID',
        'Tarball file does not exist or is not a regular file'
      )
    }
    if (stat.size === 0) {
      throw new NpmTarballInspectorError(
        'PLUGIN_PACKAGE_ARCHIVE_SIZE_INVALID',
        'Tarball file is empty'
      )
    }
    if (stat.size > PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES) {
      throw new NpmTarballInspectorError(
        'PLUGIN_PACKAGE_ARCHIVE_SIZE_EXCEEDED',
        `Tarball file size ${stat.size} exceeds limit ${PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES}`
      )
    }
    tgzBuffer = await fse.readFile(input.filePath)
  } else {
    throw new NpmTarballInspectorError(
      'PLUGIN_NPM_TARBALL_INVALID',
      'Either filePath or buffer must be provided'
    )
  }

  // 1. Verify tarball SRI / shasum before decompressing untrusted bytes
  const integrity = verifyNpmTarballIntegrity(tgzBuffer, input.dist)

  // 2. Bounded gunzip (defeats gzip bombs)
  const tarBuffer = decompressNpmTarballBounded(
    tgzBuffer,
    input.maxDecompressedBytes ?? NPM_TARBALL_MAX_DECOMPRESSED_BYTES
  )

  // 3. Parse POSIX/ustar tar entries strictly requiring `package/` root
  const parsedTar = parseTarBufferEntries(tarBuffer, {
    stripRootDir: NPM_PLUGIN_TARBALL_ROOT_DIR
  })

  // 4. Parse manifest.json and package.json
  const manifestBuffer = parsedTar.files.get('manifest.json')
  let manifestObj: Record<string, unknown> | null = null
  if (manifestBuffer) {
    try {
      const parsed = JSON.parse(manifestBuffer.toString('utf8')) as unknown
      if (isRecord(parsed)) {
        manifestObj = parsed
      }
    } catch {
      throw new NpmTarballInspectorError(
        'PLUGIN_PACKAGE_MANIFEST_INVALID',
        'manifest.json is not valid JSON'
      )
    }
  }

  const packageJsonBuffer = parsedTar.files.get('package.json')
  let packageJsonObj: Record<string, unknown> | null = null
  if (packageJsonBuffer) {
    try {
      const parsed = JSON.parse(packageJsonBuffer.toString('utf8')) as unknown
      if (isRecord(parsed)) {
        packageJsonObj = parsed
      }
    } catch {
      throw new NpmTarballInspectorError(
        'PLUGIN_PACKAGE_NPM_PACKAGE_JSON_INVALID',
        'package.json is not valid JSON'
      )
    }
  }

  // 5. Run canonical 'npm-package' package policy
  const allowUnstampedCommunity = input.allowUnstampedCommunity !== false
  const packagePolicy = validatePluginPackagePolicy({
    profile: 'npm-package',
    manifest: manifestObj,
    packageJson: packageJsonObj,
    entries: parsedTar.entries,
    archiveSize: tgzBuffer.length,
    expected: {
      version: input.expectedVersion,
      npmPackageName: input.packageName
    },
    allowUnstampedCommunity
  })

  if (!packagePolicy.ok) {
    const first = packagePolicy.violations[0]
    throw new NpmTarballInspectorError(
      first?.code ?? 'PLUGIN_PACKAGE_POLICY_REJECTED',
      first ? formatPluginPackageViolation(first) : 'Package policy validation failed'
    )
  }

  // Policy guarantees manifestObj and packageJsonObj are valid records at this point.
  const manifest = manifestObj!
  const packageJson = packageJsonObj!
  const tuffMetadata = extractTuffPackageMetadata(packageJson)

  // 6. Verify per-file SHA-256 digests and _signature checksum when stamped
  const fileMapResult = verifyManifestFileMapIntegrity(manifest, parsedTar.files, tuffMetadata)
  if (!fileMapResult.valid) {
    throw new NpmTarballInspectorError(
      'PLUGIN_PACKAGE_INTEGRITY_INVALID',
      fileMapResult.reason ?? 'manifest._files integrity check failed'
    )
  }

  // 7. Run static security scan in memory (fail closed on blocked / unavailable)
  const securityScan = scanPluginPackage({
    artifactSha256: integrity.artifactSha256,
    policyVersion: packagePolicy.policyVersion,
    policyPassed: true,
    manifest,
    files: buildSecurityScanFiles(parsedTar.files)
  })

  if (securityScan.decision === 'unavailable') {
    throw new NpmTarballInspectorError(
      'PLUGIN_SCAN_UNAVAILABLE',
      securityScan.failure?.code ?? 'Security scan engine unavailable'
    )
  }
  if (securityScan.decision === 'blocked') {
    const firstFinding = securityScan.findings.find((finding) => !finding.waiver)
    throw new NpmTarballInspectorError(
      'PLUGIN_SCAN_BLOCKED',
      firstFinding
        ? `${firstFinding.code} at ${firstFinding.location.path}`
        : 'Package blocked by static security scan'
    )
  }

  // 8. Classify trust tier ('npm-verified' requires SRI + verified _files/_signature stamp)
  const trustTier: Extract<NpmPluginTrustTier, 'npm-verified' | 'npm-community'> =
    fileMapResult.stamped && integrity.method === 'sri' ? 'npm-verified' : 'npm-community'
  const provenance = summarizeNpmProvenance(input.dist)

  return {
    manifest: manifest as unknown as IManifest,
    packageJson,
    tuffMetadata,
    artifactSha256: integrity.artifactSha256,
    archiveSize: tgzBuffer.length,
    integrity,
    integrityStamped: fileMapResult.stamped,
    ...(fileMapResult.fileMapSha256 ? { fileMapSha256: fileMapResult.fileMapSha256 } : {}),
    trustTier,
    ...(provenance ? { provenance } : {}),
    packagePolicy,
    securityScan,
    entries: parsedTar.entries
  }
}

function hasNodeModulesPathSegment(relativePath: string): boolean {
  return relativePath.split('/').some((segment) => segment.toLowerCase() === 'node_modules')
}

/**
 * Safely extract a `.tgz` / `.tar.gz` archive to `targetDir` using bounded in-memory decompression
 * and POSIX/ustar tar parsing. Rejects gzip bombs, symlinks/hardlinks/devices/fifos, path traversal,
 * and case collisions; optionally strips npm's `package/` root directory.
 */
export async function extractTgzSafely(
  tgzPath: string,
  targetDir: string,
  options: ExtractTgzSafelyOptions = {}
): Promise<{ strippedRootDir: string | null; extractedFiles: number }> {
  const stat = await fse.stat(tgzPath).catch(() => null)
  if (!stat || !stat.isFile()) {
    throw new NpmTarballInspectorError('PLUGIN_NPM_TARBALL_INVALID', 'Tarball file not found')
  }
  if (stat.size === 0) {
    throw new NpmTarballInspectorError(
      'PLUGIN_PACKAGE_ARCHIVE_SIZE_INVALID',
      'Tarball file is empty'
    )
  }
  if (stat.size > PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES) {
    throw new NpmTarballInspectorError(
      'PLUGIN_PACKAGE_ARCHIVE_SIZE_EXCEEDED',
      `Tarball size ${stat.size} exceeds limit ${PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES}`
    )
  }

  const tgzBuffer = await fse.readFile(tgzPath)
  const tarBuffer = decompressNpmTarballBounded(
    tgzBuffer,
    options.maxDecompressedBytes ?? NPM_TARBALL_MAX_DECOMPRESSED_BYTES
  )
  const parsed = parseTarBufferEntries(tarBuffer, {
    stripRootDir: options.stripRootDir ?? 'auto'
  })

  const skipNodeModules = options.skipNodeModules !== false
  const resolvedTargetRoot = path.resolve(targetDir)
  const foldedPaths = new Set<string>()
  let extractedFiles = 0

  await fse.ensureDir(resolvedTargetRoot)

  for (const entry of parsed.entries) {
    if (entry.type !== 'file' && entry.type !== 'directory') {
      throw new NpmTarballInspectorError(
        'PLUGIN_PACKAGE_ENTRY_TYPE_DENIED',
        `Denied archive entry type "${entry.type}" at "${entry.path}"`
      )
    }

    if (entry.type === 'file' && entry.size > PLUGIN_PACKAGE_MAX_ENTRY_BYTES) {
      throw new NpmTarballInspectorError(
        'PLUGIN_PACKAGE_EXPANDED_SIZE_EXCEEDED',
        `Entry "${entry.path}" exceeds max file size (${PLUGIN_PACKAGE_MAX_ENTRY_BYTES})`
      )
    }

    if (skipNodeModules && hasNodeModulesPathSegment(entry.path)) {
      continue
    }

    const folded = entry.path.toLowerCase()
    if (foldedPaths.has(folded)) {
      throw new NpmTarballInspectorError(
        'PLUGIN_PACKAGE_ENTRY_CASE_COLLISION',
        `Duplicate or case-colliding archive entry "${entry.path}"`
      )
    }
    foldedPaths.add(folded)

    const destinationPath = path.resolve(resolvedTargetRoot, entry.path)
    const relativeToRoot = path.relative(resolvedTargetRoot, destinationPath)
    if (!relativeToRoot || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      throw new NpmTarballInspectorError(
        'PLUGIN_PACKAGE_ENTRY_PATH_INVALID',
        `Entry "${entry.path}" escapes target extraction directory`
      )
    }

    if (entry.type === 'directory') {
      await fse.ensureDir(destinationPath)
      continue
    }

    const fileBuffer = parsed.files.get(entry.path)
    if (!fileBuffer) continue
    await fse.ensureDir(path.dirname(destinationPath))
    await fse.writeFile(destinationPath, fileBuffer)
    extractedFiles += 1
  }

  return {
    strippedRootDir: parsed.strippedRootDir,
    extractedFiles
  }
}
