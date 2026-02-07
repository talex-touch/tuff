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

const svgFileCache = new Map<string, string>()
const svgContentCache = new Map<string, string>()
const svgInflight = new Map<string, Promise<{ fileUrl: string; content: string }>>()
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
    if (source.startsWith('tfile:') || source.startsWith('file:')) return source
    if (source.startsWith('/') || source.startsWith('\\\\') || /^[a-z]:[\\/]/i.test(source)) {
      return `tfile://${source}`
    }
    return source
  }

  function resolveLocalPath(targetUrl: string): string {
    return targetUrl.replace(/^tfile:\/\//, '')
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

  function ensureDownloadListeners(): void {
    if (downloadListenerRegistered || !downloadSdk) return
    downloadListenerRegistered = true

    const resolveTask = (taskId: string) => {
      const pending = pendingTasks.get(taskId)
      if (!pending) return
      pendingTasks.delete(taskId)
      clearTimeout(pending.timeoutId)
      pending.resolve()
    }

    const rejectTask = (taskId: string, reason: string) => {
      const pending = pendingTasks.get(taskId)
      if (!pending) return
      pendingTasks.delete(taskId)
      clearTimeout(pending.timeoutId)
      pending.reject(new Error(reason))
    }

    downloadDisposers.push(
      downloadSdk.onTaskCompleted((task) => {
        if (task?.id) resolveTask(task.id)
      }),
      downloadSdk.onTaskFailed((task) => {
        if (task?.id) rejectTask(task.id, task.error || 'Download failed')
      }),
      downloadSdk.onTaskUpdated((task) => {
        if (!task?.id || !task.status) return
        if (task.status === DownloadStatus.COMPLETED) {
          resolveTask(task.id)
        } else if (
          task.status === DownloadStatus.FAILED ||
          task.status === DownloadStatus.CANCELLED
        ) {
          rejectTask(task.id, task.error || `Download ${task.status}`)
        }
      })
    )
  }

  async function waitForTask(taskId: string): Promise<void> {
    ensureDownloadListeners()
    if (pendingTasks.has(taskId)) {
      return pendingTasks.get(taskId)!.promise
    }
    const timeoutMs = downloadTimeoutMs
    let resolve!: () => void
    let reject!: (error: Error) => void
    const promise = new Promise<void>((resolveFn, rejectFn) => {
      resolve = resolveFn
      reject = rejectFn
    })
    const timeoutId = window.setTimeout(() => {
      pendingTasks.delete(taskId)
      reject(new Error('Download timeout'))
    }, timeoutMs)
    pendingTasks.set(taskId, { resolve, reject, timeoutId, promise })
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
        const temp = await transport.send(tempFileCreateEvent, {
          namespace: 'icons/svg',
          ext: 'svg',
          prefix: 'tufficon',
          retentionMs: 7 * 24 * 60 * 60 * 1000
        })

        const fileUrl = temp.url
        const filePath = resolveLocalPath(fileUrl)
        if (!filePath) {
          throw new Error('Invalid temp file path')
        }

        const { destination, filename } = splitPath(filePath)
        const response = await downloadSdk.addTask({
          url: targetUrl,
          destination,
          filename,
          priority: DownloadPriority.LOW,
          module: DownloadModule.RESOURCE_DOWNLOAD,
          metadata: {
            hidden: true,
            purpose: 'tufficon-svg',
            sourceUrl: targetUrl
          }
        })

        if (!response?.success || !response.taskId) {
          throw new Error(response?.error || 'Failed to create download task')
        }

        await waitForTask(response.taskId)
        const svgText = await transport.send(AppEvents.system.readFile, { source: fileUrl })

        if (!svgText || svgText.trim().length === 0) {
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
    if (autoFetch) {
      fetchSvgContent()
    }
  }

  return { content, resolvedUrl, loading, error, fetchSvgContent, setUrl }
}
