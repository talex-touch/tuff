import { onUnmounted } from 'vue'
import { useTuffTransport } from '../../transport'
import { createDisposableBag } from '../../transport/sdk'
import { createDownloadSdk } from '../../transport/sdk/domains/download'

export function useDownloadSdk() {
  const transport = useTuffTransport()
  return createDownloadSdk(transport)
}

export function useDownloadSdkScope() {
  const sdk = useDownloadSdk()
  const disposables = createDisposableBag()
  const register = (dispose: () => void) => {
    disposables.add(dispose)
    return dispose
  }

  onUnmounted(() => disposables.dispose())
  return { sdk, disposables, register }
}
