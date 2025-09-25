import axios from 'axios'
import {
  PluginProviderType,
  type PluginInstallRequest,
  type PluginInstallResult,
  type PluginProvider,
  type PluginProviderContext
} from '@talex-touch/utils/plugin/providers'
import { ensureRiskAccepted, downloadToTempFile } from './utils'

interface ParsedNpmSource {
  name: string
  version?: string
}

const OFFICIAL_NPM_PREFIX = '@talex-touch/'

function parseNpmSource(source: string): ParsedNpmSource | undefined {
  let trimmed = source.trim()
  if (!trimmed) return undefined

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
  } else {
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

  canHandle(request: PluginInstallRequest): boolean {
    return Boolean(parseNpmSource(request.source))
  }

  async install(
    request: PluginInstallRequest,
    context?: PluginProviderContext
  ): Promise<PluginInstallResult> {
    const parsed = parseNpmSource(request.source)
    if (!parsed) {
      throw new Error('无法解析的 NPM 插件来源')
    }

    const official = parsed.name.startsWith(OFFICIAL_NPM_PREFIX)
    if (!official) {
      await ensureRiskAccepted(
        this.type,
        request,
        context,
        'needs_confirmation',
        '即将下载来自第三方 NPM 包的插件，存在潜在风险。',
        { package: parsed.name }
      )
    }

    const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(parsed.name)}`
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

    const filePath = await downloadToTempFile(tarballUrl, '.tgz')

    return {
      provider: this.type,
      official,
      filePath,
      metadata: {
        package: parsed.name,
        version,
        tarballUrl
      }
    }
  }
}
