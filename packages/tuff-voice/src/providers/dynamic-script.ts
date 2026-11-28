import type {
  VoiceAudioFormat,
  VoiceHttpClient,
  VoiceHttpResponse,
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
  VoiceProviderEvent,
  VoiceRecognitionResult,
  VoiceSocket,
  VoiceSocketFactory,
  VoiceStreamConnection,
  VoiceStreamRequest,
  VoiceUploadRequest,
} from '../contracts'
import type { DnsLookupFn } from '../http'
import { Buffer } from 'node:buffer'
import { AsyncEventQueue, createAbortError } from '../async'
import { assertVoiceProviderRequestId, VoiceProviderError } from '../contracts'
import { assertSafeRemoteUrlAsync, isSafeRemoteUrl, safeFetchWithRedirects } from '../http'

export { isSafeRemoteUrl }

export interface DynamicScriptSessionContext {
  request: VoiceStreamRequest
  config: Readonly<Record<string, unknown>>
  emit: (event: VoiceProviderEvent) => void
  fetch: (
    url: string,
    options?: {
      method?: 'GET' | 'POST'
      headers?: Record<string, string>
      body?: string | Uint8Array
      signal?: AbortSignal
    },
  ) => Promise<{
    status: number
    headers: Readonly<Record<string, string | undefined>>
    text: () => Promise<string>
    json: () => Promise<unknown>
  }>
  connectWebSocket?: (url: string, headers?: Record<string, string>) => Promise<VoiceSocket>
}

export interface DynamicVoiceScriptSession {
  writePcm: (chunk: Uint8Array) => Promise<void> | void
  end: () => Promise<void> | void
  abort?: (reason?: string) => Promise<void> | void
}

export interface DynamicVoiceScriptExports {
  name?: string
  defaultStreamModel?: string
  defaultUploadModel?: string
  createSession?: (
    ctx: DynamicScriptSessionContext,
  ) => DynamicVoiceScriptSession | Promise<DynamicVoiceScriptSession>
  transcribeUpload?: (
    ctx: DynamicScriptSessionContext,
    request: VoiceUploadRequest,
  ) => Promise<VoiceRecognitionResult>
}

export interface DynamicScriptVoiceProviderOptions {
  /**
   * Deprecated untrusted JavaScript source string.
   * Arbitrary string execution via `node:vm` is disabled in the main process for security;
   * pass a trusted in-process `adapter` or use a declarative signed provider protocol instead.
   */
  scriptContent?: string
  /** Trusted programmatic adapter exports (never evaluated from arbitrary script text). */
  adapter?: DynamicVoiceScriptExports
  providerId?: string
  timeoutMs?: number
  contextConfig?: Record<string, unknown>
  httpClient?: VoiceHttpClient
  fetchImpl?: typeof fetch
  socketFactory?: VoiceSocketFactory
  allowLocalhost?: boolean
  lookup?: DnsLookupFn
  /** Explicit test-only opt-out for skipping DNS SSRF checks; keep unset/false in production. */
  skipDnsLookup?: boolean
}

export class DynamicScriptVoiceProvider implements VoiceProviderAdapter {
  readonly id: string
  readonly defaultStreamModel?: string
  readonly defaultUploadModel?: string
  readonly capabilities: VoiceProviderCapabilities

  private readonly scriptExports: DynamicVoiceScriptExports
  private readonly options: DynamicScriptVoiceProviderOptions

  constructor(options: DynamicScriptVoiceProviderOptions) {
    this.options = options
    this.scriptExports = this.resolveAdapter(options)

    this.id = options.providerId ?? this.scriptExports.name ?? 'dynamic-script'
    this.defaultStreamModel = this.scriptExports.defaultStreamModel
    this.defaultUploadModel = this.scriptExports.defaultUploadModel

    const stream = typeof this.scriptExports.createSession === 'function'
    const upload = typeof this.scriptExports.transcribeUpload === 'function'

    if (!stream && !upload) {
      throw new VoiceProviderError(
        'VOICE_SCRIPT_EXPORTS_INVALID',
        'Dynamic adapter must export either createSession or transcribeUpload.',
      )
    }

    const formats: VoiceAudioFormat[] = ['pcm', 'wav']
    this.capabilities = { stream, upload, formats }
  }

