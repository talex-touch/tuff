import type { PluginInstallRequest, PluginInstallResult, PluginProvider, PluginProviderContext } from '@talex-touch/utils/plugin/providers'
import {

  PluginProviderType,
} from '@talex-touch/utils/plugin/providers'
import axios from 'axios'
import { createProviderLogger } from './logger'
import { downloadToTempFile, ensureRiskAccepted } from './utils'

interface ParsedNpmSource {
  name: string
  version?: string
}

const OFFICIAL_NPM_PREFIX = '@talex-touch/'

function parseNpmSource(source: string): ParsedNpmSource | undefined {
  let trimmed = source.trim()
  if (!trimmed)
    return undefined

  if (trimmed.startsWith('npm:')) {
    trimmed = trimmed.slice(4)
  }

  let name = trimmed
  let version: string | undefined

  if (trimmed.startsWith('@')) {
    const atIndex = trimmed.lastIndexOf('@')
    if (atIndex > 0) {
      name = trimmed.slice(0, atIndex)
      version = trimmed.slice(atIndex + 1) || undefined
    }
  }
  else {
    const atIndex = trimmed.indexOf('@')
    if (atIndex > 0) {
      name = trimmed.slice(0, atIndex)
      version = trimmed.slice(atIndex + 1) || undefined
    }
  }

  return { name, version }
}

export class NpmPluginProvider implements PluginProvider {
  readonly type = PluginProviderType.NPM
  private readonly log = createProviderLogger(this.type)

  canHandle(request: PluginInstallRequest): boolean {
    const source = request.source.trim()
    
    // Skip URLs (http://, https://, file://)
    if (/^[a-z]+:\/\//i.test(source)) {
      return false
    }
    
    // Skip file extensions that other providers handle (.tpex, .tar, .tgz, .zip)
    if (/\.(tpex|tar|tgz|zip)$/i.test(source)) {
      return false
    }
    
    // Skip absolute file paths
    if (source.startsWith('/') || /^[a-z]:\\/i.test(source)) {
      return false
    }
    
    return Boolean(parseNpmSource(source))
  }

  async install(
    request: PluginInstallRequest,
    context?: PluginProviderContext,
  ): Promise<PluginInstallResult> {
    this.log.info('准备从 NPM 安装插件', {
      meta: { source: request.source },
    })

    try {
      const parsed = parseNpmSource(request.source)
      if (!parsed) {
        this.log.error('NPM 来源解析失败', {
          meta: { source: request.source },
        })
        throw new Error('无法解析的 NPM 插件来源')
      }

      const official = parsed.name.startsWith(OFFICIAL_NPM_PREFIX)
      if (!official) {
        this.log.warn('检测到第三方 NPM 包，执行风险确认', {
          meta: { package: parsed.name },
        })
        await ensureRiskAccepted(
          this.type,
          request,
          context,
          'needs_confirmation',
          '即将下载来自第三方 NPM 包的插件，存在潜在风险。',
          { package: parsed.name },
        )
      }

      const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(parsed.name)}`
      this.log.debug('请求 NPM 元数据', {
        meta: { url: metadataUrl },
      })
      const response = await axios.get(metadataUrl, { timeout: 30_000, proxy: false })
      const body = response.data

      const version = parsed.version || body['dist-tags']?.latest
      if (!version) {
        throw new Error('无法确定插件的版本信息')
      }

      const versionMeta = body.versions?.[version]
      if (!versionMeta) {
        throw new Error(`NPM 包 ${parsed.name} 未找到版本 ${version}`)
      }

      const tarballUrl: string | undefined = versionMeta.dist?.tarball
      if (!tarballUrl) {
        throw new Error('NPM 包缺少可下载的 tarball 地址')
      }

      this.log.debug('即将下载 NPM tarball', {
        meta: { tarballUrl },
      })
      const filePath = await downloadToTempFile(tarballUrl, '.tgz', context?.downloadOptions)

      this.log.success('NPM 插件下载完成', {
        meta: { filePath, package: parsed.name, version },
      })

      return {
        provider: this.type,
        official,
        filePath,
        metadata: {
          package: parsed.name,
          version,
          tarballUrl,
        },
      }
    }
    catch (error) {
      this.log.error('NPM 插件安装流程失败', {
        meta: { source: request.source },
        error,
      })
      throw error
    }
  }
}
