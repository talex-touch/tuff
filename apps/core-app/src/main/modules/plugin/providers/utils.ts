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
import type { IDownloadOptions } from '@talex-touch/utils/plugin/plugin-source'

export async function downloadToTempFile(
  url: string,
  fallbackExt = '.tar',
  options?: IDownloadOptions
): Promise<string> {
  const requestTimeout = options?.timeout ?? 30_000
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

  const response = await axios.get<NodeJS.ReadableStream>(url, {
    responseType: 'stream',
    timeout: requestTimeout,
    proxy: false
  })

  const totalLength = Number(response.headers['content-length'] ?? 0)
  let downloaded = 0

  const writer = fse.createWriteStream(filePath)

  const reportProgress = (value: number): void => {
    if (!options?.onProgress) return
    try {
      const normalized = Math.max(0, Math.min(100, value))
      options.onProgress(normalized)
    } catch (error) {
      console.warn('[PluginProvider] Failed to emit download progress:', error)
    }
  }

  if (totalLength > 0) {
    reportProgress(0)
  }

  await new Promise<void>((resolve, reject) => {
    response.data
      .on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        if (totalLength > 0) {
          const progress = (downloaded / totalLength) * 100
          reportProgress(progress)
        }
      })
      .on('end', () => {
        if (totalLength === 0) {
          reportProgress(100)
        }
      })
      .on('error', (error) => {
        reportProgress(0)
        reject(error)
      })
      .pipe(writer)

    writer.on('finish', resolve)
    writer.on('error', (error) => {
      reportProgress(0)
      reject(error)
    })
  })

  if (totalLength > 0) {
    reportProgress(100)
  }

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
