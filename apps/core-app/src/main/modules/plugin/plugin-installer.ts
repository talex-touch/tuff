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
import { BrowserWindow, dialog, type MessageBoxOptions } from 'electron'
import fse from 'fs-extra'
import { t } from '../../utils/i18n-helper'
import { createLogger } from '../../utils/logger'
import { ensureDefaultProvidersRegistered, installFromRegistry } from './providers'
import { getPluginSdkHardCutGate, SDKAPI_BLOCKED_CODE } from './sdkapi-hard-cut-gate'

const pluginInstallerLog = createLogger('PluginSystem').child('Installer')

function createDialogRiskPrompt(): RiskPromptHandler {
  return async (input: RiskPromptInput) => {
    if (input.level === 'trusted') return true

    const window = BrowserWindow.getFocusedWindow()
    const dialogOptions: MessageBoxOptions = {
      type: 'warning',
      buttons: [t('nativeDialogs.pluginInstallRisk.continue'), t('common.cancel')],
      defaultId: 1,
      cancelId: 1,
      title: t('nativeDialogs.pluginInstallRisk.title'),
      message: t('nativeDialogs.pluginInstallRisk.message'),
      detail:
        input.description ??
        t('nativeDialogs.pluginInstallRisk.detail', {
          sourceType: input.sourceType,
          sourceId: input.sourceId
        }),
      noLink: true
    }
    const { response } = window
      ? await dialog.showMessageBox(window, dialogOptions)
      : await dialog.showMessageBox(dialogOptions)

    return response === 0
  }
}

function isRemoteSource(source: string): boolean {
  return /^https?:\/\//i.test(source)
}

/** The install failure code for each `ResolverStatus` a package read can fail with, by name. */
const RESOLVER_FAILURE_CODES: Record<string, string> = {
  UNCOMPRESS_ERROR: 'PLUGIN_PACKAGE_UNREADABLE',
  MANIFEST_NOT_FOUND: 'PLUGIN_MANIFEST_NOT_FOUND',
  INVALID_MANIFEST: 'PLUGIN_MANIFEST_INVALID'
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
  const { PluginResolver, ResolverStatus } = await import('./plugin-resolver')
  return new Promise((resolve, reject) => {
    const resolver = new PluginResolver(filePath)
    resolver
      .resolve(
        ({ event, type }) => {
          if (type === 'error') {
            // A failed read reports a `ResolverStatus` number, which says nothing to whoever reads
            // the failure; an install step reports its own message, which is passed on as it is.
            const status = typeof event.msg === 'number' ? ResolverStatus[event.msg] : undefined
            const message = status ? RESOLVER_FAILURE_CODES[status] : undefined
            reject(new Error(message ?? String(event.msg)))
            return
          }
          if (event.msg && typeof event.msg === 'object') {
            resolve({ code: 'success', manifest: event.msg as IManifest })
            return
          }
          if (type === 'success') {
            resolve({ code: typeof event.msg === 'string' ? event.msg : 'success' })
            return
          }
          reject(new Error('PLUGIN_MANIFEST_INVALID'))
        },
        whole,
        options
      )
      .catch(reject)
  })
}

function assertManifestSdkCompatibility(manifest?: IManifest): void {
  if (!manifest) return

  const pluginName =
    typeof manifest.name === 'string' && manifest.name.trim().length > 0
      ? manifest.name.trim()
      : 'unknown'
  const gate = getPluginSdkHardCutGate(pluginName, manifest.sdkapi)
  if (!gate.blocked) return

  const error = new Error(
    gate.message || `Plugin "${pluginName}" is blocked by the sdkapi hard-cut gate.`
  ) as Error & { code?: string }
  error.name = SDKAPI_BLOCKED_CODE
  error.code = SDKAPI_BLOCKED_CODE
  throw error
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
                pluginInstallerLog.warn('Plugin download progress callback failed', {
                  meta: { source: request.source },
                  error
                })
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
    assertManifestSdkCompatibility(manifest)

    if (options?.onDownloadProgress) {
      try {
        options.onDownloadProgress(100)
      } catch (error) {
        pluginInstallerLog.warn('Failed to finalize plugin install progress update', {
          meta: { source: request.source },
          error
        })
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
      pluginInstallerLog.warn('Failed to preview plugin manifest', {
        meta: { filePath },
        error
      })
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
        pluginInstallerLog.warn('Failed to cleanup temporary plugin install file', {
          meta: { source, filePath: normalized },
          error
        })
      }
    }
  }
}
