import type {
  BuiltNpmPackageJson,
  PluginPackagePolicyResult,
  PluginSecurityScanFile,
  PluginSecurityScanReport,
  PluginSecurityScanWaiver,
} from '@talex-touch/utils/plugin'
import type { NpmPublishAccess } from './types'
import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import process from 'node:process'
import zlib from 'node:zlib'
import {
  buildNpmPackageJson,
  formatPluginPackageViolation,
  isPluginSecurityScanTextPath,
  NPM_PLUGIN_TARBALL_ROOT_DIR,
  PLUGIN_SECURITY_MAX_FILE_INSPECTION_BYTES,
  scanPluginPackage,
  validatePluginPackagePolicy,
} from '@talex-touch/utils/plugin'
import fs from 'fs-extra'
import { globSync } from 'glob'
import path from 'pathe'
import { collectPackageEntries } from './package-files'
import {
  assertPluginSecurityScan,
  resolveSecurityScanWaivers,
} from './security-scan'
import { generateFilesSha256, generateSignature } from './security-util'

const TAR_BLOCK_SIZE = 512
const TAR_NAME_MAX_BYTES = 100
const TAR_PREFIX_MAX_BYTES = 155
const TAR_PREFIX_OFFSET = 345
/**
 * Standard npm reproducible tarball timestamp (`1985-10-26T08:15:00.000Z`).
 * Overridden by `SOURCE_DATE_EPOCH` when set.
 */
const DEFAULT_REPRODUCIBLE_MTIME_SECONDS = 499_162_500

const ROOT_LICENSE_CANDIDATES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'] as const
const SKIPPED_BUILD_ROOT_FILES = new Set(['manifest.json', 'package.json', 'key.talex'])

export interface NpmTarballFileEntry {
  relativePath: string
  content: Buffer
}

export interface CreateReproducibleNpmTarballOptions {
  rootDir?: string
  mtimeSeconds?: number
}

export interface ValidateStagedNpmPackageOptions {
  npmDir: string
  expectedPackageName?: string
  waivers?: readonly PluginSecurityScanWaiver[]
  mtimeSeconds?: number
}

export interface ValidatedStagedNpmPackage {
  npmDir: string
  packageName: string
  version: string
  tarballFilename: string
  tgzBuffer: Buffer
  tarballSize: number
  artifactSha256: string
  integrity: string
  shasum: string
  fileCount: number
  packageJson: BuiltNpmPackageJson
  manifest: Record<string, unknown>
  policy: Extract<PluginPackagePolicyResult, { ok: true }>
  securityScan: PluginSecurityScanReport
}

export interface PackNpmPluginOptions {
  root?: string
  outDir?: string
  buildDir?: string
  npmDir?: string
  manifest?: string
  packageName?: string
  access?: NpmPublishAccess
  tarballOutDir?: string
  writeTarball?: boolean
  securityWaivers?: string
  mtimeSeconds?: number
}

