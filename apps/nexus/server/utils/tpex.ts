import type {
  PluginPackageEntry,
  PluginPackageExpectedIdentity,
  PluginPackagePolicyResult,
} from '@talex-touch/utils/plugin'
import type { TpexMetadata } from '@talex-touch/utils/plugin/providers'
import { validatePluginPackagePolicy } from '@talex-touch/utils/plugin'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

export type { TpexMetadata }

export interface TpexIntegrityResult {
  valid: boolean
  reason?: string
}

export interface TpexExtractedMetadata extends TpexMetadata {
  iconBuffer?: Buffer | null
  iconFileName?: string | null
  iconMimeType?: string | null
  integrity: TpexIntegrityResult
  packagePolicy: PluginPackagePolicyResult
}

export interface TpexAdmissionFailure {
  code: string
  reason: string
}

export function getTpexAdmissionFailure(
  metadata: TpexExtractedMetadata,
): TpexAdmissionFailure | null {
  if (!metadata.integrity.valid) {
    return {
      code: 'PLUGIN_PACKAGE_INTEGRITY_INVALID',
      reason: metadata.integrity.reason ?? 'Package integrity validation failed.',
    }
  }
  if (!metadata.packagePolicy.ok) {
    const first = metadata.packagePolicy.violations[0]
    return {
      code: first?.code ?? 'PLUGIN_PACKAGE_POLICY_REJECTED',
      reason: first ? `${first.code} at ${first.location}` : 'Package policy rejected the archive.',
    }
  }
  return null
}

const TAR_BLOCK_SIZE = 512

// Allowed icon extensions (SVG strongly recommended)
const ICON_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp'] as const
const ICON_MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

function isReadmeFile(name: string) {
  const lower = name.toLowerCase()
  return lower.endsWith('readme.md') || lower.endsWith('readme')
}

function isManifestFile(name: string) {
  return normalizeTarEntryName(name).toLowerCase() === 'manifest.json'
}

function normalizeTarEntryName(name: string): string {
  return name.replace(/^\.\//, '').replace(/\\/g, '/')
}

function isIconFile(name: string, manifestIconPath?: string): { isIcon: boolean, extension: string | null } {
  const lower = name.toLowerCase()
  const baseName = lower.split('/').pop() ?? ''

  // Check if this matches the manifest icon path
  if (manifestIconPath) {
    const manifestIconLower = manifestIconPath.toLowerCase()
    if (lower.endsWith(manifestIconLower) || baseName === manifestIconLower.split('/').pop()) {
      const ext = ICON_EXTENSIONS.find(e => baseName.endsWith(e))
      return { isIcon: !!ext, extension: ext ?? null }
    }
  }

  // Fallback: look for common icon file patterns
  const iconPatterns = ['icon.svg', 'logo.svg', 'icon.png', 'logo.png']
  for (const pattern of iconPatterns) {
    if (baseName === pattern || lower.endsWith(`/${pattern}`)) {
      const ext = ICON_EXTENSIONS.find(e => baseName.endsWith(e))
      return { isIcon: true, extension: ext ?? null }
    }
  }

  return { isIcon: false, extension: null }
}

function readHeaderString(block: Buffer, start: number, length: number) {
  return block.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '')
}

function readHeaderOctal(block: Buffer, start: number, length: number): number {
  const raw = readHeaderString(block, start, length).trim()
  if (!raw.length) return 0
  if (!/^[0-7]+$/.test(raw)) return -1
  const value = Number.parseInt(raw, 8)
  return Number.isSafeInteger(value) ? value : -1
}

function readTarEntryName(block: Buffer): string {
  const name = readHeaderString(block, 0, 100)
  const prefix = readHeaderString(block, 345, 155)
  return prefix ? `${prefix}/${name}` : name
}

function isEmptyBlock(block: Buffer) {
  for (const byte of block) {
    if (byte !== 0)
      return false
  }
  return true
}

function isRegularFileEntry(typeFlag: string) {
  return typeFlag === '' || typeFlag === '0'
}

