import { onUnmounted } from 'vue'
import { useTuffTransport } from '../../transport'
import { createDisposableBag } from '../../transport/sdk'
import { createMarketSdk } from '../../transport/sdk/domains/market'

export function useMarketSdk() {
  const transport = useTuffTransport()
  return createMarketSdk(transport)
}

export function useMarketSdkScope() {
  const sdk = useMarketSdk()
  const disposables = createDisposableBag()
  onUnmounted(() => disposables.dispose())
  return { sdk, disposables }
}

