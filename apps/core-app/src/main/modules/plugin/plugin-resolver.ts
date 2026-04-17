import type { IManifest } from '@talex-touch/utils/plugin'
import os from 'node:os'
import path from 'node:path'
import compressing from 'compressing'
import fse from 'fs-extra'
import { isSafePathSegment } from '@talex-touch/utils/common/utils/safe-path'
import {
  CURRENT_SDK_VERSION,
  PERMISSION_ENFORCEMENT_MIN_VERSION,
  resolveSdkApiVersion
} from '@talex-touch/utils/plugin'
import { checkDirWithCreate } from '../../utils/common-util'
import { createLogger } from '../../utils/logger'
import { pluginModule } from './plugin-module'
import { removeNodeModulesDirs, shouldSkipNodeModulesPath } from './plugin-install-copy-utils'
import { type PackagedManifest, ensurePluginRuntimeIntegrity } from './plugin-runtime-integrity'

type ResolverEvent = { msg: unknown }
const pluginResolverLog = createLogger('PluginSystem').child('Resolver')
const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export enum ResolverStatus {
  UNCOMPRESS_ERROR,
  MANIFEST_NOT_FOUND,
  INVALID_MANIFEST,
  SUCCESS
}

export interface ResolverInstallOptions {
  enforceProdMode?: boolean
  /** Force update: stop existing plugin, remove, and reinstall */
  forceUpdate?: boolean
  /** Auto re-enable plugin after update (only applies if forceUpdate is true) */
  autoReEnable?: boolean
}

export interface ResolverOptions {
  installOptions?: ResolverInstallOptions
}

export class PluginResolver {
  filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  private validateManifestSdkApi(manifest: IManifest): string | null {
    const declared = (manifest as { sdkapi?: unknown }).sdkapi
    const resolved = resolveSdkApiVersion(declared)
    if (typeof resolved === 'number' && resolved >= PERMISSION_ENFORCEMENT_MIN_VERSION) {
      return null
    }
    const pluginName = typeof manifest.name === 'string' ? manifest.name : 'unknown'
    return `[SDKAPI_BLOCKED] Plugin "${pluginName}" is blocked: sdkapi must be >= ${PERMISSION_ENFORCEMENT_MIN_VERSION}. Please migrate to sdkapi ${CURRENT_SDK_VERSION}.`
  }

  private async uncompress(source: string, target: string): Promise<void> {
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

    const stat = await fse.stat(source).catch(() => null)
    if (stat?.isDirectory()) {
      let skippedNodeModules = false
      await fse.copy(source, target, {
        overwrite: true,
        filter: (filePath) => {
          const shouldSkip = shouldSkipNodeModulesPath(filePath)
          if (shouldSkip) skippedNodeModules = true
          return !shouldSkip
        }
      })
      if (skippedNodeModules) {
        pluginResolverLog.warn('Skipped node_modules during source directory install copy', {
          meta: { source }
        })
      }
      return
    }

    await compressing.tar.uncompress(source, target)
  }

  async install(
    manifest: IManifest,
    cb: (msg: string, type?: string) => void,
    options?: ResolverInstallOptions
  ): Promise<void> {
    const pluginName = typeof manifest.name === 'string' ? manifest.name : 'unknown'
    pluginResolverLog.info('Installing plugin package', {
      meta: {
        pluginName,
        source: this.filePath,
        forceUpdate: options?.forceUpdate === true,
        autoReEnable: options?.autoReEnable === true
      }
    })
    const sdkapiError = this.validateManifestSdkApi(manifest)
    if (sdkapiError) {
      return cb(sdkapiError, 'error')
    }
    if (typeof manifest.name !== 'string' || !isSafePathSegment(manifest.name)) {
      return cb('invalid plugin name', 'error')
    }
    const _target = path.join(pluginModule.filePath!, manifest.name)
    const existingPlugin = fse.existsSync(_target)
    let wasEnabled = false

    // Handle existing plugin
    if (existingPlugin) {
      if (!options?.forceUpdate) {
        return cb('plugin already exists')
      }

      // Stop and remove existing plugin for update
      pluginResolverLog.info('Updating existing plugin before reinstall', {
        meta: { pluginName }
      })
      try {
        const existingPluginInstance = pluginModule.pluginManager?.getPluginByName(manifest.name)
        if (existingPluginInstance) {
          // Check if plugin was enabled before update
          wasEnabled = existingPluginInstance.status === 4 || existingPluginInstance.status === 5 // ENABLED or ACTIVE

          // Disable the plugin first
          await existingPluginInstance.disable()

          // Unload the plugin from manager
          await pluginModule.pluginManager!.unloadPlugin(manifest.name)
        }

        // Remove old plugin files
        await fse.remove(_target)
        pluginResolverLog.debug('Removed previous plugin files', {
          meta: { pluginName, targetDir: _target }
        })
      } catch (error: unknown) {
        const message = toErrorMessage(error)
        pluginResolverLog.error('Failed to remove previous plugin before reinstall', {
          meta: { pluginName, targetDir: _target },
          error
        })
        return cb(`Failed to remove old plugin: ${message}`, 'error')
      }
    }

    await checkDirWithCreate(_target, true)

    try {
      await this.uncompress(this.filePath, _target)
      await this.sanitizeNodeModules(_target)
      await this.applyInstallOptions(manifest, _target, options)
      const installedManifestPath = path.join(_target, 'manifest.json')
      const installedManifest = (await fse.readJSON(installedManifestPath)) as PackagedManifest
      const integrity = await ensurePluginRuntimeIntegrity({
        pluginDir: _target,
        manifest: installedManifest,
        archivePath: this.filePath
      })
      if (integrity.missingFiles.length > 0) {
        throw new Error(
          `Missing required webcontent entry files after install: ${integrity.missingFiles.join(', ')}`
        )
      }

      // Load the new plugin
      await pluginModule.pluginManager!.loadPlugin(manifest.name)

      // Auto re-enable if requested and was previously enabled
      if (options?.forceUpdate && options?.autoReEnable && wasEnabled) {
        pluginResolverLog.info('Auto re-enabling plugin after update', {
          meta: { pluginName }
        })
        const newPluginInstance = pluginModule.pluginManager?.getPluginByName(manifest.name)
        if (newPluginInstance) {
          await newPluginInstance.enable()
        }
      }

      cb('success', 'success')
    } catch (error: unknown) {
      const message = toErrorMessage(error)
      pluginResolverLog.error('Failed to install plugin package', {
        meta: {
          pluginName,
          source: this.filePath,
          targetDir: _target
        },
        error
      })
      try {
        await fse.remove(_target)
      } catch (cleanupError: unknown) {
        pluginResolverLog.warn('Failed to cleanup broken plugin directory after install error', {
          meta: { pluginName, targetDir: _target },
          error: cleanupError
        })
      }
      cb(message || 'Install failed', 'error')
    }
  }