function mapTarEntryType(typeFlag: string): PluginPackageEntry['type'] {
  if (isRegularFileEntry(typeFlag)) return 'file'
  if (typeFlag === '5') return 'directory'
  if (typeFlag === '1') return 'hardlink'
  if (typeFlag === '2') return 'symlink'
  if (typeFlag === '3' || typeFlag === '4') return 'device'
  if (typeFlag === '6') return 'fifo'
  return 'other'
}

function generateSignature(filesObject: Record<string, string>): string {
  const sortedKeys = Object.keys(filesObject).sort()
  const sortedObject: Record<string, string> = {}
  for (const key of sortedKeys)
    sortedObject[key] = filesObject[key] ?? ''
  return createHash('md5').update(JSON.stringify(sortedObject)).digest('base64')
}

function normalizeManifestFileKey(key: string): string {
  return normalizeTarEntryName(key)
}

function createNormalizedExpectedFiles(expectedRecord: Record<string, unknown>): {
  files?: Record<string, string>
  error?: TpexIntegrityResult
} {
  const normalized: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(expectedRecord)) {
    if (typeof rawValue !== 'string')
      return { error: { valid: false, reason: `manifest._files hash for ${rawKey} is invalid.` } }
    const normalizedKey = normalizeManifestFileKey(rawKey)
    if (normalized[normalizedKey] !== undefined)
      return { error: { valid: false, reason: `manifest._files has duplicate normalized path ${normalizedKey}.` } }
    normalized[normalizedKey] = rawValue
  }
  return { files: normalized }
}

function verifyManifestIntegrity(
  manifest: Record<string, unknown> | null,
  files: Record<string, Buffer>,
): TpexIntegrityResult {
  if (!manifest)
    return { valid: false, reason: 'manifest.json is missing or invalid.' }

  const expectedFiles = manifest._files
  const expectedSignature = manifest._signature
  if (!expectedFiles || typeof expectedFiles !== 'object' || Array.isArray(expectedFiles))
    return { valid: false, reason: 'manifest._files is missing or invalid.' }
  if (typeof expectedSignature !== 'string' || !expectedSignature.trim())
    return { valid: false, reason: 'manifest._signature is missing or invalid.' }

  const actualFiles: Record<string, string> = {}
  for (const [name, fileBuffer] of Object.entries(files)) {
    const normalizedName = normalizeTarEntryName(name)
    const baseName = normalizedName.split('/').pop() ?? ''
    if (baseName === 'manifest.json' || baseName === 'key.talex')
      continue
    const hash = createHash('sha256').update(fileBuffer).digest('hex')
    actualFiles[normalizedName] = `sha256-${hash}`
  }

  const expectedRecord = expectedFiles as Record<string, unknown>
  const normalizedExpected = createNormalizedExpectedFiles(expectedRecord)
  if (normalizedExpected.error)
    return normalizedExpected.error

  const normalizedExpectedFiles = normalizedExpected.files ?? {}
  const expectedKeys = Object.keys(normalizedExpectedFiles).sort()
  const actualKeys = Object.keys(actualFiles).sort()
  if (expectedKeys.length !== actualKeys.length || expectedKeys.some((key, index) => key !== actualKeys[index]))
    return { valid: false, reason: 'manifest._files does not match package contents.' }

  for (const key of expectedKeys) {
    if (normalizedExpectedFiles[key] !== actualFiles[key])
      return { valid: false, reason: `manifest._files hash mismatch for ${key}.` }
  }

  const signatureCandidates = new Set([
    generateSignature(expectedRecord as Record<string, string>),
    generateSignature(normalizedExpectedFiles),
  ])
  if (!signatureCandidates.has(expectedSignature.trim()))
    return { valid: false, reason: 'manifest._signature does not match manifest._files.' }

  return { valid: true }
}

