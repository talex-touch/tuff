import type { RetrierOptions } from '@talex-touch/utils'
import {
  createRetrier,
  DownloadModule,
  DownloadPriority,
  DownloadStatus,
  isLocalhostUrl
} from '@talex-touch/utils'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useDownloadSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { buildTfileUrl } from '~/utils/tfile-url'

const svgFileCache = new Map<string, string>()
const svgContentCache = new Map<string, string>()
const svgInflight = new Map<string, Promise<{ fileUrl: string; content: string }>>()
const REMOTE_SVG_CACHE_SUBDIR = 'temp/icons/svg-cache'
const REMOTE_SVG_CACHE_PREFIX = 'tufficon'
const REMOTE_SVG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const pendingTasks = new Map<
  string,
  { resolve: () => void; reject: (error: Error) => void; timeoutId: number; promise: Promise<void> }
>()
let downloadListenerRegistered = false
const downloadDisposers: Array<() => void> = []

type TempFileCreateRequest = {
  namespace: string
  ext: string
  prefix: string
  retentionMs?: number
}

type TempFileCreateResponse = {
  url: string
}

export function useSvgContent(
  tempUrl: string = '',
  autoFetch = true,
  retrierOptions?: RetrierOptions
) {
  const url = ref(tempUrl ?? '')
  const content = ref<string | null>(null)
  const resolvedUrl = ref<string>('')
  const loading = ref(false)
  const error = ref<Error | null>(null)
  const transport = useTuffTransport()
  const tempFileCreateEvent = defineRawEvent<TempFileCreateRequest, TempFileCreateResponse>(
    'temp-file:create'
  )
  const downloadSdk = isElectronRenderer() ? useDownloadSdk() : null
  let remoteSvgCacheDirPromise: Promise<string | null> | null = null
  const defaultFetchTimeoutMs = 5_000
  const downloadTimeoutMs = 20_000

  const retrier = createRetrier(
    retrierOptions ?? {
      maxRetries: 2,
      timeoutMs: () => {
        const targetUrl = normalizeSource(url.value)
        if (targetUrl && isRemoteHttp(targetUrl) && !isLocalHttpSource(targetUrl)) {
          return downloadTimeoutMs
        }
        return defaultFetchTimeoutMs
      }
    }
  )

  if (autoFetch && url.value) {
    fetchSvgContent()
  }

  function normalizeSource(source: unknown): string {
    const raw = typeof source === 'string' ? source.trim() : ''
    if (!raw) return ''
    if (raw.startsWith('i-/api/')) return raw.slice(2) // => '/api/...'
    return raw
  }

  function isApiSource(source: string): boolean {
    return source.startsWith('/api/')
  }

  function isLocalSource(source: string): boolean {
    if (!source) return false
    if (source.startsWith('file:') || source.startsWith('tfile:')) return true
    if (source.startsWith('/') && !isApiSource(source)) return true
    if (source.startsWith('\\\\')) return true
    return /^[a-z]:[\\/]/i.test(source)
  }

  function isRemoteHttp(source: string): boolean {
    if (!source) return false
    try {
      const parsed = new URL(source)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }

  function isLocalHttpSource(source: string): boolean {
    if (!isRemoteHttp(source)) return false
    try {
      return isLocalhostUrl(source)
    } catch {
      return false
    }
  }

  function ensureTfileUrl(source: string): string {
    if (source.startsWith('tfile:')) {
      const localPath = resolveLocalPath(source)
      return localPath ? buildTfileUrl(localPath) : source
    }
    if (source.startsWith('file:')) {
      const localPath = resolveLocalPath(source)
      return localPath ? buildTfileUrl(localPath) : source
    }
    if (source.startsWith('/') || source.startsWith('\\\\') || /^[a-z]:[\\/]/i.test(source)) {
      return buildTfileUrl(source)
    }
    return source
  }

  function resolveLocalPath(targetUrl: string): string {
    const normalizeLocalPath = (value: string): string => {
      const normalized = value.replace(/\\/g, '/')
      if (/^\/[a-z]:\//i.test(normalized)) {
        return normalized.slice(1)
      }
      return normalized
    }

    const decodeStable = (value: string): string => {
      let decoded = value
      for (let i = 0; i < 3; i++) {
        try {
          const next = decodeURIComponent(decoded)
          if (next === decoded) break
          decoded = next
        } catch {
          break
        }
      }
      return decoded
    }

    if (targetUrl.startsWith('file:')) {
      try {
        return normalizeLocalPath(decodeStable(new URL(targetUrl).pathname))
      } catch {
        return ''
      }
    }

    if (targetUrl.startsWith('tfile:')) {
      try {
        const parsed = new URL(targetUrl)
        if (
          parsed.hostname &&
          /^[a-z]$/i.test(parsed.hostname) &&
          parsed.pathname.startsWith('/')
        ) {
          return normalizeLocalPath(decodeStable(`${parsed.hostname}:${parsed.pathname}`))
        }
        const host = parsed.hostname || ''
        const pathname = parsed.pathname || ''
        const merged = host ? `/${host}${pathname}` : pathname
        return normalizeLocalPath(decodeStable(merged))
      } catch {
        const raw = targetUrl.replace(/^tfile:\/\//, '').split(/[?#]/)[0] ?? ''
        const normalized = raw.startsWith('/') ? raw : `/${raw}`
        return normalizeLocalPath(decodeStable(normalized))
      }
    }

    return targetUrl
  }

  function splitPath(filePath: string): { destination: string; filename: string } {
    const separatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
    if (separatorIndex <= 0) {
      return { destination: filePath, filename: filePath }
    }
    return {
      destination: filePath.slice(0, separatorIndex),
      filename: filePath.slice(separatorIndex + 1)
    }
  }

  function stableHash(input: string): string {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i)
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
  }

  function joinPath(base: string, file: string): string {
    const normalizedBase = base.replace(/[\\/]+$/, '')
    return `${normalizedBase}/${file}`
  }

  function buildRemoteCacheFilename(targetUrl: string): string {
    return `${REMOTE_SVG_CACHE_PREFIX}-${stableHash(targetUrl)}.svg`
  }

  async function resolveRemoteSvgCacheDir(): Promise<string | null> {
    if (!isElectronRenderer()) return null

    if (!remoteSvgCacheDirPromise) {
      remoteSvgCacheDirPromise = transport
        .send(AppEvents.system.getPath, { name: 'userData' })
        .then((userDataPath) => {
          if (typeof userDataPath !== 'string' || userDataPath.trim().length === 0) {
            return null
          }
          const normalizedUserDataPath = userDataPath.replace(/\\/g, '/').replace(/[\\/]+$/, '')
          return `${normalizedUserDataPath}/${REMOTE_SVG_CACHE_SUBDIR}`
        })
        .catch(() => null)
    }

    return await remoteSvgCacheDirPromise
  }

  async function readSvgText(source: string, allowMissing = false): Promise<string | null> {
    try {
      const svgText = await transport.send(AppEvents.system.readFile, { source, allowMissing })
      if (!svgText || svgText.trim().length === 0) {
        return null
      }
      return svgText
    } catch {
      return null
    }
  }

  async function tryReadRemoteCache(
    targetUrl: string
  ): Promise<{ fileUrl: string; content: string } | null> {
    const knownFileUrl = svgFileCache.get(targetUrl)
    if (knownFileUrl) {
      const cachedText = await readSvgText(knownFileUrl, true)
      if (cachedText) {
        svgContentCache.set(targetUrl, cachedText)
        return { fileUrl: knownFileUrl, content: cachedText }
      }
      svgFileCache.delete(targetUrl)
      svgContentCache.delete(targetUrl)
    }

    const cacheDir = await resolveRemoteSvgCacheDir()
    if (!cacheDir) {
      return null
    }

    const cacheFilePath = joinPath(cacheDir, buildRemoteCacheFilename(targetUrl))
    const cacheFileUrl = buildTfileUrl(cacheFilePath)
    const cachedText = await readSvgText(cacheFileUrl, true)
    if (!cachedText) {
      return null
    }

    svgFileCache.set(targetUrl, cacheFileUrl)
    svgContentCache.set(targetUrl, cachedText)
    return { fileUrl: cacheFileUrl, content: cachedText }
  }

  function settlePendingTask(taskId: string, action: 'resolve' | 'reject', reason?: string): void {
    const pending = pendingTasks.get(taskId)
    if (!pending) return
    pendingTasks.delete(taskId)
    clearTimeout(pending.timeoutId)
    if (action === 'resolve') {
      pending.resolve()
      return
    }
    pending.reject(new Error(reason || 'Download failed'))
  }

  async function getTaskStatus(taskId: string): Promise<DownloadStatus | null> {
    if (!downloadSdk) return null
    try {
      const response = await downloadSdk.getTaskStatus({ taskId })
      if (!response?.success) return null
      return response.task?.status ?? null
    } catch {
      return null
    }
  }

  async function syncTaskState(taskId: string): Promise<boolean> {
    const status = await getTaskStatus(taskId)
    if (status === DownloadStatus.COMPLETED) {
      settlePendingTask(taskId, 'resolve')
      return true
    }
    if (status === DownloadStatus.FAILED || status === DownloadStatus.CANCELLED) {
      settlePendingTask(taskId, 'reject', `Download ${status}`)
      return true
    }
    return false
  }

  function ensureDownloadListeners(): void {
    if (downloadListenerRegistered || !downloadSdk) return
    downloadListenerRegistered = true

    downloadDisposers.push(
      downloadSdk.onTaskCompleted((task) => {
        if (task?.id) settlePendingTask(task.id, 'resolve')
      }),
      downloadSdk.onTaskFailed((task) => {
        if (task?.id) settlePendingTask(task.id, 'reject', task.error || 'Download failed')
      }),
      downloadSdk.onTaskUpdated((task) => {
        if (!task?.id || !task.status) return
        if (task.status === DownloadStatus.COMPLETED) {
          settlePendingTask(task.id, 'resolve')
        } else if (
          task.status === DownloadStatus.FAILED ||
          task.status === DownloadStatus.CANCELLED
        ) {
          settlePendingTask(task.id, 'reject', task.error || `Download ${task.status}`)
        }
      })
    )
  }

  async function waitForTask(taskId: string): Promise<void> {
    ensureDownloadListeners()
    const inflight = pendingTasks.get(taskId)
    if (inflight) {
      return inflight.promise
    }

    const timeoutMs = downloadTimeoutMs
    let resolve!: () => void
    let reject!: (error: Error) => void
    const promise = new Promise<void>((resolveFn, rejectFn) => {
      resolve = resolveFn
      reject = rejectFn
    })

    const timeoutId = window.setTimeout(() => {
      void syncTaskState(taskId).then((settled) => {
        if (!settled) {
          settlePendingTask(taskId, 'reject', 'Download timeout')
        }
      })
    }, timeoutMs)

    pendingTasks.set(taskId, { resolve, reject, timeoutId, promise })
    void syncTaskState(taskId)
    return promise
  }

  async function downloadRemoteSvg(
    targetUrl: string
  ): Promise<{ fileUrl: string; content: string }> {
    const cachedContent = svgContentCache.get(targetUrl)
    const cachedFile = svgFileCache.get(targetUrl)
    if (cachedContent && cachedFile) {
      return { fileUrl: cachedFile, content: cachedContent }
    }

    const inflight = svgInflight.get(targetUrl)
    if (inflight) {
      return await inflight
    }

    const taskPromise = (async () => {
      if (!downloadSdk) {
        throw new Error('Download SDK unavailable')
      }

      try {
        const cached = await tryReadRemoteCache(targetUrl)
        if (cached) {
          return cached
        }

        let fileUrl = ''
        let destination = ''
        let filename = ''

        const cacheDir = await resolveRemoteSvgCacheDir()
        if (cacheDir) {
          filename = buildRemoteCacheFilename(targetUrl)
          destination = cacheDir
          fileUrl = buildTfileUrl(joinPath(destination, filename))
        } else {
          const temp = await transport.send(tempFileCreateEvent, {
            namespace: 'icons/svg',
            ext: 'svg',
            prefix: 'tufficon',
            retentionMs: REMOTE_SVG_RETENTION_MS
          })

          fileUrl = temp.url
          const filePath = resolveLocalPath(fileUrl)
          if (!filePath) {
            throw new Error('Invalid temp file path')
          }

          const split = splitPath(filePath)
          destination = split.destination
          filename = split.filename
        }

        const response = await downloadSdk.addTask({
          url: targetUrl,
          destination,
          filename,
          priority: DownloadPriority.LOW,
          module: DownloadModule.RESOURCE_DOWNLOAD,
          metadata: {
            hidden: true,
            purpose: 'tufficon-svg',
            sourceUrl: targetUrl,
            cacheKey: filename
          }
        })

        if (!response?.success || !response.taskId) {
          throw new Error(response?.error || 'Failed to create download task')
        }

        await waitForTask(response.taskId)
        const svgText = await readSvgText(fileUrl)

        if (!svgText) {
          throw new Error('Downloaded SVG file is empty')
        }

        svgFileCache.set(targetUrl, fileUrl)
        svgContentCache.set(targetUrl, svgText)
        return { fileUrl, content: svgText }
      } catch (err) {
        // Clean up cache on error
        svgFileCache.delete(targetUrl)
        svgContentCache.delete(targetUrl)
        throw err instanceof Error ? err : new Error(String(err))
      }
    })()

    svgInflight.set(targetUrl, taskPromise)
    try {
      return await taskPromise
    } catch (err) {
      // Re-throw with better context
      throw new Error(
        `Failed to download SVG from ${targetUrl}: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      svgInflight.delete(targetUrl)
    }
  }

  async function doFetch(): Promise<string> {
    const targetUrl = normalizeSource(url.value)
    if (!targetUrl) return ''

    if (isLocalSource(targetUrl)) {
      if (!isElectronRenderer()) {
        resolvedUrl.value = ''
        return ''
      }
      const tfileUrl = ensureTfileUrl(targetUrl)
      resolvedUrl.value = tfileUrl
      return await transport.send(AppEvents.system.readFile, { source: tfileUrl })
    }

    if (isApiSource(targetUrl) || !isElectronRenderer()) {
      resolvedUrl.value = targetUrl
      const response = await fetch(targetUrl)
      return await response.text()
    }

    if (isLocalHttpSource(targetUrl)) {
      resolvedUrl.value = targetUrl
      const response = await fetch(targetUrl)
      return await response.text()
    }

    if (isRemoteHttp(targetUrl)) {
      const { fileUrl, content } = await downloadRemoteSvg(targetUrl)
      resolvedUrl.value = fileUrl
      return content
    }

    // All other cases failed - throw error instead of trying invalid fetch(tfile://)
    throw new Error(`Unsupported icon source: ${targetUrl}`)
  }

  const fetchWithRetry = retrier(doFetch) as () => Promise<string>

  async function fetchSvgContent() {
    const targetUrl = normalizeSource(url.value)
    if (!targetUrl) {
      loading.value = false
      error.value = null
      content.value = null
      resolvedUrl.value = ''
      return
    }

    loading.value = true
    error.value = null
    content.value = null // Clear previous content on new fetch

    try {
      const text = await fetchWithRetry()
      if (!text || text.trim().length === 0) {
        throw new Error('Empty content received')
      }
      content.value = text
      error.value = null // Clear error on success
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      content.value = null // Ensure content is cleared on error
      console.error('fetchSvgContent failed after retries', url.value, err)
    } finally {
      loading.value = false
    }
  }

  function setUrl(newUrl: string) {
    url.value = newUrl
    resolvedUrl.value = ''

    if (!normalizeSource(newUrl)) {
      loading.value = false
      error.value = null
      content.value = null
      return
    }

    if (autoFetch) {
      fetchSvgContent()
    }
  }

  return { content, resolvedUrl, loading, error, fetchSvgContent, setUrl }
}
