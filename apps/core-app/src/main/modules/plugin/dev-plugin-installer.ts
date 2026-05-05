import type { IManifest } from '@talex-touch/utils/plugin'
import path from 'node:path'
import fse from 'fs-extra'
import { isSafePathSegment } from '@talex-touch/utils/common/utils/safe-path'
import { checkDirWithCreate } from '../../utils/common-util'
import { createLogger } from '../../utils/logger'
import { pluginModule } from './plugin-module'
import { shouldSkipNodeModulesPath } from './plugin-install-copy-utils'

const devPluginInstallerLog = createLogger('PluginSystem').child('DevInstaller')

export type DevPluginInstallStatus = 'success' | 'error' | 'exists'

export interface DevPluginInstallResult {
  status: DevPluginInstallStatus
  manifest?: IManifest
  error?: string
}

function resolveSourceDir(sourcePath: string): string | null {
  const resolved = path.resolve(sourcePath)
  if (!fse.pathExistsSync(resolved)) return null
  const stats = fse.statSync(resolved)
  if (stats.isDirectory()) return resolved
  if (stats.isFile() && path.basename(resolved).toLowerCase() === 'manifest.json') {
    return path.dirname(resolved)
  }
  return null
}

function normalizeDevManifest(manifest: IManifest): IManifest {
  return {
    ...manifest,
    dev: {
      enable: true,
      source: false,
      address: manifest.dev?.address ?? ''
    }
  }
}

async function readManifest(sourceDir: string): Promise<IManifest> {
  const manifestPath = path.join(sourceDir, 'manifest.json')
  const exists = await fse.pathExists(manifestPath)
  if (!exists) {
    throw new Error('MANIFEST_NOT_FOUND')
  }
  const manifest = (await fse.readJSON(manifestPath)) as IManifest
  if (!manifest?.name || typeof manifest.name !== 'string') {
    throw new Error('MANIFEST_INVALID')
  }
  return manifest
}

export async function installDevPluginFromPath(
  sourcePath: string,
  options?: { forceUpdate?: boolean }
): Promise<DevPluginInstallResult> {
  try {
    const sourceDir = resolveSourceDir(sourcePath)
    if (!sourceDir) {
      return { status: 'error', error: 'INVALID_PATH' }
    }

    const manifest = await readManifest(sourceDir)
    if (!isSafePathSegment(manifest.name)) {
      return { status: 'error', error: 'INVALID_PLUGIN_NAME' }
    }

    const pluginRoot = pluginModule.filePath
    if (!pluginRoot) {
      return { status: 'error', error: 'PLUGIN_ROOT_MISSING' }
    }

    const targetDir = path.join(pluginRoot, manifest.name)
    const targetExists = await fse.pathExists(targetDir)
    if (targetExists) {
      if (!options?.forceUpdate) {
        return { status: 'exists', manifest }
      }
      const manager = pluginModule.pluginManager
      if (manager?.unloadPlugin) {
        await manager.unloadPlugin(manifest.name)
      }
      await fse.remove(targetDir)
    }

    checkDirWithCreate(targetDir, true)
    let skippedNodeModules = false
    await fse.copy(sourceDir, targetDir, {
      overwrite: true,
      errorOnExist: false,
      filter: (filePath) => {
        const shouldSkip = shouldSkipNodeModulesPath(filePath)
        if (shouldSkip) skippedNodeModules = true
        return !shouldSkip
      }
    })
    if (skippedNodeModules) {
      devPluginInstallerLog.warn('Skipped node_modules during dev plugin copy', {
        meta: { pluginName: manifest.name, sourceDir, targetDir }
      })
    }

    const normalized = normalizeDevManifest(manifest)
    const targetManifestPath = path.join(targetDir, 'manifest.json')
    await fse.writeJSON(targetManifestPath, normalized, { spaces: 2 })

    const manager = pluginModule.pluginManager
    if (!manager?.loadPlugin) {
      return { status: 'error', error: 'PLUGIN_MANAGER_NOT_READY' }
    }
    await manager.loadPlugin(manifest.name)

    return { status: 'success', manifest: normalized }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { status: 'error', error: message }
  }
}
