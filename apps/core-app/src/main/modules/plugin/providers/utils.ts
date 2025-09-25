import axios from 'axios'
import crypto from 'crypto'
import fse from 'fs-extra'
import os from 'os'
import path from 'path'
import type {
  PluginInstallRequest,
  PluginProviderContext,
  PluginProviderType
} from '@talex-touch/utils/plugin/providers'
import type { RiskLevel } from '@talex-touch/utils/plugin/risk'

export async function downloadToTempFile(url: string, fallbackExt = '.tar'): Promise<string> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
    proxy: false
  })

  const resolvedExt = (() => {
    try {
      const parsed = new URL(url)
      const ext = path.extname(parsed.pathname)
      return ext || fallbackExt
    } catch (error) {
      return fallbackExt
    }
  })()

  const fileName = `talex-plugin-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${resolvedExt}`
  const filePath = path.join(os.tmpdir(), fileName)

  await fse.outputFile(filePath, Buffer.from(response.data))
  return filePath
}

export async function ensureRiskAccepted(
  provider: PluginProviderType,
  request: PluginInstallRequest,
  context?: PluginProviderContext,
  level: RiskLevel = 'needs_confirmation',
  description?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const handler = context?.riskPrompt
  if (!handler || level === 'trusted') return

  const accepted = await handler({
    sourceType: provider,
    sourceId: request.source,
    level,
    description,
    metadata
  })

  if (!accepted) {
    const error = new Error('风险确认被用户拒绝')
    error.name = 'PluginRiskRejectedError'
    throw error
  }
}
