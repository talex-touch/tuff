import type { IFeatureInteraction } from '@talex-touch/utils/plugin'
import os from 'node:os'
import path from 'node:path'
import compressing from 'compressing'
import fse from 'fs-extra'

const HTML_LIKE_FILE_EXT_RE = /\.(html|htm|php|asp|aspx)$/i
const PLUGIN_ARCHIVE_EXTENSIONS = ['.tpex', '.tar.gz', '.tgz', '.tar', '.zip']

export type ManifestPackageFiles = string[] | Record<string, string>

export type PackagedManifest = Record<string, unknown> & {
  _files?: ManifestPackageFiles
  _signature?: string
  features?: Array<Record<string, unknown> & { interaction?: IFeatureInteraction }>
  name: string
}

export interface PluginRuntimeIntegrityResult {
  archivePath?: string
  manifestUpdated: boolean
  missingFiles: string[]
  repairedFiles: string[]
  repairError?: string
  requiredFiles: string[]
}

interface EnsurePluginRuntimeIntegrityOptions {
  pluginDir: string
  manifest: PackagedManifest
  archivePath?: string
}

function isManifestFileRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneManifestPackageFiles(
  files: ManifestPackageFiles | undefined
): ManifestPackageFiles | undefined {
  if (Array.isArray(files)) {
    return [...files]
  }
  if (isManifestFileRecord(files)) {
    return { ...files }
  }
  return undefined
}

function getManifestPackageFileCount(files: ManifestPackageFiles | undefined): number {
  if (Array.isArray(files)) {
    return files.length
  }
  if (isManifestFileRecord(files)) {
    return Object.keys(files).length
  }
  return 0
}

function shouldPreserveManifestPackageFiles(
  baseFiles: ManifestPackageFiles | undefined,
  nextFiles: ManifestPackageFiles | undefined
): boolean {
  const baseCount = getManifestPackageFileCount(baseFiles)
  if (baseCount === 0) {
    return false
  }

  const nextCount = getManifestPackageFileCount(nextFiles)
  if (baseCount > nextCount) {
    return true
  }

  return isManifestFileRecord(baseFiles) && !isManifestFileRecord(nextFiles)
}

function hasParentTraversal(rawPath: string): boolean {
  return rawPath
    .split(/[\\/]/)
    .map((segment) => segment.trim())
    .some((segment) => segment === '..')
}

function normalizeInteractionEntryFile(interaction?: IFeatureInteraction): string | null {
  if (interaction?.type !== 'webcontent' || typeof interaction.path !== 'string') {
    return null
  }

  const interactionPath = interaction.path.trim()
  if (!interactionPath || hasParentTraversal(interactionPath)) {
    return null
  }

  const pathWithoutHashAndQuery = interactionPath.split(/[?#]/)[0] || ''
  if (!pathWithoutHashAndQuery || pathWithoutHashAndQuery.startsWith('//')) {
    return null
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathWithoutHashAndQuery)) {
    return null
  }

  if (HTML_LIKE_FILE_EXT_RE.test(pathWithoutHashAndQuery)) {
    const normalized = pathWithoutHashAndQuery.replace(/\\/g, '/').replace(/^\/+/, '')
    return normalized || null
  }

  return 'index.html'
}

function isPluginArchiveFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return PLUGIN_ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

async function uncompressPluginArchive(source: string, target: string): Promise<void> {
  const lower = source.toLowerCase()
  if (lower.endsWith('.tar') || lower.endsWith('.tpex')) {
    await compressing.tar.uncompress(source, target)
    return
  }

  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    await compressing.tgz.uncompress(source, target)
    return
  }

  if (lower.endsWith('.zip')) {
    await compressing.zip.uncompress(source, target)
    return
  }

  throw new Error(`Unsupported plugin archive: ${source}`)
}

async function resolveSiblingPluginArchive(
  pluginDir: string,
  manifest: Pick<PackagedManifest, 'name' | '_files'>
): Promise<string | undefined> {
  const packagedFiles = listManifestPackageFiles(manifest._files)
  const packagedArchive = packagedFiles.find((fileName) =>
    isPluginArchiveFile(path.basename(fileName))
  )
  if (packagedArchive) {
    const candidate = path.resolve(pluginDir, path.basename(packagedArchive))
    if (await fse.pathExists(candidate)) {
      return candidate
    }
  }

  const entries = await fse.readdir(pluginDir).catch(() => [])
  const archives = entries.filter((entry) => isPluginArchiveFile(entry))
  if (archives.length === 0) {
    return undefined
  }

  const normalizedName = typeof manifest.name === 'string' ? manifest.name.toLowerCase() : ''
  if (normalizedName) {
    const matched = archives.find((entry) => entry.toLowerCase().includes(normalizedName))
    if (matched) {
      return path.resolve(pluginDir, matched)
    }
  }

  if (archives.length === 1) {
    return path.resolve(pluginDir, archives[0]!)
  }

  return undefined
}

