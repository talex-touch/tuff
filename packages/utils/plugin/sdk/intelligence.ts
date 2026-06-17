import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceStreamOptions,
  IntelligenceTtsSpeakPayload,
  IntelligenceTtsSpeakResult,
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
  stream: <T = any>(
    capabilityId: string,
    payload: any,
    options: IntelligenceStreamOptions<T>,
    invokeOptions?: IntelligenceInvokeOptions,
  ) => Promise<unknown>
  ttsSpeak: (payload: IntelligenceTtsSpeakPayload) => Promise<IntelligenceTtsSpeakResult>
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

async function streamCapability<T = any>(
  capabilityId: string,
  payload: any,
  options: IntelligenceStreamOptions<T>,
  invokeOptions?: IntelligenceInvokeOptions,
): Promise<unknown> {
  return getClient().stream<T>(capabilityId, payload, options, invokeOptions)
}

async function ttsSpeak(payload: IntelligenceTtsSpeakPayload): Promise<IntelligenceTtsSpeakResult> {
  return getClient().ttsSpeak(payload)
}

export const intelligence: IntelligenceSDK = {
  invoke: invokeCapability,
  stream: streamCapability,
  ttsSpeak,
}