export async function extractTpexMetadata(
  buffer: Buffer,
  expected?: PluginPackageExpectedIdentity,
): Promise<TpexExtractedMetadata> {
  let readmeMarkdown: string | null = null
  let manifest: Record<string, unknown> | null = null
  const files: Record<string, Buffer> = {}
  const entries: PluginPackageEntry[] = []
  let iconBuffer: Buffer | null = null
  let iconFileName: string | null = null
  let iconMimeType: string | null = null
  let manifestIconPath: string | undefined

  // First pass: find manifest to get icon path. Package policy runs against
  // the complete raw entry inventory collected during the second pass.
  for (let offset = 0; offset + TAR_BLOCK_SIZE <= buffer.length;) {
    const header = buffer.subarray(offset, offset + TAR_BLOCK_SIZE)
    offset += TAR_BLOCK_SIZE

    if (isEmptyBlock(header)) break

    const name = readTarEntryName(header)
    const size = readHeaderOctal(header, 124, 12)
    const typeFlag = readHeaderString(header, 156, 1)
    if (!name || size < 0) break

    const fileEnd = offset + size
    if (!Number.isSafeInteger(fileEnd) || fileEnd > buffer.length) break

    const fileBuffer = buffer.subarray(offset, fileEnd)
    if (isRegularFileEntry(typeFlag) && isManifestFile(name)) {
      try {
        manifest = JSON.parse(fileBuffer.toString('utf8')) as Record<string, unknown>
        if (typeof manifest.icon === 'string') manifestIconPath = manifest.icon
      }
      catch {
        manifest = null
      }
    }

    const padding = (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE
    offset = fileEnd + padding
    if (manifest) break
  }

  // Second pass: collect all raw entries before interpreting package content.
  for (let offset = 0; offset + TAR_BLOCK_SIZE <= buffer.length;) {
    const header = buffer.subarray(offset, offset + TAR_BLOCK_SIZE)
    offset += TAR_BLOCK_SIZE

    if (isEmptyBlock(header)) {
      if (buffer.subarray(offset).some(byte => byte !== 0)) {
        entries.push({ path: '', type: 'other', size: buffer.length - offset })
      }
      break
    }

    const name = readTarEntryName(header)
    const size = readHeaderOctal(header, 124, 12)
    const typeFlag = readHeaderString(header, 156, 1)
    const entryType = mapTarEntryType(typeFlag)

    if (!name || size < 0) {
      entries.push({ path: name, type: 'other', size })
      break
    }

    const fileEnd = offset + size
    if (!Number.isSafeInteger(fileEnd) || fileEnd > buffer.length) {
      entries.push({ path: name, type: 'other', size })
      break
    }

    entries.push({ path: name, type: entryType, size })
    const fileBuffer = buffer.subarray(offset, fileEnd)
    const isRegularFile = entryType === 'file'
    if (isRegularFile) files[name] = Buffer.from(fileBuffer)

    if (isRegularFile && !readmeMarkdown && isReadmeFile(name)) {
      try {
        readmeMarkdown = fileBuffer.toString('utf8')
      }
      catch {
        readmeMarkdown = null
      }
    }

    if (isRegularFile && !manifest && isManifestFile(name)) {
      try {
        manifest = JSON.parse(fileBuffer.toString('utf8')) as Record<string, unknown>
      }
      catch {
        manifest = null
      }
    }

    if (isRegularFile && !iconBuffer) {
      const { isIcon, extension } = isIconFile(name, manifestIconPath)
      if (isIcon && extension) {
        iconBuffer = Buffer.alloc(fileBuffer.length)
        fileBuffer.copy(iconBuffer)
        iconFileName = name.split('/').pop() ?? `icon${extension}`
        iconMimeType = ICON_MIME_TYPES[extension] ?? 'image/svg+xml'
      }
    }

    const padding = (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE
    offset = fileEnd + padding
  }

  return {
    readmeMarkdown,
    manifest,
    iconBuffer,
    iconFileName,
    iconMimeType,
    integrity: verifyManifestIntegrity(manifest, files),
    packagePolicy: validatePluginPackagePolicy({
      profile: 'registry-admission',
      manifest,
      entries,
      archiveSize: buffer.length,
      expected,
    }),
  }
}