async function resolveMissingFiles(pluginDir: string, requiredFiles: string[]): Promise<string[]> {
  const results = await Promise.all(
    requiredFiles.map(async (relativePath) => {
      const filePath = path.resolve(pluginDir, relativePath)
      return (await fse.pathExists(filePath)) ? null : relativePath
    })
  )

  return results.filter((value): value is string => typeof value === 'string')
}

export function listManifestPackageFiles(files: ManifestPackageFiles | undefined): string[] {
  if (Array.isArray(files)) {
    return [...files]
  }
  if (isManifestFileRecord(files)) {
    return Object.keys(files)
  }
  return []
}

export function collectRequiredLocalWebcontentFiles(
  manifest: Pick<PackagedManifest, 'features'>
): string[] {
  const requiredFiles = new Set<string>()

  for (const feature of manifest.features ?? []) {
    const entryFile = normalizeInteractionEntryFile(feature.interaction)
    if (entryFile) {
      requiredFiles.add(entryFile)
    }
  }

  return [...requiredFiles]
}

export function mergePackagedManifestMetadata<T extends Record<string, unknown>>(
  baseManifest: T | null | undefined,
  nextManifest: T
): T {
  const merged = { ...nextManifest } as T & {
    _files?: ManifestPackageFiles
    _signature?: string
  }

  const base = (baseManifest ?? {}) as {
    _files?: ManifestPackageFiles
    _signature?: string
  }
  const next = nextManifest as {
    _files?: ManifestPackageFiles
    _signature?: string
  }

  if (shouldPreserveManifestPackageFiles(base._files, next._files)) {
    merged._files = cloneManifestPackageFiles(base._files)
  }

  if (typeof next._signature !== 'string' || !next._signature.trim()) {
    if (typeof base._signature === 'string' && base._signature.trim()) {
      merged._signature = base._signature
    }
  }

  return merged as T
}

export async function ensurePluginRuntimeIntegrity({
  pluginDir,
  manifest,
  archivePath
}: EnsurePluginRuntimeIntegrityOptions): Promise<PluginRuntimeIntegrityResult> {
  let currentManifest = manifest
  const manifestPath = path.resolve(pluginDir, 'manifest.json')
  const requiredFiles = collectRequiredLocalWebcontentFiles(currentManifest)
  let missingFiles = await resolveMissingFiles(pluginDir, requiredFiles)
  const result: PluginRuntimeIntegrityResult = {
    archivePath,
    manifestUpdated: false,
    missingFiles,
    repairedFiles: [],
    requiredFiles
  }

  const resolvedArchivePath =
    archivePath ?? (await resolveSiblingPluginArchive(pluginDir, currentManifest))
  result.archivePath = resolvedArchivePath
  if (!resolvedArchivePath) {
    return result
  }

  const archiveStat = await fse.stat(resolvedArchivePath).catch(() => null)
  if (!archiveStat?.isFile() || !isPluginArchiveFile(path.basename(resolvedArchivePath))) {
    return result
  }

  const tempDir = await fse.mkdtemp(path.join(os.tmpdir(), 'talex-touch-plugin-integrity-'))
  try {
    await uncompressPluginArchive(resolvedArchivePath, tempDir)
    const archiveManifestPath = path.resolve(tempDir, 'manifest.json')
    if (!(await fse.pathExists(archiveManifestPath))) {
      result.repairError = 'manifest.json is missing from sibling plugin archive'
      return result
    }

    const archiveManifest = (await fse.readJSON(archiveManifestPath)) as PackagedManifest
    if (archiveManifest.name !== currentManifest.name) {
      result.repairError = `sibling plugin archive name mismatch: expected ${currentManifest.name}, got ${archiveManifest.name}`
      return result
    }

    const mergedManifest = mergePackagedManifestMetadata(archiveManifest, currentManifest)
    if (
      JSON.stringify(mergedManifest._files ?? null) !==
        JSON.stringify(currentManifest._files ?? null) ||
      String(mergedManifest._signature ?? '') !== String(currentManifest._signature ?? '')
    ) {
      currentManifest = mergedManifest as PackagedManifest
      if (await fse.pathExists(manifestPath)) {
        await fse.writeJSON(manifestPath, currentManifest, { spaces: 2 })
      }
      result.manifestUpdated = true
    }

    for (const relativePath of missingFiles) {
      const sourcePath = path.resolve(tempDir, relativePath)
      const relativeToArchive = path.relative(tempDir, sourcePath)
      if (relativeToArchive.startsWith('..') || path.isAbsolute(relativeToArchive)) {
        continue
      }
      if (!(await fse.pathExists(sourcePath))) {
        continue
      }

      const targetPath = path.resolve(pluginDir, relativePath)
      await fse.ensureDir(path.dirname(targetPath))
      await fse.copy(sourcePath, targetPath, { overwrite: false, errorOnExist: false })
      result.repairedFiles.push(relativePath)
    }

    missingFiles = await resolveMissingFiles(pluginDir, requiredFiles)
    result.missingFiles = missingFiles
    return result
  } catch (error) {
    result.repairError = error instanceof Error ? error.message : String(error)
    return result
  } finally {
    await fse.remove(tempDir)
  }
}
