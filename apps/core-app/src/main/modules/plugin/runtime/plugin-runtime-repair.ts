import path from 'node:path'
import fse from 'fs-extra'

export const PLUGIN_RUNTIME_DRIFT_CODE = 'PLUGIN_RUNTIME_DRIFT'
export const LEGACY_TRANSLATION_WIDGET_IMPORT = '../shared/translation-shared.cjs'

type VersionedRecord = {
  version?: unknown
}

export interface PluginRuntimeDriftOptions {
  pluginDir: string
}

export interface PluginRuntimeDriftResult {
  status: 'healthy' | 'drifted'
  driftReasons: string[]
  targetDir: string
  targetManifestVersion?: string
  targetPackageVersion?: string
}

const SCANNABLE_TEXT_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.vue'])
const LEGACY_RUNTIME_PATTERNS = [
  {
    code: 'legacy-runtime-import',
    needle: LEGACY_TRANSLATION_WIDGET_IMPORT
  }
] as const

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return (await fse.readJSON(filePath)) as T
  } catch {
    return null
  }
}

async function readVersion(filePath: string): Promise<string | undefined> {
  const record = await readJsonFile<VersionedRecord>(filePath)
  return typeof record?.version === 'string' ? record.version : undefined
}

function parseComparableVersion(version: string): {
  major: number
  minor: number
  patch: number
  prerelease: string[]
} {
  const cleaned = version.replace(/^v/i, '').trim()
  const [main, prerelease] = cleaned.split('-', 2)
  const [major = 0, minor = 0, patch = 0] = (main || '')
    .split('.')
    .map((value) => Number.parseInt(value, 10) || 0)

  return {
    major,
    minor,
    patch,
    prerelease: prerelease ? prerelease.split('.') : []
  }
}

function comparePrereleases(a: string[], b: string[]): -1 | 0 | 1 {
  if (a.length === 0 && b.length > 0) return 1
  if (a.length > 0 && b.length === 0) return -1
  if (a.length === 0 && b.length === 0) return 0

  const maxLen = Math.max(a.length, b.length)
  for (let index = 0; index < maxLen; index += 1) {
    const aPart = a[index]
    const bPart = b[index]

    if (aPart === undefined) return -1
    if (bPart === undefined) return 1

    const aNum = Number.parseInt(aPart, 10)
    const bNum = Number.parseInt(bPart, 10)
    const aIsNum = !Number.isNaN(aNum)
    const bIsNum = !Number.isNaN(bNum)

    if (aIsNum && !bIsNum) return -1
    if (!aIsNum && bIsNum) return 1

    if (aIsNum && bIsNum) {
      if (aNum < bNum) return -1
      if (aNum > bNum) return 1
      continue
    }

    if (aPart < bPart) return -1
    if (aPart > bPart) return 1
  }

  return 0
}

function compareVersions(a: string | undefined, b: string | undefined): -1 | 0 | 1 {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1

  const parsedA = parseComparableVersion(a)
  const parsedB = parseComparableVersion(b)

  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1
  }

  return comparePrereleases(parsedA.prerelease, parsedB.prerelease)
}

async function collectRuntimeTextFiles(rootDir: string): Promise<string[]> {
  const files: string[] = []
  const queue = [rootDir]

  while (queue.length > 0) {
    const currentDir = queue.shift()
    if (!currentDir) continue

    const entries = await fse.readdir(currentDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const nextPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue
        }
        queue.push(nextPath)
        continue
      }
      if (SCANNABLE_TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(nextPath)
      }
    }
  }

  return files
}

async function collectLegacyImportReasons(pluginDir: string): Promise<string[]> {
  const files = await collectRuntimeTextFiles(pluginDir)
  if (files.length === 0) {
    return []
  }

  const reasons = new Set<string>()
  for (const filePath of files) {
    const source = await fse.readFile(filePath, 'utf-8').catch(() => '')
    if (!source) continue

    for (const pattern of LEGACY_RUNTIME_PATTERNS) {
      if (source.includes(pattern.needle)) {
        reasons.add(pattern.code)
      }
    }
  }

  return [...reasons]
}

export async function inspectPluginRuntimeDrift(
  options: PluginRuntimeDriftOptions
): Promise<PluginRuntimeDriftResult> {
  const targetDir = options.pluginDir
  const manifestPath = path.resolve(targetDir, 'manifest.json')
  const packagePath = path.resolve(targetDir, 'package.json')
  const indexPath = path.resolve(targetDir, 'index.js')

  const driftReasons: string[] = []
  const targetManifestVersion = await readVersion(manifestPath)
  const targetPackageVersion = await readVersion(packagePath)

  if (!(await fse.pathExists(targetDir))) {
    driftReasons.push('missing-plugin-dir')
  }
  if (!(await fse.pathExists(manifestPath))) {
    driftReasons.push('missing-manifest')
  }
  if (!(await fse.pathExists(indexPath))) {
    driftReasons.push('missing-index')
  }
  if (
    targetManifestVersion &&
    targetPackageVersion &&
    compareVersions(targetPackageVersion, targetManifestVersion) < 0
  ) {
    driftReasons.push(`package-version:${targetPackageVersion}<${targetManifestVersion}`)
  }

  driftReasons.push(...(await collectLegacyImportReasons(targetDir)))

  return {
    status: driftReasons.length > 0 ? 'drifted' : 'healthy',
    driftReasons,
    targetDir,
    targetManifestVersion,
    targetPackageVersion
  }
}
