import type { IDownloadOptions } from '@talex-touch/utils/plugin/plugin-source'
import type {
  PluginInstallRequest,
  PluginProviderContext,
  PluginProviderType
} from '@talex-touch/utils/plugin/providers'
import type { RiskLevel } from '@talex-touch/utils/plugin/risk'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { finished, pipeline } from 'node:stream/promises'
import fse from 'fs-extra'
import { NetworkTimeoutError, isTimeoutLikeError } from '@talex-touch/utils/network'
import { getNetworkService } from '../../network'
import { createProviderLogger } from './logger'

const pluginProviderUtilsLog = createProviderLogger('utils')
const DOWNLOAD_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const DOWNLOAD_VALIDATE_STATUSES = [
  ...Array.from({ length: 100 }, (_, index) => index + 200),
  ...DOWNLOAD_REDIRECT_STATUSES
]
const MAX_DOWNLOAD_REDIRECTS = 5

interface DownloadToTempFileOptions extends IDownloadOptions {
  resolveHeadersForUrl?: (
    url: URL,
    headers: Readonly<Record<string, string>>
  ) => Promise<Record<string, string>> | Record<string, string>
}

function normalizeDownloadError(error: unknown, timeoutMs: number): unknown {
  if (isTimeoutLikeError(error)) {
    return new NetworkTimeoutError(timeoutMs)
  }
  return error
}

export function mergeHeadersCaseInsensitive(
  ...sources: Array<Readonly<Record<string, string>> | undefined>
): Record<string, string> {
  const merged: Record<string, string> = {}
  const keys = new Map<string, string>()

  for (const source of sources) {
    for (const [key, value] of Object.entries(source ?? {})) {
      const normalizedKey = key.toLowerCase()
      const previousKey = keys.get(normalizedKey)
      if (previousKey) delete merged[previousKey]
      keys.set(normalizedKey, key)
      merged[key] = value
    }
  }

  return merged
}

function getHeader(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const normalizedName = name.toLowerCase()
  return Object.entries(headers).find(([key]) => key.toLowerCase() === normalizedName)?.[1]
}

export function stripAuthorizationHeader(
  headers: Readonly<Record<string, string>>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => key.toLowerCase() !== 'authorization')
  )
}

function resolveDownloadUrl(value: string, baseUrl?: URL): URL {
  let resolved: URL
  try {
    resolved = baseUrl ? new URL(value, baseUrl) : new URL(value)
  } catch {
    throw new Error('PLUGIN_DOWNLOAD_INVALID_URL')
  }

  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    throw new Error('PLUGIN_DOWNLOAD_UNSUPPORTED_PROTOCOL')
  }
  return resolved
}

async function requestDownloadStream(
  url: string,
  requestTimeout: number,
  options?: DownloadToTempFileOptions
) {
  const networkService = getNetworkService()
  if (!options?.resolveHeadersForUrl) {
    return await networkService.requestStream({
      method: 'GET',
      url,
      timeoutMs: requestTimeout,
      headers: options?.headers,
      responseType: 'stream'
    })
  }

  let currentUrl = resolveDownloadUrl(url)
  let currentHeaders = mergeHeadersCaseInsensitive(options.headers)
  let redirectCount = 0

  while (true) {
    currentHeaders = mergeHeadersCaseInsensitive(
      await options.resolveHeadersForUrl(currentUrl, { ...currentHeaders })
    )

    const response = await networkService.requestStreamManualRedirect({
      method: 'GET',
      url: currentUrl.toString(),
      timeoutMs: requestTimeout,
      headers: currentHeaders,
      responseType: 'stream',
      validateStatus: DOWNLOAD_VALIDATE_STATUSES
    })

    if (response.status < 300 || response.status >= 400) return response

    response.stream.destroy()
    await finished(response.stream).catch(() => undefined)
    if (!DOWNLOAD_REDIRECT_STATUSES.has(response.status)) {
      throw new Error('PLUGIN_DOWNLOAD_REDIRECT_STATUS_UNSUPPORTED')
    }
    if (redirectCount >= MAX_DOWNLOAD_REDIRECTS) {
      throw new Error('PLUGIN_DOWNLOAD_REDIRECT_LIMIT_EXCEEDED')
    }

    const location = getHeader(response.headers, 'location')
    if (!location) {
      throw new Error('PLUGIN_DOWNLOAD_REDIRECT_LOCATION_MISSING')
    }

    const nextUrl = resolveDownloadUrl(location, currentUrl)
    if (nextUrl.origin !== currentUrl.origin) {
      currentHeaders = stripAuthorizationHeader(currentHeaders)
    }
    currentUrl = nextUrl
    redirectCount += 1
  }
}

export async function downloadToTempFile(
  url: string,
  fallbackExt = '.tar',
  options?: DownloadToTempFileOptions
): Promise<string> {
  const requestTimeout = options?.timeout ?? 30_000
  const resolvedExt = (() => {
    try {
      const parsed = new URL(url)
      const ext = path.extname(parsed.pathname)
      return ext || fallbackExt
    } catch {
      return fallbackExt
    }
  })()

  const fileName = `talex-plugin-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${resolvedExt}`
  const filePath = path.join(os.tmpdir(), fileName)

  const response = await requestDownloadStream(url, requestTimeout, options).catch((error) => {
    throw normalizeDownloadError(error, requestTimeout)
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
      pluginProviderUtilsLog.warn('Failed to emit download progress', { error })
    }
  }

  if (totalLength > 0) {
    reportProgress(0)
  }

  const onData = (chunk: Buffer): void => {
    downloaded += chunk.length
    if (totalLength > 0) {
      const progress = (downloaded / totalLength) * 100
      reportProgress(progress)
    }
  }
  const onEnd = (): void => {
    if (totalLength === 0) reportProgress(100)
  }

  response.stream.on('data', onData)
  response.stream.on('end', onEnd)
  try {
    await pipeline(response.stream, writer)
  } catch (error) {
    reportProgress(0)
    await fse.remove(filePath).catch(() => undefined)
    throw normalizeDownloadError(error, requestTimeout)
  } finally {
    response.stream.off('data', onData)
    response.stream.off('end', onEnd)
  }

  // Verify file was written and has content
  const stat = await fse.stat(filePath).catch(() => null)
  if (!stat || stat.size === 0) {
    await fse.remove(filePath).catch(() => {})
    throw new Error('Downloaded file is empty or was not created')
  }

  // Verify file size matches expected if Content-Length was provided
  if (totalLength > 0 && stat.size !== totalLength) {
    pluginProviderUtilsLog.warn('Downloaded file size mismatch', {
      meta: { expectedSize: totalLength, actualSize: stat.size }
    })
    // Don't throw, just warn - some servers may not report accurate Content-Length
  }

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
