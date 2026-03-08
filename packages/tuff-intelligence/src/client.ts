import type {
  IntelligenceInvokeResult,
} from './types/intelligence'
import {
  createIntelligenceSdk
  
  
  
} from './transport/sdk/domains/intelligence'
import type {IntelligenceChatRequest, IntelligenceSdk, IntelligenceSdkTransport} from './transport/sdk/domains/intelligence';

export interface IntelligenceClientChannel {
  send: (eventName: string, payload?: unknown) => Promise<any>
}

interface IntelligenceTransportLike {
  send: (event: any, payload?: any) => Promise<any>
  stream?: unknown
}

type IntelligenceChannelLike = IntelligenceClientChannel | IntelligenceTransportLike

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

export function resolveIntelligenceChannel(
  resolvers: IntelligenceChannelResolver[] = defaultResolvers,
): IntelligenceClientChannel | null {
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

export interface IntelligenceClient extends IntelligenceSdk {
  /**
   * @deprecated 请优先使用 chatLangChain() 或 invoke('text.chat', ...)。
   */
  chat: (payload: IntelligenceChatRequest) => Promise<IntelligenceInvokeResult<string>>
}

function isTuffTransport(
  channel: IntelligenceChannelLike | null | undefined,
): channel is IntelligenceTransportLike {
  return Boolean(
    channel
      && typeof (channel as IntelligenceTransportLike).send === 'function'
      && typeof (channel as IntelligenceTransportLike).stream === 'function',
  )
}

function createChannelTransport(channel: IntelligenceClientChannel): IntelligenceSdkTransport {
  return {
    send: (event: { toEventName: () => string }, payload?: unknown) => channel.send(event.toEventName(), payload),
  }
}

function toClient(sdk: IntelligenceSdk): IntelligenceClient {
  return {
    ...sdk,
    chat: payload => sdk.chatLangChain(payload),
  }
}

export function createIntelligenceClient(
  channel?: IntelligenceChannelLike,
  resolvers?: IntelligenceChannelResolver[],
): IntelligenceClient {
  const resolved = channel ?? resolveIntelligenceChannel(resolvers)

  if (!resolved) {
    throw new Error(
      '[Intelligence Client] Unable to resolve channel. Pass a channel instance or register a resolver.',
    )
  }

  if (isTuffTransport(resolved)) {
    return toClient(createIntelligenceSdk(resolved as IntelligenceSdkTransport))
  }

  return toClient(createIntelligenceSdk(createChannelTransport(resolved)))
}
