import { onUnmounted } from 'vue'
import { useTuffTransport } from '../../transport'
import { createDisposableBag } from '../../transport/sdk'
import { createNetworkSdk } from '../../transport/sdk/domains/network'

export function useNetworkSdk() {
  const transport = useTuffTransport()
  return createNetworkSdk(transport)
}

export function useNetworkSdkScope() {
  const sdk = useNetworkSdk()
  const disposables = createDisposableBag()
  const register = (dispose: () => void) => {
    disposables.add(dispose)
    return dispose
  }

  onUnmounted(() => disposables.dispose())
  return { sdk, disposables, register }
}
