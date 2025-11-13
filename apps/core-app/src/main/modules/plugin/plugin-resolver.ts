import path from 'path'
import os from 'os'
import fse from 'fs-extra'
import compressing from 'compressing'
import { IManifest } from '@talex-touch/utils/plugin'
import { pluginModule } from './plugin-module'
import { checkDirWithCreate } from '../../utils/common-util'

export enum ResolverStatus {
  UNCOMPRESS_ERROR,
  MANIFEST_NOT_FOUND,
  INVALID_MANIFEST,
  SUCCESS
}

export interface ResolverInstallOptions {
  enforceProdMode?: boolean
}

export interface ResolverOptions {
  installOptions?: ResolverInstallOptions
}

export class PluginResolver {
  filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
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
      await fse.copy(source, target, { overwrite: true })
      return
    }

    await compressing.tar.uncompress(source, target)
  }

  async install(
    manifest: IManifest,
    cb: (msg: string, type?: string) => void,
    options?: ResolverInstallOptions
  ): Promise<void> {
    console.log('[PluginResolver] Installing plugin: ' + manifest.name)
    const _target = path.join(pluginModule.filePath!, manifest.name)

    if (fse.existsSync(_target)) {
      return cb('plugin already exists')
    }
    await checkDirWithCreate(_target, true)

    try {
      await this.uncompress(this.filePath, _target)
      await this.applyInstallOptions(manifest, _target, options)

      // const manifestPath = path.join(_target, 'key.talex')
      // if (fse.existsSync(manifestPath)) {
      //   await fse.rename(manifestPath, path.join(_target, 'manifest.json'))
      // }

      pluginModule.pluginManager!.loadPlugin(manifest.name)

      cb('success', 'success')
    } catch (e: any) {
      console.error(`[PluginResolver] Failed to install plugin ${manifest.name}:`, e)
      cb(e.message || 'Install failed', 'error')
    }
  }

  async resolve(
    callback: (result: { event: any; type: string }) => void,
    whole = false,
    options?: ResolverOptions
  ): Promise<void> {
    console.debug('[PluginResolver] Resolving plugin: ' + this.filePath)
    const event = { msg: '' } as any
    const tempDir = path.join(os.tmpdir(), `talex-touch-resolve-${Date.now()}`)

    try {
      await fse.ensureDir(tempDir)
      await this.uncompress(this.filePath, tempDir)

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

      if (whole) {
        await this.install(manifest, (msg, type = 'error') => {
          event.msg = msg
          callback({ event, type })
        }, options?.installOptions)
      } else {
        event.msg = manifest
        callback({ event, type: 'success' })
      }
    } catch (e: any) {
      console.error(`[PluginResolver] Failed to resolve plugin ${this.filePath}:`, e)
      event.msg = ResolverStatus.UNCOMPRESS_ERROR
      callback({ event, type: 'error' })
    } finally {
      await fse.remove(tempDir)
      console.log('[PluginResolver] Resolved plugin: ' + this.filePath + ' | Temp dir released!')
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

  private async disableDevMode(manifest: IManifest, targetDir: string): Promise<void> {
    const updateDevConfig = (container?: IManifest['dev']): IManifest['dev'] => {
      const updated = container ?? { enable: false, address: '' }
      updated.enable = false
      updated.address = ''
      ;(updated as any).source = false
      return updated
    }

    manifest.dev = updateDevConfig(manifest.dev)
    if (manifest.plugin?.dev) {
      manifest.plugin.dev = updateDevConfig(manifest.plugin.dev)
    }

    const manifestPath = path.join(targetDir, 'manifest.json')
    try {
      if (!(await fse.pathExists(manifestPath))) return
      const fileManifest = await fse.readJSON(manifestPath)
      fileManifest.dev = updateDevConfig(fileManifest.dev)
      if (fileManifest.plugin?.dev) {
        fileManifest.plugin.dev = updateDevConfig(fileManifest.plugin.dev)
      }
      await fse.writeFile(manifestPath, JSON.stringify(fileManifest, null, 2))
    } catch (error) {
      console.warn('[PluginResolver] Failed to enforce prod mode manifest:', error)
    }
  }
}
