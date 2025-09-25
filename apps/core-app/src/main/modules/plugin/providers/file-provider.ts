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

function resolveLocalPath(source: string): string {
  if (source.startsWith('file://')) {
    return url.fileURLToPath(source)
  }
  return path.resolve(source)
}

export class FilePluginProvider implements PluginProvider {
  readonly type = PluginProviderType.FILE

  canHandle(request: PluginInstallRequest): boolean {
    try {
      const filePath = resolveLocalPath(request.source)
      return fse.pathExistsSync(filePath)
    } catch (error) {
      return false
    }
  }

  async install(
    request: PluginInstallRequest,
    _context?: PluginProviderContext
  ): Promise<PluginInstallResult> {
    const filePath = resolveLocalPath(request.source)
    const exists = await fse.pathExists(filePath)
    if (!exists) {
      throw new Error('指定的插件文件不存在')
    }

    return {
      provider: this.type,
      official: false,
      filePath,
      metadata: {
        size: (await fse.stat(filePath)).size
      }
    }
  }
}
