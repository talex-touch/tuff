import compressing from 'compressing'
import fse from 'fs-extra'
import os from 'os'
import path from 'path'
import {
  PluginProviderType,
  type PluginInstallRequest,
  type PluginInstallResult,
  type PluginProvider,
  type PluginProviderContext
} from '@talex-touch/utils/plugin/providers'
import type { IManifest } from '@talex-touch/utils/plugin'
import { downloadToTempFile } from './utils'

async function peekTpexManifest(tpexPath: string): Promise<IManifest | undefined> {
  const tempDir = path.join(os.tmpdir(), `talex-tpex-preview-${Date.now()}`)
  try {
    await fse.ensureDir(tempDir)
    await compressing.tar.uncompress(tpexPath, tempDir)
    const manifestPath = path.join(tempDir, 'manifest.json')
    if (!(await fse.pathExists(manifestPath))) return undefined
    const manifestContent = await fse.readJSON(manifestPath)
    return manifestContent as IManifest
  } catch (error) {
    console.warn('[TpexProvider] Failed to peek manifest:', error)
    return undefined
  } finally {
    await fse.rm(tempDir, { recursive: true, force: true })
  }
}

function isRemote(source: string): boolean {
  return /^https?:\/\//i.test(source)
}

export class TpexPluginProvider implements PluginProvider {
  readonly type = PluginProviderType.TPEX

  canHandle(request: PluginInstallRequest): boolean {
    return request.source.trim().toLowerCase().endsWith('.tpex')
  }

  async install(
    request: PluginInstallRequest,
    _context?: PluginProviderContext
  ): Promise<PluginInstallResult> {
    let filePath = request.source

    if (isRemote(request.source)) {
      filePath = await downloadToTempFile(request.source, '.tpex', context?.downloadOptions)
    } else {
      filePath = path.resolve(request.source)
      const exists = await fse.pathExists(filePath)
      if (!exists) {
        throw new Error('指定的 TPEX 文件不存在')
      }
    }

    const manifest = await peekTpexManifest(filePath)
    const official = typeof manifest?.author === 'string' && /talex-touch/i.test(manifest.author)

    return {
      provider: this.type,
      official,
      filePath,
      manifest,
      metadata: {
        icon: manifest?.icon,
        name: manifest?.name,
        version: manifest?.version
      }
    }
  }
}