  private resolveAdapter(options: DynamicScriptVoiceProviderOptions): DynamicVoiceScriptExports {
    if (!options.adapter) {
      throw new VoiceProviderError(
        'VOICE_SCRIPT_EXECUTION_DISABLED',
        'Arbitrary dynamic script evaluation via node:vm is disabled in the main process for security. Use a declarative protocol or trusted programmatic adapter.',
      )
    }

    if (typeof options.adapter !== 'object' || Array.isArray(options.adapter)) {
      throw new VoiceProviderError(
        'VOICE_SCRIPT_EXPORTS_INVALID',
        'Dynamic voice adapter must be a plain object.',
      )
    }

    return options.adapter
  }

  private createSafeFetch(signal?: AbortSignal) {
    return async (
      rawUrl: string,
      reqOptions: {
        method?: 'GET' | 'POST'
        headers?: Record<string, string>
        body?: string | Uint8Array
        signal?: AbortSignal
      } = {},
    ) => {
      const allowLocalhost = this.options.allowLocalhost === true
      const activeSignal = reqOptions.signal ?? signal

      if (this.options.httpClient) {
        if (!this.options.skipDnsLookup) {
          await assertSafeRemoteUrlAsync(rawUrl, {
            allowedProtocols: ['https:'],
            allowLocalhost,
            lookup: this.options.lookup,
          })
        }
        else if (!isSafeRemoteUrl(rawUrl, ['https:'], { allowLocalhost })) {
          throw new VoiceProviderError(
            'VOICE_SCRIPT_URL_DENIED',
            `URL is not an allowed remote HTTPS target: ${rawUrl}`,
          )
        }
        const response: VoiceHttpResponse = await this.options.httpClient.request({
          method: reqOptions.method ?? 'GET',
          url: rawUrl,
          headers: reqOptions.headers,
          body: reqOptions.body,
          signal: activeSignal,
        })
        return {
          status: response.status,
          headers: response.headers,
          text: async () =>
            typeof response.body === 'string'
              ? response.body
              : JSON.stringify(response.body ?? ''),
          json: async () =>
            typeof response.body === 'string'
              ? JSON.parse(response.body)
              : response.body,
        }
      }

      const fetchRes = await safeFetchWithRedirects(
        {
          url: rawUrl,
          method: reqOptions.method ?? 'GET',
          headers: reqOptions.headers,
          body: reqOptions.body ? Buffer.from(reqOptions.body) : undefined,
          signal: activeSignal,
        },
        {
          fetchImpl: this.options.fetchImpl ?? fetch,
          allowedProtocols: ['https:'],
          allowLocalhost,
          lookup: this.options.lookup,
          skipDnsLookup: this.options.skipDnsLookup,
        },
      )

      const headers: Record<string, string | undefined> = {}
      fetchRes.headers.forEach((val, key) => {
        headers[key] = val
      })

      return {
        status: fetchRes.status,
        headers,
        text: () => fetchRes.text(),
        json: () => fetchRes.json(),
      }
    }
  }

  private createSafeWebSocket(signal?: AbortSignal) {
    return async (rawUrl: string, headers: Record<string, string> = {}) => {
      const allowLocalhost = this.options.allowLocalhost === true
      if (!this.options.skipDnsLookup) {
        await assertSafeRemoteUrlAsync(rawUrl, {
          allowedProtocols: ['wss:'],
          allowLocalhost,
          lookup: this.options.lookup,
        })
      }
      else if (!isSafeRemoteUrl(rawUrl, ['wss:'], { allowLocalhost })) {
        throw new VoiceProviderError(
          'VOICE_SCRIPT_URL_DENIED',
          `WebSocket URL is not an allowed remote WSS target: ${rawUrl}`,
        )
      }
      if (!this.options.socketFactory) {
        throw new VoiceProviderError(
          'VOICE_SOCKET_FACTORY_MISSING',
          'Socket factory is required for dynamic adapter WebSocket connections.',
        )
      }

      return await this.options.socketFactory.connect({
        url: rawUrl,
        headers,
        signal,
      })
    }
  }

