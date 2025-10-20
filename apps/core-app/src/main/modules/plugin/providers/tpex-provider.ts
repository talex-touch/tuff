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
import { createProviderLogger } from './logger'

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
  private readonly log = createProviderLogger(this.type)

  canHandle(request: PluginInstallRequest): boolean {
    return request.source.trim().toLowerCase().endsWith('.tpex')
  }

  async install(
    request: PluginInstallRequest,
    context?: PluginProviderContext
  ): Promise<PluginInstallResult> {
    this.log.info('准备处理 TPEX 插件资源', {
      meta: { source: request.source }
    })

    try {
      let filePath = request.source

      if (isRemote(request.source)) {
        this.log.debug('检测到远程 TPEX 资源，开始下载', {
          meta: { url: request.source }
        })
        filePath = await downloadToTempFile(request.source, '.tpex', context?.downloadOptions)
      } else {
        filePath = path.resolve(request.source)
        const exists = await fse.pathExists(filePath)
        if (!exists) {
          this.log.error('本地 TPEX 文件不存在', {
            meta: { filePath }
          })
          throw new Error('指定的 TPEX 文件不存在')
        }
      }

      const manifest = await peekTpexManifest(filePath)
      if (!manifest) {
        this.log.warn('无法从 TPEX 包中解析 manifest', {
          meta: { filePath }
        })
      } else {
        this.log.debug('成功解析 TPEX manifest', {
          meta: {
            name: manifest.name ?? 'unknown',
            version: manifest.version ?? 'unknown'
          }
        })
      }

      const official = typeof manifest?.author === 'string' && /talex-touch/i.test(manifest.author)

      this.log.success('TPEX 插件准备完成', {
        meta: {
          filePath,
          official: official ? 'true' : 'false'
        }
      })

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
    } catch (error) {
      this.log.error('TPEX 插件处理失败', {
        meta: { source: request.source },
        error
      })
      throw error
    }
  }
}
