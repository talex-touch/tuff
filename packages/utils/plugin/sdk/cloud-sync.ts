import type { CloudSyncSDKOptions as ClientOptions } from '../../cloud-sync/cloud-sync-sdk'
import { CloudSyncSDK as CloudSyncClientSDK, CloudSyncError } from '../../cloud-sync/cloud-sync-sdk'
import { accountSDK } from '../../account'
import { ensureRendererChannel } from './channel'

export interface CloudSyncSDKOptions {
  baseUrl?: string
  serviceBaseUrl?: string
  fetch?: typeof fetch
  now?: () => number
  syncTokenCache?: { token?: string, expiresAt?: string }
  onSyncTokenUpdate?: (token: string, expiresAt: string) => void
  onStepUpRequired?: () => string | null | Promise<string | null>
  formDataFactory?: () => FormData
  channelSend?: (event: string, data?: any) => Promise<any>
}

let accountChannelBound = false

function bindAccountChannel(options?: CloudSyncSDKOptions) {
  if (accountChannelBound)
    return

  if (options?.channelSend) {
    accountSDK.setChannelSend(options.channelSend)
    accountChannelBound = true
    return
  }

  const channel = ensureRendererChannel('[CloudSyncSDK] Channel not available. Make sure this runs in plugin renderer context.')
  accountSDK.setChannelSend(channel.send)
  accountChannelBound = true
}

async function resolveAuthToken(options?: CloudSyncSDKOptions): Promise<string> {
  bindAccountChannel(options)
  const token = await accountSDK.getAuthToken()
  if (!token) {
    throw new Error('[CloudSyncSDK] Auth token is not available. Ensure user is signed in and AccountSDK channel is configured.')
  }
  return token
}

async function resolveDeviceId(options?: CloudSyncSDKOptions): Promise<string> {
  bindAccountChannel(options)
  const deviceId = await accountSDK.getDeviceId()
  if (!deviceId) {
    throw new Error('[CloudSyncSDK] Device ID is not available. Ensure AccountSDK channel is configured.')
  }
  return deviceId
}

export class CloudSyncSDK extends CloudSyncClientSDK {
  constructor(options: CloudSyncSDKOptions = {}) {
    bindAccountChannel(options)
    const clientOptions: ClientOptions = {
      baseUrl: options.baseUrl ?? options.serviceBaseUrl,
      fetch: options.fetch,
      now: options.now,
      syncTokenCache: options.syncTokenCache,
      onSyncTokenUpdate: options.onSyncTokenUpdate,
      onStepUpRequired: options.onStepUpRequired,
      formDataFactory: options.formDataFactory,
      getAuthToken: () => resolveAuthToken(options),
      getDeviceId: () => resolveDeviceId(options),
    }
    super(clientOptions)
  }
}

let cachedSDK: CloudSyncSDK | null = null

export function createCloudSyncSDK(options?: CloudSyncSDKOptions): CloudSyncSDK {
  return new CloudSyncSDK(options)
}

export function useCloudSyncSDK(options?: CloudSyncSDKOptions): CloudSyncSDK {
  if (!cachedSDK)
    cachedSDK = new CloudSyncSDK(options)
  return cachedSDK
}

export function resetCloudSyncSDK(): void {
  cachedSDK = null
}

export { CloudSyncError }
