import type { AiInvokeOptions, AiInvokeResult, AiProviderConfig } from '../types/aisdk'

export interface AiSDKClientChannel {
  send(eventName: string, payload: unknown): Promise<any>
}

export type AiSDKChannelResolver = () => AiSDKClientChannel | null | undefined

const defaultResolvers: AiSDKChannelResolver[] = [
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

export function resolveAiChannel(resolvers: AiSDKChannelResolver[] = defaultResolvers): AiSDKClientChannel | null {
  for (const resolver of resolvers) {
    try {
      const channel = resolver()
      if (channel) {
        return channel
      }
    } catch (error) {
      console.warn('[AISDK Client] Channel resolver failed:', error)
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
    throw new Error(response?.error || 'AISDK channel request failed')
  }
  return response.result as T
}

export interface AiSDKClient {
  invoke<T = any>(capabilityId: string, payload: any, options?: AiInvokeOptions): Promise<AiInvokeResult<T>>
  testProvider(config: AiProviderConfig): Promise<unknown>
  testCapability(params: Record<string, any>): Promise<unknown>
}

export function createAiSDKClient(channel?: AiSDKClientChannel, resolvers?: AiSDKChannelResolver[]): AiSDKClient {
  const resolvedChannel = channel ?? resolveAiChannel(resolvers)
  if (!resolvedChannel) {
    throw new Error('[AISDK Client] Unable to resolve channel. Pass a channel instance or register a resolver.')
  }

  return {
    invoke<T = any>(capabilityId: string, payload: any, options?: AiInvokeOptions) {
      return assertResponse<AiInvokeResult<T>>(
        resolvedChannel.send('aisdk:invoke', { capabilityId, payload, options })
      )
    },
    testProvider(config: AiProviderConfig) {
      return assertResponse(
        resolvedChannel.send('aisdk:test-provider', { provider: config })
      )
    },
    testCapability(params: Record<string, any>) {
      return assertResponse(
        resolvedChannel.send('aisdk:test-capability', params)
      )
    }
  }
}
