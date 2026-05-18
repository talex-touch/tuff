import type { CloudShareSDKOptions as ClientOptions } from '../../cloud-share/cloud-share-sdk'
import { accountSDK } from '../../account'
import { CloudShareSDK as CloudShareClientSDK, CloudShareError } from '../../cloud-share/cloud-share-sdk'
import { ensureRendererChannel } from './channel'

export interface CloudShareSDKOptions {
  baseUrl?: string
  serviceBaseUrl?: string
  pluginId?: string
  fetch?: typeof fetch
  channelSend?: (event: string, data?: any) => Promise<any>
  getAuthToken?: () => string | null | undefined | Promise<string | null | undefined>
}

let accountChannelBound = false

function bindAccountChannel(options?: CloudShareSDKOptions) {
  if (accountChannelBound)
    return

  if (options?.channelSend) {
    accountSDK.setChannelSend(options.channelSend)
    accountChannelBound = true
    return
  }

  const channel = ensureRendererChannel('[CloudShareSDK] Channel not available. Make sure this runs in plugin renderer context.')
  accountSDK.setChannelSend(channel.send)
  accountChannelBound = true
}

async function resolveAuthToken(options?: CloudShareSDKOptions): Promise<string> {
  if (options?.getAuthToken) {
    const token = await options.getAuthToken()
    if (typeof token === 'string' && token.trim())
      return token
  }

  bindAccountChannel(options)
  const token = await accountSDK.getAuthToken()
  if (!token)
    throw new Error('[CloudShareSDK] Auth token is not available. Ensure user is signed in and AccountSDK channel is configured.')
  return token
}

export class CloudShareSDK extends CloudShareClientSDK {
  constructor(options: CloudShareSDKOptions = {}) {
    const clientOptions: ClientOptions = {
      baseUrl: options.baseUrl ?? options.serviceBaseUrl,
      pluginId: options.pluginId,
      fetch: options.fetch,
      getAuthToken: () => resolveAuthToken(options),
    }
    super(clientOptions)
  }
}

let cachedSDK: CloudShareSDK | null = null

export function createCloudShareSDK(options?: CloudShareSDKOptions): CloudShareSDK {
  return new CloudShareSDK(options)
}

export function useCloudShareSDK(options?: CloudShareSDKOptions): CloudShareSDK {
  if (!cachedSDK)
    cachedSDK = new CloudShareSDK(options)
  return cachedSDK
}

export function resetCloudShareSDK(): void {
  cachedSDK = null
}

export { CloudShareError }
