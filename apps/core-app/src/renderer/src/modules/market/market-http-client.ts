import type { MarketHttpRequestOptions, MarketHttpResponse } from '@talex-touch/utils/market'
import { touchChannel } from '~/modules/channel/channel-core'

export async function marketHttpRequest<T = unknown>(
  options: MarketHttpRequestOptions,
): Promise<MarketHttpResponse<T>> {
  if (!touchChannel) {
    throw new Error('MARKET_CHANNEL_UNAVAILABLE')
  }

  const response: any = await touchChannel.send('market:http-request', options)

  if (response?.error) {
    throw new Error(response.error)
  }

  return response as MarketHttpResponse<T>
}
