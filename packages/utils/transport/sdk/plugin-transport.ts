import type { TuffEvent } from '../event/types'
import type {
  ITuffTransport,
  SendOptions,
  StreamController,
  StreamOptions,
  TransportPortHandle,
  TransportPortOpenOptions,
} from '../types'
import type { TransportPortUpgradeRequest, TransportPortUpgradeResponse } from '../events'
import { assertTuffEvent } from '../event/builder'
import { TransportEvents } from '../events'

type CacheEntry = {
  value: unknown
  expiresAt?: number
}

type CacheConfig = {
  key?: string
  mode: 'prefer' | 'only'
  ttlMs?: number
}

function normalizeCacheOptions(options?: SendOptions): CacheConfig | null {
  if (!options?.cache) {
    return null
  }

  if (options.cache === true) {
    return { mode: 'prefer' }
  }

  const mode = options.cache.mode ?? 'prefer'
  return {
    key: options.cache.key,
    mode,
    ttlMs: options.cache.ttlMs,
  }
}

function buildCacheKey(eventName: string, payload: unknown, overrideKey?: string): string {
  if (overrideKey) {
    return overrideKey
  }

  if (payload === undefined) {
    return `${eventName}:__void__`
  }

  try {
    return `${eventName}:${JSON.stringify(payload)}`
  }
  catch {
    return `${eventName}:${Object.prototype.toString.call(payload)}`
  }
}

interface PluginChannelLike {
  send?: (eventName: string, payload?: any) => Promise<any>
  sendToMain?: (eventName: string, payload?: any) => Promise<any>
  regChannel?: (eventName: string, handler: (data: any) => any) => () => void
  onMain?: (eventName: string, handler: (event: any) => any) => () => void
}

function unwrapPayload<T>(raw: unknown): T {
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    if ('data' in record && 'header' in record) {
      return (record as any).data as T
    }
  }
  return raw as T
}

export class TuffPluginTransport implements ITuffTransport {
  private cache = new Map<string, CacheEntry>()

  constructor(private readonly channel: PluginChannelLike) {}

  async send<TReq, TRes>(
    event: TuffEvent<TReq, TRes> | TuffEvent<void, TRes>,
    payload?: TReq | void,
    options?: SendOptions,
  ): Promise<TRes> {
    assertTuffEvent(event as any, 'TuffPluginTransport.send')

    const eventName = (event as any).toEventName() as string
    const cacheConfig = normalizeCacheOptions(options)
    const cacheKey = cacheConfig ? buildCacheKey(eventName, payload, cacheConfig.key) : ''
    if (cacheConfig) {
      const entry = this.cache.get(cacheKey)
      if (entry) {
        if (entry.expiresAt === undefined || entry.expiresAt > Date.now()) {
          return entry.value as TRes
        }
        this.cache.delete(cacheKey)
      }
      if (cacheConfig.mode === 'only') {
        throw new Error(`[TuffTransport] Cache miss for \"${eventName}\"`)
      }
    }

    const sender = typeof this.channel.sendToMain === 'function'
      ? this.channel.sendToMain.bind(this.channel)
      : this.channel.send

    if (!sender) {
      throw new Error('[TuffPluginTransport] Channel send function not available')
    }

    const shouldPassPayload = payload !== undefined
    const result = await sender(eventName, shouldPassPayload ? payload : undefined)
    if (cacheConfig) {
      const expiresAt = typeof cacheConfig.ttlMs === 'number' && Number.isFinite(cacheConfig.ttlMs)
        ? Date.now() + Math.max(0, cacheConfig.ttlMs)
        : undefined
      this.cache.set(cacheKey, { value: result, expiresAt })
    }
    return result as TRes
  }

  async upgrade(options: TransportPortUpgradeRequest): Promise<TransportPortUpgradeResponse> {
    return await this.send(TransportEvents.port.upgrade, options)
  }

  async openPort(_options: TransportPortOpenOptions): Promise<TransportPortHandle | null> {
    console.warn('[TuffTransport] MessagePort is not supported in plugin transport yet.')
    return null
  }

  stream<TReq, TChunk>(
    _event: TuffEvent<TReq, AsyncIterable<TChunk>>,
    _payload: TReq,
    _options: StreamOptions<TChunk>,
  ): Promise<StreamController> {
    throw new Error('[TuffPluginTransport] Stream is not supported in plugin transport')
  }

  on<TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    handler: (payload: TReq) => TRes | Promise<TRes>,
  ): () => void {
    assertTuffEvent(event, 'TuffPluginTransport.on')

    const eventName = event.toEventName()

    if (typeof this.channel.onMain === 'function') {
      return this.channel.onMain(eventName, raw => handler(unwrapPayload<TReq>(raw)))
    }

    if (typeof this.channel.regChannel === 'function') {
      return this.channel.regChannel(eventName, raw => handler(unwrapPayload<TReq>(raw)))
    }

    throw new Error('[TuffPluginTransport] Channel on function not available')
  }

  async flush(): Promise<void> {

  }

  destroy(): void {

  }
}

export function createPluginTuffTransport(channel: PluginChannelLike): ITuffTransport {
  return new TuffPluginTransport(channel)
}
