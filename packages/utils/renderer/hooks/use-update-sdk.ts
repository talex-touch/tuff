import { onUnmounted } from 'vue'
import { useTuffTransport } from '../../transport'
import { createDisposableBag } from '../../transport/sdk'
import { createUpdateSdk } from '../../transport/sdk/domains/update'

export function useUpdateSdk() {
  const transport = useTuffTransport()
  return createUpdateSdk(transport)
}

export function useUpdateSdkScope() {
  const sdk = useUpdateSdk()
  const disposables = createDisposableBag()
  const register = (dispose: () => void) => {
    disposables.add(dispose)
    return dispose
  }

  onUnmounted(() => disposables.dispose())
  return { sdk, disposables, register }
}