  async resolve(
    callback: (result: { event: ResolverEvent; type: string }) => void,
    whole = false,
    options?: ResolverOptions
  ): Promise<void> {
    pluginResolverLog.debug('Resolving plugin package', {
      meta: { source: this.filePath, whole }
    })
    const event: ResolverEvent = { msg: '' }
    const tempDir = path.join(os.tmpdir(), `talex-touch-resolve-${Date.now()}`)

    try {
      await fse.ensureDir(tempDir)
      await this.uncompress(this.filePath, tempDir)
      await this.sanitizeNodeModules(tempDir)

      const manifestPath = path.join(tempDir, 'manifest.json')
      const keyPath = path.join(tempDir, 'key.talex')
      let finalManifestPath = ''

      if (await fse.pathExists(manifestPath)) {
        finalManifestPath = manifestPath
      } else if (await fse.pathExists(keyPath)) {
        finalManifestPath = keyPath
      } else {
        event.msg = ResolverStatus.MANIFEST_NOT_FOUND
        return callback({ event, type: 'error' })
      }

      const manifestContent = await fse.readFile(finalManifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent)

      if (!manifest._files || !manifest._signature) {
        event.msg = ResolverStatus.INVALID_MANIFEST
        return callback({ event, type: 'error' })
      }

      const sdkapiError = this.validateManifestSdkApi(manifest as IManifest)
      if (sdkapiError) {
        event.msg = sdkapiError
        return callback({ event, type: 'error' })
      }

      if (whole) {
        await this.install(
          manifest,
          (msg, type = 'error') => {
            event.msg = msg
            callback({ event, type })
          },
          options?.installOptions
        )
      } else {
        event.msg = manifest
        callback({ event, type: 'success' })
      }
    } catch (error: unknown) {
      pluginResolverLog.error('Failed to resolve plugin package', {
        meta: { source: this.filePath, whole },
        error
      })
      event.msg = ResolverStatus.UNCOMPRESS_ERROR
      callback({ event, type: 'error' })
    } finally {
      await fse.remove(tempDir)
      pluginResolverLog.debug('Released plugin resolve temp directory', {
        meta: { source: this.filePath, tempDir }
      })
    }
  }

  private async applyInstallOptions(
    manifest: IManifest,
    targetDir: string,
    options?: ResolverInstallOptions
  ): Promise<void> {
    if (!options?.enforceProdMode) return
    await this.disableDevMode(manifest, targetDir)
  }

  private async sanitizeNodeModules(rootDir: string): Promise<void> {
    const removed = await removeNodeModulesDirs(rootDir)
    if (removed.length > 0) {
      pluginResolverLog.warn('Removed node_modules directories from install payload', {
        meta: { rootDir, removedCount: removed.length }
      })
    }
  }

  private async disableDevMode(manifest: IManifest, targetDir: string): Promise<void> {
    manifest.dev = this.createProdDevConfig(manifest.dev)
    if (manifest.plugin?.dev) {
      manifest.plugin.dev.enable = false
      manifest.plugin.dev.address = ''
    }

    const manifestPath = path.join(targetDir, 'manifest.json')
    try {
      if (!(await fse.pathExists(manifestPath))) return
      const fileManifest = (await fse.readJSON(manifestPath)) as IManifest
      fileManifest.dev = this.createProdDevConfig(fileManifest.dev)
      if (fileManifest.plugin?.dev) {
        fileManifest.plugin.dev.enable = false
        fileManifest.plugin.dev.address = ''
      }
      await fse.writeFile(manifestPath, JSON.stringify(fileManifest, null, 2))
    } catch (error) {
      pluginResolverLog.warn('Failed to enforce prod mode manifest', {
        meta: { pluginName: manifest.name, manifestPath },
        error
      })
    }
  }

  private createProdDevConfig(dev?: IManifest['dev']): IManifest['dev'] {
    const result: IManifest['dev'] = dev ?? { enable: false, address: '' }
    result.enable = false
    result.address = ''
    result.source = false
    return result
  }
}
