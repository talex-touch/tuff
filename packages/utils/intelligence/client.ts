import type { AiInvokeOptions, AiInvokeResult, AiProviderConfig } from '../types/intelligence'

export interface IntelligenceClientChannel {
  send(eventName: string, payload: unknown): Promise<any>
}

export type IntelligenceChannelResolver = () => IntelligenceClientChannel | null | undefined

const defaultResolvers: IntelligenceChannelResolver[] = [
  () => {
    if (typeof globalThis === 'undefined') return null
    const maybe =
      (globalThis as any).touchChannel ||
      (globalThis as any).$touchChannel ||
      (globalThis as any).channel ||
      (globalThis as any).window?.touchChannel ||
      (globalThis as any).window?.$touchChannel
    return maybe ?? null
  }
]

export function resolveIntelligenceChannel(resolvers: IntelligenceChannelResolver[] = defaultResolvers): IntelligenceClientChannel | null {
  for (const resolver of resolvers) {
    try {
      const channel = resolver()
      if (channel) {
        return channel
      }
    } catch (error) {
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
  invoke<T = any>(capabilityId: string, payload: any, options?: AiInvokeOptions): Promise<AiInvokeResult<T>>
  testProvider(config: AiProviderConfig): Promise<unknown>
  testCapability(params: Record<string, any>): Promise<unknown>
  fetchModels(config: AiProviderConfig): Promise<{ success: boolean; models?: string[]; message?: string }>
}

export function createIntelligenceClient(channel?: IntelligenceClientChannel, resolvers?: IntelligenceChannelResolver[]): IntelligenceClient {
  const resolvedChannel = channel ?? resolveIntelligenceChannel(resolvers)
  if (!resolvedChannel) {
    throw new Error('[Intelligence Client] Unable to resolve channel. Pass a channel instance or register a resolver.')
  }

  return {
    invoke<T = any>(capabilityId: string, payload: any, options?: AiInvokeOptions) {
      return assertResponse<AiInvokeResult<T>>(
        resolvedChannel.send('intelligence:invoke', { capabilityId, payload, options })
      )
    },
    testProvider(config: AiProviderConfig) {
      return assertResponse(
        resolvedChannel.send('intelligence:test-provider', { provider: config })
      )
    },
    testCapability(params: Record<string, any>) {
      return assertResponse(
        resolvedChannel.send('intelligence:test-capability', params)
      )
    },
    fetchModels(config: AiProviderConfig) {
      return assertResponse<{ success: boolean; models?: string[]; message?: string }>(
        resolvedChannel.send('intelligence:fetch-models', { provider: config })
      )
    }
  }
}
