import { onUnmounted } from 'vue'
import { useTuffTransport } from '../../transport'
import { createDisposableBag } from '../../transport/sdk'
import { createStoreSdk } from '../../transport/sdk/domains/store'

export function useStoreSdk() {
  const transport = useTuffTransport()
  return createStoreSdk(transport)
}

export function useStoreSdkScope() {
  const sdk = useStoreSdk()
  const disposables = createDisposableBag()
  onUnmounted(() => disposables.dispose())
  return { sdk, disposables }
}
