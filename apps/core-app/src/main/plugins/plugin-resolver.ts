import path from 'path'
import os from 'os'
import fse from 'fs-extra'
import compressing from 'compressing'
import { genPluginManager } from '.'
import { checkDirWithCreate } from '../utils/common-util'
import { IManifest } from '@talex-touch/utils/plugin'

export enum ResolverStatus {
  UNCOMPRESS_ERROR,
  MANIFEST_NOT_FOUND,
  INVALID_MANIFEST,
  SUCCESS
}

export class PluginResolver {
  filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async install(manifest: IManifest, cb: (msg: string, type?: string) => void): Promise<void> {
    console.log('[PluginResolver] Installing plugin: ' + manifest.name)
    const _target = path.join(genPluginManager().pluginPath, manifest.name)

    if (fse.existsSync(_target)) {
      return cb('plugin already exists')
    }
    await checkDirWithCreate(_target, true)

    try {
      await compressing.tar.uncompress(this.filePath, _target)

      // const manifestPath = path.join(_target, 'key.talex')
      // if (fse.existsSync(manifestPath)) {
      //   await fse.rename(manifestPath, path.join(_target, 'manifest.json'))
      // }

      genPluginManager().loadPlugin(manifest.name)

      cb('success', 'success')
    } catch (e: any) {
      console.error(`[PluginResolver] Failed to install plugin ${manifest.name}:`, e)
      cb(e.message || 'Install failed', 'error')
    }
  }

  async resolve(
    callback: (result: { event: any; type: string }) => void,
    whole = false
  ): Promise<void> {
    console.debug('[PluginResolver] Resolving plugin: ' + this.filePath)
    const event = { msg: '' } as any
    const tempDir = path.join(os.tmpdir(), `talex-touch-resolve-${Date.now()}`)

    try {
      await fse.ensureDir(tempDir)
      await compressing.tar.uncompress(this.filePath, tempDir)

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
        })
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
}
