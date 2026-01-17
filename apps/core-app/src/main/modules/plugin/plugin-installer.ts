import type { IManifest } from '@talex-touch/utils/plugin'
import type {
  PluginInstallRequest,
  PluginInstallResult,
  PluginInstallSummary
} from '@talex-touch/utils/plugin/providers'
import type { RiskPromptHandler, RiskPromptInput } from '@talex-touch/utils/plugin/risk'
import type { ResolverOptions } from './plugin-resolver'
import os from 'node:os'
import path from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import fse from 'fs-extra'
import { ensureDefaultProvidersRegistered, installFromRegistry } from './providers'

function createDialogRiskPrompt(): RiskPromptHandler {
  return async (input: RiskPromptInput) => {
    if (input.level === 'trusted') return true

    // TODO(@talex-touch): Integrate more advanced verification methods like TouchID here later
    const window = BrowserWindow.getFocusedWindow()
    const { response } = await dialog.showMessageBox(window as any, {
      type: 'warning',
      buttons: ['Continue Installation', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Plugin Installation Risk Confirmation',
      message: 'Detected plugin from unofficial source',
      detail:
        input.description ??
        `Source Type: ${input.sourceType}\nSource ID: ${input.sourceId}\nPlease confirm you trust this source before continuing.`,
      noLink: true
    })

    return response === 0
  }
}

function isRemoteSource(source: string): boolean {
  return /^https?:\/\//i.test(source)
}

/**
 * Resolves and validates plugin manifest.
 *
 * @remarks
 * Dynamic import prevents circular dependency with plugin-resolver module.
 */
async function runResolver(
  filePath: string,
  whole: boolean,
  options?: ResolverOptions
): Promise<{ manifest?: IManifest } & { code: string }> {
  const { PluginResolver } = await import('./plugin-resolver')
  return new Promise((resolve, reject) => {
    const resolver = new PluginResolver(filePath)
    resolver
      .resolve(
        ({ event, type }) => {
          if (type === 'error') {
            reject(new Error(event.msg))
            return
          }
          resolve({ code: 'success', manifest: event.msg })
        },
        whole,
        options
      )
      .catch(reject)
  })
}

export interface PreparedPluginInstall {
  request: PluginInstallRequest
  providerResult: PluginInstallResult
  manifest?: IManifest
}

export interface PluginInstallOptions {
  onDownloadProgress?: (progress: number) => void
  autoResolve?: boolean
  installOptions?: ResolverOptions['installOptions']
}

export class PluginInstaller {
  private readonly riskPrompt: RiskPromptHandler

  constructor(riskPrompt?: RiskPromptHandler) {
    ensureDefaultProvidersRegistered()
    this.riskPrompt = riskPrompt ?? createDialogRiskPrompt()
  }

  async install(
    request: PluginInstallRequest,
    options?: PluginInstallOptions
  ): Promise<PluginInstallSummary> {
    const prepared = await this.prepareInstall(request, options)

    if (options?.autoResolve === false) {
      return { manifest: prepared.manifest, providerResult: prepared.providerResult }
    }

    return this.finalizeInstall(prepared, {
      installOptions: options?.installOptions
    })
  }

  async prepareInstall(
    request: PluginInstallRequest,
    options?: PluginInstallOptions
  ): Promise<PreparedPluginInstall> {
    const providerResult = await installFromRegistry(request, {
      riskPrompt: this.riskPrompt,
      downloadOptions: options?.onDownloadProgress
        ? {
            onProgress: (value: number) => {
              try {
                options.onDownloadProgress?.(Math.max(0, Math.min(100, value)))
              } catch (error) {
                console.warn('[PluginInstaller] download progress handler failed', error)
              }
            }
          }
        : undefined
    })

    if (!providerResult) {
      throw new Error('No provider found to handle this source')
    }

    const manifest = providerResult.manifest
      ? providerResult.manifest
      : (await this.previewManifest(providerResult.filePath!))?.manifest

    if (options?.onDownloadProgress) {
      try {
        options.onDownloadProgress(100)
      } catch (error) {
        console.warn('[PluginInstaller] failed to finalize progress update', error)
      }
    }

    return {
      request,
      providerResult,
      manifest
    }
  }

  async finalizeInstall(
    prepared: PreparedPluginInstall,
    options?: { installOptions?: ResolverOptions['installOptions'] }
  ): Promise<PluginInstallSummary> {
    await runResolver(prepared.providerResult.filePath!, true, {
      installOptions: options?.installOptions
    })

    await this.cleanupIfNeeded(prepared.request.source, prepared.providerResult.filePath)

    return {
      manifest: prepared.manifest,
      providerResult: prepared.providerResult
    }
  }

  async discardPrepared(prepared: PreparedPluginInstall): Promise<void> {
    await this.cleanupIfNeeded(prepared.request.source, prepared.providerResult.filePath)
  }

  private async previewManifest(filePath: string): Promise<{ manifest?: IManifest }> {
    try {
      return await runResolver(filePath, false)
    } catch (error) {
      console.warn('[PluginInstaller] Failed to preview plugin manifest:', error)
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
        console.warn(`[PluginInstaller] Failed to cleanup temp file: ${normalized}`, error)
      }
    }
  }
}