export interface PackNpmPluginResult {
  packageName: string
  version: string
  npmDir: string
  tarballPath?: string
  tarballFilename: string
  tarballSize: number
  artifactSha256: string
  integrity: string
  shasum: string
  fileCount: number
  packageJson: BuiltNpmPackageJson
  manifest: Record<string, unknown>
  securityScan: PluginSecurityScanReport
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function resolveTarMtimeSeconds(override?: number): number {
  if (override !== undefined) {
    if (!Number.isSafeInteger(override) || override < 0)
      throw new Error('mtimeSeconds must be a non-negative safe integer.')
    return override
  }

  const raw = process.env.SOURCE_DATE_EPOCH?.trim()
  if (!raw)
    return DEFAULT_REPRODUCIBLE_MTIME_SECONDS
  if (!/^\d+$/.test(raw))
    throw new Error('SOURCE_DATE_EPOCH must be a non-negative integer in seconds.')

  const seconds = Number(raw)
  if (!Number.isSafeInteger(seconds))
    throw new Error('SOURCE_DATE_EPOCH exceeds the supported timestamp range.')
  return seconds
}

function normalizePosixRelativePath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\.\//, '')
  if (
    !normalized
    || normalized.includes('\0')
    || normalized.startsWith('/')
    || /^[a-z]:/i.test(normalized)
  ) {
    throw new Error(`Invalid relative archive entry path: "${rawPath}"`)
  }
  const segments = normalized.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Invalid relative archive entry path: "${rawPath}"`)
  }
  return normalized
}

/**
 * Format an npm-safe tarball filename (`@scope/name` -> `scope-name-1.0.0.tgz`).
 */
export function formatNpmTarballFilename(packageName: string, version: string): string {
  const safeName = packageName.trim().replace(/^@/, '').replace(/\//g, '-')
  return `${safeName}-${version.trim()}.tgz`
}

function splitUstarPath(fullPath: string): { prefix: string, name: string } {
  if (Buffer.byteLength(fullPath, 'utf8') <= TAR_NAME_MAX_BYTES) {
    return { prefix: '', name: fullPath }
  }

  let splitAt = fullPath.lastIndexOf('/')
  while (splitAt > 0) {
    const prefix = fullPath.slice(0, splitAt)
    const name = fullPath.slice(splitAt + 1)
    if (
      Buffer.byteLength(prefix, 'utf8') <= TAR_PREFIX_MAX_BYTES
      && Buffer.byteLength(name, 'utf8') <= TAR_NAME_MAX_BYTES
      && name.length > 0
    ) {
      return { prefix, name }
    }
    splitAt = fullPath.lastIndexOf('/', splitAt - 1)
  }

  throw new Error(
    `Tar entry path exceeds POSIX/ustar limits (155-byte prefix + 100-byte name): "${fullPath}"`,
  )
}

function writeOctalField(buffer: Buffer, value: number, offset: number, length: number): void {
  const digits = value.toString(8)
  if (digits.length > length - 1) {
    throw new Error(`Tar octal value ${value} overflows ${length}-byte field`)
  }
  buffer.write(`${digits.padStart(length - 1, '0')}\0`, offset, length, 'ascii')
}

function createUstarFileBlock(
  fullPath: string,
  content: Buffer,
  mtimeSeconds: number,
): Buffer {
  const { prefix, name } = splitUstarPath(fullPath)
  const header = Buffer.alloc(TAR_BLOCK_SIZE, 0)

  header.write(name, 0, Buffer.byteLength(name, 'utf8'), 'utf8')
  writeOctalField(header, 0o644, 100, 8)
  writeOctalField(header, 0, 108, 8)
  writeOctalField(header, 0, 116, 8)
  writeOctalField(header, content.length, 124, 12)
  writeOctalField(header, mtimeSeconds, 136, 12)
  // Checksum field is filled with ASCII spaces prior to checksum computation.
  header.fill(0x20, 148, 156)
  header.write('0', 156, 1, 'ascii')
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')
  writeOctalField(header, 0, 329, 8)
  writeOctalField(header, 0, 337, 8)
  if (prefix) {
    header.write(prefix, TAR_PREFIX_OFFSET, Buffer.byteLength(prefix, 'utf8'), 'utf8')
  }

  let checksum = 0
  for (let i = 0; i < TAR_BLOCK_SIZE; i += 1) {
    checksum += header[i] ?? 0
  }
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')

  const paddingLength = (TAR_BLOCK_SIZE - (content.length % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE
  if (paddingLength === 0)
    return Buffer.concat([header, content])
  return Buffer.concat([header, content, Buffer.alloc(paddingLength, 0)])
}

/**
 * Create a reproducible POSIX/ustar `.tgz` tarball with every entry rooted under `package/`.
 */
export function createReproducibleNpmTarball(
  files: readonly NpmTarballFileEntry[],
  options: CreateReproducibleNpmTarballOptions = {},
): Buffer {
  const rootDir = normalizePosixRelativePath(options.rootDir ?? NPM_PLUGIN_TARBALL_ROOT_DIR)
  const mtimeSeconds = resolveTarMtimeSeconds(options.mtimeSeconds)

  const sorted = [...files]
    .map(file => ({
      relativePath: normalizePosixRelativePath(file.relativePath),
      content: file.content,
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'))

  const chunks: Buffer[] = []
  for (const file of sorted) {
    chunks.push(createUstarFileBlock(`${rootDir}/${file.relativePath}`, file.content, mtimeSeconds))
  }
  chunks.push(Buffer.alloc(TAR_BLOCK_SIZE * 2, 0))

  const tarBuffer = Buffer.concat(chunks)
  const tgzBuffer = zlib.gzipSync(tarBuffer, { level: 9 })

  // Normalize RFC 1952 gzip header (mtime=0, OS=Unix) for cross-platform determinism.
  if (tgzBuffer.length >= 10 && tgzBuffer[0] === 0x1F && tgzBuffer[1] === 0x8B) {
    tgzBuffer[4] = 0
    tgzBuffer[5] = 0
    tgzBuffer[6] = 0
    tgzBuffer[7] = 0
    tgzBuffer[9] = 3
  }

  return tgzBuffer
}

function toScanFile(relativePath: string, content: Buffer): PluginSecurityScanFile {
  const isText = isPluginSecurityScanTextPath(relativePath)
  const truncated = isText && content.length > PLUGIN_SECURITY_MAX_FILE_INSPECTION_BYTES
  return {
    path: relativePath,
    size: content.length,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
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

function verifyStagedFileMap(
  manifest: Record<string, unknown>,
  filesByPath: Map<string, Buffer>,
): boolean {
  const rawFileMap = manifest._files
  if (!isRecord(rawFileMap))
    return false

  const expectedEntries = Object.entries(rawFileMap)
  const actualPaths = Array.from(filesByPath.keys())
    .filter(rel => rel !== 'manifest.json' && rel !== 'key.talex')
    .sort((left, right) => left.localeCompare(right, 'en'))
  const expectedPaths = expectedEntries
    .map(([rawPath]) => rawPath.replace(/\\/g, '/').replace(/^\.\//, ''))
    .sort((left, right) => left.localeCompare(right, 'en'))

  if (actualPaths.length !== expectedPaths.length)
    return false
  if (actualPaths.some((entryPath, index) => entryPath !== expectedPaths[index]))
    return false

  const normalizedMap: Record<string, string> = {}
  for (const [rawPath, rawDigest] of expectedEntries) {
    if (typeof rawDigest !== 'string' || !/^sha256-[a-f0-9]{64}$/i.test(rawDigest))
      return false
    const normalizedPath = rawPath.replace(/\\/g, '/').replace(/^\.\//, '')
    const content = filesByPath.get(normalizedPath)
    if (!content)
      return false
    const actualHex = crypto.createHash('sha256').update(content).digest('hex')
    if (actualHex !== rawDigest.slice('sha256-'.length).toLowerCase())
      return false
    normalizedMap[rawPath] = rawDigest
  }

  return manifest._signature === generateSignature(normalizedMap)
}

function copyRuntimeFilesFromBuildDir(buildDir: string, npmDir: string): void {
  const walk = (currentSourceDir: string, currentTargetDir: string, isRootLevel: boolean) => {
    const dirEntries = fs.readdirSync(currentSourceDir)
      .sort((left, right) => left.localeCompare(right, 'en'))

    for (const entryName of dirEntries) {
      const lower = entryName.toLowerCase()
      if (
        isRootLevel
        && (SKIPPED_BUILD_ROOT_FILES.has(entryName)
          || lower.endsWith('.tpex')
          || lower.endsWith('.tgz'))
      ) {
        continue
      }

      const sourcePath = path.join(currentSourceDir, entryName)
      const targetPath = path.join(currentTargetDir, entryName)
      const stats = fs.lstatSync(sourcePath)

      if (stats.isSymbolicLink()) {
        // Preserve symlink into staging so fail-closed package policy explicitly denies it.
        fs.ensureDirSync(path.dirname(targetPath))
        fs.symlinkSync(fs.readlinkSync(sourcePath), targetPath)
      }
      else if (stats.isDirectory()) {
        fs.ensureDirSync(targetPath)
        walk(sourcePath, targetPath, false)
      }
      else if (stats.isFile()) {
        fs.ensureDirSync(path.dirname(targetPath))
        fs.copyFileSync(sourcePath, targetPath)
      }
    }
  }

  walk(buildDir, npmDir, true)
}

function copyOptionalRootDocFiles(root: string, npmDir: string): void {
  const readmeSrc = path.join(root, 'README.md')
  const readmeDest = path.join(npmDir, 'README.md')
  if (!fs.existsSync(readmeDest) && fs.existsSync(readmeSrc) && fs.lstatSync(readmeSrc).isFile()) {
    fs.copyFileSync(readmeSrc, readmeDest)
  }

  for (const licenseFile of ROOT_LICENSE_CANDIDATES) {
    const licenseSrc = path.join(root, licenseFile)
    const licenseDest = path.join(npmDir, licenseFile)
    if (fs.existsSync(licenseDest))
      break
    if (fs.existsSync(licenseSrc) && fs.lstatSync(licenseSrc).isFile()) {
      fs.copyFileSync(licenseSrc, licenseDest)
      break
    }
  }
}

function collectSortedRegularFiles(rootDir: string): string[] {
  return globSync('**/*', {
    cwd: rootDir,
    nodir: true,
    dot: true,
    follow: false,
  })
    .map(file => file.replace(/\\/g, '/'))
    .filter((relativePath) => {
      const fullPath = path.join(rootDir, relativePath)
      return fs.lstatSync(fullPath).isFile()
    })
    .sort((left, right) => left.localeCompare(right, 'en'))
}

function computeSortedFileMap(fileRelativePaths: readonly string[], baseDir: string): Record<string, string> {
  const absolutePaths = fileRelativePaths.map(relativePath => path.join(baseDir, relativePath))
  const rawHashes = generateFilesSha256(absolutePaths, baseDir)
  const sortedHashes: Record<string, string> = {}
  for (const key of Object.keys(rawHashes).sort((left, right) => left.localeCompare(right, 'en'))) {
    sortedHashes[key] = rawHashes[key]
  }
  return sortedHashes
}

/**
 * Validate an already-staged `dist/npm/` directory against the `'npm-package'` package policy,
 * `_files`/`_signature` integrity, and static security scan (fail-closed), returning the
 * reproducible `.tgz` buffer and digests.
 */
export function validateStagedNpmPackage(
  options: ValidateStagedNpmPackageOptions,
): ValidatedStagedNpmPackage {
  const npmDir = path.resolve(options.npmDir)
  if (!fs.existsSync(npmDir) || !fs.statSync(npmDir).isDirectory()) {
    throw new Error(`Staged npm directory not found: ${npmDir}`)
  }

  const manifestPath = path.join(npmDir, 'manifest.json')
  const packageJsonPath = path.join(npmDir, 'package.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Staged npm directory is missing manifest.json: ${manifestPath}`)
  }
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Staged npm directory is missing package.json: ${packageJsonPath}`)
  }

  const manifest = fs.readJsonSync(manifestPath) as Record<string, unknown>
  const packageJson = fs.readJsonSync(packageJsonPath) as BuiltNpmPackageJson
  const entries = collectPackageEntries(npmDir)

  const regularFilePaths = collectSortedRegularFiles(npmDir)
  const filesByPath = new Map<string, Buffer>()
  const tarballEntries: NpmTarballFileEntry[] = []
  for (const relativePath of regularFilePaths) {
    const content = fs.readFileSync(path.join(npmDir, relativePath))
    filesByPath.set(relativePath, content)
    tarballEntries.push({ relativePath, content })
  }

  const tgzBuffer = createReproducibleNpmTarball(tarballEntries, {
    rootDir: NPM_PLUGIN_TARBALL_ROOT_DIR,
    mtimeSeconds: options.mtimeSeconds,
  })
  const artifactSha256 = crypto.createHash('sha256').update(tgzBuffer).digest('hex')
  const integrity = `sha512-${crypto.createHash('sha512').update(tgzBuffer).digest('base64')}`
  const shasum = crypto.createHash('sha1').update(tgzBuffer).digest('hex')

  const expectedPackageName = options.expectedPackageName ?? (
    typeof packageJson.name === 'string' && packageJson.name.trim()
      ? packageJson.name.trim()
      : undefined
  )
  const policy = validatePluginPackagePolicy({
    profile: 'npm-package',
    manifest,
    packageJson,
    entries,
    archiveSize: tgzBuffer.length,
    ...(expectedPackageName ? { expected: { npmPackageName: expectedPackageName } } : {}),
  })
  if (!policy.ok) {
    throw new Error(
      `NPM plugin package policy failed: ${policy.violations
        .map(formatPluginPackageViolation)
        .join('; ')}`,
    )
  }

  const integrityPassed = verifyStagedFileMap(manifest, filesByPath)
  if (!integrityPassed) {
    throw new Error('NPM plugin package integrity failed: manifest._files or manifest._signature does not match staged files.')
  }

  const scanFiles = Array.from(filesByPath.entries()).map(([relativePath, content]) =>
    toScanFile(relativePath, content),
  )
  const waivers = options.waivers ?? []
  const securityScan = scanPluginPackage({
    artifactSha256,
    policyVersion: policy.policyVersion,
    policyPassed: policy.ok && integrityPassed,
    manifest,
    files: scanFiles,
    waivers,
  })
  assertPluginSecurityScan(securityScan, waivers)

  const packageName = packageJson.name
  const version = packageJson.version

  return {
    npmDir,
    packageName,
    version,
    tarballFilename: formatNpmTarballFilename(packageName, version),
    tgzBuffer,
    tarballSize: tgzBuffer.length,
    artifactSha256,
    integrity,
    shasum,
    fileCount: regularFilePaths.length,
    packageJson,
    manifest,
    policy,
    securityScan,
  }
}

/**
 * Stage `dist/npm/` from built `dist/build/`, generate a sanitized zero-dependency
 * `package.json`, stamp `manifest._files` (including `package.json`) and `manifest._signature`,
 * enforce `npm-package` policy + security scan (fail-closed), and emit a reproducible `.tgz`
 * tarball under `dist/<safe-name>-<version>.tgz`.
 */
export async function packNpmPlugin(
  options: PackNpmPluginOptions = {},
): Promise<PackNpmPluginResult> {
  const root = path.resolve(options.root ?? process.cwd())
  const outDir = options.outDir ?? 'dist'
  const buildDir = path.resolve(root, options.buildDir ?? path.join(outDir, 'build'))
  const npmDir = path.resolve(root, options.npmDir ?? path.join(outDir, 'npm'))
  const tarballOutDir = path.resolve(root, options.tarballOutDir ?? outDir)

  if (!fs.existsSync(buildDir) || !fs.statSync(buildDir).isDirectory()) {
    throw new Error(`Built plugin directory not found: ${buildDir}. Run \`tuff builder\` or \`tuff build\` first.`)
  }

  const builtManifestPath = path.join(buildDir, 'manifest.json')
  const sourceManifestPath = path.resolve(root, options.manifest ?? './manifest.json')
  const manifestPath = fs.existsSync(builtManifestPath) ? builtManifestPath : sourceManifestPath
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`)
  }

  const baseManifest = structuredClone(fs.readJsonSync(manifestPath)) as Record<string, unknown>
  if (!isRecord(baseManifest)) {
    throw new Error(`Invalid manifest JSON in ${manifestPath}`)
  }

  const sourcePackageJsonPath = path.join(root, 'package.json')
  const sourcePackageJson = fs.existsSync(sourcePackageJsonPath)
    ? (fs.readJsonSync(sourcePackageJsonPath) as Record<string, unknown>)
    : undefined

  if (
    sourcePackageJson
    && typeof sourcePackageJson.version === 'string'
    && sourcePackageJson.version.trim()
    && typeof baseManifest.version === 'string'
    && baseManifest.version.trim()
    && sourcePackageJson.version.trim() !== baseManifest.version.trim()
  ) {
    throw new Error(
      `Version mismatch: package.json=${sourcePackageJson.version.trim()} manifest.json=${baseManifest.version.trim()}`,
    )
  }

  // Prepare clean staging directory
  fs.rmSync(npmDir, { recursive: true, force: true })
  fs.mkdirSync(npmDir, { recursive: true })

  try {
    copyRuntimeFilesFromBuildDir(buildDir, npmDir)
    copyOptionalRootDocFiles(root, npmDir)

    // Collect staged runtime files before writing package.json / manifest.json
    const stagedRuntimeFiles = collectSortedRegularFiles(npmDir)

    // Sanitize manifest dev block before building package.json & manifest.json
    const npmManifest: Record<string, unknown> = structuredClone(baseManifest)
    delete npmManifest._files
    delete npmManifest._signature
    npmManifest.dev = {
      ...(isRecord(npmManifest.dev) ? npmManifest.dev : {}),
      enable: false,
      address: '',
      source: false,
    }

    // Build and write dist/npm/package.json BEFORE computing manifest._files and _signature
    const npmPackageJson = buildNpmPackageJson({
      manifest: npmManifest,
      sourcePackageJson,
      packageName: options.packageName,
      access: options.access ?? 'public',
      files: stagedRuntimeFiles,
    })

    fs.writeFileSync(
      path.join(npmDir, 'package.json'),
      `${JSON.stringify(npmPackageJson, null, 2)}\n`,
      'utf-8',
    )

    // Compute manifest._files (including package.json) and manifest._signature
    const filesToHash = collectSortedRegularFiles(npmDir)
      .filter(relativePath => relativePath !== 'manifest.json' && relativePath !== 'key.talex')

    npmManifest._files = computeSortedFileMap(filesToHash, npmDir)
    npmManifest._signature = generateSignature(npmManifest._files as Record<string, string>)

    fs.writeFileSync(
      path.join(npmDir, 'manifest.json'),
      `${JSON.stringify(npmManifest, null, 2)}\n`,
      'utf-8',
    )

    const waivers = resolveSecurityScanWaivers({
      root,
      waiversPath: options.securityWaivers,
    })

    // Fail-closed validation (policy + integrity + security scan)
    const validated = validateStagedNpmPackage({
      npmDir,
      expectedPackageName: npmPackageJson.name,
      waivers,
      mtimeSeconds: options.mtimeSeconds,
    })

    let tarballPath: string | undefined
    if (options.writeTarball !== false) {
      fs.ensureDirSync(tarballOutDir)
      tarballPath = path.join(tarballOutDir, validated.tarballFilename)
      fs.writeFileSync(tarballPath, validated.tgzBuffer)
    }

    return {
      packageName: validated.packageName,
      version: validated.version,
      npmDir: validated.npmDir,
      ...(tarballPath ? { tarballPath } : {}),
      tarballFilename: validated.tarballFilename,
      tarballSize: validated.tarballSize,
      artifactSha256: validated.artifactSha256,
      integrity: validated.integrity,
      shasum: validated.shasum,
      fileCount: validated.fileCount,
      packageJson: validated.packageJson,
      manifest: validated.manifest,
      securityScan: validated.securityScan,
    }
  }
  catch (error) {
    // Fail closed: remove invalid staging output so nothing unverified can be published.
    fs.rmSync(npmDir, { recursive: true, force: true })
    throw error
  }
}
