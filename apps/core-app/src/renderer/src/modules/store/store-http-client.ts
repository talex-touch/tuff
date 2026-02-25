import type { StoreHttpRequestOptions, StoreHttpResponse } from '@talex-touch/utils/store'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createStoreSdk } from '@talex-touch/utils/transport/sdk/domains/store'

const storeSdk = createStoreSdk(useTuffTransport())

export async function storeHttpRequest<T = unknown>(
  options: StoreHttpRequestOptions
): Promise<StoreHttpResponse<T>> {
  return (await storeSdk.httpRequest<T>(options)) as StoreHttpResponse<T>
}
