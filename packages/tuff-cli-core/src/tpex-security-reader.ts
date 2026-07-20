import type {
  PluginPackageEntry,
  PluginPackagePolicyResult,
  PluginSecurityScanFile,
} from '@talex-touch/utils/plugin'
import type { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import {
  isPluginSecurityScanTextPath,
  PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES,
  PLUGIN_PACKAGE_MAX_ENTRY_COUNT,
  PLUGIN_SECURITY_MAX_FILE_INSPECTION_BYTES,
  validatePluginPackagePolicy,
} from '@talex-touch/utils/plugin'
import fs from 'fs-extra'

const TAR_BLOCK_SIZE = 512
const TAR_NAME_BYTES = 100
const TAR_PREFIX_OFFSET = 345
const TAR_PREFIX_BYTES = 155

export interface TpexSecurityScanInput {
  artifactSha256: string
  manifest: unknown
  policy: PluginPackagePolicyResult
  integrityPassed: boolean
  files: PluginSecurityScanFile[]
}

function readTarString(block: Buffer, start: number, length: number): string {
  return block.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '').trim()
}

function readTarOctal(block: Buffer, start: number, length: number): number {
  const value = readTarString(block, start, length).replace(/^0+/, '')
  if (!value)
    return 0
  if (!/^[0-7]+$/.test(value))
    return -1
  return Number.parseInt(value, 8)
}

function normalizeArchivePath(rawPath: string): string {
  return rawPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/')
}

function entryType(typeFlag: string): PluginPackageEntry['type'] {
  if (!typeFlag || typeFlag === '0' || typeFlag === '7')
    return 'file'
  if (typeFlag === '5')
    return 'directory'
  if (typeFlag === '1')
    return 'hardlink'
  if (typeFlag === '2')
    return 'symlink'
  if (typeFlag === '3' || typeFlag === '4')
    return 'device'
  if (typeFlag === '6')
    return 'fifo'
  return 'other'
}

function isEmptyBlock(block: Buffer): boolean {
  return block.every(byte => byte === 0)
}

function toScanFile(path: string, content: Buffer): PluginSecurityScanFile {
  const isText = isPluginSecurityScanTextPath(path)
  const truncated = isText && content.length > PLUGIN_SECURITY_MAX_FILE_INSPECTION_BYTES
  return {
    path,
    size: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
    kind: isText ? 'text' : 'binary',
    ...(isText
      ? {
          text: content
            .subarray(0, PLUGIN_SECURITY_MAX_FILE_INSPECTION_BYTES)
            .toString('utf8'),
          ...(truncated ? { truncated: true } : {}),
        }
      : {}),
  }
}

function verifyFileMap(manifest: unknown, files: Map<string, Buffer>): boolean {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    return false
  const rawFileMap = (manifest as Record<string, unknown>)._files
  if (!rawFileMap || typeof rawFileMap !== 'object' || Array.isArray(rawFileMap))
    return false
  const expected = Object.entries(rawFileMap as Record<string, unknown>)
  const actualPaths = Array.from(files.keys())
    .filter(path => path !== 'manifest.json' && path !== 'key.talex')
    .sort()
  const expectedPaths = expected.map(([rawPath]) => normalizeArchivePath(rawPath)).sort()
  if (actualPaths.length !== expectedPaths.length)
    return false
  if (actualPaths.some((path, index) => path !== expectedPaths[index]))
    return false
  return expected.every(([rawPath, rawDigest]) => {
    if (typeof rawDigest !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(rawDigest))
      return false
    const content = files.get(normalizeArchivePath(rawPath))
    return Boolean(content)
      && createHash('sha256').update(content!).digest('hex') === rawDigest.slice('sha256-'.length)
  })
}

export function readTpexSecurityScanInput(packagePath: string): TpexSecurityScanInput {
  const stats = fs.statSync(packagePath)
  if (!stats.isFile())
    throw new Error('TPEX package path must be a regular file.')
  if (stats.size > PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES) {
    throw new Error('TPEX package exceeds the package policy archive limit.')
  }

  const buffer = fs.readFileSync(packagePath)
  const entries: PluginPackageEntry[] = []
  const regularFiles = new Map<string, Buffer>()
  let manifest: unknown

  for (let offset = 0; offset + TAR_BLOCK_SIZE <= buffer.length;) {
    const header = buffer.subarray(offset, offset + TAR_BLOCK_SIZE)
    offset += TAR_BLOCK_SIZE
    if (isEmptyBlock(header))
      break

    const name = readTarString(header, 0, TAR_NAME_BYTES)
    const prefix = readTarString(header, TAR_PREFIX_OFFSET, TAR_PREFIX_BYTES)
    const path = normalizeArchivePath(prefix ? `${prefix}/${name}` : name)
    const size = readTarOctal(header, 124, 12)
    const type = entryType(readTarString(header, 156, 1))
    if (size < 0 || offset + size > buffer.length) {
      throw new Error('TPEX archive contains an invalid entry size.')
    }
    entries.push({ path, type, size })
    if (entries.length > PLUGIN_PACKAGE_MAX_ENTRY_COUNT) {
      throw new Error('TPEX package exceeds the package policy entry-count limit.')
    }

    const content = buffer.subarray(offset, offset + size)
    if (type === 'file') {
      regularFiles.set(path, content)
      if (path.split('/').at(-1)?.toLowerCase() === 'manifest.json') {
        try {
          manifest = JSON.parse(content.toString('utf8')) as unknown
        }
        catch {
          throw new Error('TPEX manifest is not valid JSON.')
        }
      }
    }

    const padding = (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE
    offset += size + padding
  }

  const policy = validatePluginPackagePolicy({
    profile: 'registry-admission',
    manifest,
    entries,
    archiveSize: buffer.length,
  })
  return {
    artifactSha256: createHash('sha256').update(buffer).digest('hex'),
    manifest,
    policy,
    integrityPassed: verifyFileMap(manifest, regularFiles),
    files: Array.from(regularFiles.entries()).map(([path, content]) =>
      toScanFile(path, content)),
  }
}
