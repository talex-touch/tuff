import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import fse from 'fs-extra'

export const TOUCH_TRANSLATION_PLUGIN_NAME = 'touch-translation'
export const LEGACY_TRANSLATION_WIDGET_IMPORT = '../shared/translation-shared.cjs'

type VersionedRecord = {
  version?: unknown
}

export interface TouchTranslationRuntimeRepairOptions {
  appPath: string
  isPackaged: boolean
  pluginRootDir: string
}

export interface TouchTranslationRuntimeRepairResult {
  status:
    | 'healthy'
    | 'repair-failed'
    | 'repaired'
    | 'skipped-source-missing'
    | 'skipped-target-missing'
  repaired: boolean
  driftReasons: string[]
  error?: string
  sourceDir?: string
  sourceVersion?: string
  targetDir: string
  targetManifestVersion?: string
  targetPackageVersion?: string
}

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

async function isRuntimeReadyPluginDir(pluginDir: string): Promise<boolean> {
  const manifestPath = path.resolve(pluginDir, 'manifest.json')
  const indexPath = path.resolve(pluginDir, 'index.js')
  return (await fse.pathExists(manifestPath)) && (await fse.pathExists(indexPath))
}

function buildSourceCandidates(options: TouchTranslationRuntimeRepairOptions): string[] {
  const candidates = new Set<string>()

  if (!options.isPackaged) {
    candidates.add(path.resolve(options.appPath, '../../plugins/touch-translation/dist/build'))
    candidates.add(path.resolve(options.appPath, '../../../plugins/touch-translation/dist/build'))
    candidates.add(path.resolve(process.cwd(), '../../plugins/touch-translation/dist/build'))
    candidates.add(path.resolve(process.cwd(), 'plugins/touch-translation/dist/build'))
  }

  candidates.add(path.resolve(options.appPath, 'tuff/modules/plugins/touch-translation'))
  candidates.add(path.resolve(options.appPath, 'tuff/modules/plugins/touch-translation/dist/build'))

  return [...candidates]
}

async function resolveSourceDir(
  options: TouchTranslationRuntimeRepairOptions
): Promise<string | undefined> {
  const candidates = buildSourceCandidates(options)

  for (const candidate of candidates) {
    if (await isRuntimeReadyPluginDir(candidate)) {
      return candidate
    }
  }

  return undefined
}

async function collectDriftReasons(args: { sourceVersion?: string; targetDir: string }): Promise<{
  reasons: string[]
  targetManifestVersion?: string
  targetPackageVersion?: string
}> {
  const manifestPath = path.resolve(args.targetDir, 'manifest.json')
  const packagePath = path.resolve(args.targetDir, 'package.json')
  const widgetPath = path.resolve(args.targetDir, 'widgets/translate-panel.vue')
  const indexPath = path.resolve(args.targetDir, 'index.js')

  const reasons: string[] = []
  const targetManifestVersion = await readVersion(manifestPath)
  const targetPackageVersion = await readVersion(packagePath)

  if (!(await fse.pathExists(manifestPath))) {
    reasons.push('missing-manifest')
  }

  if (!(await fse.pathExists(indexPath))) {
    reasons.push('missing-index')
  }

  if (!(await fse.pathExists(widgetPath))) {
    reasons.push('missing-widget')
  } else {
    const widgetSource = await fse.readFile(widgetPath, 'utf-8')
    if (widgetSource.includes(LEGACY_TRANSLATION_WIDGET_IMPORT)) {
      reasons.push('legacy-widget-shared-import')
    }
  }

  if (args.sourceVersion && compareVersions(targetManifestVersion, args.sourceVersion) < 0) {
    reasons.push(`manifest-version:${targetManifestVersion ?? 'missing'}<${args.sourceVersion}`)
  }

  if (
    targetPackageVersion &&
    args.sourceVersion &&
    compareVersions(targetPackageVersion, args.sourceVersion) < 0
  ) {
    reasons.push(`package-version:${targetPackageVersion}<${args.sourceVersion}`)
  }

  return {
    reasons,
    targetManifestVersion,
    targetPackageVersion
  }
}

async function repairRuntimePluginDirectory(sourceDir: string, targetDir: string): Promise<void> {
  const backupDir = await fse.mkdtemp(path.join(os.tmpdir(), 'tuff-touch-translation-backup-'))
  const stagedSourceDir = await fse.mkdtemp(
    path.join(os.tmpdir(), 'tuff-touch-translation-source-')
  )

  await fse.copy(sourceDir, stagedSourceDir, {
    overwrite: true
  })

  const hasTarget = await fse.pathExists(targetDir)

  try {
    if (hasTarget) {
      await fse.copy(targetDir, backupDir, {
        overwrite: true
      })
    }

    await fse.remove(targetDir)
    await fse.copy(stagedSourceDir, targetDir, {
      overwrite: true
    })
  } catch (error) {
    await fse.remove(targetDir).catch(() => {})
    if (hasTarget) {
      await fse.copy(backupDir, targetDir, {
        overwrite: true
      })
    }
    throw error
  } finally {
    await Promise.allSettled([fse.remove(backupDir), fse.remove(stagedSourceDir)])
  }
}

export async function repairTouchTranslationRuntimeIfNeeded(
  options: TouchTranslationRuntimeRepairOptions
): Promise<TouchTranslationRuntimeRepairResult> {
  const targetDir = path.resolve(options.pluginRootDir, TOUCH_TRANSLATION_PLUGIN_NAME)

  if (!(await fse.pathExists(targetDir))) {
    return {
      status: 'skipped-target-missing',
      repaired: false,
      driftReasons: [],
      targetDir
    }
  }

  const sourceDir = await resolveSourceDir(options)
  if (!sourceDir) {
    return {
      status: 'skipped-source-missing',
      repaired: false,
      driftReasons: [],
      targetDir
    }
  }

  const sourceVersion = await readVersion(path.resolve(sourceDir, 'manifest.json'))
  const { reasons, targetManifestVersion, targetPackageVersion } = await collectDriftReasons({
    sourceVersion,
    targetDir
  })

  if (reasons.length === 0) {
    return {
      status: 'healthy',
      repaired: false,
      driftReasons: [],
      sourceDir,
      sourceVersion,
      targetDir,
      targetManifestVersion,
      targetPackageVersion
    }
  }

  try {
    await repairRuntimePluginDirectory(sourceDir, targetDir)
    return {
      status: 'repaired',
      repaired: true,
      driftReasons: reasons,
      sourceDir,
      sourceVersion,
      targetDir,
      targetManifestVersion,
      targetPackageVersion
    }
  } catch (error) {
    return {
      status: 'repair-failed',
      repaired: false,
      driftReasons: reasons,
      error: error instanceof Error ? error.message : String(error),
      sourceDir,
      sourceVersion,
      targetDir,
      targetManifestVersion,
      targetPackageVersion
    }
  }
}
