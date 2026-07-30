import type { TempFileService } from '../../service/temp-file.service'
import { createHash } from 'node:crypto'

const PLUGIN_TEMP_NAMESPACE_PREFIX = 'plugins/runtime'

function normalizePluginTempNamespaceSegment(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return normalized || 'unknown'
}

export function resolvePluginTempNamespace(pluginName: string): string {
  const owner = normalizePluginTempNamespaceSegment(pluginName)
  const digest = createHash('sha256').update(pluginName).digest('hex').slice(0, 8)
  return `${PLUGIN_TEMP_NAMESPACE_PREFIX}/${owner}-${digest}`
}

function ensurePluginTempNamespace(tempFileService: TempFileService, pluginName: string): string {
  const namespace = resolvePluginTempNamespace(pluginName)
  if (!tempFileService.getNamespaceConfig(namespace)) {
    tempFileService.registerNamespace({
      namespace,
      retentionMs: null,
      automaticCleanup: false
    })
  }
  return namespace
}

export async function purgePluginTempNamespace(
  tempFileService: TempFileService,
  pluginName: string
): Promise<void> {
  const namespace = ensurePluginTempNamespace(tempFileService, pluginName)
  for (let batch = 0; batch < 64; batch += 1) {
    const cleanup = await tempFileService.cleanupNamespace(namespace, {
      cutoffMs: Number.MAX_SAFE_INTEGER,
      maxRows: 10_000
    })
    if (cleanup.cancelled || cleanup.failedItemCount > 0) {
      throw new Error('PLUGIN_TEMP_DELETE_FAILED')
    }
    const inspection = await tempFileService.inspectNamespace(namespace, { maxRows: 1 })
    if (inspection.itemCount === 0 && inspection.failedItemCount === 0 && !inspection.bounded) {
      return
    }
    if (cleanup.deletedItemCount === 0) break
  }
  throw new Error('PLUGIN_TEMP_DELETE_FAILED')
}

export async function hasPluginTempNamespaceResidual(
  tempFileService: TempFileService,
  pluginName: string
): Promise<boolean> {
  const namespace = ensurePluginTempNamespace(tempFileService, pluginName)
  const inspection = await tempFileService.inspectNamespace(namespace, { maxRows: 1 })
  return inspection.itemCount > 0 || inspection.failedItemCount > 0 || inspection.bounded
}
