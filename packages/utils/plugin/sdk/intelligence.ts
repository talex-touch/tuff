import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
} from '../../types/intelligence'
import { createIntelligenceClient } from '../../intelligence/client'
import { ensureRendererChannel } from './channel'
import { tryGetPluginSdkApi } from './plugin-info'

export interface IntelligenceChatOptions {
  messages: IntelligenceMessage[]
  providerId?: string
  model?: string
  promptTemplate?: string
  promptVariables?: Record<string, any>
  stream?: boolean
  metadata?: Record<string, any>
}

export interface IntelligenceSDK {
  invoke: <T = any>(
    capabilityId: string,
    payload: any,
    options?: IntelligenceInvokeOptions,
  ) => Promise<IntelligenceInvokeResult<T>>

  /**
   * @deprecated 请优先使用 invoke('text.chat', ...) 或 intelligence client 的 chatLangChain()。
   */
  chat: (options: IntelligenceChatOptions) => Promise<IntelligenceInvokeResult<string>>
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

/**
 * @deprecated 请优先使用 invoke('text.chat', ...) 或 intelligence client 的 chatLangChain()。
 */

async function chat(options: IntelligenceChatOptions): Promise<IntelligenceInvokeResult<string>> {
  return getClient().chatLangChain({
    messages: options.messages,
    providerId: options.providerId,
    model: options.model,
    promptTemplate: options.promptTemplate,
    promptVariables: options.promptVariables,
    metadata: options.metadata,
  })
}

export const intelligence: IntelligenceSDK = {
  invoke: invokeCapability,
  chat,
}
