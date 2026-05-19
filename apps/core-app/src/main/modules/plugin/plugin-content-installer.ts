import type { PluginContentPackage } from '@talex-touch/utils/types/cloud-share'
import type { TouchPlugin } from './plugin'
import {
  importSnippetPack,
  SNIPPET_PACK_FORMAT,
  SNIPPET_PACK_KIND,
  TOUCH_SNIPPETS_PLUGIN_ID
} from '@talex-touch/utils/cloud-share/snippet-pack'

const SNIPPETS_FILE = 'snippets.json'

export interface PluginContentInstallInput {
  packageId: string
  targetPluginName: string
  contentPackage: PluginContentPackage
}

export interface PluginContentInstallResult {
  success: boolean
  importedCount?: number
  skippedCount?: number
  error?: string
}

export interface PluginContentInstallRuntime {
  getPluginByName: (name: string) => TouchPlugin | undefined
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function validateTouchSnippetsPackage(input: PluginContentInstallInput): string | null {
  const contentPackage = input.contentPackage
  if (!normalizeText(input.packageId)) return 'PACKAGE_ID_REQUIRED'
  if (contentPackage.id !== input.packageId) return 'PACKAGE_ID_MISMATCH'
  if (input.targetPluginName !== TOUCH_SNIPPETS_PLUGIN_ID) return 'UNSUPPORTED_TARGET_PLUGIN'
  if (contentPackage.pluginId !== TOUCH_SNIPPETS_PLUGIN_ID) return 'UNSUPPORTED_CONTENT_PLUGIN'
  if (contentPackage.kind !== SNIPPET_PACK_KIND) return 'UNSUPPORTED_CONTENT_KIND'
  if (contentPackage.manifest?.importTarget !== TOUCH_SNIPPETS_PLUGIN_ID)
    return 'UNSUPPORTED_IMPORT_TARGET'
  if (contentPackage.manifest?.format !== SNIPPET_PACK_FORMAT) return 'UNSUPPORTED_CONTENT_FORMAT'
  if (typeof contentPackage.contentInline === 'undefined') return 'CONTENT_INLINE_REQUIRED'
  return null
}

export function installPluginContentPackageToLocalPlugin(
  runtime: PluginContentInstallRuntime,
  input: PluginContentInstallInput
): PluginContentInstallResult {
  try {
    const validationError = validateTouchSnippetsPackage(input)
    if (validationError) return { success: false, error: validationError }

    const plugin = runtime.getPluginByName(input.targetPluginName)
    if (!plugin) return { success: false, error: 'TARGET_PLUGIN_NOT_INSTALLED' }

    const current = plugin.getPluginFile(SNIPPETS_FILE) as { snippets?: unknown[] } | null
    const imported = importSnippetPack(
      Array.isArray(current?.snippets) ? current.snippets : [],
      input.contentPackage.contentInline
    )
    const saved = plugin.savePluginFile(SNIPPETS_FILE, {
      version: imported.version,
      snippets: imported.snippets
    })
    if (!saved.success)
      return { success: false, error: saved.error || 'PLUGIN_STORAGE_WRITE_FAILED' }

    return {
      success: true,
      importedCount: imported.importedCount,
      skippedCount: imported.pack.skippedSensitiveCount
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'PLUGIN_CONTENT_INSTALL_FAILED'
    }
  }
}
