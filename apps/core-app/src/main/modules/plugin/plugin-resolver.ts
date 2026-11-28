import { PluginStatus, type IManifest } from '@talex-touch/utils/plugin'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import fse from 'fs-extra'
import { isSafePathSegment } from '@talex-touch/utils/common/utils/safe-path'
import { createLogger } from '../../utils/logger'
import { extractTgzSafely } from './npm-tarball-inspector'
import { pluginModule } from './plugin-module'
import { removeNodeModulesDirs, shouldSkipNodeModulesPath } from './plugin-install-copy-utils'
import { type PackagedManifest, ensurePluginRuntimeIntegrity } from './plugin-runtime-integrity'
import { extractArchiveSafely } from './safe-archive-extract'
import {
  hasUnsafePluginNameEdgeChars,
  isReservedPrivilegedPluginName,
  normalizePluginNameForCollision
} from '../../../shared/privileged-plugins'

type ResolverEvent = { msg: unknown }
const pluginResolverLog = createLogger('PluginSystem').child('Resolver')
const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const PRESERVED_RUNTIME_ENTRIES = ['data', 'logs'] as const
const STAGING_DIR_NAME = '.staging'

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
  /**
   * Strip a single top-level root directory during `.tgz` extraction.
   * Defaults to `'auto'` (strips `package/` when all entries live under `package/`).
   */
  stripRootDir?: string | 'auto' | false
  /**
   * Explicit archive container format. When set to `'tgz'`, bypasses filename-suffix dispatch
   * and always extracts via `extractTgzSafely` (prevents archive polyglot bypasses).
   */
  archiveFormat?: 'tgz' | 'tpex' | 'tar' | 'zip'
  /**
   * Permit unstamped npm community packages (both `_files` and `_signature` absent).
   * Must only be passed from the verified `npm-community` install pipeline.
   */
  allowUnstampedNpm?: boolean
}

export interface ResolverOptions {
  installOptions?: ResolverInstallOptions
}

export class PluginResolver {
  filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  private isTgzArchive(source: string): boolean {
    const lower = source.toLowerCase()
    return lower.endsWith('.tar.gz') || lower.endsWith('.tgz')
  }

  private isForcedTgzArchive(source: string, options?: ResolverInstallOptions): boolean {
    return (
      options?.archiveFormat === 'tgz' ||
      options?.stripRootDir === 'package' ||
      this.isTgzArchive(source)
    )
  }