  async createStream(request: VoiceStreamRequest): Promise<VoiceStreamConnection> {
    assertVoiceProviderRequestId(request.requestId)

    if (!this.scriptExports.createSession) {
      throw new VoiceProviderError(
        'VOICE_STREAM_UNSUPPORTED',
        `Provider ${this.id} does not support stream mode.`,
      )
    }

    const queue = new AsyncEventQueue<VoiceProviderEvent>()
    let sessionInstance: DynamicVoiceScriptSession | null = null
    let ended = false
    let timedOut = false
    let aborted = false

    const abortController = new AbortController()
    const signal = request.signal
      ? AbortSignal.any([request.signal, abortController.signal])
      : abortController.signal

    const sessionContext: DynamicScriptSessionContext = {
      request,
      config: this.options.contextConfig ?? {},
      emit: (event) => {
        if (!ended && !timedOut && !aborted) {
          queue.push(event)
          if (event.type === 'end') {
            ended = true
            queue.end()
          }
        }
      },
      fetch: this.createSafeFetch(signal),
      connectWebSocket: this.options.socketFactory
        ? this.createSafeWebSocket(signal)
        : undefined,
    }

    const handshakeTimeoutMs = this.options.timeoutMs ?? request.timeoutMs ?? 2_000
    let resolveReady!: () => void
    let rejectReady!: (reason?: unknown) => void
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    const timer = setTimeout(() => {
      if (ended || aborted || sessionInstance)
        return
      timedOut = true
      ended = true
      abortController.abort()
      const err = new VoiceProviderError(
        'VOICE_SCRIPT_TIMEOUT',
        `Dynamic adapter session creation timed out after ${handshakeTimeoutMs}ms.`,
        { retryable: true, requestId: request.requestId },
      )
      queue.fail(err)
      rejectReady(err)
    }, handshakeTimeoutMs)

    Promise.resolve()
      .then(() => this.scriptExports.createSession!(sessionContext))
      .then((session) => {
        clearTimeout(timer)
        if (timedOut || aborted) {
          if (session?.abort) {
            void Promise.resolve(session.abort('Dynamic adapter session timed out or aborted')).catch(() => {})
          }
          return
        }
        if (
          !session
          || typeof session.writePcm !== 'function'
          || typeof session.end !== 'function'
        ) {
          throw new VoiceProviderError(
            'VOICE_SCRIPT_SESSION_INVALID',
            'createSession must return an object with writePcm and end methods.',
          )
        }
        sessionInstance = session
        resolveReady()
      })
      .catch((error) => {
        clearTimeout(timer)
        if (timedOut || aborted)
          return
        const err
          = error instanceof VoiceProviderError
            ? error
            : new VoiceProviderError(
                'VOICE_SCRIPT_SESSION_FAILED',
                `Dynamic adapter failed to create session: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error, requestId: request.requestId },
              )
        ended = true
        queue.fail(err)
        rejectReady(err)
      })

    return {
      ready,
      events: queue,
      writePcm: async (chunk: Buffer | Uint8Array) => {
        await ready
        if (!sessionInstance || ended || timedOut || aborted)
          return
        try {
          await sessionInstance.writePcm(chunk)
        }
        catch (error) {
          const err = new VoiceProviderError(
            'VOICE_SCRIPT_WRITE_FAILED',
            `Adapter writePcm failed: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error, requestId: request.requestId },
          )
          ended = true
          queue.fail(err)
          throw err
        }
      },
      end: async () => {
        await ready
        if (!sessionInstance || ended || timedOut || aborted)
          return
        try {
          await sessionInstance.end()
        }
        catch (error) {
          const err = new VoiceProviderError(
            'VOICE_SCRIPT_END_FAILED',
            `Adapter end failed: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error, requestId: request.requestId },
          )
          ended = true
          queue.fail(err)
          throw err
        }
      },
      abort: async (reason = 'Dynamic adapter aborted') => {
        aborted = true
        ended = true
        clearTimeout(timer)
        abortController.abort()
        if (sessionInstance?.abort) {
          await Promise.resolve(sessionInstance.abort(reason)).catch(() => {})
        }
        const abortErr = createAbortError(reason)
        queue.fail(abortErr)
        rejectReady(abortErr)
      },
    }
  }

  async transcribeUpload(request: VoiceUploadRequest): Promise<VoiceRecognitionResult> {
    assertVoiceProviderRequestId(request.requestId)

    if (!this.scriptExports.transcribeUpload) {
      throw new VoiceProviderError(
        'VOICE_UPLOAD_UNSUPPORTED',
        `Provider ${this.id} does not support upload mode.`,
      )
    }

    const sessionContext: DynamicScriptSessionContext = {
      request: {
        model: request.model,
        audio: { format: 'wav', sampleRate: 16_000, channels: 1, bitsPerSample: 16 },
        language: request.language,
        requestId: request.requestId,
        signal: request.signal,
        timeoutMs: request.timeoutMs,
      },
      config: this.options.contextConfig ?? {},
      emit: () => {},
      fetch: this.createSafeFetch(request.signal),
    }

    try {
      return await this.scriptExports.transcribeUpload(sessionContext, request)
    }
    catch (error) {
      throw error instanceof VoiceProviderError
        ? error
        : new VoiceProviderError(
            'VOICE_SCRIPT_UPLOAD_FAILED',
            `Dynamic adapter upload failed: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error, requestId: request.requestId },
          )
    }
  }
}
