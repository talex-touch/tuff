import type { IntelligenceSdk } from '../../transport/sdk/domains/intelligence'
import type { PluginChannelClient } from './channel-client'
import { createPluginTuffTransport } from '../../transport'
import { createIntelligenceSdk } from '../../transport/sdk/domains/intelligence'
import { ensureRendererChannel } from './channel'
import { tryGetPluginSdkApi } from './plugin-info'

type PluginChannelWithMain = PluginChannelClient & {
  sendToMain?: (eventName: string, payload?: unknown) => Promise<unknown>
  onMain?: (eventName: string, handler: (event: unknown) => unknown) => () => void
}

type HostOnlyIntelligenceMethod
  = | 'contextPrepareTurn'
    | 'contextCreateCompressionSnapshot'
    | 'contextListCompressionSnapshots'
    | 'contextGetLatestCompressionSnapshot'
    | 'contextListMemories'
    | 'contextSaveMemory'
    | 'contextReplaceMemory'
    | 'contextSetMemoryEnabled'
    | 'contextDeleteMemory'
    | 'getQuota'
    | 'setQuota'
    | 'deleteQuota'
    | 'getAllQuotas'
    | 'checkQuota'
    | 'getCurrentUsage'
    | 'testProvider'
    | 'testCapability'
    | 'fetchModels'
    | 'getAuditLogs'
    | 'getTodayStats'
    | 'getMonthStats'
    | 'getUsageStats'
    | 'getLocalEnvironment'

const HOST_ONLY_INTELLIGENCE_METHODS: Record<HostOnlyIntelligenceMethod, true> = {
  contextPrepareTurn: true,
  contextCreateCompressionSnapshot: true,
  contextListCompressionSnapshots: true,
  contextGetLatestCompressionSnapshot: true,
  contextListMemories: true,
  contextSaveMemory: true,
  contextReplaceMemory: true,
  contextSetMemoryEnabled: true,
  contextDeleteMemory: true,
  getQuota: true,
  setQuota: true,
  deleteQuota: true,
  getAllQuotas: true,
  checkQuota: true,
  getCurrentUsage: true,
  testProvider: true,
  testCapability: true,
  fetchModels: true,
  getAuditLogs: true,
  getTodayStats: true,
  getMonthStats: true,
  getUsageStats: true,
  getLocalEnvironment: true,
}

function isHostOnlyMethod(property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(HOST_ONLY_INTELLIGENCE_METHODS, property)
}

export type IntelligenceSDK = Omit<IntelligenceSdk, HostOnlyIntelligenceMethod>

function withSdkApiPayload(payload: unknown): unknown {
  const sdkapi = tryGetPluginSdkApi()
  if (typeof sdkapi !== 'number' || !payload || typeof payload !== 'object') {
    return payload
  }

  return {
    ...(payload as Record<string, unknown>),
    _sdkapi: sdkapi,
  }
}

function createSdkApiChannel(channel: PluginChannelClient): PluginChannelWithMain {
  const channelWithMain = channel as PluginChannelWithMain
  const sdkApiChannel: PluginChannelWithMain = {
    regChannel: (eventName, callback) => channel.regChannel(eventName, callback),
    unRegChannel: (eventName, callback) => channel.unRegChannel(eventName, callback),
    send: (eventName, payload) => channel.send(eventName, withSdkApiPayload(payload)),
  }
  if (typeof channelWithMain.sendToMain === 'function') {
    const sendToMain = channelWithMain.sendToMain.bind(channelWithMain)
    sdkApiChannel.sendToMain = (eventName, payload) => sendToMain(eventName, withSdkApiPayload(payload))
  }

  if (typeof channelWithMain.onMain === 'function') {
    const onMain = channelWithMain.onMain.bind(channelWithMain)
    sdkApiChannel.onMain = (eventName, handler) => onMain(eventName, handler)
  }

  return sdkApiChannel
}

function createPluginIntelligenceClient(): IntelligenceSdk {
  const channel = createSdkApiChannel(ensureRendererChannel())
  const transport = createPluginTuffTransport(channel)
  return createIntelligenceSdk(transport)
}

let cachedClient: IntelligenceSdk | null = null

function getClient(): IntelligenceSdk {
  if (!cachedClient) {
    cachedClient = createPluginIntelligenceClient()
  }
  return cachedClient
}

export function createPluginIntelligenceFacade(
  resolveClient: () => IntelligenceSdk,
): IntelligenceSDK {
  return new Proxy({} as IntelligenceSDK, {
    get(_target, property, receiver) {
      if (isHostOnlyMethod(property)) {
        return undefined
      }
      return Reflect.get(resolveClient(), property, receiver)
    },
    has(_target, property) {
      return !isHostOnlyMethod(property) && property in resolveClient()
    },
    ownKeys() {
      return Reflect.ownKeys(resolveClient()).filter(property => !isHostOnlyMethod(property))
    },
    getOwnPropertyDescriptor(_target, property) {
      if (isHostOnlyMethod(property)) {
        return undefined
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(resolveClient(), property)
      if (!descriptor) {
        return undefined
      }
      return {
        ...descriptor,
        configurable: true,
      }
    },
  })
}

export const intelligence: IntelligenceSDK = createPluginIntelligenceFacade(getClient)