  private async uncompress(
    source: string,
    target: string,
    options?: ResolverInstallOptions
  ): Promise<void> {
    // Explicit tgz/NPM package installs NEVER dispatch by filename suffix, preventing archive
    // polyglots (e.g. a GZIP FEXTRA ZIP served from a `.zip` URL) from hitting zip extraction.
    if (options?.archiveFormat === 'tgz' || options?.stripRootDir === 'package') {
      await extractTgzSafely(source, target, {
        stripRootDir: options?.stripRootDir ?? 'package',
        skipNodeModules: true
      })
      return
    }

    const lower = source.toLowerCase()
    if (lower.endsWith('.tar') || lower.endsWith('.tpex')) {
      await extractArchiveSafely(source, target, 'tar', { skipNodeModules: true })
      return
    }

    if (this.isTgzArchive(source)) {
      await extractTgzSafely(source, target, {
        stripRootDir: options?.stripRootDir ?? 'auto',
        skipNodeModules: true
      })
      return
    }

    if (lower.endsWith('.zip')) {
      await extractArchiveSafely(source, target, 'zip', { skipNodeModules: true })
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

    await extractArchiveSafely(source, target, 'tar', { skipNodeModules: true })
  }

  private async restorePreservedRuntimeEntries(
    currentRoot: string,
    stagedRoot: string
  ): Promise<void> {
    for (const entryName of PRESERVED_RUNTIME_ENTRIES) {
      const currentEntry = path.join(currentRoot, entryName)
      if (await fse.pathExists(currentEntry)) {
        await fse.copy(currentEntry, path.join(stagedRoot, entryName), { overwrite: true })
      }
    }
  }

  private async cleanupStagingRootIfEmpty(stagingRoot: string): Promise<void> {
    try {
      if (!(await fse.pathExists(stagingRoot))) return
      const remaining = await fse.readdir(stagingRoot)
      if (remaining.length === 0) {
        await fse.remove(stagingRoot)
      }
    } catch {
      // Best-effort cleanup of empty staging container
    }
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
    if (
      typeof manifest.name !== 'string' ||
      !isSafePathSegment(manifest.name) ||
      hasUnsafePluginNameEdgeChars(manifest.name)
    ) {
      return cb('invalid plugin name', 'error')
    }
    if (isReservedPrivilegedPluginName(manifest.name)) {
      return cb('privileged plugin name is reserved for the bundled runtime', 'error')
    }
    const pluginsRoot = pluginModule.filePath!
    const existingEntries = await fse.readdir(pluginsRoot).catch(() => [] as string[])
    const normalizedTargetName = normalizePluginNameForCollision(manifest.name)
    const caseCollision = existingEntries.find(
      (entry) =>
        normalizePluginNameForCollision(entry) === normalizedTargetName && entry !== manifest.name
    )
    if (caseCollision) {
      return cb('plugin name collides with an existing plugin directory', 'error')
    }
    const _target = path.join(pluginsRoot, manifest.name)
    const existingPlugin = fse.existsSync(_target)
    if (existingPlugin && !options?.forceUpdate) {
      return cb('plugin already exists')
    }

    const stagingRoot = path.join(pluginsRoot, STAGING_DIR_NAME)
    const nonce = `${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const stagingDir = path.join(stagingRoot, `${manifest.name}-${nonce}`)
    const backupDir = path.join(stagingRoot, `${manifest.name}-${nonce}.backup`)

    let wasEnabled = false
    let unloadedExisting = false
    let movedToBackup = false
    let swappedTarget = false

    try {
      // Phase 1: Stage & validate into <pluginsRoot>/.staging/<name>-<nonce> before touching live files.
      await fse.ensureDir(stagingDir)
      await this.uncompress(this.filePath, stagingDir, options)
      await this.sanitizeNodeModules(stagingDir)
      await this.applyInstallOptions(manifest, stagingDir, options)

      const stagedManifestPath = path.join(stagingDir, 'manifest.json')
      const installedManifest = (await fse.readJSON(stagedManifestPath)) as PackagedManifest
      const integrity = await ensurePluginRuntimeIntegrity({
        pluginDir: stagingDir,
        manifest: installedManifest,
        archivePath: this.isForcedTgzArchive(this.filePath, options) ? undefined : this.filePath
      })
      if (integrity.missingFiles.length > 0) {
        throw new Error(
          `Missing required webcontent entry files after install: ${integrity.missingFiles.join(', ')}`
        )
      }

      // Phase 2: On forceUpdate, cleanly tear down running plugin, preserve data/ & logs/, and backup.
      if (existingPlugin) {
        pluginResolverLog.info('Updating existing plugin before reinstall', {
          meta: { pluginName }
        })
        try {
          const existingPluginInstance = pluginModule.pluginManager?.getPluginByName(manifest.name)
          if (existingPluginInstance) {
            wasEnabled =
              existingPluginInstance.status === PluginStatus.ENABLED ||
              existingPluginInstance.status === PluginStatus.ACTIVE

            // Disable and unload must complete before replacing any plugin files.
            if (
              existingPluginInstance.status !== PluginStatus.DISABLED &&
              existingPluginInstance.status !== PluginStatus.LOADED &&
              !(await existingPluginInstance.disable())
            ) {
              await fse.remove(stagingDir).catch(() => undefined)
              await this.cleanupStagingRootIfEmpty(stagingRoot)
              return cb(
                'Failed to remove old plugin: PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED',
                'error'
              )
            }

            if (!(await pluginModule.pluginManager!.unloadPlugin(manifest.name))) {
              await fse.remove(stagingDir).catch(() => undefined)
              await this.cleanupStagingRootIfEmpty(stagingRoot)
              return cb(
                'Failed to remove old plugin: PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED',
                'error'
              )
            }
            unloadedExisting = true
          }

          await this.restorePreservedRuntimeEntries(_target, stagingDir)
          await fse.move(_target, backupDir)
          movedToBackup = true
          pluginResolverLog.debug('Moved previous plugin files to backup before atomic swap', {
            meta: { pluginName, targetDir: _target, backupDir }
          })
        } catch (error: unknown) {
          const message = toErrorMessage(error)
          pluginResolverLog.error('Failed to prepare previous plugin backup before reinstall', {
            meta: { pluginName, targetDir: _target },
            error
          })
          await fse.remove(stagingDir).catch(() => undefined)
          await this.cleanupStagingRootIfEmpty(stagingRoot)
          return cb(`Failed to remove old plugin: ${message}`, 'error')
        }
      }

      // Phase 3: Atomic rename from staging -> target, then load (and re-enable if previously enabled).
      await fse.move(stagingDir, _target)
      swappedTarget = true

      await pluginModule.pluginManager!.loadPlugin(manifest.name)

      if (options?.forceUpdate && options?.autoReEnable && wasEnabled) {
        pluginResolverLog.info('Auto re-enabling plugin after update', {
          meta: { pluginName }
        })
        const newPluginInstance = pluginModule.pluginManager?.getPluginByName(manifest.name)
        if (newPluginInstance) {
          await newPluginInstance.enable()
        }
      }

      if (movedToBackup) {
        await fse.remove(backupDir).catch((cleanupError: unknown) => {
          pluginResolverLog.warn('Failed to remove plugin update backup directory', {
            meta: { pluginName, backupDir },
            error: cleanupError
          })
        })
      }
      await this.cleanupStagingRootIfEmpty(stagingRoot)

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

      if (movedToBackup) {
        try {
          if (swappedTarget || (await fse.pathExists(_target))) {
            await fse.remove(_target)
          }
          if (await fse.pathExists(backupDir)) {
            await fse.move(backupDir, _target, { overwrite: true })
          }
          if (unloadedExisting) {
            await pluginModule.pluginManager?.loadPlugin(manifest.name)
            if (wasEnabled) {
              const restoredInstance = pluginModule.pluginManager?.getPluginByName(manifest.name)
              if (restoredInstance) {
                await restoredInstance.enable()
              }
            }
          }
        } catch (rollbackError: unknown) {
          pluginResolverLog.error('Failed to rollback plugin backup after install error', {
            meta: { pluginName, targetDir: _target, backupDir },
            error: rollbackError
          })
        }
      } else if (swappedTarget) {
        try {
          await fse.remove(_target)
        } catch (cleanupError: unknown) {
          pluginResolverLog.warn('Failed to cleanup broken plugin directory after install error', {
            meta: { pluginName, targetDir: _target },
            error: cleanupError
          })
        }
      }

      await fse.remove(stagingDir).catch(() => undefined)
      await this.cleanupStagingRootIfEmpty(stagingRoot)
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
    const tempDir = path.join(
      os.tmpdir(),
      `talex-touch-resolve-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    )

    try {
      await fse.ensureDir(tempDir)
      await this.uncompress(this.filePath, tempDir, options?.installOptions)
      await this.sanitizeNodeModules(tempDir)

      const manifestPath = path.join(tempDir, 'manifest.json')
      if (!(await fse.pathExists(manifestPath))) {
        event.msg = ResolverStatus.MANIFEST_NOT_FOUND
        return callback({ event, type: 'error' })
      }

      const manifestContent = await fse.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent)

      const hasFileMap = manifest._files !== undefined && manifest._files !== null
      const hasSignature =
        typeof manifest._signature === 'string' && manifest._signature.trim().length > 0
      const allowUnstamped =
        options?.installOptions?.allowUnstampedNpm === true &&
        !hasFileMap &&
        (manifest._signature === undefined ||
          manifest._signature === null ||
          manifest._signature === '')

      if (!allowUnstamped && (!hasFileMap || !hasSignature)) {
        event.msg = ResolverStatus.INVALID_MANIFEST
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
