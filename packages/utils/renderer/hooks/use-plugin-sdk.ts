import { onUnmounted } from 'vue'
import { useTuffTransport } from '../../transport'
import { createDisposableBag } from '../../transport/sdk'
import { createPluginSdk } from '../../transport/sdk/domains/plugin'

export function usePluginSdk() {
  const transport = useTuffTransport()
  return createPluginSdk(transport)
}

export function usePluginSdkScope() {
  const sdk = usePluginSdk()
  const disposables = createDisposableBag()
  onUnmounted(() => disposables.dispose())
  return { sdk, disposables }
}

