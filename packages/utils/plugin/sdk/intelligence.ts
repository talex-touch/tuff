import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
} from '../../types/intelligence'
import { createIntelligenceClient } from '../../intelligence/client'
import { ensureRendererChannel } from './channel'
import { tryGetPluginSdkApi } from './plugin-info'

export interface IntelligenceSDK {
  invoke: <T = any>(
    capabilityId: string,
    payload: any,
    options?: IntelligenceInvokeOptions,
  ) => Promise<IntelligenceInvokeResult<T>>
}

function resolveSdkApi(): number | undefined {
  return tryGetPluginSdkApi()
}

function createPluginIntelligenceClient() {
  return createIntelligenceClient({
    send: (eventName, payload) => {
      const channel = ensureRendererChannel()
      if (payload && typeof payload === 'object') {
        return channel.send(eventName, {
          ...(payload as Record<string, unknown>),
          _sdkapi: resolveSdkApi(),
        })
      }
      return channel.send(eventName, payload)
    },
  })
}

let cachedClient: ReturnType<typeof createPluginIntelligenceClient> | null = null

function getClient() {
  if (!cachedClient) {
    cachedClient = createPluginIntelligenceClient()
  }
  return cachedClient
}

async function invokeCapability<T = any>(
  capabilityId: string,
  payload: any,
  options?: IntelligenceInvokeOptions,
): Promise<IntelligenceInvokeResult<T>> {
  return getClient().invoke<T>(capabilityId, payload, options)
}

export const intelligence: IntelligenceSDK = {
  invoke: invokeCapability,
}
