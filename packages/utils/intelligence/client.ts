import type { ITuffTransport } from '../transport/types'
import type { IntelligenceInvokeOptions, IntelligenceInvokeResult, IntelligenceProviderConfig } from '../types/intelligence'
import { defineRawEvent } from '../transport/event/builder'

export interface IntelligenceClientChannel {
  send: (eventName: string, payload: unknown) => Promise<any>
}

type IntelligenceChannelLike = IntelligenceClientChannel | ITuffTransport

export type IntelligenceChannelResolver = () => IntelligenceClientChannel | null | undefined

const defaultResolvers: IntelligenceChannelResolver[] = [
  () => {
    if (typeof globalThis === 'undefined')
      return null
    const maybe
      = (globalThis as any).touchChannel
        || (globalThis as any).$touchChannel
        || (globalThis as any).channel
        || (globalThis as any).window?.touchChannel
        || (globalThis as any).window?.$touchChannel
    return maybe ?? null
  },
]

export function resolveIntelligenceChannel(resolvers: IntelligenceChannelResolver[] = defaultResolvers): IntelligenceClientChannel | null {
  for (const resolver of resolvers) {
    try {
      const channel = resolver()
      if (channel) {
        return channel
      }
    }
    catch (error) {
      console.warn('[Intelligence Client] Channel resolver failed:', error)
    }
  }
  return null
}

interface ChannelResponse<T> {
  ok: boolean
  result?: T
  error?: string
}

async function assertResponse<T>(promise: Promise<ChannelResponse<T>>): Promise<T> {
  const response = await promise
  if (!response?.ok) {
    throw new Error(response?.error || 'Intelligence channel request failed')
  }
  return response.result as T
}

export interface IntelligenceClient {
  invoke: <T = any>(capabilityId: string, payload: any, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<T>>
  testProvider: (config: IntelligenceProviderConfig) => Promise<unknown>
  testCapability: (params: Record<string, any>) => Promise<unknown>
  fetchModels: (config: IntelligenceProviderConfig) => Promise<{ success: boolean, models?: string[], message?: string }>
}

function isTuffTransport(channel: IntelligenceChannelLike | null | undefined): channel is ITuffTransport {
  return Boolean(channel && typeof (channel as ITuffTransport).stream === 'function')
}

function createTransportAdapter(transport: ITuffTransport): IntelligenceClientChannel {
  return {
    send: (eventName: string, payload: unknown) => {
      const event = defineRawEvent<unknown, unknown>(eventName)
      return transport.send(event, payload as unknown)
    },
  }
}

export function createIntelligenceClient(
  channel?: IntelligenceChannelLike,
  resolvers?: IntelligenceChannelResolver[],
): IntelligenceClient {
  let resolvedChannel: IntelligenceClientChannel | ITuffTransport | null | undefined
    = channel ?? resolveIntelligenceChannel(resolvers)
  if (resolvedChannel && isTuffTransport(resolvedChannel)) {
    resolvedChannel = createTransportAdapter(resolvedChannel)
  }
  if (!resolvedChannel) {
    throw new Error('[Intelligence Client] Unable to resolve channel. Pass a channel instance or register a resolver.')
  }

  return {
    invoke<T = any>(capabilityId: string, payload: any, options?: IntelligenceInvokeOptions) {
      return assertResponse<IntelligenceInvokeResult<T>>(
        resolvedChannel.send('intelligence:invoke', { capabilityId, payload, options }),
      )
    },
    testProvider(config: IntelligenceProviderConfig) {
      return assertResponse(
        resolvedChannel.send('intelligence:test-provider', { provider: config }),
      )
    },
    testCapability(params: Record<string, any>) {
      return assertResponse(
        resolvedChannel.send('intelligence:test-capability', params),
      )
    },
    fetchModels(config: IntelligenceProviderConfig) {
      return assertResponse<{ success: boolean, models?: string[], message?: string }>(
        resolvedChannel.send('intelligence:fetch-models', { provider: config }),
      )
    },
  }
}
