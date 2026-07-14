import path from 'node:path'
import process from 'node:process'
import fse from 'fs-extra'
import { compareUpdateVersions } from '../../../shared/update/version'

type PackagedPluginManifest = {
  name?: unknown
  version?: unknown
  _files?: unknown
  _signature?: unknown
}

interface OfficialPluginSeedDescriptor {
  pluginName: string
  seedRoot: string
  version: string
  fingerprint: string
}

export type OfficialPluginSeedStatus =
  | 'current'
  | 'installed'
  | 'newer-local'
  | 'repaired'
  | 'updated'

export interface OfficialPluginSeedResult {
  pluginName: string
  seedVersion: string
  localVersion?: string
  status: OfficialPluginSeedStatus
  targetRoot: string
}

export interface InstallBundledOfficialPluginSeedsOptions {
  seedRoot: string
  runtimePluginRoot: string
}

const PRESERVED_RUNTIME_ENTRIES = ['data', 'logs'] as const
const VERSION_PATTERN = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function readManifestFingerprint(manifest: PackagedPluginManifest): string {
  if (typeof manifest._signature === 'string' && manifest._signature.trim()) {
    return manifest._signature.trim()
  }
  return JSON.stringify(manifest._files ?? {})
}

function readManifest(manifestPath: string): PackagedPluginManifest | null {
  try {
    return fse.readJSONSync(manifestPath) as PackagedPluginManifest
  } catch {
    return null
  }
}

function collectOfficialPluginSeeds(seedRoot: string): OfficialPluginSeedDescriptor[] {
  if (!fse.pathExistsSync(seedRoot)) {
    throw new Error(`Bundled official plugin seed root is missing: ${seedRoot}`)
  }

  const entries = fse.readdirSync(seedRoot, { withFileTypes: true })
  const pluginEntries = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (pluginEntries.length === 0) {
    throw new Error(`Bundled official plugin seed root is empty: ${seedRoot}`)
  }

  const descriptors: OfficialPluginSeedDescriptor[] = []
  for (const entry of pluginEntries) {
    const pluginSeedRoot = path.join(seedRoot, entry.name)
    const manifest = readManifest(path.join(pluginSeedRoot, 'manifest.json'))
    const version = typeof manifest?.version === 'string' ? manifest.version.trim() : ''
    if (manifest?.name !== entry.name || !VERSION_PATTERN.test(version)) {
      throw new Error(`Invalid bundled official plugin seed: ${entry.name}`)
    }

    descriptors.push({
      pluginName: entry.name,
      seedRoot: pluginSeedRoot,
      version,
      fingerprint: readManifestFingerprint(manifest)
    })
  }

  return descriptors
}

function restorePreservedRuntimeEntries(currentRoot: string, stagedRoot: string): void {
  for (const entryName of PRESERVED_RUNTIME_ENTRIES) {
    const currentEntry = path.join(currentRoot, entryName)
    if (fse.pathExistsSync(currentEntry)) {
      fse.copySync(currentEntry, path.join(stagedRoot, entryName), { overwrite: true })
    }
  }
}

function replacePluginRuntime(
  descriptor: OfficialPluginSeedDescriptor,
  runtimePluginRoot: string
): void {
  const targetRoot = path.join(runtimePluginRoot, descriptor.pluginName)
  const stagingBase = path.join(runtimePluginRoot, '.official-plugin-seed-staging')
  const nonce = `${process.pid}-${Date.now()}`
  const stagedRoot = path.join(stagingBase, `${descriptor.pluginName}-${nonce}`)
  const backupRoot = path.join(stagingBase, `${descriptor.pluginName}-${nonce}.backup`)
  const targetExists = fse.pathExistsSync(targetRoot)

  fse.ensureDirSync(stagingBase)
  fse.copySync(descriptor.seedRoot, stagedRoot, { overwrite: true })
  if (targetExists) {
    restorePreservedRuntimeEntries(targetRoot, stagedRoot)
    fse.moveSync(targetRoot, backupRoot)
  }

  try {
    fse.moveSync(stagedRoot, targetRoot)
  } catch (error) {
    if (targetExists && fse.pathExistsSync(backupRoot)) {
      fse.moveSync(backupRoot, targetRoot, { overwrite: true })
    }
    throw error
  } finally {
    fse.removeSync(stagedRoot)
  }

  fse.removeSync(backupRoot)
  const remainingStagingEntries = fse.readdirSync(stagingBase)
  if (remainingStagingEntries.length === 0) {
    fse.removeSync(stagingBase)
  }
}

export function installBundledOfficialPluginSeeds(
  options: InstallBundledOfficialPluginSeedsOptions
): OfficialPluginSeedResult[] {
  const descriptors = collectOfficialPluginSeeds(options.seedRoot)
  fse.ensureDirSync(options.runtimePluginRoot)

  const results: OfficialPluginSeedResult[] = []
  for (const descriptor of descriptors) {
    const targetRoot = path.join(options.runtimePluginRoot, descriptor.pluginName)
    const targetExists = fse.pathExistsSync(targetRoot)
    const localManifest = targetExists ? readManifest(path.join(targetRoot, 'manifest.json')) : null
    const localIdentityMatches = localManifest?.name === descriptor.pluginName
    const localVersion =
      typeof localManifest?.version === 'string' ? localManifest.version.trim() : undefined
    const versionComparison = compareUpdateVersions(localVersion, descriptor.version)
    const localFingerprint = localManifest ? readManifestFingerprint(localManifest) : ''

    if (targetExists && localIdentityMatches && localVersion && versionComparison > 0) {
      results.push({
        pluginName: descriptor.pluginName,
        seedVersion: descriptor.version,
        localVersion,
        status: 'newer-local',
        targetRoot
      })
      continue
    }

    if (
      targetExists &&
      localIdentityMatches &&
      localVersion &&
      versionComparison === 0 &&
      localFingerprint === descriptor.fingerprint
    ) {
      results.push({
        pluginName: descriptor.pluginName,
        seedVersion: descriptor.version,
        localVersion,
        status: 'current',
        targetRoot
      })
      continue
    }

    replacePluginRuntime(descriptor, options.runtimePluginRoot)
    results.push({
      pluginName: descriptor.pluginName,
      seedVersion: descriptor.version,
      localVersion,
      status: !targetExists
        ? 'installed'
        : localIdentityMatches && localVersion
          ? 'updated'
          : 'repaired',
      targetRoot
    })
  }

  return results
}
