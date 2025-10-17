import fse from 'fs-extra'
import path from 'path'
import url from 'url'
import {
  PluginProviderType,
  type PluginInstallRequest,
  type PluginInstallResult,
  type PluginProvider,
  type PluginProviderContext
} from '@talex-touch/utils/plugin/providers'
import { createProviderLogger } from './logger'

function resolveLocalPath(source: string): string {
  if (source.startsWith('file://')) {
    return url.fileURLToPath(source)
  }
  return path.resolve(source)
}

export class FilePluginProvider implements PluginProvider {
  readonly type = PluginProviderType.FILE
  private readonly log = createProviderLogger(this.type)

  canHandle(request: PluginInstallRequest): boolean {
    try {
      const filePath = resolveLocalPath(request.source)
      return fse.pathExistsSync(filePath)
    } catch (error) {
      this.log.error('本地插件文件解析失败', {
        meta: { source: request.source },
        error
      })
      return false
    }
  }

  async install(
    request: PluginInstallRequest,
    context?: PluginProviderContext
  ): Promise<PluginInstallResult> {
    const filePath = resolveLocalPath(request.source)
    this.log.info('尝试通过本地文件安装插件', {
      meta: { source: request.source, filePath, tempDir: context?.tempDir }
    })

    try {
      const exists = await fse.pathExists(filePath)
      if (!exists) {
        this.log.error('本地插件文件不存在', {
          meta: { filePath }
        })
        throw new Error('指定的插件文件不存在')
      }

      const stats = await fse.stat(filePath)

      this.log.success('本地插件文件验证成功', {
        meta: { filePath, size: String(stats.size) }
      })

      return {
        provider: this.type,
        official: false,
        filePath,
        metadata: {
          size: stats.size
        }
      }
    } catch (error) {
      this.log.error('本地插件安装失败', {
        meta: { filePath },
        error
      })
      throw error
    }
  }
}
