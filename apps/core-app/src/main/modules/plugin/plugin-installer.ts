import os from 'os'
import path from 'path'
import fse from 'fs-extra'
import { dialog, BrowserWindow } from 'electron'
import type { IManifest } from '@talex-touch/utils/plugin'
import {
  pluginProviderRegistry,
  type PluginInstallRequest,
  type PluginInstallSummary,
  PluginProviderType
} from '@talex-touch/utils/plugin/providers'
import { type RiskPromptHandler, type RiskPromptInput } from '@talex-touch/utils/plugin/risk'
import {
  FilePluginProvider,
  GithubPluginProvider,
  NpmPluginProvider,
  TpexPluginProvider
} from './providers'

const registeredProviders = new Set<PluginProviderType>()

function ensureProvidersRegistered(): void {
  const providers = [
    new GithubPluginProvider(),
    new NpmPluginProvider(),
    new TpexPluginProvider(),
    new FilePluginProvider()
  ]

  for (const provider of providers) {
    if (registeredProviders.has(provider.type)) continue
    pluginProviderRegistry.register(provider)
    registeredProviders.add(provider.type)
  }
}

function createDialogRiskPrompt(): RiskPromptHandler {
  return async (input: RiskPromptInput) => {
    if (input.level === 'trusted') return true

    // TODO(@talex-touch): 后续在此接入 TouchID 等更高级的验证手段
    const window = BrowserWindow.getFocusedWindow() ?? undefined
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      buttons: ['继续安装', '取消'],
      defaultId: 1,
      cancelId: 1,
      title: '插件安装风险确认',
      message: '检测到来自非官方来源的插件',
      detail:
        input.description ??
        `来源类型: ${input.sourceType}\n来源标识: ${input.sourceId}\n请确认你信任该来源后再继续安装。`,
      noLink: true
    })

    return response === 0
  }
}

function isRemoteSource(source: string): boolean {
  return /^https?:\/\//i.test(source)
}

async function runResolver(
  filePath: string,
  whole: boolean
): Promise<{ manifest?: IManifest } & { code: string }> {
  const { PluginResolver } = await import('./plugin-resolver')
  return new Promise((resolve, reject) => {
    const resolver = new PluginResolver(filePath)
    resolver
      .resolve(({ event, type }) => {
        if (type === 'error') {
          reject(new Error(event.msg))
          return
        }
        resolve({ code: 'success', manifest: event.msg })
      }, whole)
      .catch(reject)
  })
}

export class PluginInstaller {
  private readonly riskPrompt: RiskPromptHandler

  constructor(riskPrompt?: RiskPromptHandler) {
    ensureProvidersRegistered()
    this.riskPrompt = riskPrompt ?? createDialogRiskPrompt()
  }

  async install(request: PluginInstallRequest): Promise<PluginInstallSummary> {
    const providerResult = await pluginProviderRegistry.install(request, {
      riskPrompt: this.riskPrompt
    })

    if (!providerResult) {
      throw new Error('没有找到可处理该来源的插件提供器')
    }

    const manifest = providerResult.manifest
      ? providerResult.manifest
      : (await this.previewManifest(providerResult.filePath!))?.manifest

    await runResolver(providerResult.filePath!, true)

    await this.cleanupIfNeeded(request.source, providerResult.filePath)

    return { manifest, providerResult }
  }

  private async previewManifest(filePath: string): Promise<{ manifest?: IManifest }> {
    try {
      return await runResolver(filePath, false)
    } catch (error) {
      console.warn('[PluginInstaller] 预览插件清单失败:', error)
      return {}
    }
  }

  private async cleanupIfNeeded(source: string, filePath?: string): Promise<void> {
    if (!filePath) return
    const normalized = path.normalize(filePath)
    if (isRemoteSource(source) || normalized.startsWith(os.tmpdir())) {
      try {
        await fse.remove(normalized)
      } catch (error) {
        console.warn(`[PluginInstaller] 清理临时文件失败: ${normalized}`, error)
      }
    }
  }
}
