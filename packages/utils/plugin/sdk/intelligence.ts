import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
} from '../../types/intelligence'
import { hasWindow } from '../../env'
import { ensureRendererChannel } from './channel'

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
  invoke<T = any>(
    capabilityId: string,
    payload: any,
    options?: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<T>>

  chat(options: IntelligenceChatOptions): Promise<IntelligenceInvokeResult<string>>
}

function resolveSdkApi(): number | undefined {
  const globalWindow = hasWindow() ? (window as any) : undefined
  const sdkapi = globalWindow?.$plugin?.sdkapi
  return typeof sdkapi === 'number' ? sdkapi : undefined
}

async function invokeCapability<T = any>(
  capabilityId: string,
  payload: any,
  options?: IntelligenceInvokeOptions,
): Promise<IntelligenceInvokeResult<T>> {
  const channel = ensureRendererChannel()
  const response = await channel.send('intelligence:invoke', {
    capabilityId,
    payload,
    options,
    _sdkapi: resolveSdkApi(),
  })

  if (!response?.ok) {
    throw new Error(response?.error || 'Intelligence invoke failed')
  }

  return response.result
}

async function chat(options: IntelligenceChatOptions): Promise<IntelligenceInvokeResult<string>> {
  const channel = ensureRendererChannel()
  const response = await channel.send('intelligence:chat-langchain', {
    messages: options.messages,
    providerId: options.providerId,
    model: options.model,
    promptTemplate: options.promptTemplate,
    promptVariables: options.promptVariables,
    metadata: options.metadata,
    _sdkapi: resolveSdkApi(),
  })

  if (!response?.ok) {
    throw new Error(response?.error || 'Intelligence chat failed')
  }

  return response.result
}

export const intelligence: IntelligenceSDK = {
  invoke: invokeCapability,
  chat,
}
